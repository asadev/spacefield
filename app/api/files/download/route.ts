import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { presignedDownloadUrl } from "@/lib/r2";

/* GET /api/files/download?id=<fileId>&inline=1
 *   returns: { url } — short-lived presigned R2 GET URL
 *
 * Authorization:
 *   - User must be a member of the file's workspace.
 *   - Reads RLS-protected workspace_files row to confirm.
 */

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  const inline = req.nextUrl.searchParams.get("inline") === "1";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const { data: row, error } = await supabase
    .from("workspace_files")
    .select("r2_key, name, content_type")
    .eq("id", id)
    .single();
  if (error || !row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const url = await presignedDownloadUrl({
    key: row.r2_key,
    fileName: inline ? undefined : row.name,
  });
  return NextResponse.json({ url });
}
