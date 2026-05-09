# Admin Panel v7 — wire-up round (multi-agent build)

This round closes the gap between "UI works" and "feature actually does its job." Plus the iframe-tool registration ask.

## Why now

After v6 audit ran clean (64 routes, 0 broken pages), the gaps are runtime-side:

- `assertAdmin()` still gates everything on `is_admin=true` — the v6 role/permission matrix is **decorative**.
- `lib/rate-limit.ts` + `lib/ip-rules.ts` + `lib/error-log.ts` exist but **zero call sites**.
- Maintenance / banners / brand are wired in middleware + layout but never **verified end-to-end on the user side**.
- Custom admin pages with SQL blocks need `exec_admin_sql` RPC deployed.
- Bulk action bar only on `/admin/users`.
- Workflows have no dispatcher — `trigger_kind='manual'` clicks nothing.
- OS shell apps still hardcoded in `tools-list.ts` — admin can publish/unpublish but can't *add* a new tool.

7 agents, parallel, conflict-controlled.

## Hard rules (UNCHANGED from v1-v6)

1. Foundation files OFF-LIMITS: `app/admin/_lib.ts`, `_audit.ts`, `_types.ts`, `_components/Sidebar.tsx`, `_components/Header.tsx`, `_components/_nav.ts`, `layout.tsx`, all `docs/admin-*.md`.
2. **`middleware.ts` is owned by Agent BB only** in this round. Other agents may NOT touch it.
3. **`tools-list.ts`** owned by Agent BG only.
4. Stay in your owned paths.
5. Every NEW mutation: `assertAdmin()` + `recordAdminAction(...)`. (You may *also* add `assertCan(...)` calls — see BA — but always alongside `assertAdmin` for safety.)
6. Every page: `dynamic = "force-dynamic"`.
7. `"use server"` files only export async functions.
8. `route.ts` files only export HTTP method handlers.
9. Page files only export approved fields.
10. Tailwind tokens only.
11. Build verified with `npx next build --webpack 2>&1 | tail -10` — once, no polling loops.
12. Commit but DO NOT push.

## Owned paths (the contract)

| Agent | Branch | Owned |
|-------|--------|-------|
| BA | `admin/perm-gate` | `lib/admin-perms.ts` (new), `app/admin/roles/_MyPermissions.tsx` (new), `app/admin/roles/page.tsx` (extend — add MyPermissions panel at top) |
| BB | `admin/middleware-wire` | `middleware.ts` (extend), `lib/api-wrap.ts` (new), `lib/middleware-helpers.ts` (new), `lib/error-log.ts` (extend — add Edge-safe variant) |
| BC | `admin/runtime-verify` | `app/_components/SiteBanner.tsx` (extend if needed), `app/_components/BannerDismisser.tsx` (extend if needed), `lib/runtime-banner.ts` (extend if needed), `lib/runtime-brand.ts` (extend if needed), `lib/runtime-maintenance.ts` (extend if needed), `app/maintenance/page.tsx` (extend if needed). Plus a verification report at `docs/v7-runtime-verify.md`. |
| BD | `admin/exec-sql` | `supabase/migrations/20260509f_exec_admin_sql.sql` (new), `lib/admin-blocks/index.ts` (extend the `runAdminSelect` callsites to use the new RPC) |
| BE | `admin/bulk-rollout` | `app/admin/workspaces/page.tsx` (extend), `app/admin/agents/page.tsx` (extend), `app/admin/skills/page.tsx` (extend), `app/admin/apps/page.tsx` (extend, ONLY table body / wrapper / bottom bar — leave header alone for BG), `app/api/admin/bulk/run/route.ts` (extend dispatch table) |
| BF | `admin/workflow-runner` | `app/api/admin/workflows/[id]/run/route.ts` (new), `lib/workflow-runner.ts` (new), `app/admin/workflows/[id]/_RunButton.tsx` (new client island), `app/admin/workflows/[id]/page.tsx` (extend — add run button + recent runs panel) |
| BG | `admin/iframe-apps` | `supabase/migrations/20260509g_custom_apps.sql` (new — extends `app_registry` with `custom_url` + `tool_kind` columns), `app/admin/apps/new/page.tsx` (new — custom app creator), `app/admin/apps/_actions.ts` (extend — add `createCustomApp` action), `app/admin/apps/page.tsx` (extend, ONLY header area — add "+ New custom app" link beside existing controls; leave table body for BE), `app/tools/_data/_custom-tools.ts` (new — merger lib), `app/tools/_data/tools-list.ts` (extend — read DB-backed custom apps at runtime) |

