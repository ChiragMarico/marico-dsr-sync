/**
 * Geofence state machine (PRD §7.4). Pure TypeScript — no Expo, no timers,
 * no I/O. It consumes location fixes (fed with explicit timestamps so the
 * logic is unit-testable and replayable) and emits enter/exit events.
 *
 * State per duty session, single active outlet at a time:
 *   IDLE --(fix within ENTER_RADIUS of outlet O)--> CANDIDATE(O,t0)
 *   CANDIDATE --(stays inside until t0+ENTER_CONFIRM)--> ACTIVE(O)  [onEnter]
 *   CANDIDATE --(fix outside ENTER_RADIUS)--> IDLE
 *   ACTIVE --(fix beyond EXIT_RADIUS at t1)--> LEAVING(O,t1)
 *   LEAVING --(fix back inside EXIT_RADIUS)--> ACTIVE            [cancel exit]
 *   LEAVING --(stays outside until t1+EXIT_CONFIRM)--> IDLE      [onExit]
 */
import {
  ACCURACY_REJECT_M,
  ENTER_CONFIRM_S,
  ENTER_RADIUS_M,
  EXIT_CONFIRM_S,
  EXIT_RADIUS_M,
  GPS_GAP_S,
  HIGH_ACCURACY_WITHIN_M,
} from '../constants';
import { Outlet } from '../types';
import { haversineMeters } from './haversine';

export interface Fix {
  lat: number;
  lng: number;
  /** Reported horizontal accuracy in metres, or null if unknown. */
  accuracy: number | null;
  /** Epoch milliseconds. */
  ts: number;
}

export interface GeofenceConfig {
  enterRadiusM: number;
  exitRadiusM: number;
  enterConfirmS: number;
  exitConfirmS: number;
  accuracyRejectM: number;
  gpsGapS: number;
  highAccuracyWithinM: number;
}

export const DEFAULT_CONFIG: GeofenceConfig = {
  enterRadiusM: ENTER_RADIUS_M,
  exitRadiusM: EXIT_RADIUS_M,
  enterConfirmS: ENTER_CONFIRM_S,
  exitConfirmS: EXIT_CONFIRM_S,
  accuracyRejectM: ACCURACY_REJECT_M,
  gpsGapS: GPS_GAP_S,
  highAccuracyWithinM: HIGH_ACCURACY_WITHIN_M,
};

export interface GeofenceEvents {
  /** ACTIVE reached: recording should start. */
  onEnter: (outlet: Outlet, matchedDistanceM: number, fix: Fix) => void;
  /** EXIT confirmed: recording should stop and finalize. */
  onExit: (outlet: Outlet, fix: Fix) => void;
  /** First accepted fix after a long silence while ACTIVE (sets manifest gps_gap). */
  onGpsGap?: (outlet: Outlet) => void;
}

export type Phase = 'IDLE' | 'CANDIDATE' | 'ACTIVE' | 'LEAVING';

export interface GeofenceStatus {
  phase: Phase;
  activeOutlet: Outlet | null;
  nearestOutlet: Outlet | null;
  nearestDistanceM: number | null;
  /** True when the nearest outlet is close enough to warrant High GPS accuracy. */
  needsHighAccuracy: boolean;
  lastFixTs: number | null;
  /** Fix ts when the current CANDIDATE (arriving) window started (0 if not CANDIDATE). */
  candidateSince: number;
  /** Fix ts when the current LEAVING (departing) window started (0 if not LEAVING). */
  leavingSince: number;
}

function enterRadius(o: Outlet, c: GeofenceConfig) {
  return o.enter_radius_m ?? c.enterRadiusM;
}
function exitRadius(o: Outlet, c: GeofenceConfig) {
  return o.exit_radius_m ?? c.exitRadiusM;
}

export class GeofenceEngine {
  private outlets: Outlet[];
  private cfg: GeofenceConfig;
  private events: GeofenceEvents;

  private phase: Phase = 'IDLE';
  private activeOutlet: Outlet | null = null;
  private candidateSince = 0; // t0 for CANDIDATE
  private leavingSince = 0; // t1 for LEAVING
  private lastAcceptedTs: number | null = null;
  private gpsGapFlagged = false;

  private nearestOutlet: Outlet | null = null;
  private nearestDistanceM: number | null = null;

  constructor(outlets: Outlet[], events: GeofenceEvents, cfg: GeofenceConfig = DEFAULT_CONFIG) {
    this.outlets = outlets;
    this.events = events;
    this.cfg = cfg;
  }

  /** Add an outlet at runtime (dev "save location as test outlet" tool). */
  addOutlet(o: Outlet): void {
    this.outlets.push(o);
  }

  /** Remove an outlet by id at runtime. */
  removeOutlet(outletId: string): void {
    this.outlets = this.outlets.filter((o) => o.outlet_id !== outletId);
  }

  getStatus(): GeofenceStatus {
    return {
      phase: this.phase,
      activeOutlet: this.activeOutlet,
      nearestOutlet: this.nearestOutlet,
      nearestDistanceM: this.nearestDistanceM,
      needsHighAccuracy:
        this.nearestDistanceM != null &&
        this.nearestDistanceM <= this.cfg.highAccuracyWithinM,
      lastFixTs: this.lastAcceptedTs,
      candidateSince: this.phase === 'CANDIDATE' ? this.candidateSince : 0,
      leavingSince: this.phase === 'LEAVING' ? this.leavingSince : 0,
    };
  }

