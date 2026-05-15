import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { safeFetch, SafeFetchError } from "@/lib/safe-fetch";
import { log } from "@/lib/log";
import type {
  AgentWorkflowRow,
  AiSkillRow,
  PromptLibraryRow,
  PromptVersionRow,
  SkillToolDef,
} from "@/app/admin/_types";

/**
 * Workflow runner — executes the steps of a `agent_workflows` row in
 * order, recording the run in `public.workflow_runs`.
 *
 * Designed for admin-triggered (manual / event / cron) execution. Uses
 * the service-role client and is NOT scoped to a workspace user — it's
 * for system-level orchestration only. Per-user agent dispatch still
 * lives in lib/agent/runtime/*.
 *
 * Step kinds:
 *   - "skill"  : invoke a skill's tool. We look at `ai_skills`. For
 *                kind='custom' skills we dispatch through the same RPC
 *                (with admin client) or HTTP path the agent runtime
 *                uses; for kind='code' skills we record a stub result
 *                because code-skill execution requires a UserContext
 *                that doesn't exist for admin-triggered runs.
 *   - "tool"   : same as "skill" but identified by tool name only — we
 *                find the first skill whose tools_json contains a tool
 *                with that name.
 *   - "prompt" : load the prompt from `prompt_library` + its current
 *                version body, substitute `{{var}}` placeholders from
 *                the run input + previous steps' output_var values,
 *                and return the rendered text. (Model invocation is a
 *                future extension.)
 *   - "branch" : evaluate a JSONLogic-style expression against the
 *                accumulated step state. If the result is falsy, all
 *                subsequent steps are skipped.
 */

/* ────────────────────── public types ────────────────────── */

export type WorkflowStepKind = "skill" | "tool" | "branch" | "prompt";

export interface WorkflowStepShape {
  kind: WorkflowStepKind;
  skill_id?: string;
  tool_name?: string;
  prompt_id?: string;
  condition?: string;
  output_var?: string;
}

export interface StepResultEntry {
  index: number;
  kind: WorkflowStepKind;
  skill_id?: string;
  tool_name?: string;
  prompt_id?: string;
  condition?: string;
  output_var?: string;
  ok: boolean;
  output?: unknown;
  error?: string;
  duration_ms: number;
  /** True when this step was skipped because an upstream branch evaluated false. */
  skipped?: boolean;
}

export interface RunWorkflowOptions {
  workflow_id: string;
  input?: Record<string, unknown>;
  triggered_by?: string | null;
  trigger_kind?: "manual" | "event" | "cron";
  metadata?: Record<string, unknown>;
}

export interface RunWorkflowResult {
  ok: boolean;
  run_id: string;
  results: StepResultEntry[];
  duration_ms: number;
  error?: string;
}

/* ────────────────────── runWorkflow ────────────────────── */

