import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type {
  AgentToolOverrideRow,
  AiSkillRow,
  AppRegistryRow,
  SkillToolDef,
} from "../_types";

/**
 * Tools-catalog data layer.
 *
 * The catalog merges tools from three sources and presents them as a
 * single browse surface:
 *
 *   1. `app-registry`   — every row in `public.app_registry`. These are
 *                         the OS-shell tool entries (re/solutions/os).
 *   2. `skill-custom`   — every entry in `tools_json` of every
 *                         `ai_skills` row with kind='custom'.
 *   3. `skill-code`     — every tool exposed by a code-defined skill.
 *                         We import `lib/agent/skills` at server-render
 *                         time so the catalog reflects the actual code.
 *
 * Each unified row carries a `source` discriminator so the per-tool
 * detail page can re-resolve the entry.
 */

export type ToolSource = "app-registry" | "skill-custom" | "skill-code";

export interface UnifiedTool {
  source: ToolSource;
  /** Logical id surfaced in the URL. For app-registry this is the
   *  app slug; for skill tools this is the tool name. */
  name: string;
  /** Human display name (when available; falls back to `name`). */
  display_name: string;
  description: string;
  category: string;
  /** Source row id — app slug for app-registry, skill id for skill-*. */
  source_id: string;
  /** Friendly source label for tooltips. */
  source_label: string;
  /** Read-only flag (skill tools); always false for app-registry. */
  read_only: boolean;
  /** Requires confirmation flag (skill tools); false for app-registry. */
  requires_confirmation: boolean;
  /** Full input schema (skill tools); empty for app-registry. */
  input_schema: Record<string, unknown> | null;
  /** Module path for code-defined skills, RPC/HTTP target for custom,
   *  or null for app-registry. */
  handler_target: string | null;
  /** Used-by count: agents that include the parent skill in
   *  allowed_skills (skill-*) or allowed_tools (app-registry). */
  used_by_count: number;
  /** Override row count from agent_tool_overrides (skill-* only). */
  override_count: number;
}

/* ────────────────────── code-skill registry ────────────────────── */

interface CodeSkillToolLite {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  read_only: boolean;
}

interface CodeSkillLite {
  id: string;
  label: string;
  description: string;
  tools: CodeSkillToolLite[];
}

/**
 * Read the live code-defined skill registry. We import the registry at
 * module load — the values come from the running code path the runtime
 * uses, which keeps the catalog in sync with what the agent can call.
 *
 * Failure to import isn't fatal: we fall back to the database (any
 * `ai_skills` row with kind='code' contributes its tools_json). Worst
 * case the catalog shows a stub row with a placeholder count.
 */
export async function loadCodeSkills(): Promise<CodeSkillLite[]> {
  try {
    const mod = (await import("@/lib/agent/skills")) as {
      ALL_SKILLS?: Array<{
        id?: unknown;
        label?: unknown;
        description?: unknown;
        tools?: unknown[];
      }>;
    };
    const all = mod.ALL_SKILLS ?? [];
    return all
      .map((s) => ({
        id: String(s.id ?? "").trim(),
        label: String(s.label ?? "") || String(s.id ?? ""),
        description: String(s.description ?? ""),
        tools: Array.isArray(s.tools)
          ? s.tools
              .map((t) => {
                if (!t || typeof t !== "object" || Array.isArray(t)) return null;
                const tt = t as Record<string, unknown>;
                const name = String(tt.name ?? "").trim();
                if (!name) return null;
                return {
                  name,
                  description: String(tt.description ?? ""),
                  input_schema:
                    tt.input_schema && typeof tt.input_schema === "object"
                      ? (tt.input_schema as Record<string, unknown>)
                      : ({} as Record<string, unknown>),
                  read_only: Boolean(tt.read_only),
                } as CodeSkillToolLite;
              })
              .filter((t): t is CodeSkillToolLite => t !== null)
          : [],
      }))
      .filter((s) => s.id);
  } catch {
    return [];
  }
}

/* ────────────────────── unified loader ────────────────────── */

export interface CatalogLoadResult {
  rows: UnifiedTool[];
  /** Distinct categories across all rows, sorted alphabetically. */
  categories: string[];
  counts: {
    total: number;
    appRegistry: number;
    skillCode: number;
    skillCustom: number;
  };
}

