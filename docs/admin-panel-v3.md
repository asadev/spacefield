# Admin Panel v3 — multi-agent build coordination (round 3)

This contract drives the third round of admin-panel work. Read it
**before** touching any code. v1 (basic admin: apps/agents/logs/etc) and
v2 (skills/models/users-tabs/workspaces-tabs/webhooks/jobs/database/
insights/ops/emails) already shipped. This round adds **deep
editability** for existing surfaces AND **new sections** the maintainer demands.

## What the maintainer said (verbatim)

> "the skills are not that much of editable no no tools are editable I
> need everything properly editable properly controllable and full
> control over the panel you just added a few things not much of them
> add everything please"

> "for a agents we need to have the skills here and I should be able to
> able to create or edit the skills or the capabilities when I click on
> them it should take me to the overall capability where I can edit and
> change the capability stuff how the capability is working I mean
> skills and everything and I can add more if I want to and I can make
> changes in the AI agents I shouldn't have more control over them if
> you want to add a new model try to find out some way how I can do it
> from the panel directly myself without your help"

> "the overall panel is still too small I need it to be 10x more better
> than now so do your full efforts and bring something big"

## Foundation already on `main` HEAD

- Migration `supabase/migrations/20260509c_admin_panel_v3.sql` applied
  to live Supabase. New tables:
  ai_providers, ai_provider_health, agent_tool_overrides, agent_workflows,
  site_banners, push_subscriptions, push_campaigns, maintenance_state,
  rate_limit_rules, ip_rules, security_policies, sso_configs,
  brand_configs, locales, locale_strings, coupons, coupon_redemptions,
  moderation_rules, moderation_queue, eval_suites, eval_runs,
  prompt_library, prompt_versions, error_events, backup_snapshots,
  data_export_requests, cohorts, cohort_users, funnels, funnel_events,
  announcements, integrations, webhook_subscriptions.
- Seeded: 6 ai_providers, 11 integrations, 3 locales (en/ar/ur),
  maintenance_state singleton, security_policies singleton.
- TS types in `app/admin/_types.ts` extended (every v3 row + enum).
- Sidebar has links for every new route, grouped Platform/People/Ops/
  Security/Communication/Customization/AI Quality/Content.

## Hard rules (UNCHANGED FROM v1/v2)

1. **Foundation files are off-limits:** `app/admin/_lib.ts`,
   `app/admin/_audit.ts`, `app/admin/_types.ts`,
   `app/admin/_components/Sidebar.tsx`, `app/admin/layout.tsx`,
   `supabase/migrations/*`, `docs/admin-panel*.md`.
2. **Stay in your owned paths.** If you need a shared component, put it
   in your own subdir.
3. **Every mutation server action** calls `await assertAdmin()` AND
   `await recordAdminAction({ action: "<area>.<verb>", ... })` from
   `app/admin/_audit.ts`.
4. **`export const dynamic = "force-dynamic"`** at the top of every
   page file.
5. **`"use server"` files only export async functions.** No types, no
   constants, no synchronous helpers. (Turbopack rejects type
   re-exports — caught in v2 final build.)
6. **`route.ts` files only export HTTP method handlers.** Helpers go in
   sibling `_<name>.ts` modules.
7. **Server components by default.** Client components only when
   genuinely interactive (form with progressive enhancement is fine in
   server-action mode).
8. **No external chart libs.** Inline SVG only, matching existing
   admin pages' style.
9. **Tailwind tokens only:** `bg-app`, `bg-app-elevated`, `text-app`,
   `text-secondary`, `text-faint`, `text-muted`, `border-app`,
   `bg-tool-accent`, `bg-tool-accent-soft`, `text-tool-accent`. Use
   `inputClass`, `buttonClass`, `buttonGhostClass` from `_lib.ts`.
10. **TypeScript clean.** `npx tsc --noEmit` must exit 0.
11. **Build must be green:** `npx next build --webpack` (default Next 16
    Turbopack panics on the worktree's symlinked node_modules; webpack
    is the canonical strict checker; the orchestrator builds with
    Turbopack on real main after merge).
12. **Branch from `main`, commit, DO NOT PUSH.** The orchestrator
    inspects + merges.

## Owned-paths map

