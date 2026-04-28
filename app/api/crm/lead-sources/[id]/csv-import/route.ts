/* ─────────────────────────────────────────────────────────────────────────
 * POST /api/crm/lead-sources/[id]/csv-import
 *
 * Multipart/form-data upload of a CSV file (`file` field). Reads up to
 * 5,000 rows, ingests one-by-one through `ingestCsvRow`, returns counts.
 *
 * The lead source itself must already be configured (kind='csv') with a
 * `config.csvMapping` describing how CSV headers map onto lead fields.
 * The UI captures that mapping in the admin modal before this endpoint
 * is called.
 * ───────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import { jsonError, requireUser } from "../../../_helpers";
import { parseCsv } from "@/lib/crm/lead-sources/csv";
import {
  ingestCsvRow,
  loadLeadSourceById,
} from "@/lib/crm/lead-sources/ingest";
import type { LeadSourceEventStatus } from "@/lib/crm/lead-sources/types";

const MAX_ROWS = 5000;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const source = await loadLeadSourceById(id);
  if (!source) return jsonError("not_found", 404);
  if (source.kind !== "csv") return jsonError("not a csv source", 400);

  // Membership check (admin path doesn't go through RLS).
  const { data: member, error: mErr } = await auth.supabase.rpc(
    "is_workspace_member",
    { ws_id: source.workspace_id }
  );
  if (mErr) return jsonError(mErr.message, 500);
  if (member !== true) return jsonError("forbidden", 403);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError("expected multipart/form-data", 400);
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return jsonError("file required", 400);
  if (file.size > MAX_FILE_BYTES) return jsonError("file too large", 413);

  const text = await file.text();
  const parsed = parseCsv(text, MAX_ROWS);
  if (parsed.headers.length === 0) {
    return jsonError("empty csv", 400);
  }

  const counts: Record<LeadSourceEventStatus, number> = {
    accepted: 0,
    duplicate: 0,
    rejected: 0,
    error: 0,
  };
  const sampleErrors: string[] = [];

  for (const row of parsed.rows) {
    const result = await ingestCsvRow(id, row, {
      ip: null,
      userAgent: "spacefield-csv-import",
    });
    counts[result.status]++;
    if (
      (result.status === "rejected" || result.status === "error") &&
      sampleErrors.length < 5 &&
      result.reason
    ) {
      sampleErrors.push(result.reason);
    }
  }

  return NextResponse.json({
    ok: true,
    headers: parsed.headers,
    totalRows: parsed.totalRows,
    processed: parsed.rows.length,
    truncated: parsed.totalRows > parsed.rows.length,
    counts,
    sampleErrors,
  });
}
