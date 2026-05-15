/**
 * AI tools for the People (HR) module.
 *
 * Surface shape mirrors `lib/agent/skills/*` (the existing in-repo
 * convention): each tool has a stable name, JSON-schema input, a
 * `read_only` flag, and an `execute` that takes the unknown input plus a
 * minimal user-context bag. The context object is intentionally a
 * subset of `UserContext` from the agent runtime so tasks/agents can
 * adopt this without us depending on the full runtime export.
 *
 * The agent registry can import these tools and expose them under the
 * existing skill registration pattern, but they remain callable
 * stand-alone from a thin adapter.
 */

import { createClient } from "@/lib/supabase/server";

import { docExpiryBucket } from "@/lib/people/server";
import type {
  Employee,
  EmployeeDocument,
  ExpiringDocRow,
  TimeOffBalance,
} from "@/lib/people/types";

// ─────────────────────── Tool result + context shapes ───────────────────────

export type PeopleToolResult = { ok: true; data?: unknown } | { ok: false; error: string };

export interface PeopleToolContext {
  /** Workspace the call is scoped to. */
  workspaceId: string;
  /** Calling user's id, when present. */
  userId?: string | null;
}

export interface PeopleTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  read_only: boolean;
  execute(input: unknown, ctx: PeopleToolContext): Promise<PeopleToolResult>;
}

function ok(data: unknown): PeopleToolResult {
  return { ok: true, data };
}

function err(message: string): PeopleToolResult {
  return { ok: false, error: message };
}

function clamp<T>(rows: T[], limit = 50): T[] {
  return rows.slice(0, limit);
}

// ─────────────────────── search_employees ───────────────────────

const search_employees: PeopleTool = {
  name: "search_employees",
  description:
    "Search employees in the active workspace by name/title/email/department, with optional status + manager filters.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Free-text substring match" },
      department: { type: "string" },
      status: { type: "string", enum: ["active", "on_leave", "terminated"] },
      manager_id: { type: "string", description: "Limit to direct reports of this employee id" },
      limit: { type: "number", description: "Default 25, max 100" },
    },
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const i = (input ?? {}) as {
      query?: string;
      department?: string;
      status?: "active" | "on_leave" | "terminated";
      manager_id?: string;
      limit?: number;
    };
    const supabase = await createClient();
    let q = supabase
      .from("employees")
      .select(
        "id, full_name, email, job_title, department, manager_id, location, employment_type, status, hire_date"
      )
      .eq("workspace_id", ctx.workspaceId)
      .is("archived_at", null)
      .limit(Math.min(i.limit ?? 25, 100));
    if (i.status) q = q.eq("status", i.status);
    if (i.department) q = q.eq("department", i.department);
    if (i.manager_id) q = q.eq("manager_id", i.manager_id);
    if (i.query?.trim()) {
      const needle = i.query.trim().replace(/[,%]/g, "");
      q = q.or(
        `full_name.ilike.%${needle}%,email.ilike.%${needle}%,job_title.ilike.%${needle}%,department.ilike.%${needle}%`
      );
    }
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok(clamp((data ?? []) as Employee[], 100));
  },
};

// ─────────────────────── get_timeoff_balance ───────────────────────

