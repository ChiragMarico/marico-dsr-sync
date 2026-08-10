/**
 * Per-visit audio recorder (PRD §7.5). Records one AAC file per visit, straight
 * to the persistent document dir, and — critically — RELEASES the native
 * recorder + mic when the visit ends so the next visit can record. (Not
 * releasing was leaving the mic held, breaking every recording after the first.)
 *
 * Kept simple on purpose: one recorder, start → stop → release. No cross-dir
 * moves (which silently dropped files) and no chunk rotation (which churned
 * recorder lifecycles). The class name/shape is unchanged so callers don't move.
 */
import { AudioModule, setAudioModeAsync, type AudioRecorder } from 'expo-audio';
import type { Directory } from 'expo-file-system';
import { AUDIO_OPTIONS } from './audioConfig';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Reject if the promise hasn't settled within `ms` (guards a stuck prepare). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('recorder start timed out')), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export interface ChunkClosedInfo {
  file: string; // chunk_001.m4a
  startTs: string; // ISO
  durationS: number;
  path: string; // absolute uri of the recorded file
}

export interface ChunkedRecorderCallbacks {
  onChunkClosed: (info: ChunkClosedInfo) => void;
  onMicSource: (src: 'bluetooth' | 'phone') => void;
  onInterrupted: () => void;
}

export class ChunkedRecorder {
  private recorder: AudioRecorder | null = null;
  private startMs = 0;
  private stopped = false;

  // `dir` kept for signature compatibility; recording goes to the document dir.
  constructor(
    private _dir: Directory,
    private cb: ChunkedRecorderCallbacks,
  ) {}

  async start(): Promise<void> {
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      allowsBackgroundRecording: true,
      interruptionMode: 'doNotMix',
    });

    // Cold-start robustness: on the FIRST visit the mic/audio focus is often not
    // ready yet, so the very first prepare/record can fail. Retry a few times,
    // ALWAYS releasing a half-created recorder first (otherwise it keeps holding
    // the mic and every retry fails too). Each attempt is time-boxed so a stuck
    // prepare can't wedge the whole visit.
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (this.recorder) {
        try {
          this.recorder.release();
        } catch {
          /* already gone */
        }
        this.recorder = null;
      }
      try {
        const rec = new AudioModule.AudioRecorder(AUDIO_OPTIONS);
        this.recorder = rec;
        await withTimeout(rec.prepareToRecordAsync(), 5000);
        rec.record();
        this.startMs = Date.now();
        await this.detectMicSource(rec);
        return; // recording
      } catch (e) {
        lastErr = e;
        await delay(300 + attempt * 250); // let the mic settle, then retry
      }
    }
    // All attempts failed — free anything we grabbed and report up.
    if (this.recorder) {
      try {
        this.recorder.release();
      } catch {
        /* noop */
      }
      this.recorder = null;
    }
    throw lastErr instanceof Error ? lastErr : new Error('recorder failed to start');
  }

  private async detectMicSource(rec: AudioRecorder): Promise<void> {
    try {
      const input = await rec.getCurrentInput();
      const s = `${input.type} ${input.name}`.toLowerCase();
      const bt = s.includes('bluetooth') || s.includes('headset') || s.includes('sco');
      this.cb.onMicSource(bt ? 'bluetooth' : 'phone');
    } catch {
      this.cb.onMicSource('phone');
    }
  }

  /** Finalize the visit: stop, hand back the file, and release the mic. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    const rec = this.recorder;
    this.recorder = null;
    if (!rec) return;

    let uri: string | null = null;
    try {
      await rec.stop();
      uri = rec.uri;
    } catch {
      this.cb.onInterrupted();
    }

    if (uri) {
      const durationS = Math.max(1, Math.round((Date.now() - this.startMs) / 1000));
      this.cb.onChunkClosed({
        file: 'chunk_001.m4a',
        startTs: new Date(this.startMs).toISOString(),
        durationS,
        path: uri,
      });
    }

    // Release the native recorder so the microphone is free for the next visit.
    try {
      rec.release();
    } catch {
      /* already released */
    }
  }
}
