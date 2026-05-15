-- 2026-05-14 Tasks + Projects module
--
-- Project-management primitives that sit on top of the shared collab
-- tables landed in 20260514c (comments, notifications, activities,
-- tags, favorites, saved_views). Tasks/projects intentionally do NOT
-- own comments/timeline tables — they participate via the polymorphic
-- (entity_type='task'|'project', entity_id) convention.
--
-- Tables:
--   - projects    workspace-scoped container with an ordered status_schema
--   - tasks       discrete work items, optionally nested via parent_task_id
--
-- RPCs:
--   - task_complete(p_task_id)   atomic complete-and-notify
--   - task_assign(p_task_id, p_assignee_ids)   replace assignees, notify
--
-- Rollback:
--   drop function if exists public.task_assign(uuid, uuid[]) cascade;
--   drop function if exists public.task_complete(uuid) cascade;
--   drop table if exists public.tasks cascade;
--   drop table if exists public.projects cascade;
--
-- Note: workspace_members + is_workspace_member(uuid) live in
-- 20260427_workspace_sharing.sql. activity_emit() lives in 20260514c.

-- ───────────────────────────────────────────────────────────────────
-- Trigger helper: set_updated_at()
-- Defined here defensively. Re-running `create or replace` is safe even
-- if a prior migration already defined it.
-- ───────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────
-- Projects
-- ───────────────────────────────────────────────────────────────────

create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  slug          text not null,
  description   text,
  status        text not null default 'active',
  status_schema jsonb not null default
    '["Todo","In Progress","Done"]'::jsonb,
  color         text,
  icon          text,
  created_by    uuid,
  archived_at   timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now()
);

create unique index if not exists projects_workspace_slug_uniq
  on public.projects (workspace_id, slug);

create index if not exists projects_workspace_idx
  on public.projects (workspace_id, created_at desc)
  where deleted_at is null;

alter table public.projects enable row level security;

create policy projects_select on public.projects
  for select to authenticated
  using (deleted_at is null and public.is_workspace_member(workspace_id));

create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

create policy projects_update on public.projects
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Hard delete denied — soft delete via UPDATE deleted_at instead.
-- (No DELETE policy → RLS denies it for authenticated users.)

-- ───────────────────────────────────────────────────────────────────
-- Tasks
-- ───────────────────────────────────────────────────────────────────

create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete set null,
  parent_task_id  uuid references public.tasks(id) on delete set null,
  title           text not null,
  description     text,
  status          text not null default 'Todo',
  priority        text not null default 'normal',
  assignee_ids    uuid[] not null default '{}',
  due_at          timestamptz,
  start_at        timestamptz,
  completed_at    timestamptz,
  estimate_min    int,
  actual_min      int,
  custom          jsonb not null default '{}',
  created_by      uuid,
  archived_at     timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists tasks_workspace_idx
  on public.tasks (workspace_id, created_at desc)
  where deleted_at is null;

create index if not exists tasks_project_idx
  on public.tasks (project_id, status)
  where deleted_at is null;

create index if not exists tasks_assignees_gin
  on public.tasks using gin (assignee_ids);

create index if not exists tasks_due_idx
  on public.tasks (due_at)
  where completed_at is null and deleted_at is null;

create index if not exists tasks_parent_idx
  on public.tasks (parent_task_id)
  where deleted_at is null;

alter table public.tasks enable row level security;

create policy tasks_select on public.tasks
  for select to authenticated
  using (deleted_at is null and public.is_workspace_member(workspace_id));

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Hard delete denied — soft delete via UPDATE deleted_at instead.

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────
-- RPC: task_complete(p_task_id uuid)
-- Mark a task done, emit activity, notify assignees other than the actor.
-- ───────────────────────────────────────────────────────────────────

create or replace function public.task_complete(p_task_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task          public.tasks%rowtype;
  v_actor         uuid := auth.uid();
  v_assignee      uuid;
begin
  if v_actor is null then
    raise exception 'not signed in';
  end if;

  select * into v_task
    from public.tasks
   where id = p_task_id
     and deleted_at is null
   limit 1;

  if not found then
    raise exception 'task not found';
  end if;

  if not public.is_workspace_member(v_task.workspace_id) then
    raise exception 'not authorized';
  end if;

  update public.tasks
     set status       = 'Done',
         completed_at = coalesce(completed_at, now())
   where id = p_task_id
   returning * into v_task;

  perform public.activity_emit(
    v_task.workspace_id,
    v_actor,
    'completed',
    'task',
    v_task.id,
    jsonb_build_object('title', v_task.title)
  );

  -- Notify each assignee who isn't the actor.
  foreach v_assignee in array v_task.assignee_ids
  loop
    if v_assignee <> v_actor then
      insert into public.notifications
        (recipient_user_id, workspace_id, kind, source_entity_type,
         source_entity_id, actor_user_id, title, body, href, payload)
      values
        (v_assignee, v_task.workspace_id, 'task.completed', 'task',
         v_task.id, v_actor,
         'Task completed: ' || v_task.title, null,
         '/tasks/' || v_task.id::text,
         jsonb_build_object('task_id', v_task.id));
    end if;
  end loop;

  return v_task.id;
end;
$$;

revoke all on function public.task_complete(uuid) from public;
grant execute on function public.task_complete(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────
-- RPC: task_assign(p_task_id uuid, p_assignee_ids uuid[])
-- Replace assignees, emit activity, notify newly added users.
-- ───────────────────────────────────────────────────────────────────

create or replace function public.task_assign(
  p_task_id      uuid,
  p_assignee_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task        public.tasks%rowtype;
  v_actor       uuid := auth.uid();
  v_old_ids     uuid[];
  v_new_ids     uuid[];
  v_added       uuid[];
  v_uid         uuid;
begin
  if v_actor is null then
    raise exception 'not signed in';
  end if;

  select * into v_task
    from public.tasks
   where id = p_task_id
     and deleted_at is null
   limit 1;

  if not found then
    raise exception 'task not found';
  end if;

  if not public.is_workspace_member(v_task.workspace_id) then
    raise exception 'not authorized';
  end if;

  v_old_ids := coalesce(v_task.assignee_ids, '{}'::uuid[]);
  v_new_ids := coalesce(p_assignee_ids, '{}'::uuid[]);

  -- Diff: who is in new but not in old.
  select coalesce(array_agg(x), '{}'::uuid[])
    into v_added
    from unnest(v_new_ids) as x
   where x <> all(v_old_ids);

  update public.tasks
     set assignee_ids = v_new_ids
   where id = p_task_id
   returning * into v_task;

  perform public.activity_emit(
    v_task.workspace_id,
    v_actor,
    'assigned',
    'task',
    v_task.id,
    jsonb_build_object(
      'title',     v_task.title,
      'added',     to_jsonb(v_added),
      'assignees', to_jsonb(v_new_ids)
    )
  );

  foreach v_uid in array v_added
  loop
    if v_uid <> v_actor then
      insert into public.notifications
        (recipient_user_id, workspace_id, kind, source_entity_type,
         source_entity_id, actor_user_id, title, body, href, payload)
      values
        (v_uid, v_task.workspace_id, 'task.assigned', 'task',
         v_task.id, v_actor,
         'Assigned to you: ' || v_task.title, null,
         '/tasks/' || v_task.id::text,
         jsonb_build_object('task_id', v_task.id));
    end if;
  end loop;

  return v_task.id;
end;
$$;

revoke all on function public.task_assign(uuid, uuid[]) from public;
grant execute on function public.task_assign(uuid, uuid[]) to authenticated;