export async function runWorkflow(
  opts: RunWorkflowOptions
): Promise<RunWorkflowResult> {
  const admin = createAdminClient();
  const startedAt = Date.now();
  const triggerKind = opts.trigger_kind ?? "manual";
  const input = opts.input ?? {};

  // 1. Insert workflow_runs row in 'running' state.
  const { data: runRow, error: insErr } = await admin
    .from("workflow_runs")
    .insert({
      workflow_id: opts.workflow_id,
      triggered_by: opts.triggered_by ?? null,
      trigger_kind: triggerKind,
      status: "running",
      input,
      metadata: opts.metadata ?? {},
    })
    .select("id")
    .maybeSingle();
  if (insErr || !runRow) {
    return {
      ok: false,
      run_id: "",
      results: [],
      duration_ms: Date.now() - startedAt,
      error: insErr?.message ?? "failed to insert workflow_runs row",
    };
  }
  const runId = (runRow as { id: string }).id;

  // 2. Load workflow row.
  const { data: wfRow, error: wfErr } = await admin
    .from("agent_workflows")
    .select("*")
    .eq("id", opts.workflow_id)
    .maybeSingle();

  if (wfErr || !wfRow) {
    const msg = wfErr?.message ?? `workflow "${opts.workflow_id}" not found`;
    await finalizeRun(runId, {
      status: "failed",
      step_results: [],
      output: null,
      error: msg,
      duration_ms: Date.now() - startedAt,
    });
    return {
      ok: false,
      run_id: runId,
      results: [],
      duration_ms: Date.now() - startedAt,
      error: msg,
    };
  }

  const workflow = wfRow as AgentWorkflowRow;
  const steps = normalizeSteps(workflow.steps);

  // 3. Execute steps.
  const results: StepResultEntry[] = [];
  const state: Record<string, unknown> = { input, ...input };
  let firstError: string | undefined;
  let skippedFromHere = false;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (skippedFromHere) {
      results.push({
        index: i,
        kind: step.kind,
        skill_id: step.skill_id,
        tool_name: step.tool_name,
        prompt_id: step.prompt_id,
        condition: step.condition,
        output_var: step.output_var,
        ok: true,
        skipped: true,
        duration_ms: 0,
      });
      continue;
    }

    const stepStart = Date.now();
    let stepOk = true;
    let stepOutput: unknown = null;
    let stepErr: string | undefined;

    try {
      const dispatched = await dispatchStep(step, state, input);
      stepOutput = dispatched.output;
      if (step.kind === "branch") {
        // Branch: condition's truthiness decides whether subsequent
        // steps run. We still record the branch step as ok=true.
        if (!dispatched.truthy) skippedFromHere = true;
      }
    } catch (e) {
      stepOk = false;
      stepErr = e instanceof Error ? e.message : String(e);
      if (!firstError) firstError = stepErr;
    }

    const entry: StepResultEntry = {
      index: i,
      kind: step.kind,
      skill_id: step.skill_id,
      tool_name: step.tool_name,
      prompt_id: step.prompt_id,
      condition: step.condition,
      output_var: step.output_var,
      ok: stepOk,
      output: stepOutput,
      error: stepErr,
      duration_ms: Date.now() - stepStart,
    };
    results.push(entry);

    if (stepOk && step.output_var && step.kind !== "branch") {
      state[step.output_var] = stepOutput;
    }

    if (!stepOk) {
      // Stop on first failure — record remaining steps as skipped.
      skippedFromHere = true;
    }
  }

  // 4. Build a final output payload — last non-skipped, non-branch result.
  let lastOutput: unknown = null;
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i];
    if (r.skipped || r.kind === "branch") continue;
    if (!r.ok) break;
    lastOutput = r.output;
    break;
  }

  const allOk = !firstError;
  const status: "completed" | "failed" = allOk ? "completed" : "failed";
  const durationMs = Date.now() - startedAt;

  await finalizeRun(runId, {
    status,
    step_results: results,
    output: lastOutput,
    error: firstError,
    duration_ms: durationMs,
  });

  return {
    ok: allOk,
    run_id: runId,
    results,
    duration_ms: durationMs,
    error: firstError,
  };
}

/* ────────────────────── helpers ────────────────────── */

interface DispatchedStep {
  output: unknown;
  /** Only meaningful for branch steps. */
  truthy: boolean;
}

async function dispatchStep(
  step: WorkflowStepShape,
  state: Record<string, unknown>,
  input: Record<string, unknown>
): Promise<DispatchedStep> {
  switch (step.kind) {
    case "skill":
      return { output: await dispatchSkillStep(step, state, input), truthy: true };
    case "tool":
      return { output: await dispatchToolStep(step, state, input), truthy: true };
    case "prompt":
      return { output: await dispatchPromptStep(step, state, input), truthy: true };
    case "branch": {
      const truthy = evaluateCondition(step.condition ?? "", state);
      return { output: { condition: step.condition ?? "", truthy }, truthy };
    }
    default: {
      // Defensive — should never happen because we normalize first.
      const exhaustive: never = step.kind;
      throw new Error(`unknown step kind: ${String(exhaustive)}`);
    }
  }
}

