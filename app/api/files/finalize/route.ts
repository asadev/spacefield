import { NextResponse, type NextRequest } from "next/server";
import { safeErrorMessage } from "@/lib/safe-error";
import { createClient } from "@/lib/supabase/server";
import { deleteR2Object, r2ObjectSize } from "@/lib/r2";
import { withIdempotency } from "@/lib/idempotency";
import { emit, OutboxEventTypes } from "@/lib/outbox";

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
 *   5. Idempotent: a network blip after the workspace_files row is
 *      inserted would otherwise cause a retry to clobber state. We key
 *      idempotency on `files:<workspaceId>:<fileId>` (or the explicit
 *      `Idempotency-Key` header if the client supplied one) so the
 *      second call returns the same response without re-running the
 *      R2 HEAD + quota check + insert.
 */

const HARD_PER_FILE_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GB

type FinalizeResponse =
  | { ok: true; file: unknown }
  | { ok: false; status: number; error: string; extra?: Record<string, unknown> };

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

  // Idempotency wrapper. fileId is a UUID minted by the client when it
  // started the upload, so it's a natural per-operation key. Clients
  // can additionally supply Idempotency-Key for explicit override.
  const headerKey = req.headers.get("idempotency-key") ?? "";
  const idempotencyKey = headerKey
    ? `files-finalize:${user.id}:${headerKey}`
    : `files-finalize:${workspaceId}:${fileId}`;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseServiceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    "";

  const result = await withIdempotency<FinalizeResponse>(
    {
      key: idempotencyKey,
      supabase: { url: supabaseUrl, serviceRoleKey: supabaseServiceRoleKey },
    },
    async () => {
      // Ground-truth size from R2
      let actualSize: number | null;
      try {
        actualSize = await r2ObjectSize(key);
      } catch (err) {
        return {
          ok: false,
          status: 500,
          error: safeErrorMessage(err, {
            source: "files.finalize.head",
            userId: user.id,
            fallback: "could not verify upload",
          }),
        };
      }
      if (actualSize === null) {
        return { ok: false, status: 400, error: "upload not found at R2" };
      }
      if (actualSize > HARD_PER_FILE_LIMIT_BYTES) {
        try {
          await deleteR2Object(key);
        } catch {
          /* leave for sweeper */
        }
        return {
          ok: false,
          status: 413,
          error: "file_too_large",
          extra: {
            max_bytes: HARD_PER_FILE_LIMIT_BYTES,
            actual_bytes: actualSize,
          },
        };
      }

      const { data: storage, error: storageErr } = await supabase.rpc(
        "workspace_storage",
        { ws_id: workspaceId }
      );
      if (storageErr) {
        return { ok: false, status: 500, error: storageErr.message };
      }
      const cap = Number(storage?.[0]?.cap_bytes ?? 0);
      const used = Number(storage?.[0]?.used_bytes ?? 0);
      if (used + actualSize > cap) {
        try {
          await deleteR2Object(key);
        } catch {
          /* leave for sweeper */
        }
        return {
          ok: false,
          status: 413,
          error: "storage_quota_exceeded",
          extra: {
            cap_bytes: cap,
            used_bytes: used,
            attempted_bytes: actualSize,
            remaining_bytes: Math.max(0, cap - used),
          },
        };
      }

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
        try {
          await deleteR2Object(key);
        } catch {
          /* leave for sweeper */
        }
        return { ok: false, status: 400, error: error.message };
      }

      // Fire-and-forget outbox event for downstream subscribers
      // (indexer, virus scan, etc). Dedup by fileId so retries don't
      // multiply rows.
      void emit(
        OutboxEventTypes.FileFinalizeCompleted,
        {
          file_id: fileId,
          workspace_id: workspaceId,
          user_id: user.id,
          key,
          size_bytes: actualSize,
          name,
          content_type: contentType ?? null,
        },
        { dedupeKey: `file-finalize:${fileId}` }
      );

      return { ok: true, file: data };
    }
  );

  if (result.ok) {
    return NextResponse.json({ file: result.file });
  }
  const body_out: Record<string, unknown> = { error: result.error };
  if (result.extra) Object.assign(body_out, result.extra);
  return NextResponse.json(body_out, { status: result.status });
}
