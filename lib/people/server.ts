import "server-only";

import { createClient } from "@/lib/supabase/server";
import { escapeForLike, escapeForOr } from "@/lib/escape-helpers";
import { getUserWorkspaces } from "@/lib/workspaces/server";
import type {
  Employee,
  EmployeeDocument,
  ExpiringDocRow,
  OnboardingRun,
  OnboardingTemplate,
  OrgNode,
  TimeOffBalance,
  TimeOffPolicy,
  TimeOffRequest,
} from "./types";

/**
 * Server-only read helpers for the People module.
 *
 * Convention: every read goes through the user-scoped supabase client so
 * RLS enforces visibility. The caller picks the workspace; we never auto-
 * resolve to "first workspace" except in `getActiveWorkspaceId()` as a
 * fallback for pages that take no explicit ws param yet.
 */

export async function getActiveWorkspaceId(): Promise<string | null> {
  const wss = await getUserWorkspaces();
  if (wss.length === 0) return null;
  return wss[0].id;
}

export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ───────────────────────────── Employees ─────────────────────────────

export interface EmployeeFilter {
  workspaceId: string;
  query?: string;
  department?: string;
  status?: "active" | "on_leave" | "terminated";
  manager_id?: string | null;
  limit?: number;
}

export async function listEmployees(
  filter: EmployeeFilter
): Promise<Employee[]> {
  try {
    const supabase = await createClient();
    let q = supabase
      .from("employees")
      .select("*")
      .eq("workspace_id", filter.workspaceId)
      .is("archived_at", null)
      .order("full_name", { ascending: true })
      .limit(Math.min(filter.limit ?? 200, 500));

    if (filter.status) q = q.eq("status", filter.status);
    if (filter.department) q = q.eq("department", filter.department);
    if (filter.manager_id !== undefined) {
      if (filter.manager_id === null) {
        q = q.is("manager_id", null);
      } else {
        q = q.eq("manager_id", filter.manager_id);
      }
    }
    if (filter.query && filter.query.trim()) {
      const needle = escapeForOr(escapeForLike(filter.query.trim()));
      if (needle) {
        q = q.or(
          `full_name.ilike.%${needle}%,email.ilike.%${needle}%,job_title.ilike.%${needle}%,department.ilike.%${needle}%`
        );
      }
    }

    const { data, error } = await q;
    if (error || !data) return [];
    return data as Employee[];
  } catch {
    return [];
  }
}

export async function getEmployee(id: string): Promise<Employee | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return data as Employee;
  } catch {
    return null;
  }
}

export async function getEmployeeForCallerInWorkspace(
  workspaceId: string
): Promise<Employee | null> {
  try {
    const supabase = await createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("user_id", u.user.id)
      .maybeSingle();
    if (error || !data) return null;
    return data as Employee;
  } catch {
    return null;
  }
}

/**
 * Walk up the org chain from `startId` via manager_id to the root.
 * Caps at 16 hops to avoid pathological loops in malformed data.
 */
export async function getOrgChain(startId: string): Promise<Employee[]> {
  try {
    const supabase = await createClient();
    const chain: Employee[] = [];
    let current: string | null = startId;
    const seen = new Set<string>();
    for (let i = 0; i < 16 && current; i += 1) {
      if (seen.has(current)) break;
      seen.add(current);
      const { data } = await supabase
        .from("employees")
        .select("*")
        .eq("id", current)
        .maybeSingle();
      if (!data) break;
      const emp = data as Employee;
      chain.push(emp);
      current = emp.manager_id;
    }
    return chain;
  } catch {
    return [];
  }
}

/**
 * Build an in-memory org tree for a workspace. Roots are employees with
 * no manager (or whose manager_id points outside the visible set).
 */
