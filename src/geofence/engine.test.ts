import { Fix, GeofenceConfig, GeofenceEngine, GeofenceEvents } from './engine';
import { Outlet } from '../types';

// Fixed config so production tuning changes (radii/confirm times) never break
// these behavioural tests. Mirrors the original PRD-calibrated values.
const TEST_CONFIG: GeofenceConfig = {
  enterRadiusM: 60,
  exitRadiusM: 120,
  enterConfirmS: 30,
  exitConfirmS: 120,
  accuracyRejectM: 80,
  gpsGapS: 90,
  highAccuracyWithinM: 300,
};

// ── Test helpers ─────────────────────────────────────────────────
const M_PER_DEG_LAT = 111_320; // metres per degree latitude (good enough for tests)

const OUTLET_A: Outlet = { outlet_id: 'A', name: 'A', lat: 19.0, lng: 72.0, dsr_id: '1' };
const OUTLET_B: Outlet = { outlet_id: 'B', name: 'B', lat: 19.01, lng: 72.0, dsr_id: '1' };

/** A fix `metersNorth` metres north of the given outlet, at time `ts` (ms). */
function fixNorthOf(o: Outlet, metersNorth: number, ts: number, accuracy = 10): Fix {
  return { lat: o.lat + metersNorth / M_PER_DEG_LAT, lng: o.lng, accuracy, ts };
}

function makeSpies() {
  const enters: { outlet: Outlet; dist: number }[] = [];
  const exits: Outlet[] = [];
  const gaps: Outlet[] = [];
  const events: GeofenceEvents = {
    onEnter: (outlet, dist) => enters.push({ outlet, dist }),
    onExit: (outlet) => exits.push(outlet),
    onGpsGap: (outlet) => gaps.push(outlet),
  };
  return { enters, exits, gaps, events };
}

const S = 1000; // one second in ms

