/**
 * Day log (PRD §8.1 logs/{dsr_id}/{date}/daylog.json). Append-only record of
 * duty start/end, service_killed events, and errors. Written locally and
 * enqueued for upload at End Duty. "Zero silent data loss" — every failure
 * lands here or in a manifest.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { enqueueUpload } from '../upload/worker';

export type DayLogEventType =
  | 'duty_start'
  | 'duty_end'
  | 'service_killed'
  | 'visit_enter'
  | 'visit_exit'
  | 'recording_failed'
  | 'error';

export interface DayLogEvent {
  type: DayLogEventType;
  ts: string; // ISO
  detail?: Record<string, unknown>;
}

interface DayLog {
  dsr_id: string;
  date: string;
  events: DayLogEvent[];
}

function logDir(): Directory {
  const d = new Directory(Paths.document, 'daylogs');
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

function logFile(dsrId: string, date: string): File {
  return new File(logDir(), `${dsrId}_${date}.json`);
}

async function read(dsrId: string, date: string): Promise<DayLog> {
  const f = logFile(dsrId, date);
  if (f.exists) {
    try {
      return JSON.parse(await f.text()) as DayLog;
    } catch {
      /* corrupt → start fresh, don't lose new events */
    }
  }
  return { dsr_id: dsrId, date, events: [] };
}

export async function logEvent(
  dsrId: string,
  date: string,
  type: DayLogEventType,
  detail?: Record<string, unknown>,
): Promise<void> {
  const log = await read(dsrId, date);
  log.events.push({ type, ts: new Date().toISOString(), detail });
  const f = logFile(dsrId, date);
  if (!f.exists) f.create();
  f.write(JSON.stringify(log, null, 2));
}

/** Enqueue the day's log for upload (called at End Duty). */
export async function uploadDayLog(dsrId: string, date: string): Promise<void> {
  const f = logFile(dsrId, date);
  if (!f.exists) return;
  await enqueueUpload({
    local_path: f.uri,
    s3_key: `logs/${dsrId}/${date}/daylog.json`,
    visit_id: `daylog-${date}`,
    content_type: 'application/json',
    kind: 'daylog',
  });
}
