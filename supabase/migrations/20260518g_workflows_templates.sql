-- 2026-05-18 W6 — Visual workflow builder + industry workspace templates
--
-- Adds:
--   1. public.workflows               — workspace-scoped workflow definitions
--                                       authored in the new visual builder.
--                                       Distinct from `agent_workflows` which
--                                       is the global, admin-only AI runtime
--                                       registry (skills/tools/prompts/branch
--                                       steps). `workflows` is for end-user
--                                       automation: trigger → conditions →
--                                       steps that the runtime dispatcher can
--                                       enqueue per workspace.
--   2. public.workspace_templates     — pre-baked industry seed packs that an
--                                       admin can apply to any workspace in
--                                       one click. JSON body lists the rows
--                                       to insert keyed by table name.
--   3. public.apply_workspace_template — SECURITY DEFINER RPC that inserts
--                                       the template's seed rows for the
--                                       caller's workspace (must be owner/
--                                       admin). Returns the row count.
--
-- Schema notes:
--   - `workflows.definition` holds the full WorkflowDefinition JSON from
--     lib/workflows/types.ts so we don't have to chase schema changes
--     every time the builder grows a new step kind.
--   - We keep `name` / `trigger_kind` / `enabled` denormalised at top
--     level so the admin index page can filter without parsing JSON.
--   - `workspace_templates.body` shape:
--       {
--         "tables": {
--           "<table>": [ <row>, <row>, ... ],
--           ...
--         },
--         "summary": "<one-line description>"
--       }
--     Rows are inserted in the order listed; rows in one table may
--     reference rows in a prior table by `__ref` / `__id` aliases
--     (string keys we resolve to UUIDs at apply time).

-- ─────────────────────────── workflows ───────────────────────────
create table if not exists public.workflows (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  description   text,
  -- 'manual' | 'schedule' | 'event'
  trigger_kind  text not null default 'manual'
                  check (trigger_kind in ('manual','schedule','event')),
  enabled       boolean not null default true,
  -- Full WorkflowDefinition JSON (see lib/workflows/types.ts).
  definition    jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists workflows_workspace_idx
  on public.workflows (workspace_id, updated_at desc);

create index if not exists workflows_workspace_enabled_idx
  on public.workflows (workspace_id, enabled);

alter table public.workflows enable row level security;

drop policy if exists workflows_select on public.workflows;
create policy workflows_select on public.workflows
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists workflows_insert on public.workflows;
create policy workflows_insert on public.workflows
  for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and public.workspace_role_of(workspace_id) in ('owner','admin')
  );

drop policy if exists workflows_update on public.workflows;
create policy workflows_update on public.workflows
  for update to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and public.workspace_role_of(workspace_id) in ('owner','admin')
  )
  with check (
    public.is_workspace_member(workspace_id)
    and public.workspace_role_of(workspace_id) in ('owner','admin')
  );

drop policy if exists workflows_delete on public.workflows;
create policy workflows_delete on public.workflows
  for delete to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and public.workspace_role_of(workspace_id) in ('owner','admin')
  );

-- Service-role admin policy (mirrors other admin-managed tables so the
-- /admin/workflows/builder server actions, which use the admin client,
-- can read/write rows on any workspace).
drop policy if exists workflows_admin_all on public.workflows;
create policy workflows_admin_all on public.workflows
  for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- Keep updated_at fresh.
create or replace function public.workflows_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workflows_set_updated_at on public.workflows;
create trigger workflows_set_updated_at
  before update on public.workflows
  for each row execute function public.workflows_set_updated_at();