describe('GeofenceEngine', () => {
  test('drive-by inside inner radius but leaves before confirm → no ENTER', () => {
    const { enters, events } = makeSpies();
    const eng = new GeofenceEngine([OUTLET_A], events, TEST_CONFIG);
    eng.feed(fixNorthOf(OUTLET_A, 20, 0)); // inside 60m → CANDIDATE
    eng.feed(fixNorthOf(OUTLET_A, 20, 10 * S)); // still inside at 10s
    eng.feed(fixNorthOf(OUTLET_A, 200, 20 * S)); // gone before 30s → back to IDLE
    expect(enters).toHaveLength(0);
    expect(eng.getStatus().phase).toBe('IDLE');
  });

  test('stays inside past ENTER_CONFIRM → ENTER fires once with matched distance', () => {
    const { enters, events } = makeSpies();
    const eng = new GeofenceEngine([OUTLET_A], events, TEST_CONFIG);
    eng.feed(fixNorthOf(OUTLET_A, 22, 0));
    eng.feed(fixNorthOf(OUTLET_A, 22, 15 * S));
    eng.feed(fixNorthOf(OUTLET_A, 22, 31 * S)); // >30s inside → ACTIVE
    eng.feed(fixNorthOf(OUTLET_A, 22, 45 * S)); // still inside, no duplicate
    expect(enters).toHaveLength(1);
    expect(enters[0].outlet.outlet_id).toBe('A');
    expect(enters[0].dist).toBeGreaterThan(18);
    expect(enters[0].dist).toBeLessThan(26);
    expect(eng.getStatus().phase).toBe('ACTIVE');
  });

  test('being in the 60–120m hysteresis band does NOT trigger EXIT', () => {
    const { exits, events } = makeSpies();
    const eng = new GeofenceEngine([OUTLET_A], events, TEST_CONFIG);
    // reach ACTIVE
    eng.feed(fixNorthOf(OUTLET_A, 20, 0));
    eng.feed(fixNorthOf(OUTLET_A, 20, 31 * S));
    // drift out to 90m (past enter 60, inside exit 120) for a long time
    eng.feed(fixNorthOf(OUTLET_A, 90, 60 * S));
    eng.feed(fixNorthOf(OUTLET_A, 90, 300 * S));
    expect(exits).toHaveLength(0);
    expect(eng.getStatus().phase).toBe('ACTIVE');
  });

  test('beyond EXIT_RADIUS past EXIT_CONFIRM → EXIT fires', () => {
    const { exits, events } = makeSpies();
    const eng = new GeofenceEngine([OUTLET_A], events, TEST_CONFIG);
    eng.feed(fixNorthOf(OUTLET_A, 20, 0));
    eng.feed(fixNorthOf(OUTLET_A, 20, 31 * S)); // ACTIVE
    eng.feed(fixNorthOf(OUTLET_A, 200, 40 * S)); // beyond 120m → LEAVING
    eng.feed(fixNorthOf(OUTLET_A, 200, 100 * S)); // still out, <120s
    eng.feed(fixNorthOf(OUTLET_A, 200, 161 * S)); // >120s since t1 → EXIT
    expect(exits).toHaveLength(1);
    expect(eng.getStatus().phase).toBe('IDLE');
  });

  test('stepping back inside EXIT_RADIUS cancels a pending exit', () => {
    const { exits, events } = makeSpies();
    const eng = new GeofenceEngine([OUTLET_A], events, TEST_CONFIG);
    eng.feed(fixNorthOf(OUTLET_A, 20, 0));
    eng.feed(fixNorthOf(OUTLET_A, 20, 31 * S)); // ACTIVE
    eng.feed(fixNorthOf(OUTLET_A, 200, 40 * S)); // LEAVING
    eng.feed(fixNorthOf(OUTLET_A, 20, 90 * S)); // back inside before 120s → cancel
    eng.feed(fixNorthOf(OUTLET_A, 20, 400 * S)); // stays; no exit
    expect(exits).toHaveLength(0);
    expect(eng.getStatus().phase).toBe('ACTIVE');
  });

  test('nearest outlet wins when inside multiple enter radii', () => {
    const { enters, events } = makeSpies();
    // A and B are ~1113m apart; place a fix 10m north of B (far from A).
    const eng = new GeofenceEngine([OUTLET_A, OUTLET_B], events, TEST_CONFIG);
    eng.feed(fixNorthOf(OUTLET_B, 10, 0));
    eng.feed(fixNorthOf(OUTLET_B, 10, 31 * S));
    expect(enters).toHaveLength(1);
    expect(enters[0].outlet.outlet_id).toBe('B');
  });

  test('no overlapping visits: other outlets ignored while ACTIVE', () => {
    const { enters, exits, events } = makeSpies();
    const eng = new GeofenceEngine([OUTLET_A, OUTLET_B], events, TEST_CONFIG);
    // become ACTIVE at A
    eng.feed(fixNorthOf(OUTLET_A, 20, 0));
    eng.feed(fixNorthOf(OUTLET_A, 20, 31 * S));
    // teleport near B while still ACTIVE at A (A now far → LEAVING, not new enter)
    eng.feed(fixNorthOf(OUTLET_B, 10, 40 * S));
    expect(enters).toHaveLength(1); // still only A's enter
    expect(enters[0].outlet.outlet_id).toBe('A');
  });

  test('fixes worse than ACCURACY_REJECT_M are discarded', () => {
    const { enters, events } = makeSpies();
    const eng = new GeofenceEngine([OUTLET_A], events, TEST_CONFIG);
    eng.feed(fixNorthOf(OUTLET_A, 20, 0, 200)); // accuracy 200m → rejected
    eng.feed(fixNorthOf(OUTLET_A, 20, 31 * S, 200)); // rejected
    expect(enters).toHaveLength(0);
    expect(eng.getStatus().phase).toBe('IDLE');
  });

  test('GPS gap while ACTIVE flags once and never stops recording', () => {
    const { exits, gaps, events } = makeSpies();
    const eng = new GeofenceEngine([OUTLET_A], events, TEST_CONFIG);
    eng.feed(fixNorthOf(OUTLET_A, 20, 0));
    eng.feed(fixNorthOf(OUTLET_A, 20, 31 * S)); // ACTIVE
    // silence of 120s (> GPS_GAP_S 90s), then a fix
    eng.feed(fixNorthOf(OUTLET_A, 20, 160 * S));
    eng.feed(fixNorthOf(OUTLET_A, 20, 175 * S)); // another gap-free fix
    expect(gaps).toHaveLength(1);
    expect(exits).toHaveLength(0);
    expect(eng.getStatus().phase).toBe('ACTIVE');
  });

  test('per-outlet radius overrides are honoured', () => {
    const { enters, events } = makeSpies();
    const tight: Outlet = { ...OUTLET_A, enter_radius_m: 15 };
    const eng = new GeofenceEngine([tight], events, TEST_CONFIG);
    eng.feed(fixNorthOf(tight, 30, 0)); // 30m > 15m override → NOT inside
    eng.feed(fixNorthOf(tight, 30, 31 * S));
    expect(enters).toHaveLength(0);
  });

  test('forceEnter opens a visit immediately; forceExit closes it', () => {
    const { enters, exits, events } = makeSpies();
    const eng = new GeofenceEngine([OUTLET_A], events, TEST_CONFIG);
    const now = 5 * S;
    eng.forceEnter(OUTLET_A, fixNorthOf(OUTLET_A, 5, now));
    expect(enters).toHaveLength(1);
    expect(eng.getStatus().phase).toBe('ACTIVE');
    eng.forceExit(fixNorthOf(OUTLET_A, 5, now + S));
    expect(exits).toHaveLength(1);
    expect(eng.getStatus().phase).toBe('IDLE');
  });

  test('needsHighAccuracy flips when nearest outlet is within escalation range', () => {
    const { events } = makeSpies();
    const eng = new GeofenceEngine([OUTLET_A], events, TEST_CONFIG);
    eng.feed(fixNorthOf(OUTLET_A, 5000, 0)); // 5km away
    expect(eng.getStatus().needsHighAccuracy).toBe(false);
    eng.feed(fixNorthOf(OUTLET_A, 100, 12 * S)); // 100m away (< 300m)
    expect(eng.getStatus().needsHighAccuracy).toBe(true);
  });
});
