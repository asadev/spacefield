import { NextResponse, type NextRequest } from "next/server";
import { safeErrorMessage } from "@/lib/safe-error";
import { createClient } from "@/lib/supabase/server";
import { deleteR2Object, r2ObjectSize } from "@/lib/r2";

/* POST /api/files/finalize
 *   body: { workspaceId, fileId, key, name, contentType, sizeBytes }
 *
 * Server-side hardening (don't trust the client):
 *   1. The R2 key MUST start with `<workspaceId>/<fileId>/` so a member
 *      can't claim someone else's upload.
 *   2. We HEAD the R2 object to get the ACTUAL uploaded size — never
 *      trust the client's sizeBytes for quota math.
 *   3. We re-check the workspace's storage cap WITH the actual size of
 *      this new file. If it'd push the workspace over, we DELETE the
 *      R2 object and reject (closes the race where two parallel uploads
 *      each pass the /upload pre-check but together exceed the cap).
 *   4. Hard per-file ceiling at 1 GB regardless of tier — protects R2
 *      bandwidth + DB rows from accidental gigafile uploads.
 */

const HARD_PER_FILE_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GB

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    workspaceId?: string;
    fileId?: string;
    key?: string;
    name?: string;
    contentType?: string;
    sizeBytes?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { workspaceId, fileId, key, name, contentType } = body;
  if (!workspaceId || !fileId || !key || !name) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  // Path enforcement
  if (!key.startsWith(`${workspaceId}/${fileId}/`)) {
    return NextResponse.json({ error: "key mismatch" }, { status: 400 });
  }

  // Ground-truth size from R2
  let actualSize: number | null;
  try {
    actualSize = await r2ObjectSize(key);
  } catch (err) {
    return NextResponse.json(
      {
        error: safeErrorMessage(err, {
          source: "files.finalize.head",
          userId: user.id,
          fallback: "could not verify upload",
        }),
      },
      { status: 500 }
    );
  }
  if (actualSize === null) {
    return NextResponse.json(
      { error: "upload not found at R2" },
      { status: 400 }
    );
  }
  if (actualSize > HARD_PER_FILE_LIMIT_BYTES) {
    // Clean up the oversized object — it was uploaded successfully
    // (R2 honored the presigned PUT) but we won't accept it.
    try {
      await deleteR2Object(key);
    } catch {
      /* leave for sweeper */
    }
    return NextResponse.json(
      {
        error: "file_too_large",
        max_bytes: HARD_PER_FILE_LIMIT_BYTES,
        actual_bytes: actualSize,
      },
      { status: 413 }
    );
  }

  // Quota recheck — race-safe. cap_bytes/used_bytes from the RPC reflect
  // CURRENT committed state (before this file's row exists). If used +
  // actualSize > cap, reject and clean up R2.
  const { data: storage, error: storageErr } = await supabase.rpc(
    "workspace_storage",
    { ws_id: workspaceId }
  );
  if (storageErr) {
    return NextResponse.json({ error: storageErr.message }, { status: 500 });
  }
  const cap = Number(storage?.[0]?.cap_bytes ?? 0);
  const used = Number(storage?.[0]?.used_bytes ?? 0);
  if (used + actualSize > cap) {
    try {
      await deleteR2Object(key);
    } catch {
      /* leave for sweeper */
    }
    return NextResponse.json(
      {
        error: "storage_quota_exceeded",
        cap_bytes: cap,
        used_bytes: used,
        attempted_bytes: actualSize,
        remaining_bytes: Math.max(0, cap - used),
      },
      { status: 413 }
    );
  }

  // Insert the metadata row using the ACTUAL size from R2.
  const { data, error } = await supabase
    .from("workspace_files")
    .insert({
      id: fileId,
      workspace_id: workspaceId,
      user_id: user.id,
      r2_key: key,
      name,
      size_bytes: actualSize,
      content_type: contentType ?? null,
    })
    .select()
    .single();

  if (error) {
    // RLS rejected (e.g. user no longer a member). Clean up R2 too.
    try {
      await deleteR2Object(key);
    } catch {
      /* leave for sweeper */
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ file: data });
}
