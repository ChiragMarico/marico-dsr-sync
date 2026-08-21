/**
 * All tunable parameters live here (PRD §7.4). Adjust during field testing.
 */

// ── Geofence engine ──────────────────────────────────────────────
export const LOCATION_INTERVAL_MS = 1_000; // location update cadence on duty (~1s = fastest GPS; higher battery)
export const ENTER_RADIUS_M = 10; // inside this = "at outlet" (per-outlet override allowed)
export const EXIT_RADIUS_M = 10; // beyond this = "left outlet" (equal → minimal hysteresis; may flicker at the edge)
export const ENTER_CONFIRM_S = 5; // must stay inside before ENTER fires — kept short so the
// opening of a conversation isn't missed; the cost is the occasional recording
// from someone pausing near a shop without going in.
export const EXIT_CONFIRM_S = 10; // must stay outside before EXIT fires (testing value; PRD prod = 120)
export const MAX_RECORDING_MIN = 45; // hard cap per visit
export const ACCURACY_REJECT_M = 80; // discard fixes worse than this
export const HIGH_ACCURACY_WITHIN_M = 300; // escalate GPS accuracy near an outlet
export const GPS_GAP_S = 90; // no acceptable fix for this long while ACTIVE → gps_gap flag

// ── Recording ────────────────────────────────────────────────────
export const CHUNK_SECONDS = 120;
// Quality-first mono AAC: 48 kHz / 128 kbps (~960 KB per minute).
//
// 48 kHz rather than 44.1 kHz because that is the native rate of most Android
// audio hardware — recording at 44.1 forces the device to resample, which is a
// small but real quality loss for no benefit.
//
// 128 kbps is the practical ceiling for MONO speech: above it AAC has nothing
// left to encode, so higher numbers cost storage and change nothing audible.
// Storage was deliberately not the deciding factor here.
//
// See recording/audioConfig.ts for why the android block must repeat these.
export const AUDIO_SAMPLE_RATE = 48_000;
export const AUDIO_BITRATE = 128_000;
// Android capture source (tunable). 'voice_recognition' = clean speech pickup,
// widely supported. Alternatives to try in the field: 'unprocessed' (fuller,
// rawer — no auto gain/noise suppression), 'mic' (device default), 'camcorder'.
export const AUDIO_SOURCE = 'voice_recognition';

// ── Upload / retry ───────────────────────────────────────────────
export const BACKOFF_STEPS_MS = [30_000, 120_000, 300_000, 900_000]; // 30s → 2m → 5m → 15m cap

// ── Auth ─────────────────────────────────────────────────────────
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_COOLDOWN_S = 60;

// ── API ──────────────────────────────────────────────────────────
// 'mock' = in-process fake Lambda (auth/config). 'live' = real Function URL.
export const API_MODE: 'mock' | 'live' = 'mock';
// Where recorded audio goes: 'mock' = simulated success, 's3' = direct upload to
// S3 via on-device pre-signed URLs (no backend). Auth/outlets still use API_MODE.
export const UPLOAD_TARGET: 'mock' | 's3' = 's3';
export const LAMBDA_URL = 'https://REPLACE-ME.lambda-url.ap-south-1.on.aws/';
export const API_TIMEOUT_MS = 15_000;
// Public-read version manifest + APK host (set at Phase 7 release).
export const APP_VERSION_URL =
  'https://marico-dsr-pilot.s3.ap-south-1.amazonaws.com/config/app-version.json';
export const APK_BASE_URL =
  'https://marico-dsr-pilot.s3.ap-south-1.amazonaws.com/';

// ── App ──────────────────────────────────────────────────────────
export const APP_VERSION = '1.1.0';
// Bumped on every over-the-air update so Settings shows what's installed.
export const BUILD_LABEL = 'v8.6 · pilot — recovery keeps partial audio';
export const LOCATION_TASK = 'dsr-location-task';
export const AUTO_END_HOUR = 23; // duty auto-ends at 11:59 PM if DSR forgets
export const MIN_FREE_MB_WARN = 200;
export const MIN_FREE_MB_BLOCK = 50;

// ── UI palette (high contrast, sunlight-readable) ────────────────
export const COLORS = {
  bg: '#FFFFFF',
  text: '#111318',
  textMuted: '#5B6470',
  primary: '#0B57D0',
  onDuty: '#0E8A3E',
  offDuty: '#5B6470',
  recording: '#D93025',
  warnBg: '#FDE293',
  warnText: '#5C4400',
  errorText: '#C5221F',
  cardBg: '#F4F6F8',
  border: '#D5DAE1',
};
