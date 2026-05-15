import { NextRequest, NextResponse } from "next/server";

import { checkIsAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Employee } from "@/lib/people/types";

/**
 * GET /admin/people/export?q=&status=&dept=
 *
 * Streams a CSV of the matching employees across all workspaces.
 * Admin-gated. Uses service-role so it sees the full set.
 */
export async function GET(req: NextRequest) {
  const auth = await checkIsAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "").trim();
  const dept = (url.searchParams.get("dept") ?? "").trim();

  const admin = createAdminClient();
  let query = admin
    .from("employees")
    .select(
      "workspace_id, full_name, email, job_title, department, location, employment_type, status, hire_date, termination_date, created_at"
    )
    .is("archived_at", null)
    .order("workspace_id")
    .limit(10_000);
  if (q) {
    const needle = q.replace(/[,%]/g, "");
    query = query.or(
      `full_name.ilike.%${needle}%,email.ilike.%${needle}%,job_title.ilike.%${needle}%`
    );
  }
  if (status) query = query.eq("status", status);
  if (dept) query = query.eq("department", dept);

  const { data } = await query;
  const rows = (data ?? []) as Partial<Employee>[];

  const header = [
    "workspace_id",
    "full_name",
    "email",
    "job_title",
    "department",
    "location",
    "employment_type",
    "status",
    "hire_date",
    "termination_date",
    "created_at",
  ];
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    header.join(","),
    ...rows.map((r) => header.map((h) => escape((r as Record<string, unknown>)[h])).join(",")),
  ];

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="employees-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
