# Spacefield migrations

Short rules. The longer reference lives in [`docs/database/CONVENTIONS.md`](../../docs/database/CONVENTIONS.md).

## File naming

`YYYYMMDD[letter]_<slug>.sql`

- One date prefix per calendar day.
- Append a lowercase letter (`a`, `b`, `c`…) when multiple migrations land the same day, so file-system ordering matches application order.
- `<slug>` is lower_snake_case and describes the change in 3-6 words.

Examples:

```
20260509_admin_panel_foundation.sql
20260509b_admin_panel_v2.sql
20260514a_observability.sql
20260514b_database_hardening.sql
```

## Additive-only

This is the rule. No `drop`, no destructive `alter` (column type narrowings, NOT NULL on a populated nullable column, etc.) without explicit cross-agent coordination AND a written rollback plan.

If you need to remove something, deprecate in one migration (stop writing to it) and drop in a later one, after every deploy has rolled forward.

## Rollback expectation

Every migration's top comment block MUST explain how to roll back. Either:

1. The inverse SQL (preferred), or
2. A clear note that the migration is irreversible and why (e.g. backfills a generated column from now-lost source data).

If you can't write a rollback you probably shouldn't be writing the migration that way.

## Idempotency

Every statement runs cleanly twice. Use:

- `create table if not exists`
- `create index if not exists`
- `create or replace function|view`
- `add column if not exists`
- `drop policy if exists` immediately before `create policy` (Postgres has no `create policy if not exists`).
- `do $$ … if exists/if not exists … $$` blocks for anything that doesn't have a built-in idempotent form.

## Naming

- Lower snake_case everywhere — tables, columns, functions, views, indexes.
- Plural table names (`crm_contacts`, not `crm_contact`).
- Foreign keys end in `_id` and reference the singular form.
- Timestamps end in `_at` (`created_at`, `updated_at`, `deleted_at`).
- Booleans read naturally — `is_published`, `published`, `ok` — pick what reads cleanest at the call site.

## RLS

Every multi-tenant table has `enable row level security`. Service-role-only tables (background-job state, drill logs, raw audit) enable RLS with **zero policies** — anything that needs to read them goes through the service role.

Default-deny. Add the narrowest permissive policy that works, and prefer `as restrictive` when you need a hard guarantee no other policy can override (see the append-only audit-log policies in `20260514b_database_hardening.sql`).

## Pointer

For the full conventions — schema layout, index strategy, soft-delete pattern, function grants, the works — read [`docs/database/CONVENTIONS.md`](../../docs/database/CONVENTIONS.md).