## Agent-specific scope

### BA — Permission gate
Build `lib/admin-perms.ts`:
```ts
export async function assertCan(resource: PermissionResource, action: PermissionAction): Promise<void>
export async function callerCan(resource, action): Promise<boolean>
export async function getCallerRoles(): Promise<AdminRoleRow[]>
export async function getCallerPermissions(): Promise<{ resource, action }[]>
```

`assertCan` — calls `has_permission(auth.uid(), resource, action)` RPC, throws "forbidden" on false, NO-OP if `is_admin=true` (back-compat).

`<MyPermissions />` server component on `/admin/roles` — shows the current admin's effective roles + what resource×action grants they have. Renders at the TOP of the page above the existing role list.

DO NOT replace `assertAdmin()` in existing actions. Future server actions can opt into `assertCan` for finer gates.

### BB — Middleware wiring
Extend `middleware.ts` to:
1. **(already there)** maintenance check at top.
2. **(NEW)** Right after maintenance, run IP rule check. If `evaluateIp(ip).action === 'block'`, return `new NextResponse('Forbidden', { status: 403 })`.
3. **(NEW)** Run rate-limit check for the matched route. Pull applicable rules via `getApplicableRules`, increment, return 429 + `Retry-After` header if exceeded.
4. **Catch all errors** — wrap the body of `middleware()` in try/catch and call `logError({ source: 'middleware', message, stack, url })`.

`lib/api-wrap.ts` exports:
- `withApiHandler<TReq, TRes>(handler, opts)` — wraps a route handler, runs auth/rate-limit/error-logging, returns a NextResponse. Opts: `{ requireAdmin?, rateLimit?, source }`.
- Use this in 2-3 example routes (you choose simple ones) to demo the pattern.

`lib/middleware-helpers.ts` provides Edge-safe wrappers for the helpers (since middleware runs on Edge runtime — no Node `fs`/`process` access for some things).

### BC — Runtime verify + fix
Write a verification script `~/scrape-tools/runtime-verify.mjs` that:
1. Connects with anon key (no admin login) → opens spacefield.co/.
2. Reads brand vars from injected `<style>` block.
3. Checks for any active site banners (visible at top of body).
4. Triggers maintenance mode via service role: insert `enabled=true, message='test'` into `maintenance_state`.
5. As anon, GET `https://spacefield.co/` — expect redirect to `/maintenance`.
6. Disable maintenance, verify normal page returns.
7. Insert a test banner; verify it appears.
8. Delete test banner.
9. Set `brand_configs.primary_color = '#ff0000'`; verify CSS var changes.
10. Reset.

Write findings to `docs/v7-runtime-verify.md`. **If any check fails, fix the underlying file and document.** Don't skip silently.

DO NOT modify middleware.ts (BB owns it). DO NOT touch foundation files.

### BD — exec_admin_sql RPC
Write migration `20260509f_exec_admin_sql.sql`:
- Create function `public.exec_admin_sql(query text) returns setof jsonb` — security definer, runs the supplied SELECT and returns each row as jsonb.
- Reject anything that isn't a single `select` or `with` statement (text-level guard).
- `grant execute to authenticated`. Function body checks `admin_caller_is_admin()` first.
- Plus alias `public.admin_exec_select(query text)` returning the same shape (for back-compat with `lib/admin-blocks/index.ts` fallback).

Apply migration to live Supabase via Management API. Then update `lib/admin-blocks/index.ts` to call the real RPC (currently has a "set up admin SQL exec" placeholder fallback). Verify a sample KPI block now returns real data.

