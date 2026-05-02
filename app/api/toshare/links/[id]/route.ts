/* Delete a toshare link. */

import { NextRequest, NextResponse } from "next/server";
import { deleteLink } from "@/lib/toshare/server";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await deleteLink(id);
  if (!result.ok) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
