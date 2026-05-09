-- ─────────────────────────────────────────────────────────────────────
-- Admin panel v4 — 2026-05-09 (round 4 — runtime wiring + new sections)
--
-- This round (a) wires v3 features to runtime via helper RPCs and
-- (b) adds new tables for support, KB, onboarding, refunds, surveys,
-- bulk operations, activity feed.
-- ─────────────────────────────────────────────────────────────────────

-- 1. help_categories + help_articles (KB editor)
create table if not exists public.help_categories (
  id            text primary key,
  display_name  text not null,
  description   text not null default '',
  icon          text,
  sort_order    int not null default 0,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);

alter table public.help_categories enable row level security;
drop policy if exists "anyone reads enabled categories" on public.help_categories;
create policy "anyone reads enabled categories" on public.help_categories for select
  using (enabled = true or public.admin_caller_is_admin());
drop policy if exists "admins write categories" on public.help_categories;
create policy "admins write categories" on public.help_categories for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create table if not exists public.help_articles (
  id            text primary key,
  category_id   text references public.help_categories(id) on delete set null,
  title         text not null,
  slug          text not null unique,
  body          text not null default '',
  excerpt       text,
  status        text not null default 'draft'
                  check (status in ('draft','published','archived')),
  visibility    text not null default 'public'
                  check (visibility in ('public','authenticated','admin_only')),
  tags          jsonb not null default '[]'::jsonb,
  view_count    int not null default 0,
  helpful_count int not null default 0,
  not_helpful_count int not null default 0,
  sort_order    int not null default 0,
  metadata      jsonb not null default '{}'::jsonb,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);

alter table public.help_articles enable row level security;
drop policy if exists "anyone reads published articles" on public.help_articles;
create policy "anyone reads published articles" on public.help_articles for select
  using (
    status = 'published' and visibility in ('public','authenticated')
    or public.admin_caller_is_admin()
  );
drop policy if exists "admins write articles" on public.help_articles;
create policy "admins write articles" on public.help_articles for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists help_articles_category_idx on public.help_articles (category_id, sort_order);
create index if not exists help_articles_slug_idx on public.help_articles (slug);

insert into public.help_categories (id, display_name, sort_order)
values
  ('getting-started', 'Getting started', 0),
  ('account',         'Account & billing', 10),
  ('crm',             'CRM',               20),
  ('toshare',         'toShare links',     30),
  ('agents',          'AI agents',         40),
  ('developers',      'For developers',    50)
on conflict (id) do nothing;

-- 2. onboarding flows + steps
create table if not exists public.onboarding_flows (
  id            text primary key,
  display_name  text not null,
  description   text not null default '',
  trigger_event text not null default 'first_login',
  audience      text not null default 'all',
  status        text not null default 'draft'
                  check (status in ('live','draft','archived')),
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);

alter table public.onboarding_flows enable row level security;
drop policy if exists "anyone reads live flows" on public.onboarding_flows;
create policy "anyone reads live flows" on public.onboarding_flows for select
  using (status = 'live' or public.admin_caller_is_admin());
