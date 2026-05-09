import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type {
  AgentToolOverrideRow,
  AgentWorkflowRow,
  AiSkillRow,
  EvalSuiteRow,
  SkillToolDef,
} from "../_types";
import type { AgentToolOption } from "./_components/AgentForm";

/**
 * Read the live skill registry. We import the registry at module load
 * so we don't need an HTTP roundtrip — the values come from the running
 * code path the runtime itself uses, which keeps the admin in sync with
 * what the agent can actually call.
 *
 * If the import shape changes in the future (e.g., the registry moves
 * to the database), update this single helper. The hardcoded fallback
 * matches the README enum so a broken import doesn't render an empty
 * checkbox grid.
 */
export async function loadSkillIds(): Promise<string[]> {
  try {
    const mod = await import("@/lib/agent/skills");
    type SkillLite = { id: string };
    const all = (mod as { ALL_SKILLS?: SkillLite[] }).ALL_SKILLS ?? [];
    const ids = all.map((s) => s.id).filter(Boolean);
    if (ids.length > 0) return Array.from(new Set(ids)).sort();
  } catch {
    // fall through
  }
  return [
    "workspace",
    "crm-contacts",
    "crm-companies",
    "crm-deals",
    "crm-leads",
    "crm-activities",
    "files",
    "boards",
    "apps",
    "meta",
  ];
}

/**
 * Tools available for the `allowed_tools` multi-select. Sourced from
 * `app_registry` (re + solutions only — OS shell apps and admin pages
 * aren't agent-callable). Returned in alphabetical order with domain &
 * category for the picker UI.
 */
export async function loadToolOptions(): Promise<AgentToolOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("app_registry")
    .select("id, title, domain, category")
    .in("domain", ["re", "solutions"])
    .order("domain", { ascending: true })
    .order("title", { ascending: true });

  if (error || !data) return [];

  type Row = {
    id: string;
    title: string;
    domain: string;
    category: string | null;
  };
  return (data as Row[]).map((r) => ({
    slug: r.id,
    title: r.title,
    domain: r.domain,
    category: r.category ?? "",
  }));
}

/* ─────────────────────────── v3 cross-link loaders ─────────────────────────── */

/** Lightweight skill row used for chips + tools-from-skill rendering. */
export type AgentSkillBundle = {
  id: string;
  display_name: string;
  description: string;
  category: string;
  kind: AiSkillRow["kind"];
  status: AiSkillRow["status"];
  tools: SkillToolDef[];
  /** True if the skill row is missing in `ai_skills` (code-defined,
   * not yet synced into the DB). The chip still links to the skill page
   * because the admin/skills detail page handles unknown ids. */
  missing: boolean;
};

/**
 * Hydrate the `allowed_skills` array on an agent into full skill rows
 * (description, category, tools_json) — one query, indexed by id. Skill
 * ids that don't have a row in `ai_skills` are returned with
 * `missing=true` so the UI can still render a chip + tool list (empty).
 */
export async function loadSkillsForAgent(
  allowedSkills: string[]
): Promise<AgentSkillBundle[]> {
  if (!Array.isArray(allowedSkills) || allowedSkills.length === 0) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_skills")
    .select(
      "id, kind, display_name, description, category, status, tools_json"
    )
    .in("id", allowedSkills);

  if (error) return [];

  type Row = Pick<
    AiSkillRow,
    | "id"
    | "kind"
    | "display_name"
    | "description"
    | "category"
    | "status"
    | "tools_json"
  >;
  const map = new Map<string, Row>();
  for (const r of (data ?? []) as Row[]) map.set(r.id, r);

  return allowedSkills.map((id) => {
    const r = map.get(id);
    if (!r) {
      return {
        id,
        display_name: id,
        description: "",
        category: "",
        kind: "code" as const,
        status: "live" as const,
        tools: [],
        missing: true,
      };
    }
    return {
      id: r.id,
      display_name: r.display_name,
      description: r.description ?? "",
      category: r.category ?? "",
      kind: r.kind,
      status: r.status,
      tools: Array.isArray(r.tools_json) ? (r.tools_json as SkillToolDef[]) : [],
      missing: false,
    };
  });
}

/**
 * Per-agent overrides keyed by (skill_id, tool_name). Returned as a
 * sorted array for stable rendering.
 */
