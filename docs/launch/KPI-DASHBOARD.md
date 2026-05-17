# Launch-week KPI Dashboard

> The five numbers we watch hourly during launch. Each has a defined
> source + a target band + an alert threshold.

Lives in admin at `/admin/insights` and is pinned in `#metrics`.

---

## 1. Signup rate (per hour)

**Definition:** count of new rows in `auth.users` per rolling 60 min,
where `created_at >= now() - interval '1 hour'`.

**Where it comes from:**
- URL: `https://spacefield.co/admin/insights?metric=signups`
- SQL:
  ```sql
  select date_trunc('hour', created_at) as h, count(*) as signups
  from auth.users
  where created_at > now() - interval '24 hours'
  group by 1 order by 1 desc;
  ```

**Target bands (launch day):**
| Band | /hour |
|---|---|
| Excellent | >50 |
| Good | 20–50 |
| Watch | 5–20 |
| Investigate | <5 (after T+1h) |

---

## 2. Activation rate

**Definition:** % of signups in the last 24h who completed
**any one** of: created first deal, ran AI assistant once, generated
output from any tool.

**Where it comes from:**
- URL: `/admin/insights?metric=activation`
- SQL:
  ```sql
  with cohort as (
    select id from auth.users where created_at > now() - interval '24h'
  ),
  activated as (
    select distinct u.user_id from activation_events u
    where u.user_id in (select id from cohort)
      and u.event in ('deal_created','ai_chat','tool_output')
  )
  select
    (select count(*) from activated)::float
    / nullif((select count(*) from cohort), 0) * 100 as pct;
  ```

**Target bands:**
| Band | % |
|---|---|
| Excellent | >50% |
| Good | 35–50% |
| Watch | 20–35% |
| Investigate | <20% |

If <20% — onboarding flow is broken or unclear. Live-fix is usually
copy or step-skip — see [BUG-FREEZE.md](./BUG-FREEZE.md) for what's
fair game.

---

## 3. Error rate

**Definition:** Sentry events / total Vercel function invocations,
last 5 min, rolling.

**Where it comes from:**
- Sentry dashboard: `Issues → Filter: launch-2026 release`
- Vercel: `Functions tab → Total invocations (5 min)`
- Combined: `/admin/insights?metric=errors`
- SQL (own logs, fallback):
  ```sql
  select
    sum(case when status_code >= 500 then 1 else 0 end)::float
    / nullif(count(*), 0) * 100 as error_pct
  from request_log
  where timestamp > now() - interval '5 minutes';
  ```

**Target bands:**
| Band | % |
|---|---|
| Excellent | <0.5% |
| Good | 0.5–1% |
| Watch | 1–2% |
| Investigate | 2–5% |
| Rollback consideration | >5% |

---

## 4. AI cost rate

**Definition:** Anthropic spend per hour, US dollars, sliding window.

**Where it comes from:**
- Anthropic console: `Usage → Past 24h`
- Internal mirror: `/admin/insights?metric=ai-cost`
- SQL (our token-log table):
  ```sql
  select
    date_trunc('hour', ts) as h,
    sum(input_tokens * 3 / 1e6 + output_tokens * 15 / 1e6) as usd
  from ai_request_log
  where ts > now() - interval '24h'
  group by 1 order by 1 desc;
  ```
  (Numbers above use Sonnet pricing. Swap rates if model mix changes.)

**Target bands (launch day):**
| Band | $/hour |
|---|---|
| Excellent | <$10 |
| Good | $10–25 |
| Watch | $25–50 |
| Investigate | >$50 |

If $50+/h sustained: check cache-hit rate; if <40% there's a
prompt-cache bug. If cache fine, switch hot routes to Haiku
via runtime_config.

---

## 5. Support ticket rate

**Definition:** new tickets / new signups in the last hour.

**Where it comes from:**
- Support inbox: Gmail labels `launch-2026`
- Mirror: `/admin/insights?metric=support`
- SQL (our `support_tickets` table):
  ```sql
  with signups as (
    select count(*) from auth.users
    where created_at > now() - interval '1 hour'
  ),
  tix as (
    select count(*) from support_tickets
    where created_at > now() - interval '1 hour'
  )
  select tix.count::float / nullif(signups.count, 0) as ratio
  from signups, tix;
  ```

**Target bands:**
| Band | tickets / signup |
|---|---|
| Excellent | <0.05 (5%) |
| Good | 0.05–0.10 |
| Watch | 0.10–0.20 |
| Investigate | >0.20 |

>20% means signups are hitting a wall. Read the inbox top-5
tickets — they'll point at the same broken thing.

---

## Hourly snapshot template

Posted to `#metrics` every hour during launch:

```
T+{n}h snapshot
- Signups (last 1h): {n}
- Activation (last 24h cohort): {n}%
- Error rate (last 5m): {n}%
- AI cost (last 1h): ${n}
- Support tickets (last 1h): {n}  (ratio: {n}%)
Status: {green | yellow | red — one-liner why}
```

Auto-post script lives at `scripts/post-kpi-snapshot.ts` — runs on
cron every hour T+0 to T+72.
