import { NextResponse, type NextRequest } from "next/server";
import { getDealById } from "@/app/tools/crm/_data";
import { jsonError, readJson, requireUser } from "../../_helpers";
import { dealUpdate } from "../../_schemas";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const item = await getDealById(id);
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
  const parsed = dealUpdate.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  // Mirror status -> closed_at for clean lifecycle math.
  const patch: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status && parsed.data.status !== "open") {
    patch.closed_at = new Date().toISOString();
  } else if (parsed.data.status === "open") {
    patch.closed_at = null;
  }

  const { data, error } = await auth.supabase
    .from("crm_deals")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 500);
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
    .from("crm_deals")
    .delete()
    .eq("id", id);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
