import "server-only";

/* lib/ai-context/load.ts — entity → LLM-context loader.
 *
 * The `/chat?context=task:<id>` (or `contact:`, `deal:`, etc.) flow asks
 * the assistant about a specific record. Before we hand the user's
 * message to the model, we fetch the record + a slice of its recent
 * comments + recent activities and format the bundle as a markdown
 * block. That block is appended to the system prompt so the model can
 * answer factually without having to call any tools.
 *
 * Why pre-load instead of letting the runtime's tools fetch on demand?
 *
 *  1. Latency. The user came from a record page; they want a streaming
 *     reply now, not after a multi-second tool round-trip.
 *  2. RLS surface. Every read happens through the user-scoped
 *     supabase client, so the data the assistant sees is exactly what
 *     the caller can see in the UI. No service-role bypass.
 *  3. Determinism. The model can't "forget" to read the task — it's
 *     baked into the system prompt every turn.
 *
 * Refs look like `<kind>:<uuid>`. Anything we don't understand
 * collapses to `{ kind: "none" }` so the caller can still run an
 * un-contextualised chat instead of crashing.
 */

import { createClient } from "@/lib/supabase/server";

import { getTaskById, getProjectById } from "@/lib/tasks/server";
import { listComments } from "@/lib/collab/comments";
import { listActivities, formatActivityLine } from "@/lib/collab/activity";
import { getEmployee } from "@/lib/people/server";

export type ContextKind =
  | "task"
  | "project"
  | "contact"
  | "deal"
  | "employee"
  | "none";

export interface LoadedContext {
  /** The resolved entity kind, or "none" when the ref was missing /
   *  malformed / not visible to the caller. */
  kind: ContextKind;
  /** Original ref string (e.g. `task:abc123`) for round-tripping. */
  ref: string | null;
  /** Short title for the UI header. */
  title: string;
  /** One-line subtitle for the UI header. */
  subtitle: string | null;
  /** Pre-formatted markdown block to inject into the system prompt.
   *  Empty string when kind === "none". */
  prompt_chunk: string;
  /** Workspace the entity belongs to, so the caller can use it for the
   *  dispatch UserContext without re-querying. */
  workspace_id: string | null;
  /** Stable URL for the entity, used in the UI subtitle. */
  href: string | null;
}

const EMPTY_CONTEXT: LoadedContext = {
  kind: "none",
  ref: null,
  title: "Spacefield Assistant",
  subtitle: null,
  prompt_chunk: "",
  workspace_id: null,
  href: null,
};

/* ──────────────────── ref parsing ──────────────────── */

interface ParsedRef {
  kind: ContextKind;
  id: string;
}

const KIND_TOKENS: Record<string, ContextKind> = {
  task: "task",
  tasks: "task",
  project: "project",
  projects: "project",
  contact: "contact",
  contacts: "contact",
  deal: "deal",
  deals: "deal",
  employee: "employee",
  employees: "employee",
  person: "employee",
  people: "employee",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseRef(ref: string | null | undefined): ParsedRef | null {
  if (!ref) return null;
  const m = ref.split(":");
  if (m.length !== 2) return null;
  const kindRaw = m[0].trim().toLowerCase();
  const id = m[1].trim();
  const kind = KIND_TOKENS[kindRaw];
  if (!kind) return null;
  // We accept any non-empty id (some entities use slugs or non-UUID
  // primary keys), but reject very long values to avoid query abuse.
  if (!id || id.length > 100) return null;
  return { kind, id: UUID_RE.test(id) ? id.toLowerCase() : id };
}

/* ──────────────────── formatters ──────────────────── */

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  // Use ISO date (YYYY-MM-DD) for stable model output — locales drift.
  return iso.slice(0, 10);
}

function bulletList(lines: string[]): string {
  if (lines.length === 0) return "_(none)_";
  return lines.map((l) => `- ${l}`).join("\n");
}

/* ──────────────────── per-kind loaders ──────────────────── */

