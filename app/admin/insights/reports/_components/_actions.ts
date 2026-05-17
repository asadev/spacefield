"use server";

import { createAdminClient } from "@/lib/supabase/admin";

import { assertAdmin } from "../../../_lib";

/**
 * Cross-tool report aggregator.
 *
 * Pulls rows from the requested table with an allow-list-guarded
 * generic `aggregate(table, field, op)` helper, then groups in memory
 * and returns sorted top-50 buckets. SVG bar chart on the client
 * renders the result.
 *
 * We keep the aggregation in-process rather than firing a server-side
 * `select … group by` because that would require building SQL
 * dynamically — which we'd then have to sanitize against injection.
 * The allow-list approach is small, auditable, and fast enough for
 * <100k row tables (which is what `insights/reports` is for).
 *
 * "use server" files may only export async functions — no type
 * re-exports. The shapes the client uses live next to it in the
 * ReportsClient.tsx file.
 */

const TABLE_ALLOW = new Set([
  "tasks",
  "projects",
  "crm_companies",
  "crm_contacts",
  "crm_leads",
  "crm_deals",
  "crm_activities",
  "employees",
  "workflows",
  "workspace_templates",
]);

// Per-table column allow-list. Anything not in here is rejected so a
// crafted query can't read columns we didn't intend to expose.
const COL_ALLOW: Record<string, Set<string>> = {
  tasks: new Set([
    "status",
    "priority",
    "workspace_id",
    "project_id",
    "estimate_min",
    "actual_min",
  ]),
  projects: new Set(["status", "workspace_id"]),
  crm_companies: new Set([
    "industry",
    "country",
    "city",
    "visibility",
    "workspace_id",
  ]),
  crm_contacts: new Set(["job_title", "visibility", "workspace_id"]),
  crm_leads: new Set(["status", "source", "visibility", "workspace_id"]),
  crm_deals: new Set([
    "status",
    "stage_id",
    "pipeline_id",
    "currency",
    "visibility",
    "amount",
    "workspace_id",
  ]),
  crm_activities: new Set(["kind", "workspace_id"]),
  employees: new Set([
    "department",
    "status",
    "employment_type",
    "workspace_id",
  ]),
  workflows: new Set(["trigger_kind", "enabled", "workspace_id"]),
  workspace_templates: new Set(["industry", "enabled"]),
};

export async function runAggregate(input: {
  table: string;
  group_by: string;
  op: "count" | "sum" | "avg";
  field?: string;
}): Promise<{ ok: true; points: { label: string; value: number }[] } | { ok: false; error: string }> {
  await assertAdmin();

  if (!TABLE_ALLOW.has(input.table)) {
    return { ok: false, error: `table not allowed: ${input.table}` };
  }
  const allowed = COL_ALLOW[input.table];
  if (!allowed) {
    return { ok: false, error: `no column allow-list for ${input.table}` };
  }
  if (!allowed.has(input.group_by)) {
    return {
      ok: false,
      error: `group_by column "${input.group_by}" not allowed on ${input.table}`,
    };
  }
  if (input.op !== "count") {
    if (!input.field) return { ok: false, error: "field is required for sum/avg" };
    if (!allowed.has(input.field)) {
      return {
        ok: false,
        error: `field "${input.field}" not allowed on ${input.table}`,
      };
    }
  }

  // Selecting only the two columns keeps the payload small even for
  // ~50k-row tables. We hard-cap at 100k to keep memory predictable;
  // anything that needs more should move to a SQL view + RPC.
  const selectCols =
    input.op === "count"
      ? input.group_by
      : `${input.group_by}, ${input.field}`;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from(input.table)
    .select(selectCols)
    .limit(100_000);
  if (error) return { ok: false, error: error.message };

  type Row = Record<string, unknown>;
  const rows = (data ?? []) as unknown as Row[];

  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[input.group_by] ?? "(empty)");
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (input.op !== "count") {
      const raw = row[input.field as string];
      const n = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(n)) {
        sums.set(key, (sums.get(key) ?? 0) + n);
      }
    }
  }

  const labels = Array.from(counts.keys());
  const points = labels
    .map((label) => {
      if (input.op === "count") return { label, value: counts.get(label) ?? 0 };
      const sum = sums.get(label) ?? 0;
      if (input.op === "sum") return { label, value: sum };
      const c = counts.get(label) ?? 0;
      return { label, value: c > 0 ? sum / c : 0 };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 50);

  return { ok: true, points };
}
