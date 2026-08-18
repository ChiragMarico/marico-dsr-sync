# Sync — Marico Field Voice Capture & Speech Analytics

> Auto-loaded context. **Read `START-HERE.md` first** — infrastructure, access
> and the immediate build order. Then `PROJECT-BRIEF.md` for full history.
> Expo specifics: `AGENTS.md`. Mobile app internals: `DEVELOPER-GUIDE.md`.

## What this is

**Sync** is an Android app for Marico's distributor sales reps (DSRs). It
geofences assigned outlets, auto-records the sales conversation on arrival, and
uploads audio to cloud storage. Live in pilot.

**Where it's going:** a full speech analytics platform — transcription, speaker
separation, AI insight extraction, and a **manager web dashboard**. That
platform does not exist yet. This repo currently contains only the mobile app.

Scale target: **2,392 DSRs, 554,435 outlets** across India.

## Infrastructure at Marico

- **ONE GPU server** (~48 GB VRAM) running **JupyterLab** for the data science
  team. **Everything we build runs here.** Deploy as containers alongside their
  Jupyter — never disturb it, always cap GPU memory
  (`--gpu-memory-utilization 0.30`).
- **Azure Blob** purchased: 2 TB hot + 5 TB archive
- **Snowflake** — already holds Marico sales data
- ~~devops5 (48 cores, no GPU)~~ — **dropped, not reliable. Do not plan around it.**

vLLM serves only transformer LLMs (Qwen, Whisper). pyannote, IndicConformer and
IndicTrans2 need their own container. See `START-HERE.md` section 4.

**Blocker:** `nvidia-smi` on the GPU server — we need ~20 GB free VRAM.
Get it via JupyterLab: `+` → Launcher → **Terminal** (no SSH needed).

## Database: Snowflake only — no Postgres

Decided. Snowflake is a warehouse, not an operational DB, so four rules apply
(detail in `START-HERE.md` §4):
1. Never put Snowflake in the rep's latency path — the app reads config JSON
   from Blob and caches locally, as it does today.
2. **Batch every write.** Never insert one row per visit.
3. **Enforce integrity in FastAPI** — Snowflake does not enforce keys. Use
   `MERGE` so retries cannot double-insert.
4. X-Small warehouse, 60s auto-suspend.

## Two workstreams

| | Status |
|---|---|
| **Mobile app** (this repo) | Live, v1.1.0 / build 8, app label v6.9. Needs security surgery. |
| **Platform** (backend, AI workers, web dashboard) | Greenfield. Not started. |

## Hard constraints — do not violate

1. **Zero per-use AI spend.** No Azure Speech, no OpenAI API, no per-minute/
   per-token services. Budget will not be approved. Everything self-hosted
   open source (IndicConformer, pyannote, IndicTrans2, Qwen).
2. **Azure only**, Indian regions only. Marico's estate is Azure + Snowflake.
   Data must not leave India (DPDP Act 2023).
3. **No credentials in the mobile app, ever.** The current embedded AWS key is
   a known security finding being removed, not a pattern to copy.
4. **Proper SDLC.** Environments, IaC, CI/CD, tests, code review. This will be
   reviewed by Marico IT/Security — it must withstand scrutiny.
5. **Never break the dev login** (`1023`/`1234`) or the Developer/Testing
   screen. All field diagnosis depends on them.

## Critical gotchas

- **`.easignore` must exist.** `.gitignore` excludes `src/config/s3Config.ts`
  (real AWS keys), but EAS Build respects `.gitignore` when uploading — so
  builds fail at "Bundle JavaScript" without `.easignore` overriding it.
- **`src/config/s3Config.ts` is NOT in the repo.** Copy
  `s3Config.example.ts` → `s3Config.ts` and fill in real values, or the app
  won't build. Real values are in the password manager.
- **`backend/` (outside this repo) is dead code.** A Lambda that was never
  deployed. Do not deploy it. The app is currently backend-less by design.
- **Never test the geofence indoors.** GPS accuracy indoors exceeds the 80 m
  reject threshold, so fixes are discarded and nothing records. Use **Desk
  simulation mode** in the Developer/Testing screen.
- **Recording must start before DB/logging** in `startVisit()`. Reordering
  this silently breaks the first recording of a session.
- **Recorder cold-start retry logic** in `recording/recorder.ts` releases the
  dead recorder before retrying. Don't "simplify" it — that was a real bug.
- **APK links expire ~30 days** on Expo free tier. Cut a fresh build before
  distributing to anyone new.

## Repo layout

```
src/duty/dutyController.ts   Session singleton — wires everything. Start here.
src/geofence/engine.ts       Pure TS state machine, fully unit-tested
src/recording/               One AAC file per visit (not chunks, despite name)
src/upload/                  Client-side SigV4 + persisted retry queue
src/config/liveConfig.ts     Reads DSRs + per-DSR outlets from S3
src/i18n/                    4 languages (en/hi/mr/te) — 4 more needed
src/screens/DevToolsScreen   Field diagnosis tools — keep working
```

## Verify before shipping

```bash
npx tsc --noEmit                      # types
npx jest                              # 15 tests (geofence + recorder)
npx expo export --platform android    # proves the JS bundle compiles;
                                      # this is the exact step EAS fails on
```

Also check i18n key parity when touching strings — every language needs every
key with matching `{placeholders}`.

## Release

| Change | Command | Reinstall? |
|---|---|---|
| JS / UI / text | `eas update --channel preview --environment preview` | No |
| Native (icon, name, modules, permissions) | `eas build -p android --profile preview` | Yes |

Bump `BUILD_LABEL` in `src/constants.ts` every release.

## Style

- TypeScript throughout, no `any` without cause. Zero-warning policy.
- Match surrounding code — comment density, naming, idiom.
- Comments explain **why**, not what.
