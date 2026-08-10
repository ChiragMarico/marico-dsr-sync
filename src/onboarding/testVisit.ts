/**
 * 10-second test recording that round-trips to S3 (PRD §7.7 step 7) — proves
 * the whole pipeline (record → queue → sign → upload) before day 1. In mock
 * mode the upload "succeeds" instantly.
 */
import { AudioModule, setAudioModeAsync } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { AUDIO_OPTIONS } from '../recording/audioConfig';
import { Session } from '../types';
import { getDb } from '../upload/db';
import { configureUpload, enqueueUpload, kickUploads } from '../upload/worker';

const TEST_VISIT_ID = 'onboarding-test';

export async function runTestVisit(session: Session): Promise<boolean> {
  configureUpload({
    getAuth: () => ({ dsrId: session.dsr.id, token: session.token }),
    refreshToken: async () => null,
    onAuthFailure: () => {},
  });

  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    allowsBackgroundRecording: true,
    interruptionMode: 'doNotMix',
  });

  const rec = new AudioModule.AudioRecorder(AUDIO_OPTIONS);
  await rec.prepareToRecordAsync();
  rec.record();
  await new Promise((r) => setTimeout(r, 10_000));
  await rec.stop();
  const uri = rec.uri;
  if (!uri) return false;

  const dir = new Directory(Paths.document, 'test');
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, `test_${session.dsr.id}.m4a`);
  if (dest.exists) dest.delete();
  await new File(uri).move(dest);

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  await enqueueUpload({
    local_path: dest.uri,
    s3_key: `recordings/${session.dsr.id}/_test/${ts}/chunk_001.m4a`,
    visit_id: TEST_VISIT_ID,
    content_type: 'audio/mp4',
    kind: 'chunk',
  });
  kickUploads();

  // Wait (up to ~30s) for the queue to clear the test item.
  const db = await getDb();
  for (let i = 0; i < 30; i++) {
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM queue WHERE visit_id = ?',
      TEST_VISIT_ID,
    );
    if ((row?.n ?? 0) === 0) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
