import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type {
  EvalScoringMethod,
  EvalSuiteRow,
  EvalTargetKind,
} from "../_types";

/**
 * Sync helpers used by both the eval index, suite-detail, and run-detail
 * pages. NOT a "use server" file — exports types & sync utilities only.
 */

export const TARGET_KINDS: EvalTargetKind[] = ["agent", "skill", "workflow"];

export const SCORING_METHODS: EvalScoringMethod[] = [
  "exact",
  "contains",
  "regex",
  "llm_judge",
  "custom",
];

export const SCORING_LABELS: Record<EvalScoringMethod, string> = {
  exact: "Exact match",
  contains: "Contains substring",
  regex: "Regex match",
  llm_judge: "LLM judge",
  custom: "Custom scorer",
};

export const TARGET_CHIP_CLASS: Record<EvalTargetKind, string> = {
  agent: "bg-tool-accent-soft text-tool-accent",
  skill: "bg-emerald-500/15 text-emerald-500",
  workflow: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

export const RUN_STATUS_CHIP_CLASS: Record<string, string> = {
  running: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  completed: "bg-emerald-500/15 text-emerald-500",
  failed: "bg-rose-500/15 text-rose-500",
  cancelled: "bg-app-elevated text-faint border border-app",
};

export type EvalCase = {
  name: string;
  input: unknown;
  expected: unknown;
};

export type EvalCaseResult = {
  name: string;
  input: unknown;
  expected: unknown;
  actual: unknown;
  score: number;
  pass: boolean;
  error?: string | null;
  duration_ms?: number | null;
};

/** Cast `unknown[]` cases jsonb into typed cases. */
export function readCases(raw: unknown): EvalCase[] {
  if (!Array.isArray(raw)) return [];
  const out: EvalCase[] = [];
  for (const item of raw) {
    if (item && typeof item === "object" && "name" in item) {
      const obj = item as Record<string, unknown>;
      out.push({
        name: String(obj.name ?? ""),
        input: obj.input,
        expected: obj.expected,
      });
    }
  }
  return out;
}

export function readResults(raw: unknown): EvalCaseResult[] {
  if (!Array.isArray(raw)) return [];
  const out: EvalCaseResult[] = [];
  for (const item of raw) {
    if (item && typeof item === "object" && "name" in item) {
      const obj = item as Record<string, unknown>;
      out.push({
        name: String(obj.name ?? ""),
        input: obj.input,
        expected: obj.expected,
        actual: obj.actual,
        score: Number(obj.score ?? 0),
        pass: Boolean(obj.pass ?? false),
        error: typeof obj.error === "string" ? obj.error : null,
        duration_ms:
          typeof obj.duration_ms === "number" ? obj.duration_ms : null,
      });
    }
  }
  return out;
}

/** Pretty-print JSON safely with a max-length cap so the row stays sane. */
export function jsonExcerpt(value: unknown, max = 120): string {
  let s: string;
  try {
    s = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  if (!s) return "—";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Pull dropdown candidates for the target_id selector. */
export async function fetchTargetOptions(): Promise<{
  agents: { id: string; display_name: string }[];
  skills: { id: string; display_name: string }[];
  workflows: { id: string; display_name: string }[];
}> {
  const admin = createAdminClient();
  const [agentsRes, skillsRes, workflowsRes] = await Promise.all([
    admin
      .from("ai_agents")
      .select("id, display_name")
      .order("sort_order", { ascending: true })
      .order("display_name", { ascending: true }),
    admin
      .from("ai_skills")
      .select("id, display_name")
      .order("sort_order", { ascending: true })
      .order("display_name", { ascending: true }),
    admin
      .from("agent_workflows")
      .select("id, display_name")
      .order("display_name", { ascending: true }),
  ]);
  return {
    agents:
      (agentsRes.data ?? []).map((r) => ({
        id: String(r.id),
        display_name: String(r.display_name),
      })),
    skills:
      (skillsRes.data ?? []).map((r) => ({
        id: String(r.id),
        display_name: String(r.display_name),
      })),
    workflows:
      (workflowsRes.data ?? []).map((r) => ({
        id: String(r.id),
        display_name: String(r.display_name),
      })),
  };
}

/**
 * Build a stub run "result" for a single case. The actual eval runner
 * is environmental and not part of this slice; we synthesize a result
 * that exercises the scoring method and lets the per-run UI render
 * something meaningful.
 */
export function stubCaseRun(
  cse: EvalCase,
  scoring: EvalScoringMethod
): EvalCaseResult {
  // Synthesize "actual" by echoing the input plus a sentinel string. In
  // production the runner would invoke the agent / skill / workflow with
  // `cse.input` and capture its output here.
  const actual =
    typeof cse.input === "string"
      ? cse.input
      : cse.input
        ? JSON.stringify(cse.input)
        : "(stub output)";

  let pass = false;
  let score = 0;
  switch (scoring) {
    case "exact": {
      pass = JSON.stringify(actual) === JSON.stringify(cse.expected);
      score = pass ? 1 : 0;
      break;
    }
    case "contains": {
      const needle = String(cse.expected ?? "");
      pass = String(actual).includes(needle);
      score = pass ? 1 : 0;
      break;
    }
    case "regex": {
      try {
        const re = new RegExp(String(cse.expected ?? ""));
        pass = re.test(String(actual));
        score = pass ? 1 : 0;
      } catch {
        pass = false;
        score = 0;
      }
      break;
    }
    case "llm_judge":
    case "custom":
    default: {
      // Stub: assume 0.75 score, treat ≥0.5 as pass. Documented as a stub.
      score = 0.75;
      pass = true;
      break;
    }
  }

  return {
    name: cse.name,
    input: cse.input,
    expected: cse.expected,
    actual,
    score,
    pass,
    error: null,
    duration_ms: 12,
  };
}

/** Lightweight typing on the row, made to match `select(*)`. */
export type SuiteRow = EvalSuiteRow;