| Agent | Branch | Owned paths |
|-------|--------|-------------|
| H | `admin/skills-deep` | `app/admin/skills/**` (extend ONLY — don't delete v2 work), `app/api/admin/skills/**`, `lib/agent/skills/_inspector.ts` (new) |
| I | `admin/tools-catalog` | `app/admin/tools-catalog/**`, `app/api/admin/tools-catalog/**` |
| J | `admin/providers` | `app/admin/providers/**`, `app/api/admin/providers/**`, `lib/providers/**` |
| K | `admin/workflows-prompts` | `app/admin/workflows/**`, `app/admin/prompts/**`, `app/api/admin/workflows/**`, `app/api/admin/prompts/**` |
| L | `admin/banners-push-maintenance` | `app/admin/banners/**`, `app/admin/announcements/**`, `app/admin/push/**`, `app/admin/maintenance/**`, `app/api/admin/banners/**`, `app/api/admin/push/**`, `app/api/admin/maintenance/**` |
| M | `admin/security` | `app/admin/security/**`, `app/admin/rate-limits/**`, `app/admin/ip-rules/**`, `app/admin/sso/**`, `app/api/admin/security/**` (and similar) |
| N | `admin/moderation-data` | `app/admin/moderation/**`, `app/admin/data-exports/**`, `app/admin/backups/**`, `app/api/admin/moderation/**`, `app/api/admin/data-exports/**`, `app/api/admin/backups/**` |
| O | `admin/branding-locales` | `app/admin/branding/**`, `app/admin/locales/**`, `app/api/admin/branding/**`, `app/api/admin/locales/**` |
| P | `admin/coupons-cohorts-funnels` | `app/admin/coupons/**`, `app/admin/cohorts/**`, `app/admin/funnels/**`, `app/api/admin/coupons/**`, `app/api/admin/cohorts/**`, `app/api/admin/funnels/**` |
| Q | `admin/errors-eval-integrations` | `app/admin/errors/**`, `app/admin/eval/**`, `app/admin/integrations/**`, `app/api/admin/errors/**`, `app/api/admin/eval/**`, `app/api/admin/integrations/**` |
| R | `admin/agents-cross-link` | `app/admin/agents/**` (extend — don't delete v1/v2 work), `app/api/admin/agents/**` |

11 agents in parallel. Each gets a dedicated worktree with explicit cwd.

## Per-agent scope (compact — full prompt sent at dispatch)

### H — Skills DEEP edit
- `/admin/skills/[id]` enriched: show source code if `kind=code` (read TS file from disk via filesystem at server-render time — file path is `lib/agent/skills/<id>/index.ts` if exists, fall back to `lib/agent/skills/<id>.ts`).
- Every editable field surfaced: system_fragment, allowed_workspace_roles, requires_confirmation_default, category, icon, sort_order, status, metadata.
- Per-tool inline editor (already exists for custom skills) extended for code-defined skills to allow override of description / read_only / requires_confirmation (overlay). The overlay lives in a new `agent_tool_overrides` row keyed by `(agent_id='*', skill_id, tool_name)` to mean "global override". Existing per-agent overrides (with real `agent_id`) still take precedence.
- Recent runs panel filtered by `skill_id` (joins ai_agent_runs.metadata).
- Cross-link: list of agents that include this skill in `allowed_skills`.
- Test runner: server-action that invokes the skill with sample input and shows the result.
- `+ New skill` flow already exists; ensure import-from-JSON works.

### I — Tools catalog (NEW)
- `/admin/tools-catalog`: lists every tool the platform exposes. Sources:
  - All tool definitions in code skills (read `lib/agent/skills/index.ts` registry at server-render time).
  - All `tools_json` entries in custom `ai_skills`.
  - All entries in `app_registry` (the OS-shell tool catalog).
  - Show: tool name (mono), source kind (`skill-code` / `skill-custom` / `app-registry`), description, used-by count.
- `/admin/tools-catalog/[source]/[id]`: per-tool detail. Source code link (if code), full schema, list of agents that use it, recent invocations, override controls (description, requires_confirmation), per-agent overrides table.

### J — Providers (NEW + critical for the maintainer's "add models myself" ask)
- `/admin/providers`: lists `ai_providers` (Anthropic/OpenAI/Google/etc).
- Per-provider page: edit display_name, base_url, api_key_env (reference name), cost_quota_usd. Toggle status.
- "Test connection" button: server-action that pings the provider's models-list endpoint with the live API key (read from process.env using the api_key_env name) and stores result in `ai_provider_health`.
- Provider-health timeline (last 24h ping results).
- "Discover models" button: pulls model catalog from each provider's API and lets admin one-click-add to `ai_models`. This is THE solution to "add models from panel myself" — discovery + insert.

### K — Workflows + Prompt library (NEW)
- `/admin/workflows`: list, edit `agent_workflows`. Per-workflow: drag-step builder (steps jsonb is array of `{ kind: "skill" | "tool" | "branch", skill_id?, tool_name?, condition? }`).
- `/admin/prompts`: prompt library CRUD + version history. Per-prompt: list versions, diff between versions, "promote to current" button.

### L — Banners + Push + Announcements + Maintenance (NEW)
- `/admin/banners`: CRUD `site_banners` with audience selector (all/authenticated/tier/allowlist), variant chips, schedule.
- `/admin/announcements`: CRUD `announcements` (internal what's-new feed, pin toggle, audience).
- `/admin/push`: CRUD `push_campaigns`. Per-campaign: target audience, schedule, "send now" or "schedule" button. List `push_subscriptions` count.
- `/admin/maintenance`: singleton `maintenance_state` editor with toggle + message + read-only mode + allowlist bypass.

### M — Security (NEW)
- `/admin/security`: singleton `security_policies` editor (2FA, session, password rules).
- `/admin/rate-limits`: CRUD `rate_limit_rules` (scope/route/limit/window).
- `/admin/ip-rules`: CRUD `ip_rules` (CIDR/action/expires).
- `/admin/sso`: CRUD `sso_configs` per workspace (SAML/OIDC/Google/Microsoft).

### N — Moderation + Data exports + Backups (NEW)
- `/admin/moderation`: CRUD `moderation_rules` + queue review at `/admin/moderation/queue`.
- `/admin/data-exports`: list `data_export_requests`, approve/run/delete per row.
- `/admin/backups`: list `backup_snapshots` + "Trigger backup" server-action that inserts a pending row (actual backup mechanism is an environment follow-up; the admin row + status flow is what's wanted now).

### O — Branding + Locales (NEW)
- `/admin/branding`: CRUD `brand_configs`. Per-workspace and global. Logo URL fields + color pickers + custom-CSS textarea.
- `/admin/locales`: CRUD `locales` enable/disable + `/admin/locales/[code]` for per-locale string editor (`locale_strings`).

### P — Coupons + Cohorts + Funnels (NEW)
- `/admin/coupons`: CRUD coupons + redemption history.
- `/admin/cohorts`: CRUD cohorts + recompute button.
- `/admin/funnels`: CRUD funnels + per-funnel conversion view.

### Q — Errors + Eval + Integrations (NEW)
- `/admin/errors`: list `error_events`. Group by fingerprint, expand for stack/context. "Resolve" button.
- `/admin/eval`: CRUD `eval_suites` + run history. "Run now" button.
- `/admin/integrations`: list `integrations`, toggle status + edit oauth_config.

### R — Agents cross-linking
- Extend `/admin/agents/[id]`: skill multi-select items become clickable links to `/admin/skills/[id]`. Tools section shows tools from each allowed skill, with link to `/admin/tools-catalog/[source]/[name]`. Per-agent tool override editor (writes `agent_tool_overrides`). Add "Workflows using this agent" panel.

## Acceptance criteria (per agent)

1. `git diff --name-only main` lists ONLY files in your owned paths.
2. `npx tsc --noEmit` exits 0.
3. `npx next build --webpack` is green and lists every new route.
4. Every server action calls `assertAdmin()` AND `recordAdminAction(...)`.
5. Every page declares `dynamic = "force-dynamic"`.
6. Tailwind matches existing admin style — no arbitrary colors.

## Workflow

1. cd into your worktree (orchestrator tells you the path).
2. `git status` clean, `git branch --show-current` matches your area, `git log --oneline -3` shows v3 foundation at top.
3. Read `docs/admin-panel-v3.md` and `app/admin/_types.ts`.
4. Read existing admin pages for style reference (`app/admin/users/page.tsx`, `app/admin/tools/[slug]/page.tsx`).
5. Build everything in scope. Strict TS. Match existing admin pages.
6. `npx tsc --noEmit` — fix any error.
7. `npx next build --webpack` — fix any error.
8. `git add -A && git commit -m "feat(admin/<area>): <what>"`. **DO NOT PUSH.**
9. Final report: file list, server-action verbs logged, RPCs called, any blockers.

If a foundation file genuinely needs changing, **don't change it** — stop and explain in your final report. The orchestrator will resolve and re-dispatch.
