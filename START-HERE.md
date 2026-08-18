# START HERE — Sync Speech Analytics

**The single source of truth.** Read this first; it supersedes anything that
conflicts with it elsewhere.

| Doc | Purpose |
|---|---|
| **START-HERE.md** (this) | Architecture, infrastructure, build order — start here |
| `PROJECT-BRIEF.md` | Background: audit findings, history, phased plan |
| `CLAUDE.md` | Auto-loaded by Claude Code — constraints and gotchas |
| `DEVELOPER-GUIDE.md` | Mobile app internals and traps |
| `../HANDOVER.md` | Credentials and account transfer |

---

## 1. Status in one paragraph

The **mobile app is live** and captures audio reliably (v1.1.0 / build 8, label
v6.9). Everything downstream — transcription, speaker separation, insights, and
the **manager web dashboard** — does not exist. Marico has **one GPU server**
(running JupyterLab, with vLLM already proven working on it), **Azure Blob**
storage purchased, and **Snowflake**. The job now is to build the platform on
that hardware with **zero per-use AI spend** — every model self-hosted and open
source.

---

## 2. Infrastructure

### The one machine that matters
| | |
|---|---|
| **GPU server** | The **only** GPU box. ~48 GB VRAM. Accessed via a JupyterLab web link (`ai-marico-app.biz...`) |
| **Already working** | A teammate runs **vLLM inside JupyterLab** to host a model — so NVIDIA drivers, CUDA and vLLM are **all installed and proven** on this box |
| **Storage** | Azure Blob purchased: **2 TB hot + 5 TB archive** |
| **Database** | **Snowflake** — already holds Marico sales data |
| ~~devops5~~ | ~~10.124.10.11, 48 cores, no GPU~~ — **dropped, not reliable. Do not plan around it.** |

### You do not need SSH to start
**JupyterLab has a built-in terminal.** Open the JupyterLab link → click `+`
(Launcher) → scroll down → **Terminal**. That is a real shell on the GPU server.

**First thing to run there:**
```bash
nvidia-smi          # GPU model, total VRAM, FREE VRAM, what's loaded
docker --version    # can we deploy containers, or only notebooks?
free -h; nproc; df -h /
```
Free VRAM is the last real unknown. We need roughly **20 GB**.

---

## 3. Architecture

```
📱 Mobile app
     │  reads config JSON  ──────────────▶ ☁️  Azure Blob
     │  writes visits + audio ──▶ 🧠 FastAPI
                                    │
                                    ├──▶ ☁️  Blob (audio files)
                                    ├──▶ 📋 Redis queue
                                    └──▶ ❄️  Snowflake (batched writes)
                                              ▲
🖥️  GPU SERVER                                 │
     ├── 📓 JupyterLab   ← their team, leave alone
     ├── ⚙️  vLLM         ← Qwen2.5 (insights), VRAM-capped
     └── 🐍 Worker       ← Whisper / pyannote / IndicTrans2
              │                                │
              └── pulls from queue ────────────┘
                    writes results

👔 Manager dashboard ──▶ 🧠 FastAPI ──▶ ❄️ Snowflake
```

### Stack
| Layer | Choice | Notes |
|---|---|---|
| API | **FastAPI** (Python) | Same language as the AI pipeline — one skill set |
| Database | **Snowflake only** | No Postgres. See §4 for the adaptations this requires |
| Storage | **Azure Blob** | Audio files; 2 TB hot + 5 TB archive |
| Queue | **Redis** | A queue, not a database — job list for the workers |
| ASR | **Whisper large-v3** on vLLM | Simplest: uses the stack already running. IndicConformer is the fallback if Indic accuracy disappoints |
| Diarization | **pyannote.audio** | Own container |
| Translation | **IndicTrans2** | Own container. Indic → English |
| Insights | **Qwen2.5-14B-Instruct**, 4-bit | On vLLM. Apache 2.0 |
| Containers | **Docker** | Identical behaviour everywhere |
| Dashboard | React/Next.js | Phase 3 deliverable |

---

## 4. Snowflake as the only database — how to make it work

Snowflake is a **warehouse**, not an operational database. Used naively as an
app backend it is slow and expensive. These four rules avoid all of that.

**Rule 1 — Never put Snowflake in the rep's latency path.**
The mobile app reads its config (DSRs, outlets, beat days) from **JSON in Blob**,
exactly as it does today, and caches locally. The app never waits on Snowflake.

**Rule 2 — Batch every write.**
Do NOT insert one row per visit. Buffer in the API and flush every N rows or
N seconds (or use Snowpipe Streaming). Per-row inserts are Snowflake's worst
case; batched loads are its best.

