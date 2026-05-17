"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { indexDocument, unindexDocument } from "@/lib/search/indexer";

import type {
  Employee,
  EmployeeDocument,
  EmployeeDocumentKind,
  EmploymentType,
  OnboardingTaskState,
  OnboardingTaskTemplate,
  TimeOffKind,
} from "./types";

/* ──────────────────── search-index helpers (private) ────────────────────
 *
 * Re-indexing helpers wrapped in try/catch so a failed search write never
 * blocks the source mutation. See lib/search/indexer.ts for contract.
 */

async function _indexEmployee(emp: Employee): Promise<void> {
  try {
    const subtitle =
      [emp.job_title, emp.department].filter(Boolean).join(" · ") || null;
    await indexDocument({
      workspaceId: emp.workspace_id,
      entityType: "employee",
      entityId: emp.id,
      title: emp.full_name,
      subtitle,
      body: emp.email,
      href: `/people/${emp.id}`,
      icon: "user",
    });
  } catch (err) {
    log.warn("search.index.employee_failed", {
      employee_id: emp.id,
      error: (err as Error)?.message ?? String(err),
    });
  }
}

async function _unindexEmployee(employeeId: string): Promise<void> {
  try {
    await unindexDocument({ entityType: "employee", entityId: employeeId });
  } catch (err) {
    log.warn("search.unindex.employee_failed", {
      employee_id: employeeId,
      error: (err as Error)?.message ?? String(err),
    });
  }
}

async function _indexEmployeeDocument(doc: EmployeeDocument): Promise<void> {
  try {
    const expiresBit = doc.expires_at ? `expires ${doc.expires_at}` : null;
    const subtitle = [doc.kind, expiresBit].filter(Boolean).join(" · ") || null;
    await indexDocument({
      workspaceId: doc.workspace_id,
      entityType: "employee_document",
      entityId: doc.id,
      title: doc.name,
      subtitle,
      body: doc.notes,
      href: `/people/${doc.employee_id}?tab=documents`,
      icon: "file-text",
    });
  } catch (err) {
    log.warn("search.index.employee_document_failed", {
      doc_id: doc.id,
      error: (err as Error)?.message ?? String(err),
    });
  }
}

async function _unindexEmployeeDocument(docId: string): Promise<void> {
  try {
    await unindexDocument({ entityType: "employee_document", entityId: docId });
  } catch (err) {
    log.warn("search.unindex.employee_document_failed", {
      doc_id: docId,
      error: (err as Error)?.message ?? String(err),
    });
  }
}

/**
 * Server actions for the People module. All writes go through the
 * user-scoped supabase client; RLS gates them. Approvals + balance
 * updates go through SECURITY DEFINER RPCs in 20260514e_people.sql.
 */

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

async function uid(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ─────────────────────────── Employees ───────────────────────────

export async function createEmployee(input: {
  workspace_id: string;
  full_name: string;
  email?: string;
  user_id?: string;
  job_title?: string;
  department?: string;
  manager_id?: string | null;
  location?: string;
  employment_type?: EmploymentType;
  hire_date?: string;
  status?: "active" | "on_leave" | "terminated";
}): Promise<ActionResult<Employee>> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "not_authenticated" };
  if (!input.full_name?.trim()) return { ok: false, error: "name_required" };

  const supabase = await createClient();
  const payload = {
    workspace_id: input.workspace_id,
    user_id: input.user_id ?? null,
    email: input.email ?? null,
    full_name: input.full_name.trim(),
    job_title: input.job_title ?? null,
    department: input.department ?? null,
    manager_id: input.manager_id ?? null,
    location: input.location ?? null,
    employment_type: input.employment_type ?? "full_time",
    hire_date: input.hire_date ?? null,
    status: input.status ?? "active",
  };
  const { data, error } = await supabase
    .from("employees")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

  await _indexEmployee(data as Employee);
  revalidatePath("/people");
  revalidatePath("/admin/people");
  return { ok: true, data: data as Employee };
}

