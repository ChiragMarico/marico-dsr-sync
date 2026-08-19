/**
 * Voice enrollment — captures samples of the DSR speaking so the analytics
 * pipeline can later tell WHICH speaker in a visit recording is the rep
 * (everyone else is the customer).
 *
 * Three short passages rather than one long one:
 *   1. identity   — simple, familiar words
 *   2. work       — different sounds, still simple
 *   3. free speech — the rep talks in their own words, no reading
 *
 * Passage 3 matters most. Speaker models compare best when enrollment matches
 * real conditions, and real visits are *conversation*, not reading aloud — read
 * speech has different rhythm and pitch. It also works for a rep who cannot
 * read at all, which matters for this field force.
 *
 * Each passage records separately so a rep can redo just the one that went
 * wrong instead of starting over.
 *
 *   sync/voiceprints/{dsr_id}/enrollment_{ts}_p1.m4a   (p1, p2, p3)
 *   sync/voiceprints/{dsr_id}/latest.json              stable lookup
 */
import { AudioModule, setAudioModeAsync } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import * as Device from 'expo-device';
import { AUDIO_OPTIONS } from '../recording/audioConfig';
import { APP_VERSION, BUILD_LABEL } from '../constants';
import { getLang } from '../i18n';
import { Session } from '../types';
import { getDb } from '../upload/db';
import { configureUpload, enqueueUpload, kickUploads } from '../upload/worker';

/** Seconds per passage. 3 x 12s ≈ 36s of speech — comfortably above the
 *  ~15-30s a speaker-embedding model needs, without tiring the rep. */
export const PASSAGE_SECONDS = 12;
export const PASSAGE_COUNT = 3;

/** Below this a passage is silence — muted mic, phone in a pocket, permission
 *  pulled mid-recording. Fail loudly now rather than store a dead voiceprint. */
const MIN_BYTES = 6_000;

const ENROLL_VISIT_ID = 'voice-enrollment';

export interface PassageResult {
  index: number; // 1-based
  uri: string;
  sizeBytes: number;
}

export interface EnrollmentResult {
  ok: boolean;
  error?: string;
  totalBytes?: number;
}

function enrollDir(): Directory {
  const dir = new Directory(Paths.document, 'voiceprint');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Record ONE passage. `onTick` reports seconds remaining — without a visible
 * countdown reps stop talking after a few seconds and the sample is unusable.
 */
export async function recordPassage(
  session: Session,
  index: number,
  onTick?: (secondsLeft: number) => void,
): Promise<PassageResult> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    allowsBackgroundRecording: true,
    interruptionMode: 'doNotMix',
  });

  // Cold-start guard, same as the visit recorder: the first prepare after app
  // launch often fails because audio focus isn't ready, and a half-created
  // recorder keeps holding the mic — so release before retrying, or attempt 2
  // fails for exactly the reason attempt 1 did.
  let rec: InstanceType<typeof AudioModule.AudioRecorder> | null = null;
  let started = false;
  let lastErr = '';
  for (let attempt = 0; attempt < 3 && !started; attempt++) {
    if (rec) {
      try {
        rec.release();
      } catch {
        /* already gone */
      }
      rec = null;
    }
    try {
      rec = new AudioModule.AudioRecorder(AUDIO_OPTIONS);
      await rec.prepareToRecordAsync();
      rec.record();
      started = true;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  if (!started || !rec) throw new Error(lastErr || 'microphone did not start');

  for (let s = PASSAGE_SECONDS; s > 0; s--) {
    onTick?.(s);
    await new Promise((r) => setTimeout(r, 1000));
  }
  onTick?.(0);

  let uri: string | null = null;
  try {
    await rec.stop();
    uri = rec.uri;
  } finally {
    try {
      rec.release(); // free the mic for the next passage
    } catch {
      /* noop */
    }
  }
  if (!uri) throw new Error('no audio file produced');

  const dest = new File(enrollDir(), `enroll_${session.dsr.id}_p${index}.m4a`);
  if (dest.exists) dest.delete();
  await new File(uri).move(dest);

  const sizeBytes = dest.size ?? 0;
  if (sizeBytes < MIN_BYTES) {
    throw new Error('that passage was silent — please speak louder');
  }
  return { index, uri: dest.uri, sizeBytes };
}

/** Upload all recorded passages plus the metadata that describes them. */
export async function uploadVoiceprint(
  session: Session,
  passages: PassageResult[],
): Promise<EnrollmentResult> {
  if (passages.length === 0) return { ok: false, error: 'nothing recorded' };

  configureUpload({
    getAuth: () => ({ dsrId: session.dsr.id, token: session.token }),
    refreshToken: async () => null,
    onAuthFailure: () => {},
  });

  const ts = new Date().toISOString();
  const stamp = ts.replace(/[:.]/g, '-');
  const base = `sync/voiceprints/${session.dsr.id}`;
  const totalBytes = passages.reduce((s, p) => s + p.sizeBytes, 0);

  const keys = passages.map((p) => `${base}/enrollment_${stamp}_p${p.index}.m4a`);

  // Metadata travels with the audio so the pipeline never has to guess how a
  // sample was captured — sample rate and mic matter when comparing embeddings
  // recorded months apart or on different hardware.
  const meta = {
    dsr_id: session.dsr.id,
    dsr_name: session.dsr.name,
    recorded_at: ts,
    passages: passages.map((p, i) => ({
      index: p.index,
      audio_key: keys[i],
      duration_s: PASSAGE_SECONDS,
      size_bytes: p.sizeBytes,
      // Passage 3 is unscripted, which the pipeline may want to weight
      // differently — it is the closest match to real conversation.
      kind: p.index === PASSAGE_COUNT ? 'free_speech' : 'read',
    })),
    total_duration_s: passages.length * PASSAGE_SECONDS,
    total_bytes: totalBytes,
    ui_language: getLang(),
    sample_rate: AUDIO_OPTIONS.sampleRate,
    channels: AUDIO_OPTIONS.numberOfChannels,
    device: Device.modelName ?? 'unknown',
    os: `${Device.osName ?? 'Android'} ${Device.osVersion ?? ''}`.trim(),
    app_version: APP_VERSION,
    app_build: BUILD_LABEL,
  };

  const metaFile = new File(enrollDir(), `latest_${session.dsr.id}.json`);
  if (metaFile.exists) metaFile.delete();
  metaFile.create();
  metaFile.write(JSON.stringify(meta, null, 2));

  for (let i = 0; i < passages.length; i++) {
    await enqueueUpload({
      local_path: passages[i].uri,
      s3_key: keys[i],
      visit_id: ENROLL_VISIT_ID,
      content_type: 'audio/mp4',
      kind: 'chunk',
    });
  }
  // Metadata last: its arrival is the signal that enrollment is complete.
  await enqueueUpload({
    local_path: metaFile.uri,
    s3_key: `${base}/latest.json`,
    visit_id: ENROLL_VISIT_ID,
    content_type: 'application/json',
    kind: 'manifest',
  });
  kickUploads();

  const db = await getDb();
  for (let i = 0; i < 60; i++) {
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM queue WHERE visit_id = ?',
      ENROLL_VISIT_ID,
    );
    if ((row?.n ?? 0) === 0) return { ok: true, totalBytes };
    await new Promise((r) => setTimeout(r, 1000));
  }
  // Still queued — the audio is saved and will upload on its own once there is
  // a connection, so this is "not confirmed yet" rather than a hard failure.
  return { ok: false, error: 'upload still pending — check network', totalBytes };
}
