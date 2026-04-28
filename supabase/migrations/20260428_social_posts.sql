-- 2026-04-28 Meta social posting — drafts, schedules, sent posts.

create table if not exists public.social_posts (
  id            uuid primary key default gen_random_uuid(),
  channel       text not null check (channel in ('facebook', 'instagram')),
  status        text not null default 'draft' check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  body          text not null default '',
  -- Up to 10 attached images (Meta API supports carousels). Stored as
  -- workspace_files rows owned by the admin's first workspace, tagged
  -- "social" so they don't pollute the user's regular file list.
  attachment_ids uuid[] not null default '{}'::uuid[],
  -- Where the post links to (used in Meta's "link preview" field for FB).
  link_url      text,
  -- Schedule for future publish. Null = draft / publish-now.
  scheduled_at  timestamptz,
  -- Once published, Meta returns an id we use to fetch insights.
  meta_post_id  text,
  meta_permalink text,
  -- Last fetched insights snapshot (likes, comments, reach, impressions).
  insights      jsonb not null default '{}'::jsonb,
  insights_at   timestamptz,
  failure_reason text,
  created_by    uuid not null references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  published_at  timestamptz
);

create index if not exists social_posts_status_idx
  on public.social_posts(status, scheduled_at);

alter table public.social_posts enable row level security;

drop policy if exists "admins all on social_posts" on public.social_posts;
create policy "admins all on social_posts"
  on public.social_posts for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());
