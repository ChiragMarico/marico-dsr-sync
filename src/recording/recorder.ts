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
import { AppState } from 'react-native';
import { AudioModule, setAudioModeAsync, type AudioRecorder } from 'expo-audio';
import type { Directory } from 'expo-file-system';
import { AUDIO_OPTIONS } from './audioConfig';

/**
 * Input level below which we treat the microphone as producing nothing.
 * Android hands a denied recorder a stream of exact zeros rather than an
 * error, which meters far below any real room. A genuinely silent shop still
 * reads around -50 dB from room tone.
 */
const SILENT_DB = -80;
/** Consecutive silent seconds before we call it: long enough to ignore a pause. */
const SILENT_SECONDS = 8;

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
  /**
   * The microphone is producing silence while we believe we are recording.
   * Fires once per recording so the UI can warn the rep immediately, rather
   * than the loss only being discovered by inspecting files hours later.
   */
  onMicSilent?: (info: { afterSeconds: number; appState: string }) => void;
}

/** What the watchdog observed, recorded into the manifest for later analysis. */
export interface MicHealth {
  /** Loudest input level seen, in dB. Stays at the floor if the mic was dead. */
  peakDb: number;
  /** Seconds of consecutive silence observed. */
  silentSeconds: number;
  /** True if the mic never produced anything above the silence floor. */
  wasSilent: boolean;
  /** App foreground/background when recording STARTED — the key missing datum. */
  startedInState: string;
  /** App state when silence was first detected, if it was. */
  silentInState: string | null;
}

export class ChunkedRecorder {
  private recorder: AudioRecorder | null = null;
  private startMs = 0;
  private stopped = false;
  private meterTimer: ReturnType<typeof setInterval> | null = null;
  private health: MicHealth = {
    peakDb: -160,
    silentSeconds: 0,
    wasSilent: false,
    startedInState: 'unknown',
    silentInState: null,
  };
  private silentRun = 0;
  private warned = false;

  /** Watchdog observations, for the manifest. */
  getMicHealth(): MicHealth {
    return { ...this.health };
  }

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
        // Captured at start because it is the variable we could never explain
        // the silent recordings by — whether the app was foregrounded at the
        // moment Android decided whether to grant the microphone.
        this.health.startedInState = AppState.currentState ?? 'unknown';
        this.startWatchdog(rec);
        await this.detectMicSource(rec);
        return; // recording
      } catch (e) {
        lastErr = e;
        await delay(300 + attempt * 250); // let the mic settle, then retry
      }
    }
    // All attempts failed — free anything we grabbed and report up.
    this.stopWatchdog();
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

  /**
   * Poll the input level once a second. Android does not report a denied
   * microphone as an error — it simply returns zeros — so metering is the only
   * way the app can notice from the inside that it is capturing nothing.
   */
  private startWatchdog(rec: AudioRecorder): void {
    if (this.meterTimer) clearInterval(this.meterTimer);
    this.meterTimer = setInterval(() => {
      let db = -160;
      try {
        db = rec.getStatus().metering ?? -160;
      } catch {
        return; // recorder gone; stop() will clean up
      }
      if (db > this.health.peakDb) this.health.peakDb = db;

      if (db <= SILENT_DB) {
        this.silentRun++;
        if (this.silentRun > this.health.silentSeconds) {
          this.health.silentSeconds = this.silentRun;
        }
        if (this.silentRun >= SILENT_SECONDS && !this.warned) {
          this.warned = true;
          this.health.wasSilent = true;
          this.health.silentInState = AppState.currentState ?? 'unknown';
          this.cb.onMicSilent?.({
            afterSeconds: Math.round((Date.now() - this.startMs) / 1000),
            appState: this.health.silentInState,
          });
        }
      } else {
        this.silentRun = 0;
      }
    }, 1000);
  }

  private stopWatchdog(): void {
    if (this.meterTimer) {
      clearInterval(this.meterTimer);
      this.meterTimer = null;
    }
    // Never saw anything above the floor → the whole recording is silence.
    if (this.health.peakDb <= SILENT_DB) this.health.wasSilent = true;
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
    this.stopWatchdog();
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
