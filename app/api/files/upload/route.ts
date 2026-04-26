import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildR2Key, presignedUploadUrl } from "@/lib/r2";

/* POST /api/files/upload
 *   body: { workspaceId, name, contentType, sizeBytes }
 *   returns: { url, key, fileId } — client PUTs the file to `url`,
 *            then calls /api/files/finalize.
 *
 * Server-side checks:
 *   1. user is authenticated
 *   2. user is a member of the workspace
 *   3. workspace + file size doesn't exceed the owner's tier cap
 */

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    workspaceId?: string;
    name?: string;
    contentType?: string;
    sizeBytes?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { workspaceId, name, contentType, sizeBytes } = body;
  if (!workspaceId || !name || typeof sizeBytes !== "number" || sizeBytes < 0) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  // Membership + role check (any member can upload)
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) {
    return NextResponse.json(
      { error: "not a member of that workspace" },
      { status: 403 }
    );
  }

  // Quota check
  const { data: storage, error: storageErr } = await supabase.rpc(
    "workspace_storage",
    { ws_id: workspaceId }
  );
  if (storageErr) {
    return NextResponse.json({ error: storageErr.message }, { status: 500 });
  }
  const cap = Number(storage?.[0]?.cap_bytes ?? 0);
  const used = Number(storage?.[0]?.used_bytes ?? 0);
  if (used + sizeBytes > cap) {
    const remaining = Math.max(0, cap - used);
    return NextResponse.json(
      {
        error: "storage_quota_exceeded",
        cap_bytes: cap,
        used_bytes: used,
        remaining_bytes: remaining,
      },
      { status: 413 }
    );
  }

  // Reserve a fileId on our side; the actual row is inserted in /finalize.
  const fileId = crypto.randomUUID();
  const key = buildR2Key({ workspaceId, fileId, fileName: name });
  const url = await presignedUploadUrl({
    key,
    contentType,
    contentLength: sizeBytes,
  });

  return NextResponse.json({ url, key, fileId });
}
