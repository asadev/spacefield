import { NextResponse, type NextRequest } from "next/server";
import { getContactById } from "@/app/tools/crm/_data";
import { indexContact, unindexContact } from "@/lib/crm/search-index";
import { jsonError, readJson, requireUser } from "../../_helpers";
import { contactUpdate } from "../../_schemas";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const item = await getContactById(id);
  if (!item) return jsonError("not_found", 404);
  return NextResponse.json({ item });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = contactUpdate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const { data, error } = await auth.supabase
    .from("crm_contacts")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
  await indexContact(data);
  return NextResponse.json({ item: data });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const { error } = await auth.supabase
    .from("crm_contacts")
    .delete()
    .eq("id", id);
  if (error) return jsonError(error.message, 500);
  await unindexContact(id);
  return NextResponse.json({ ok: true });
}
