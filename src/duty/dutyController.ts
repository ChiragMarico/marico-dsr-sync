/**
 * Duty controller (PRD §7.3–§7.5) — the singleton that keeps everything alive
 * during a duty session and wires the pieces together:
 *
 *   location fixes → GeofenceEngine → (enter) start ChunkedRecorder + Visit
 *                                   → (exit)  finalize manifest → upload queue
 *
 * State is exposed to the UI via a tiny subscribe/getState store. The location
 * task (locationTask.ts) forwards fixes here via onLocations().
 */
import * as Device from 'expo-device';
import { Directory, File, Paths } from 'expo-file-system';
import * as Location from 'expo-location';
import { randomUUID } from 'expo-crypto';

import {
  ACCURACY_REJECT_M,
  AUTO_END_HOUR,
  ENTER_CONFIRM_S,
  EXIT_CONFIRM_S,
  LOCATION_INTERVAL_MS,
  LOCATION_TASK,
  MAX_RECORDING_MIN,
} from '../constants';
import { GeofenceEngine, Fix, Phase } from '../geofence/engine';
import { Manifest, newManifest } from '../recording/manifest';
import { ChunkedRecorder } from '../recording/recorder';
import { Outlet, Session } from '../types';
import { logEvent, uploadDayLog } from '../logs/daylog';
import {
  clearRecordingNotification,
  showRecordingNotification,
} from './notifications';
import { t } from '../i18n';
import { clearDutyState, saveDutyState } from './dutyState';
import {
  configureUpload,
  enqueueUpload,
  kickUploads,
  pendingCounts,
  retryAuthFailed,
} from '../upload/worker';
import { finalizeVisit, insertVisit } from '../data/visitsRepo';
import { addTestOutlet, loadTestOutlets, removeTestOutletStored } from '../storage/testOutlets';

// ── UI-facing state ──────────────────────────────────────────────
export interface DutyUiState {
  onDuty: boolean;
  startedAt: string | null;
  recording: boolean;
  recordingOutletName: string | null;
  recordingStartedAt: number | null;
  nearestOutletName: string | null;
  nearestDistanceM: number | null;
  fixCount: number;
  lastFix: Fix | null;
  /** Accuracy (±m) of the last real fix — the geofence rejects fixes worse than ACCURACY_REJECT_M. */
  lastAccuracyM: number | null;
  /** True when the latest real fix was too rough to use (indoors, no WiFi, etc.). */
  signalWeak: boolean;
  locationOk: boolean;
  visitsToday: number; // DISTINCT outlets visited today
  visitedOutletIds: string[];
  pendingUploads: number;
  geoPhase: Phase | 'OFF';
  devMode: boolean;
  /** Countdown timer for the home screen: arriving → will start, leaving → will stop. */
  confirmKind: 'arriving' | 'leaving' | null;
  confirmStartedAt: number | null; // ms
  confirmTotalS: number;
  /** Set when a visit was detected but audio couldn't start (e.g. mic busy on a call). */
  recordingError: string | null;
  /**
   * Set while the microphone is producing silence during an active recording.
   * Android does not error in this case, so this is the only in-app signal a
   * rep gets that the visit is being lost.
   */
  micSilent: boolean;
}

type Listener = (s: DutyUiState) => void;

interface ActiveVisit {
  visitId: string;
  outlet: Outlet;
  date: string;
  manifest: Manifest;
  dir: Directory;
  recorder: ChunkedRecorder | null;
  capTimer: ReturnType<typeof setTimeout> | null;
}

