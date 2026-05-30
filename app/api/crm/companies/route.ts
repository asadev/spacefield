import { NextResponse, type NextRequest } from "next/server";
import { listCompanies } from "@/app/tools/crm/_data";
import { safeErrorMessage } from "@/lib/safe-error";
import { indexCompany } from "@/lib/crm/search-index";
import {
  jsonError,
  readJson,
  requireUser,
  requireWorkspaceMember,
} from "../_helpers";
import { companyCreate } from "../_schemas";

/* GET /api/crm/companies?workspace_id=…&search=&owner_id=&limit=&cursor= */
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required");

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  try {
    const items = await listCompanies(workspaceId, {
      search: sp.get("search") ?? undefined,
      ownerId: sp.get("owner_id") ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      cursor: sp.get("cursor") ?? undefined,
    });
    return NextResponse.json({ items });
  } catch (e) {
    return jsonError(
      safeErrorMessage(e, {
        source: "crm.companies.list",
        userId: auth.user.id,
        fallback: "list_failed",
      }),
      500
    );
  }
}

/* POST /api/crm/companies — body: companyCreate */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body.ok) return body.response;

  const parsed = companyCreate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const member = await requireWorkspaceMember(
    auth.supabase,
    parsed.data.workspace_id
  );
  if (!member.ok) return member.response;

  const { data, error } = await auth.supabase
    .from("crm_companies")
    .insert({ ...parsed.data, created_by: auth.user.id })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  await indexCompany(data);
  return NextResponse.json({ item: data });
}