**Rule 3 — Enforce data rules in FastAPI.**
Snowflake accepts primary and foreign keys as *documentation only* — it does not
enforce them. So the API must guarantee: the outlet belongs to that DSR, the
visit ID is unique, no duplicate recordings. Use `MERGE` for idempotent writes
so a retry can never double-insert.

**Rule 4 — Keep the warehouse small and auto-suspending.**
An **X-Small** warehouse with a 60-second auto-suspend. Because writes are
batched and the app never queries live, the warehouse stays asleep most of the
day. Dashboard queries wake it briefly. Snowflake also caches identical query
results for 24 hours at no compute cost — the dashboard benefits automatically.

### Accepted trade-offs
- Visit rows appear in Snowflake **seconds to minutes** after the event, not
  instantly. Fine — nothing depends on real-time.
- Dashboard queries take **1–3 seconds**. Acceptable for analytics.
- **Integrity is the API's job.** If the API is sloppy, bad data gets in
  silently. Tests around the write path matter more than usual.

### Tables
```
DSR         (dsr_id, name, phone_hash, distributor_id, territory, language)
OUTLET      (outlet_id, name, lat, lng, dsr_id, beat_days)
VISIT       (visit_id, dsr_id, outlet_id, entered_at, exited_at,
             matched_distance_m, device, flags, status)
RECORDING   (recording_id, visit_id, blob_uri, duration_s, sample_rate,
             sha256, uploaded_at, verified_at)     <- reconciliation lives here
TRANSCRIPT  (transcript_id, recording_id, language, engine, engine_version,
             confidence, full_text, english_text, processed_at)
UTTERANCE   (utterance_id, transcript_id, speaker_role, start_ms, end_ms,
             text, confidence)
INSIGHT     (insight_id, visit_id, schema_version, products, objections,
             commitments, outcome, call_score, model, model_version, created_at)
```
`engine_version` / `model_version` are deliberate: when a model changes,
historical results must stay explainable and re-runnable.

**Reconciliation (do not skip):** a `VISIT` row is written when recording
*starts*, not when audio arrives. A scheduled job compares expected vs received
and alerts on gaps. This is what makes silent data loss impossible — the current
system cannot tell "user deleted it" from "uploads broke a week ago".

---

## 5. What vLLM can and cannot serve

vLLM only serves **transformer language models**. Speech models need their own
container. Both share the GPU as separate processes.

| Model | Job | vLLM? |
|---|---|---|
| Qwen2.5-14B | Insights | ✅ |
| Whisper large-v3 | Speech-to-text | ✅ |
| Qwen3-ASR | Speech-to-text | ✅ |
| IndicConformer | Speech-to-text | ❌ own container |
| pyannote | Speaker separation | ❌ own container |
| IndicTrans2 | Translation | ❌ own container |

### VRAM budget (48 GB card)
```
Qwen2.5-14B, 4-bit quantised   ~9 GB    <- quantise; ~29 GB at full precision
Whisper large-v3               ~3 GB
pyannote + IndicTrans2         ~3 GB
KV cache / working memory      ~5 GB
                              ───────
                               ~20 GB   <- what we need free
```

**Always cap GPU memory.** Their JupyterLab work must never be starved:
```bash
docker run --gpus all vllm/vllm-openai \
  --model Qwen/Qwen2.5-14B-Instruct-AWQ \
  --gpu-memory-utilization 0.30
```

**If VRAM is tight**, in order: Qwen2.5-7B instead of 14B (9 GB → 5 GB),
Whisper medium instead of large-v3, or load models in stages. None block a pilot.

---

## 6. Capacity

Assumes 30 visits/rep/day at ~3 minutes.

| Scale | Audio/day | On the 48 GB GPU |
|---|---|---|
| **100 reps** | ~150 hrs | **~4–8 hrs ✅ comfortably overnight** |
| 300 reps | ~450 hrs | ~12–22 hrs ⚠️ tight |
| 2,392 (national) | ~3,600 hrs | ✗ needs a GPU pool |

**Storage:** at 16 kHz mono ≈ 14.4 MB per audio-hour → ~52 GB/day national.
2 TB hot ≈ 39 days; 7 TB total ≈ 4.5 months.
⚠️ At the app's **current** 192 kbps, 7 TB fills in ~3 weeks. The audio profile
change is what makes the purchased storage viable.

⚠️ **Single point of failure.** One GPU server, shared with the data science
team. Agree a VRAM budget with its owner and always run capped.

---

## 7. Two paths — do both, in order

