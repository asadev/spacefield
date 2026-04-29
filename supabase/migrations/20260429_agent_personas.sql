-- Spacefield AI agent — Phase 2 — per-workspace persona.
--
-- Customizes the assistant's tone, name, greeting, and a free-text
-- description that gets injected at the top of every model call's system
-- prompt. Tools + skills stay locked — the persona affects style only.
--
-- One row per workspace; RLS limits SELECT to members and UPDATE/INSERT
-- to admins/owners.

create table if not exists public.agent_personas (
  workspace_id         uuid primary key references public.workspaces(id) on delete cascade,
  bot_name             text not null default 'Spacefield Assistant',
  persona_description  text not null default '',
  voice_tone           text not null default 'friendly'
                         check (voice_tone in ('friendly','formal','casual','direct','playful')),
  custom_greeting      text not null default '',
  updated_by           uuid references auth.users(id) on delete set null,
  updated_at           timestamptz not null default now()
);

alter table public.agent_personas enable row level security;

drop policy if exists "agent_personas member read" on public.agent_personas;
create policy "agent_personas member read"
  on public.agent_personas for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = agent_personas.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "agent_personas admin upsert" on public.agent_personas;
create policy "agent_personas admin upsert"
  on public.agent_personas for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = agent_personas.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner','admin')
    )
  );

drop policy if exists "agent_personas admin update" on public.agent_personas;
create policy "agent_personas admin update"
  on public.agent_personas for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = agent_personas.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = agent_personas.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner','admin')
    )
  );