async function loadTaskContext(id: string): Promise<LoadedContext> {
  if (!UUID_RE.test(id)) return EMPTY_CONTEXT;
  const task = await getTaskById(id).catch(() => null);
  if (!task) return EMPTY_CONTEXT;

  const [project, comments, activities] = await Promise.all([
    task.project_id ? getProjectById(task.project_id).catch(() => null) : Promise.resolve(null),
    listComments({ entityType: "task", entityId: id, workspaceId: task.workspace_id }).catch(
      () => []
    ),
    listActivities({
      workspaceId: task.workspace_id,
      entityType: "task",
      entityId: id,
      limit: 20,
    }).catch(() => []),
  ]);

  const commentLines = comments
    .slice(-20)
    .map((c) => {
      const author =
        c.author?.full_name ??
        c.author?.username ??
        c.author_user_id?.slice(0, 8) ??
        "user";
      const when = fmtDate(c.created_at) ?? "";
      const body = c.body.replace(/\s+/g, " ").trim();
      return `${author} (${when}): ${body}`;
    });

  const activityLines = activities.map((a) => {
    const when = fmtDate(a.created_at) ?? "";
    const who = a.actor?.full_name ?? a.actor?.username ?? "someone";
    return `${when} — ${who} ${formatActivityLine(a)}`;
  });

  const meta: string[] = [];
  meta.push(`Status: ${task.status}`);
  meta.push(`Priority: ${task.priority}`);
  if (task.due_at) meta.push(`Due: ${fmtDate(task.due_at)}`);
  if (task.start_at) meta.push(`Start: ${fmtDate(task.start_at)}`);
  if (task.completed_at) meta.push(`Completed: ${fmtDate(task.completed_at)}`);
  if (task.assignee_ids?.length)
    meta.push(`Assignees: ${task.assignee_ids.length}`);
  if (project) meta.push(`Project: ${project.name}`);

  const prompt_chunk = [
    `## Task: ${task.title}`,
    "",
    meta.join(" · "),
    "",
    task.description ? `### Description\n${task.description}` : "_(no description)_",
    "",
    "### Recent comments",
    bulletList(commentLines),
    "",
    "### Recent activity",
    bulletList(activityLines),
  ].join("\n");

  return {
    kind: "task",
    ref: `task:${id}`,
    title: task.title,
    subtitle: project ? `Task · ${project.name}` : "Task",
    prompt_chunk,
    workspace_id: task.workspace_id,
    href: `/tasks/${task.id}`,
  };
}

async function loadProjectContext(id: string): Promise<LoadedContext> {
  if (!UUID_RE.test(id)) return EMPTY_CONTEXT;
  const project = await getProjectById(id).catch(() => null);
  if (!project) return EMPTY_CONTEXT;

  const activities = await listActivities({
    workspaceId: project.workspace_id,
    entityType: "project",
    entityId: id,
    limit: 20,
  }).catch(() => []);

  const activityLines = activities.map((a) => {
    const when = fmtDate(a.created_at) ?? "";
    const who = a.actor?.full_name ?? a.actor?.username ?? "someone";
    return `${when} — ${who} ${formatActivityLine(a)}`;
  });

  const prompt_chunk = [
    `## Project: ${project.name}`,
    "",
    `Status: ${project.status ?? "active"}`,
    "",
    project.description ? `### Description\n${project.description}` : "_(no description)_",
    "",
    "### Recent activity",
    bulletList(activityLines),
  ].join("\n");

  return {
    kind: "project",
    ref: `project:${id}`,
    title: project.name,
    subtitle: "Project",
    prompt_chunk,
    workspace_id: project.workspace_id,
    href: `/projects/${project.id}`,
  };
}

