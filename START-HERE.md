# START HERE — Sync Speech Analytics

**Read this first on the Marico laptop.** It is the operational entry point:
where things stand, what infrastructure exists, and exactly what to do next.

| Doc | What's in it |
|---|---|
| **START-HERE.md** (this) | Infrastructure, access, immediate actions |
| `PROJECT-BRIEF.md` | Full context: audit findings, architecture, phased plan |
| `CLAUDE.md` | Auto-loaded by Claude Code — constraints and gotchas |
| `DEVELOPER-GUIDE.md` | Mobile app internals and traps |
| `../HANDOVER.md` | Credentials and account transfer |

---

## 1. One-paragraph status

The **mobile app is live** and captures audio reliably (v1.1.0 / build 8).
Everything downstream — transcription, speaker separation, insights, and the
**manager web dashboard** — does not exist yet. Marico has **Azure, Snowflake,
GPU nodes already running vLLM, and 7–8 Linux servers**. The task now is to
build the platform on that existing infrastructure, with **zero per-use AI
spend** (everything self-hosted open source).

---

## 2. Infrastructure — what we know

### Confirmed
| Item | Detail |
|---|---|
| **devops5** | `10.124.10.11` — **48 CPU cores**. GPU status TBD (`nvidia-smi` output not yet captured) |
| **GPU nodes** | 2 nodes, both with GPUs. One reported **48 GB VRAM** |
| **Already running** | **vLLM** (model serving) and **Jupyter** (data science experiments) |
| **Cloud** | Azure — Central India preferred. Blob storage purchased: **2 TB hot + 5 TB archive** |
| **Warehouse** | Snowflake — already holds Marico sales data |
| **Access** | SSH as `admchiragt@10.124.10.11`. From outside the corporate network requires **Zscaler ZPA** (ITSD ticket) |

### Being provisioned separately (NOT for us)
Three CPU-only VMs (`D2as/D4as/D8as v5`) for five other applications — voice
agent, coconut tagging, counterfeit detection, two internal apps. **Sync is not
in that list and those machines have no GPU.** Don't assume our workload fits
there.

### Still unknown — get these first
- `nvidia-smi` output: GPU model, total VRAM, **how much is free**
- Is vLLM running as a persistent server (`vllm serve`) or imported in notebooks?
- Who owns the GPU nodes / who approves deploying a container there
- Is usage constant, or idle overnight? (our transcription is overnight batch)

---

## 3. First commands to run

Once SSH works, run this and save the output — it answers most open questions:

```bash
echo "=== GPU ==="        ; nvidia-smi 2>&1 | head -20
echo "=== CPU ==="        ; nproc
echo "=== RAM ==="        ; free -h
echo "=== DISK ==="       ; df -h / /home 2>/dev/null
echo "=== OS ==="         ; cat /etc/os-release | head -2
echo "=== RUNNING ==="    ; ps aux | grep -iE 'vllm|jupyter' | grep -v grep | head
echo "=== TOOLING ==="    ; docker --version 2>&1; python3 --version 2>&1
echo "=== VLLM API? ===" ; curl -s -m 3 localhost:8000/v1/models 2>&1 | head -5
```

**Interpreting `nvidia-smi`:**
- A table showing a GPU name + memory → GPU exists, note free VRAM
- `command not found` → no GPU drivers, almost certainly no GPU
- `No devices were found` → drivers present, no GPU attached

---

## 4. What runs where

vLLM only serves **transformer language models**. Speech models need their own
container. Both share the same GPU — separate processes, no interference.

| Model | Job | vLLM? |
|---|---|---|
| Qwen2.5-14B | Insight extraction | ✅ yes |
| Whisper large-v3 | Speech-to-text | ✅ yes |
| Qwen3-ASR | Speech-to-text | ✅ yes |
| IndicConformer | Speech-to-text | ❌ own container |
| pyannote | Speaker separation | ❌ own container |
| IndicTrans2 | Indic → English | ❌ own container |

**Target deployment on the GPU node:**
```
🖥️  GPU NODE
     ├── 📓 Jupyter        ← their team (already there, leave alone)
     ├── ⚙️  vLLM           ← Qwen2.5 for insights        (we add)
     └── 🐍 Worker         ← pyannote / translation / ASR (we add)
```

### VRAM budget (48 GB card)
```
Qwen2.5-14B, 4-bit quantised     ~9 GB   ← quantise; ~29 GB at full precision
Whisper large-v3                 ~3 GB
IndicConformer                   ~1 GB
IndicTrans2 + pyannote           ~2 GB
KV cache                         ~5 GB
                                ───────
                                 ~20 GB  ← need this much free
```