drop policy if exists "admins write flows" on public.onboarding_flows;
create policy "admins write flows" on public.onboarding_flows for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create table if not exists public.onboarding_steps (
  id            uuid primary key default gen_random_uuid(),
  flow_id       text not null references public.onboarding_flows(id) on delete cascade,
  step_index    int not null,
  kind          text not null check (kind in ('welcome','tour','form','video','checklist','call-to-action')),
  title         text not null,
  body          text,
  cta_label     text,
  cta_href      text,
  config        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

alter table public.onboarding_steps enable row level security;
drop policy if exists "anyone reads onboarding steps" on public.onboarding_steps;
create policy "anyone reads onboarding steps" on public.onboarding_steps for select using (true);
drop policy if exists "admins write onboarding steps" on public.onboarding_steps;
create policy "admins write onboarding steps" on public.onboarding_steps for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists onboarding_steps_flow_idx on public.onboarding_steps (flow_id, step_index);

create table if not exists public.user_onboarding_state (
  user_id       uuid not null references auth.users(id) on delete cascade,
  flow_id       text not null references public.onboarding_flows(id) on delete cascade,
  current_step  int not null default 0,
  completed     boolean not null default false,
  completed_at  timestamptz,
  metadata      jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (user_id, flow_id)
);

alter table public.user_onboarding_state enable row level security;
drop policy if exists "user reads own onboarding" on public.user_onboarding_state;
create policy "user reads own onboarding" on public.user_onboarding_state for select
  using (user_id = auth.uid() or public.admin_caller_is_admin());
drop policy if exists "user writes own onboarding" on public.user_onboarding_state;
create policy "user writes own onboarding" on public.user_onboarding_state for all
  using (user_id = auth.uid() or public.admin_caller_is_admin())
  with check (user_id = auth.uid() or public.admin_caller_is_admin());

-- 3. product_tours
create table if not exists public.product_tours (
  id            text primary key,
  display_name  text not null,
  description   text not null default '',
  trigger_route text,
  trigger_kind  text not null default 'manual'
                  check (trigger_kind in ('manual','first_visit','feature_flag','dom_query')),
  steps         jsonb not null default '[]'::jsonb,
  status        text not null default 'draft'
                  check (status in ('live','draft','archived')),
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);

alter table public.product_tours enable row level security;
drop policy if exists "anyone reads live tours" on public.product_tours;
create policy "anyone reads live tours" on public.product_tours for select
  using (status = 'live' or public.admin_caller_is_admin());
drop policy if exists "admins write tours" on public.product_tours;
create policy "admins write tours" on public.product_tours for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 4. support_tickets + support_messages
create table if not exists public.support_tickets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  workspace_id  uuid references public.workspaces(id) on delete set null,
  subject       text not null,
  body          text not null default '',
  status        text not null default 'open'
                  check (status in ('open','in_progress','waiting_user','resolved','closed')),
  priority      text not null default 'normal'
                  check (priority in ('low','normal','high','urgent')),
  assigned_to   uuid references auth.users(id) on delete set null,
  category      text,
  tags          jsonb not null default '[]'::jsonb,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  last_response_at timestamptz
);

alter table public.support_tickets enable row level security;
drop policy if exists "user sees own tickets" on public.support_tickets;
create policy "user sees own tickets" on public.support_tickets for select
  using (user_id = auth.uid() or public.admin_caller_is_admin());
drop policy if exists "user creates own tickets" on public.support_tickets;
create policy "user creates own tickets" on public.support_tickets for insert
  with check (user_id = auth.uid());
drop policy if exists "admins all tickets" on public.support_tickets;
create policy "admins all tickets" on public.support_tickets for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);
create index if not exists support_tickets_user_idx on public.support_tickets (user_id, created_at desc);

create table if not exists public.support_messages (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references public.support_tickets(id) on delete cascade,
  author_id     uuid references auth.users(id) on delete set null,
  is_admin      boolean not null default false,
  body          text not null,
  internal_note boolean not null default false,
  attachments   jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

alter table public.support_messages enable row level security;
drop policy if exists "ticket members read messages" on public.support_messages;
create policy "ticket members read messages" on public.support_messages for select
  using (
    (not internal_note and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.user_id = auth.uid()
    ))
    or public.admin_caller_is_admin()
  );
drop policy if exists "user posts to own ticket" on public.support_messages;
create policy "user posts to own ticket" on public.support_messages for insert
  with check (
    not internal_note and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.user_id = auth.uid()
    )
  );
drop policy if exists "admins post any message" on public.support_messages;
create policy "admins post any message" on public.support_messages for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

-- 5. impersonation_sessions
create table if not exists public.impersonation_sessions (
  id            uuid primary key default gen_random_uuid(),
  admin_id      uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  reason        text not null,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  ip            text,
  user_agent    text,
  metadata      jsonb not null default '{}'::jsonb
);

alter table public.impersonation_sessions enable row level security;
drop policy if exists "admins read impersonation" on public.impersonation_sessions;
create policy "admins read impersonation" on public.impersonation_sessions for select
  using (public.admin_caller_is_admin());
