# Sync — Developer Guide (knowledge transfer)

Everything the code can't tell you: how it actually works, why it's built this
way, and the traps that already cost days of debugging. Read this before
changing anything.

For credentials and account transfer, see `../HANDOVER.md`.

---

## 1. What this is

**Sync** (formerly "Marico DSR" / "SalesBeat") — an Android app for Marico's
distributor sales reps (DSRs). The rep taps **Start My Day** once; from then on
the app detects when they arrive at an assigned outlet, records the sales
conversation automatically, and uploads the audio to S3. One manual action per
day, everything else is automatic.

- Expo SDK 57 / React Native 0.86 / TypeScript, **Android only**
- Scale: 2,392 DSRs, ~554k outlets
- Live and in pilot use

---

## 2. Three things the old docs get wrong

These will actively mislead you:

| Old claim | Reality |
|---|---|
| "Deploy the backend in `backend/`" | ❌ **There is no backend.** The Lambda was abandoned. The app signs S3 requests on-device. `backend/` is dead code — do not deploy it. |
| "Records in 2-minute AAC chunks" | ❌ **One audio file per visit.** Chunk rotation was removed (it churned recorder lifecycles and dropped audio). The class is still called `ChunkedRecorder` for historical reasons. |
| `API_MODE = 'mock'` means fake data | ❌ Misleading name. It means **"try the built-in dev accounts first, then fall back to real S3 data."** Real DSRs log in and get real outlets with this setting. Leave it alone. |

---

## 3. Architecture

```
GPS fixes ─→ GeofenceEngine ─→ onEnter ─→ start recorder + create visit
   (1/sec)     (pure TS)      └→ onExit ─→ stop, write manifest, queue upload
                                                          │
                              SQLite queue ─→ upload worker ─→ S3 (SigV4 signed
                              (survives restarts, backoff)      on-device)
```

**No server.** The app holds an AWS key and generates pre-signed S3 URLs itself
(`src/upload/s3Presign.ts`, pure-JS SigV4 using `js-sha256` so it bundles in RN
and ships over-the-air). This was a deliberate call: the pilot had no backend
and no time to build one.
→ *Consequence:* the key is embedded in the APK and extractable. It should be
rotated to a **write-only key scoped to the `marico-dsr/` prefix**.

### Key files
| Path | Role |
|---|---|
| `src/duty/dutyController.ts` | The singleton that runs a duty session and wires everything. Start here. |
| `src/geofence/engine.ts` | Pure-TS state machine (IDLE→CANDIDATE→ACTIVE→LEAVING). No I/O, fully unit-tested. |
| `src/recording/recorder.ts` | One AAC file per visit. Cold-start retry logic lives here. |
| `src/upload/s3Presign.ts` | Client-side SigV4. |
| `src/upload/worker.ts` | Persisted queue + retry backoff (30s→2m→5m→15m). |
| `src/config/liveConfig.ts` | Reads real DSRs + per-DSR outlets from S3. |
| `src/i18n/` | 4 languages. `strings.ts` is the source of truth (English). |
| `src/screens/DevToolsScreen.tsx` | Testing tools — **keep these working**, they're how the field issues get diagnosed. |

### Data in S3 (bucket `marico-ds-coconut-images`)
| Path | Contents |
|---|---|
| `sync/config/dsrs.json` | All DSRs (id, name, phone) — drives login |
| `sync/config/outlets/{dsr_id}.json` | **What the app downloads.** Per-DSR outlets **with `monday`…`sunday` beat-day flags** |
| `sync/config/outlets.json` | Combined ~554k source file (also has the day flags) |
| `marico-dsr/recordings/{dsr}/{date}/{outlet}/{visit}/` | `chunk_001.m4a` + `manifest.json` |
| `marico-dsr/logs/{dsr}/{date}/daylog.json` | Event log per day |

**Login:** dev accounts `1023`/`1234` and `1024`/`4321` are hardcoded (keep
them — all testing depends on them). Real DSRs: **PIN = last 4 digits of the
phone number** in `dsrs.json`.

---

## 4. Traps that already cost days

### 🔴 The `.easignore` / `.gitignore` interaction
`src/config/s3Config.ts` holds the real AWS key and is **git-ignored** (a live
key on GitHub gets auto-disabled by AWS). But **EAS Build respects `.gitignore`
when uploading your project** — so the build server stopped receiving the file
and every build failed at "Bundle JavaScript" with an unhelpful *Unknown error*.

`.easignore` exists to fix this: when present, EAS uses it **instead of**
`.gitignore`, and it deliberately omits the s3Config exclusion.
**Do not delete `.easignore`.**

