import { createAdminClient } from "@/lib/supabase/admin";

import type {
  AiAgentRow,
  AiSkillRow,
  PromptLibraryRow,
} from "../_types";
import PlaygroundPicker, { type PickerItem } from "./_picker";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AI Playground · Admin",
};

/**
 * Combined entry-point for the live test surfaces. Renders three
 * searchable cards (agents / skills / prompts) — picking one lands the
 * admin on the corresponding `[id]/playground` page.
 */
export default async function AdminPlaygroundHubPage() {
  const adminDb = createAdminClient();
  const [agentsRes, skillsRes, promptsRes] = await Promise.all([
    adminDb
      .from("ai_agents")
      .select("id, display_name, description, kind, model, status, sort_order")
      .order("status", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("display_name", { ascending: true }),
    adminDb
      .from("ai_skills")
      .select("id, display_name, description, kind, status, category, sort_order")
      .order("status", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("display_name", { ascending: true }),
    adminDb
      .from("prompt_library")
      .select("id, display_name, description, status, current_version, category")
      .order("status", { ascending: true })
      .order("display_name", { ascending: true }),
  ]);

  const agents = (agentsRes.data ?? []) as Pick<
    AiAgentRow,
    "id" | "display_name" | "description" | "kind" | "model" | "status" | "sort_order"
  >[];
  const skills = (skillsRes.data ?? []) as Pick<
    AiSkillRow,
    "id" | "display_name" | "description" | "kind" | "status" | "category" | "sort_order"
  >[];
  const prompts = (promptsRes.data ?? []) as Pick<
    PromptLibraryRow,
    "id" | "display_name" | "description" | "status" | "current_version" | "category"
  >[];

  const agentItems: PickerItem[] = agents.map((a) => ({
    id: a.id,
    title: a.display_name,
    subtitle: `${a.kind} · ${a.model}${a.description ? ` — ${a.description}` : ""}`,
    status: a.status,
    href: `/admin/agents/${encodeURIComponent(a.id)}/playground`,
  }));
  const skillItems: PickerItem[] = skills.map((s) => ({
    id: s.id,
    title: s.display_name,
    subtitle: `${s.kind} · ${s.category}${s.description ? ` — ${s.description}` : ""}`,
    status: s.status,
    href: `/admin/skills/${encodeURIComponent(s.id)}/playground`,
  }));
  const promptItems: PickerItem[] = prompts.map((p) => ({
    id: p.id,
    title: p.display_name,
    subtitle: `${p.category} · v${p.current_version}${p.description ? ` — ${p.description}` : ""}`,
    status: p.status,
    href: `/admin/prompts/${encodeURIComponent(p.id)}/playground`,
  }));

  return (
    <div className="space-y-6">
      <div>
        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-muted">
          AI Quality
        </span>
        <h1 className="mt-1 text-xl font-semibold text-app">AI playground</h1>
        <p className="mt-1 max-w-2xl text-sm text-secondary">
          Live test surfaces for agents, skills, and prompts. Agent runs
          call Anthropic with the agent&rsquo;s system prompt + model.
          Skill invokes dispatch RPC handlers (or describe code/HTTP
          dispatches). Prompt tests render variables and optionally call a
          model with the resolved prompt.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="Agents"
          description="Chat with an agent using its configured system prompt + model. No skills are dispatched — pure model output."
          count={agents.length}
        >
          <PlaygroundPicker
            items={agentItems}
            emptyLabel="No agents yet."
            searchPlaceholder="Search agents…"
          />
        </Card>

        <Card
          title="Skills"
          description="Invoke a skill's tool with sample input. RPC handlers run live; code + HTTP handlers return a dispatch description only."
          count={skills.length}
        >
          <PlaygroundPicker
            items={skillItems}
            emptyLabel="No skills yet."
            searchPlaceholder="Search skills…"
          />
        </Card>

        <Card
          title="Prompts"
          description="Substitute a prompt's variables and (optionally) hit a model with the resolved text. Useful for tuning before promoting."
          count={prompts.length}
        >
          <PlaygroundPicker
            items={promptItems}
            emptyLabel="No prompts yet."
            searchPlaceholder="Search prompts…"
          />
        </Card>
      </div>
    </div>
  );
}

function Card({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-app bg-app-elevated p-5">
      <header className="mb-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-app">{title}</h2>
          <span className="rounded-full bg-app px-2 py-0.5 font-mono text-[11px] text-secondary">
            {count}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </header>
      {children}
    </section>
  );
}
