# Marico DSR — Field Voice Capture (Pilot v1)

Android app that auto-detects outlet arrivals via geofencing, records the sales
conversation in 2-minute AAC chunks, and uploads audio + a visit manifest to S3
— one manual action per day (Start Duty). Built with Expo SDK 57 / React Native
0.86, TypeScript. See `../PRD-marico-dsr-app.md` for the full spec.

## Run it

```bash
cd app
npm install
npx expo start        # press "s" for Expo Go on Phase-1 screens, but…
```

The duty/recording/geofence features use background location, a foreground
service, and native audio — these need a **dev client**, not Expo Go:

```bash
npx expo run:android            # local build (needs Android SDK + Java), OR
npx eas build -p android --profile development   # cloud build → install APK
```

The app ships in **mock mode** (`API_MODE: 'mock'` in `src/constants.ts`) — an
in-process fake of the Lambda, so everything runs on a device with no backend.

**Test login:** DSR `1023` / PIN `1234` (or `1024` / `4321`). Mock outlets are
clustered around Andheri East, Mumbai.

## Verify

```bash
npx tsc --noEmit      # types  (clean)
npx jest              # geofence state-machine unit tests (12 tests)
npx expo-doctor       # 20/20
```

## Testing geofence logic at a desk

The geofence engine (`src/geofence/engine.ts`) is pure TypeScript — feed it a
scripted sequence of fixes with timestamps and assert on enter/exit events.
`src/geofence/engine.test.ts` covers every transition (drive-by rejection,
enter/exit hysteresis, nearest-wins, no-overlap, accuracy reject, GPS gap,
per-outlet radius overrides, manual force enter/exit).

## Architecture (data flow)

```
location fixes → GeofenceEngine → onEnter → ChunkedRecorder + Visit + manifest
                                → onExit  → finalize manifest → SQLite queue
                                                              → upload worker → S3
```

- `src/duty/dutyController.ts` — the singleton that keeps everything alive on
  duty and wires the pieces. `src/duty/locationTask.ts` registers the
  background location task; the foreground service (expo-location) shows the
  persistent notification.
- `src/recording/` — chunked AAC recorder + manifest model.
- `src/upload/` — persisted SQLite queue + self-scheduling retry worker
  (backoff 30s→2m→5m→15m). Manifest uploads last per visit.
- `src/onboarding/` — permission wizard, per-OEM battery whitelist guides,
  BT pairing, 10-second test visit that round-trips to S3.

## Going live (when AWS is ready)

1. Deploy the backend in `../backend/` (see its README): `s3-setup.sh` then
   `lambda-deploy.sh`.
2. Paste the Function URL into `src/constants.ts` `LAMBDA_URL` and set
   `API_MODE: 'live'`.
3. Generate real config: `../backend/scripts/make-dsrs.mjs` and
   `outlets-from-excel.mjs`, upload to `s3://…/config/`.
4. Release build → `npx eas build -p android --profile preview` → host the APK
   under `apk/`, update `config/app-version.json`.

## Status vs PRD build order

Phases 1–7 are implemented. Everything runs today in mock mode; the only live
dependency is AWS (bucket + one Lambda), which swaps in via two constants.
