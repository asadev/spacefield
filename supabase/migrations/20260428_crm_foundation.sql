-- 2026-04-28 CRM foundation: contacts/companies/deals/leads/activities/
-- inventory + pipelines/stages + tags + custom fields + saved views.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ─── pipelines + stages ───
create table if not exists public.crm_pipelines (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  is_default    boolean not null default false,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (workspace_id, name)
);
create index if not exists crm_pipelines_ws_idx on public.crm_pipelines(workspace_id);

create table if not exists public.crm_pipeline_stages (
  id            uuid primary key default gen_random_uuid(),
  pipeline_id   uuid not null references public.crm_pipelines(id) on delete cascade,
  name          text not null,
  -- 'open' | 'won' | 'lost' — controls deal lifecycle math
  kind          text not null default 'open' check (kind in ('open', 'won', 'lost')),
  position      integer not null default 0,
  -- Auto-rotting: deals stuck N days flag as stale.
  rot_days      integer,
  -- Win probability 0-100 for forecast.
  probability   integer not null default 50 check (probability between 0 and 100),
  color         text,
  created_at    timestamptz not null default now(),
  unique (pipeline_id, name)
);
create index if not exists crm_stages_pipeline_idx on public.crm_pipeline_stages(pipeline_id, position);

-- ─── companies ───
create table if not exists public.crm_companies (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  domain        text,
  industry      text,
  size          text,
  phone         text,
  website       text,
  address       text,
  city          text,
  country       text,
  notes         text,
  -- visibility: 'public' | 'team' | 'assigned' | 'owner'
  visibility    text not null default 'public' check (visibility in ('public','team','assigned','owner')),
  owner_id      uuid references auth.users(id) on delete set null,
  -- Custom fields keyed by custom_fields.key
  custom        jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists crm_companies_ws_idx on public.crm_companies(workspace_id);
create index if not exists crm_companies_owner_idx on public.crm_companies(owner_id);
create index if not exists crm_companies_name_trgm on public.crm_companies using gin (name gin_trgm_ops);

-- ─── contacts ───
create table if not exists public.crm_contacts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  first_name    text,
  last_name     text,
  email         text,
  phone         text,
  job_title     text,
  company_id    uuid references public.crm_companies(id) on delete set null,
  notes         text,
  visibility    text not null default 'public' check (visibility in ('public','team','assigned','owner')),
  owner_id      uuid references auth.users(id) on delete set null,
  custom        jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists crm_contacts_ws_idx on public.crm_contacts(workspace_id);
create index if not exists crm_contacts_company_idx on public.crm_contacts(company_id);
create index if not exists crm_contacts_email_idx on public.crm_contacts(workspace_id, email);

-- ─── deals ───
create table if not exists public.crm_deals (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  pipeline_id   uuid not null references public.crm_pipelines(id) on delete restrict,
  stage_id      uuid not null references public.crm_pipeline_stages(id) on delete restrict,
  name          text not null,
  amount        numeric(14,2),
  currency      text not null default 'USD',
  close_date    date,
  primary_contact_id uuid references public.crm_contacts(id) on delete set null,
  company_id    uuid references public.crm_companies(id) on delete set null,
  -- Multiple assignees — ARRAY of user_ids.
  assignee_ids  uuid[] not null default '{}'::uuid[],
  -- Sort within stage (for kanban drag-drop ordering).
  position      integer not null default 0,
  visibility    text not null default 'public' check (visibility in ('public','team','assigned','owner')),
  owner_id      uuid references auth.users(id) on delete set null,
  status        text not null default 'open' check (status in ('open','won','lost')),
  custom        jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  closed_at     timestamptz
);
create index if not exists crm_deals_ws_idx on public.crm_deals(workspace_id);
create index if not exists crm_deals_stage_idx on public.crm_deals(stage_id, position);
create index if not exists crm_deals_assignees_idx on public.crm_deals using gin (assignee_ids);

-- ─── leads ───
-- Pre-qualified prospects. On qualification, convert to contact+deal.
create table if not exists public.crm_leads (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  first_name    text,
  last_name     text,
  email         text,
  phone         text,
  source        text,
  status        text not null default 'new' check (status in ('new','working','qualified','disqualified','converted')),
  notes         text,
  -- After conversion, link the resulting contact + deal so we don't lose history.
  converted_contact_id uuid references public.crm_contacts(id) on delete set null,
  converted_deal_id    uuid references public.crm_deals(id) on delete set null,
  visibility    text not null default 'public' check (visibility in ('public','team','assigned','owner')),
  owner_id      uuid references auth.users(id) on delete set null,
  custom        jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists crm_leads_ws_idx on public.crm_leads(workspace_id);
create index if not exists crm_leads_status_idx on public.crm_leads(status);

-- ─── activities (calls/meetings/emails/notes/tasks polymorphically) ───
create table if not exists public.crm_activities (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  -- 'task' | 'call' | 'meeting' | 'email' | 'note' | 'sms'
  kind          text not null check (kind in ('task','call','meeting','email','note','sms')),
  subject       text,
  body          text,
  -- Polymorphic FK — exactly one of these is set per row.
  contact_id    uuid references public.crm_contacts(id) on delete cascade,
  company_id    uuid references public.crm_companies(id) on delete cascade,
  deal_id       uuid references public.crm_deals(id) on delete cascade,
  lead_id       uuid references public.crm_leads(id) on delete cascade,
  -- task-specific
  due_at        timestamptz,
  completed_at  timestamptz,
  -- meeting/call-specific
  starts_at     timestamptz,
  ends_at       timestamptz,
  -- email-specific
  email_from    text,
  email_to      text[],
  -- shared
  assignee_ids  uuid[] not null default '{}'::uuid[],
  -- File attachments via workspace_files ids.
  attachment_ids uuid[] not null default '{}'::uuid[],
  custom        jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists crm_activities_ws_idx on public.crm_activities(workspace_id, created_at desc);
create index if not exists crm_activities_contact_idx on public.crm_activities(contact_id);
create index if not exists crm_activities_company_idx on public.crm_activities(company_id);
create index if not exists crm_activities_deal_idx on public.crm_activities(deal_id);
create index if not exists crm_activities_lead_idx on public.crm_activities(lead_id);
create index if not exists crm_activities_due_idx on public.crm_activities(workspace_id, due_at) where completed_at is null;

-- ─── inventory ───
-- Items the business sells, tracks, lists — generic. Could be physical
-- products, real-estate listings, services, virtual assets. Custom
-- fields per workspace make this fit any vertical.
create table if not exists public.crm_inventory_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  sku           text,
  name          text not null,
  category      text,
  price         numeric(14,2),
  currency      text not null default 'USD',
  cost          numeric(14,2),
  quantity      numeric(14,3),
  unit          text,
  status        text not null default 'active' check (status in ('active','inactive','archived')),
  description   text,
  image_id      uuid references public.workspace_files(id) on delete set null,
  visibility    text not null default 'public' check (visibility in ('public','team','assigned','owner')),
  owner_id      uuid references auth.users(id) on delete set null,
  custom        jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists crm_inv_ws_idx on public.crm_inventory_items(workspace_id);
create index if not exists crm_inv_sku_idx on public.crm_inventory_items(workspace_id, sku) where sku is not null;
create index if not exists crm_inv_name_trgm on public.crm_inventory_items using gin (name gin_trgm_ops);

-- ─── tags (polymorphic) ───
create table if not exists public.crm_tags (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  color         text not null default 'slate',
  created_at    timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.crm_record_tags (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  tag_id        uuid not null references public.crm_tags(id) on delete cascade,
  -- 'contact' | 'company' | 'deal' | 'lead' | 'inventory'
  record_type   text not null check (record_type in ('contact','company','deal','lead','inventory')),
  record_id     uuid not null,
  primary key (tag_id, record_type, record_id)
);
create index if not exists crm_record_tags_record_idx on public.crm_record_tags(record_type, record_id);

-- ─── custom field definitions (admin-defined) ───
create table if not exists public.crm_custom_fields (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  -- which entity this field attaches to
  record_type   text not null check (record_type in ('contact','company','deal','lead','inventory')),
  -- key used inside the `custom` jsonb on each row
  key           text not null,
  label         text not null,
  -- 'text' | 'number' | 'select' | 'multiselect' | 'date' | 'currency' | 'url' | 'user' | 'file' | 'boolean'
  type          text not null check (type in ('text','number','select','multiselect','date','currency','url','user','file','boolean')),
  -- For select/multiselect — array of {value, label, color?}
  options       jsonb not null default '[]'::jsonb,
  required      boolean not null default false,
  position      integer not null default 0,
  default_value jsonb,
  created_at    timestamptz not null default now(),
  unique (workspace_id, record_type, key)
);
create index if not exists crm_custom_fields_ws_record_idx on public.crm_custom_fields(workspace_id, record_type, position);

-- ─── saved views (per-user) ───
create table if not exists public.crm_saved_views (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  record_type   text not null check (record_type in ('contact','company','deal','lead','inventory','activity')),
  name          text not null,
  -- jsonb config: filters[], sort, columns[], layout: 'table' | 'kanban' | 'card'
  config        jsonb not null default '{}'::jsonb,
  is_pinned     boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists crm_saved_views_user_idx on public.crm_saved_views(user_id, workspace_id, record_type);

-- ─── visibility / permissions on RLS ───
-- Helper: can the calling user see this row?
-- Args: workspace_id, visibility, owner_id, assignee_ids[]
create or replace function public.crm_record_visible(
  ws_id      uuid,
  vis        text,
  owner_id   uuid,
  assignees  uuid[]
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  role public.workspace_role;
begin
  if not public.is_workspace_member(ws_id) then
    return false;
  end if;
  role := public.workspace_role_of(ws_id);
  -- Owners + admins always see everything.
  if role in ('owner','admin') then
    return true;
  end if;
  case vis
    when 'public' then return true;
    when 'team'   then return true;  -- v1: workspace == team. Future: real teams.
    when 'owner'  then return owner_id = auth.uid();
    when 'assigned' then
      return owner_id = auth.uid() or auth.uid() = any(coalesce(assignees, '{}'));
    else return false;
  end case;
end;
$$;

grant execute on function public.crm_record_visible(uuid, text, uuid, uuid[]) to anon, authenticated;

-- Apply RLS to every entity table. Pattern:
--   SELECT — visible per crm_record_visible
--   INSERT — must be a workspace member; new row owner = self
--   UPDATE — visible AND (owner OR admin/owner role)
--   DELETE — admin/owner role of the workspace

-- companies
alter table public.crm_companies enable row level security;
drop policy if exists "crm_companies select" on public.crm_companies;
create policy "crm_companies select" on public.crm_companies for select
  using (public.crm_record_visible(workspace_id, visibility, owner_id, '{}'::uuid[]));
drop policy if exists "crm_companies insert" on public.crm_companies;
create policy "crm_companies insert" on public.crm_companies for insert
  with check (public.is_workspace_member(workspace_id) and (created_by = auth.uid() or created_by is null));
drop policy if exists "crm_companies update" on public.crm_companies;
create policy "crm_companies update" on public.crm_companies for update
  using (public.crm_record_visible(workspace_id, visibility, owner_id, '{}'::uuid[]))
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "crm_companies delete" on public.crm_companies;
create policy "crm_companies delete" on public.crm_companies for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin') or owner_id = auth.uid());

-- contacts
alter table public.crm_contacts enable row level security;
drop policy if exists "crm_contacts select" on public.crm_contacts;
create policy "crm_contacts select" on public.crm_contacts for select
  using (public.crm_record_visible(workspace_id, visibility, owner_id, '{}'::uuid[]));
drop policy if exists "crm_contacts insert" on public.crm_contacts;
create policy "crm_contacts insert" on public.crm_contacts for insert
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "crm_contacts update" on public.crm_contacts;
create policy "crm_contacts update" on public.crm_contacts for update
  using (public.crm_record_visible(workspace_id, visibility, owner_id, '{}'::uuid[]))
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "crm_contacts delete" on public.crm_contacts;
create policy "crm_contacts delete" on public.crm_contacts for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin') or owner_id = auth.uid());

-- deals
alter table public.crm_deals enable row level security;
drop policy if exists "crm_deals select" on public.crm_deals;
create policy "crm_deals select" on public.crm_deals for select
  using (public.crm_record_visible(workspace_id, visibility, owner_id, assignee_ids));
drop policy if exists "crm_deals insert" on public.crm_deals;
create policy "crm_deals insert" on public.crm_deals for insert
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "crm_deals update" on public.crm_deals;
create policy "crm_deals update" on public.crm_deals for update
  using (public.crm_record_visible(workspace_id, visibility, owner_id, assignee_ids))
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "crm_deals delete" on public.crm_deals;
create policy "crm_deals delete" on public.crm_deals for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin') or owner_id = auth.uid());

-- leads
alter table public.crm_leads enable row level security;
drop policy if exists "crm_leads select" on public.crm_leads;
create policy "crm_leads select" on public.crm_leads for select
  using (public.crm_record_visible(workspace_id, visibility, owner_id, '{}'::uuid[]));
drop policy if exists "crm_leads insert" on public.crm_leads;
create policy "crm_leads insert" on public.crm_leads for insert
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "crm_leads update" on public.crm_leads;
create policy "crm_leads update" on public.crm_leads for update
  using (public.crm_record_visible(workspace_id, visibility, owner_id, '{}'::uuid[]))
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "crm_leads delete" on public.crm_leads;
create policy "crm_leads delete" on public.crm_leads for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin') or owner_id = auth.uid());

-- activities
alter table public.crm_activities enable row level security;
drop policy if exists "crm_activities select" on public.crm_activities;
create policy "crm_activities select" on public.crm_activities for select
  using (public.is_workspace_member(workspace_id));
drop policy if exists "crm_activities insert" on public.crm_activities;
create policy "crm_activities insert" on public.crm_activities for insert
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "crm_activities update" on public.crm_activities;
create policy "crm_activities update" on public.crm_activities for update
  using (created_by = auth.uid() or auth.uid() = any(coalesce(assignee_ids, '{}'))
         or public.workspace_role_of(workspace_id) in ('owner','admin'));
drop policy if exists "crm_activities delete" on public.crm_activities;
create policy "crm_activities delete" on public.crm_activities for delete
  using (created_by = auth.uid() or public.workspace_role_of(workspace_id) in ('owner','admin'));

-- inventory
alter table public.crm_inventory_items enable row level security;
drop policy if exists "crm_inv select" on public.crm_inventory_items;
create policy "crm_inv select" on public.crm_inventory_items for select
  using (public.crm_record_visible(workspace_id, visibility, owner_id, '{}'::uuid[]));
drop policy if exists "crm_inv insert" on public.crm_inventory_items;
create policy "crm_inv insert" on public.crm_inventory_items for insert
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "crm_inv update" on public.crm_inventory_items;
create policy "crm_inv update" on public.crm_inventory_items for update
  using (public.crm_record_visible(workspace_id, visibility, owner_id, '{}'::uuid[]))
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "crm_inv delete" on public.crm_inventory_items;
create policy "crm_inv delete" on public.crm_inventory_items for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin') or owner_id = auth.uid());

-- pipelines + stages: members read, admins/owners write
alter table public.crm_pipelines enable row level security;
drop policy if exists "crm_pipelines select" on public.crm_pipelines;
create policy "crm_pipelines select" on public.crm_pipelines for select
  using (public.is_workspace_member(workspace_id));
drop policy if exists "crm_pipelines admin" on public.crm_pipelines;
create policy "crm_pipelines admin" on public.crm_pipelines for all
  using (public.workspace_role_of(workspace_id) in ('owner','admin'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin'));

alter table public.crm_pipeline_stages enable row level security;
drop policy if exists "crm_stages select" on public.crm_pipeline_stages;
create policy "crm_stages select" on public.crm_pipeline_stages for select
  using (exists (select 1 from public.crm_pipelines p
                 where p.id = pipeline_id and public.is_workspace_member(p.workspace_id)));
drop policy if exists "crm_stages admin" on public.crm_pipeline_stages;
create policy "crm_stages admin" on public.crm_pipeline_stages for all
  using (exists (select 1 from public.crm_pipelines p
                 where p.id = pipeline_id
                   and public.workspace_role_of(p.workspace_id) in ('owner','admin')))
  with check (exists (select 1 from public.crm_pipelines p
                      where p.id = pipeline_id
                        and public.workspace_role_of(p.workspace_id) in ('owner','admin')));

-- tags + record_tags: members read+write within their workspace
alter table public.crm_tags enable row level security;
drop policy if exists "crm_tags all" on public.crm_tags;
create policy "crm_tags all" on public.crm_tags for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

alter table public.crm_record_tags enable row level security;
drop policy if exists "crm_record_tags all" on public.crm_record_tags;
create policy "crm_record_tags all" on public.crm_record_tags for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- custom fields: members read, admins/owners write
alter table public.crm_custom_fields enable row level security;
drop policy if exists "crm_custom_fields select" on public.crm_custom_fields;
create policy "crm_custom_fields select" on public.crm_custom_fields for select
  using (public.is_workspace_member(workspace_id));
drop policy if exists "crm_custom_fields admin" on public.crm_custom_fields;
create policy "crm_custom_fields admin" on public.crm_custom_fields for all
  using (public.workspace_role_of(workspace_id) in ('owner','admin'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- saved views: each user owns their own
alter table public.crm_saved_views enable row level security;
drop policy if exists "crm_saved_views own" on public.crm_saved_views;
create policy "crm_saved_views own" on public.crm_saved_views for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── triggers: updated_at + default pipeline ───
create or replace function public.crm_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crm_companies_touch on public.crm_companies;
create trigger crm_companies_touch before update on public.crm_companies
  for each row execute function public.crm_touch_updated_at();
drop trigger if exists crm_contacts_touch on public.crm_contacts;
create trigger crm_contacts_touch before update on public.crm_contacts
  for each row execute function public.crm_touch_updated_at();
drop trigger if exists crm_deals_touch on public.crm_deals;
create trigger crm_deals_touch before update on public.crm_deals
  for each row execute function public.crm_touch_updated_at();
drop trigger if exists crm_leads_touch on public.crm_leads;
create trigger crm_leads_touch before update on public.crm_leads
  for each row execute function public.crm_touch_updated_at();
drop trigger if exists crm_activities_touch on public.crm_activities;
create trigger crm_activities_touch before update on public.crm_activities
  for each row execute function public.crm_touch_updated_at();
drop trigger if exists crm_inv_touch on public.crm_inventory_items;
create trigger crm_inv_touch before update on public.crm_inventory_items
  for each row execute function public.crm_touch_updated_at();

-- Auto-create a default pipeline + 5 stages for each new workspace.
create or replace function public.crm_seed_default_pipeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
begin
  insert into public.crm_pipelines (workspace_id, name, is_default, position)
  values (new.id, 'Sales pipeline', true, 0)
  returning id into pid;
  insert into public.crm_pipeline_stages (pipeline_id, name, kind, position, probability, color) values
    (pid, 'New', 'open', 0, 10, 'slate'),
    (pid, 'Qualified', 'open', 1, 30, 'sky'),
    (pid, 'Proposal', 'open', 2, 50, 'violet'),
    (pid, 'Negotiation', 'open', 3, 75, 'amber'),
    (pid, 'Won', 'won', 4, 100, 'emerald'),
    (pid, 'Lost', 'lost', 5, 0, 'rose');
  return new;
end;
$$;

drop trigger if exists on_workspace_create_crm on public.workspaces;
create trigger on_workspace_create_crm
  after insert on public.workspaces
  for each row execute function public.crm_seed_default_pipeline();

-- Backfill existing workspaces.
do $$
declare ws record;
declare pid uuid;
begin
  for ws in select id from public.workspaces loop
    if not exists (select 1 from public.crm_pipelines where workspace_id = ws.id) then
      insert into public.crm_pipelines (workspace_id, name, is_default, position)
      values (ws.id, 'Sales pipeline', true, 0)
      returning id into pid;
      insert into public.crm_pipeline_stages (pipeline_id, name, kind, position, probability, color) values
        (pid, 'New', 'open', 0, 10, 'slate'),
        (pid, 'Qualified', 'open', 1, 30, 'sky'),
        (pid, 'Proposal', 'open', 2, 50, 'violet'),
        (pid, 'Negotiation', 'open', 3, 75, 'amber'),
        (pid, 'Won', 'won', 4, 100, 'emerald'),
        (pid, 'Lost', 'lost', 5, 0, 'rose');
    end if;
  end loop;
end $$;
