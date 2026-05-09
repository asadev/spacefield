import { NextResponse } from "next/server";

import { getBulkOperation } from "@/lib/bulk";

import { checkIsAdmin } from "@/app/admin/_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/bulk/[id] — full BulkOperationRow.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await checkIsAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason === "no-user" ? "not signed in" : "not authorized" },
      { status: auth.reason === "no-user" ? 401 : 403 }
    );
  }
  const { id } = await params;
  const row = await getBulkOperation(id);
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}
