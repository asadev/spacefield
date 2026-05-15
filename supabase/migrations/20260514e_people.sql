-- 2026-05-14 People (HR) module.
--
-- Employee directory + profiles + org chart + time-off (policies, balances,
-- requests, approvals) + document storage with expiry tracker + onboarding
-- checklist templates. UAE-aware (Emirates ID / visa expiry tracking).
--
-- Tables created:
--   - employees             one row per person (user OR contractor) per workspace
--   - time_off_policies     PTO/sick/etc with accrual rules
--   - time_off_balances     balance per (employee, policy)
--   - time_off_requests     submitted requests with approval state
--   - onboarding_templates  reusable template (jsonb tasks array)
--   - onboarding_runs       instantiated template for an employee
--   - employee_documents    EID / visa / passport / contract with expiry
--
-- RPCs:
--   - submit_time_off_request   : compute days, insert request, emit activity + notify manager
--   - decide_time_off_request   : approve/deny; on approve, debit balance
--   - expiring_docs             : list documents expiring within N days
--
-- Convention: all tables polymorphically participate in the collab
-- primitives via (entity_type, entity_id) = ('employee', employees.id).
--
-- Rollback:
--   drop table if exists
--     public.employee_documents,
--     public.onboarding_runs,
--     public.onboarding_templates,
--     public.time_off_requests,
--     public.time_off_balances,
--     public.time_off_policies,
--     public.employees
--   cascade;

-- ───────────────────────────────────────────────────────────────────
-- Employees
-- ───────────────────────────────────────────────────────────────────

