import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../../_lib";
import type { AiAgentRow, AiAgentRunRow } from "../../_types";
import {
  deleteAgent,
  setAgentStatus,
  updateAgent,
} from "../_actions";
import AccessChip from "../_components/AccessChip";
import AgentForm from "../_components/AgentForm";
import KindChip from "../_components/KindChip";
import RecentRuns from "../_components/RecentRuns";
import StatusChip from "../_components/StatusChip";
import VisibilityTester from "../_components/VisibilityTester";
import { loadSkillIds, loadToolOptions } from "../_data";

export const dynamic = "force-dynamic";

const RUN_LIMIT = 50;

export default async function AdminAgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const [agentRes, runsRes, skillIds, toolOptions] = await Promise.all([
    admin.from("ai_agents").select("*").eq("id", id).maybeSingle(),
    admin
      .from("ai_agent_runs")
      .select(
        "id, agent_id, workspace_id, user_id, channel, status, input_excerpt, output_excerpt, tokens_in, tokens_out, duration_ms, model, error, metadata, created_at"
      )
      .eq("agent_id", id)
      .order("created_at", { ascending: false })
      .limit(RUN_LIMIT),
    loadSkillIds(),
    loadToolOptions(),
  ]);

  if (agentRes.error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load agent: {agentRes.error.message}
      </div>
    );
  }
  const agent = agentRes.data as AiAgentRow | null;
  if (!agent) notFound();

  const runs = (runsRes.data ?? []) as AiAgentRunRow[];

  const successCount = runs.filter((r) => r.status === "success").length;
  const errorCount = runs.filter((r) => r.status === "error").length;
  const deniedCount = runs.filter((r) => r.status === "denied").length;
  const lastRunAt = runs[0]?.created_at ?? null;

  // Rotate-status quick form values
  const nextStatuses = (
    {
      live: "disabled",
      draft: "live",
      disabled: "draft",
    } as const
  )[agent.status];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/agents"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← AI agents
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-app">
              {agent.display_name}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-secondary">
              {agent.description || (
                <span className="text-faint">No description.</span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <code className="rounded-md border border-app bg-app px-2 py-1 font-mono">
                {agent.id}
              </code>
              <KindChip kind={agent.kind} />
              <StatusChip status={agent.status} />
              <AccessChip mode={agent.access_mode} />
              <span className="text-faint">·</span>
              <span>updated {formatDateTime(agent.updated_at)}</span>
            </div>
          </div>

          {/* Quick status flip */}
          <form
            action={setAgentStatus}
            className="flex items-center gap-2"
          >
            <input type="hidden" name="id" value={agent.id} />
            <input type="hidden" name="status" value={nextStatuses} />
            <button
              type="submit"
              className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-xs text-app transition-colors hover:border-tool-accent"
            >
              {agent.status === "live"
                ? "Disable"
                : agent.status === "draft"
                  ? "Publish (live)"
                  : "Move to draft"}
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Editor column */}
        <div className="min-w-0 space-y-6">
          <AgentForm
            mode="edit"
            action={updateAgent}
            agent={agent}
            skillIds={skillIds}
            toolOptions={toolOptions}
          />

          {/* Visibility tester */}
          <section className="space-y-3 rounded-xl border border-app bg-app-elevated p-5">
            <header>
              <h2 className="text-sm font-semibold text-app">
                Visibility tester
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Calls the <code className="font-mono">agent_visible</code> RPC
                with the same arguments the runtime uses.
              </p>
            </header>
            <VisibilityTester agentId={agent.id} />
          </section>

          {/* Danger zone */}
          <section className="space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
            <header>
              <h2 className="text-sm font-semibold text-rose-500">
                Danger zone
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Hard delete only works when the agent is{" "}
                <strong>disabled</strong> and has had no runs in the last 30
                days. Otherwise leave it disabled — runs reference it.
              </p>
            </header>
            <form action={deleteAgent}>
              <input type="hidden" name="id" value={agent.id} />
              <button
                type="submit"
                className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-opacity hover:opacity-80"
              >
                Delete agent
              </button>
            </form>
          </section>
        </div>

        {/* Runs panel */}
        <aside className="min-w-0 space-y-4">
          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <header className="mb-3">
              <h2 className="text-sm font-semibold text-app">Recent runs</h2>
              <p className="mt-0.5 text-xs text-muted">
                Last {RUN_LIMIT} entries from <code>ai_agent_runs</code>.
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
                <span className="text-emerald-500">{successCount} ok</span>
                <span className="text-rose-500">{errorCount} error</span>
                <span className="text-amber-600 dark:text-amber-400">
                  {deniedCount} denied
                </span>
                {lastRunAt && (
                  <span className="text-faint">
                    last {formatDateTime(lastRunAt)}
                  </span>
                )}
              </div>
            </header>
            <RecentRuns runs={runs} />
          </section>
        </aside>
      </div>
    </div>
  );
}