async function loadContactContext(id: string): Promise<LoadedContext> {
  if (!UUID_RE.test(id)) return EMPTY_CONTEXT;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_contacts")
    .select(
      "id, workspace_id, first_name, last_name, email, phone, job_title, company_id, created_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return EMPTY_CONTEXT;
  const row = data as {
    id: string;
    workspace_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    job_title: string | null;
    company_id: string | null;
    created_at: string;
  };

  const fullName =
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
    row.email ||
    "Unnamed contact";

  const meta: string[] = [];
  if (row.email) meta.push(`Email: ${row.email}`);
  if (row.phone) meta.push(`Phone: ${row.phone}`);
  if (row.job_title) meta.push(`Title: ${row.job_title}`);

  // Recent activities attached to this contact (best-effort).
  const activities = await listActivities({
    workspaceId: row.workspace_id,
    entityType: "contact",
    entityId: id,
    limit: 20,
  }).catch(() => []);
  const activityLines = activities.map((a) => {
    const when = fmtDate(a.created_at) ?? "";
    const who = a.actor?.full_name ?? a.actor?.username ?? "someone";
    return `${when} — ${who} ${formatActivityLine(a)}`;
  });

  const prompt_chunk = [
    `## Contact: ${fullName}`,
    "",
    meta.join(" · ") || "_(no contact details)_",
    "",
    "### Recent activity",
    bulletList(activityLines),
  ].join("\n");

  return {
    kind: "contact",
    ref: `contact:${id}`,
    title: fullName,
    subtitle: "Contact",
    prompt_chunk,
    workspace_id: row.workspace_id,
    href: `/crm/contacts/${row.id}`,
  };
}

async function loadDealContext(id: string): Promise<LoadedContext> {
  if (!UUID_RE.test(id)) return EMPTY_CONTEXT;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_deals")
    .select(
      "id, workspace_id, name, stage, amount, currency, expected_close_date, contact_id, company_id, created_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return EMPTY_CONTEXT;
  const row = data as {
    id: string;
    workspace_id: string;
    name: string;
    stage: string | null;
    amount: number | null;
    currency: string | null;
    expected_close_date: string | null;
    contact_id: string | null;
    company_id: string | null;
    created_at: string;
  };

  const meta: string[] = [];
  if (row.stage) meta.push(`Stage: ${row.stage}`);
  if (row.amount != null)
    meta.push(`Amount: ${row.amount}${row.currency ? ` ${row.currency}` : ""}`);
  if (row.expected_close_date)
    meta.push(`Expected close: ${fmtDate(row.expected_close_date)}`);

  const activities = await listActivities({
    workspaceId: row.workspace_id,
    entityType: "deal",
    entityId: id,
    limit: 20,
  }).catch(() => []);
  const activityLines = activities.map((a) => {
    const when = fmtDate(a.created_at) ?? "";
    const who = a.actor?.full_name ?? a.actor?.username ?? "someone";
    return `${when} — ${who} ${formatActivityLine(a)}`;
  });

  const prompt_chunk = [
    `## Deal: ${row.name}`,
    "",
    meta.join(" · ") || "_(no deal details)_",
    "",
    "### Recent activity",
    bulletList(activityLines),
  ].join("\n");

  return {
    kind: "deal",
    ref: `deal:${id}`,
    title: row.name,
    subtitle: "Deal",
    prompt_chunk,
    workspace_id: row.workspace_id,
    href: `/crm/deals/${row.id}`,
  };
}

async function loadEmployeeContext(id: string): Promise<LoadedContext> {
  if (!UUID_RE.test(id)) return EMPTY_CONTEXT;
  const emp = await getEmployee(id).catch(() => null);
  if (!emp) return EMPTY_CONTEXT;

  const meta: string[] = [];
  if (emp.job_title) meta.push(`Title: ${emp.job_title}`);
  if (emp.department) meta.push(`Department: ${emp.department}`);
  if (emp.location) meta.push(`Location: ${emp.location}`);
  if (emp.email) meta.push(`Email: ${emp.email}`);
  if (emp.hire_date) meta.push(`Hired: ${fmtDate(emp.hire_date)}`);
  meta.push(`Status: ${emp.status}`);
  meta.push(`Employment: ${emp.employment_type}`);

  const prompt_chunk = [
    `## Employee: ${emp.full_name}`,
    "",
    meta.join(" · "),
  ].join("\n");

  return {
    kind: "employee",
    ref: `employee:${id}`,
    title: emp.full_name,
    subtitle: "Employee",
    prompt_chunk,
    workspace_id: emp.workspace_id,
    href: `/people/${emp.id}`,
  };
}

/* ──────────────────── public API ──────────────────── */

/**
 * Resolve a context ref like `task:<uuid>` into a `LoadedContext`. Every
 * underlying read uses the user-scoped Supabase client (RLS), so missing
 * permissions silently collapse to `kind: "none"` rather than leaking
 * "this record exists but you can't see it".
 */
export async function loadContext(
  ref: string | null | undefined
): Promise<LoadedContext> {
  const parsed = parseRef(ref);
  if (!parsed) return EMPTY_CONTEXT;

  switch (parsed.kind) {
    case "task":
      return loadTaskContext(parsed.id);
    case "project":
      return loadProjectContext(parsed.id);
    case "contact":
      return loadContactContext(parsed.id);
    case "deal":
      return loadDealContext(parsed.id);
    case "employee":
      return loadEmployeeContext(parsed.id);
    case "none":
    default:
      return EMPTY_CONTEXT;
  }
}

/**
 * Trim the prompt chunk so it never blows past a sane upper bound. The
 * runtime caches the system prompt aggressively (5-minute TTL), but
 * cache hits only help when the prompt is identical across calls — and
 * activity lists vary every few minutes. We cap at ~8k chars (~2k
 * tokens) so the per-record chat doesn't drown out the rest of the
 * system prompt.
 */
export function trimContextChunk(chunk: string, maxChars = 8000): string {
  if (chunk.length <= maxChars) return chunk;
  return chunk.slice(0, maxChars) + "\n\n_…context truncated…_";
}