async function dispatchSkillStep(
  step: WorkflowStepShape,
  state: Record<string, unknown>,
  input: Record<string, unknown>
): Promise<unknown> {
  const skillId = step.skill_id?.trim();
  if (!skillId) throw new Error("skill_id required");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_skills")
    .select("*")
    .eq("id", skillId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const skill = data as AiSkillRow | null;
  if (!skill) throw new Error(`skill "${skillId}" not found`);

  // For tool_name picker — caller can supply it on the skill step too.
  const toolName = step.tool_name?.trim() || null;

  if (skill.kind === "code") {
    return {
      kind: "code",
      skill_id: skillId,
      tool_name: toolName,
      handler_module: skill.handler_module,
      note:
        "Code-defined skills run inside the per-user agent runtime. The admin-side workflow runner records a stub for them — wire a kind='custom' skill or a kind='tool' step to invoke handlers directly.",
    };
  }

  const tools = Array.isArray(skill.tools_json) ? skill.tools_json : [];
  const tool: SkillToolDef | undefined = toolName
    ? tools.find((t) => t.name === toolName)
    : tools[0];
  if (!tool) {
    throw new Error(
      toolName
        ? `tool "${toolName}" not found on skill "${skillId}"`
        : `skill "${skillId}" has no tools defined`
    );
  }

  return await invokeTool(tool, buildToolInput(state, input));
}

async function dispatchToolStep(
  step: WorkflowStepShape,
  state: Record<string, unknown>,
  input: Record<string, unknown>
): Promise<unknown> {
  const toolName = step.tool_name?.trim();
  if (!toolName) throw new Error("tool_name required");

  // Search across all skills for a tool with that name.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_skills")
    .select("id, kind, tools_json")
    .eq("kind", "custom");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Pick<
    AiSkillRow,
    "id" | "kind" | "tools_json"
  >[];

  let found: SkillToolDef | undefined;
  let foundSkill: string | undefined;
  for (const row of rows) {
    const tools = Array.isArray(row.tools_json) ? row.tools_json : [];
    const t = tools.find((x) => x.name === toolName);
    if (t) {
      found = t;
      foundSkill = row.id;
      break;
    }
  }
  if (!found) {
    throw new Error(
      `tool "${toolName}" not found in any custom skill — for code-skill tools use a "skill" step instead`
    );
  }

  const out = await invokeTool(found, buildToolInput(state, input));
  return { skill_id: foundSkill, tool_name: toolName, result: out };
}

async function dispatchPromptStep(
  step: WorkflowStepShape,
  state: Record<string, unknown>,
  input: Record<string, unknown>
): Promise<unknown> {
  const promptId = step.prompt_id?.trim();
  if (!promptId) throw new Error("prompt_id required");

  const admin = createAdminClient();
  const { data: pdata, error: pErr } = await admin
    .from("prompt_library")
    .select("*")
    .eq("id", promptId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  const prompt = pdata as PromptLibraryRow | null;
  if (!prompt) throw new Error(`prompt "${promptId}" not found`);

  const { data: vdata, error: vErr } = await admin
    .from("prompt_versions")
    .select("body, variables, version")
    .eq("prompt_id", promptId)
    .eq("version", prompt.current_version)
    .maybeSingle();
  if (vErr) throw new Error(vErr.message);
  const version = vdata as Pick<PromptVersionRow, "body" | "variables" | "version"> | null;
  if (!version) {
    throw new Error(
      `prompt "${promptId}" has no version row for v${prompt.current_version}`
    );
  }

  const rendered = renderTemplate(version.body, { ...state, ...input });
  return {
    prompt_id: promptId,
    version: version.version,
    rendered,
    variables: version.variables ?? [],
  };
}

/* ────────────────────── tool dispatch ────────────────────── */

async function invokeTool(
  tool: SkillToolDef,
  input: Record<string, unknown>
): Promise<unknown> {
  if (tool.handler_kind === "rpc") {
    const target = (tool.handler_target ?? "").trim();
    if (!target) throw new Error("handler_target empty");
    const admin = createAdminClient();
    const { data, error } = await admin.rpc(target, input);
    if (error) throw new Error(error.message);
    return data ?? null;
  }
  if (tool.handler_kind === "http") {
    const url = (tool.handler_target ?? "").trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error("handler_target is not an http(s) URL");
    }
    let res: Response;
    try {
      res = await safeFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tool: tool.name,
          input,
          handler_params: tool.handler_params ?? null,
        }),
        cache: "no-store",
      });
    } catch (err) {
      if (err instanceof SafeFetchError) {
        log.warn("workflow.http_handler_blocked", {
          tool: tool.name,
          reason: err.reason,
        });
        throw new Error(`http handler blocked by SSRF guard: ${err.reason}`);
      }
      throw err;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`http ${res.status}: ${text.slice(0, 300)}`);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  throw new Error(`unknown handler_kind: ${String(tool.handler_kind)}`);
}

