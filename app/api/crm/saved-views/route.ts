import { NextResponse, type NextRequest } from "next/server";
import { listSavedViews } from "@/app/tools/crm/_data";
import type { CrmSavedViewRecordType } from "@/app/tools/crm/types";
import { RECORD_TYPE_VALUES_WITH_ACTIVITY } from "@/app/tools/crm/types";
import {
  jsonError,
  readJson,
  requireUser,
  requireWorkspaceMember,
} from "../_helpers";
import { savedViewCreate } from "../_schemas";

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
    ? (RECORD_TYPE_VALUES_WITH_ACTIVITY as readonly string[]).includes(
        recordTypeParam
      )
      ? (recordTypeParam as CrmSavedViewRecordType)
      : undefined
    : undefined;

  try {
    const items = await listSavedViews(workspaceId, recordType);
    return NextResponse.json({ items });
  } catch (e) {
    return jsonError((e as Error).message, 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body.ok) return body.response;

  const parsed = savedViewCreate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const member = await requireWorkspaceMember(
    auth.supabase,
    parsed.data.workspace_id
  );
  if (!member.ok) return member.response;

  const { data, error } = await auth.supabase
    .from("crm_saved_views")
    .insert({ ...parsed.data, user_id: auth.user.id })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data });
}