export async function loadAllTools(): Promise<CatalogLoadResult> {
  const admin = createAdminClient();

  const [appsRes, skillsRes, agentsRes, overridesRes, codeSkills] =
    await Promise.all([
      admin
        .from("app_registry")
        .select(
          "id, domain, title, description, category, icon, published, sort_order, updated_at"
        )
        .order("title", { ascending: true })
        .limit(2000),
      admin
        .from("ai_skills")
        .select("id, kind, display_name, description, category, tools_json")
        .order("display_name", { ascending: true })
        .limit(500),
      admin
        .from("ai_agents")
        .select("id, allowed_skills, allowed_tools")
        .limit(1000),
      admin
        .from("agent_tool_overrides")
        .select("agent_id, skill_id, tool_name, enabled")
        .limit(5000),
      loadCodeSkills(),
    ]);

  type AppLite = Pick<
    AppRegistryRow,
    "id" | "domain" | "title" | "description" | "category"
  >;
  type SkillLite = Pick<
    AiSkillRow,
    "id" | "kind" | "display_name" | "description" | "category" | "tools_json"
  >;
  type AgentLite = {
    id: string;
    allowed_skills: string[] | null;
    allowed_tools: string[] | null;
  };

  const apps = ((appsRes.data ?? []) as AppLite[]) ?? [];
  const skills = ((skillsRes.data ?? []) as SkillLite[]) ?? [];
  const agents = ((agentsRes.data ?? []) as AgentLite[]) ?? [];
  const overrides =
    ((overridesRes.data ?? []) as Pick<
      AgentToolOverrideRow,
      "agent_id" | "skill_id" | "tool_name" | "enabled"
    >[]) ?? [];

  /* Used-by counts.
   *   - app-registry tool: count agents whose `allowed_tools` contains
   *     the slug.
   *   - skill-* tool: count agents whose `allowed_skills` contains the
   *     parent skill id. (The agent doesn't pick individual tools out
   *     of a skill — it picks the whole skill.) */
  const allowedToolsCount = new Map<string, number>();
  const allowedSkillCount = new Map<string, number>();
  for (const a of agents) {
    const at = Array.isArray(a.allowed_tools) ? a.allowed_tools : [];
    for (const slug of at) {
      allowedToolsCount.set(slug, (allowedToolsCount.get(slug) ?? 0) + 1);
    }
    const as = Array.isArray(a.allowed_skills) ? a.allowed_skills : [];
    for (const sid of as) {
      allowedSkillCount.set(sid, (allowedSkillCount.get(sid) ?? 0) + 1);
    }
  }

  /* Override counts per (skill_id, tool_name) — both per-agent and any
   * sentinel rows (e.g. agent_id='*' if Agent H seeds them). */
  const overrideCount = new Map<string, number>();
  for (const o of overrides) {
    const k = `${o.skill_id}::${o.tool_name}`;
    overrideCount.set(k, (overrideCount.get(k) ?? 0) + 1);
  }

  const rows: UnifiedTool[] = [];

  /* 1. app-registry rows */
  for (const a of apps) {
    rows.push({
      source: "app-registry",
      name: a.id,
      display_name: a.title || a.id,
      description: a.description ?? "",
      category: a.category || a.domain || "uncategorized",
      source_id: a.id,
      source_label: `app_registry:${a.domain}`,
      read_only: false,
      requires_confirmation: false,
      input_schema: null,
      handler_target: null,
      used_by_count: allowedToolsCount.get(a.id) ?? 0,
      override_count: 0,
    });
  }

  /* 2. ai_skills rows. For kind='code' we layer on the live code-tools
   *    list, since the DB row's tools_json is intentionally empty for
   *    code skills (per the v2 contract). For kind='custom' we use the
   *    tools_json column directly. */
  const codeSkillById = new Map<string, CodeSkillLite>();
  for (const s of codeSkills) codeSkillById.set(s.id, s);

  for (const s of skills) {
    const useCode = s.kind === "code";
    const inSourceTools = useCode
      ? (codeSkillById.get(s.id)?.tools ?? [])
      : ((Array.isArray(s.tools_json)
          ? (s.tools_json as SkillToolDef[])
          : []) as SkillToolDef[]);
    const usedByThisSkill = allowedSkillCount.get(s.id) ?? 0;

    for (const t of inSourceTools) {
      const overrides_k = `${s.id}::${t.name}`;
      const isCodeTool = useCode;
      const tDef = t as SkillToolDef & CodeSkillToolLite;
      const inputSchema =
        tDef.input_schema && typeof tDef.input_schema === "object"
          ? (tDef.input_schema as Record<string, unknown>)
          : null;
      const handlerTarget = isCodeTool
        ? `lib/agent/skills/${s.id}`
        : (tDef as SkillToolDef).handler_target ?? null;
      const requiresConfirmation =
        !isCodeTool && Boolean((tDef as SkillToolDef).requires_confirmation);

      rows.push({
        source: isCodeTool ? "skill-code" : "skill-custom",
        name: tDef.name,
        display_name: tDef.name,
        description: tDef.description ?? "",
        category: s.category || "general",
        source_id: s.id,
        source_label: `${s.kind}:${s.display_name}`,
        read_only: Boolean(tDef.read_only),
        requires_confirmation: requiresConfirmation,
        input_schema: inputSchema,
        handler_target: handlerTarget,
        used_by_count: usedByThisSkill,
        override_count: overrideCount.get(overrides_k) ?? 0,
      });
    }
  }

  /* If a code skill exists in `ALL_SKILLS` but not in `ai_skills` (e.g.
   * the runtime is ahead of the DB), surface its tools too — better an
   * extra row than a hidden capability. */
  const dbSkillIds = new Set(skills.map((s) => s.id));
  for (const cs of codeSkills) {
    if (dbSkillIds.has(cs.id)) continue;
    const usedByThisSkill = allowedSkillCount.get(cs.id) ?? 0;
    for (const t of cs.tools) {
      const overrides_k = `${cs.id}::${t.name}`;
      rows.push({
        source: "skill-code",
        name: t.name,
        display_name: t.name,
        description: t.description ?? "",
        category: "code",
        source_id: cs.id,
        source_label: `code:${cs.label || cs.id}`,
        read_only: Boolean(t.read_only),
        requires_confirmation: false,
        input_schema: t.input_schema,
        handler_target: `lib/agent/skills/${cs.id}`,
        used_by_count: usedByThisSkill,
        override_count: overrideCount.get(overrides_k) ?? 0,
      });
    }
  }

  // De-dupe: a tool name within the same source/source_id should only
  // appear once (catches edge cases where the DB row holds a stale
  // copy of a code tool).
  const seen = new Set<string>();
  const deduped: UnifiedTool[] = [];
  for (const r of rows) {
    const k = `${r.source}|${r.source_id}|${r.name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(r);
  }

  // Stable sort: by source (apps first, then code, then custom), then
  // category, then display_name. This matches what feels natural in the
  // browse view.
  const SOURCE_ORDER: Record<ToolSource, number> = {
    "app-registry": 0,
    "skill-code": 1,
    "skill-custom": 2,
  };
  deduped.sort((a, b) => {
    const sa = SOURCE_ORDER[a.source];
    const sb = SOURCE_ORDER[b.source];
    if (sa !== sb) return sa - sb;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.display_name.localeCompare(b.display_name);
  });

  const categories = Array.from(
    new Set(deduped.map((r) => r.category).filter(Boolean))
  ).sort();

  return {
    rows: deduped,
    categories,
    counts: {
      total: deduped.length,
      appRegistry: deduped.filter((r) => r.source === "app-registry").length,
      skillCode: deduped.filter((r) => r.source === "skill-code").length,
      skillCustom: deduped.filter((r) => r.source === "skill-custom").length,
    },
  };
}

/* ────────────────────── per-tool resolver ────────────────────── */

export interface ToolDetail {
  unified: UnifiedTool;
  /** When `source` is `skill-*`, the parent skill row (or null if the
   *  skill is code-defined and only present in source). */
  skill: AiSkillRow | null;
  /** When `source` is `app-registry`, the underlying app row. */
  app: AppRegistryRow | null;
  /** Agents that include this tool / skill in their allowlist. */
  usedByAgents: Array<{ id: string; display_name: string; status: string }>;
  /** Existing overrides for this (skill_id, tool_name). */
  overrides: AgentToolOverrideRow[];
  /** Recent ai_agent_runs whose metadata mentions this tool name. */
  recentRuns: Array<{
    id: string;
    agent_id: string | null;
    status: string;
    created_at: string;
    duration_ms: number | null;
    error: string | null;
    input_excerpt: string | null;
  }>;
  /** Count of recentRuns the query saw before truncation. */
  recentRunsTotal: number;
}

const RECENT_RUN_LIMIT = 50;

export async function loadToolDetail(
  source: string,
  id: string
): Promise<ToolDetail | null> {
  if (source !== "app-registry" && source !== "skill-custom" && source !== "skill-code") {
    return null;
  }
  const admin = createAdminClient();

  let unified: UnifiedTool | null = null;
  let skill: AiSkillRow | null = null;
  let app: AppRegistryRow | null = null;
  let parentSkillId: string | null = null;

  if (source === "app-registry") {
    const { data } = await admin
      .from("app_registry")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    app = (data as AppRegistryRow | null) ?? null;
    if (!app) return null;

    const { data: agentsData } = await admin
      .from("ai_agents")
      .select("id, allowed_tools")
      .limit(1000);
    type AgentLite = { id: string; allowed_tools: string[] | null };
    const agents = (agentsData ?? []) as AgentLite[];
    const usedBy = agents.filter(
      (a) => Array.isArray(a.allowed_tools) && a.allowed_tools.includes(id)
    ).length;

    unified = {
      source: "app-registry",
      name: app.id,
      display_name: app.title || app.id,
      description: app.description ?? "",
      category: app.category || app.domain || "uncategorized",
      source_id: app.id,
      source_label: `app_registry:${app.domain}`,
      read_only: false,
      requires_confirmation: false,
      input_schema: null,
      handler_target: null,
      used_by_count: usedBy,
      override_count: 0,
    };
  } else {
    // skill-custom or skill-code — `id` is the tool name. We need to find
    // the parent skill. Search across:
    //   1. ai_skills.tools_json for skill-custom (and skill-code rows
    //      that may have populated tools_json).
    //   2. live code registry for skill-code.
    const skillIdQ = ""; // resolved below

    // Strategy: scan all skill rows + the code registry. The lists are
    // small (<100 rows total in practice) so this is fine without an
    // index.
    const [skillsRes, codeSkills] = await Promise.all([
      admin
        .from("ai_skills")
        .select("*")
        .order("display_name", { ascending: true })
        .limit(500),
      loadCodeSkills(),
    ]);
    const allSkills = ((skillsRes.data ?? []) as AiSkillRow[]) ?? [];

    if (source === "skill-custom") {
      for (const s of allSkills) {
        if (s.kind !== "custom") continue;
        const tools = Array.isArray(s.tools_json)
          ? (s.tools_json as SkillToolDef[])
          : [];
        const t = tools.find((tt) => tt.name === id);
        if (t) {
          skill = s;
          parentSkillId = s.id;
          unified = {
            source: "skill-custom",
            name: t.name,
            display_name: t.name,
            description: t.description ?? "",
            category: s.category || "general",
            source_id: s.id,
            source_label: `custom:${s.display_name}`,
            read_only: Boolean(t.read_only),
            requires_confirmation: Boolean(t.requires_confirmation),
            input_schema:
              t.input_schema && typeof t.input_schema === "object"
                ? (t.input_schema as Record<string, unknown>)
                : null,
            handler_target: t.handler_target ?? null,
            used_by_count: 0, // filled below
            override_count: 0, // filled below
          };
          break;
        }
      }
    } else {
      // skill-code — first try the live registry, fall back to ai_skills.
      for (const cs of codeSkills) {
        const t = cs.tools.find((tt) => tt.name === id);
        if (t) {
          parentSkillId = cs.id;
          skill = allSkills.find((s) => s.id === cs.id) ?? null;
          unified = {
            source: "skill-code",
            name: t.name,
            display_name: t.name,
            description: t.description ?? "",
            category: skill?.category || "code",
            source_id: cs.id,
            source_label: `code:${cs.label || cs.id}`,
            read_only: Boolean(t.read_only),
            requires_confirmation: false,
            input_schema: t.input_schema,
            handler_target: `lib/agent/skills/${cs.id}`,
            used_by_count: 0,
            override_count: 0,
          };
          break;
        }
      }
      if (!unified) {
        // Code skill not in registry — try the DB tools_json (some code
        // skills mirror their tools into ai_skills.tools_json).
        for (const s of allSkills) {
          if (s.kind !== "code") continue;
          const tools = Array.isArray(s.tools_json)
            ? (s.tools_json as SkillToolDef[])
            : [];
          const t = tools.find((tt) => tt.name === id);
          if (t) {
            skill = s;
            parentSkillId = s.id;
            unified = {
              source: "skill-code",
              name: t.name,
              display_name: t.name,
              description: t.description ?? "",
              category: s.category || "code",
              source_id: s.id,
              source_label: `code:${s.display_name}`,
              read_only: Boolean(t.read_only),
              requires_confirmation: Boolean(t.requires_confirmation),
              input_schema:
                t.input_schema && typeof t.input_schema === "object"
                  ? (t.input_schema as Record<string, unknown>)
                  : null,
              handler_target:
                t.handler_target ?? `lib/agent/skills/${s.id}`,
              used_by_count: 0,
              override_count: 0,
            };
            break;
          }
        }
      }
    }

    if (!unified) return null;
    void skillIdQ;
  }

  if (!unified) return null;

  /* Used-by + overrides + recent runs (parallel). */
  const usedByQuery =
    source === "app-registry"
      ? admin
          .from("ai_agents")
          .select("id, display_name, status, allowed_tools")
          .limit(1000)
      : admin
          .from("ai_agents")
          .select("id, display_name, status, allowed_skills")
          .limit(1000);

  const overridesQuery =
    parentSkillId !== null
      ? admin
          .from("agent_tool_overrides")
          .select(
            "agent_id, skill_id, tool_name, override_description, override_input_schema, read_only_override, requires_confirmation_override, enabled, metadata, created_at, updated_at, updated_by"
          )
          .eq("skill_id", parentSkillId)
          .eq("tool_name", unified.name)
          .order("agent_id", { ascending: true })
      : Promise.resolve({ data: [], error: null });

  // Recent runs: best-effort substring match across metadata jsonb.
  // PostgREST doesn't expose a clean ILIKE-on-jsonb-cast operator, so
  // we pull a recent window and filter in TS. The window is large
  // enough that any real usage shows up, and small enough to keep the
  // request snappy.
  const RUN_SCAN_WINDOW = 1000;
  const runsQuery = admin
    .from("ai_agent_runs")
    .select(
      "id, agent_id, status, created_at, duration_ms, error, input_excerpt, metadata"
    )
    .order("created_at", { ascending: false })
    .limit(RUN_SCAN_WINDOW);

  const [usedByRes, overridesRes, runsRes] = await Promise.all([
    usedByQuery,
    overridesQuery,
    runsQuery,
  ]);

  type UsedByLite = {
    id: string;
    display_name: string;
    status: string;
    allowed_skills?: string[] | null;
    allowed_tools?: string[] | null;
  };
  const usedByAll = (usedByRes.data ?? []) as UsedByLite[];
  const usedByAgents = usedByAll
    .filter((a) => {
      if (source === "app-registry") {
        return Array.isArray(a.allowed_tools)
          ? a.allowed_tools.includes(unified!.name)
          : false;
      }
      return Array.isArray(a.allowed_skills)
        ? a.allowed_skills.includes(parentSkillId ?? "")
        : false;
    })
    .map((a) => ({ id: a.id, display_name: a.display_name, status: a.status }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  unified.used_by_count = usedByAgents.length;

  const overrides = ((overridesRes.data ?? []) as AgentToolOverrideRow[]) ?? [];
  unified.override_count = overrides.length;

  type RunLite = {
    id: string;
    agent_id: string | null;
    status: string;
    created_at: string;
    duration_ms: number | null;
    error: string | null;
    input_excerpt: string | null;
    metadata: Record<string, unknown> | null;
  };
  const allRuns = ((runsRes.data ?? []) as RunLite[]) ?? [];
  const needle = unified.name.toLowerCase();
  const filteredRuns = allRuns.filter((r) => {
    if (!r.metadata) return false;
    try {
      return JSON.stringify(r.metadata).toLowerCase().includes(needle);
    } catch {
      return false;
    }
  });
  const recentRuns = filteredRuns.slice(0, RECENT_RUN_LIMIT).map((r) => ({
    id: r.id,
    agent_id: r.agent_id,
    status: r.status,
    created_at: r.created_at,
    duration_ms: r.duration_ms,
    error: r.error,
    input_excerpt: r.input_excerpt,
  }));

  return {
    unified,
    skill,
    app,
    usedByAgents,
    overrides,
    recentRuns,
    recentRunsTotal: filteredRuns.length,
  };
}