**Path A — Start inside JupyterLab (this week, no permissions needed)**
Exactly how the teammate already runs vLLM. Load Whisper in a notebook, transcribe
20 real recordings, look at the output.
- ✅ Nothing to request, running the same afternoon
- ✅ Produces real transcripts to show people
- ❌ Dies with the session — not production

**Path B — Proper containers (needs owner approval)**
Deploy vLLM + worker as Docker containers that survive reboots and expose an API.
- ✅ Reliable, restartable, callable by the pipeline
- ❌ Needs container permissions on a shared box

**Use A's working result as the justification for B.** Far easier than asking
for privileges on a shared GPU with nothing to show.

---

## 8. Build order

Items 1–4 need **no server access** — start immediately.

| # | Task | Blocked on |
|---|---|---|
| 1 | Restructure to monorepo: `app/ backend/ workers/ dashboard/ infra/` | nothing |
| 2 | **Snowflake schema + migration scripts** | nothing |
| 3 | **FastAPI backend** — auth, scoped upload URLs, batched Snowflake writes | nothing |
| 4 | **Worker container** — Dockerfile + pipeline code | nothing to write |
| 5 | Wire the app to the backend; **delete the embedded AWS key** | #3 |
| 6 | Deploy to the GPU server | access + approval |
| 7 | **Manager web dashboard** | #2, #3 |

> The repo root is currently the mobile app itself. Do #1 before adding backend
> code or the tree becomes a mess.

---

## 9. Constraints — non-negotiable

1. **Zero per-use AI spend.** No Azure Speech, no OpenAI API. Won't be approved.
2. **Azure + Indian regions only.** Data must not leave India (DPDP Act 2023).
3. **No credentials in the mobile app.** The embedded AWS key is a finding being
   removed, not a pattern to copy — it currently reads 115 other teams' folders.
4. **Snowflake is the only database.** No Postgres. Follow the four rules in §4.
5. **Proper SDLC** — environments, IaC, CI/CD, tests, review. Marico IT will
   review this; it must hold up.
6. **Never break** dev login `1023`/`1234` or the Developer/Testing screen.
7. **Never disturb JupyterLab** on the GPU server. Always cap GPU memory.
8. **The project owner is learning.** Comment code so it teaches — explain the
   why, not just the what.

---

## 10. Blocked on Marico — chase in parallel

| # | Question | Blocks | Owner |
|---|---|---|---|
| 1 | **How do DSRs authenticate?** They work for distributors, not Marico — no corporate Entra account. Recommendation: Entra External ID, phone + OTP | auth, app, API | IT / Identity |
| 2 | Approval to run containers on the GPU server + an agreed VRAM budget | deployment | GPU server owner |
| 3 | Snowflake access: which account/warehouse/database may we write to? | all data work | Data team |
| 4 | Retailer consent mechanism + voice retention period | go-live | Legal / DPO |
| 5 | **Is per-visit sales outcome data available to join?** Highest-value integration — turns "what the rep said" into "what it earned" | proving ROI | Sales systems |
| 6 | Azure DevOps or GitHub Enterprise for CI/CD? | pipeline setup | Marico IT |

---

## 11. Gotchas that already cost days

- **`.easignore` must exist.** `.gitignore` hides `src/config/s3Config.ts`, but
  EAS Build respects `.gitignore` when uploading — builds fail at "Bundle
  JavaScript" without it.
- **`src/config/s3Config.ts` is not in the repo.** Copy from
  `s3Config.example.ts`; real values in the password manager. App won't build
  without it.
- **Never test the geofence indoors** — GPS accuracy exceeds the 80 m reject
  threshold, so nothing records. Use Desk simulation mode in Developer/Testing.
- **Recording must start before DB writes** in `startVisit()`. Reordering
  silently breaks the first recording of every session.
- **Per-DSR outlet files must carry `monday`…`sunday` flags.** Regenerated
  2026-07-16. If the client pipeline overwrites them without flags, day
  filtering silently falls back to showing everything.
- **APK links expire ~30 days** on Expo free tier.
- **Language coverage:** app has 4 languages ≈ 75% of reps. Bengali (6.2%),
  Gujarati (4.1%), Kannada (3.7%) and Odia (3.0%) are missing — adding them
  reaches ~92%.

---

## 12. Do this first

1. Open JupyterLab → `+` → **Terminal** → run `nvidia-smi`, save the output
2. Ask the GPU server owner for a VRAM budget and container permission
3. Start build items 1–3 — none are blocked

**First prompt for Claude Code on the Marico laptop:**

> Read START-HERE.md. Start with build items 1 and 2 — restructure to the
> monorepo and write the Snowflake schema with batched-write helpers. Comment it
> heavily, I'm learning as we go.