export async function updateEmployee(
  id: string,
  patch: Partial<Omit<Employee, "id" | "workspace_id" | "created_at" | "updated_at">>
): Promise<ActionResult<Employee>> {
  if (!id) return { ok: false, error: "id_required" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (data) {
    // If the patch flipped the archive flag, drop the search row;
    // otherwise re-index so subtitle/body reflect the new state.
    if ((data as Employee).archived_at) {
      await _unindexEmployee(id);
    } else {
      await _indexEmployee(data as Employee);
    }
  }
  revalidatePath(`/people/${id}`);
  revalidatePath("/people");
  revalidatePath("/admin/people");
  return { ok: true, data: (data as Employee) ?? undefined };
}

export async function archiveEmployee(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "id_required" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ archived_at: new Date().toISOString(), status: "terminated" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await _unindexEmployee(id);
  revalidatePath("/people");
  revalidatePath("/admin/people");
  return { ok: true };
}

// ─────────────────────── Time-off policies ───────────────────────

export async function createTimeOffPolicy(input: {
  workspace_id: string;
  name: string;
  kind?: TimeOffKind;
  accrual_per_year_days?: number;
  carryover_max?: number;
  cap?: number;
}): Promise<ActionResult> {
  if (!input.name?.trim()) return { ok: false, error: "name_required" };
  const supabase = await createClient();
  const { error } = await supabase.from("time_off_policies").insert({
    workspace_id: input.workspace_id,
    name: input.name.trim(),
    kind: input.kind ?? "pto",
    accrual_per_year_days: input.accrual_per_year_days ?? 20,
    carryover_max: input.carryover_max ?? 5,
    cap: input.cap ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/people/policies");
  return { ok: true };
}

export async function updateTimeOffPolicy(
  id: string,
  patch: Partial<{
    name: string;
    kind: TimeOffKind;
    accrual_per_year_days: number;
    carryover_max: number;
    cap: number;
    active: boolean;
  }>
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("time_off_policies")
    .update(patch)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/people/policies");
  return { ok: true };
}

export async function deleteTimeOffPolicy(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("time_off_policies").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/people/policies");
  return { ok: true };
}

// ─────────────────────── Time-off requests (RPCs) ───────────────────────

export async function submitTimeOffRequest(input: {
  policy_id: string;
  start_date: string;
  end_date: string;
  reason?: string;
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_time_off_request", {
    p_policy_id: input.policy_id,
    p_start: input.start_date,
    p_end: input.end_date,
    p_reason: input.reason ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/people/time-off");
  return { ok: true, data: { id: data as string } };
}

export async function decideTimeOffRequest(input: {
  request_id: string;
  decision: "approved" | "denied" | "cancelled";
  notes?: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_time_off_request", {
    p_request_id: input.request_id,
    p_decision: input.decision,
    p_notes: input.notes ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/people/time-off");
  revalidatePath("/admin/people");
  return { ok: true };
}

// ─────────────────────── Documents ───────────────────────

export async function createEmployeeDocument(input: {
  workspace_id: string;
  employee_id: string;
  kind: EmployeeDocumentKind;
  name: string;
  number?: string;
  issued_at?: string;
  expires_at?: string;
  file_url?: string;
  notes?: string;
}): Promise<ActionResult> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "not_authenticated" };
  if (!input.name?.trim()) return { ok: false, error: "name_required" };

  // SB-011: only accept absolute http(s) URLs (uploaded files, signed
  // Supabase storage links, etc). Block javascript:/data:/vbscript: and
  // any other scheme that could XSS people viewing the document later.
  let safeFileUrl: string | null = null;
  if (input.file_url != null && input.file_url !== "") {
    const trimmed = String(input.file_url).trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return { ok: false, error: "file_url_must_be_http_or_https" };
    }
    safeFileUrl = trimmed;
  }

  const supabase = await createClient();
  // SC-005: NEVER persist the plaintext number via direct INSERT. The
  // row goes in first with no number, then we call the encrypt-on-write
  // RPC which fills number_encrypted + number_last4 and leaves the
  // legacy plaintext column null.
  const { data, error } = await supabase
    .from("employee_documents")
    .insert({
      workspace_id: input.workspace_id,
      employee_id: input.employee_id,
      kind: input.kind,
      name: input.name.trim(),
      number: null,
      issued_at: input.issued_at ?? null,
      expires_at: input.expires_at ?? null,
      file_url: safeFileUrl,
      notes: input.notes ?? null,
      uploaded_by: userId,
    })
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (data && input.number && input.number.trim()) {
    try {
      const { setDocNumber } = await import("./encryption");
      await setDocNumber((data as EmployeeDocument).id, input.number.trim());
    } catch (e) {
      // Roll back the half-built row so we never leave an unencrypted
      // (or empty-PII-but-meant-to-have-one) record around.
      await supabase
        .from("employee_documents")
        .delete()
        .eq("id", (data as EmployeeDocument).id);
      return {
        ok: false,
        error: (e as Error)?.message ?? "encrypt_failed",
      };
    }
  }
  if (data) await _indexEmployeeDocument(data as EmployeeDocument);
  revalidatePath(`/people/${input.employee_id}`);
  return { ok: true };
}

/**
 * SC-005: encrypt-on-write update of an employee document's number.
 * Goes through the SECURITY DEFINER `set_employee_document_number`
 * RPC which clears the plaintext column and writes both
 * `number_encrypted` and `number_last4`.
 *
 * Pass `null` to clear the number entirely.
 */
export async function setEmployeeDocumentNumber(input: {
  doc_id: string;
  number: string | null;
}): Promise<ActionResult> {
  const userId = await uid();
  if (!userId) return { ok: false, error: "not_authenticated" };
  if (!input.doc_id) return { ok: false, error: "doc_id_required" };
  try {
    const { setDocNumber } = await import("./encryption");
    await setDocNumber(input.doc_id, input.number?.trim() || null);
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "encrypt_failed" };
  }
  // We don't know the employee_id here without a fetch — let the
  // caller revalidate. Most callers already do.
  return { ok: true };
}

export async function deleteEmployeeDocument(id: string, employee_id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("employee_documents").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await _unindexEmployeeDocument(id);
  revalidatePath(`/people/${employee_id}`);
  return { ok: true };
}

// ─────────────────────── Onboarding ───────────────────────

export async function createOnboardingTemplate(input: {
  workspace_id: string;
  name: string;
  tasks: OnboardingTaskTemplate[];
}): Promise<ActionResult> {
  if (!input.name?.trim()) return { ok: false, error: "name_required" };
  const supabase = await createClient();
  const { error } = await supabase.from("onboarding_templates").insert({
    workspace_id: input.workspace_id,
    name: input.name.trim(),
    tasks: input.tasks ?? [],
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/people/onboarding");
  return { ok: true };
}

export async function updateOnboardingTemplate(input: {
  id: string;
  name?: string;
  tasks?: OnboardingTaskTemplate[];
}): Promise<ActionResult> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.tasks !== undefined) patch.tasks = input.tasks;
  const supabase = await createClient();
  const { error } = await supabase
    .from("onboarding_templates")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/people/onboarding");
  return { ok: true };
}

export async function deleteOnboardingTemplate(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("onboarding_templates").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/people/onboarding");
  return { ok: true };
}

export async function startOnboardingRun(input: {
  workspace_id: string;
  employee_id: string;
  template_id: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  // Read the template tasks, hydrate into tasks_state.
  const { data: tpl } = await supabase
    .from("onboarding_templates")
    .select("tasks")
    .eq("id", input.template_id)
    .maybeSingle();
  const tasks: OnboardingTaskTemplate[] = (tpl?.tasks as OnboardingTaskTemplate[]) ?? [];
  const today = new Date();
  const tasks_state: OnboardingTaskState[] = tasks.map((t) => ({
    title: t.title,
    description: t.description,
    done: false,
    due_at:
      typeof t.due_day_offset === "number"
        ? new Date(today.getTime() + t.due_day_offset * 86400000)
            .toISOString()
            .slice(0, 10)
        : null,
  }));
  const { error } = await supabase.from("onboarding_runs").insert({
    workspace_id: input.workspace_id,
    employee_id: input.employee_id,
    template_id: input.template_id,
    tasks_state,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/people/${input.employee_id}`);
  return { ok: true };
}

export async function toggleOnboardingTask(input: {
  run_id: string;
  index: number;
  done: boolean;
}): Promise<ActionResult> {
  const userId = await uid();
  const supabase = await createClient();
  const { data: run, error: readErr } = await supabase
    .from("onboarding_runs")
    .select("id, employee_id, tasks_state")
    .eq("id", input.run_id)
    .maybeSingle();
  if (readErr || !run) return { ok: false, error: readErr?.message ?? "run_not_found" };
  const tasks = (run.tasks_state as OnboardingTaskState[]) ?? [];
  if (input.index < 0 || input.index >= tasks.length) {
    return { ok: false, error: "index_out_of_range" };
  }
  tasks[input.index] = {
    ...tasks[input.index],
    done: input.done,
    done_by: input.done ? userId : null,
    done_at: input.done ? new Date().toISOString() : null,
  };
  const allDone = tasks.every((t) => t.done);
  const { error } = await supabase
    .from("onboarding_runs")
    .update({
      tasks_state: tasks,
      completed_at: allDone ? new Date().toISOString() : null,
    })
    .eq("id", input.run_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/people/${run.employee_id as string}`);
  return { ok: true };
}
