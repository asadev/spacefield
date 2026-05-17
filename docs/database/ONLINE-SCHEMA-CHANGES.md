# Online schema changes

Running migrations against a live, traffic-bearing database without
causing an outage. Postgres locks are the entire story; almost every
rule below is about avoiding a lock that blocks user queries.

The default-deny rule: if you cannot describe what lock the migration
takes and for how long, do not run it against production.

## The two non-negotiables

1. **Additive-only by default.** Adding tables, columns, indexes,
   policies, and functions is safe. Dropping, renaming, or
   re-typing existing things is risky.
2. **No long-held `ACCESS EXCLUSIVE` locks.** They block reads. A
   blocked SELECT cascades into a thundering herd of queued
   connections and the database falls over.

If you violate either, you need a written plan in the migration
header comment and a manual roll-out (not `db push`).

## Lock primer (short)

Postgres locks you'll see in migrations, in order of severity:

| Lock | What blocks what | When acquired |
| --- | --- | --- |
| `ACCESS SHARE` | Nothing user-visible blocks reads | Every `SELECT` |
| `ROW EXCLUSIVE` | Same | `INSERT`, `UPDATE`, `DELETE` |
| `SHARE UPDATE EXCLUSIVE` | Blocks other DDL but NOT DML | `CREATE INDEX CONCURRENTLY`, `ALTER TABLE ... VALIDATE CONSTRAINT` |
| `SHARE` | Blocks writes (rare in migrations) | `CREATE INDEX` (non-concurrent) |
| `ACCESS EXCLUSIVE` | Blocks **everything** | `ALTER TABLE ADD COLUMN ... DEFAULT <constant>` (PG ≥ 11 cheap), `ALTER TABLE ... TYPE`, `DROP TABLE` |

The `ACCESS EXCLUSIVE` lock is the dangerous one. A 50 ms migration
that holds it is fine. A 5-second one is an outage if a long-running
query is also active.

## Additive-only rules

### Adding a column

```sql
-- Safe: nullable, no default.
alter table public.crm_contacts add column tags text[];

-- Safe in PG ≥ 11: NOT NULL with a constant DEFAULT.
-- (No table rewrite — default is stored in catalog.)
alter table public.crm_contacts
  add column archived boolean not null default false;

-- DANGEROUS: NOT NULL on populated nullable column without DEFAULT.
-- This fails if any existing rows are NULL.
alter table public.crm_contacts alter column owner_id set not null;
```

Don't ship the dangerous form. Either:

- Backfill in a separate migration, then add `not null` in a third.
- Add as `null` first, application-code-enforce `not null`, then
  add the constraint later when the backfill is verified.

### Adding NOT NULL safely

The four-step pattern:

```sql
-- Step 1 (migration A): add nullable column.
alter table public.foo add column status text;

-- Step 2 (backfill script, not a migration): set values.
update public.foo set status = 'active' where status is null;
-- Run in chunks for large tables.

-- Step 3 (migration B): add a CHECK constraint NOT VALID.
alter table public.foo
  add constraint foo_status_not_null check (status is not null) not valid;
-- "NOT VALID" skips the scan of existing rows — instant.

-- Step 4 (migration C): validate.
alter table public.foo validate constraint foo_status_not_null;
-- Takes a SHARE UPDATE EXCLUSIVE lock — does not block reads/writes.

-- Step 5 (optional, after a release cycle): swap to SET NOT NULL.
alter table public.foo alter column status set not null;
-- With the validated CHECK constraint in place, PG can use it as
-- proof and skip a re-scan. Instant.
```

In practice we live with the CHECK constraint and only do step 5
when the column needs to participate in something that requires
true `NOT NULL` (e.g. primary key).

### Adding indexes on large tables

```sql
-- DANGEROUS on a populated table: takes SHARE lock, blocks writes
-- for the duration of the build.
create index foo_bar_idx on public.foo (bar);

-- SAFE: builds without blocking writes.
create index concurrently if not exists foo_bar_idx on public.foo (bar);
```

Three things to know about `CONCURRENTLY`:

1. **It cannot run inside a transaction.** Supabase CLI wraps each
   migration in a transaction by default. Mark the migration as
   non-transactional (the convention is a `-- transactional: false`
   comment at the top, which our migration runner respects) or
   split the index creation into a manual step.
2. **It takes longer** (roughly 2× a regular build) and uses more
   I/O.
3. **It can fail and leave a broken index behind** marked
   `indisvalid = false`. Always check after with:

   ```sql
   select indexrelid::regclass, indisvalid
   from pg_index
   where indrelid = 'public.foo'::regclass;
   ```

   Drop and rebuild any `indisvalid = false` rows before declaring
   the migration successful.

### Renaming a column

Don't. Renaming a column breaks the deployed application until the
new code is live, AND the old code stops issuing queries against the
old name. The right pattern is:

1. Add the new column.
2. Trigger or application-code copies new ↔ old on write.
3. Backfill from old → new.
4. Deploy code that reads/writes the new column.
5. After a soak period (≥ 1 week), drop the old column in a separate
   migration.

For internal-only tables that no client query references, you can
shortcut to a single rename. For anything user-facing, do the dance.

### Dropping a column or table

The four-step pattern, plus a longer soak:

1. Migration A: stop writing the column from application code.
2. (≥ 24 h soak — verify no writes via `pg_stat_user_tables`.)
3. Migration B: drop the column.

For tables, the same flow with "stop reading" between A and B.

### Changing a column type

`ALTER TABLE ... TYPE` rewrites the table under an `ACCESS EXCLUSIVE`
lock. Forbidden against production on tables > 100k rows.

The safe pattern is the same as renaming: add a new column with the
target type, dual-write, backfill, swap reads, drop old.

A common shortcut works for widening: `int` → `bigint` is a metadata
change in PG ≥ 12. Verify on a copy of the table first.

## The migration header

Every migration includes a header documenting:

1. **What** — one paragraph.
2. **Why** — business or technical reason.
3. **Lock estimate** — which locks are taken, on which tables, for
   how long expected. "None except brief catalog locks" is the most
   common answer for additive migrations and is acceptable.
4. **Rollback** — the inverse SQL OR a note explaining it's irreversible.

Example:

```sql
-- 20260517d_add_archived_to_crm_contacts.sql
--
-- What: adds `archived boolean not null default false` to
--       `public.crm_contacts`. Adds a partial index on
--       (workspace_id) where archived is false so the default
--       "active" list stays fast.
--
-- Why: archiving was previously soft-coded via tags; promoting to
--      a first-class column lets us cheaply filter at the DB layer.
--
-- Locks: ALTER TABLE ADD COLUMN with constant DEFAULT — PG ≥ 11
--        catalog-only, no table rewrite. CREATE INDEX CONCURRENTLY
--        for the partial index — takes SHARE UPDATE EXCLUSIVE,
--        does not block reads or writes. Expected total: < 5 s.
--
-- Rollback: alter table public.crm_contacts drop column archived;
--           drop index if exists crm_contacts_active_idx;
```

The header makes "should this go through Supabase CLI `db push` or
needs a manual roll-out?" answerable from reading the file alone.

## Verification

After applying a production migration:

1. `select * from pg_stat_activity where state = 'active' and query_start < now() - interval '5 seconds';`
   — no long queries that the migration kicked off.
2. `select indexrelid::regclass, indisvalid from pg_index where not indisvalid;`
   — no broken concurrent-index builds.
3. Smoke test from the deployed application (a few signed-in reads
   against the affected table).
4. Log the migration date + SHA in `memory/YYYY-MM-DD.md`.
