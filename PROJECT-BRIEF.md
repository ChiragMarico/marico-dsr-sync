# Sync — Project Brief & Forward Plan

Written 18 Aug 2026 as a handover so a fresh session can pick this up with full
context. Read `CLAUDE.md` first (it's shorter); this is the detail behind it.

---

## 1. Where we are today

**The mobile app works and is in pilot use.** It is a genuinely solid capture
client. Everything *downstream* of capture does not exist.

### Working
- Geofence auto-detects outlet arrival, records hands-free
- Audio + visit manifest upload to S3 with a retry queue surviving restarts
- Real login for 2,392 DSRs; 554,435 outlets with day-wise beat plans
- 4 languages (English/Hindi/Marathi/Telugu); one-tap Android permission setup
- Over-the-air updates — JS fixes ship without reinstalls

### Does not exist
- Any backend — no server, no API, no database
- Transcription, speaker separation, speaker identity
- Any analysis of what was said
- **Manager web dashboard** (confirmed requirement — the end deliverable)
- Monitoring — silent data loss is currently undetectable
- Retailer consent (only the DSR consents today)

---

## 2. Audit findings — what we got wrong

Evidence-based, from inspecting the live system. Ordered by severity.

| # | Finding | Evidence |
|---|---|---|
| 1 | **No backend, so nothing can process anything** | `LAMBDA_URL` is literally `"https://REPLACE-ME..."`; `API_MODE='mock'`; the app issues its own token `s3-${dsr_id}` |
| 2 | **AWS key in the APK reads the whole bucket** | Verified: 117 top-level folders readable, only 2 are ours. 115 belong to another team's ML dataset |
| 3 | **Zero observability** | Found 63 manifests, 0 audio files. Likely benign (app's "Delete all" only removes `.m4a`) — but nothing in the system could distinguish cleanup from a week of silent upload failure |
| 4 | **Retailer never consents** | Only the DSR agrees at onboarding. Under DPDP Act 2023 the recorded person's consent is what matters. Rollout blocker |
| 5 | **No speaker separation** | Mono track, nothing marks DSR vs retailer. All coaching metrics impossible |
| 6 | **Audio spec wrong for the job** | 44.1kHz/192kbps. ASR resamples to 16kHz — ~6× of the upload is discarded on arrival |
| 7 | **Data model has no content dimension** | Manifest has GPS/duration/flags. Nothing about what was said, outcome, or order value. No database at all |
| 8 | **Language coverage gap** | App supports 4 languages ≈ 75% of reps. ~590 reps unsupported |

### Language distribution (derived from outlet coordinates)

| Language | DSRs | Share | Supported? |
|---|---|---|---|
| Hindi (incl. Bhojpuri/Urdu belt) | 863 | 36.0% | Yes |
| Marathi | 683 | 28.5% | Yes |
| Telugu | 261 | 10.9% | Yes |
| **Bengali** | 148 | 6.2% | **No** |
| **Gujarati** | 97 | 4.1% | **No** |
| **Kannada** | 88 | 3.7% | **No** |
| **Odia** | 72 | 3.0% | **No** |
| Tamil/Assamese/Malayalam/Punjabi | 171 | 7.1% | **No** |

Adding Bengali + Gujarati + Kannada + Odia → ~92% coverage.
**Maharashtra alone is 28% of reps — the natural pilot geography.**

---

## 3. Target architecture

```
📱 App → 🧠 FastAPI → 🐘 Postgres          (live, fast, per-visit)
              │              │
              ├→ ☁️ Blob      │ nightly
              │              ▼
              │        ❄️ Snowflake  → joins to EXISTING sales data
              ▼
        📋 Queue → 🖥️ AI workers (self-hosted, open source)
                     ├ IndicConformer  → transcript
                     ├ pyannote        → speaker separation
                     ├ voiceprint      → which speaker is the DSR
                     ├ IndicTrans2     → Indic → English
                     └ Qwen2.5         → objections, products, outcome, score
                              │
                              ▼
                        👔 Web dashboard (manager-facing)
```

### Stack
| Layer | Choice | Why |
|---|---|---|
| API | **FastAPI** (Python) | Same language as the AI pipeline — one skill set, not two |
| DB | **PostgreSQL** | Free, enforces integrity, ~1ms queries. Snowflake is OLAP and would cost ~₹1.5L/mo as an app DB |
| Analytics | **Snowflake** (existing) | Where sales data already lives — the real value is the join |
| Storage | **Azure Blob** | 2 TB hot + 5 TB archive already purchased |
| Queue | Celery + Redis (or Azure Service Bus) | Slow AI work must never block the app |
| ASR | **AI4Bharat IndicConformer** | All 22 scheduled Indian languages. Whisper is weak on Assamese/Odia (~5% of reps) |
| Diarization | **pyannote.audio** | Open standard |
| Translation | **AI4Bharat IndicTrans2** | Indic → English for analysis + manager readability |
| LLM | **Qwen2.5-14B-Instruct** (Apache 2.0) | Self-hosted, strong multilingual, reliable structured output |
| Containers | Docker | Identical behaviour laptop → dev → prod |

### Key decisions and rationale
- **Self-hosted, not managed AI** — budget is the binding constraint. Managed
  ASR ≈ 8–10× the cost. Also keeps audio inside the tenant (helps DPDP).
- **T4 GPUs over A100** — ~$0.053/audio-hour vs ~$0.105. Price falls faster
  than throughput. Spot VMs cut this ~70% since transcription is
  interruption-tolerant batch work.
- **Postgres + Snowflake, not either/or** — till vs library.
- **Dual-channel capture** — the issued Bluetooth mic on the rep + phone mic on
  the room gives acoustic speaker separation *before* any model runs. Highest
  leverage idea available, no new hardware spend.
- **16 kHz mono audio** — not an optimisation. At 192 kbps the purchased 7 TB
  fills in ~3 weeks at national scale; at 16 kHz it lasts ~4.5 months.

---

## 4. Sizing and cost

Assumes 30 visits/rep/day at ~3 min ≈ **3,600 audio-hours/day** nationally.

| Stage | Audio/day | GPU | ASR cost/month |
|---|---|---|---|
| Pilot — 100 reps | ~150 hrs | 1× T4 | ~$400 |
| Regional — 500 reps | ~750 hrs | ~4× T4 | ~$1,500 |
| National — 2,392 reps | ~3,600 hrs | ~15× T4 | ~$5,700 (~$2,000 spot) |

Managed ASR at national scale would be ≈ $39,000/month.

**Storage** at 16 kHz ≈ 14.4 MB/audio-hour → ~52 GB/day national.
2 TB hot ≈ 39 days; 7 TB total ≈ 4.5 months. Retention policy needed from legal.

**Opportunity:** Marico has 7–8 existing Linux servers. Transcription is
overnight batch work. If ~4 servers have idle capacity 10pm–6am, a 50–100 rep
pilot may run at **zero additional cost** — then request GPU with real results
in hand. Inventory those servers first (read-only commands in section 7).

---

## 5. Phased plan

### Phase 0 — Foundation (weeks 1–4)
- FastAPI backend: auth, short-lived scoped upload URLs, data access
- Postgres schema + migrations
- Remove the embedded key from the app entirely
- Monitoring/reconciliation: expected vs received recordings per DSR per day
- Audio profile → 16 kHz mono
- Retailer consent flow + legal review
- **Gate:** every recording that starts is provably accounted for; app holds no secrets

### Phase 1 — Make audio readable (weeks 3–8)
- Async pipeline: queue → workers → transcript
- IndicConformer + pyannote + voiceprint enrolment (reuse the existing
  10-second onboarding clip)
- Field-test dual-channel Bluetooth capture vs software-only separation
- **Measured** accuracy baseline per language on real field audio
- **Gate:** a manager can read an accurate, speaker-labelled transcript

### Phase 2 — Extract meaning (weeks 7–12)
- Qwen extraction: products, objections, commitments, outcome
- Coaching signals: talk-ratio, pitch delivered, objection handled
- Compliance: was the scheme communicated correctly
- **Gate:** extraction agrees with human reviewers often enough to trust

### Phase 3 — Web dashboard (weeks 10–16)  ← the end deliverable
- Manager view: team, per-rep drill-down, transcript + audio playback
- Trends by geography, product, time
- Coaching loop: flag a moment, share with rep, track behaviour change
- Rep-facing view of their own visits (tool, not surveillance)
- **Gate:** an ASM changes what they coach because of what they saw

### Phase 4 — Scale economics (ongoing)
- GPU pool / spot instances
- Audio lifecycle + retention automation
- Fine-tune on Marico vocabulary: brands, schemes, trade terms

---

## 6. Open questions for Marico

| # | Question | Blocks | Owner |
|---|---|---|---|
| 1 | Dedicated Azure subscription or resource group? Which landing zone? | All provisioning | Marico IT |
| 2 | **How do DSRs authenticate?** They work for distributors, not Marico — no corporate Entra account. Recommendation: Entra External ID, phone + OTP | Auth, app, API | IT / Identity |
| 3 | Azure DevOps or GitHub Enterprise? Existing pipeline templates? | CI/CD | Marico IT |
| 4 | Retailer consent mechanism + voice retention period | Go-live | Legal / DPO |
| 5 | Can we read Snowflake directly? Who owns the DSR/outlet pipeline? | Master data | Data team |
| 6 | **Is per-visit sales outcome data available to join?** Highest-value integration — turns "what the rep said" into "what it earned" | Proving ROI | Sales systems |
| 7 | Network policy — private endpoints? Egress restrictions? | Network design | Security |
| 8 | GPU quota in an Indian region? Is Spot permitted? | Transcription | Marico IT |
| 9 | Specs + spare capacity of the 7–8 existing Linux servers | Pilot hosting | Infra team |

**Note:** the provisioning email currently in flight covers 3 CPU-only VMs
(D2as/D4as/D8as v5) for five *other* applications. Sync speech analytics is not
in that list and none of those machines can run the AI models at pilot volume.
It needs its own line item — don't block their approval, add to it.

---

## 7. Immediate next steps

Nothing here is blocked on Marico answers.

1. **Inventory the existing Linux servers** (read-only, zero risk):
   ```bash
   hostname; nproc; free -h; df -h /; uptime; lsb_release -d
   lspci | grep -i nvidia    # any GPU? probably blank
   ```
   Answers: can the pilot run on hardware Marico already owns?

2. **Benchmark IndicConformer** on real field recordings — the highest-value
   experiment. Tells us actual accuracy in noisy shops and whether CPU-only
   is viable.

3. **Audio profile → 16 kHz mono** in the app. Unblocks the storage budget.

4. **Add Bengali, Gujarati, Kannada, Odia** — pure translation work, ships
   over-the-air, reaches ~590 currently-unserved reps.

5. **Database schema + FastAPI skeleton** — heavily commented (the project
   owner is learning; code doubles as teaching material).

6. **Restructure to a monorepo** when the platform work starts:
   ```
   app/  backend/  workers/  dashboard/  infra/
   ```
   Currently the repo root *is* the mobile app.

---

## 8. Accounts and credentials

Values are NOT in this repo. See `../HANDOVER.md` and the password manager.

| Asset | Where |
|---|---|
| AWS key (current, to be retired) | `src/config/s3Config.ts` — gitignored, local only |
| Android signing keystore | Downloaded `.jks` + 3 secrets — **irreplaceable**, password manager |
| Expo account | `chiragtalwar123` — personal account, holds the keystore |
| GitHub | `ChiragMarico/marico-dsr-sync` (private) |
| App test login | DSR `1023` / PIN `1234` |
| Real DSR login | PIN = last 4 digits of registered phone |

⚠️ **Rotate the AWS key** — it's extractable from every distributed APK and
currently has bucket-wide read across another team's data.

---

## 9. Useful facts

- App: Expo SDK 57 / RN 0.86 / TypeScript. ~6,900 lines, 54 files, 100% TS.
- S3 bucket `marico-ds-coconut-images`, region `ap-south-1`, prefix `marico-dsr/`
- Config paths: `sync/config/dsrs.json`, `sync/config/outlets/{dsr_id}.json`
  (per-DSR files **must** carry `monday`…`sunday` flags — regenerated
  2026-07-16; if the client pipeline overwrites them without flags, day
  filtering silently breaks)
- Geofence: 10 m radius, 10 s confirm (test values; PRD production = 30s/120s)
- Test DSR `10150-3` (Aloke Kumar Pal), 265 outlets, West Bengal