create table if not exists public.employees (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  user_id          uuid,
  email            text,
  full_name        text not null,
  job_title        text,
  department       text,
  manager_id       uuid references public.employees(id) on delete set null,
  location         text,
  employment_type  text not null default 'full_time',
  hire_date        date,
  termination_date date,
  status           text not null default 'active',
  custom           jsonb not null default '{}',
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists employees_workspace_idx
  on public.employees (workspace_id, status);

create index if not exists employees_manager_idx
  on public.employees (manager_id);

create unique index if not exists employees_workspace_user_uniq
  on public.employees (workspace_id, user_id) where user_id is not null;

alter table public.employees enable row level security;

drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees
  for insert to authenticated
  with check (
    public.workspace_role_of(workspace_id) in ('owner','admin')
  );

drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees
  for update to authenticated
  using (
    public.workspace_role_of(workspace_id) in ('owner','admin')
    or user_id = auth.uid()
  )
  with check (
    public.workspace_role_of(workspace_id) in ('owner','admin')
    or user_id = auth.uid()
  );

drop policy if exists employees_delete on public.employees;
create policy employees_delete on public.employees
  for delete to authenticated
  using (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- Keep updated_at fresh.
create or replace function public.employees_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists employees_touch_updated_at on public.employees;
create trigger employees_touch_updated_at
  before update on public.employees
  for each row execute function public.employees_touch_updated_at();

-- ───────────────────────────────────────────────────────────────────
-- Time-off policies
-- ───────────────────────────────────────────────────────────────────

create table if not exists public.time_off_policies (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  name                  text not null,
  kind                  text not null default 'pto',
  accrual_per_year_days numeric not null default 20,
  carryover_max         numeric default 5,
  cap                   numeric,
  active                boolean not null default true,
  created_at            timestamptz not null default now()
);

create index if not exists time_off_policies_workspace_idx
  on public.time_off_policies (workspace_id, active);

alter table public.time_off_policies enable row level security;

drop policy if exists time_off_policies_select on public.time_off_policies;
create policy time_off_policies_select on public.time_off_policies
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists time_off_policies_modify on public.time_off_policies;
create policy time_off_policies_modify on public.time_off_policies
  for all to authenticated
  using (public.workspace_role_of(workspace_id) in ('owner','admin'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- ───────────────────────────────────────────────────────────────────
-- Time-off balances
-- ───────────────────────────────────────────────────────────────────

create table if not exists public.time_off_balances (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  policy_id    uuid not null references public.time_off_policies(id) on delete cascade,
  balance_days numeric not null default 0,
  as_of        date not null default current_date
);

create unique index if not exists time_off_balances_uniq
  on public.time_off_balances (employee_id, policy_id);

alter table public.time_off_balances enable row level security;

drop policy if exists time_off_balances_select on public.time_off_balances;
create policy time_off_balances_select on public.time_off_balances
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists time_off_balances_modify on public.time_off_balances;
create policy time_off_balances_modify on public.time_off_balances
  for all to authenticated
  using (public.workspace_role_of(workspace_id) in ('owner','admin'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- ───────────────────────────────────────────────────────────────────
-- Time-off requests
-- ───────────────────────────────────────────────────────────────────

create table if not exists public.time_off_requests (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  policy_id    uuid not null references public.time_off_policies(id),
  start_date   date not null,
  end_date     date not null,
  days         numeric not null,
  reason       text,
  status       text not null default 'pending',
  approved_by  uuid,
  decided_at   timestamptz,
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists time_off_requests_employee_idx
  on public.time_off_requests (employee_id, status);

create index if not exists time_off_requests_workspace_idx
  on public.time_off_requests (workspace_id, start_date);

alter table public.time_off_requests enable row level security;

drop policy if exists time_off_requests_select on public.time_off_requests;
create policy time_off_requests_select on public.time_off_requests
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists time_off_requests_insert on public.time_off_requests;
create policy time_off_requests_insert on public.time_off_requests
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists time_off_requests_update on public.time_off_requests;
create policy time_off_requests_update on public.time_off_requests
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ───────────────────────────────────────────────────────────────────
-- Onboarding templates + runs
-- ───────────────────────────────────────────────────────────────────

create table if not exists public.onboarding_templates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  tasks        jsonb not null default '[]',
  created_at   timestamptz not null default now()
);

create index if not exists onboarding_templates_workspace_idx
  on public.onboarding_templates (workspace_id);

alter table public.onboarding_templates enable row level security;

drop policy if exists onboarding_templates_select on public.onboarding_templates;
create policy onboarding_templates_select on public.onboarding_templates
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists onboarding_templates_modify on public.onboarding_templates;
create policy onboarding_templates_modify on public.onboarding_templates
  for all to authenticated
  using (public.workspace_role_of(workspace_id) in ('owner','admin'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin'));

create table if not exists public.onboarding_runs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  template_id  uuid references public.onboarding_templates(id),
  tasks_state  jsonb not null default '[]',
  started_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists onboarding_runs_employee_idx
  on public.onboarding_runs (employee_id);

create index if not exists onboarding_runs_workspace_idx
  on public.onboarding_runs (workspace_id);

alter table public.onboarding_runs enable row level security;

drop policy if exists onboarding_runs_select on public.onboarding_runs;
create policy onboarding_runs_select on public.onboarding_runs
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists onboarding_runs_modify on public.onboarding_runs;
create policy onboarding_runs_modify on public.onboarding_runs
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ───────────────────────────────────────────────────────────────────
-- Employee documents (EID / visa / passport / contract / certification)
-- ───────────────────────────────────────────────────────────────────

create table if not exists public.employee_documents (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  kind         text not null,
  name         text not null,
  file_url     text,
  number       text,
  issued_at    date,
  expires_at   date,
  notes        text,
  uploaded_by  uuid,
  created_at   timestamptz not null default now()
);

create index if not exists employee_documents_employee_idx
  on public.employee_documents (employee_id);

create index if not exists employee_documents_expiry_idx
  on public.employee_documents (expires_at) where expires_at is not null;

create index if not exists employee_documents_workspace_idx
  on public.employee_documents (workspace_id);

alter table public.employee_documents enable row level security;

drop policy if exists employee_documents_select on public.employee_documents;
create policy employee_documents_select on public.employee_documents
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists employee_documents_modify on public.employee_documents;
create policy employee_documents_modify on public.employee_documents
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ───────────────────────────────────────────────────────────────────
-- RPC: submit_time_off_request
--
-- Computes inclusive day count, inserts request, emits an activity row,
-- and notifies the employee's manager (if any) via notifications insert.
-- ───────────────────────────────────────────────────────────────────

create or replace function public.submit_time_off_request(
  p_policy_id uuid,
  p_start     date,
  p_end       date,
  p_reason    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee   public.employees%rowtype;
  v_policy     public.time_off_policies%rowtype;
  v_days       numeric;
  v_request_id uuid;
  v_manager_user_id uuid;
begin
  if p_start is null or p_end is null then
    raise exception 'start and end dates required';
  end if;
  if p_end < p_start then
    raise exception 'end date must be on/after start date';
  end if;

  select * into v_policy
    from public.time_off_policies
   where id = p_policy_id;
  if not found then
    raise exception 'policy not found';
  end if;

  if not public.is_workspace_member(v_policy.workspace_id) then
    raise exception 'not a workspace member';
  end if;

  -- Find the employee row for the caller in this workspace.
  select * into v_employee
    from public.employees
   where workspace_id = v_policy.workspace_id
     and user_id = auth.uid()
   limit 1;

  if not found then
    raise exception 'no employee record for caller';
  end if;

  v_days := (p_end - p_start) + 1;

  insert into public.time_off_requests (
    workspace_id, employee_id, policy_id,
    start_date, end_date, days, reason, status
  )
  values (
    v_policy.workspace_id, v_employee.id, v_policy.id,
    p_start, p_end, v_days, p_reason, 'pending'
  )
  returning id into v_request_id;

  -- Emit activity (non-blocking — wrap in begin/exception).
  begin
    perform public.activity_emit(
      v_policy.workspace_id,
      auth.uid(),
      'timeoff.submitted',
      'time_off_request',
      v_request_id,
      jsonb_build_object(
        'days', v_days,
        'start', p_start,
        'end', p_end,
        'policy', v_policy.name
      )
    );
  exception when others then null;
  end;

  -- Notify manager (if employee has one with a user_id).
  if v_employee.manager_id is not null then
    select user_id into v_manager_user_id
      from public.employees
     where id = v_employee.manager_id;
    if v_manager_user_id is not null then
      begin
        insert into public.notifications (
          recipient_user_id, workspace_id, kind,
          source_entity_type, source_entity_id,
          actor_user_id, title, body, href
        )
        values (
          v_manager_user_id,
          v_policy.workspace_id,
          'timeoff.requested',
          'time_off_request',
          v_request_id,
          auth.uid(),
          coalesce(v_employee.full_name, 'A team member') || ' requested time off',
          v_days || ' day(s) — ' || p_start::text || ' to ' || p_end::text,
          '/people/time-off?req=' || v_request_id::text
        );
      exception when others then null;
      end;
    end if;
  end if;

  return v_request_id;
end;
$$;

revoke all on function public.submit_time_off_request(uuid, date, date, text) from public;
grant execute on function public.submit_time_off_request(uuid, date, date, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────
-- RPC: decide_time_off_request
--
-- Approve or deny a request. Only the requester's manager OR a workspace
-- owner/admin can decide. On approve, debits the policy balance.
-- ───────────────────────────────────────────────────────────────────

create or replace function public.decide_time_off_request(
  p_request_id uuid,
  p_decision   text,                              -- 'approved' | 'denied' | 'cancelled'
  p_notes      text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request    public.time_off_requests%rowtype;
  v_employee   public.employees%rowtype;
  v_manager    public.employees%rowtype;
  v_caller_role public.workspace_role;
  v_can_decide boolean := false;
begin
  if p_decision not in ('approved','denied','cancelled') then
    raise exception 'invalid decision';
  end if;

  select * into v_request from public.time_off_requests where id = p_request_id;
  if not found then
    raise exception 'request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'request already decided';
  end if;

  select * into v_employee from public.employees where id = v_request.employee_id;

  v_caller_role := public.workspace_role_of(v_request.workspace_id);

  if v_caller_role in ('owner','admin') then
    v_can_decide := true;
  elsif v_employee.manager_id is not null then
    select * into v_manager from public.employees where id = v_employee.manager_id;
    if v_manager.user_id = auth.uid() then
      v_can_decide := true;
    end if;
  end if;

  -- Allow the employee themself to cancel their own pending request.
  if p_decision = 'cancelled' and v_employee.user_id = auth.uid() then
    v_can_decide := true;
  end if;

  if not v_can_decide then
    raise exception 'not authorized to decide this request';
  end if;

  update public.time_off_requests
     set status      = p_decision,
         approved_by = auth.uid(),
         decided_at  = now(),
         notes       = coalesce(p_notes, notes)
   where id = p_request_id;

  -- On approve: debit balance (insert if missing).
  if p_decision = 'approved' then
    insert into public.time_off_balances (workspace_id, employee_id, policy_id, balance_days)
    values (v_request.workspace_id, v_request.employee_id, v_request.policy_id, 0 - v_request.days)
    on conflict (employee_id, policy_id)
    do update set balance_days = public.time_off_balances.balance_days - v_request.days;
  end if;

  -- Activity + notify requester.
  begin
    perform public.activity_emit(
      v_request.workspace_id,
      auth.uid(),
      'timeoff.' || p_decision,
      'time_off_request',
      v_request.id,
      jsonb_build_object('days', v_request.days)
    );
  exception when others then null;
  end;

  if v_employee.user_id is not null and v_employee.user_id <> auth.uid() then
    begin
      insert into public.notifications (
        recipient_user_id, workspace_id, kind,
        source_entity_type, source_entity_id,
        actor_user_id, title, body, href
      )
      values (
        v_employee.user_id,
        v_request.workspace_id,
        'timeoff.' || p_decision,
        'time_off_request',
        v_request.id,
        auth.uid(),
        'Your time-off request was ' || p_decision,
        v_request.days || ' day(s) — ' || v_request.start_date::text || ' to ' || v_request.end_date::text,
        '/people/time-off'
      );
    exception when others then null;
    end;
  end if;
end;
$$;

revoke all on function public.decide_time_off_request(uuid, text, text) from public;
grant execute on function public.decide_time_off_request(uuid, text, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────
-- RPC: expiring_docs
--
-- Returns documents with expires_at within p_within_days, for any
-- workspace the caller is a member of. Used by the expiry dashboard.
-- ───────────────────────────────────────────────────────────────────

create or replace function public.expiring_docs(p_within_days int default 30)
returns table (
  id           uuid,
  workspace_id uuid,
  employee_id  uuid,
  employee_name text,
  kind         text,
  name         text,
  number       text,
  expires_at   date,
  days_left    int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.workspace_id,
    d.employee_id,
    e.full_name as employee_name,
    d.kind,
    d.name,
    d.number,
    d.expires_at,
    (d.expires_at - current_date)::int as days_left
  from public.employee_documents d
  join public.employees e on e.id = d.employee_id
  where d.expires_at is not null
    and d.expires_at <= current_date + (p_within_days || ' days')::interval
    and public.is_workspace_member(d.workspace_id)
  order by d.expires_at asc nulls last;
$$;

revoke all on function public.expiring_docs(int) from public;
grant execute on function public.expiring_docs(int) to authenticated;
