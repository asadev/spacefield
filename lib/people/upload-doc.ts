import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createEmployeeDocument } from "@/lib/people/actions";
import type { EmployeeDocumentKind } from "@/lib/people/types";

/**
 * Server-side helper for the employee documents upload route.
 *
 * Flow:
 *   1. Validate the file (size + mime).
 *   2. Resolve the employee and confirm the caller is a workspace member
 *      (RLS on `employees` returns null for non-members, so a `null`
 *      lookup short-circuits as 403).
 *   3. Upload the binary into the `employee-documents` Supabase Storage
 *      bucket at `employees/<employee_id>/<uuid>-<sanitised>`.
 *   4. Record the metadata via `createEmployeeDocument` (existing action
 *      that also feeds the search index).
 *
 * Returns a discriminated `{ ok: true; ... }` / `{ ok: false; error; status }`
 * tuple so the route handler can map directly to HTTP status codes.
 */

const BUCKET = "employee-documents";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const VALID_KINDS: ReadonlySet<EmployeeDocumentKind> = new Set([
  "emirates_id",
  "visa",
  "passport",
  "contract",
  "certification",
  "other",
]);

export type UploadDocResult =
  | {
      ok: true;
      document: {
        id?: string;
        file_url: string;
        storage_path: string;
      };
    }
  | { ok: false; error: string; status: number };

function sanitiseName(name: string): string {
  // Strip path separators + collapse anything weird into underscores.
  // Keep extension intact for content-type sniffing on the storage side.
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

export async function uploadEmployeeDocument(input: {
  file: File;
  employeeId: string;
  kind: EmployeeDocumentKind;
  name: string;
  expiresAt?: string;
  number?: string;
  notes?: string;
}): Promise<UploadDocResult> {
  const { file, employeeId, kind, name, expiresAt, number, notes } = input;

  // ── Validation ────────────────────────────────────────────────────────
  if (!file || file.size === 0) {
    return { ok: false, error: "file_required", status: 400 };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "file_too_large", status: 413 };
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: "unsupported_media_type", status: 415 };
  }
  if (!VALID_KINDS.has(kind)) {
    return { ok: false, error: "invalid_kind", status: 400 };
  }
  if (!name?.trim()) {
    return { ok: false, error: "name_required", status: 400 };
  }
  if (!employeeId) {
    return { ok: false, error: "employee_id_required", status: 400 };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, error: "unauthorized", status: 401 };
  }

  // ── Workspace membership via RLS ───────────────────────────────────────
  // RLS on `employees` only returns the row when the caller is a member
  // of that workspace, so a null result is effectively a 403.
  const { data: employee } = await supabase
    .from("employees")
    .select("id, workspace_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!employee) {
    return { ok: false, error: "employee_not_found", status: 404 };
  }

  // ── Upload to storage ─────────────────────────────────────────────────
  const safe = sanitiseName(file.name);
  const storagePath = `employees/${employeeId}/${crypto.randomUUID()}-${safe}`;
  const buf = await file.arrayBuffer();
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buf, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadErr) {
    return {
      ok: false,
      error: uploadErr.message || "upload_failed",
      status: 500,
    };
  }

  // Build a stable file URL we can hand to the existing action. The
  // bucket is private — UI will need to mint a signed URL at view time;
  // we just persist the storage path so the bucket move is reversible.
  const fileUrl = `supabase://${BUCKET}/${storagePath}`;

  // ── Persist metadata ──────────────────────────────────────────────────
  const result = await createEmployeeDocument({
    workspace_id: employee.workspace_id,
    employee_id: employeeId,
    kind,
    name: name.trim(),
    number,
    expires_at: expiresAt,
    file_url: fileUrl,
    notes,
  });
  if (!result.ok) {
    // Best-effort cleanup so we don't leak orphans.
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return { ok: false, error: result.error, status: 500 };
  }

  return {
    ok: true,
    document: {
      file_url: fileUrl,
      storage_path: storagePath,
    },
  };
}

export const EMPLOYEE_DOCUMENTS_BUCKET = BUCKET;
export const EMPLOYEE_DOCUMENT_MAX_BYTES = MAX_BYTES;
export const EMPLOYEE_DOCUMENT_ALLOWED_MIME = Array.from(ALLOWED_MIME);
