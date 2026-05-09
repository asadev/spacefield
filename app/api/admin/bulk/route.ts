import { NextResponse } from "next/server";

import { listBulkOperations } from "@/lib/bulk";

import { checkIsAdmin } from "@/app/admin/_lib";
import type { BulkOperationRow } from "@/app/admin/_types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/bulk
 *   Optional query params:
 *     status  — pending|running|completed|failed|cancelled
 *     limit   — default 100, max 500
 *
 * Returns: { rows: BulkOperationRow[] }
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await checkIsAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason === "no-user" ? "not signed in" : "not authorized" },
      { status: auth.reason === "no-user" ? 401 : 403 }
    );
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "all";
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
  const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 100));

  const validStatus =
    status === "pending" ||
    status === "running" ||
    status === "completed" ||
    status === "failed" ||
    status === "cancelled"
      ? status
      : "all";

  const rows = await listBulkOperations({
    limit,
    status: validStatus as BulkOperationRow["status"] | "all",
  });
  return NextResponse.json({ rows });
}
