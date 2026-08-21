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
import { beginNativeLogCapture, collectNativeLogs } from './nativeAudioLog';

/**
 * Input level below which we treat the microphone as producing nothing.
 * Android hands a denied recorder a stream of exact zeros rather than an
 * error, which meters far below any real room. A genuinely silent shop still
 * reads around -50 dB from room tone.
 */
const SILENT_DB = -80;
/** Consecutive silent seconds before we act: long enough to ignore a pause. */
const SILENT_SECONDS = 8;

/**
 * Recovery ladder, tried in order when the microphone yields nothing.
 *
 * Each rung fully tears the recorder down and rebuilds it — releasing the mic
 * is what gives Android a chance to grant it again — and escalates the capture
 * source. `MIC` is the default that fails; the others are separate paths
 * through Android's audio policy and are not always refused together.
 * `voice_recognition` in particular is intended for background speech capture.
 *
 * The recording being repaired is already silent, so a failed attempt costs
 * nothing. Doing this without asking the rep is the entire point: they work
 * with the phone in a pocket and cannot act on a prompt.
 */
const RECOVERY_SOURCES = ['voice_recognition', 'voice_communication', 'unprocessed'] as const;

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
  /** How many times the recorder rebuilt itself trying to get audio. */
  recoveryAttempts: number;
  /** The capture source that finally produced sound, if any. */
  recoveredWith: string | null;
  /**
   * Native audio errors expo-audio swallowed during this recording — most
   * importantly a refused microphone foreground service start, which is
   * otherwise completely invisible.
   */
  nativeErrors: string[];
  /**
   * Ticks on which the recorder refused to report a level at all. When this
   * dominates the recording, the watchdog was blind: it can neither clear the
   * mic nor detect silence, so absence of a SILENT verdict means nothing.
   */
  meterFailures: number;
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
    recoveryAttempts: 0,
    recoveredWith: null,
    nativeErrors: [],
    meterFailures: 0,
  };
  private silentRun = 0;
  private warned = false;
  private recoveryAttempt = 0;
  private recovering = false;
  /** When the CURRENT segment began — reset by recovery, unlike startMs. */
  private segStartMs = 0;
  /** Segments closed by recovery rebuilds, so a partial capture is never lost. */
  private priorSegments: ChunkClosedInfo[] = [];

  /** Watchdog observations, for the manifest. */
  getMicHealth(): MicHealth {
    return { ...this.health, nativeErrors: collectNativeLogs() };
  }

  // `dir` kept for signature compatibility; recording goes to the document dir.
  constructor(
    private _dir: Directory,
    private cb: ChunkedRecorderCallbacks,
  ) {}

  async start(): Promise<void> {
    beginNativeLogCapture();
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
        this.segStartMs = this.startMs;
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
        this.health.meterFailures++;
        return; // recorder gone or meter dead; stop() will clean up
      }
      if (db > this.health.peakDb) this.health.peakDb = db;
      // Audio after a rebuild means recovery worked — stop calling it silent.
      if (db > SILENT_DB && this.health.wasSilent && this.recoveryAttempt > 0) {
        this.health.wasSilent = false;
      }

      if (db <= SILENT_DB) {
        this.silentRun++;
        if (this.silentRun > this.health.silentSeconds) {
          this.health.silentSeconds = this.silentRun;
        }
        if (this.silentRun >= SILENT_SECONDS && !this.recovering) {
          if (!this.warned) {
            this.warned = true;
            this.health.wasSilent = true;
            this.health.silentInState = AppState.currentState ?? 'unknown';
            this.cb.onMicSilent?.({
              afterSeconds: Math.round((Date.now() - this.startMs) / 1000),
              appState: this.health.silentInState,
            });
          }
          // Fix it rather than report it. The rep is not looking at the phone.
          void this.attemptRecovery();
        }
      } else {
        this.silentRun = 0;
      }
    }, 1000);
  }

  /**
   * Rebuild the recorder on a different capture source and keep going.
   *
   * Whatever we have captured so far is preserved as a segment rather than
   * discarded — if the mic was live for the first thirty seconds, that audio is
   * real and worth keeping even though the rest was lost.
   */
  private async attemptRecovery(): Promise<void> {
    if (this.recovering || this.stopped) return;
    if (this.recoveryAttempt >= RECOVERY_SOURCES.length) return; // ladder exhausted
    this.recovering = true;

    const source = RECOVERY_SOURCES[this.recoveryAttempt];
    this.recoveryAttempt++;
    this.health.recoveryAttempts = this.recoveryAttempt;

    try {
      if (this.meterTimer) {
        clearInterval(this.meterTimer);
        this.meterTimer = null;
      }

      // Keep anything already captured before tearing the recorder down. The
      // segment is closed with its own timing and reported at stop(), so audio
      // from before a mid-visit failure still reaches the manifest and uploads.
      const old = this.recorder;
      this.recorder = null;
      if (old) {
        try {
          await old.stop();
          if (old.uri) {
            this.priorSegments.push({
              file: `chunk_${String(this.priorSegments.length + 1).padStart(3, '0')}.m4a`,
              startTs: new Date(this.segStartMs).toISOString(),
              durationS: Math.max(1, Math.round((Date.now() - this.segStartMs) / 1000)),
              path: old.uri,
            });
          }
        } catch {
          /* nothing salvageable from this attempt */
        }
        try {
          old.release(); // releasing is what lets Android re-grant the mic
        } catch {
          /* already gone */
        }
      }

      // Re-assert the audio session before asking again.
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        allowsBackgroundRecording: true,
        interruptionMode: 'doNotMix',
      });
      await delay(500);

      // Cast for the same reason outputFormat/audioEncoder are set flat in
      // audioConfig: the Android module reads `audioSource` off the options
      // object, but the published type omits it.
      const rec = new AudioModule.AudioRecorder({
        ...AUDIO_OPTIONS,
        audioSource: source,
      } as unknown as typeof AUDIO_OPTIONS);
      this.recorder = rec;
      await withTimeout(rec.prepareToRecordAsync(), 5000);
      rec.record();
      this.segStartMs = Date.now();
      this.silentRun = 0;
      this.startWatchdog(rec);

      // If this source works, the next second of metering clears wasSilent.
      this.health.recoveredWith = source;
    } catch {
      // This rung failed; the next silence window tries the one below it.
      this.health.recoveredWith = null;
    } finally {
      this.recovering = false;
    }
  }

  private stopWatchdog(): void {
    if (this.meterTimer) {
      clearInterval(this.meterTimer);
      this.meterTimer = null;
    }
    // Call it silent only when the watchdog actually WATCHED silence happen.
    // peakDb alone is not enough: if getStatus() throws every tick (seen in the
    // field on a 16s clip that measurably contains speech), peakDb never moves
    // off the floor even though nothing silent was observed.
    if (this.health.peakDb <= SILENT_DB && this.health.silentSeconds >= SILENT_SECONDS) {
      this.health.wasSilent = true;
    }
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

    // Segments closed by recovery rebuilds go out first, in order; the final
    // recording follows with the next chunk number. Numbering matches the S3
    // keys the upload queue derives from these names.
    for (const seg of this.priorSegments) this.cb.onChunkClosed(seg);
    if (uri) {
      // If stop() races start() — a visit shorter than the cold-start retry
      // loop — segStartMs can still be 0, and "now minus zero" wrote epoch-
      // sized durations into real manifests. Fall back rather than report it.
      const base = this.segStartMs || this.startMs || Date.now();
      this.cb.onChunkClosed({
        file: `chunk_${String(this.priorSegments.length + 1).padStart(3, '0')}.m4a`,
        startTs: new Date(base).toISOString(),
        durationS: Math.max(1, Math.round((Date.now() - base) / 1000)),
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
