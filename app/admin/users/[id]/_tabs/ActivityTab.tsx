import { createAdminClient } from "@/lib/supabase/admin";

import { fetchAuthUsersByIds, formatDateTime } from "../../../_lib";

type AuthEventRow = {
  id: string;
  event: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type AuditRow = {
  id: string;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type AgentRunRow = {
  id: string;
  agent_id: string | null;
  status: string;
  channel: string | null;
  input_excerpt: string | null;
  output_excerpt: string | null;
  duration_ms: number | null;
  model: string | null;
  error: string | null;
  created_at: string;
};

type FeedItem = {
  key: string;
  ts: string;
  source: "auth" | "admin" | "agent";
  title: string;
  body: string | null;
  meta: string | null;
};

const PER_SOURCE = 100;
const TOTAL_LIMIT = 100;

export default async function ActivityTab({ userId }: { userId: string }) {
  const admin = createAdminClient();

  const [authEventsRes, auditRes, runsRes] = await Promise.all([
    admin
      .from("auth_events")
      .select("id, event, ip, user_agent, created_at, metadata")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE),
    admin
      .from("admin_audit_log")
      .select(
        "id, action, actor_id, actor_email, target_type, target_id, metadata, created_at"
      )
      .eq("target_id", userId)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE),
    admin
      .from("ai_agent_runs")
      .select(
        "id, agent_id, status, channel, input_excerpt, output_excerpt, duration_ms, model, error, created_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE),
  ]);

  const authEvents = (authEventsRes.data ?? []) as AuthEventRow[];
  const audit = (auditRes.data ?? []) as AuditRow[];
  const runs = (runsRes.data ?? []) as AgentRunRow[];

  // Resolve actor emails for audit rows.
  const actorIds = Array.from(
    new Set(audit.map((r) => r.actor_id).filter((v): v is string => Boolean(v)))
  );
  const actorMap = await fetchAuthUsersByIds(actorIds);

  const items: FeedItem[] = [
    ...authEvents.map((r) => ({
      key: `auth:${r.id}`,
      ts: r.created_at,
      source: "auth" as const,
      title: r.event,
      body: r.user_agent ? truncate(r.user_agent, 80) : null,
      meta: r.ip,
    })),
    ...audit.map((r) => ({
      key: `audit:${r.id}`,
      ts: r.created_at,
      source: "admin" as const,
      title: r.action,
      body: null,
      meta:
        r.actor_email ||
        (r.actor_id
          ? actorMap.get(r.actor_id)?.email ?? r.actor_id.slice(0, 8)
          : null),
    })),
    ...runs.map((r) => ({
      key: `run:${r.id}`,
      ts: r.created_at,
      source: "agent" as const,
      title:
        (r.agent_id ?? "agent") +
        (r.status === "success"
          ? ""
          : ` (${r.status}${r.error ? `: ${truncate(r.error, 40)}` : ""})`),
      body: r.input_excerpt ? truncate(r.input_excerpt, 120) : null,
      meta: [
        r.model,
        r.duration_ms != null ? `${r.duration_ms}ms` : null,
        r.channel,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
  ]
    .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
    .slice(0, TOTAL_LIMIT);

  return (
    <section className="rounded-xl border border-app bg-app-elevated p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-app">Activity</h2>
          <p className="mt-1 text-xs text-muted">
            Last {TOTAL_LIMIT} events combining auth events, admin audit
            entries targeting this user, and AI agent runs.
          </p>
        </div>
        <span className="text-[11px] text-muted">{items.length} items</span>
      </div>

      <ol className="mt-4 space-y-1 text-sm">
        {items.length === 0 ? (
          <li className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-muted">
            No activity yet.
          </li>
        ) : (
          items.map((it) => (
            <li
              key={it.key}
              className="grid grid-cols-[auto_120px_1fr] items-start gap-3 border-b border-app py-2 last:border-b-0"
            >
              <span className={badgeClass(it.source)}>
                {it.source}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-secondary">
                {formatDateTime(it.ts)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-app">{it.title}</div>
                {it.body && (
                  <div className="truncate text-[11px] text-muted">
                    {it.body}
                  </div>
                )}
                {it.meta && (
                  <div className="truncate font-mono text-[11px] text-faint tabular-nums">
                    {it.meta}
                  </div>
                )}
              </div>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}

function badgeClass(source: FeedItem["source"]): string {
  const base =
    "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide";
  switch (source) {
    case "auth":
      return `${base} bg-tool-accent-soft text-tool-accent`;
    case "admin":
      return `${base} bg-amber-500/15 text-amber-600 dark:text-amber-400`;
    case "agent":
      return `${base} bg-emerald-500/15 text-emerald-500`;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
