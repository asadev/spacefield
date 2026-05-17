# Pre-launch Scale-up — Capacity Checklist

> Confirm each tier and each ceiling before T-3. Revert to thrift mode
> at T+14 once the spike is over.

## Vercel

| Setting | Pre-launch | Launch-week | Post-launch |
|---|---|---|---|
| Plan | Hobby | **Pro** | Pro (keep) |
| Function regions | iad1 | iad1 + fra1 | iad1 + fra1 |
| Function maxDuration | 60s | **60s** | 60s |
| Bandwidth quota | 100GB | **1TB included** | watch usage |
| Function invocations | 100k/d | 1M/d (Pro) | watch usage |
| Concurrent builds | 1 | 6 | 1 (cost) |
| Cron schedule cap | daily (Hobby) | **flexible (Pro)** | flexible |

**Tipping-point criteria:**
- Function timeouts > 5/h → bump maxDuration to 90s, investigate the
  hot route.
- Bandwidth > 80% of monthly quota by day 4 → upgrade to Enterprise
  pricing call (not auto-upgrade — you'll get spike-billed).

## Supabase

| Setting | Pre-launch | Launch-week | Post-launch |
|---|---|---|---|
| Compute tier | Small | **Large (4 vCPU / 16GB)** | Medium |
| Read replica | none | **1 replica (same region)** | optional |
| PITR | 7 day | **14 day** | 7 day |
| Pooler mode | transaction | **transaction** | transaction |
| Max connections | 60 | **200** | 90 |
| Storage egress | included | **monitor** | watch |

**Tipping-point criteria:**
- Connection-pool saturation > 70% for 10 min → bump compute one tier.
- Replica lag > 10s sustained → see TABLETOP-DRILL.md Scenario 3.
- DB CPU > 80% for 15 min → bump compute one tier (5 min apply).

## Anthropic

| Setting | Pre-launch | Launch-week | Post-launch |
|---|---|---|---|
| Tier | Tier 1 | **Tier 2+ (request now)** | Tier 2 |
| Spend cap | $500/mo | **$5,000/mo** | $1,500/mo |
| Models | sonnet only | sonnet + haiku | sonnet + haiku |
| Fallback | none | **opus->sonnet->haiku** | sonnet->haiku |
| Cache enabled | yes | **yes** | yes |
| Cache TTL | 5 min | **5 min** | 5 min |

**Tipping-point criteria:**
- Cost burn > $200/day → check cache-hit-rate. Aim for >50%.
- 429 rate > 1% of requests → request Tier 3.
- Latency p95 > 8s → switch hot route to haiku.

## Rate-limit settings (Spacefield-side)

These live in `app/api/_rate-limit.ts` and runtime_config.

| Endpoint | Per-user limit | Per-IP limit | Window |
|---|---|---|---|
| `/api/ai/chat` | 60/min | 120/min | rolling |
| `/api/ai/run` | 30/min | 60/min | rolling |
| `/api/auth/*` | 10/min | 30/min | rolling |
| `/api/webhooks/*` | unlimited | unlimited | — |
| `/api/upload` | 20/min | 40/min | rolling |
| All other `/api/*` | 200/min | 600/min | rolling |

Tighten if abuse pattern emerges. Unauthenticated endpoints get
half the per-IP limit.

---

## Numbers to monitor (hourly during launch)

| Metric | Source | Green | Yellow | Red |
|---|---|---|---|---|
| Vercel function p95 | Vercel dashboard | <800ms | 800–2000ms | >2000ms |
| Vercel error rate | Sentry | <0.5% | 0.5–2% | >2% |
| Supabase CPU | Supabase | <60% | 60–80% | >80% |
| DB pool utilization | Supabase | <60% | 60–85% | >85% |
| Replica lag | Supabase | <2s | 2–10s | >10s |
| Anthropic 429 rate | own logs | <0.1% | 0.1–1% | >1% |
| AI cost/hour | own logs | <$10 | $10–30 | >$30 |
| Signup→activation % | own admin | >40% | 25–40% | <25% |

Numbers come from [KPI-DASHBOARD.md](./KPI-DASHBOARD.md).

---

## Revert checklist (T+14)

- [ ] Supabase compute → Medium
- [ ] Anthropic spend cap → $1,500
- [ ] Vercel build concurrency → 1
- [ ] Replica → keep if traffic stayed up, drop if not
- [ ] Document peak numbers from launch week in
      `memory/launch-2026-XX-XX.md`
