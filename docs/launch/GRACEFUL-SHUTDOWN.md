# Graceful Shutdown — Vercel Functions

> What happens to in-flight requests during a deploy. How long-running
> streams handle SIGTERM. How background jobs survive a deploy. The
> defaults are mostly right; this doc records what they are and where
> they bite.

## The basic Vercel deploy model

When a new deploy goes live:

1. Vercel builds the new bundle.
2. Once build passes, traffic flips to the new deployment at the
   edge — **per request**. No long bleed window.
3. The previous deployment's containers continue serving any
   requests that were already routed to them.
4. Those containers stop accepting new requests but keep running
   until in-flight requests finish OR the function timeout
   (`maxDuration`) is hit.
5. After all in-flight requests complete (or timeout), the old
   containers are recycled.

There is no separate "drain timeout" knob on Vercel functions —
the in-flight window is bounded by `maxDuration` per function
(default 10s, our launch-week setting **60s** — see
[SCALE-UP-CAPACITY.md](./SCALE-UP-CAPACITY.md)).

## Implications for in-flight requests

### Standard HTTP request
- The request completes on the old code, response returned.
- Next request from the same client hits the new code.
- **Risk:** session/cookie schema changes between deploys can
  leave a client with a cookie set by the old code that the new
  code can't read.
- **Mitigation:** never break the cookie format in a single
  deploy — additive changes only, with a two-deploy rollover.

### Streaming response (AI assistant)
- The stream completes on the old code.
- If the response is a Server-Sent Event or chunked transfer, the
  connection stays open until the old code finishes streaming.
- **Risk:** stream pinned to a function approaching `maxDuration`
  will be cut mid-stream.
- **Mitigation:** in the AI handler, set a soft timeout at
  `maxDuration - 5s` and end the stream cleanly. Surface a "stream
  ended due to deploy, please retry" hint to the client.
- Code: `app/api/ai/chat/route.ts` — `STREAM_SOFT_TIMEOUT_MS` env.

### WebSocket / SSE long-lived connections
- Vercel does not have native WebSocket support for serverless
  functions. We don't use them.
- For SSE: the connection is held by the function container. It
  must close before container recycle. We cap our longest SSE at
  120s (still within `maxDuration` of 60s? No — SSE channels run
  on Vercel Edge functions which have a different cap. Confirm
  per route.)

## SIGTERM behaviour

Vercel sends `SIGTERM` to a function container that's been told to
shut down. Node 20 will:

1. Receive `SIGTERM`.
2. Continue running in-flight handlers.
3. After in-flight handlers complete, exit cleanly.

If a handler ignores SIGTERM and runs forever — Vercel sends
`SIGKILL` at `maxDuration` and the request is terminated abruptly.
**This is why `maxDuration` is also our worst-case "how long does a
deploy take to drain" number.**

## Background jobs (cron + queued)

### Vercel cron
- Cron jobs are dispatched as ordinary HTTP requests to function
  routes. They are NOT separately long-lived processes.
- A cron firing **during** a deploy may hit either old or new code,
  depending on edge routing. Both must be tolerant.
- **Risk:** a cron starts on old code, midway a deploy completes,
  the cron continues on old code until done. If the cron writes to
  a schema-changed table, the write may be incompatible.
- **Mitigation:** crons use only additive schema. Crons are
  idempotent — see code at `app/api/cron/*`.

### Queued jobs (Supabase pg_cron + work tables)
- We use a "claim and run" pattern: a worker pulls one row from a
  jobs table, marks it `running`, runs, marks it `done` or `failed`.
- A worker that's mid-job during a deploy: the worker function hits
  `maxDuration` (60s) and Vercel sends SIGKILL. The row stays in
  `running` state.
- **Mitigation:** rows in `running` for > 5 min are reclaimed by a
  separate sweeper cron and set back to `pending` for retry.
- Code: `app/api/cron/job-sweeper/route.ts`.

## Long-running AI agent runs

Agent runs that can exceed 60s are not safe to run inside a single
Vercel function. We split them into:

1. **Dispatcher** — fast (≤2s) route that records the run intent in
   `agent_runs` table, returns immediately with a run ID.
2. **Worker tick** — runs every 30s on cron, picks up pending runs,
   advances them one step at a time, persists state to the
   `agent_runs` table.
3. **Client poll** — UI polls or subscribes to the row via Supabase
   Realtime, shows progress.

This survives any number of deploys: state lives in the DB, not in
function memory.

Code: `app/api/agent/dispatch/route.ts` + `app/api/cron/agent-tick/route.ts`.

## Deploy-time checklist

Before merging anything during launch week, confirm:

- [ ] No breaking change to cookie/session format.
- [ ] No breaking change to a schema column read by a cron.
- [ ] No new long-running synchronous endpoint > 30s.
- [ ] If touching `agent_runs` schema: deploy in two steps (add
      columns first, ship code that reads them next deploy).
- [ ] Streaming AI route still has the soft-timeout guard.

## Failure modes during a deploy

| Symptom | Likely cause | Fix |
|---|---|---|
| 503 spike for 30s after deploy | Old containers fully drained, new ones cold-starting | Pre-warm via cron-ping pattern; tolerable |
| AI streams cut mid-token | Stream exceeded `maxDuration` | Increase soft-timeout buffer; client auto-retry |
| Some users see old UI for minutes | CDN cache TTL on HTML | Set `Cache-Control: no-store` on `/` HTML |
| Cron job ran twice | Edge routing inconsistency at deploy boundary | Crons must be idempotent (they are) |
| `running` jobs stuck after deploy | SIGKILL mid-job, sweeper hasn't run | Sweeper cron is 1-min interval; will recover |

## What we do NOT have today

- No blue-green deploy with explicit drain window. Vercel doesn't
  expose one.
- No per-function explicit drain timeout. We use `maxDuration` as
  the effective drain cap.
- No "stop accepting new connections, finish in-flight, then
  redeploy" workflow. Vercel handles this implicitly.

If we ever need explicit control (regulated workload, very long
jobs), the path is: move that subsystem off Vercel functions onto
a dedicated container service (Fly.io or Railway), keep web on
Vercel.
