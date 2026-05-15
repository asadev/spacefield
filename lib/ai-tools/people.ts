/* AI tools — people (HR module).
 *
 * Surfaces the People module to the agent runtime as a SkillDefinition.
 * Mirrors the shape of `lib/agent/skills/*` so it can drop into
 * ALL_SKILLS without any adapter:
 *
 *   import { peopleSkill } from "@/lib/ai-tools/people";
 *   ALL_SKILLS.push(peopleSkill);
 *
 * All tool implementations use `ctx.supabase` (RLS-scoped). Dispatch is
 * handled by the runtime's `executeToolGuarded`; there is no per-skill
 * dispatcher here.
 */

import "server-only";

import { clampList, toolError, toolOk } from "@/lib/agent/skills/_helpers";
import { docExpiryBucket } from "@/lib/people/server";
import type {
  SkillDefinition,
  ToolDefinition,
} from "@/lib/agent/runtime/types";
import type {
  Employee,
  EmployeeDocument,
  ExpiringDocRow,
  TimeOffBalance,
} from "@/lib/people/types";

/* ──────────────────── tools ──────────────────── */

const search_employees: ToolDefinition = {
  name: "search_employees",
  description:
    "Search employees in the active workspace by name/title/email/department, with optional status + manager filters.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Free-text substring match" },
      department: { type: "string" },
      status: { type: "string", enum: ["active", "on_leave", "terminated"] },
      manager_id: {
        type: "string",
        description: "Limit to direct reports of this employee id",
      },
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
    let q = ctx.supabase
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
    if (error) return toolError(error.message);
    return toolOk(clampList((data ?? []) as Employee[], 100));
  },
};

const get_timeoff_balance: ToolDefinition = {
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
    if (!i.employee_id) return toolError("employee_id required");
    let q = ctx.supabase
      .from("time_off_balances")
      .select(
        "*, policy:time_off_policies(id, name, kind, accrual_per_year_days, cap)"
      )
      .eq("workspace_id", ctx.workspaceId)
      .eq("employee_id", i.employee_id);
    if (i.policy_id) q = q.eq("policy_id", i.policy_id);
    const { data, error } = await q;
    if (error) return toolError(error.message);
    return toolOk((data ?? []) as TimeOffBalance[]);
  },
};

const request_timeoff: ToolDefinition = {
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
  execute: async (input, ctx) => {
    const i = input as {
      policy_id: string;
      start_date: string;
      end_date: string;
      reason?: string;
    };
    if (!i.policy_id || !i.start_date || !i.end_date) {
      return toolError("policy_id, start_date, end_date required");
    }
    const { data, error } = await ctx.supabase.rpc(
      "submit_time_off_request",
      {
        p_policy_id: i.policy_id,
        p_start: i.start_date,
        p_end: i.end_date,
        p_reason: i.reason ?? null,
      }
    );
    if (error) return toolError(error.message);
    return toolOk({ request_id: data as string });
  },
};

const find_doc_expiries: ToolDefinition = {
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
  execute: async (input, ctx) => {
    const i = (input ?? {}) as { within_days?: number };
    const within = Math.min(Math.max(i.within_days ?? 30, 1), 365);
    const { data, error } = await ctx.supabase.rpc("expiring_docs", {
      p_within_days: within,
    });
    if (error) return toolError(error.message);
    const rows = (data ?? []) as ExpiringDocRow[];
    return toolOk(
      rows.map((r) => ({
        ...r,
        urgency: docExpiryBucket(r.expires_at),
      }))
    );
  },
};

const list_direct_reports: ToolDefinition = {
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
    let managerId = i.manager_id;
    if (!managerId) {
      const { data: me } = await ctx.supabase
        .from("employees")
        .select("id")
        .eq("workspace_id", ctx.workspaceId)
        .eq("user_id", ctx.userId)
        .maybeSingle();
      managerId = (me?.id as string | undefined) ?? undefined;
    }
    if (!managerId) return toolOk([]);
    const { data, error } = await ctx.supabase
      .from("employees")
      .select("id, full_name, email, job_title, department, status")
      .eq("workspace_id", ctx.workspaceId)
      .eq("manager_id", managerId)
      .is("archived_at", null)
      .order("full_name");
    if (error) return toolError(error.message);
    return toolOk((data ?? []) as Employee[]);
  },
};