const get_timeoff_balance: PeopleTool = {
  name: "get_timeoff_balance",
  description:
    "Get an employee's time-off balances. Pass employee_id; optionally restrict to one policy_id.",
  input_schema: {
    type: "object",
    properties: {
      employee_id: { type: "string" },
      policy_id: { type: "string" },
    },
    required: ["employee_id"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const i = input as { employee_id: string; policy_id?: string };
    if (!i.employee_id) return err("employee_id required");
    const supabase = await createClient();
    let q = supabase
      .from("time_off_balances")
      .select("*, policy:time_off_policies(id, name, kind, accrual_per_year_days, cap)")
      .eq("workspace_id", ctx.workspaceId)
      .eq("employee_id", i.employee_id);
    if (i.policy_id) q = q.eq("policy_id", i.policy_id);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok((data ?? []) as TimeOffBalance[]);
  },
};

// ─────────────────────── request_timeoff ───────────────────────

const request_timeoff: PeopleTool = {
  name: "request_timeoff",
  description:
    "Submit a time-off request for the calling user against a policy. Dates are inclusive (YYYY-MM-DD).",
  input_schema: {
    type: "object",
    properties: {
      policy_id: { type: "string" },
      start_date: { type: "string", description: "YYYY-MM-DD" },
      end_date: { type: "string", description: "YYYY-MM-DD" },
      reason: { type: "string" },
    },
    required: ["policy_id", "start_date", "end_date"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input) => {
    const i = input as {
      policy_id: string;
      start_date: string;
      end_date: string;
      reason?: string;
    };
    if (!i.policy_id || !i.start_date || !i.end_date) {
      return err("policy_id, start_date, end_date required");
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("submit_time_off_request", {
      p_policy_id: i.policy_id,
      p_start: i.start_date,
      p_end: i.end_date,
      p_reason: i.reason ?? null,
    });
    if (error) return err(error.message);
    return ok({ request_id: data as string });
  },
};

// ─────────────────────── find_doc_expiries ───────────────────────

const find_doc_expiries: PeopleTool = {
  name: "find_doc_expiries",
  description:
    "Find employee documents (Emirates ID, visa, passport, etc.) expiring within the given window.",
  input_schema: {
    type: "object",
    properties: {
      within_days: {
        type: "number",
        description: "Window in days (default 30, max 365)",
      },
    },
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input) => {
    const i = (input ?? {}) as { within_days?: number };
    const within = Math.min(Math.max(i.within_days ?? 30, 1), 365);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("expiring_docs", {
      p_within_days: within,
    });
    if (error) return err(error.message);
    const rows = (data ?? []) as ExpiringDocRow[];
    return ok(
      rows.map((r) => ({
        ...r,
        urgency: docExpiryBucket(r.expires_at),
      }))
    );
  },
};

// ─────────────────────── list_direct_reports ───────────────────────

const list_direct_reports: PeopleTool = {
  name: "list_direct_reports",
  description:
    "List direct reports of an employee. If manager_id is omitted, defaults to the caller's employee record.",
  input_schema: {
    type: "object",
    properties: {
      manager_id: { type: "string" },
    },
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const i = (input ?? {}) as { manager_id?: string };
    const supabase = await createClient();
    let managerId = i.manager_id;
    if (!managerId && ctx.userId) {
      const { data: me } = await supabase
        .from("employees")
        .select("id")
        .eq("workspace_id", ctx.workspaceId)
        .eq("user_id", ctx.userId)
        .maybeSingle();
      managerId = (me?.id as string | undefined) ?? undefined;
    }
    if (!managerId) return ok([]);
    const { data, error } = await supabase
      .from("employees")
      .select("id, full_name, email, job_title, department, status")
      .eq("workspace_id", ctx.workspaceId)
      .eq("manager_id", managerId)
      .is("archived_at", null)
      .order("full_name");
    if (error) return err(error.message);
    return ok((data ?? []) as Employee[]);
  },
};

// ─────────────────────── list_org_chain ───────────────────────

const list_org_chain: PeopleTool = {
  name: "list_org_chain",
  description:
    "Returns the org chain (manager → manager's manager → ...) up from an employee to the root.",
  input_schema: {
    type: "object",
    properties: { employee_id: { type: "string" } },
    required: ["employee_id"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const i = input as { employee_id: string };
    if (!i.employee_id) return err("employee_id required");
    const supabase = await createClient();
    type ChainRow = Pick<Employee, "id" | "full_name" | "job_title" | "manager_id">;
    const chain: ChainRow[] = [];
    let current: string | null = i.employee_id;
    const seen = new Set<string>();
    for (let hop = 0; hop < 16 && current; hop += 1) {
      if (seen.has(current)) break;
      seen.add(current);
      const res = await supabase
        .from("employees")
        .select("id, full_name, job_title, manager_id")
        .eq("workspace_id", ctx.workspaceId)
        .eq("id", current)
        .maybeSingle();
      if (res.error) return err(res.error.message);
      const row = res.data as ChainRow | null;
      if (!row) break;
      chain.push(row);
      current = row.manager_id;
    }
    return ok(chain);
  },
};

// ─────────────────────── list_org_under ───────────────────────

const list_org_under: PeopleTool = {
  name: "list_org_under",
  description:
    "List every employee reporting (directly or indirectly) under a given employee. Returns flat list with depth.",
  input_schema: {
    type: "object",
    properties: {
      employee_id: { type: "string", description: "Root of the subtree" },
    },
    required: ["employee_id"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const i = input as { employee_id: string };
    if (!i.employee_id) return err("employee_id required");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employees")
      .select("id, full_name, job_title, manager_id, status")
      .eq("workspace_id", ctx.workspaceId)
      .is("archived_at", null);
    if (error) return err(error.message);

    const byManager = new Map<string | null, Pick<Employee, "id" | "full_name" | "job_title" | "manager_id" | "status">[]>();
    for (const row of (data ?? []) as Pick<
      Employee,
      "id" | "full_name" | "job_title" | "manager_id" | "status"
    >[]) {
      const list = byManager.get(row.manager_id) ?? [];
      list.push(row);
      byManager.set(row.manager_id, list);
    }

    type FlatRow = Pick<Employee, "id" | "full_name" | "job_title" | "manager_id" | "status"> & {
      depth: number;
    };
    const out: FlatRow[] = [];
    const walk = (rootId: string, depth: number): void => {
      if (depth > 16) return;
      const kids = byManager.get(rootId) ?? [];
      for (const k of kids) {
        out.push({ ...k, depth });
        walk(k.id, depth + 1);
      }
    };
    walk(i.employee_id, 1);
    return ok(out);
  },
};

// ─────────────────────── list_timeoff_requests ───────────────────────

const list_timeoff_requests: PeopleTool = {
  name: "list_timeoff_requests",
  description:
    "List recent time-off requests in the workspace, with optional status + employee filters.",
  input_schema: {
    type: "object",
    properties: {
      employee_id: { type: "string" },
      status: {
        type: "string",
        enum: ["pending", "approved", "denied", "cancelled"],
      },
      limit: { type: "number" },
    },
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const i = (input ?? {}) as {
      employee_id?: string;
      status?: "pending" | "approved" | "denied" | "cancelled";
      limit?: number;
    };
    const supabase = await createClient();
    let q = supabase
      .from("time_off_requests")
      .select("*")
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false })
      .limit(Math.min(i.limit ?? 25, 100));
    if (i.status) q = q.eq("status", i.status);
    if (i.employee_id) q = q.eq("employee_id", i.employee_id);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok(data ?? []);
  },
};

// ─────────────────────── list_employee_documents ───────────────────────

const list_employee_documents: PeopleTool = {
  name: "list_employee_documents",
  description: "List an employee's documents (EID, visa, passport, contract, etc.).",
  input_schema: {
    type: "object",
    properties: { employee_id: { type: "string" } },
    required: ["employee_id"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input) => {
    const i = input as { employee_id: string };
    if (!i.employee_id) return err("employee_id required");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_documents")
      .select("*")
      .eq("employee_id", i.employee_id)
      .order("expires_at", { ascending: true });
    if (error) return err(error.message);
    return ok(
      ((data ?? []) as EmployeeDocument[]).map((d) => ({
        ...d,
        urgency: docExpiryBucket(d.expires_at),
      }))
    );
  },
};

// ─────────────────────── Registry ───────────────────────

export const peopleTools: PeopleTool[] = [
  search_employees,
  get_timeoff_balance,
  request_timeoff,
  find_doc_expiries,
  list_direct_reports,
  list_org_chain,
  list_org_under,
  list_timeoff_requests,
  list_employee_documents,
];

/** Look up a tool by name. */
export function findPeopleTool(name: string): PeopleTool | undefined {
  return peopleTools.find((t) => t.name === name);
}

/**
 * Convenience runner that dispatches a tool by name. Useful when wiring
 * into the agent runtime: the runtime supplies (ctx, name, input), we
 * pick the tool and execute it.
 */
export async function executePeopleTool(
  name: string,
  input: unknown,
  ctx: PeopleToolContext
): Promise<PeopleToolResult> {
  const tool = findPeopleTool(name);
  if (!tool) return { ok: false, error: `unknown tool: ${name}` };
  return tool.execute(input, ctx);
}
