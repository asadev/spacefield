-- Spacefield AI agent — Phase 2 — per-skill permission gating.
--
-- Three modes per (workspace, skill_id):
--   allow    — execute without confirmation
--   confirm  — bot asks for explicit YES before running
--   deny     — bot refuses
--
-- skill_id matches SkillDefinition.id from lib/agent/skills (e.g.
-- 'crm.deals', 'workspace', 'meta'). When no row exists for a given
-- (workspace, skill) the runtime falls back to a tier-aware default:
-- read-only tools default 'allow'; write tools default 'allow' on
-- personal workspaces and 'confirm' on team workspaces.

create table if not exists public.agent_permissions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  skill_id     text not null,
  mode         text not null check (mode in ('allow','confirm','deny')),
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, skill_id)
);

alter table public.agent_permissions enable row level security;

drop policy if exists "agent_permissions member read" on public.agent_permissions;
create policy "agent_permissions member read"
  on public.agent_permissions for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = agent_permissions.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "agent_permissions admin upsert" on public.agent_permissions;
create policy "agent_permissions admin upsert"
  on public.agent_permissions for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = agent_permissions.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner','admin')
    )
  );

drop policy if exists "agent_permissions admin update" on public.agent_permissions;
create policy "agent_permissions admin update"
  on public.agent_permissions for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = agent_permissions.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = agent_permissions.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner','admin')
    )
  );

drop policy if exists "agent_permissions admin delete" on public.agent_permissions;
create policy "agent_permissions admin delete"
  on public.agent_permissions for delete
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = agent_permissions.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner','admin')
    )
  );

-- Pending approval gating. When the runtime hits a 'confirm' tool it
-- writes a row here and replies "I'd like to … reply YES". The next
-- inbound message from the same user/channel checks for a fresh row
-- (≤ 10 min) and resumes execution if found.
create table if not exists public.agent_pending_approvals (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  channel       text not null,
  skill_id      text not null,
  tool_name     text not null,
  tool_input    jsonb not null,
  summary       text not null,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists agent_pending_approvals_lookup_idx
  on public.agent_pending_approvals(user_id, workspace_id, channel, created_at desc);
create index if not exists agent_pending_approvals_expiry_idx
  on public.agent_pending_approvals(expires_at);

alter table public.agent_pending_approvals enable row level security;

drop policy if exists "agent_pending_approvals self read" on public.agent_pending_approvals;
create policy "agent_pending_approvals self read"
  on public.agent_pending_approvals for select
  using (user_id = auth.uid());

drop policy if exists "agent_pending_approvals self insert" on public.agent_pending_approvals;
create policy "agent_pending_approvals self insert"
  on public.agent_pending_approvals for insert
  with check (user_id = auth.uid());

drop policy if exists "agent_pending_approvals self delete" on public.agent_pending_approvals;
create policy "agent_pending_approvals self delete"
  on public.agent_pending_approvals for delete
  using (user_id = auth.uid());
