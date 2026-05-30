import { NextResponse, type NextRequest } from "next/server";
import { getCompanyById } from "@/app/tools/crm/_data";
import { indexCompany, unindexCompany } from "@/lib/crm/search-index";
import { jsonError, readJson, requireUser } from "../../_helpers";
import { companyUpdate } from "../../_schemas";

/* GET /api/crm/companies/[id] */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const item = await getCompanyById(id);
  if (!item) return jsonError("not_found", 404);
  return NextResponse.json({ item });
}

/* PATCH /api/crm/companies/[id] */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = companyUpdate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const { data, error } = await auth.supabase
    .from("crm_companies")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  await indexCompany(data);
  return NextResponse.json({ item: data });
}

/* DELETE /api/crm/companies/[id] */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const { error } = await auth.supabase
    .from("crm_companies")
    .delete()
    .eq("id", id);
  if (error) return jsonError(error.message, 500);
  await unindexCompany(id);
  return NextResponse.json({ ok: true });
}