### 🔴 Indoor GPS — the #1 source of "it's broken" reports
The geofence rejects fixes with accuracy worse than `ACCURACY_REJECT_M` (80 m).
Indoors without WiFi positioning, phones return ±500 m cell-tower guesses, so
**every fix is rejected, nearest-outlet shows "—", and recording never starts.**
Nothing is broken — the phone genuinely doesn't know where it is.

Mitigations already in place: duty uses fused **High** accuracy (GPS+WiFi+cell),
a **weak-signal banner** tells the user instead of failing silently, and
DevTools shows "Last fix accuracy". For desk testing use **Desk simulation mode**
in DevTools — never try to test the geofence indoors.

### 🔴 Recorder cold start
The first `recorder.start()` after app launch often fails (mic/audio focus not
ready). The original code retried but **created a second recorder without
releasing the first**, so the first still held the mic and the retry failed too
— the first visit of a session silently didn't record.
Now: up to 4 attempts, **releasing the dead recorder before each retry**, with a
timeout. Covered by `src/recording/recorder.test.ts`. Don't "simplify" it.

### 🔴 Recording must start before bookkeeping
In `startVisit()`, `recorder.start()` runs **before** the DB insert and event
log. Originally the DB write came first, and any hiccup there aborted the visit
before recording began *and* before the error handler ran — no recording, no
error message. Keep recording first; bookkeeping is best-effort.

### 🔴 Cross-DSR data leak
The duty controller is a singleton that outlives logout. Logging out of one DSR
and into another (without killing the app) showed the **previous DSR's outlets**.
Fixed with `dutyController.reset()` on both login and logout, plus clearing the
outlet cache on login. If you add per-DSR state, clear it in `reset()`.

### 🔴 Day-flag pipeline dependency
The OUTLETS tab filters by beat day and **defaults to today's weekday**. This
needs `monday`…`sunday` booleans on each outlet in the **per-DSR** files.
The client's pipeline originally wrote per-DSR files *without* them; all 2,392
files were regenerated from the combined file on 2026-07-16.
⚠️ **If their pipeline re-runs without the flags, day filtering silently falls
back to showing every outlet.** The real fix is one line in their export.

### 🟡 Android can't silently change settings
No app can flip permissions, battery whitelist, or OEM autostart on the user's
behalf — the OS forbids it. `src/permissions/autoSetup.ts` does the best legal
thing: fires the exact system dialog (one tap = Allow) and deep-links OEM
autostart screens. Also: on **Android 11+**, "Allow all the time" location
**cannot** be granted by a dialog — the user must pick it on the settings page.
That's why onboarding's location step is two-phase.

---

## 5. Releasing

| Change type | How | Reinstall? |
|---|---|---|
| JS/UI/logic/text | `eas update --channel preview --environment preview` | No — applies on next restart, or Settings → Check for Updates |
| Native (app name, icon, native module, permissions) | `eas build --platform android --profile preview` | Yes, new APK |

Bump `BUILD_LABEL` in `src/constants.ts` every release — that's how you confirm
on-device which version is actually running.

⚠️ **APK download links expire after ~30 days** on Expo's free plan. The build
record survives but the file is deleted and the link returns `NoSuchKey`.
Existing users are unaffected (they keep getting OTA updates), but **cut a fresh
build before distributing to anyone new.** A paid plan removes the expiry and
the (sometimes 45-minute) build queue.

---

## 6. Verify before you ship

```bash
npx tsc --noEmit                      # types
npx jest                              # 15 tests: geofence + recorder
npx expo export --platform android    # proves the JS bundle compiles — this is
                                      # the exact step EAS fails on, so run it
                                      # locally before burning a cloud build
```

Also check i18n key parity when you touch strings — every language must have
every key, with matching `{placeholders}`.

---

## 7. Open items

1. **Rotate the AWS key** → write-only, scoped to `marico-dsr/`. It's extractable from the APK.
2. **Per-DSR pipeline must keep day flags** (see above) — needs the client's data team.
3. **Geofence timings are test values**: `ENTER_CONFIRM_S`/`EXIT_CONFIRM_S` are 10s and radii 10 m. The PRD's production values are 30 s / 120 s. Revisit after field data.
4. **Phone numbers are stored in plain text** in `dsrs.json` (used for PINs). Consider hashing before wider rollout.
5. **Expo project sits on a personal account** (`chiragtalwar123`) — move to a Marico organisation so it survives people leaving.
6. `backend/` is dead code — delete it or clearly mark it abandoned.
