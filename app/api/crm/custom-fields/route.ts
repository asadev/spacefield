import { NextResponse, type NextRequest } from "next/server";
import { listCustomFields } from "@/app/tools/crm/_data";
import type { CrmRecordType } from "@/app/tools/crm/types";
import { RECORD_TYPE_VALUES } from "@/app/tools/crm/types";
import { safeErrorMessage } from "@/lib/safe-error";
import {
  jsonError,
  readJson,
  requireUser,
  requireWorkspaceMember,
} from "../_helpers";
import { customFieldCreate } from "../_schemas";

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required");

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const recordTypeParam = sp.get("record_type");
  const recordType = recordTypeParam
    ? (RECORD_TYPE_VALUES as readonly string[]).includes(recordTypeParam)
      ? (recordTypeParam as CrmRecordType)
      : undefined
    : undefined;

  try {
    const items = await listCustomFields(workspaceId, recordType);
    return NextResponse.json({ items });
  } catch (e) {
    return jsonError(
      safeErrorMessage(e, {
        source: "crm.custom_fields.list",
        userId: auth.user.id,
        fallback: "list_failed",
      }),
      500
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body.ok) return body.response;

  const parsed = customFieldCreate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  // RLS will refuse if not admin/owner — return 403 cleanly.
  const { data, error } = await auth.supabase
    .from("crm_custom_fields")
    .insert(parsed.data)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data });
}
