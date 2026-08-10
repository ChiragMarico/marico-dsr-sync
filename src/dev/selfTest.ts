/**
 * One-tap self-test: exercises the real record → save → upload pipeline 3 times
 * in a row (the exact loop that was breaking after the first visit), then
 * uploads a report to S3 so it can be verified remotely. No GPS/walking needed.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { ChunkedRecorder } from '../recording/recorder';
import { BUILD_LABEL } from '../constants';
import { Session } from '../types';
import { configureUpload, enqueueUpload, kickUploads } from '../upload/worker';
import { getDb } from '../upload/db';
import { listObjects } from '../upload/s3List';

export interface SelfTestCycle {
  cycle: number;
  recorded: boolean;
  durationS: number;
  sizeKB: number;
  inCloud: boolean;
  note: string;
}

const RECORD_MS = 4000;

export async function runSelfTest(
  session: Session,
  onProgress: (msg: string) => void,
): Promise<{ cycles: SelfTestCycle[]; uploaded: boolean }> {
  configureUpload({
    getAuth: () => ({ dsrId: session.dsr.id, token: session.token }),
    refreshToken: async () => null,
    onAuthFailure: () => {},
  });

  const dir = new Directory(Paths.document, 'selftest');
  if (!dir.exists) dir.create({ intermediates: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const cycles: SelfTestCycle[] = [];

  for (let i = 1; i <= 3; i++) {
    onProgress(`Recording ${i}/3…`);
    let path: string | null = null;
    let durationS = 0;
    const rec = new ChunkedRecorder(dir, {
      onChunkClosed: (info) => {
        path = info.path;
        durationS = info.durationS;
      },
      onMicSource: () => {},
      onInterrupted: () => {},
    });

    let started = true;
    try {
      await rec.start();
    } catch {
      started = false;
    }
    await new Promise((r) => setTimeout(r, RECORD_MS));
    try {
      await rec.stop();
    } catch {
      /* ignore */
    }

    let sizeKB = 0;
    if (path) {
      try {
        sizeKB = Math.round((new File(path).size ?? 0) / 1024);
      } catch {
        /* ignore */
      }
    }
    const recorded = started && !!path && sizeKB > 0;
    cycles.push({
      cycle: i,
      recorded,
      durationS,
      sizeKB,
      inCloud: false,
      note: !started
        ? 'recorder failed to start'
        : !path
          ? 'no file produced'
          : sizeKB === 0
            ? 'empty file'
            : 'ok',
    });

    if (path) {
      await enqueueUpload({
        local_path: path,
        s3_key: `recordings/${session.dsr.id}/_selftest/${stamp}/cycle_${i}.m4a`,
        visit_id: `selftest-${stamp}`,
        content_type: 'audio/mp4',
        kind: 'chunk',
      });
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // Upload a machine-readable report for remote verification.
  const report = { dsr_id: session.dsr.id, ts: stamp, build: BUILD_LABEL, cycles };
  const rf = new File(dir, `report_${stamp}.json`);
  if (!rf.exists) rf.create();
  rf.write(JSON.stringify(report, null, 2));
  await enqueueUpload({
    local_path: rf.uri,
    s3_key: `logs/${session.dsr.id}/_selftest/report_${stamp}.json`,
    visit_id: `selftest-${stamp}`,
    content_type: 'application/json',
    kind: 'daylog',
  });
  kickUploads();

  onProgress('Uploading…');
  const db = await getDb();
  let uploaded = false;
  for (let k = 0; k < 40; k++) {
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM queue WHERE visit_id = ?',
      `selftest-${stamp}`,
    );
    if ((row?.n ?? 0) === 0) {
      uploaded = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Ask S3 directly which cycle files actually landed — the real end-to-end proof.
  onProgress('Verifying in cloud…');
  try {
    const cloud = await listObjects(`recordings/${session.dsr.id}/_selftest/${stamp}/`);
    for (const c of cycles) {
      c.inCloud = cloud.some((o) => o.key.endsWith(`cycle_${c.cycle}.m4a`) && o.size > 0);
    }
  } catch {
    /* leave inCloud false */
  }
  return { cycles, uploaded };
}
