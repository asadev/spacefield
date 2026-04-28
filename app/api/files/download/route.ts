import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { presignedDownloadUrl } from "@/lib/r2";

/* GET /api/files/download?id=<fileId>&inline=1
 *   returns: { url } — short-lived presigned R2 GET URL
 *
 * Authorization:
 *   - User must be a member of the file's workspace, OR
 *   - There must exist a workspace_file_shares row with file_id = this
 *     file and target_workspace_id ∈ caller's workspaces (in which case
 *     the caller has read access via cross-workspace sharing).
 *
 * The user-session select would normally raise the file's RLS, but the
 * "target members read shared files" policy added in
 * 20260429_workspace_file_shares.sql widens visibility, so the same
 * `select` works for both cases. We then double-check membership via
 * the admin client to avoid leaking files in the unlikely case RLS is
 * relaxed elsewhere.
 */

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  const inline = req.nextUrl.searchParams.get("inline") === "1";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  // The user-session select honours both the original "members read
  // workspace files" policy and the "target members read shared files"
  // policy added with cross-workspace sharing.
  const { data: row, error } = await supabase
    .from("workspace_files")
    .select("id, workspace_id, r2_key, name, content_type")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    // Fall through to the admin path so we can distinguish "doesn't
    // exist" from "RLS hid it" — and so a target-workspace member whose
    // membership row was created concurrently still sees their share.
    const admin = createAdminClient();
    const lookup = await admin
      .from("workspace_files")
      .select("id, workspace_id, r2_key, name, content_type")
      .eq("id", id)
      .maybeSingle();
    if (!lookup.data) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const ownerWs = lookup.data.workspace_id as string;
    const isMember = await isCallerMemberOf(admin, user.id, ownerWs);
    const hasShare = await isCallerOnTargetShare(admin, user.id, id);
    if (!isMember && !hasShare) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const url = await presignedDownloadUrl({
      key: lookup.data.r2_key as string,
      fileName: inline ? undefined : (lookup.data.name as string),
    });
    return NextResponse.json({ url });
  }

  const url = await presignedDownloadUrl({
    key: row.r2_key,
    fileName: inline ? undefined : row.name,
  });
  return NextResponse.json({ url });
}

async function isCallerMemberOf(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const { data } = await admin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

async function isCallerOnTargetShare(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  fileId: string
): Promise<boolean> {
  const { data } = await admin
    .from("workspace_file_shares")
    .select("target_workspace_id")
    .eq("file_id", fileId);
  if (!data || data.length === 0) return false;
  const targetIds = data
    .map((r) => (r as { target_workspace_id: string }).target_workspace_id)
    .filter((v): v is string => Boolean(v));
  if (targetIds.length === 0) return false;
  const memberCheck = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .in("workspace_id", targetIds);
  return Boolean(memberCheck.data && memberCheck.data.length > 0);
}
