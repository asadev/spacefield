# N+1 Audit — 2026-05-15

Quick audit of `app/api/**` and `app/**/page.tsx` for the classic N+1 shape: one query per row of a parent list. This is a findings doc — nothing here is fixed by this PR.

Method: ripgrep for `.map(async ` and "loop containing `await supabase.from(...).select(...)`", then read the surrounding 20–30 lines for context. Severity uses the row-fanout bound (small N admin pages = low; user-facing surfaces or unbounded N = higher).

## Findings

### 1. `app/admin/storage/page.tsx:108` — per-workspace storage RPC fan-out
```ts
Promise.all(
  topUsageIds.map(async (id) => {
    const r = await admin.rpc("workspace_storage", { ws_id: id });
    ...
  })
)
```
- Severity: **medium**. Admin-only, but `topUsageIds` is the top-N (50) workspaces by usage. 50 round-trips per page render.
- Fix: rewrite `workspace_storage` RPC to accept `ws_ids uuid[]` and return one row per workspace, then call once with the whole list.

### 2. `app/api/tools/availability/route.ts:60` — per-slug tool-availability RPC fan-out
```ts
const results = await Promise.all(
  trimmed.map(async (slug) => {
    const { data, error } = await supabase.rpc("tool_availability", {
      ws_id: workspaceId,
      tool_slug: slug,
    });
    ...
  })
);
```
- Severity: **high**. End-user surface — hit on every Launchpad render to decide which tools to gray out. `trimmed` is capped at 500 slugs but a typical workspace queries ~80. 80 round-trips per Launchpad render, multiplied across users.
- Fix: add `tool_availability_bulk(ws_id uuid, slugs text[])` RPC returning `table(slug text, status text)` in one shot.

### 3. `app/api/admin/bulk/run/route.ts:602` — per-agent recent-run count
```ts
await Promise.all(
  args.targetIds.map(async (id) => {
    const { count } = await admin
      .from("ai_agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", id)
      .gte("created_at", since);
    recentRunCounts.set(id, count ?? 0);
  })
);
```
- Severity: **medium**. Admin bulk-delete confirm path, fanout over selected agent IDs (typically 1–20, but UI allows bulk-selecting all).
- Fix: single `select agent_id, count(*) from ai_agent_runs where agent_id = any($1) and created_at >= $2 group by agent_id`.

### 4. `app/admin/locales/page.tsx:32` — per-locale string-count probe
```ts
await Promise.all(
  rows.map(async (r) => {
    const { count } = await admin
      .from("locale_strings")
      .select("string_key", { count: "exact", head: true })
      .eq("locale_code", r.code);
    counts.set(r.code, count ?? 0);
  })
);
```
- Severity: **low**. Admin-only, locale count typically < 20. Comment in the file already acknowledges "small N — cheap".
- Fix: `select locale_code, count(*) from locale_strings group by locale_code` — one round-trip.

### 5. `app/admin/social/page.tsx:339` — per-row S3 signing
```ts
await Promise.all(
  rows.map(async (r) => {
    ...
    const url = await presignedDownloadUrl({ key: f.r2_key, ... });
    out.set(r.id, url);
  })
);
```
- Severity: **medium**. Admin-only, 25–50 rows per page. R2 signing is a local crypto op (no network), so the cost is CPU rather than round-trip — but when `R2_PUBLIC_URL` is unset we fall into the slow path. Already mostly avoided by the `publicBase` short-circuit above.
- Fix: when `R2_PUBLIC_URL` is set in production this is a non-issue. In local dev consider caching signed URLs by `r2_key` for the session.

## Notable false positives

For reference, these matches were checked and dismissed:

- `app/api/files/shares/incoming/route.ts:138` and `outgoing/route.ts:122` — `for (const u of usersRes.data.users)` is iterating an already-fetched list to build a lookup `Map`, not querying per row.
- `app/api/files/move/route.ts:53` — two-iteration loop (source + destination workspace), constant N.
- `app/api/workspaces/update/route.ts:113,155` — iterating field keys to build an `UPDATE` payload.
- `app/admin/data-exports/page.tsx:79` and `app/admin/moderation/queue/page.tsx:109` — fan-out over a tiny constant `EXPORT_STATUSES` / `QUEUE_STATUSES` array (3–4 statuses). Technically N+1 but bounded and cold-path; not worth fixing.
- `app/api/wallpapers/delete/route.ts:77` and `create/route.ts:117` — fan-out over the two-mode (`light`/`dark`) wallpaper pair. N=2.

## Recommended order of attack

1. **Tool availability bulk RPC** (#2) — biggest user-facing impact, hot path on every Launchpad render.
2. **Storage RPC bulk variant** (#1) — admin pain point and the obvious starter on the same pattern.
3. **Agent recent-run aggregate** (#3) — same trick, lower frequency.
4. (low priority) Locale + social signing — once we hit those pages routinely.

This list is non-exhaustive: it only covers `.map(async )` and tight loops with awaits. There may be N+1 lurking inside server-action helpers and lib/ functions that aren't grep-visible from this pattern; a follow-up pass should walk the `lib/agent/runtime/**` paths (which iterate over tool calls) and `lib/files/**` (which sometimes loops per workspace).