export async function loadAgentToolOverrides(
  agentId: string
): Promise<AgentToolOverrideRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_tool_overrides")
    .select("*")
    .eq("agent_id", agentId)
    .order("skill_id", { ascending: true })
    .order("tool_name", { ascending: true });

  if (error || !data) return [];
  return data as AgentToolOverrideRow[];
}

/**
 * Effective tool list for an agent. Joins each skill's `tools_json`
 * with overrides applied. Tools whose `enabled=false` override is set
 * are still returned but flagged `disabled` so the admin can see them.
 */
export type EffectiveTool = {
  skill_id: string;
  /** Source-of-truth skill display_name; falls back to skill_id. */
  skill_label: string;
  /** True if the skill row is missing in ai_skills. */
  skill_missing: boolean;
  tool_name: string;
  description: string;
  read_only: boolean;
  requires_confirmation: boolean;
  enabled: boolean;
  has_override: boolean;
  /** The raw override row, if any — useful for the editor row. */
  override: AgentToolOverrideRow | null;
};

export function buildEffectiveTools(
  skills: AgentSkillBundle[],
  overrides: AgentToolOverrideRow[]
): EffectiveTool[] {
  // Index overrides for O(1) lookup.
  const byKey = new Map<string, AgentToolOverrideRow>();
  for (const o of overrides) byKey.set(`${o.skill_id}::${o.tool_name}`, o);

  const out: EffectiveTool[] = [];
  for (const s of skills) {
    for (const t of s.tools) {
      const o = byKey.get(`${s.id}::${t.name}`) ?? null;
      out.push({
        skill_id: s.id,
        skill_label: s.display_name,
        skill_missing: s.missing,
        tool_name: t.name,
        description:
          o?.override_description != null
            ? o.override_description
            : t.description,
        read_only:
          o?.read_only_override != null
            ? o.read_only_override
            : Boolean(t.read_only),
        requires_confirmation:
          o?.requires_confirmation_override != null
            ? o.requires_confirmation_override
            : Boolean(t.requires_confirmation),
        enabled: o ? o.enabled : true,
        has_override: Boolean(o),
        override: o,
      });
    }
  }
  return out;
}

/**
 * Workflows that reference an agent in their `steps` jsonb. We use a
 * Postgres jsonb `cs` (contains) operator with a single-step pattern
 * `[{"agent_id": "<id>"}]`; a workflow whose steps contain ANY object
 * matching that key/value will match.
 *
 * Falls back to a client-side scan if the `cs` query errors (rare —
 * happens when the steps column has a non-array value).
 */
export async function loadWorkflowsForAgent(
  agentId: string
): Promise<AgentWorkflowRow[]> {
  const admin = createAdminClient();

  // Primary: jsonb-contains a step with agent_id = this id.
  const { data, error } = await admin
    .from("agent_workflows")
    .select("*")
    .filter("steps", "cs", JSON.stringify([{ agent_id: agentId }]))
    .order("display_name", { ascending: true });

  if (!error && data) return data as AgentWorkflowRow[];

  // Fallback: scan everything and match in-app. Bounded — we only have
  // a handful of workflows in practice.
  const { data: all, error: allErr } = await admin
    .from("agent_workflows")
    .select("*")
    .order("display_name", { ascending: true });
  if (allErr || !all) return [];

  return (all as AgentWorkflowRow[]).filter((w) => {
    const steps = Array.isArray(w.steps) ? (w.steps as unknown[]) : [];
    return steps.some((step) => {
      if (!step || typeof step !== "object") return false;
      const aid = (step as { agent_id?: unknown }).agent_id;
      return typeof aid === "string" && aid === agentId;
    });
  });
}

/**
 * Eval suites whose target_kind='agent' and target_id = this agent. We
 * also surface suites with a NULL target_id as "global" to give the
 * admin one click to attach a suite to this agent.
 */
export async function loadEvalSuitesForAgent(
  agentId: string
): Promise<EvalSuiteRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("eval_suites")
    .select("*")
    .eq("target_kind", "agent")
    .eq("target_id", agentId)
    .order("display_name", { ascending: true });

  if (error || !data) return [];
  return data as EvalSuiteRow[];
}
