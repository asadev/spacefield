/* POST /api/people/documents/upload
 *
 * Multipart upload from the employee documents tab. Pipes the file
 * through `uploadEmployeeDocument` which:
 *   1. Validates size (10 MB cap) + mime (pdf/jpeg/png/webp).
 *   2. Confirms caller is in the employee's workspace via RLS.
 *   3. Uploads to the `employee-documents` Supabase Storage bucket at
 *      `employees/<employee_id>/<uuid>-<filename>`.
 *   4. Persists metadata via `createEmployeeDocument`.
 *
 * Form fields:
 *   - file (required, binary)
 *   - employee_id (required, uuid)
 *   - kind (required, one of EmployeeDocumentKind)
 *   - name (required)
 *   - number (optional)
 *   - expires_at (optional, ISO date)
 *   - notes (optional)
 */

import { NextResponse, type NextRequest } from "next/server";

import { uploadEmployeeDocument } from "@/lib/people/upload-doc";
import type { EmployeeDocumentKind } from "@/lib/people/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const KINDS: ReadonlySet<EmployeeDocumentKind> = new Set([
  "emirates_id",
  "visa",
  "passport",
  "contract",
  "certification",
  "other",
]);

function asString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_form_data" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "file_required" },
      { status: 400 }
    );
  }

  const employeeId = asString(form.get("employee_id"));
  const kindRaw = asString(form.get("kind"));
  const name = asString(form.get("name"));

  if (!employeeId) {
    return NextResponse.json(
      { ok: false, error: "employee_id_required" },
      { status: 400 }
    );
  }
  if (!kindRaw || !KINDS.has(kindRaw as EmployeeDocumentKind)) {
    return NextResponse.json(
      { ok: false, error: "invalid_kind" },
      { status: 400 }
    );
  }
  if (!name) {
    return NextResponse.json(
      { ok: false, error: "name_required" },
      { status: 400 }
    );
  }

  const result = await uploadEmployeeDocument({
    file,
    employeeId,
    kind: kindRaw as EmployeeDocumentKind,
    name,
    number: asString(form.get("number")),
    expiresAt: asString(form.get("expires_at")),
    notes: asString(form.get("notes")),
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({ ok: true, document: result.document });
}
