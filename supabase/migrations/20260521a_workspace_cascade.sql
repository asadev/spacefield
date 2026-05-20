-- 2026-05-21 Workspace-purge cascade gaps (qa-b-workspace-cascade P0)
--
-- Eleven tables in earlier migrations declared `workspace_id uuid not
-- null` (or nullable) but never added a foreign key to
-- public.workspaces(id). Result: a workspace DELETE either fails with a
-- referential integrity error (where indexes/RLS bind it to a real
-- workspace) or, worse, succeeds and leaves orphan rows that the GDPR
-- purge job has no way to discover.
--
-- This migration walks each of:
--   comments, notifications, activities, tags,
--   time_off_balances, time_off_requests,
--   search_documents, ai_calls, ai_batch_jobs,
--   embeddings, recent_items
-- and idempotently adds a FOREIGN KEY (workspace_id) REFERENCES
-- public.workspaces(id) ON DELETE CASCADE. The original CREATE TABLE
-- statements for all eleven omitted the `references` clause entirely;
-- the constraint name we add follows the standard
-- `<table>_workspace_id_fkey` convention so future migrations can find
-- it deterministically.
--
-- Idempotency: each ADD is wrapped in a DO block that checks
-- pg_constraint first; re-running this migration after a successful
-- application is a no-op. We also defensively guard against rows that
-- might violate the new FK (orphans created before workspaces had a
-- delete-cascade), deleting them before the constraint goes on — this
-- only fires when the constraint is genuinely missing, so it cannot
-- run twice.
--
-- Rollback (manual):
--   alter table public.comments drop constraint if exists comments_workspace_id_fkey;
--   ...and so on for each of the eleven tables.

do $$
declare
  v_table text;
  v_constraint text;
  v_nullable boolean;
  v_orphan_count bigint;
  v_tables text[] := array[
    'comments',
    'notifications',
    'activities',
    'tags',
    'time_off_balances',
    'time_off_requests',
    'search_documents',
    'ai_calls',
    'ai_batch_jobs',
    'embeddings',
    'recent_items'
  ];
begin
  foreach v_table in array v_tables loop
    v_constraint := v_table || '_workspace_id_fkey';

    -- Skip if the constraint already exists with the desired action.
    if exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = v_table
        and c.conname = v_constraint
        and c.contype = 'f'
        and c.confdeltype = 'c'    -- ON DELETE CASCADE
    ) then
      raise notice 'cascade fk already present on %, skipping', v_table;
      continue;
    end if;

    -- If a constraint with the same name exists but with the wrong
    -- action (e.g. NO ACTION), drop it so we can add the cascading one.
    if exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = v_table
        and c.conname = v_constraint
    ) then
      execute format(
        'alter table public.%I drop constraint %I',
        v_table, v_constraint
      );
    end if;

    -- If a differently-named FK on workspace_id already exists with
    -- cascade, leave it alone; this protects against earlier ad-hoc
    -- patches.
    if exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid
                          and a.attnum = any(c.conkey)
      where n.nspname = 'public'
        and t.relname = v_table
        and c.contype = 'f'
        and a.attname = 'workspace_id'
        and c.confdeltype = 'c'
    ) then
      raise notice 'differently-named cascade fk on %.workspace_id, skipping', v_table;
      continue;
    end if;

    -- Drop any other lingering FK on workspace_id (e.g. NO ACTION) that
    -- would prevent us from adding the cascading one.
    for v_constraint in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid
                          and a.attnum = any(c.conkey)
      where n.nspname = 'public'
        and t.relname = v_table
        and c.contype = 'f'
        and a.attname = 'workspace_id'
    loop
      execute format(
        'alter table public.%I drop constraint %I',
        v_table, v_constraint
      );
    end loop;

    -- Detect if workspace_id is nullable on this table (ai_calls,
    -- ai_batch_jobs, embeddings, recent_items declare it nullable).
    select a.attnotnull = false
      into v_nullable
      from pg_attribute a
      join pg_class t on t.oid = a.attrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = v_table
       and a.attname = 'workspace_id';

    -- Clean up orphans before adding the constraint. For nullable
    -- columns we set them to NULL (the lookup still works); for
    -- not-null columns we hard-delete the orphan rows because there's
    -- no valid workspace to attribute them to. Either way this only
    -- runs the first time the migration applies — subsequent runs hit
    -- the early-return above.
    if v_nullable then
      execute format(
        'update public.%I set workspace_id = null '
        || 'where workspace_id is not null '
        || 'and workspace_id not in (select id from public.workspaces)',
        v_table
      );
      get diagnostics v_orphan_count = row_count;
      if v_orphan_count > 0 then
        raise notice 'nulled % orphan rows in %', v_orphan_count, v_table;
      end if;
    else
      execute format(
        'delete from public.%I '
        || 'where workspace_id not in (select id from public.workspaces)',
        v_table
      );
      get diagnostics v_orphan_count = row_count;
      if v_orphan_count > 0 then
        raise notice 'deleted % orphan rows in %', v_orphan_count, v_table;
      end if;
    end if;

    -- Finally add the cascading FK.
    v_constraint := v_table || '_workspace_id_fkey';
    execute format(
      'alter table public.%I '
      || 'add constraint %I '
      || 'foreign key (workspace_id) references public.workspaces(id) '
      || 'on delete cascade',
      v_table, v_constraint
    );
    raise notice 'added % on %', v_constraint, v_table;
  end loop;
end$$;
