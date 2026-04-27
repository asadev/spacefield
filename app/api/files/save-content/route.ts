import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildR2Key, r2, R2_BUCKET } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";

/* POST /api/files/save-content
 *   body: {
 *     fileId?: string,        // if omitted, a new file is created
 *     workspaceId: string,
 *     name: string,
 *     contentType: string,
 *     contentBase64: string,  // file body, base64-encoded
 *   }
 *   returns: { file: { id, name, size_bytes, content_type, created_at, user_id, r2_key } }
 *
 * Used by the Documents and Sheets desktop apps to round-trip rich-text
 * content through the workspace's storage. Writes the body straight to R2
 * server-side (no presigned PUT) because the payload is already small —
 * documents are typically a few KB to a couple of hundred KB.
 *
 * Authorization mirrors /api/files/upload + /api/files/finalize:
 *   - caller must be authenticated
 *   - service-role lookup on workspaces + workspace_members so RLS visibility
 *     never lies to us; auto-self-heal owner membership if the trigger
 *     ever missed
 *   - workspace storage cap re-checked before write (subtracting the file's
 *     existing size for overwrite, so editing a doc doesn't fail just
 *     because the workspace is at 99 %).
 */

// Per-file ceiling for save-content. Real documents are tiny — a 25 MB cap is
// generous and matches the load-content cap so round-trip stays symmetric.
const MAX_SAVE_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    fileId?: string;
    workspaceId?: string;
    name?: string;
    contentType?: string;
    contentBase64?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { fileId, workspaceId, name, contentType, contentBase64 } = body;
  if (
    !workspaceId ||
    !name ||
    !contentType ||
    typeof contentBase64 !== "string"
  ) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  // Decode the body up-front. If this fails we want to bail before we touch
  // R2 or the DB.
  let buffer: Buffer;
  try {
    buffer = Buffer.from(contentBase64, "base64");
  } catch {
    return NextResponse.json(
      { error: "invalid contentBase64" },
      { status: 400 }
    );
  }
  if (buffer.length > MAX_SAVE_BYTES) {
    return NextResponse.json(
      {
        error: "file_too_large_to_save",
        max_bytes: MAX_SAVE_BYTES,
        actual_bytes: buffer.length,
      },
      { status: 413 }
    );
  }

  // Service-role membership check — same pattern as /api/files/upload.
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
      return NextResponse.json(
        { error: "not a member of that workspace" },
        { status: 403 }
      );
    }
  }

  // For overwrite, look up the existing row up-front so we can subtract its
  // current size from the quota math (otherwise editing a 5 MB file in a
  // near-full workspace would always fail).
  let existing: {
    id: string;
    workspace_id: string;
    r2_key: string;
    name: string;
    size_bytes: number;
    content_type: string | null;
  } | null = null;
  if (fileId) {
    const { data, error } = await admin
      .from("workspace_files")
      .select("id, workspace_id, r2_key, name, size_bytes, content_type")
      .eq("id", fileId)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "file_not_found" }, { status: 404 });
    }
    if (data.workspace_id !== workspaceId) {
      // The fileId belongs to a different workspace than the one in the
      // body — refuse rather than silently moving it.
      return NextResponse.json(
        { error: "workspace_mismatch" },
        { status: 400 }
      );
    }
    existing = data;
  }

  // Quota recheck — for overwrites, subtract the existing row's size since
  // the new bytes will replace those bytes, not stack on top.
  const { data: storage, error: storageErr } = await supabase.rpc(
    "workspace_storage",
    { ws_id: workspaceId }
  );
  if (storageErr) {
    return NextResponse.json({ error: storageErr.message }, { status: 500 });
  }
  const cap = Number(storage?.[0]?.cap_bytes ?? 0);
  const usedRaw = Number(storage?.[0]?.used_bytes ?? 0);
  const used = existing
    ? Math.max(0, usedRaw - Number(existing.size_bytes ?? 0))
    : usedRaw;
  if (used + buffer.length > cap) {
    return NextResponse.json(
      {
        error: "storage_quota_exceeded",
        cap_bytes: cap,
        used_bytes: usedRaw,
        attempted_bytes: buffer.length,
        remaining_bytes: Math.max(0, cap - usedRaw),
      },
      { status: 413 }
    );
  }

  // Resolve the R2 key + final id.
  const finalId = existing?.id ?? crypto.randomUUID();
  const finalName = name.trim().slice(0, 200) || "Untitled";
  const r2Key = existing
    ? existing.r2_key
    : buildR2Key({ workspaceId, fileId: finalId, fileName: finalName });

  // Write the body to R2.
  try {
    await r2().send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: r2Key,
        Body: buffer,
        ContentType: contentType,
        ContentLength: buffer.length,
      })
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "could not write to storage",
      },
      { status: 500 }
    );
  }

  if (existing) {
    // Existing file — UPDATE the row. Only rename if the caller passed a
    // name that differs from what's stored.
    const patch: {
      size_bytes: number;
      content_type: string;
      name?: string;
    } = {
      size_bytes: buffer.length,
      content_type: contentType,
    };
    if (finalName && finalName !== existing.name) {
      patch.name = finalName;
    }
    const { data: updated, error: upErr } = await admin
      .from("workspace_files")
      .update(patch)
      .eq("id", existing.id)
      .select(
        "id, name, size_bytes, content_type, created_at, user_id, r2_key"
      )
      .single();
    if (upErr || !updated) {
      return NextResponse.json(
        { error: upErr?.message ?? "update failed" },
        { status: 500 }
      );
    }
    return NextResponse.json({ file: updated });
  }

  // New file — INSERT. Use the user-scoped client so RLS still enforces
  // ownership on inserts (prevents service-role-shaped abuse).
  const { data: inserted, error: insErr } = await supabase
    .from("workspace_files")
    .insert({
      id: finalId,
      workspace_id: workspaceId,
      user_id: user.id,
      r2_key: r2Key,
      name: finalName,
      size_bytes: buffer.length,
      content_type: contentType,
    })
    .select("id, name, size_bytes, content_type, created_at, user_id, r2_key")
    .single();
  if (insErr || !inserted) {
    return NextResponse.json(
      { error: insErr?.message ?? "insert failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({ file: inserted });
}