### BE — Bulk action bar rollout
Wire `<BulkActionProvider>` + `<BulkRowCheckbox>` + `<BulkActionBar>` into 4 list pages, mimicking the `/admin/users` integration. Each page gets:
- Provider wrapping the existing JSX.
- A checkbox column at the start of each row.
- BulkActionBar at the bottom with appropriate actions per scope.

Per-scope action sets:
- `workspaces`: delete, change_tier, suspend, export_csv.
- `agents`: set_status_disabled, set_status_live, delete, export_csv.
- `skills`: set_status_disabled, set_status_live, delete, export_csv.
- `apps`: toggle_published, set_access_mode_admin_only, export_csv.

Extend the dispatch table in `app/api/admin/bulk/run/route.ts` for each new scope.

DO NOT touch the header area of `app/admin/apps/page.tsx` — BG owns that. Stick to: wrapper, table body, bottom bar.

### BF — Workflow runner
Build `lib/workflow-runner.ts`:
- `runWorkflow(workflow_id, input?, triggered_by?): Promise<{ ok, results, duration_ms }>`
- Loads workflow row + its steps, executes each step in order:
  - `kind="skill"`: invoke skill via existing skill dispatch.
  - `kind="tool"`: invoke tool via the tool's handler_kind=rpc/http.
  - `kind="prompt"`: render prompt with vars and (optionally) call model.
  - `kind="branch"`: evaluate condition, skip subsequent steps if false.
- Each step's output is available to subsequent steps as `output_var` if set.
- Records run via `runBulk` pattern? No — workflows aren't bulk. Just record into a NEW small table `workflow_runs` (you can include the migration in your branch — separate file, no conflict with BD/BG).

Add manual "Run now" button on `/admin/workflows/[id]` page (small client island `_RunButton.tsx`) → POSTs to `/api/admin/workflows/[id]/run` → shows result inline.

Audit `workflow.run`. `assertAdmin` + `recordAdminAction`.

### BG — Iframe-tool registration
Migration `20260509g_custom_apps.sql`:
- Extend `app_registry` with `custom_url text`, `tool_kind text` (default 'native', alt values: 'iframe', 'redirect'), `is_user_created boolean default false`.
- Helper RPC `register_custom_app(p_id text, p_title text, p_url text, p_description text default '', p_icon text default null)` — admin-only insert.

`app/admin/apps/new/page.tsx`:
- Form: id (slug), title, description, custom_url, icon, sort_order, access_mode.
- Submit → calls `createCustomApp` server action (in `_actions.ts`).

`app/admin/apps/_actions.ts` extension:
- `createCustomApp(formData)` — validates URL, inserts via service role, redirects to `/admin/apps/[slug]`. Audit `app.create_custom`.

`app/admin/apps/page.tsx` — ONLY the header area: add a "+ New custom app" link next to existing controls. **Do not modify the table body / wrapper / bottom — BE owns those.**

`app/tools/_data/_custom-tools.ts` (new):
- `loadCustomTools(): Promise<ToolItem[]>` — server-only function that reads `app_registry where is_user_created = true and published = true` and returns them shaped as `ToolItem`s. Uses iframe routing.

`app/tools/_data/tools-list.ts` extension:
- Export a new function `getMergedToolList(): Promise<ToolItem[]>` that returns built-in `TOOLS` concatenated with `loadCustomTools()`.
- Existing consumers can switch to it incrementally.

## Acceptance criteria — every agent

1. `git diff --name-only main` lists ONLY owned paths.
2. `npx tsc --noEmit` exits 0.
3. `npx next build --webpack 2>&1 | tail -10` is green.
4. New mutation server actions: `assertAdmin()` + `recordAdminAction()`.
5. Pages: `dynamic = "force-dynamic"`.
6. Tailwind matches admin style.

## Workflow

1. cd into your worktree.
2. Read v7 doc + relevant earlier docs (admin-panel-v6.md, admin-zero-dep.md).
3. Build everything in scope.
4. tsc + build (once each).
5. `git add -A && git commit -m "feat(admin/<area>): <what>"`. NO PUSH.
6. Final report.

If you hit a foundation file you genuinely need to edit, STOP and document. The orchestrator will resolve.