drop policy if exists "admins write impersonation" on public.impersonation_sessions;
create policy "admins write impersonation" on public.impersonation_sessions for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 6. refunds + invoices
create table if not exists public.refunds (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  workspace_id  uuid references public.workspaces(id) on delete set null,
  amount_cents  int not null,
  currency      text not null default 'USD',
  reason        text,
  status        text not null default 'pending'
                  check (status in ('pending','approved','processed','rejected','failed')),
  external_payment_id text,
  external_refund_id  text,
  processed_at  timestamptz,
  approved_by   uuid references auth.users(id) on delete set null,
  notes         text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.refunds enable row level security;
drop policy if exists "user reads own refunds" on public.refunds;
create policy "user reads own refunds" on public.refunds for select
  using (user_id = auth.uid() or public.admin_caller_is_admin());
drop policy if exists "admins write refunds" on public.refunds;
create policy "admins write refunds" on public.refunds for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create table if not exists public.invoices (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique,
  user_id       uuid references auth.users(id) on delete set null,
  workspace_id  uuid references public.workspaces(id) on delete set null,
  amount_cents  int not null,
  currency      text not null default 'USD',
  status        text not null default 'draft'
                  check (status in ('draft','sent','paid','overdue','void','refunded')),
  due_date      date,
  paid_at       timestamptz,
  line_items    jsonb not null default '[]'::jsonb,
  subtotal_cents int,
  tax_cents     int,
  total_cents   int,
  external_invoice_id text,
  pdf_url       text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.invoices enable row level security;
drop policy if exists "user reads own invoices" on public.invoices;
create policy "user reads own invoices" on public.invoices for select
  using (user_id = auth.uid() or public.admin_caller_is_admin());
drop policy if exists "admins write invoices" on public.invoices;
create policy "admins write invoices" on public.invoices for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 7. surveys + nps
create table if not exists public.surveys (
  id            text primary key,
  display_name  text not null,
  description   text not null default '',
  questions     jsonb not null default '[]'::jsonb,
  trigger_kind  text not null default 'manual'
                  check (trigger_kind in ('manual','signup','milestone','recurring')),
  trigger_config jsonb not null default '{}'::jsonb,
  audience      text not null default 'all',
  audience_config jsonb not null default '{}'::jsonb,
  status        text not null default 'draft'
                  check (status in ('live','draft','archived')),
  response_count int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);

alter table public.surveys enable row level security;
drop policy if exists "anyone reads live surveys" on public.surveys;
create policy "anyone reads live surveys" on public.surveys for select
  using (status = 'live' or public.admin_caller_is_admin());
drop policy if exists "admins write surveys" on public.surveys;
create policy "admins write surveys" on public.surveys for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create table if not exists public.survey_responses (
  id            uuid primary key default gen_random_uuid(),
  survey_id     text references public.surveys(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  workspace_id  uuid references public.workspaces(id) on delete set null,
  answers       jsonb not null default '{}'::jsonb,
  nps_score     int check (nps_score is null or (nps_score between 0 and 10)),
  rating        int check (rating is null or (rating between 1 and 5)),
  comments      text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

alter table public.survey_responses enable row level security;
drop policy if exists "user reads own response" on public.survey_responses;
create policy "user reads own response" on public.survey_responses for select
  using (user_id = auth.uid() or public.admin_caller_is_admin());
drop policy if exists "user posts response" on public.survey_responses;
create policy "user posts response" on public.survey_responses for insert
  with check (user_id = auth.uid() or auth.role() = 'authenticated');
drop policy if exists "admins all responses" on public.survey_responses;
create policy "admins all responses" on public.survey_responses for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists survey_responses_survey_idx on public.survey_responses (survey_id, created_at desc);

-- 8. bulk_operations (track admin bulk actions)
create table if not exists public.bulk_operations (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references auth.users(id) on delete set null,
  operation     text not null,
  target_kind   text not null,
  target_ids    jsonb not null default '[]'::jsonb,
  total         int not null default 0,
  succeeded     int not null default 0,
  failed        int not null default 0,
  status        text not null default 'pending'
                  check (status in ('pending','running','completed','failed','cancelled')),
  results       jsonb not null default '[]'::jsonb,
  metadata      jsonb not null default '{}'::jsonb,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

alter table public.bulk_operations enable row level security;
drop policy if exists "admins all bulk_operations" on public.bulk_operations;
create policy "admins all bulk_operations" on public.bulk_operations for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 9. activity_feed (single source for /admin/activity real-time)
create table if not exists public.activity_feed (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,
  actor_id      uuid references auth.users(id) on delete set null,
  workspace_id  uuid references public.workspaces(id) on delete set null,
  subject       text not null,
  body          text,
  url           text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

alter table public.activity_feed enable row level security;
drop policy if exists "admins read activity" on public.activity_feed;
create policy "admins read activity" on public.activity_feed for select
  using (public.admin_caller_is_admin());
drop policy if exists "admins write activity" on public.activity_feed;
create policy "admins write activity" on public.activity_feed for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists activity_feed_created_idx on public.activity_feed (created_at desc);

-- ─── runtime helper: maintenance_active() ───
create or replace function public.maintenance_active(uid uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  state record;
begin
  select * into state from public.maintenance_state where id = 1;
  if not found or not state.enabled then return false; end if;
  if state.starts_at is not null and now() < state.starts_at then return false; end if;
  if state.ends_at is not null and now() > state.ends_at then return false; end if;
  if uid is not null and exists (
    select 1 from jsonb_array_elements_text(state.allowlist_user_ids) e where e = uid::text
  ) then return false; end if;
  return true;
end;
$$;

grant execute on function public.maintenance_active(uuid) to authenticated, anon;

-- ─── runtime helper: active_banners(uid, tier) ───
create or replace function public.active_banners(uid uuid default auth.uid(), tier text default null)
returns setof public.site_banners
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
    select b.* from public.site_banners b
    where b.enabled = true
      and (b.starts_at is null or now() >= b.starts_at)
      and (b.ends_at is null or now() <= b.ends_at)
      and (
        b.audience = 'all'
        or (b.audience = 'authenticated' and uid is not null)
        or (b.audience = 'tier' and tier is not null and exists (
          select 1 from jsonb_array_elements_text(b.audience_tiers) e where e = tier
        ))
        or (b.audience = 'allowlist' and uid is not null and exists (
          select 1 from jsonb_array_elements_text(b.audience_user_ids) e where e = uid::text
        ))
      )
    order by b.created_at desc;
end;
$$;

grant execute on function public.active_banners(uuid, text) to authenticated, anon;

-- ─── runtime helper: active_brand(workspace_id) ───
create or replace function public.active_brand(ws_id uuid default null)
returns public.brand_configs
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result public.brand_configs;
begin
  if ws_id is not null then
    select * into result from public.brand_configs where workspace_id = ws_id;
    if found then return result; end if;
  end if;
  select * into result from public.brand_configs where workspace_id is null limit 1;
  return result;
end;
$$;

grant execute on function public.active_brand(uuid) to authenticated, anon;

-- ─── triggers ───
drop trigger if exists touch_help_categories on public.help_categories;
create trigger touch_help_categories before update on public.help_categories
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_help_articles on public.help_articles;
create trigger touch_help_articles before update on public.help_articles
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_onboarding_flows on public.onboarding_flows;
create trigger touch_onboarding_flows before update on public.onboarding_flows
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_product_tours on public.product_tours;
create trigger touch_product_tours before update on public.product_tours
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_support_tickets on public.support_tickets;
create trigger touch_support_tickets before update on public.support_tickets
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_refunds on public.refunds;
create trigger touch_refunds before update on public.refunds
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_invoices on public.invoices;
create trigger touch_invoices before update on public.invoices
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_surveys on public.surveys;
create trigger touch_surveys before update on public.surveys
  for each row execute function public.touch_updated_at();
