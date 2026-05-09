import Link from "next/link";

import { createAgent } from "../_actions";
import AgentForm from "../_components/AgentForm";
import { loadSkillIds, loadToolOptions } from "../_data";

export const dynamic = "force-dynamic";

export default async function AdminAgentNewPage() {
  const [skillIds, toolOptions] = await Promise.all([
    loadSkillIds(),
    loadToolOptions(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/agents"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← AI agents
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New AI agent</h1>
        <p className="mt-1 max-w-2xl text-sm text-secondary">
          Defaults: kind=tool-sidekick, model=claude-opus-4-7, status=draft,
          access=all. Drafts are admin-only until you flip status to live.
        </p>
      </div>

      <AgentForm
        mode="create"
        action={createAgent}
        skillIds={skillIds}
        toolOptions={toolOptions}
      />
    </div>
  );
}
