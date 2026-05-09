import Link from "next/link";

import { createWorkflow } from "../_actions";
import WorkflowForm from "../_components/WorkflowForm";

export const dynamic = "force-dynamic";

/**
 * Create a new agent_workflows row. Steps cannot be added on this page —
 * after creation, the editor at `/admin/workflows/[id]` opens with the
 * step list ready for input.
 */
export default function AdminWorkflowNewPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/workflows"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Workflows
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New workflow</h1>
        <p className="mt-1 max-w-2xl text-sm text-secondary">
          Defaults: status=draft, trigger=manual, no steps. After saving
          you&apos;ll land on the workflow editor where you can compose the
          step list (skills, tools, prompts, branches).
        </p>
      </div>

      <WorkflowForm mode="create" action={createWorkflow} />
    </div>
  );
}
