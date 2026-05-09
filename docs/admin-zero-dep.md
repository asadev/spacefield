# Admin: zero-technical-dependency audit + plan (v6)

**Asad's mandate (verbatim):**
> "the features i want is about 0% dependency on you or manual coding or any technical person needs, if i come here and want to make any kind of change, or access control i should be able to do it from this admin panel"

This doc audits what admin can do today vs what still requires code, then lays out the v6 plan.

## What admin can already do without code

**AI runtime (full control):**
- CRUD AI agents — name, model, fast_model, system_prompt, greeting, temperature, max_tokens, status, allowed_skills, allowed_tools, access controls.
- CRUD ai_models — manually OR auto-discover from any provider's model API (`/admin/providers/[id]` discover-flow).
- CRUD providers — Anthropic/OpenAI/Google/xAI/Mistral/Groq + custom — set base_url, api_key_env, cost quotas.
- CRUD custom skills (kind=custom): system_fragment, allowed_workspace_roles, requires_confirmation_default, tools_json (each tool: name, description, input_schema, handler_kind=rpc/http, handler_target, requires_confirmation).
- Per-agent tool overrides (description / read_only / requires_confirmation).
- CRUD prompts with version history + diff + promote.
- CRUD workflows (steps composed of skills).
- Eval suites + run history.

**Apps (full control):**
- Per-app published toggle, access_mode, tier list, allowlist, sort_order.
- Per-user grants, per-workspace grants.
- Feature flags with off/on/allowlist/percent rollout strategies.

**People (full control):**
- View/edit users; toggle is_admin; tier change; password reset.
- Workspace members, storage caps, custom domains.
- API tokens CRUD.
- Coupons, cohorts, funnels.

**Communication (full control):**
- Email templates with variables + test send.
- Site banners (audience-targeted, scheduled).
- Push campaigns.
- Announcements.
- Support inbox + impersonation.
- Help articles + categories.
- Surveys + NPS + responses.

**Customization (full control):**
- Per-workspace and global brand_configs (logo, colors, fonts, custom CSS).
- Locales + per-locale string editor.
- Maintenance mode singleton (with allowlist bypass).

**Security (full control):**
- Singleton security_policies (2FA, session timeout, password rules).
- Rate-limit rules per scope.
- IP allow/block.
- SSO configs per workspace.
- Moderation rules + queue.

**Money (full control):**
- Refunds workflow.
- Invoices CRUD.

**Ops (full control):**
- Logs (4 tabs).
- Audit log of every admin mutation.
- Sign-in events.
- Errors (Sentry-lite).
- Share analytics.
- Backups.
- Custom domains with DNS verify + Vercel attach.

## What admin still CAN'T do without code (the gaps)

| Gap | Why it requires code today | v6 fix |
|-----|---------------------------|--------|
| Add a new admin section | NAV is hardcoded in `_nav.ts` | **Custom admin pages** with block-based layout — admin defines pages from data |
| Add a new app to OS shell | `tools-list.ts` is a TS file with lazy imports | App-registry admin lets you toggle existing, but new app code still needs a developer. Phase out by allowing iframe-tool registration: admin pastes URL, gives it a slug, it appears in OS shell |
| Define new tool implementations | RPC handlers and HTTP endpoints are code | Custom skills already support `handler_kind=rpc/http` — extend the builder to be drag-drop, with input-schema designer + sample-input tester + per-step debug |
| Granular access control beyond `is_admin` | Only one boolean | **Roles + permissions matrix**: define roles ("content-mod", "billing-only"), assign resource×action permissions, attach roles to users |
| Env-like config flags read by code | `process.env.X` is hardcoded | **runtime_config** table: admin sets values, code reads via `getRuntimeConfig(key)` with cached lookup |
| Wire backups / push send / SMS | Mechanism is environmental | Actually run those operations from cron + `/admin/jobs` — admin sees status |
| Custom event handlers | Workflow trigger has no dispatcher | Wire trigger dispatcher: `dispatchEvent(name, payload)` matches workflows |
| Bulk operations on lists | Each list page is single-row only | **Universal bulk action bar** — select N rows, run an operation |
| Generic metadata editor | Each entity has `metadata jsonb` but UI hides it | Universal `<MetadataEditor>` component on every detail page |
| Custom dashboards / KPIs | Dashboards are coded | Custom admin pages with block types: SQL-driven KPI, table, chart, button |