-- ─────────────────────── workspace_templates ───────────────────────
create table if not exists public.workspace_templates (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  industry      text not null,
  description   text,
  icon          text,
  body          jsonb not null default '{}'::jsonb,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists workspace_templates_enabled_idx
  on public.workspace_templates (enabled, industry);

alter table public.workspace_templates enable row level security;

-- Anyone signed in can read enabled templates (so the in-app "apply
-- template" picker works for end users too, not just admins).
drop policy if exists workspace_templates_select on public.workspace_templates;
create policy workspace_templates_select on public.workspace_templates
  for select to authenticated
  using (enabled = true);

-- Only admins manage the catalog.
drop policy if exists workspace_templates_admin_all on public.workspace_templates;
create policy workspace_templates_admin_all on public.workspace_templates
  for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- ─────────────────────────── seed rows ───────────────────────────
-- We seed three industry templates here. Bodies are loaded from
-- lib/workflows/seed-templates.ts in the admin /admin/templates UI to
-- keep migration size sane and let us hot-edit copy without a new
-- migration. The rows below give the catalog an initial shape;
-- /admin/templates renders the canonical body from TypeScript.
insert into public.workspace_templates (slug, name, industry, description, icon, body)
values
  (
    'real-estate-brokerage',
    'Real Estate Brokerage',
    'real_estate',
    'Sales pipeline, lead intake, property poster templates, and three sample listings to demo the CRM.',
    'home',
    '{}'::jsonb
  ),
  (
    'marketing-agency',
    'Marketing Agency',
    'marketing',
    'Client pipeline, project kickoff checklist, and a sample retainer project to demo task flow.',
    'megaphone',
    '{}'::jsonb
  ),
  (
    'coworking-space',
    'Co-working Space',
    'coworking',
    'Member roster, bookable rooms, and three sample bookings so the day-pass flow works on day one.',
    'building',
    '{}'::jsonb
  )
on conflict (slug) do nothing;

-- ─────────────────────── apply_workspace_template ───────────────────────
-- SECURITY DEFINER so the function can insert into RLS-protected tables
-- on behalf of the calling user — but only after we explicitly check
-- they are a workspace owner/admin via the existing helpers.
--
-- The template body is expected to be loaded from TypeScript and PATCHED
-- into the workspace_templates row before calling this (the admin UI
-- does that on demand). The function reads body->'tables' as
-- {table_name: [rows...]}.
--
-- Returns: total rows inserted. Throws on permission failure.
--
-- We only allow a fixed allow-list of target tables to avoid letting a
-- malicious row author smuggle inserts into tables they have no
-- business touching (e.g. profiles, admin_audit_log).
create or replace function public.apply_workspace_template(
  p_template_id uuid,
  p_workspace_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body         jsonb;
  v_tables       jsonb;
  v_table_name   text;
  v_rows         jsonb;
  v_row          jsonb;
  v_inserted     int := 0;
  v_allowed      text[] := array[
    'crm_pipelines',
    'crm_pipeline_stages',
    'crm_companies',
    'crm_contacts',
    'crm_leads',
    'crm_deals',
    'crm_activities',
    'projects',
    'tasks',
    'employees'
  ];
begin
  -- Membership + role gate. Service-role calls from the admin panel
  -- have auth.uid() = null — we let those through because the
  -- /admin/templates page already passed assertAdmin() before
  -- dispatching here. End-user calls (auth.uid() not null) must be
  -- a workspace owner/admin.
  if auth.uid() is not null then
    if not public.is_workspace_member(p_workspace_id) then
      raise exception 'forbidden: not a workspace member';
    end if;
    if public.workspace_role_of(p_workspace_id) not in ('owner','admin') then
      raise exception 'forbidden: owner/admin role required';
    end if;
  end if;

  -- Load template body. We expect the caller to have populated it.
  select body into v_body
    from public.workspace_templates
    where id = p_template_id
      and enabled = true;
  if v_body is null then
    raise exception 'template not found or disabled';
  end if;

  v_tables := v_body -> 'tables';
  if v_tables is null then
    return 0;
  end if;

  -- Iterate { table_name: [rows...] } in insertion order. JSONB
  -- preserves key order — we rely on that so we can insert pipelines
  -- before stages, contacts before deals, etc.
  for v_table_name, v_rows in
    select * from jsonb_each(v_tables)
  loop
    -- Allow-list guard: silently skip unknown tables instead of
    -- raising — that way a template author can include forward-
    -- looking tables without crashing.
    if not (v_table_name = any(v_allowed)) then
      continue;
    end if;

    for v_row in select * from jsonb_array_elements(v_rows)
    loop
      -- All target tables share `workspace_id` as their tenancy key.
      -- We inject it via JSONB merge so the body authors don't have
      -- to hardcode (and can't escape to a different workspace).
      v_row := v_row - 'workspace_id' || jsonb_build_object(
        'workspace_id', p_workspace_id::text
      );

      -- Dispatch by table name. Each branch only consumes columns it
      -- knows about; unknown keys are ignored.
      if v_table_name = 'crm_pipelines' then
        insert into public.crm_pipelines (workspace_id, name, is_default, position)
        values (
          p_workspace_id,
          v_row->>'name',
          coalesce((v_row->>'is_default')::boolean, false),
          coalesce((v_row->>'position')::int, 0)
        );
        v_inserted := v_inserted + 1;

      elsif v_table_name = 'crm_pipeline_stages' then
        -- Stages reference a pipeline. We look it up by name within
        -- the workspace — templates use stable names.
        insert into public.crm_pipeline_stages (
          pipeline_id, name, kind, position, probability, color
        )
        select
          p.id,
          v_row->>'name',
          coalesce(v_row->>'kind', 'open'),
          coalesce((v_row->>'position')::int, 0),
          coalesce((v_row->>'probability')::int, 50),
          v_row->>'color'
        from public.crm_pipelines p
        where p.workspace_id = p_workspace_id
          and p.name = v_row->>'pipeline_name'
        limit 1;
        v_inserted := v_inserted + 1;

      elsif v_table_name = 'crm_companies' then
        insert into public.crm_companies (
          workspace_id, name, domain, industry, city, country, notes
        ) values (
          p_workspace_id,
          v_row->>'name',
          v_row->>'domain',
          v_row->>'industry',
          v_row->>'city',
          v_row->>'country',
          v_row->>'notes'
        );
        v_inserted := v_inserted + 1;

      elsif v_table_name = 'crm_contacts' then
        insert into public.crm_contacts (
          workspace_id, first_name, last_name, email, phone, job_title, notes
        ) values (
          p_workspace_id,
          v_row->>'first_name',
          v_row->>'last_name',
          v_row->>'email',
          v_row->>'phone',
          v_row->>'job_title',
          v_row->>'notes'
        );
        v_inserted := v_inserted + 1;

      elsif v_table_name = 'crm_leads' then
        insert into public.crm_leads (
          workspace_id, first_name, last_name, email, phone, source, status, notes
        ) values (
          p_workspace_id,
          v_row->>'first_name',
          v_row->>'last_name',
          v_row->>'email',
          v_row->>'phone',
          v_row->>'source',
          coalesce(v_row->>'status', 'new'),
          v_row->>'notes'
        );
        v_inserted := v_inserted + 1;

      elsif v_table_name = 'crm_deals' then
        -- Deals MUST reference a pipeline + stage. We resolve by name.
        insert into public.crm_deals (
          workspace_id, pipeline_id, stage_id, name, amount, currency, status
        )
        select
          p_workspace_id,
          p.id,
          s.id,
          v_row->>'name',
          (v_row->>'amount')::numeric,
          coalesce(v_row->>'currency', 'USD'),
          coalesce(v_row->>'status', 'open')
        from public.crm_pipelines p
        join public.crm_pipeline_stages s on s.pipeline_id = p.id
        where p.workspace_id = p_workspace_id
          and p.name = v_row->>'pipeline_name'
          and s.name = v_row->>'stage_name'
        limit 1;
        v_inserted := v_inserted + 1;

      elsif v_table_name = 'projects' then
        insert into public.projects (workspace_id, name, slug, description, status)
        values (
          p_workspace_id,
          v_row->>'name',
          coalesce(v_row->>'slug',
            regexp_replace(lower(v_row->>'name'), '[^a-z0-9]+', '-', 'g')),
          v_row->>'description',
          coalesce(v_row->>'status', 'active')
        )
        on conflict (workspace_id, slug) do nothing;
        v_inserted := v_inserted + 1;

      elsif v_table_name = 'tasks' then
        -- Tasks may reference a project by name within the workspace.
        insert into public.tasks (
          workspace_id, project_id, title, description, status, priority
        )
        select
          p_workspace_id,
          pr.id,
          v_row->>'title',
          v_row->>'description',
          coalesce(v_row->>'status', 'Todo'),
          coalesce(v_row->>'priority', 'normal')
        from public.projects pr
        where pr.workspace_id = p_workspace_id
          and pr.name = v_row->>'project_name'
        limit 1;
        v_inserted := v_inserted + 1;

      elsif v_table_name = 'employees' then
        insert into public.employees (
          workspace_id, full_name, email, job_title, department, employment_type, status
        ) values (
          p_workspace_id,
          v_row->>'full_name',
          v_row->>'email',
          v_row->>'job_title',
          v_row->>'department',
          coalesce(v_row->>'employment_type', 'full_time'),
          coalesce(v_row->>'status', 'active')
        );
        v_inserted := v_inserted + 1;

      elsif v_table_name = 'crm_activities' then
        insert into public.crm_activities (
          workspace_id, kind, subject, body
        ) values (
          p_workspace_id,
          coalesce(v_row->>'kind', 'note'),
          v_row->>'subject',
          v_row->>'body'
        );
        v_inserted := v_inserted + 1;
      end if;
    end loop;
  end loop;

  return v_inserted;
end;
$$;

-- Lock down EXECUTE so only authenticated users can call it (anon/
-- service-role aside, which keep their broader perms).
revoke all on function public.apply_workspace_template(uuid, uuid) from public;
grant execute on function public.apply_workspace_template(uuid, uuid)
  to authenticated, service_role;