### Open ASR decision
**Whisper on vLLM** keeps everything in the stack the team already runs —
simpler to operate, weaker on Assamese/Odia (~5% of reps).
**IndicConformer** covers all 22 scheduled languages but needs its own
container. Start with whichever is faster to stand up; the model name is a
config line, not an architectural commitment.

---

## 5. Capacity reality

Assumes 30 visits/rep/day × ~3 min.

| Scale | Audio/day | On a 48 GB GPU | On 48 CPU cores |
|---|---|---|---|
| 100 reps | ~150 hrs | ~5–8 hrs ✅ | ~8–12 hrs ✅ overnight |
| 300 reps | ~450 hrs | ~15–22 hrs ⚠️ | ✗ |
| 2,392 reps (national) | ~3,600 hrs | needs a pool | ✗ |

**A 100-rep pilot fits comfortably on existing hardware — GPU or even CPU-only.**

Storage at 16 kHz mono ≈ 14.4 MB per audio-hour → ~52 GB/day national.
2 TB hot ≈ 39 days, 7 TB total ≈ 4.5 months.
⚠️ At the app's **current** 192 kbps setting, 7 TB fills in ~3 weeks. The audio
profile change is what makes the purchased storage viable.

---

## 6. Build order

Items 1–4 need **no server access** — they can be written immediately.

| # | Task | Blocked on |
|---|---|---|
| 1 | Restructure to monorepo: `app/ backend/ workers/ dashboard/ infra/` | nothing |
| 2 | **Postgres schema + migrations** | nothing |
| 3 | **FastAPI backend** — auth, scoped upload URLs, visits API | nothing |
| 4 | **Worker container** — Dockerfile + pipeline code | nothing to write |
| 5 | Wire the app to the backend; **delete the embedded AWS key** | #3 |
| 6 | Deploy to the GPU node | access + approval |
| 7 | **Manager web dashboard** | #2, #3 |

> The repo root is currently the mobile app itself. Do #1 before adding
> backend code, or the tree becomes a mess.

---

## 7. Non-negotiable constraints

1. **Zero per-use AI spend** — no Azure Speech, no OpenAI API. Won't be approved.
2. **Azure + Indian regions only.** Data must not leave India (DPDP Act 2023).
3. **No credentials in the mobile app.** The embedded AWS key is a finding being
   removed, not a pattern to copy. It currently reads 115 other teams' folders.
4. **Proper SDLC** — environments, IaC, CI/CD, tests, review. Marico IT will
   review this; it must hold up.
5. **Never break** dev login `1023`/`1234` or the Developer/Testing screen.
6. **The project owner is learning.** Comment code so it teaches; explain the
   why, not just the what.

---

## 8. Blocked on Marico — chase in parallel

| # | Question | Blocks | Owner |
|---|---|---|---|
| 1 | **How do DSRs authenticate?** They work for distributors, not Marico — no corporate Entra account. Recommendation: Entra External ID, phone + OTP | auth, app, API | IT / Identity |
| 2 | Retailer consent mechanism + voice retention period | go-live | Legal / DPO |
| 3 | **Is per-visit sales outcome data available?** Highest-value integration — turns "what the rep said" into "what it earned" | proving ROI | Sales systems |
| 4 | Can we read Snowflake directly? Who owns the DSR/outlet pipeline? | master data | Data team |
| 5 | Approval to deploy a container on the GPU nodes | deployment | GPU node owner |
| 6 | Azure DevOps or GitHub Enterprise for CI/CD? | pipeline setup | Marico IT |

---

## 9. Gotchas that already cost days

- **`.easignore` must exist.** `.gitignore` hides `src/config/s3Config.ts`, but
  EAS Build respects `.gitignore` when uploading — builds fail at "Bundle
  JavaScript" without it.
- **`src/config/s3Config.ts` is not in the repo.** Copy from
  `s3Config.example.ts`; real values in the password manager. The app won't
  build without it.
- **Never test the geofence indoors** — GPS accuracy exceeds the 80 m reject
  threshold, so nothing records. Use Desk simulation mode in Developer/Testing.
- **Recording must start before DB writes** in `startVisit()`. Reordering
  silently breaks the first recording of every session.
- **Per-DSR outlet files must carry `monday`…`sunday` flags.** Regenerated
  2026-07-16. If the client pipeline overwrites them without flags, day
  filtering silently falls back to showing everything.
- **APK links expire ~30 days** on Expo free tier.

---

## 10. Immediate next action

1. Get SSH working (Zscaler ZPA ticket if outside the corporate network)
2. Run the command block in section 3, save the output
3. Ask the GPU node owner for approval to run a container
4. Meanwhile start build items 1–3 — none are blocked

**Suggested first prompt to Claude Code on the Marico laptop:**

> Read START-HERE.md and PROJECT-BRIEF.md. Then start with build item 1 and 2 —
> restructure to the monorepo and write the Postgres schema. Comment it heavily,
> I'm learning as we go.
