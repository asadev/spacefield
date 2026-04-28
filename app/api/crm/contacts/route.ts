import { NextResponse, type NextRequest } from "next/server";
import { listContacts } from "@/app/tools/crm/_data";
import {
  jsonError,
  readJson,
  requireUser,
  requireWorkspaceMember,
} from "../_helpers";
import { contactCreate } from "../_schemas";

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required");

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  try {
    const items = await listContacts(workspaceId, {
      search: sp.get("search") ?? undefined,
      ownerId: sp.get("owner_id") ?? undefined,
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

  const parsed = contactCreate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const member = await requireWorkspaceMember(
    auth.supabase,
    parsed.data.workspace_id
  );
  if (!member.ok) return member.response;

  const { data, error } = await auth.supabase
    .from("crm_contacts")
    .insert({ ...parsed.data, created_by: auth.user.id })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data });
}
