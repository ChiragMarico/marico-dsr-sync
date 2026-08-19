/**
 * Voice enrollment — captures a short sample of the DSR speaking, which later
 * lets the analytics pipeline tell WHICH speaker in a visit recording is the
 * rep (everyone else is the customer).
 *
 * This replaces the old silent "test recording": it still proves the whole
 * record -> queue -> sign -> upload chain works before day 1, but now the audio
 * it captures is actually useful. The rep reads a short prompt aloud, so we get
 * natural speech rather than 10 seconds of ambient shop noise.
 *
 * Stored separately from visit recordings, at a predictable path so the
 * pipeline can find one voiceprint per DSR without scanning:
 *
 *   sync/voiceprints/{dsr_id}/enrollment_{timestamp}.m4a   the audio
 *   sync/voiceprints/{dsr_id}/latest.json                  which one is current
 *
 * Timestamped audio keeps history if a rep re-enrols; latest.json is the stable
 * lookup so consumers never have to list a directory.
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

/** How long the rep speaks for. Long enough for a usable voiceprint, short
 *  enough that a low-literacy user doesn't run out of things to say. */
export const ENROLL_SECONDS = 15;

/** Queue tag so we can watch this specific upload drain. */
const ENROLL_VISIT_ID = 'voice-enrollment';

export interface EnrollmentResult {
  ok: boolean;
  /** Set when ok=false, so the UI can say something more useful than "failed". */
  error?: string;
  /** Size of the captured file — a near-empty file means the mic gave us nothing. */
  sizeBytes?: number;
}

/**
 * Record the rep speaking, then upload it as their voiceprint.
 * `onTick` reports seconds remaining so the UI can show a countdown — without
 * it the rep goes quiet after a few seconds, which ruins the sample.
 */
export async function runVoiceEnrollment(
  session: Session,
  onTick?: (secondsLeft: number) => void,
): Promise<EnrollmentResult> {
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

  // Same cold-start guard as the visit recorder: the very first prepare after
  // app launch often fails because audio focus isn't ready, and a half-created
  // recorder keeps holding the mic. Release before retrying or attempt 2 fails
  // for the same reason attempt 1 did.
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
  if (!started || !rec) {
    return { ok: false, error: lastErr || 'microphone did not start' };
  }

  // Count down in whole seconds so the UI can keep the rep talking.
  for (let s = ENROLL_SECONDS; s > 0; s--) {
    onTick?.(s);
    await new Promise((r) => setTimeout(r, 1000));
  }
  onTick?.(0);

  let uri: string | null = null;
  try {
    await rec.stop();
    uri = rec.uri;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'stop failed' };
  } finally {
    try {
      rec.release(); // free the mic for the next recording
    } catch {
      /* noop */
    }
  }
  if (!uri) return { ok: false, error: 'no audio file produced' };

  // Move out of the recorder's temp location into a stable one we control.
  const dir = new Directory(Paths.document, 'voiceprint');
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, `enroll_${session.dsr.id}.m4a`);
  if (dest.exists) dest.delete();
  await new File(uri).move(dest);

  // A file this small means the mic produced effectively nothing (muted, in a
  // pocket, permission revoked mid-recording). Better to fail loudly here than
  // to store an unusable voiceprint and discover it months later.
  const sizeBytes = dest.size ?? 0;
  if (sizeBytes < 8_000) {
    return { ok: false, error: 'recording was silent or too short', sizeBytes };
  }

  const ts = new Date().toISOString();
  const stamp = ts.replace(/[:.]/g, '-');
  const audioKey = `sync/voiceprints/${session.dsr.id}/enrollment_${stamp}.m4a`;

  // Metadata travels with the audio so the pipeline never has to guess how the
  // sample was captured — sample rate and app version matter when comparing
  // embeddings recorded months apart.
  const meta = {
    dsr_id: session.dsr.id,
    dsr_name: session.dsr.name,
    audio_key: audioKey,
    recorded_at: ts,
    duration_s: ENROLL_SECONDS,
    size_bytes: sizeBytes,
    ui_language: getLang(),
    sample_rate: AUDIO_OPTIONS.sampleRate,
    channels: AUDIO_OPTIONS.numberOfChannels,
    device: Device.modelName ?? 'unknown',
    os: `${Device.osName ?? 'Android'} ${Device.osVersion ?? ''}`.trim(),
    app_version: APP_VERSION,
    app_build: BUILD_LABEL,
  };
  const metaFile = new File(dir, `latest_${session.dsr.id}.json`);
  if (metaFile.exists) metaFile.delete();
  metaFile.create();
  metaFile.write(JSON.stringify(meta, null, 2));

  await enqueueUpload({
    local_path: dest.uri,
    s3_key: audioKey,
    visit_id: ENROLL_VISIT_ID,
    content_type: 'audio/mp4',
    kind: 'chunk',
  });
  await enqueueUpload({
    local_path: metaFile.uri,
    s3_key: `sync/voiceprints/${session.dsr.id}/latest.json`,
    visit_id: ENROLL_VISIT_ID,
    content_type: 'application/json',
    kind: 'manifest',
  });
  kickUploads();

  // Wait for the queue to drain both items so the rep gets a truthful result
  // rather than an optimistic tick.
  const db = await getDb();
  for (let i = 0; i < 45; i++) {
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM queue WHERE visit_id = ?',
      ENROLL_VISIT_ID,
    );
    if ((row?.n ?? 0) === 0) return { ok: true, sizeBytes };
    await new Promise((r) => setTimeout(r, 1000));
  }
  // Still queued: the audio is saved and will upload on its own once there's a
  // connection, so this is "not confirmed yet" rather than a hard failure.
  return { ok: false, error: 'upload still pending — check network', sizeBytes };
}
