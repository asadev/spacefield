import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../../../_lib";
import type { AiAgentRow } from "../../../_types";
import OverrideEditor from "../../_components/OverrideEditor";
import SourceChip from "../../_components/SourceChip";
import { loadToolDetail, type ToolSource } from "../../_data";

export const dynamic = "force-dynamic";

const VALID_SOURCES: ToolSource[] = [
  "app-registry",
  "skill-code",
  "skill-custom",
];

function isValidSource(s: string): s is ToolSource {
  return (VALID_SOURCES as string[]).includes(s);
}

export default async function ToolDetailPage({
  params,
}: {
  params: Promise<{ source: string; id: string }>;
}) {
  const raw = await params;
  const source = decodeURIComponent(raw.source);
  const id = decodeURIComponent(raw.id);

  if (!isValidSource(source)) notFound();

  const detail = await loadToolDetail(source, id);
  if (!detail) notFound();

  const { unified, skill, app, usedByAgents, overrides, recentRuns, recentRunsTotal } =
    detail;

  // Pull the full agent list once for the override editor's dropdown.
  // We only need it for skill-* tools, but loading it here keeps the
  // server-side render fan-out tight.
  const admin = createAdminClient();
  const { data: agentsData } = await admin
    .from("ai_agents")
    .select("id, display_name, status")
    .order("display_name", { ascending: true })
    .limit(1000);
  type AgentLite = Pick<AiAgentRow, "id" | "display_name" | "status">;
  const agents = (agentsData ?? []) as AgentLite[];

  const isSkillTool = source !== "app-registry";

  /* For app-registry tools, also surface workspace + user grant counts
   * the same way the apps detail page does, so the admin can see
   * scope at a glance. */
  let appGrantCounts: { user: number; workspace: number } | null = null;
  if (source === "app-registry" && app) {
    const [{ count: userCount }, { count: wsCount }] = await Promise.all([
      admin
        .from("user_app_grants")
        .select("*", { count: "exact", head: true })
        .eq("slug", app.id),
      admin
        .from("workspace_tool_grants")
        .select("*", { count: "exact", head: true })
        .eq("slug", app.id),
    ]);
    appGrantCounts = {
      user: userCount ?? 0,
      workspace: wsCount ?? 0,
    };
  }

  const sourceHref =
    source === "app-registry"
      ? `/admin/apps/${encodeURIComponent(unified.source_id)}`
      : `/admin/skills/${encodeURIComponent(unified.source_id)}`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/tools-catalog"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Tool catalog
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-mono text-xl font-semibold text-app tabular-nums">
              {unified.name}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-secondary">
              {unified.description || (
                <span className="text-faint">No description.</span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <SourceChip source={unified.source} />
              <Link
                href={sourceHref}
                className="rounded-md border border-app bg-app px-2 py-1 font-mono tabular-nums hover:text-tool-accent"
              >
                {unified.source_id}
              </Link>
              <span className="rounded-full border border-app bg-app-elevated px-2 py-0.5 text-[10px] uppercase tracking-wide text-secondary">
                {unified.category}
              </span>
              {unified.read_only && (
                <span className="rounded-full border border-app bg-app px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                  read-only
                </span>
              )}
              {unified.requires_confirmation && (
                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  confirms
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left column — schema + overrides + runs */}
        <div className="min-w-0 space-y-6">
          {/* Source-specific context block */}
          {source === "app-registry" && app && (
            <section className="rounded-xl border border-app bg-app-elevated p-5">
              <header className="mb-3">
                <h2 className="text-sm font-semibold text-app">App registry</h2>
                <p className="mt-0.5 text-xs text-muted">
                  This tool is an OS-shell app — the agent runtime treats
                  the slug as a passthrough action; tool-level overrides
                  do not apply to app-registry entries.
                </p>
              </header>
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <Detail label="Domain">
                  <span className="font-mono text-app">{app.domain}</span>
                </Detail>
                <Detail label="Access mode">
                  <span className="font-mono text-app">{app.access_mode}</span>
                </Detail>
                <Detail label="Published">
                  <span
                    className={
                      app.published
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-500"
                    }
                  >
                    {app.published ? "yes" : "no"}
                  </span>
                </Detail>
                <Detail label="Sort order">
                  <span className="font-mono text-app">{app.sort_order}</span>
                </Detail>
                <Detail label="Access tiers">
                  <span className="font-mono text-app">
                    {Array.isArray(app.access_tiers) && app.access_tiers.length > 0
                      ? app.access_tiers.join(", ")
                      : "—"}
                  </span>
                </Detail>
                <Detail label="Allowlist users">
                  <span className="font-mono text-app">
                    {Array.isArray(app.allowlist_user_ids)
                      ? app.allowlist_user_ids.length
                      : 0}
                  </span>
                </Detail>
                {appGrantCounts && (
                  <>
                    <Detail label="User grants">
                      <span className="font-mono text-app">
                        {appGrantCounts.user}
                      </span>
                    </Detail>
                    <Detail label="Workspace grants">
                      <span className="font-mono text-app">
                        {appGrantCounts.workspace}
                      </span>
                    </Detail>
                  </>
                )}
              </dl>
              <div className="mt-3 flex items-center justify-end">
                <Link
                  href={sourceHref}
                  className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-xs text-app transition-colors hover:border-tool-accent"
                >
                  Edit in Apps →
                </Link>
              </div>
            </section>
          )}

          {isSkillTool && (
            <section className="rounded-xl border border-app bg-app-elevated p-5">
              <header className="mb-3">
                <h2 className="text-sm font-semibold text-app">
                  Source skill
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  Edits to the tool definition (name, description, schema,
                  handler) live on the skill page. Per-agent overlays
                  are managed below.
                </p>
              </header>
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <Detail label="Skill id">
                  <Link
                    href={sourceHref}
                    className="font-mono text-app hover:text-tool-accent"
                  >
                    {unified.source_id}
                  </Link>
                </Detail>
                <Detail label="Source kind">
                  <span className="font-mono text-app">
                    {source === "skill-code" ? "code" : "custom"}
                  </span>
                </Detail>
                {skill && (
                  <Detail label="Skill name">
                    <span className="text-app">{skill.display_name}</span>
                  </Detail>
                )}
                {skill && (
                  <Detail label="Skill status">
                    <span className="font-mono text-app">{skill.status}</span>
                  </Detail>
                )}
                {unified.handler_target && (
                  <Detail label="Handler">
                    <code className="font-mono text-[11px] text-app">
                      {unified.handler_target}
                    </code>
                  </Detail>
                )}
                <Detail label="Read-only">
                  <span
                    className={
                      unified.read_only
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-faint"
                    }
                  >
                    {unified.read_only ? "yes" : "no"}
                  </span>
                </Detail>
                <Detail label="Requires confirm">
                  <span
                    className={
                      unified.requires_confirmation
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-faint"
                    }
                  >
                    {unified.requires_confirmation ? "yes" : "no"}
                  </span>
                </Detail>
              </dl>
              <div className="mt-3 flex items-center justify-end">
                <Link
                  href={sourceHref}
                  className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-xs text-app transition-colors hover:border-tool-accent"
                >
                  Edit in Skills →
                </Link>
              </div>
            </section>
          )}

          {/* Input schema */}
          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <header className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-app">Input schema</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Surface fed to the LLM as part of the tool definition.
                </p>
              </div>
            </header>
            {unified.input_schema ? (
              <pre className="max-h-[480px] overflow-auto rounded-lg border border-app bg-app p-3 font-mono text-[11px] leading-relaxed tabular-nums text-app">
                {JSON.stringify(unified.input_schema, null, 2)}
              </pre>
            ) : (
              <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-muted">
                {source === "app-registry"
                  ? "App-registry entries have no JSON schema — they're shell apps, not LLM tools."
                  : "Schema unavailable."}
              </div>
            )}
          </section>

          {/* Override editor — only meaningful for skill-* tools */}
          {isSkillTool ? (
            <OverrideEditor
              source={unified.source}
              idForPath={unified.name}
              skill_id={unified.source_id}
              tool_name={unified.name}
              agents={agents}
              overrides={overrides}
            />
          ) : (
            <section className="rounded-xl border border-app bg-app-elevated p-5">
              <header className="mb-3">
                <h2 className="text-sm font-semibold text-app">
                  Tool overrides
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  App-registry tools don&apos;t expose per-agent override
                  overlays. Manage user / workspace / tier scope directly
                  on the app page.
                </p>
              </header>
              <Link
                href={sourceHref}
                className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-xs text-app transition-colors hover:border-tool-accent"
              >
                Manage app access →
              </Link>
            </section>
          )}

          {/* Recent runs */}
          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <header className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-app">Recent runs</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Best-effort match across <code>ai_agent_runs.metadata</code>{" "}
                  for the tool name. Useful when triaging a regression —
                  not a substitute for proper run tracing.
                </p>
              </div>
              <span className="rounded-full border border-app bg-app px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                {recentRunsTotal} matches
              </span>
            </header>
            {recentRuns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-muted">
                No runs in the recent window mention this tool.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-app bg-app">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                      <th className="px-3 py-2 text-left font-normal">When</th>
                      <th className="px-3 py-2 text-left font-normal">Agent</th>
                      <th className="px-3 py-2 text-left font-normal">Status</th>
                      <th className="px-3 py-2 text-right font-normal">
                        Duration
                      </th>
                      <th className="px-3 py-2 text-left font-normal">Input</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-app last:border-b-0"
                      >
                        <td className="px-3 py-2 font-mono tabular-nums text-secondary">
                          {formatDateTime(r.created_at)}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-secondary">
                          {r.agent_id ? (
                            <Link
                              href={`/admin/agents/${encodeURIComponent(r.agent_id)}`}
                              className="hover:text-tool-accent"
                            >
                              {r.agent_id}
                            </Link>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <RunStatusChip status={r.status} />
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-secondary">
                          {r.duration_ms != null ? `${r.duration_ms} ms` : "—"}
                        </td>
                        <td className="px-3 py-2 text-secondary">
                          {r.input_excerpt ? (
                            <span className="line-clamp-2 max-w-md">
                              {r.input_excerpt}
                            </span>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Test invoke — placeholder. Wiring the agent runtime test
              path through the admin panel is non-trivial (per the
              contract), so we surface a marker here that points the
              admin at the existing skill-level test runner. */}
          <section className="rounded-xl border border-dashed border-app bg-app-elevated p-5">
            <header className="mb-2">
              <h2 className="text-sm font-semibold text-app">
                Test invoke (coming soon)
              </h2>
            </header>
            <p className="text-xs text-muted">
              Direct tool invocation from the admin panel is on the
              roadmap. For now, run the parent skill&apos;s test bench
              from the skill page, or use{" "}
              <code className="font-mono text-secondary">
                /api/agent/dispatch
              </code>{" "}
              with a sample input.
            </p>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="min-w-0 space-y-4">
          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <header className="mb-3">
              <h2 className="text-sm font-semibold text-app">Summary</h2>
              <p className="mt-0.5 text-xs text-muted">At-a-glance.</p>
            </header>
            <dl className="space-y-2 text-xs">
              <Detail label="Source">
                <SourceChip source={unified.source} />
              </Detail>
              <Detail label="Used by agents">
                <span className="font-mono text-app tabular-nums">
                  {unified.used_by_count}
                </span>
              </Detail>
              <Detail label="Overrides">
                <span
                  className={
                    unified.override_count > 0
                      ? "font-mono text-tool-accent tabular-nums"
                      : "font-mono text-faint tabular-nums"
                  }
                >
                  {unified.override_count}
                </span>
              </Detail>
              <Detail label="Recent runs">
                <span className="font-mono text-app tabular-nums">
                  {recentRunsTotal}
                </span>
              </Detail>
            </dl>
          </section>

          {/* Used-by agents listing */}
          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <header className="mb-3">
              <h2 className="text-sm font-semibold text-app">Used by</h2>
              <p className="mt-0.5 text-xs text-muted">
                Agents whose allowlist includes{" "}
                {source === "app-registry" ? "this app" : "the parent skill"}.
              </p>
            </header>
            {usedByAgents.length === 0 ? (
              <div className="text-xs text-muted">
                No agents currently expose this tool.
              </div>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {usedByAgents.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <Link
                      href={`/admin/agents/${encodeURIComponent(a.id)}`}
                      className="min-w-0 truncate text-app hover:text-tool-accent"
                    >
                      {a.display_name}
                    </Link>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
                        a.status === "live"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : a.status === "draft"
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : "bg-rose-500/15 text-rose-500"
                      }`}
                    >
                      {a.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[10px] uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

function RunStatusChip({ status }: { status: string }) {
  const cls =
    status === "success"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : status === "error"
        ? "bg-rose-500/15 text-rose-500"
        : status === "denied"
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          : "bg-app text-muted border border-app";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}