## v6 scope (what we're shipping this round)

### v6 Foundation (me)
New tables:
- `admin_roles` — id, name, description, is_system_default
- `admin_role_permissions` — role_id, resource, action (`role_id, resource, action` PK)
- `user_admin_roles` — user_id, role_id, granted_by, granted_at
- `runtime_config` — key, value (jsonb), value_type (string/number/bool/json), description, is_secret, updated_by, updated_at
- `admin_pages` — id (slug), title, description, layout (sidebar/single/grid), enabled, created_at, updated_at, updated_by
- `admin_page_blocks` — id, page_id, kind (kpi/table/chart/markdown/button/iframe), config (jsonb), sort_order

Extension to existing:
- `assertAdmin()` extended to check `user_admin_roles` table when `is_admin=false` — having any role with permission for the called resource grants access. Fallback to `is_admin` for back-compat.

New RPCs:
- `has_permission(user_id, resource, action)` — true if user has any role with this perm OR `is_admin=true`
- `get_runtime_config(key)` — returns parsed value with type coercion
- `seed_default_admin_roles()` — creates default "super-admin", "support", "billing", "content-mod" roles

### Agents

**AA — Roles + permissions matrix** (`/admin/roles`)
- CRUD roles (display_name, description).
- Permission matrix view: resources × actions checkbox grid (e.g., resources = `users, workspaces, agents, skills, ...`; actions = `read, create, update, delete`).
- Assign role to user from `/admin/users/[id]` (extend that page).
- Banner on every page when current admin's role is restricted.

**AB — Runtime config** (`/admin/runtime-config` under Data & Ops)
- CRUD typed config rows.
- `is_secret` toggle masks the value.
- Test resolver: `get_runtime_config(key)` shows current resolved value.

**AC — Custom tool/skill builder upgrade** (extend `/admin/skills/[id]`)
- Drag-reorder tool list.
- Visual input-schema builder (fields with type + required + description).
- "Test invoke" button calls the configured RPC/HTTP and shows result.
- Sample input pre-fills.

**AD — Custom admin pages** (`/admin/custom/[slug]` viewer + `/admin/pages` builder)
- CRUD pages.
- Block library: KPI card, SQL-driven table, line/bar chart from RPC, markdown, button (runs an RPC or workflow), iframe.
- Drag-reorder blocks.
- Live preview.
- Integrates into Sidebar dynamically: any enabled admin_page appears under "Custom" section.

**AE — Universal bulk action bar** (lib + 5 list-page integrations)
- `<BulkActionBar>` component: row checkboxes, select-all, action menu.
- Generic action types: delete, update-field, tag, export-CSV, run-workflow.
- Integrate into: `/admin/users`, `/admin/workspaces`, `/admin/agents`, `/admin/skills`, `/admin/apps`.
- Each bulk run logs to `bulk_operations`.

## Out-of-scope this round (queued)

- Generic metadata editor (every detail page) — universal component, plumbed everywhere later
- Workflow trigger dispatcher (cron-driven worker) — needs deployment infra
- Iframe-tool registration in OS shell — design needs to integrate with existing tools-list.ts
- Theme variables fully editable from brand_configs — partially in place
- Email/push send mechanisms wired to real services — environmental

## Hard rules — same as v1-v5

1. Foundation files off-limits: `app/admin/_lib.ts`, `_audit.ts`, `_types.ts`, `_components/Sidebar.tsx`, `_components/Header.tsx`, `_components/_nav.ts`, `layout.tsx`, `supabase/migrations/*`, `docs/admin-*.md`.
2. Stay in your owned paths.
3. Every mutation: `assertAdmin()` + `recordAdminAction(...)`.
4. Every page: `dynamic = "force-dynamic"`.
5. `"use server"` files only export async functions.
6. `route.ts` files only export HTTP method handlers.
7. Page files only export approved fields.
8. Tailwind tokens only.
9. Build verified with `npx next build --webpack 2>&1 | tail -10` once. No watchdog-killing loops.
10. Commit but DO NOT push.