  /** Distance from a fix to every outlet; returns the nearest {outlet, dist}. */
  private nearest(fix: Fix): { outlet: Outlet; dist: number } | null {
    let best: { outlet: Outlet; dist: number } | null = null;
    for (const o of this.outlets) {
      const dist = haversineMeters(fix.lat, fix.lng, o.lat, o.lng);
      if (!best || dist < best.dist) best = { outlet: o, dist };
    }
    return best;
  }

  private distanceTo(o: Outlet, fix: Fix): number {
    return haversineMeters(fix.lat, fix.lng, o.lat, o.lng);
  }

  /**
   * Feed one location fix. Returns whether the fix was accepted (used for
   * state). Rejected fixes (poor accuracy) still count as GPS silence.
   */
  feed(fix: Fix): boolean {
    // Reject low-quality fixes but keep them out of state transitions.
    if (fix.accuracy != null && fix.accuracy > this.cfg.accuracyRejectM) {
      return false;
    }

    // GPS-gap detection while ACTIVE/LEAVING: long silence, then a fix arrives.
    if (
      (this.phase === 'ACTIVE' || this.phase === 'LEAVING') &&
      this.lastAcceptedTs != null &&
      fix.ts - this.lastAcceptedTs > this.cfg.gpsGapS * 1000 &&
      !this.gpsGapFlagged
    ) {
      this.gpsGapFlagged = true;
      if (this.activeOutlet) this.events.onGpsGap?.(this.activeOutlet);
    }
    this.lastAcceptedTs = fix.ts;

    const near = this.nearest(fix);
    this.nearestOutlet = near?.outlet ?? null;
    this.nearestDistanceM = near?.dist ?? null;

    switch (this.phase) {
      case 'IDLE':
        this.stepIdle(fix, near);
        break;
      case 'CANDIDATE':
        this.stepCandidate(fix);
        break;
      case 'ACTIVE':
        this.stepActive(fix);
        break;
      case 'LEAVING':
        this.stepLeaving(fix);
        break;
    }
    return true;
  }

  private stepIdle(fix: Fix, near: { outlet: Outlet; dist: number } | null) {
    if (near && near.dist <= enterRadius(near.outlet, this.cfg)) {
      // Nearest wins: candidate is the closest outlet inside its enter radius.
      this.phase = 'CANDIDATE';
      this.activeOutlet = near.outlet;
      this.candidateSince = fix.ts;
    }
  }

  private stepCandidate(fix: Fix) {
    const o = this.activeOutlet!;
    const dist = this.distanceTo(o, fix);
    if (dist > enterRadius(o, this.cfg)) {
      // Left the inner radius before confirming → drop back to IDLE (drive-by).
      this.phase = 'IDLE';
      this.activeOutlet = null;
      return;
    }
    if (fix.ts - this.candidateSince >= this.cfg.enterConfirmS * 1000) {
      this.phase = 'ACTIVE';
      this.gpsGapFlagged = false;
      this.events.onEnter(o, Math.round(dist), fix);
    }
  }

  private stepActive(fix: Fix) {
    const o = this.activeOutlet!;
    const dist = this.distanceTo(o, fix);
    if (dist > exitRadius(o, this.cfg)) {
      this.phase = 'LEAVING';
      this.leavingSince = fix.ts;
    }
    // Entries into other outlets are ignored while ACTIVE (no overlapping visits).
  }

  private stepLeaving(fix: Fix) {
    const o = this.activeOutlet!;
    const dist = this.distanceTo(o, fix);
    if (dist <= exitRadius(o, this.cfg)) {
      // Stepped back inside → cancel the pending exit.
      this.phase = 'ACTIVE';
      return;
    }
    if (fix.ts - this.leavingSince >= this.cfg.exitConfirmS * 1000) {
      this.phase = 'IDLE';
      this.activeOutlet = null;
      this.gpsGapFlagged = false;
      this.events.onExit(o, fix);
    }
  }

  /**
   * Force-close any active/candidate visit (End Duty, manual stop). Fires
   * onExit if a visit was ACTIVE so the recording is finalized cleanly.
   */
  forceExit(fix: Fix): void {
    const o = this.activeOutlet;
    const wasActive = this.phase === 'ACTIVE' || this.phase === 'LEAVING';
    this.phase = 'IDLE';
    this.activeOutlet = null;
    this.gpsGapFlagged = false;
    if (wasActive && o) this.events.onExit(o, fix);
  }

  /**
   * Force-open a visit at a specific outlet regardless of geofence state
   * ("Force record here", PRD §7.5). Fires onEnter immediately.
   */
  forceEnter(outlet: Outlet, fix: Fix): void {
    if (this.phase === 'ACTIVE' || this.phase === 'LEAVING') {
      // Close the current visit first.
      this.forceExit(fix);
    }
    this.phase = 'ACTIVE';
    this.activeOutlet = outlet;
    this.gpsGapFlagged = false;
    const dist = Math.round(this.distanceTo(outlet, fix));
    this.events.onEnter(outlet, dist, fix);
  }
}
