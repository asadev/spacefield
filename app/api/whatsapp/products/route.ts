import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp products (EPIC-18) — lightweight catalog feeding the in-inbox
 * product picker (tap → send image + caption + price). NOT a native WA
 * catalog/cart (Cloud-API only). Can be hydrated from inventory_items.
 *
 * GET    /api/whatsapp/products?workspace_id=[&q=]          → { items }
 * POST   /api/whatsapp/products  { workspace_id, name, ... }
 *        import: { workspace_id, action:'import_from_inventory', item_ids:[...] }
 * PATCH  /api/whatsapp/products  { workspace_id, id, ...fields }
 * DELETE /api/whatsapp/products?workspace_id=&id=
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 */

const COLS =
  "id, name, description, price, currency, sku, media_url, media_storage_path, order_link, source, source_id, active, created_at, updated_at";

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);
  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  let q = admin
    .from("whatsapp_products")
    .select(COLS)
    .eq("workspace_id", workspaceId)
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });
  const search = sp.get("q");
  if (search?.trim()) q = q.ilike("name", `%${search.trim()}%`);
  const { data, error } = await q;
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ items: data ?? [] });
}

interface ProductBody {
  workspace_id?: string;
  id?: string;
  action?: string;
  item_ids?: string[];
  name?: string;
  description?: string | null;
  price?: number | string | null;
  currency?: string;
  sku?: string | null;
  media_url?: string | null;
  media_storage_path?: string | null;
  order_link?: string | null;
  active?: boolean;
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<ProductBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  const member = await requireWorkspaceMember(auth.supabase, b.workspace_id);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  // Import flow: copy selected inventory_items into whatsapp_products.
  if (b.action === "import_from_inventory") {
    const wsId = b.workspace_id;
    const ids = Array.isArray(b.item_ids)
      ? b.item_ids.filter((x) => typeof x === "string")
      : [];
    if (ids.length === 0) return jsonError("item_ids required", 400);
    const { data: items, error: invErr } = await admin
      .from("crm_inventory_items")
      .select("id, name, sku, description, price, currency, image_url")
      .eq("workspace_id", wsId)
      .in("id", ids);
    if (invErr) return jsonError(invErr.message, 500);
    const rows = (items ?? []).map((it) => {
      const r = it as {
        id: string;
        name: string;
        sku: string | null;
        description: string | null;
        price: number | null;
        currency: string | null;
        image_url: string | null;
      };
      return {
        workspace_id: wsId,
        name: r.name,
        description: r.description,
        price: r.price,
        currency: r.currency ?? "PKR",
        sku: r.sku,
        media_url: r.image_url,
        source: "inventory",
        source_id: r.id,
        active: true,
      };
    });
    if (rows.length === 0) return jsonError("no_items_found", 404);
    const { data, error } = await admin
      .from("whatsapp_products")
      .insert(rows)
      .select(COLS);
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ items: data ?? [], imported: data?.length ?? 0 });
  }

  if (!b.name?.trim()) return jsonError("name required", 400);
  const { data, error } = await admin
    .from("whatsapp_products")
    .insert({
      workspace_id: b.workspace_id,
      name: b.name.trim(),
      description: b.description ?? null,
      price: b.price === "" || b.price == null ? null : b.price,
      currency: b.currency ?? "PKR",
      sku: b.sku ?? null,
      media_url: b.media_url ?? null,
      media_storage_path: b.media_storage_path ?? null,
      order_link: b.order_link ?? null,
      source: "manual",
      active: b.active ?? true,
    })
    .select(COLS)
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<ProductBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  if (!b.id) return jsonError("id required", 400);
  const member = await requireWorkspaceMember(auth.supabase, b.workspace_id);
  if (!member.ok) return member.response;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.name !== undefined) patch.name = b.name.trim();
  if (b.description !== undefined) patch.description = b.description;
  if (b.price !== undefined) patch.price = b.price === "" || b.price == null ? null : b.price;
  if (b.currency !== undefined) patch.currency = b.currency;
  if (b.sku !== undefined) patch.sku = b.sku;
  if (b.media_url !== undefined) patch.media_url = b.media_url;
  if (b.media_storage_path !== undefined) patch.media_storage_path = b.media_storage_path;
  if (b.order_link !== undefined) patch.order_link = b.order_link;
  if (b.active !== undefined) patch.active = !!b.active;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_products")
    .update(patch)
    .eq("id", b.id)
    .eq("workspace_id", b.workspace_id)
    .select(COLS)
    .maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("not_found", 404);
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  const id = sp.get("id");
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!id) return jsonError("id required", 400);
  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { error } = await admin
    .from("whatsapp_products")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
