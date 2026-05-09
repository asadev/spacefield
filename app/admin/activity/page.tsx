import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { fetchAuthUsersByIds, formatDateTime } from "../_lib";
import type {
  AdminAuditLogRow,
  AiAgentRunRow,
  AuthEventRow,
} from "../_types";

export const dynamic = "force-dynamic";

const TOTAL_ROWS = 200;
const PER_SOURCE_PULL = 200;

type SourceKey = "all" | "auth" | "admin" | "agent" | "toshare";

const SOURCE_OPTIONS: ReadonlyArray<{ key: SourceKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "auth", label: "Auth" },
  { key: "admin", label: "Admin actions" },
  { key: "agent", label: "Agent runs" },
  { key: "toshare", label: "toShare" },
];

const SOURCE_CHIPS: Record<Exclude<SourceKey, "all">, string> = {
  auth: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  admin: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  agent: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  toshare: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

type ToshareEventLite = {
  id: number;
  link_id: string;
  event: string;
  ip_hash: string | null;
  created_at: string;
};

type FeedItem = {
  source: Exclude<SourceKey, "all">;
  id: string;
  created_at: string;
  primary: string; // headline (event/action)
  secondary: string | null; // who/what target
  detail: string | null; // optional sub-line
  href: string | null;
  ip: string | null;
};

function parseSource(value: string | undefined): SourceKey {
  const v = (value ?? "").toLowerCase();
  if (v === "auth" || v === "admin" || v === "agent" || v === "toshare") {
    return v;
  }
  return "all";
}

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const sp = await searchParams;
  const source = parseSource(sp.source);

  const admin = createAdminClient();

  // Pull most recent rows from each source. We over-fetch a little so the
  // merged feed has enough density even when one source dominates the
  // last hour. The UI shows TOTAL_ROWS after sorting.
  const [authRes, auditRes, runsRes, toshareRes] = await Promise.all([
    source === "all" || source === "auth"
      ? admin
          .from("auth_events")
          .select(
            "id, user_id, email, event, ip, user_agent, metadata, created_at"
          )
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE_PULL)
      : Promise.resolve({ data: [] as AuthEventRow[], error: null }),
    source === "all" || source === "admin"
      ? admin
          .from("admin_audit_log")
          .select(
            "id, actor_id, actor_email, action, target_type, target_id, before, after, ip, user_agent, metadata, created_at"
          )
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE_PULL)
      : Promise.resolve({ data: [] as AdminAuditLogRow[], error: null }),
    source === "all" || source === "agent"
      ? admin
          .from("ai_agent_runs")
          .select(
            "id, agent_id, workspace_id, user_id, channel, status, input_excerpt, output_excerpt, tokens_in, tokens_out, duration_ms, model, error, metadata, created_at"
          )
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE_PULL)
      : Promise.resolve({ data: [] as AiAgentRunRow[], error: null }),
    source === "all" || source === "toshare"
      ? admin
          .from("toshare_events")
          .select("id, link_id, event, ip_hash, created_at")
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE_PULL)
      : Promise.resolve({ data: [] as ToshareEventLite[], error: null }),
  ]);

  const authRows = (authRes.data ?? []) as AuthEventRow[];
  const auditRows = (auditRes.data ?? []) as AdminAuditLogRow[];
  const runRows = (runsRes.data ?? []) as AiAgentRunRow[];
  const toshareRows = (toshareRes.data ?? []) as ToshareEventLite[];

  // Resolve user emails for agent runs (auth_events already has email).
  const runUserIds = Array.from(
    new Set(runRows.map((r) => r.user_id).filter((x): x is string => !!x))
  );
  const userMap = await fetchAuthUsersByIds(runUserIds);

  // Resolve toshare slugs for the link_ids we've seen.
  const linkIds = Array.from(new Set(toshareRows.map((r) => r.link_id)));
  let slugMap = new Map<string, string>();
  if (linkIds.length > 0) {
    const { data } = await admin
      .from("toshare_links")
      .select("id, slug")
      .in("id", linkIds);
    slugMap = new Map(
      ((data ?? []) as Array<{ id: string; slug: string }>).map((r) => [
        r.id,
        r.slug,
      ])
    );
  }

  const items: FeedItem[] = [];

  for (const r of authRows) {
    items.push({
      source: "auth",
      id: `auth:${r.id}`,
      created_at: r.created_at,
      primary: r.event,
      secondary: r.email ?? r.user_id ?? null,
      detail: null,
      href: r.user_id ? `/admin/users/${r.user_id}` : null,
      ip: r.ip,
    });
  }

  for (const r of auditRows) {
    const target = r.target_type
      ? `${r.target_type}${r.target_id ? `:${r.target_id}` : ""}`
      : null;
    items.push({
      source: "admin",
      id: `admin:${r.id}`,
      created_at: r.created_at,
      primary: r.action,
      secondary: r.actor_email ?? r.actor_id ?? null,
      detail: target,
      href: `/admin/audit?expanded=${r.id}#row-${r.id}`,
      ip: r.ip,
    });
  }

  for (const r of runRows) {
    const u = r.user_id ? userMap.get(r.user_id) : null;
    items.push({
      source: "agent",
      id: `agent:${r.id}`,
      created_at: r.created_at,
      primary: `${r.agent_id ?? "agent"} · ${r.status}`,
      secondary: u?.email ?? r.user_id ?? null,
      detail:
        r.error ?? (r.duration_ms != null ? `${r.duration_ms} ms` : null),
      href: r.agent_id ? `/admin/agents/${r.agent_id}` : null,
      ip: null,
    });
  }

  for (const r of toshareRows) {
    const slug = slugMap.get(r.link_id);
    items.push({
      source: "toshare",
      id: `toshare:${r.id}`,
      created_at: r.created_at,
      primary: r.event,
      secondary: slug ?? r.link_id,
      detail: null,
      href: `/admin/analytics/${r.link_id}`,
      ip: r.ip_hash,
    });
  }

  items.sort((a, b) => {
    const at = Date.parse(a.created_at);
    const bt = Date.parse(b.created_at);
    return bt - at;
  });

  const visible = items.slice(0, TOTAL_ROWS);

  const counts = {
    auth: authRows.length,
    admin: auditRows.length,
    agent: runRows.length,
    toshare: toshareRows.length,
  };

  return (
    <>
      {/* Auto-refresh every 30s */}
      <meta httpEquiv="refresh" content="30" />

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
              Real-time
            </div>
            <h1 className="mt-1 text-xl font-semibold text-app">Activity</h1>
            <p className="mt-0.5 text-xs text-muted">
              Combined platform feed — newest first. Auto-refreshes every 30
              seconds. Showing {visible.length.toLocaleString()} events.
            </p>
          </div>
          <div className="text-right text-[11px] text-faint">
            <div className="font-mono tabular-nums">
              auth {counts.auth.toLocaleString()} · admin{" "}
              {counts.admin.toLocaleString()} · agent{" "}
              {counts.agent.toLocaleString()} · toShare{" "}
              {counts.toshare.toLocaleString()}
            </div>
            <div className="mt-0.5">last pulled {formatDateTime(new Date().toISOString())}</div>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-2">
          {SOURCE_OPTIONS.map((opt) => {
            const active = source === opt.key;
            const params = new URLSearchParams();
            if (opt.key !== "all") params.set("source", opt.key);
            const href = `/admin/activity${
              params.toString() ? `?${params.toString()}` : ""
            }`;
            return (
              <Link
                key={opt.key}
                href={href}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  active
                    ? "border-tool-accent bg-tool-accent text-white"
                    : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-app"
                }`}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>

        {/* Feed */}
        <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">When</th>
                <th className="px-3 py-2 text-left font-normal">Source</th>
                <th className="px-3 py-2 text-left font-normal">Event</th>
                <th className="px-3 py-2 text-left font-normal">Subject</th>
                <th className="px-3 py-2 text-left font-normal">Detail</th>
                <th className="px-3 py-2 text-left font-normal">IP</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-10 text-center text-faint"
                  >
                    No activity yet.
                  </td>
                </tr>
              ) : (
                visible.map((it) => (
                  <tr
                    key={it.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(it.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${SOURCE_CHIPS[it.source]}`}
                      >
                        {it.source}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-app">
                      {it.primary}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {it.href ? (
                        <Link
                          href={it.href}
                          className="text-secondary hover:text-tool-accent"
                          title={it.secondary ?? undefined}
                        >
                          <span className="line-clamp-1 break-all">
                            {it.secondary ?? "—"}
                          </span>
                        </Link>
                      ) : (
                        <span
                          className="line-clamp-1 break-all text-secondary"
                          title={it.secondary ?? undefined}
                        >
                          {it.secondary ?? "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-secondary">
                      <span className="line-clamp-1 break-all">
                        {it.detail ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-faint">
                      {it.ip ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
