# Admin Panel v4 — multi-agent build coordination

Round 4. v3 is live; this round (a) WIRES v3 features to runtime so they actually do something for users and (b) adds new sections.

## Foundation already on `main`

- Migration `supabase/migrations/20260509d_admin_panel_v4.sql` applied. New tables: `help_categories`, `help_articles`, `onboarding_flows`, `onboarding_steps`, `user_onboarding_state`, `product_tours`, `support_tickets`, `support_messages`, `impersonation_sessions`, `refunds`, `invoices`, `surveys`, `survey_responses`, `bulk_operations`, `activity_feed`.
- Runtime helpers: `maintenance_active(uid)`, `active_banners(uid, tier)`, `active_brand(ws_id)`.
- Types extended in `app/admin/_types.ts`.
- Sidebar has links for new sections.

## Hard rules — UNCHANGED from v1/v2/v3

1. Foundation files off-limits: `app/admin/_lib.ts`, `app/admin/_audit.ts`, `app/admin/_types.ts`, `app/admin/_components/Sidebar.tsx`, `app/admin/layout.tsx`, `supabase/migrations/*`, `docs/admin-panel*.md`.
2. Stay in your owned paths.
3. Every mutation: `assertAdmin()` + `recordAdminAction(...)`.
4. Every page: `dynamic = "force-dynamic"`.
5. `"use server"` files only export async functions.
6. `route.ts` files only export HTTP method handlers.
7. Server components by default. Client only when needed.
8. No external chart libs. Inline SVG.
9. Tailwind tokens only — match existing admin style.
10. **NEW for v4 — runtime wiring agents:** when modifying `middleware.ts` or `app/layout.tsx`, do MINIMAL edits. Add a single integration point that reads from the helper RPC. Never rewrite existing logic.
11. `npx tsc --noEmit` clean. `npx next build --webpack` green.
12. Commit but DO NOT push.

## Owned-paths (per agent)

| Agent | Branch | Owned paths |
|-------|--------|-------------|
| S | `admin/wire-runtime` | `middleware.ts` (extend!), `app/layout.tsx` (extend!), `app/maintenance/**`, `lib/runtime-banner.ts`, `lib/runtime-maintenance.ts`, `lib/runtime-brand.ts` |
| T | `admin/error-rate-ip` | `middleware.ts` shares with S — coordinate; otherwise `lib/error-log.ts`, `lib/rate-limit.ts`, `lib/ip-rules.ts`, `app/api/admin/errors/[id]/**` (extend) |
| U | `admin/playgrounds` | `app/admin/agents/[id]/playground/**`, `app/admin/skills/[id]/playground/**`, `app/admin/prompts/[id]/playground/**`, `app/admin/playground/**`, `app/api/admin/playground/**` |
| V | `admin/support-impersonate` | `app/admin/support/**`, `app/api/admin/support/**`, `app/api/admin/impersonate/**`, `lib/impersonate/**` |
| W | `admin/help-center` | `app/admin/help/**`, `app/api/admin/help/**`, `app/help/**` (public-facing read-only viewer optional) |
| X | `admin/onboarding-tours` | `app/admin/onboarding/**`, `app/admin/tours/**`, `app/api/admin/onboarding/**`, `app/api/admin/tours/**` |
| Y | `admin/refunds-invoices` | `app/admin/refunds/**`, `app/admin/invoices/**`, `app/api/admin/refunds/**`, `app/api/admin/invoices/**` |
| Z | `admin/surveys-bulk-activity` | `app/admin/surveys/**`, `app/admin/activity/**`, `app/admin/search/**` (extend if needed), `lib/bulk/**`, `app/api/admin/surveys/**`, `app/api/admin/activity/**`, `app/api/admin/bulk/**` |

8 agents in v4. Will dispatch in 2 batches of 4 to avoid the 11-parallel-build contention from v3.

## Wire-to-runtime (Agent S) — special note

You're touching `middleware.ts` and `app/layout.tsx` — shared infra. Be MINIMAL:

**`middleware.ts`:** at the very top of the matcher (before any auth/host logic), insert a maintenance check:
```ts
const { data: maint } = await supabase.rpc('maintenance_active', { uid: ... });
if (maint === true && !req.nextUrl.pathname.startsWith('/maintenance')) {
  return NextResponse.redirect(new URL('/maintenance', req.url));
}
```
Adjust to fit the existing middleware shape. If middleware doesn't have a Supabase client, use direct fetch to the maintenance_state row.

**`app/layout.tsx`:** add a `<SiteBanner />` component just inside `<body>`. The component is a server component that calls `active_banners` RPC and renders top-of-page banners with dismiss handling stored in localStorage (use a tiny `"use client"` Dismisser child).

**`app/maintenance/page.tsx`:** simple "We'll be back" page that reads `maintenance_state.message`.

Brand renderer: read `active_brand(workspace_id)` server-side in `app/layout.tsx` and inject `<style>` tag with `--brand-primary` / `--brand-accent` CSS vars + favicon URL via `<link>` if `brand.favicon_url`.

## Error reporter (Agent T)

`lib/error-log.ts` exports:
- `logError(input: { message, source?, level?, fingerprint?, user_id?, workspace_id?, stack?, url?, user_agent?, context? }): Promise<void>` — inserts into `error_events` via service-role client.
- `withErrorLogging<T>(fn: () => Promise<T>, source: string): Promise<T>` — wrapper for try/catch.

`lib/rate-limit.ts` and `lib/ip-rules.ts` provide read-only middleware helpers. Don't modify middleware.ts heavily — the actual middleware extension is Agent S's responsibility. Just provide the lib helpers.

Do extend `app/admin/errors/[id]/page.tsx` if it doesn't exist — per-error detail with full context viewer.

## Playgrounds (Agent U)

For agents/skills/prompts:
- `/admin/agents/[id]/playground` — chat UI (input box + sent message list + agent reply). Sends to `/api/admin/playground/agent-run`.
- `/admin/skills/[id]/playground` — invoke skill with sample JSON input.
- `/admin/prompts/[id]/playground` — text body with variable substitution form (variables auto-detected from `{{var}}` patterns).
- `/api/admin/playground/agent-run` — POST { agent_id, message } → invokes the agent runtime, returns reply. If runtime is too complex to wire, simulate by calling the model directly with the agent's system prompt.
- `/api/admin/playground/skill-invoke` — similar.
- `/api/admin/playground/prompt-test` — substitutes vars and renders the resulting prompt (no model call required if you don't want).

Use the existing Anthropic SDK that's already in package.json. Server-side only — never expose API keys to client.

## Workflow — same as v3

cd into worktree → read v4 doc → build → tsc → build --webpack → commit (no push) → final report.

EXCEPT: **build with `npx next build --webpack 2>&1 | tail -5` and don't try to monitor it tightly** — let it complete. The watchdog killed v3 agents because they polled too aggressively. Just `&&` the build into the commit and report.