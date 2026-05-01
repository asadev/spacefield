import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { buildR2Key, presignedUploadUrl } from "@/lib/r2";

/* POST /api/files/upload
 *   body: { workspaceId, name, contentType, sizeBytes }
 *   returns: { url, key, fileId } — client PUTs the file to `url`,
 *            then calls /api/files/finalize.
 *
 * Server-side checks:
 *   1. user is authenticated
 *   2. user is a member of the workspace (self-healed if they own it
 *      but the membership row is missing for any reason)
 *   3. workspace + file size doesn't exceed the owner's tier cap
 *
 * Membership check uses the SERVICE-ROLE client so RLS visibility quirks
 * (e.g. caller can't read someone else's workspaces but can still try
 * to upload to it) can't produce false negatives. If the workspace row
 * itself doesn't exist we fail with `workspace_not_found` so the client
 * can re-trigger /api/workspaces/ensure rather than silently 403'ing.
 */

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 20 uploads/min per user. Stops abusive bursts before we burn R2
  // presign calls and the storage quota lookup.
  const limited = await enforceRateLimit(
    `user:${user.id}:files-upload`,
    20,
    60
  );
  if (limited) return limited;

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

  // Membership check (admin-side so we see the truth across RLS).
  const admin = createAdminClient();
  const { data: workspace, error: wsErr } = await admin
    .from("workspaces")
    .select("id, user_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (wsErr) {
    return NextResponse.json({ error: wsErr.message }, { status: 500 });
  }
  if (!workspace) {
    return NextResponse.json(
      { error: "workspace_not_found" },
      { status: 404 }
    );
  }

  const { data: member } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    if (workspace.user_id === user.id) {
      // Caller owns this workspace but the membership row is missing.
      // Self-heal — same shape as the ensure route's owner branch.
      await admin.from("workspace_members").upsert(
        {
          workspace_id: workspaceId,
          user_id: user.id,
          role: "owner",
          invited_by: user.id,
        },
        { onConflict: "workspace_id,user_id", ignoreDuplicates: false }
      );
    } else {
      // Caller has no business uploading to this workspace.
      return NextResponse.json(
        { error: "not a member of that workspace" },
        { status: 403 }
      );
    }
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
