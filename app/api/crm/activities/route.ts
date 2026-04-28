import { NextResponse, type NextRequest } from "next/server";
import { listActivities } from "@/app/tools/crm/_data";
import type { CrmActivityKind } from "@/app/tools/crm/types";
import { ACTIVITY_KIND_VALUES } from "@/app/tools/crm/types";
import {
  jsonError,
  readJson,
  requireUser,
  requireWorkspaceMember,
} from "../_helpers";
import { activityCreate } from "../_schemas";

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required");

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const kindParam = sp.get("kind");
  const kind = kindParam
    ? (ACTIVITY_KIND_VALUES as readonly string[]).includes(kindParam)
      ? (kindParam as CrmActivityKind)
      : undefined
    : undefined;

  const completedParam = sp.get("completed");
  const completed =
    completedParam === "true"
      ? true
      : completedParam === "false"
      ? false
      : undefined;

  try {
    const items = await listActivities(workspaceId, {
      contactId: sp.get("contact_id") ?? undefined,
      companyId: sp.get("company_id") ?? undefined,
      dealId: sp.get("deal_id") ?? undefined,
      leadId: sp.get("lead_id") ?? undefined,
      kind,
      completed,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      cursor: sp.get("cursor") ?? undefined,
    });
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

  const parsed = activityCreate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const member = await requireWorkspaceMember(
    auth.supabase,
    parsed.data.workspace_id
  );
  if (!member.ok) return member.response;

  const { data, error } = await auth.supabase
    .from("crm_activities")
    .insert({ ...parsed.data, created_by: auth.user.id })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data });
}
