import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../../_lib";
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

export const dynamic = "force-dynamic";

export default async function AdminWorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  const admin = createAdminClient();
  const [wfRes, skillOptions, promptOptions] = await Promise.all([
    admin.from("agent_workflows").select("*").eq("id", id).maybeSingle(),
    loadSkillOptions(),
    loadPromptOptions(),
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
            <header className="mb-2">
              <h2 className="text-sm font-semibold text-app">Run history</h2>
              <p className="mt-0.5 text-xs text-muted">
                Per-workflow execution metrics will appear here once the
                runtime emits them.
              </p>
            </header>
            <div className="rounded-md border border-dashed border-app bg-app/40 px-3 py-6 text-center text-[11px] text-faint">
              No runs yet
            </div>
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
