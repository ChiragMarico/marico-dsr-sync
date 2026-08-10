/**
 * Upload worker (PRD §7.6). Offline-first queue delivering every chunk +
 * manifest to S3 exactly once, FIFO by insertion id (so a visit's manifest —
 * enqueued last — uploads last and signals "visit complete").
 *
 * The loop is self-scheduling: it drains all ready items, and if some are
 * waiting out a backoff window it re-arms a timer for the nearest one. It is
 * also kicked externally on chunk-closed, network-regained, and app-foreground.
 */
import { File } from 'expo-file-system';
import { apiSign } from '../api/client';
import { BACKOFF_STEPS_MS, UPLOAD_TARGET } from '../constants';
import { ApiError } from '../types';
import { getDb } from './db';
import { presignS3Url } from './s3Presign';

export interface QueueRow {
  id: number;
  local_path: string;
  s3_key: string;
  visit_id: string;
  content_type: string;
  kind: string;
  attempts: number;
  last_attempt_ts: number | null;
  status: string;
}

export interface UploadAuth {
  dsrId: string;
  token: string;
}

interface UploadConfig {
  getAuth: () => UploadAuth | null;
  refreshToken: () => Promise<UploadAuth | null>;
  onAuthFailure: () => void;
}

let config: UploadConfig | null = null;
let running = false;
let scheduled: ReturnType<typeof setTimeout> | null = null;

export function configureUpload(c: UploadConfig): void {
  config = c;
}

export async function enqueueUpload(item: {
  local_path: string;
  s3_key: string;
  visit_id: string;
  content_type: string;
  kind: 'chunk' | 'manifest' | 'daylog';
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO queue (local_path, s3_key, visit_id, content_type, kind) VALUES (?, ?, ?, ?, ?)',
    item.local_path,
    item.s3_key,
    item.visit_id,
    item.content_type,
    item.kind,
  );
  kickUploads();
}

function backoffMs(attempts: number): number {
  return BACKOFF_STEPS_MS[Math.min(attempts, BACKOFF_STEPS_MS.length - 1)];
}

/** Start the drain loop if it isn't already running. */
export function kickUploads(): void {
  if (running) return;
  running = true;
  drain()
    .catch(() => {})
    .finally(() => {
      running = false;
    });
}

async function drain(): Promise<void> {
  const db = await getDb();
  for (;;) {
    const rows = await db.getAllAsync<QueueRow>(
      "SELECT * FROM queue WHERE status IN ('pending','uploading') ORDER BY id ASC",
    );
    if (rows.length === 0) return;

    const now = Date.now();
    const ready = rows.find(
      (r) => r.last_attempt_ts == null || now - r.last_attempt_ts >= backoffMs(r.attempts),
    );
    if (!ready) {
      // Everything is waiting out a backoff window — re-arm for the soonest.
      const soonest = Math.min(
        ...rows.map((r) => (r.last_attempt_ts ?? 0) + backoffMs(r.attempts) - now),
      );
      scheduleKick(Math.max(1000, soonest));
      return;
    }

    const auth = config?.getAuth() ?? null;
    if (!auth) {
      scheduleKick(5000); // not logged in yet; try again shortly
      return;
    }

    await processOne(ready, auth);
  }
}

async function processOne(row: QueueRow, auth: UploadAuth): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE queue SET status = ? WHERE id = ?', 'uploading', row.id);
  try {
    // Direct-to-S3 (on-device signing, no backend) or Lambda-issued URL.
    const url =
      UPLOAD_TARGET === 's3'
        ? await presignS3Url(row.s3_key, 'PUT')
        : (await apiSign(auth.dsrId, auth.token, row.s3_key, row.content_type)).url;
    await putFile(url, row);
    // Success → delete local file, remove row.
    try {
      const f = new File(row.local_path);
      if (f.exists) f.delete();
    } catch {
      /* file already gone */
    }
    await db.runAsync('DELETE FROM queue WHERE id = ?', row.id);
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'unauthorized') {
      await handleAuthFailure(row);
    } else {
      // network / 5xx / timeout → backoff and retry forever.
      await db.runAsync(
        'UPDATE queue SET status = ?, attempts = attempts + 1, last_attempt_ts = ? WHERE id = ?',
        'pending',
        Date.now(),
        row.id,
      );
    }
  }
}

async function putFile(url: string, row: QueueRow): Promise<void> {
  // Mock mode: apiSign hands back a mock:// URL — treat as instant success so
  // the whole pipeline is exercisable on-device with no backend.
  if (url.startsWith('mock://')) return;
  const file = new File(row.local_path);
  if (!file.exists) return; // nothing to send; treat as done
  const res = await file.upload(url, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': row.content_type },
  });
  if (res.status < 200 || res.status >= 300) {
    if (res.status === 401 || res.status === 403) throw new ApiError('unauthorized');
    throw new ApiError('server', `PUT ${res.status}`);
  }
}

async function handleAuthFailure(row: QueueRow): Promise<void> {
  const db = await getDb();
  const refreshed = await config?.refreshToken().catch(() => null);
  if (refreshed) {
    await db.runAsync('UPDATE queue SET status = ? WHERE id = ?', 'pending', row.id);
    return;
  }
  await db.runAsync('UPDATE queue SET status = ? WHERE id = ?', 'failed_auth', row.id);
  config?.onAuthFailure();
}

function scheduleKick(ms: number): void {
  if (scheduled) clearTimeout(scheduled);
  scheduled = setTimeout(() => {
    scheduled = null;
    kickUploads();
  }, ms);
}

/** Move any failed_auth rows back to pending after a successful re-login. */
export async function retryAuthFailed(): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE queue SET status = 'pending' WHERE status = 'failed_auth'");
  kickUploads();
}

export interface UploadCounts {
  pendingVisits: number;
  pendingItems: number;
}

/** Distinct visits still having queued items, for the Home screen counters. */
export async function pendingCounts(): Promise<UploadCounts> {
  const db = await getDb();
  const items = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM queue WHERE status != 'done'",
  );
  const visits = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(DISTINCT visit_id) AS n FROM queue',
  );
  return { pendingItems: items?.n ?? 0, pendingVisits: visits?.n ?? 0 };
}
