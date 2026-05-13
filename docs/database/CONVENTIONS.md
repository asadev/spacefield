# Spacefield database conventions

The full rulebook for the Postgres/Supabase layer. The short version lives in [`supabase/migrations/README.md`](../../supabase/migrations/README.md); this is the long form. Read it once, refer back when you're touching schema.

The two non-negotiables:

1. **Additive-only migrations.** No drops, no destructive alters, no row mutations on a live DB without explicit coordination.
2. **RLS on every multi-tenant table.** Default-deny. The right policies are the ones a hostile authenticated user can't bypass.

Everything else flows from those two.

---

## Schema layout

Everything lives in the `public` schema. We don't carve out per-feature schemas (`crm.*`, `chat.*`, etc.) because:

- Supabase's auto-generated PostgREST routes live in `public` by default; multi-schema setups force per-schema grants and break auto-discovery.
- The codebase already prefixes related tables (`crm_*`, `share_*`, `admin_*`, `workspace_*`); the prefix carries the namespace.

`auth.*` is owned by Supabase Auth — never touch its tables directly. Reference `auth.users(id)` for FKs.

`extensions` schema is where Supabase installs extensions; never assume an extension is loaded — gate on `pg_extension` in a `do $$ ... $$` block (see `slow_queries_top_50` in `20260514b_database_hardening.sql` for the pattern).

---

## Naming

| Thing | Convention | Example |
|---|---|---|
| Table | `lower_snake_case`, plural | `crm_contacts` |
| Column | `lower_snake_case` | `display_name` |
| Foreign key | `<singular>_id` | `workspace_id`, `owner_id` |
| Timestamp | `<verb>_at` | `created_at`, `deleted_at`, `closed_at` |
| Boolean | natural-reading name | `published`, `ok`, `is_default` |
| Function | `<verb>_<noun>` or `<scope>_<noun>` | `waitlist_join`, `admin_purge_audit_log` |
| Index | `<table>_<columns>_idx` | `crm_contacts_ws_idx` |
| Partial index | `<table>_<purpose>_idx` | `crm_contacts_active_idx` |
| View | descriptive noun phrase | `table_sizes`, `slow_queries_top_50` |
| Policy | quoted English sentence | `"admins write app_registry"` |

Why "natural-reading" for booleans: `published` and `is_published` are both fine, but `published_flag` reads worse than either. Pick whichever makes the call site read like English (`if (row.published)` or `if (row.is_published)`).

---

## Indexes

Default to btree. The other kinds have specific use cases:

- **GIN** for `jsonb`, `text[]`, and `pg_trgm` similarity matches. We use `using gin (name gin_trgm_ops)` for fuzzy name search.
- **Partial** for soft-delete and hot-path filters: `where deleted_at is null`. Cheaper than a full index because trashed rows aren't covered, and the planner uses it automatically when the WHERE clause matches.
- **Covering** (INCLUDE columns) for high-traffic SELECTs that fetch a small fixed column set. Add only after measuring — the index gets bigger, writes get slower.

Index every foreign key. Postgres does NOT auto-index FKs and `on delete cascade` performs a sequential scan on the child table without an index. This will bite you when you delete a workspace and it takes 30 seconds.

Don't over-index. Each index is write amplification. If you can't name the query that uses it, drop it.

---

## Migrations

Forward-only style. We don't run `down` migrations in production — the lifecycle is "ship a new migration that reverses the previous one" if it ever comes to that.

Every migration's header comment block documents:

1. What it does (one paragraph).
2. Why (the business or technical reason).
3. Rollback — either the inverse SQL or a note explaining why it's irreversible.

Three quick rules:

- **Don't `update` existing rows in a migration on tables larger than a few thousand rows.** Long-running updates take exclusive row locks and stall production. Backfill via a one-shot script (or a chunked `update ... where id in (...)` loop) instead.
- **Don't add `not null` to a populated nullable column in one step.** Add the column nullable, backfill, then add the constraint in a later migration.
- **Don't change a column type with `using <cast>` on a hot table.** Postgres rewrites the table under an `access exclusive` lock.

For the boring stuff (creating a new table, adding an index concurrently, adding a `not null default` to a brand-new column) — just ship it.

`create index concurrently` is the right move for adding indexes on populated tables, BUT it can't run inside a transaction. Supabase CLI wraps migrations in a transaction by default. Either set the migration to non-transactional or split the index creation into a separate manual step.

---

## RLS

