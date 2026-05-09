import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { fetchAuthUsersByIds, formatDateTime } from "../../_lib";
import type { AgentWorkflowRow } from "../../_types";
import {
  addStep,
  deleteWorkflow,
  moveStep,
  removeStep,
  setStatus,
  updateWorkflow,
} from "../_actions";
import StatusChip from "../_components/StatusChip";
import StepEditor, {
  type WorkflowStep,
} from "../_components/StepEditor";
import TriggerChip from "../_components/TriggerChip";
import WorkflowForm from "../_components/WorkflowForm";
import { loadPromptOptions, loadSkillOptions } from "../_data";
import RunButton from "./_RunButton";

export const dynamic = "force-dynamic";

interface WorkflowRunRow {
  id: string;
  workflow_id: string;
  triggered_by: string | null;
  trigger_kind: "manual" | "event" | "cron";
  status: "running" | "completed" | "failed" | "cancelled";
  step_results: unknown;
  input: unknown;
  output: unknown;
  error: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
  started_at: string;
  finished_at: string | null;
}

export default async function AdminWorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  const admin = createAdminClient();
  const [wfRes, skillOptions, promptOptions, runsRes] = await Promise.all([
    admin.from("agent_workflows").select("*").eq("id", id).maybeSingle(),
    loadSkillOptions(),
    loadPromptOptions(),
    admin
      .from("workflow_runs")
      .select(
        "id, workflow_id, triggered_by, trigger_kind, status, step_results, input, output, error, duration_ms, metadata, started_at, finished_at"
      )
      .eq("workflow_id", id)
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  if (wfRes.error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load workflow: {wfRes.error.message}
      </div>
    );
  }
  const workflow = wfRes.data as AgentWorkflowRow | null;
  if (!workflow) notFound();

  const steps = (Array.isArray(workflow.steps) ? workflow.steps : []) as WorkflowStep[];

  const runs: WorkflowRunRow[] = Array.isArray(runsRes?.data)
    ? (runsRes.data as WorkflowRunRow[])
    : [];

  // Resolve triggered_by → email for display.
  const actorIds = Array.from(
    new Set(runs.map((r) => r.triggered_by).filter((v): v is string => !!v))
  );
  const userMap =
    actorIds.length > 0 ? await fetchAuthUsersByIds(actorIds) : new Map();

  // Quick status flip — same UX as agents/skills.
  const nextStatus = (
    {
      live: "disabled",
      draft: "live",
      disabled: "draft",
    } as const
  )[workflow.status];

  const triggerConfigPreview = (() => {
    try {
      const cfg = workflow.trigger_config ?? {};
      if (!cfg || Object.keys(cfg).length === 0) return null;
      return JSON.stringify(cfg, null, 2);
    } catch {
      return null;
    }
  })();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/workflows"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Workflows
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-app">
              {workflow.display_name}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-secondary">
              {workflow.description || (
                <span className="text-faint">No description.</span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <code className="rounded-md border border-app bg-app px-2 py-1 font-mono">
                {workflow.id}
              </code>
              <TriggerChip kind={workflow.trigger_kind} />
              <StatusChip status={workflow.status} />
              <span className="text-faint">·</span>
              <span>{steps.length} step{steps.length === 1 ? "" : "s"}</span>
              <span className="text-faint">·</span>
              <span>updated {formatDateTime(workflow.updated_at)}</span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <RunButton workflowId={workflow.id} />
              {/* Quick status flip */}
              <form action={setStatus} className="flex items-center gap-2">
                <input type="hidden" name="id" value={workflow.id} />
                <input type="hidden" name="status" value={nextStatus} />
                <button
                  type="submit"
                  className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-xs text-app transition-colors hover:border-tool-accent"
                >
                  {workflow.status === "live"
                    ? "Disable"
                    : workflow.status === "draft"
                      ? "Publish (live)"
                      : "Move to draft"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Editor column */}
        <div className="min-w-0 space-y-6">
          <WorkflowForm
            mode="edit"
            action={updateWorkflow}
            workflow={workflow}
          />

          <section className="space-y-3 rounded-xl border border-app bg-app-elevated p-5">
            <header>
              <h2 className="text-sm font-semibold text-app">Steps</h2>
              <p className="mt-0.5 text-xs text-muted">
                The runtime executes these top-to-bottom. Each step can
                consume earlier steps&apos; output via{" "}
                <code className="font-mono">{`{{output_var}}`}</code>.
              </p>
            </header>
            <StepEditor
              workflowId={workflow.id}
              steps={steps}
              skillOptions={skillOptions}
              promptOptions={promptOptions}
              addStep={addStep}
              removeStep={removeStep}
              moveStep={moveStep}
            />
          </section>

          {/* Danger zone */}
          <section className="space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
            <header>
              <h2 className="text-sm font-semibold text-rose-500">
                Danger zone
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Hard delete removes the row and the step list. Disable the
                workflow first if other systems reference it by id.
              </p>
            </header>
            <form action={deleteWorkflow}>
              <input type="hidden" name="id" value={workflow.id} />
              <button
                type="submit"
                className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-opacity hover:opacity-80"
              >
                Delete workflow
              </button>
            </form>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="min-w-0 space-y-4">
          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <header className="mb-3">
              <h2 className="text-sm font-semibold text-app">Summary</h2>
              <p className="mt-0.5 text-xs text-muted">
                What the runtime sees for this workflow.
              </p>
            </header>

            <dl className="space-y-2 text-xs">
              <Detail label="Status">
                <StatusChip status={workflow.status} />
              </Detail>
              <Detail label="Trigger">
                <TriggerChip kind={workflow.trigger_kind} />
              </Detail>
              <Detail label="Steps">
                <span className="font-mono text-app">{steps.length}</span>
              </Detail>
              <Detail label="Created">
                <span className="font-mono text-[11px] text-app">
                  {formatDateTime(workflow.created_at)}
                </span>
              </Detail>
              <Detail label="Updated">
                <span className="font-mono text-[11px] text-app">
                  {formatDateTime(workflow.updated_at)}
                </span>
              </Detail>
            </dl>
          </section>

          {triggerConfigPreview && (
            <section className="rounded-xl border border-app bg-app-elevated p-5">
              <header className="mb-2">
                <h2 className="text-sm font-semibold text-app">
                  Trigger config
                </h2>
              </header>
              <pre className="overflow-x-auto rounded-md border border-app bg-app p-3 font-mono text-[11px] text-secondary">
                {triggerConfigPreview}
              </pre>
            </section>
          )}

          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <header className="mb-3">
              <h2 className="text-sm font-semibold text-app">Recent runs</h2>
              <p className="mt-0.5 text-xs text-muted">
                Last 20 executions of this workflow. Click a row to expand
                step results.
              </p>
            </header>
            {runs.length === 0 ? (
              <div className="rounded-md border border-dashed border-app bg-app/40 px-3 py-6 text-center text-[11px] text-faint">
                No runs yet — hit &ldquo;Run now&rdquo; above to trigger one.
              </div>
            ) : (
              <ul className="space-y-2">
                {runs.map((run) => {
                  const actor = run.triggered_by
                    ? userMap.get(run.triggered_by)
                    : null;
                  return <RunRow key={run.id} run={run} actorEmail={actor?.email ?? null} />;
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function RunRow({
  run,
  actorEmail,
}: {
  run: WorkflowRunRow;
  actorEmail: string | null;
}) {
  const stepsText = (() => {
    if (!Array.isArray(run.step_results)) return "";
    try {
      return JSON.stringify(run.step_results, null, 2);
    } catch {
      return "";
    }
  })();

  const statusColor =
    run.status === "completed"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
      : run.status === "failed"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-500"
        : run.status === "cancelled"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
          : "border-sky-500/30 bg-sky-500/10 text-sky-500";

  return (
    <li className="rounded-md border border-app bg-app/40 text-[11px]">
      <details className="group">
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusColor}`}
            >
              {run.status}
            </span>
            <span className="truncate font-mono text-[10px] text-app">
              {run.id.slice(0, 8)}
            </span>
            <span className="text-faint">·</span>
            <span className="text-[10px] text-muted">
              {run.trigger_kind}
            </span>
          </div>
          <span className="shrink-0 text-[10px] text-muted">
            {run.duration_ms !== null ? `${run.duration_ms}ms` : "—"}
          </span>
        </summary>
        <div className="space-y-2 border-t border-app px-3 py-2 text-[10px]">
          <div className="grid grid-cols-2 gap-2 text-muted">
            <div>
              <div className="text-faint">started</div>
              <div className="font-mono text-app">
                {formatDateTime(run.started_at)}
              </div>
            </div>
            <div>
              <div className="text-faint">finished</div>
              <div className="font-mono text-app">
                {run.finished_at ? formatDateTime(run.finished_at) : "—"}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-faint">triggered by</div>
              <div className="truncate font-mono text-app">
                {actorEmail ?? (run.triggered_by ? "(unknown user)" : "(system)")}
              </div>
            </div>
          </div>
          {run.error && (
            <div className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 font-mono text-[10px] text-rose-500">
              {run.error}
            </div>
          )}
          {stepsText && (
            <pre className="max-h-64 overflow-auto rounded border border-app bg-app p-2 font-mono text-[10px] text-secondary">
              {stepsText}
            </pre>
          )}
        </div>
      </details>
    </li>
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