const list_org_chain: ToolDefinition = {
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
    if (!i.employee_id) return toolError("employee_id required");
    type ChainRow = Pick<
      Employee,
      "id" | "full_name" | "job_title" | "manager_id"
    >;
    const chain: ChainRow[] = [];
    let current: string | null = i.employee_id;
    const seen = new Set<string>();
    for (let hop = 0; hop < 16 && current; hop += 1) {
      if (seen.has(current)) break;
      seen.add(current);
      const res = await ctx.supabase
        .from("employees")
        .select("id, full_name, job_title, manager_id")
        .eq("workspace_id", ctx.workspaceId)
        .eq("id", current)
        .maybeSingle();
      if (res.error) return toolError(res.error.message);
      const row = res.data as ChainRow | null;
      if (!row) break;
      chain.push(row);
      current = row.manager_id;
    }
    return toolOk(chain);
  },
};

const list_org_under: ToolDefinition = {
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
    if (!i.employee_id) return toolError("employee_id required");
    const { data, error } = await ctx.supabase
      .from("employees")
      .select("id, full_name, job_title, manager_id, status")
      .eq("workspace_id", ctx.workspaceId)
      .is("archived_at", null);
    if (error) return toolError(error.message);

    type SubtreeRow = Pick<
      Employee,
      "id" | "full_name" | "job_title" | "manager_id" | "status"
    >;
    const byManager = new Map<string | null, SubtreeRow[]>();
    for (const row of (data ?? []) as SubtreeRow[]) {
      const list = byManager.get(row.manager_id) ?? [];
      list.push(row);
      byManager.set(row.manager_id, list);
    }

    type FlatRow = SubtreeRow & { depth: number };
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
    return toolOk(out);
  },
};

const list_timeoff_requests: ToolDefinition = {
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
    let q = ctx.supabase
      .from("time_off_requests")
      .select("*")
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false })
      .limit(Math.min(i.limit ?? 25, 100));
    if (i.status) q = q.eq("status", i.status);
    if (i.employee_id) q = q.eq("employee_id", i.employee_id);
    const { data, error } = await q;
    if (error) return toolError(error.message);
    return toolOk(data ?? []);
  },
};

const list_employee_documents: ToolDefinition = {
  name: "list_employee_documents",
  description:
    "List an employee's documents (EID, visa, passport, contract, etc.).",
  input_schema: {
    type: "object",
    properties: { employee_id: { type: "string" } },
    required: ["employee_id"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const i = input as { employee_id: string };
    if (!i.employee_id) return toolError("employee_id required");
    const { data, error } = await ctx.supabase
      .from("employee_documents")
      .select("*")
      .eq("employee_id", i.employee_id)
      .order("expires_at", { ascending: true });
    if (error) return toolError(error.message);
    return toolOk(
      ((data ?? []) as EmployeeDocument[]).map((d) => ({
        ...d,
        urgency: docExpiryBucket(d.expires_at),
      }))
    );
  },
};

export const peopleSkill: SkillDefinition = {
  id: "people",
  label: "People & HR",
  description:
    "Search employees, inspect time-off balances, submit time-off requests, walk the org chart, and surface expiring HR documents.",
  systemFragment:
    "People records are workspace-scoped. Use search_employees with free-text query + optional department/status/manager filters. Use get_timeoff_balance (requires employee_id) and list_timeoff_requests (workspace-wide, filterable by status + employee). Use request_timeoff to submit a leave request for the caller; dates are inclusive YYYY-MM-DD. Use list_direct_reports (defaults to caller's own reports), list_org_chain (upwards), and list_org_under (downwards subtree) for hierarchy questions. Use find_doc_expiries to surface upcoming Emirates ID/visa/passport expiries; list_employee_documents drills into one employee's docs.",
  tools: [
    search_employees,
    get_timeoff_balance,
    request_timeoff,
    find_doc_expiries,
    list_direct_reports,
    list_org_chain,
    list_org_under,
    list_timeoff_requests,
    list_employee_documents,
  ],
};

export default peopleSkill;