Every multi-tenant table has `enable row level security`. This is enforced by code review, not by tooling — there's no migration linter, so the reviewer's job is to look for it.

Three policy classes we use:

- **Permissive** — the default. Any matching policy grants access. Use for "owners see their own rows", "admins see everything", etc.
- **Restrictive** — `as restrictive`. ALL matching restrictive policies must allow the operation. Use for hard guarantees that nothing else can override (e.g. "audit log is append-only — block UPDATE and DELETE").
- **Zero policies** — RLS enabled, no policies defined. Effective: only the service role can read or write. Use for server-managed tables like `db_backup_drills`, raw event logs, background-job state.

Policy targeting:

- Always specify `for select / for insert / for update / for delete / for all` explicitly.
- Always specify the roles: `to anon, authenticated`. Without `to`, the policy applies to `public`, which is the universe of roles — usually not what you want.
- Use both `using` and `with check` for `for all` and `for update`. `using` filters reads/the rows that can be updated; `with check` filters writes/the post-update row shape.

Helper functions for "is the caller an admin" / "is the caller a member of this workspace" live in earlier migrations (`admin_caller_is_admin`, etc.). Reuse them — don't re-implement the membership check inline in every policy.

---

## Soft-delete

Standard column: `deleted_at timestamptz` (default NULL). A row is "live" when `deleted_at is null` and "trashed" when set.

- Add a partial index: `create index <table>_active_idx on public.<table> (<scope_col>) where deleted_at is null;` — keeps active-row lookups fast without the cost of a full index.
- The application reads filter `where deleted_at is null` for default lists. Trash views read the inverse.
- RLS is unchanged when a row is trashed — workspace members can still see it for the Trash UI. If you need to hide trashed rows from authenticated reads at the DB layer, add a restrictive policy `using (deleted_at is null)` for SELECT, but think hard about whether you actually want to forbid Trash views.
- Purges (hard deletes) happen via a scheduled job or admin RPC, not by user action.

Tables that should get `deleted_at` (rolling adoption — not blanket):

- User-facing entities a user can delete in the UI: contacts, leads, deals, files, notes, custom apps.
- Things where recovery matters: workspaces, shared links, forms.
- Skip for: append-only logs (audit, events, runs), pure join tables, runtime config that's reset by replacing it.

---

## Functions

Default to `security invoker` (caller's permissions). Use `security definer` only when the caller needs to elevate — e.g. a public RPC that writes to a table they otherwise can't write to (`waitlist_join`).

Every `security definer` function:

- Has a comment explaining why it needs to be definer.
- Sets `set search_path = public` (else schema-search-path attacks are possible).
- Gates internally on the caller's identity / role where applicable (e.g. `if not public.admin_caller_is_admin() then raise exception 'admin only'; end if;`).

Function grants — explicit, not implicit:

```sql
revoke all on function public.foo(int) from public;
grant execute on function public.foo(int) to authenticated;  -- or `anon, authenticated`
```

Without the `revoke`, Postgres' default is "everyone can execute", which is rarely what you want for a `security definer` function.

---

## Triggers

Use sparingly. They make causality non-local — somebody reading the table definition has to also know about every trigger to understand what an `insert` actually does.

When you do use one:

- Document the side-effect in a SQL comment on the table.
- Prefer a function that's also callable directly (so unit tests can hit it without the trigger).
- Keep them small — heavy logic in triggers can stall writes.

We currently lean on `updated_at = now()` triggers in a few places. That's fine. Application-side denormalisation, search-index maintenance, cascading status updates — push those into application code or a job, not a trigger.

---

## pg_stat_statements + observability

Slow-query review is gated on `pg_stat_statements`. The extension is available on Supabase but not always loaded by default. The hardening migration installs a view + admin RPC behind a `pg_extension` check so the migration runs cleanly whether the extension is present or not.

Table-size monitoring uses `pg_class` + `pg_total_relation_size` and is always available — `table_sizes` is a plain view, no extension needed.

---

## Backups + restore drills

Supabase runs daily logical backups + PITR on paid tiers. We log every executed restore drill in `db_backup_drills` so we can answer "have we ever actually restored from a backup?" with a row ID and not a shrug. The table is service-role-only (RLS enabled, no policies) — drills are recorded by an admin script, not by user action.

A drill is real if it (a) provisioned a fresh DB, (b) restored a backup into it, (c) ran a sanity query against a known table, and (d) recorded the duration. Anything less is a half-drill and should be noted as such in `notes`.
