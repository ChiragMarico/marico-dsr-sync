/**
 * Voice enrollment — captures a sample of the DSR speaking so the analytics
 * pipeline can later tell WHICH speaker in a visit recording is the rep
 * (everyone else is the customer).
 *
 * ONE recording, uploaded immediately.
 *
 * An earlier version split this into three passages with a separate "save"
 * button at the end. Reps recorded and then never reached the save step, so
 * nothing was stored at all. Upload is therefore part of the same action as
 * recording — there is no state where a rep believes they are done but nothing
 * has been sent.
 *
 * The prompt is free speech rather than a script: speaker models compare best
 * when enrollment matches real conditions, and real visits are conversation,
 * not reading aloud. It also works for a rep who cannot read.
 *
 *   marico-dsr/sync/voiceprints/{dsr_id}/enrollment_{ts}.m4a
 *   marico-dsr/sync/voiceprints/{dsr_id}/latest.json     stable lookup
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

/** Long enough for a usable voiceprint, short enough not to tire the rep. */
export const ENROLL_SECONDS = 30;

/** Below this the mic produced nothing — muted, pocketed, permission pulled. */
const MIN_BYTES = 8_000;

const ENROLL_VISIT_ID = 'voice-enrollment';

export interface EnrollmentResult {
  ok: boolean;
  error?: string;
  sizeBytes?: number;
}

/**
 * Record the rep speaking and upload it as their voiceprint, in one action.
 * `onTick` reports seconds remaining — without a visible countdown reps stop
 * talking after a few seconds and the sample is unusable.
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

  // Cold-start guard, same as the visit recorder: the first prepare after app
  // launch often fails because audio focus isn't ready, and a half-created
  // recorder keeps holding the mic — release before retrying, or attempt 2
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
  if (!started || !rec) return { ok: false, error: lastErr || 'microphone did not start' };

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

  const dir = new Directory(Paths.document, 'voiceprint');
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, `enroll_${session.dsr.id}.m4a`);
  if (dest.exists) dest.delete();
  await new File(uri).move(dest);

  const sizeBytes = dest.size ?? 0;
  if (sizeBytes < MIN_BYTES) {
    return { ok: false, error: 'recording was silent — please speak louder', sizeBytes };
  }

  const ts = new Date().toISOString();
  const stamp = ts.replace(/[:.]/g, '-');
  const audioKey = `sync/voiceprints/${session.dsr.id}/enrollment_${stamp}.m4a`;

  // Metadata travels with the audio so the pipeline never has to guess how the
  // sample was captured — sample rate and mic matter when comparing embeddings
  // recorded months apart or on different hardware.
  const meta = {
    dsr_id: session.dsr.id,
    dsr_name: session.dsr.name,
    audio_key: audioKey,
    recorded_at: ts,
    duration_s: ENROLL_SECONDS,
    size_bytes: sizeBytes,
    kind: 'free_speech',
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
  // Metadata last: its arrival signals that enrollment is complete.
  await enqueueUpload({
    local_path: metaFile.uri,
    s3_key: `sync/voiceprints/${session.dsr.id}/latest.json`,
    visit_id: ENROLL_VISIT_ID,
    content_type: 'application/json',
    kind: 'manifest',
  });
  kickUploads();

  const db = await getDb();
  for (let i = 0; i < 45; i++) {
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM queue WHERE visit_id = ?',
      ENROLL_VISIT_ID,
    );
    if ((row?.n ?? 0) === 0) return { ok: true, sizeBytes };
    await new Promise((r) => setTimeout(r, 1000));
  }
  // Still queued — the audio is saved locally and will upload on its own once
  // there is a connection, so this is "not confirmed yet", not a hard failure.
  return { ok: false, error: 'upload still pending — check network', sizeBytes };
}
