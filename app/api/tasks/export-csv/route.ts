import { NextResponse, type NextRequest } from "next/server";

import { withApiHandler } from "@/lib/api-wrap";
import { adminListTasks } from "@/lib/tasks/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/tasks/export-csv  — admin-only CSV dump of tasks.
 *
 * Same filters as /admin/tasks. Admin-gated; service-role read
 * happens inside adminListTasks().
 */

function csvEscape(v: string | null | undefined): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const GET = withApiHandler(
  async (req: NextRequest) => {
    const url = req.nextUrl;
    const rows = await adminListTasks({
      workspaceId: url.searchParams.get("workspace") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      priority: url.searchParams.get("priority") ?? undefined,
      search: url.searchParams.get("q") ?? undefined,
      limit: 5000,
    });
    const header = [
      "id",
      "workspace_id",
      "project_id",
      "title",
      "status",
      "priority",
      "assignees",
      "due_at",
      "completed_at",
      "created_at",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.workspace_id,
          r.project_id ?? "",
          csvEscape(r.title),
          r.status,
          r.priority,
          csvEscape(r.assignee_ids.join("|")),
          r.due_at ?? "",
          r.completed_at ?? "",
          r.created_at,
        ].join(",")
      );
    }
    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="admin-tasks.csv"',
      },
    });
  },
  {
    source: "tasks.admin.export_csv",
    requireAdmin: true,
    rateLimit: { count: 20, window_sec: 60 },
  }
);
