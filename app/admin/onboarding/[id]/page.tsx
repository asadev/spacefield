import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../../_lib";
import type {
  OnboardingFlowRow,
  OnboardingStepRow,
} from "../../_types";
import {
  addStep,
  deleteFlow,
  deleteStep,
  moveStep,
  setStatus,
  updateFlow,
  updateStep,
} from "../_actions";
import FlowForm from "../_components/FlowForm";
import Preview from "../_components/Preview";
import StatusChip from "../_components/StatusChip";
import StepEditor from "../_components/StepEditor";

export const dynamic = "force-dynamic";

export default async function AdminOnboardingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  const admin = createAdminClient();
  const [flowRes, stepsRes] = await Promise.all([
    admin
      .from("onboarding_flows")
      .select("*")
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("onboarding_steps")
      .select("*")
      .eq("flow_id", id)
      .order("step_index", { ascending: true }),
  ]);

  if (flowRes.error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load flow: {flowRes.error.message}
      </div>
    );
  }

  const flow = flowRes.data as OnboardingFlowRow | null;
  if (!flow) notFound();

  const steps = (stepsRes.data ?? []) as OnboardingStepRow[];

  // Quick status flip ladder — same UX as workflows.
  const nextStatus = (
    {
      live: "archived",
      draft: "live",
      archived: "draft",
    } as const
  )[flow.status];
  const flipLabel =
    flow.status === "live"
      ? "Archive"
      : flow.status === "draft"
        ? "Publish (live)"
        : "Move to draft";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/onboarding"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← All flows
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-app">
              {flow.display_name}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-secondary">
              {flow.description || (
                <span className="text-faint">No description.</span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <code className="rounded-md border border-app bg-app px-2 py-1 font-mono">
                {flow.id}
              </code>
              <span className="rounded-full border border-app bg-app-elevated px-2 py-0.5 font-mono text-[10px] text-secondary">
                trigger: {flow.trigger_event}
              </span>
              <span className="rounded-full border border-app bg-app-elevated px-2 py-0.5 text-[10px] text-secondary">
                audience: {flow.audience}
              </span>
              <StatusChip status={flow.status} />
              <span className="text-faint">·</span>
              <span>
                {steps.length} step{steps.length === 1 ? "" : "s"}
              </span>
              <span className="text-faint">·</span>
              <span>updated {formatDateTime(flow.updated_at)}</span>
            </div>
          </div>

          <form action={setStatus} className="flex items-center gap-2">
            <input type="hidden" name="id" value={flow.id} />
            <input type="hidden" name="status" value={nextStatus} />
            <button
              type="submit"
              className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-xs text-app transition-colors hover:border-tool-accent"
            >
              {flipLabel}
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <FlowForm mode="edit" action={updateFlow} flow={flow} />

          <section className="space-y-3 rounded-xl border border-app bg-app-elevated p-5">
            <header>
              <h2 className="text-sm font-semibold text-app">Steps</h2>
              <p className="mt-0.5 text-xs text-muted">
                The runtime renders these in order. Each step has a kind
                (welcome / tour / form / video / checklist / call-to-action),
                a title and body, and optional CTA + config JSON.
              </p>
            </header>
            <StepEditor
              flowId={flow.id}
              steps={steps}
              addStep={addStep}
              updateStep={updateStep}
              deleteStep={deleteStep}
              moveStep={moveStep}
            />
          </section>

          <section className="space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
            <header>
              <h2 className="text-sm font-semibold text-rose-500">
                Danger zone
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Hard delete removes the flow and all its steps (cascades).
                Archive instead if other systems reference the id.
              </p>
            </header>
            <form action={deleteFlow}>
              <input type="hidden" name="id" value={flow.id} />
              <button
                type="submit"
                className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-opacity hover:opacity-80"
              >
                Delete flow
              </button>
            </form>
          </section>
        </div>

        <aside className="min-w-0">
          <Preview flow={flow} steps={steps} />
        </aside>
      </div>
    </div>
  );
}