function localDate(d = new Date()): string {
  // YYYY-MM-DD in local time (not UTC).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

class DutyController {
  private state: DutyUiState = {
    onDuty: false,
    startedAt: null,
    recording: false,
    recordingOutletName: null,
    recordingStartedAt: null,
    nearestOutletName: null,
    nearestDistanceM: null,
    fixCount: 0,
    lastFix: null,
    lastAccuracyM: null,
    signalWeak: false,
    locationOk: true,
    visitsToday: 0,
    visitedOutletIds: [],
    pendingUploads: 0,
    geoPhase: 'OFF',
    devMode: false,
    confirmKind: null,
    confirmStartedAt: null,
    confirmTotalS: 0,
    recordingError: null,
    micSilent: false,
  };
  private listeners = new Set<Listener>();
  private devMode = false;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private visitedOutletIds = new Set<string>(); // distinct outlets visited today
  private session: Session | null = null;
  private outlets: Outlet[] = [];
  private engine: GeofenceEngine | null = null;
  private active: ActiveVisit | null = null;
  private visitsDir = new Directory(Paths.document, 'visits');

  // ── store ──
  getState(): DutyUiState {
    return this.state;
  }
  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  private set(patch: Partial<DutyUiState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  isOnDuty(): boolean {
    return this.state.onDuty;
  }

  /**
   * Full reset on logout. The controller is a singleton, so without this the
   * next login could see the PREVIOUS DSR's outlets still sitting in memory
   * (that's exactly the 1023 → 10150-3 mix-up). Ends duty if needed, then
   * clears every piece of per-DSR state.
   */
  async reset(): Promise<void> {
    if (this.state.onDuty) await this.endDuty();
    this.session = null;
    this.outlets = [];
    this.engine = null;
    this.active = null;
    this.devMode = false;
    this.visitedOutletIds.clear();
    this.set({
      onDuty: false,
      startedAt: null,
      recording: false,
      recordingOutletName: null,
      recordingStartedAt: null,
      nearestOutletName: null,
      nearestDistanceM: null,
      fixCount: 0,
      lastFix: null,
      lastAccuracyM: null,
      signalWeak: false,
      visitsToday: 0,
      visitedOutletIds: [],
      geoPhase: 'OFF',
      devMode: false,
      confirmKind: null,
      confirmStartedAt: null,
      confirmTotalS: 0,
      recordingError: null,
      micSilent: false,
    });
  }

  // ── lifecycle ──
  async startDuty(session: Session, outlets: Outlet[]): Promise<void> {
    this.session = session;
    // Merge any saved test outlets (dev tool) into the assigned list.
    const testOutlets = await loadTestOutlets();
    const seen = new Set(outlets.map((o) => o.outlet_id));
    this.outlets = [...outlets, ...testOutlets.filter((o) => !seen.has(o.outlet_id))];
    if (!this.visitsDir.exists) this.visitsDir.create({ intermediates: true });

    configureUpload({
      getAuth: () =>
        this.session ? { dsrId: this.session.dsr.id, token: this.session.token } : null,
      refreshToken: async () => null, // silent re-login handled at app level (Phase 1)
      onAuthFailure: () => this.set({}),
    });

    await this.recoverOrphans();

    this.engine = new GeofenceEngine(this.outlets, {
      onEnter: (outlet, dist, fix) => {
        void this.startVisit(outlet, dist, fix, 'geofence');
      },
      onExit: (_outlet, fix) => {
        void this.endVisit(fix);
      },
      onGpsGap: () => {
        if (this.active) this.active.manifest.flags.gps_gap = true;
      },
    });

    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      // High = Android's fused "use everything" mode: GPS + WiFi + cell.
      // It still delivers WiFi fixes indoors (same as Balanced did), but adds
      // GPS so shopfronts/outdoors get 5–15 m fixes. Balanced alone collapsed
      // to ±500 m cell-tower guesses whenever WiFi positioning wasn't available,
      // and the geofence (rightly) rejected those — recording never started.
      accuracy: Location.Accuracy.High,
      timeInterval: LOCATION_INTERVAL_MS,
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'Sync — On duty',
        notificationBody: 'Tracking visits',
        notificationColor: '#1C5AA8',
        killServiceOnDestroy: false,
      },
    });

    // Drive enter/exit confirmations on time (survives a stationary GPS).
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => this.tick(), 1000);

    this.visitedOutletIds.clear();
    const startedAt = new Date().toISOString();
    this.set({
      onDuty: true,
      startedAt,
      locationOk: true,
      fixCount: 0,
      lastAccuracyM: null,
      signalWeak: false,
      visitsToday: 0,
      visitedOutletIds: [],
      geoPhase: 'IDLE',
      recordingError: null,
    });
    await saveDutyState({
      onDuty: true,
      dsrId: session.dsr.id,
      startedAt,
      date: localDate(),
    });
    await logEvent(session.dsr.id, localDate(), 'duty_start');
    await this.refreshCounts();
    kickUploads();
  }

  async endDuty(): Promise<{ visits: number; pending: number }> {
    // Finalize any in-flight visit so nothing is silently lost.
    if (this.active) {
      await this.endVisit(this.state.lastFix ?? this.syntheticFix());
    }
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
    await clearRecordingNotification();

    const dsrId = this.session?.dsr.id;
    const date = localDate();
    if (dsrId) {
      await logEvent(dsrId, date, 'duty_end');
      await uploadDayLog(dsrId, date);
    }
    kickUploads();

    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    const counts = await pendingCounts();
    await clearDutyState();
    this.devMode = false;
    this.set({
      onDuty: false,
      startedAt: null,
      recording: false,
      recordingOutletName: null,
      recordingStartedAt: null,
      geoPhase: 'OFF',
      devMode: false,
    });
    this.engine = null;
    return { visits: this.state.visitsToday, pending: counts.pendingItems };
  }

  // ── location ingest ──
  onLocations(locations: Location.LocationObject[]): void {
    if (!this.engine) return;
    if (this.devMode) return; // desk-simulation mode ignores real GPS
    for (const loc of locations) {
      this.ingest({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
        ts: loc.timestamp,
      });
    }
    void this.maybeAutoEnd();
  }

  /**
   * Re-feed the last known position with a current timestamp every second, so
   * enter/exit confirmations advance on TIME even when the user stands still and
   * the phone stops emitting new GPS fixes (which was freezing the countdown).
   */
  private tick(): void {
    if (!this.engine || this.devMode) return;
    const lf = this.state.lastFix;
    if (lf) this.ingest({ ...lf, ts: Date.now() }, false);
    void this.maybeAutoEnd();
  }

  /** Feed one fix through the engine and reflect the result in UI state. */
  private ingest(fix: Fix, real = true): void {
    if (!this.engine) return;
    const accepted = this.engine.feed(fix);
    if (real && accepted && this.active) {
      this.active.manifest.gps_trail.push({
        lat: fix.lat,
        lng: fix.lng,
        acc: fix.accuracy,
        ts: new Date(fix.ts).toISOString(),
      });
    }
    const st = this.engine.getStatus();
    let confirmKind: 'arriving' | 'leaving' | null = null;
    let confirmStartedAt: number | null = null;
    let confirmTotalS = 0;
    if (st.phase === 'CANDIDATE') {
      confirmKind = 'arriving';
      confirmStartedAt = st.candidateSince;
      confirmTotalS = ENTER_CONFIRM_S;
    } else if (st.phase === 'LEAVING') {
      confirmKind = 'leaving';
      confirmStartedAt = st.leavingSince;
      confirmTotalS = EXIT_CONFIRM_S;
    }
    this.set({
      fixCount: real ? this.state.fixCount + 1 : this.state.fixCount,
      lastFix: real ? fix : this.state.lastFix,
      lastAccuracyM:
        real && fix.accuracy != null ? Math.round(fix.accuracy) : this.state.lastAccuracyM,
      signalWeak: real
        ? fix.accuracy != null && fix.accuracy > ACCURACY_REJECT_M
        : this.state.signalWeak,
      geoPhase: st.phase,
      nearestOutletName: st.nearestOutlet?.name ?? null,
      nearestDistanceM: st.nearestDistanceM != null ? Math.round(st.nearestDistanceM) : null,
      confirmKind,
      confirmStartedAt,
      confirmTotalS,
    });
  }

  // ── dev testing (PRD §13) ──
  getOutlets(): Outlet[] {
    return this.outlets;
  }

  /**
   * Save the phone's current GPS as a dummy outlet so a developer can walk in
   * and out and trigger the real geofence. Persists across restarts.
   */
  async addTestOutletHere(dsrId: string): Promise<Outlet | null> {
    // Balanced works indoors; fall back to the last known position if needed.
    let pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }).catch(() => null);
    if (!pos) pos = await Location.getLastKnownPositionAsync();
    if (!pos) return null;
    const existing = await loadTestOutlets();
    const outlet: Outlet = {
      outlet_id: `TEST-${Date.now()}`,
      name: `Test outlet ${existing.length + 1} (here)`,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      dsr_id: dsrId,
    };
    // Apply live if on duty; always persist so it's merged at next Start Duty.
    if (!this.outlets.some((o) => o.outlet_id === outlet.outlet_id)) {
      this.outlets.push(outlet);
    }
    this.engine?.addOutlet(outlet);
    await addTestOutlet(outlet);
    this.set({}); // nudge subscribers
    return outlet;
  }

  async removeTestOutlet(id: string): Promise<void> {
    this.outlets = this.outlets.filter((o) => o.outlet_id !== id);
    this.engine?.removeOutlet(id);
    await removeTestOutletStored(id);
    this.set({});
  }

  setDevMode(on: boolean): void {
    this.devMode = on;
    this.set({ devMode: on });
  }

  /** Simulate walking into an outlet: injects fixes that cross ENTER_CONFIRM. */
  simulateArriveAt(outlet: Outlet): void {
    if (!this.engine || this.active) return;
    const base = Date.now();
    this.ingest({ lat: outlet.lat, lng: outlet.lng, accuracy: 5, ts: base });
    this.ingest({
      lat: outlet.lat,
      lng: outlet.lng,
      accuracy: 5,
      ts: base + (ENTER_CONFIRM_S + 2) * 1000,
    });
  }

  /** Simulate leaving: injects far fixes that cross EXIT_CONFIRM. */
  simulateLeave(): void {
    if (!this.engine) return;
    const base = Date.now() + (ENTER_CONFIRM_S + 5) * 1000;
    // 0,0 is far from any real outlet → forces LEAVING then EXIT.
    this.ingest({ lat: 0, lng: 0, accuracy: 5, ts: base });
    this.ingest({ lat: 0, lng: 0, accuracy: 5, ts: base + (EXIT_CONFIRM_S + 2) * 1000 });
  }

  // ── visits ──
  /** Build a recorder wired to an active visit's manifest + upload queue. */
  private newRecorderFor(active: ActiveVisit): ChunkedRecorder {
    return new ChunkedRecorder(active.dir, {
      onChunkClosed: (info) => {
        active.manifest.chunks.push({
          file: info.file,
          start_ts: info.startTs,
          duration_s: info.durationS,
        });
        void this.enqueueChunk(active, info.file, info.path);
      },
      onMicSource: (src) => {
        active.manifest.mic_source = src;
      },
      onInterrupted: () => {
        active.manifest.flags.interrupted_by_call = true;
      },
      onMicSilent: ({ afterSeconds, appState }) => {
        // Flag it for the manifest and the admin monitor only. The rep is not
        // looking at the phone, so there is nobody to notify — the recorder
        // repairs itself instead (see ChunkedRecorder.attemptRecovery).
        this.set({ micSilent: true });
        void logEvent(this.session?.dsr.id ?? '?', active.date, 'mic_silent', {
          outlet: active.outlet.outlet_id,
          afterSeconds,
          appState,
        });
      },
    });
  }

  /** Retry recording on the current visit if the first start failed. */
  private async retryActiveRecording(): Promise<void> {
    const active = this.active;
    if (!active || this.state.recording) return;
    const recorder = this.newRecorderFor(active);
    active.recorder = recorder;
    try {
      await recorder.start();
      active.manifest.flags.recording_failed = false;
      this.set({
        recording: true,
        recordingOutletName: active.outlet.name,
        recordingStartedAt: Date.now(),
        recordingError: null,
      });
      await showRecordingNotification(active.outlet.name);
    } catch (e) {
      this.set({
        recordingError: `Still couldn’t start the mic (${e instanceof Error ? e.message : String(e)}).`,
      });
    }
  }

  private async startVisit(
    outlet: Outlet,
    matchedDistanceM: number,
    fix: Fix,
    trigger: 'geofence' | 'manual',
  ): Promise<void> {
    if (!this.session) return;
    if (this.active) return; // no overlapping visits
    const visitId = randomUUID();
    const date = localDate();
    const enterTs = new Date(fix.ts).toISOString();
    const dir = new Directory(this.visitsDir, visitId);
    if (!dir.exists) dir.create({ intermediates: true });

    const manifest = newManifest({
      visit_id: visitId,
      dsr_id: this.session.dsr.id,
      outlet_id: outlet.outlet_id,
      outlet_name: outlet.name,
      date,
      enter_ts: enterTs,
      trigger,
      matched_distance_m: matchedDistanceM,
      deviceModel: Device.modelName ?? 'unknown',
      osVersion: `${Device.osName ?? 'Android'} ${Device.osVersion ?? ''}`.trim(),
    });

    const active: ActiveVisit = {
      visitId,
      outlet,
      date,
      manifest,
      dir,
      recorder: null,
      capTimer: null,
    };
    this.active = active;

    // ── CRITICAL PATH: start recording FIRST ──────────────────────────
    // Bookkeeping (DB insert, event log) used to run before this; if any of it
    // hiccuped, the whole visit aborted before recording ever began (no card,
    // no error). Recording is what matters, so it goes first and nothing is
    // allowed to block it.
    const recorder = this.newRecorderFor(active);
    active.recorder = recorder;

    let started = false;
    let startErr = '';
    try {
      await recorder.start(); // self-retries + releases on failure internally
      started = true;
    } catch (e) {
      startErr = e instanceof Error ? e.message : String(e);
      manifest.flags.recording_failed = true;
    }

    active.capTimer = setTimeout(() => {
      void this.endVisit(this.state.lastFix ?? this.syntheticFix());
    }, MAX_RECORDING_MIN * 60 * 1000);

    // Reflect recording state in the UI immediately (card appears here).
    this.visitedOutletIds.add(outlet.outlet_id);
    this.set({
      micSilent: false, // fresh visit, fresh verdict
      recording: started,
      recordingOutletName: started ? outlet.name : null,
      recordingStartedAt: started ? Date.now() : null,
      visitsToday: this.visitedOutletIds.size,
      visitedOutletIds: [...this.visitedOutletIds],
      recordingError: started
        ? null
        : `Recording didn’t start (${startErr || 'mic busy?'}). Tap “Record here” to retry — the visit is still logged.`,
    });
    if (started) await showRecordingNotification(outlet.name);

    // ── Best-effort bookkeeping: must NEVER block or abort the recording ──
    try {
      await insertVisit({
        visit_id: visitId,
        dsr_id: this.session.dsr.id,
        date,
        outlet_name: outlet.name,
        enter_ts: enterTs,
        trigger,
      });
      await logEvent(this.session.dsr.id, date, 'visit_enter', { outlet: outlet.outlet_id });
      if (!started) {
        await logEvent(this.session.dsr.id, date, 'recording_failed', {
          outlet: outlet.outlet_id,
        });
      }
    } catch {
      /* non-fatal: the recording and its manifest are what matter */
    }
    await this.refreshCounts();
  }

  private async endVisit(fix: Fix): Promise<void> {
    const active = this.active;
    if (!active || !this.session) return;
    this.active = null; // guard against re-entry
    if (active.capTimer) clearTimeout(active.capTimer);

    if (active.recorder) {
      try {
        await active.recorder.stop();
      } catch {
        active.manifest.flags.recording_incomplete = true;
      }
      // Persist what the mic actually did, so silent visits are queryable
      // rather than only discoverable by downloading and probing the audio.
      active.manifest.mic_health = active.recorder.getMicHealth();
    }

    active.manifest.exit_ts = new Date(fix.ts).toISOString();
    active.manifest.total_duration_s = active.manifest.chunks.reduce(
      (s, c) => s + c.duration_s,
      0,
    );

    // Write manifest.json and enqueue it LAST (signals visit complete).
    const mf = new File(active.dir, 'manifest.json');
    if (!mf.exists) mf.create();
    mf.write(JSON.stringify(active.manifest, null, 2));
    await enqueueUpload({
      local_path: mf.uri,
      s3_key: `${this.recPrefix(active)}/manifest.json`,
      visit_id: active.visitId,
      content_type: 'application/json',
      kind: 'manifest',
    });

    await finalizeVisit(active.visitId, active.manifest.exit_ts);
    await logEvent(this.session.dsr.id, active.date, 'visit_exit', {
      outlet: active.outlet.outlet_id,
    });
    await clearRecordingNotification();
    this.set({
      recording: false,
      recordingOutletName: null,
      recordingStartedAt: null,
      recordingError: null,
      micSilent: false,
    });
    await this.refreshCounts();
  }

  private recPrefix(a: ActiveVisit): string {
    return `recordings/${this.session!.dsr.id}/${a.date}/${a.outlet.outlet_id}/${a.visitId}`;
  }

  private async enqueueChunk(a: ActiveVisit, file: string, path: string): Promise<void> {
    await enqueueUpload({
      local_path: path,
      s3_key: `${this.recPrefix(a)}/${file}`,
      visit_id: a.visitId,
      content_type: 'audio/mp4',
      kind: 'chunk',
    });
  }

  // ── manual overrides (PRD §7.5) ──
  forceRecordHere(): Outlet | null {
    if (!this.engine) return null;
    // A visit is already open: if its recording failed to start, retry it here
    // instead of bailing (so "Record here" doubles as a retry button).
    if (this.active) {
      if (!this.state.recording) {
        void this.retryActiveRecording();
        return this.active.outlet;
      }
      return null; // already recording
    }
    // Prefer the GPS-nearest outlet; fall back to the first assigned outlet so
    // this always works even before the first GPS fix arrives.
    const st = this.engine.getStatus();
    const outlet = st.nearestOutlet ?? this.outlets[0] ?? null;
    if (!outlet) return null;
    const fix = this.state.lastFix ?? this.syntheticFix(outlet);
    this.engine.forceEnter(outlet, fix);
    return outlet;
  }

  forceStop(): void {
    if (!this.engine) return;
    this.engine.forceExit(this.state.lastFix ?? this.syntheticFix());
  }

  // ── watchdog / health ──
  async isServiceRunning(): Promise<boolean> {
    return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  }

  async checkLocationHealth(): Promise<boolean> {
    const { granted } = await Location.getForegroundPermissionsAsync();
    const enabled = await Location.hasServicesEnabledAsync();
    const ok = granted && enabled;
    this.set({ locationOk: ok });
    return ok;
  }

  /** Finalize visit folders left without a manifest after a crash (§7.5). */
  private async recoverOrphans(): Promise<void> {
    if (!this.visitsDir.exists || !this.session) return;
    for (const entry of this.visitsDir.list()) {
      if (!(entry instanceof Directory)) continue;
      const mf = new File(entry, 'manifest.json');
      if (mf.exists) continue; // already finalized
      const chunks = entry
        .list()
        .filter((e): e is File => e instanceof File && e.name.startsWith('chunk_'));
      if (chunks.length === 0) {
        entry.delete();
        continue;
      }
      // Rebuild a minimal manifest so the audio isn't lost.
      const visitId = entry.name;
      const now = new Date().toISOString();
      const manifest = newManifest({
        visit_id: visitId,
        dsr_id: this.session.dsr.id,
        outlet_id: 'UNKNOWN',
        outlet_name: 'Recovered visit',
        date: localDate(),
        enter_ts: now,
        trigger: 'geofence',
        matched_distance_m: 0,
        deviceModel: Device.modelName ?? 'unknown',
        osVersion: `${Device.osName ?? 'Android'} ${Device.osVersion ?? ''}`.trim(),
      });
      manifest.flags.recording_incomplete = true;
      manifest.chunks = chunks
        .map((c) => c.name)
        .sort()
        .map((name) => ({ file: name, start_ts: now, duration_s: 0 }));
      manifest.exit_ts = now;
      if (!mf.exists) mf.create();
      mf.write(JSON.stringify(manifest, null, 2));
      const prefix = `recordings/${this.session.dsr.id}/${localDate()}/UNKNOWN/${visitId}`;
      for (const c of chunks) {
        await enqueueUpload({
          local_path: c.uri,
          s3_key: `${prefix}/${c.name}`,
          visit_id: visitId,
          content_type: 'audio/mp4',
          kind: 'chunk',
        });
      }
      await enqueueUpload({
        local_path: mf.uri,
        s3_key: `${prefix}/manifest.json`,
        visit_id: visitId,
        content_type: 'application/json',
        kind: 'manifest',
      });
    }
  }

  async onAppForeground(): Promise<void> {
    await this.checkLocationHealth();
    await retryAuthFailed();
    kickUploads();
    await this.refreshCounts();
  }

  private async refreshCounts(): Promise<void> {
    const c = await pendingCounts();
    this.set({ pendingUploads: c.pendingItems });
  }

  private async maybeAutoEnd(): Promise<void> {
    if (!this.state.onDuty) return;
    if (new Date().getHours() >= AUTO_END_HOUR && new Date().getMinutes() >= 59) {
      await this.endDuty();
    }
  }

  private syntheticFix(outlet?: Outlet | null): Fix {
    const o = outlet ?? this.outlets[0];
    return {
      lat: o?.lat ?? 0,
      lng: o?.lng ?? 0,
      accuracy: null,
      ts: Date.now(),
    };
  }
}

export const dutyController = new DutyController();
