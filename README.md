# Sync — Field Voice Capture (Marico DSR)

Android app for Marico distributor sales reps. The rep taps **Start My Day**
once; the app then geofences their assigned outlets, records the conversation
automatically on arrival, and uploads the audio to S3. Expo SDK 57 / React
Native 0.86 / TypeScript, Android only.

> 📖 **New here? Read [`DEVELOPER-GUIDE.md`](./DEVELOPER-GUIDE.md) first.**
> It covers the architecture, the non-obvious decisions, and the traps that
> already cost days of debugging. Credentials/handover: [`../HANDOVER.md`](../HANDOVER.md).

## Run it

```bash
cd app
npm install
```

Duty/recording/geofence need background location, a foreground service and
native audio — so they require a **dev client**, not Expo Go:

```bash
npx expo run:android                              # local (needs Android SDK + Java)
npx eas build -p android --profile development    # or cloud build → install APK
```

**Test login:** DSR `1023` / PIN `1234` (or `1024` / `4321`).
**Real DSRs:** PIN = last 4 digits of their registered phone number.

⚠️ Don't test the geofence indoors — GPS accuracy indoors is too poor and fixes
get rejected. Use **Desk simulation mode** in the Developer/Testing screen.

## Verify

```bash
npx tsc --noEmit                      # types
npx jest                              # 15 tests (geofence + recorder)
npx expo export --platform android    # proves the JS bundle compiles
```

## Release

| Change | Command | Reinstall? |
|---|---|---|
| JS / UI / text | `eas update --channel preview --environment preview` | No |
| Native (icon, name, native module, permissions) | `eas build -p android --profile preview` | Yes |

Bump `BUILD_LABEL` in `src/constants.ts` each release so you can confirm on-device
what's running. Note: **APK links expire after ~30 days** on Expo's free plan.

## Architecture in one diagram

```
GPS fixes → GeofenceEngine → onEnter → recorder + visit + manifest
   (1/sec)    (pure TS)     → onExit  → finalize → SQLite queue → S3
```

There is **no backend** — the app signs S3 requests on-device (client-side
SigV4). The `../backend/` folder is abandoned; do not deploy it.

- `src/duty/dutyController.ts` — session singleton, wires everything (start here)
- `src/geofence/engine.ts` — pure state machine, fully unit-tested
- `src/recording/` — one AAC file per visit (not chunks, despite the class name)
- `src/upload/` — SigV4 presigning + persisted retry queue
- `src/i18n/` — English / Hindi / Marathi / Telugu
- `src/screens/DevToolsScreen.tsx` — field-diagnosis tools; keep them working
