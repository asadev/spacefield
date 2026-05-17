/**
 * Visual workflow builder — type contract.
 *
 * `WorkflowDefinition` is the JSON shape we persist in
 * `public.workflows.definition`. The admin builder at
 * /admin/workflows/builder edits this shape directly; the AI generator
 * at /api/admin/workflows/generate emits it; and any future runtime
 * dispatcher reads it. Keeping the shape narrow and explicit means we
 * don't have to chase schema drift every time someone adds a new step.
 *
 * NOTE — this is INTENTIONALLY distinct from the older
 * `lib/workflow-runner.ts` step shapes (skill/tool/prompt/branch).
 * Those wire AI primitives together; these wire end-user automation
 * (create a task, post a webhook, comment, wait). The two systems
 * coexist: `agent_workflows` is the admin AI registry, `workflows` is
 * the workspace-scoped automation table.
 */

export type WorkflowTriggerKind = "manual" | "schedule" | "event";

export interface WorkflowTrigger {
  kind: WorkflowTriggerKind;
  /** Free-form payload — for "schedule" this is `{ cron: "0 9 * * *" }`;
   *  for "event" it's `{ event: "task.created" }`; for "manual" it's
   *  whatever default input the builder collected. */
  payload?: unknown;
}

/** A single condition row in the conditions block. The runtime
 *  evaluates them left-to-right with implicit AND. `left` is a JSON
 *  path into the trigger payload (e.g. `task.priority`); `right` is a
 *  literal we compare it against. */
export interface WorkflowCondition {
  left: string;
  op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "exists";
  right: unknown;
}

/** Step variants. Discriminated on `kind` so callers can switch
 *  exhaustively. We keep payload bodies typed loosely on purpose —
 *  builder + runtime stay in sync via runtime-side validation. */
export type WorkflowStep =
  | {
      kind: "create_task";
      payload: {
        title: string;
        description?: string;
        priority?: "low" | "normal" | "high";
        project_name?: string;
      };
    }
  | {
      kind: "send_webhook";
      url: string;
      body: string;
    }
  | {
      kind: "post_comment";
      entity: { type: string; id: string };
      body: string;
    }
  | {
      kind: "wait";
      seconds: number;
    };

export type WorkflowStepKind = WorkflowStep["kind"];

export interface WorkflowDefinition {
  /** UUID — matches `workflows.id` once persisted. Builder-side drafts
   *  set this to an empty string until the first save. */
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  conditions?: WorkflowCondition[];
  steps: WorkflowStep[];
}

/* ────────────────────────── helpers ────────────────────────── */

/** Default empty definition — used by the builder when there's no
 *  existing workflow row to load. */
export function emptyWorkflowDefinition(workspace_id: string): WorkflowDefinition {
  return {
    id: "",
    workspace_id,
    name: "Untitled workflow",
    description: "",
    trigger: { kind: "manual" },
    conditions: [],
    steps: [],
  };
}

/** Lightweight runtime validator — returns an array of human-readable
 *  problems, or an empty array if the definition is well-formed.
 *  Callers display these inline in the builder. */
export function validateWorkflowDefinition(def: unknown): string[] {
  const errors: string[] = [];
  if (!def || typeof def !== "object") {
    return ["definition must be an object"];
  }
  const d = def as Partial<WorkflowDefinition>;
  if (!d.name || typeof d.name !== "string") errors.push("name is required");
  if (!d.trigger || typeof d.trigger !== "object") {
    errors.push("trigger is required");
  } else {
    const t = d.trigger as WorkflowTrigger;
    if (!["manual", "schedule", "event"].includes(t.kind)) {
      errors.push(`unknown trigger kind: ${String(t.kind)}`);
    }
  }
  if (!Array.isArray(d.steps)) {
    errors.push("steps must be an array");
  } else {
    d.steps.forEach((s, i) => {
      if (!s || typeof s !== "object") {
        errors.push(`step ${i} must be an object`);
        return;
      }
      const k = (s as WorkflowStep).kind;
      if (!["create_task", "send_webhook", "post_comment", "wait"].includes(k)) {
        errors.push(`step ${i}: unknown kind "${String(k)}"`);
      }
      if (k === "create_task") {
        const p = (s as { payload?: { title?: string } }).payload;
        if (!p || typeof p.title !== "string" || !p.title.trim()) {
          errors.push(`step ${i}: create_task requires a title`);
        }
      } else if (k === "send_webhook") {
        const w = s as { url?: string };
        if (!w.url || typeof w.url !== "string" || !/^https?:\/\//i.test(w.url)) {
          errors.push(`step ${i}: send_webhook requires a valid http(s) url`);
        }
      } else if (k === "wait") {
        const w = s as { seconds?: number };
        if (typeof w.seconds !== "number" || w.seconds < 0) {
          errors.push(`step ${i}: wait.seconds must be a non-negative number`);
        }
      } else if (k === "post_comment") {
        const c = s as { entity?: { type?: string; id?: string }; body?: string };
        if (!c.entity?.type || !c.entity?.id) {
          errors.push(`step ${i}: post_comment requires entity.type + entity.id`);
        }
        if (!c.body) errors.push(`step ${i}: post_comment requires body`);
      }
    });
  }
  return errors;
}