function buildToolInput(
  state: Record<string, unknown>,
  input: Record<string, unknown>
): Record<string, unknown> {
  // Pass: the original run input + every named output_var the prior
  // steps produced. The tool implementation can choose what to read.
  return { ...state, input };
}

/* ────────────────────── template + condition ────────────────────── */

const TEMPLATE_RE = /\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}/g;

function renderTemplate(
  body: string,
  scope: Record<string, unknown>
): string {
  return body.replace(TEMPLATE_RE, (_match, key: string) => {
    const v = readPath(scope, key);
    if (v === undefined || v === null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    try {
      return JSON.stringify(v);
    } catch {
      return "";
    }
  });
}

function readPath(scope: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = scope;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * Evaluate a step's condition. We support a JSONLogic-ish object
 * `{ var: 'path', op: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'truthy' | 'falsy', value: unknown }`
 * passed in as JSON. Plain truthy strings ("true"/"1"/"yes") also count.
 */
function evaluateCondition(
  condition: string,
  state: Record<string, unknown>
): boolean {
  const text = condition.trim();
  if (!text) return false;

  // Plain truthy literals.
  const lower = text.toLowerCase();
  if (lower === "true" || lower === "1" || lower === "yes") return true;
  if (lower === "false" || lower === "0" || lower === "no") return false;

  // JSON-shaped condition.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Treat as a single var path — truthy if it resolves to a truthy value.
    const v = readPath(state, text);
    return Boolean(v);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return Boolean(parsed);
  }

  const obj = parsed as Record<string, unknown>;
  const varPath = typeof obj.var === "string" ? obj.var : "";
  const op = typeof obj.op === "string" ? obj.op : "==";
  const value = obj.value;
  const lhs = varPath ? readPath(state, varPath) : undefined;

  switch (op) {
    case "==":
      return looseEq(lhs, value);
    case "!=":
      return !looseEq(lhs, value);
    case ">":
      return numCompare(lhs, value, (a, b) => a > b);
    case "<":
      return numCompare(lhs, value, (a, b) => a < b);
    case ">=":
      return numCompare(lhs, value, (a, b) => a >= b);
    case "<=":
      return numCompare(lhs, value, (a, b) => a <= b);
    case "truthy":
      return Boolean(lhs);
    case "falsy":
      return !lhs;
    default:
      return false;
  }
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === "string" && typeof b === "number") return a === String(b);
  if (typeof a === "number" && typeof b === "string") return String(a) === b;
  return false;
}

function numCompare(
  a: unknown,
  b: unknown,
  cmp: (x: number, y: number) => boolean
): boolean {
  const na = typeof a === "number" ? a : Number(a);
  const nb = typeof b === "number" ? b : Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return cmp(na, nb);
}

/* ────────────────────── normalization + finalization ────────────────────── */

function normalizeSteps(raw: unknown): WorkflowStepShape[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkflowStepShape[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    if (!s || typeof s !== "object" || Array.isArray(s)) continue;
    const obj = s as Record<string, unknown>;
    const kind = obj.kind;
    if (
      kind !== "skill" &&
      kind !== "tool" &&
      kind !== "branch" &&
      kind !== "prompt"
    ) {
      continue;
    }
    out.push({
      kind,
      skill_id:
        typeof obj.skill_id === "string" ? obj.skill_id : undefined,
      tool_name:
        typeof obj.tool_name === "string" ? obj.tool_name : undefined,
      prompt_id:
        typeof obj.prompt_id === "string" ? obj.prompt_id : undefined,
      condition:
        typeof obj.condition === "string" ? obj.condition : undefined,
      output_var:
        typeof obj.output_var === "string" ? obj.output_var : undefined,
    });
  }
  return out;
}

async function finalizeRun(
  runId: string,
  patch: {
    status: "completed" | "failed" | "cancelled";
    step_results: StepResultEntry[];
    output: unknown;
    error?: string;
    duration_ms: number;
  }
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("workflow_runs")
    .update({
      status: patch.status,
      step_results: patch.step_results,
      output: patch.output,
      error: patch.error ?? null,
      duration_ms: patch.duration_ms,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
}
