import { createAdminClient } from "@/lib/supabase/admin";
import type {
  WorkflowDefinition,
  WorkflowTriggerKind,
} from "@/lib/workflows/types";

import BuilderClient, {
  type BuilderWorkflowRow,
  type BuilderWorkspace,
} from "./_components/BuilderClient";

export const dynamic = "force-dynamic";

/**
 * Visual workflow builder for the new `public.workflows` table.
 *
 * Distinct from `/admin/workflows` (the legacy `agent_workflows`
 * registry, where you wire skills/tools/prompts into a multi-step AI
 * flow). This page is for end-user automation: trigger → conditions →
 * actions saved per workspace.
 *
 * Server component: fetches the workspace list and the workflow rows,
 * passes them to a client editor. Mutations go through server actions
 * in `_components/_actions.ts`.
 */
export default async function WorkflowBuilderPage() {
  const admin = createAdminClient();

  const [{ data: workspacesRaw }, { data: workflowsRaw }] = await Promise.all([
    admin
      .from("workspaces")
      .select("id, name")
      .order("name", { ascending: true })
      .limit(200),
    admin
      .from("workflows")
      .select(
        "id, workspace_id, name, description, trigger_kind, enabled, definition, updated_at"
      )
      .order("updated_at", { ascending: false })
      .limit(200),
  ]);

  const workspaces: BuilderWorkspace[] = (workspacesRaw ?? []).map((w) => ({
    id: w.id as string,
    name: (w.name as string) ?? "(unnamed)",
  }));

  const workflows: BuilderWorkflowRow[] = (workflowsRaw ?? []).map((w) => ({
    id: w.id as string,
    workspace_id: w.workspace_id as string,
    name: (w.name as string) ?? "",
    description: (w.description as string | null) ?? null,
    trigger_kind: (w.trigger_kind as WorkflowTriggerKind) ?? "manual",
    enabled: Boolean(w.enabled ?? true),
    definition: ((w.definition as WorkflowDefinition | null) ?? {
      id: w.id as string,
      workspace_id: w.workspace_id as string,
      name: (w.name as string) ?? "",
      trigger: { kind: "manual" },
      steps: [],
    }) as WorkflowDefinition,
    updated_at: (w.updated_at as string) ?? "",
  }));

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          AI
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">
          Visual workflow builder
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          Per-workspace automation. Pick a trigger, narrow with conditions,
          chain actions. Drafts can be generated from natural language with
          the AI panel on the left.
        </p>
      </div>
      <BuilderClient workspaces={workspaces} workflows={workflows} />
    </div>
  );
}