export function buildOrgTree(employees: Employee[]): OrgNode[] {
  const byId = new Map<string, OrgNode>();
  for (const e of employees) {
    byId.set(e.id, {
      employee: {
        id: e.id,
        full_name: e.full_name,
        job_title: e.job_title,
        department: e.department,
        status: e.status,
      },
      children: [],
    });
  }
  const roots: OrgNode[] = [];
  for (const e of employees) {
    const node = byId.get(e.id);
    if (!node) continue;
    if (e.manager_id && byId.has(e.manager_id)) {
      byId.get(e.manager_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Sort children alphabetically.
  const sortRec = (n: OrgNode): void => {
    n.children.sort((a, b) =>
      a.employee.full_name.localeCompare(b.employee.full_name)
    );
    n.children.forEach(sortRec);
  };
  roots.sort((a, b) => a.employee.full_name.localeCompare(b.employee.full_name));
  roots.forEach(sortRec);
  return roots;
}

// ───────────────────────── Time-off policies ────────────────────────

export async function listTimeOffPolicies(
  workspaceId: string
): Promise<TimeOffPolicy[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("time_off_policies")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("name", { ascending: true });
    if (error || !data) return [];
    return data as TimeOffPolicy[];
  } catch {
    return [];
  }
}

export async function listTimeOffBalances(
  employeeId: string
): Promise<TimeOffBalance[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("time_off_balances")
      .select("*")
      .eq("employee_id", employeeId);
    if (error || !data) return [];
    return data as TimeOffBalance[];
  } catch {
    return [];
  }
}

export async function listMyTimeOffRequests(
  workspaceId: string,
  employeeId: string
): Promise<TimeOffRequest[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("time_off_requests")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error || !data) return [];
    return data as TimeOffRequest[];
  } catch {
    return [];
  }
}

export async function listTeamApprovedTimeOff(
  workspaceId: string,
  department: string | null,
  fromDate: string,
  toDate: string
): Promise<TimeOffRequest[]> {
  try {
    const supabase = await createClient();
    let q = supabase
      .from("time_off_requests")
      .select("*, employee:employees!inner(id, full_name, department)")
      .eq("workspace_id", workspaceId)
      .eq("status", "approved")
      .gte("end_date", fromDate)
      .lte("start_date", toDate);
    if (department) {
      q = q.eq("employee.department", department);
    }
    const { data, error } = await q;
    if (error || !data) return [];
    return data as unknown as TimeOffRequest[];
  } catch {
    return [];
  }
}

// ───────────────────────── Documents ────────────────────────

export async function listEmployeeDocuments(
  employeeId: string
): Promise<EmployeeDocument[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_documents")
      .select("*")
      .eq("employee_id", employeeId)
      .order("expires_at", { ascending: true, nullsFirst: false });
    if (error || !data) return [];
    return data as EmployeeDocument[];
  } catch {
    return [];
  }
}

export async function listExpiringDocs(
  withinDays = 30
): Promise<ExpiringDocRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("expiring_docs", {
      p_within_days: withinDays,
    });
    if (error || !data) return [];
    return data as ExpiringDocRow[];
  } catch {
    return [];
  }
}

// ───────────────────────── Onboarding ────────────────────────

export async function listOnboardingTemplates(
  workspaceId: string
): Promise<OnboardingTemplate[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("onboarding_templates")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("name", { ascending: true });
    if (error || !data) return [];
    return data as OnboardingTemplate[];
  } catch {
    return [];
  }
}

export async function getActiveOnboardingRun(
  employeeId: string
): Promise<OnboardingRun | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("onboarding_runs")
      .select("*")
      .eq("employee_id", employeeId)
      .is("completed_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as OnboardingRun;
  } catch {
    return null;
  }
}

/**
 * Cheap status colour for a document expiry.
 *  - red:    expiring in <= 30 days (or already expired)
 *  - amber:  expiring in <= 90 days
 *  - gray:   anything else (or no expiry)
 */
export function docExpiryBucket(
  expiresAt: string | null | undefined
): "expired" | "red" | "amber" | "gray" {
  if (!expiresAt) return "gray";
  const ts = new Date(expiresAt).getTime();
  if (Number.isNaN(ts)) return "gray";
  const days = Math.floor((ts - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return "expired";
  if (days <= 30) return "red";
  if (days <= 90) return "amber";
  return "gray";
}
