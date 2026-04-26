import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteR2Object } from "@/lib/r2";

/* DELETE /api/files/delete?id=<fileId>
 *
 * Owner of the file (or workspace owner/admin) can delete. RLS on
 * public.workspace_files enforces. We still try the DB delete first
 * — if it succeeds we know the caller had permission, so we then
 * delete the R2 object. If the R2 delete fails the row is already
 * gone (worst case: a 1-byte orphan in R2 we'll garbage-collect later).
 */

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  // Read first so we know the R2 key
  const { data: row } = await supabase
    .from("workspace_files")
    .select("r2_key")
    .eq("id", id)
    .single();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await supabase.from("workspace_files").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  try {
    await deleteR2Object(row.r2_key);
  } catch (err) {
    console.warn("[files/delete] r2 delete failed (orphan):", err);
  }
  return NextResponse.json({ ok: true });
}
