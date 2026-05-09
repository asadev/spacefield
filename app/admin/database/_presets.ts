/**
 * Hand-curated SELECT presets for the SQL runner sidebar. Each must be
 * a single SELECT — no DML, no DDL. Keep them short and useful.
 */

export type SqlPreset = {
  id: string;
  label: string;
  description: string;
  sql: string;
};

export const SQL_PRESETS: SqlPreset[] = [
  {
    id: "recent-signups",
    label: "Recent signups (30d)",
    description: "Newest profiles in the last 30 days.",
    sql: `select user_id, username, full_name, created_at
from public.profiles
where created_at >= now() - interval '30 days'
order by created_at desc
limit 100;`,
  },
  {
    id: "top-workspaces-by-members",
    label: "Top workspaces by member count",
    description: "Workspaces ranked by number of members.",
    sql: `select w.id, w.name, w.slug, count(m.user_id) as members
from public.workspaces w
left join public.workspace_members m on m.workspace_id = w.id
group by w.id, w.name, w.slug
order by members desc
limit 50;`,
  },
  {
    id: "top-spend-by-workspace",
    label: "Top spend by workspace (30d)",
    description: "Workspaces by token usage in the last 30 days.",
    sql: `select workspace_id, sum(tokens_in + tokens_out) as total_tokens, count(*) as runs
from public.ai_agent_runs
where created_at >= now() - interval '30 days'
group by workspace_id
order by total_tokens desc nulls last
limit 50;`,
  },
  {
    id: "active-subs-by-tier",
    label: "Active subscriptions by tier",
    description: "Live subscription counts grouped by tier.",
    sql: `select tier_id, count(*) as active
from public.workspace_subscriptions
where status = 'active'
group by tier_id
order by active desc;`,
  },
  {
    id: "recent-admin-actions",
    label: "Recent admin actions (24h)",
    description: "Last 100 admin audit log entries from the past day.",
    sql: `select created_at, actor_email, action, target_type, target_id
from public.admin_audit_log
where created_at >= now() - interval '24 hours'
order by created_at desc
limit 100;`,
  },
  {
    id: "oldest-unresolved-messages",
    label: "Oldest unresolved contact messages",
    description: "Contact-form submissions still open, oldest first.",
    sql: `select id, name, email, topic, left(message, 80) as preview, created_at
from public.contact_messages
where resolved_at is null
order by created_at asc
limit 100;`,
  },
  {
    id: "top-files-by-size",
    label: "Top 50 largest files",
    description: "Largest workspace files (not soft-deleted).",
    sql: `select id, workspace_id, name, size_bytes, created_at
from public.workspace_files
where deleted_at is null
order by size_bytes desc nulls last
limit 50;`,
  },
  {
    id: "failed-payments-7d",
    label: "Failed payments (7d)",
    description: "Paddle webhook events with status indicating failure.",
    sql: `select created_at, event_type, payload->'data'->'subscription_id' as subscription_id
from public.paddle_webhook_events
where created_at >= now() - interval '7 days'
  and (event_type ilike '%failed%' or event_type ilike '%past_due%')
order by created_at desc
limit 100;`,
  },
  {
    id: "toshare-recent-events",
    label: "Recent toShare events",
    description: "Latest 100 toShare link events.",
    sql: `select created_at, link_id, kind, ip
from public.toshare_events
order by created_at desc
limit 100;`,
  },
  {
    id: "table-row-counts",
    label: "Estimated row counts (top 50 tables)",
    description: "Fast estimates from pg_class.reltuples for public tables.",
    sql: `select relname as table_name, reltuples::bigint as estimated_rows
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p')
order by estimated_rows desc
limit 50;`,
  },
];
