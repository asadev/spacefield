import { NextResponse, type NextRequest } from "next/server";

import {
  addFavorite,
  isFavorited,
  listForUser,
  removeFavorite,
  reorderFavorites,
} from "@/lib/favorites";
import { createClient } from "@/lib/supabase/server";

/**
 * Per-user favorites — pin/unpin any polymorphic entity.
 *
 *   GET    /api/favorites                          → list current user's favorites
 *   GET    /api/favorites?entity_type=…&entity_id= → return { favorited: bool }
 *   POST   /api/favorites                          → add favorite OR reorder
 *   DELETE /api/favorites                          → remove favorite
 */

async function requireUser(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const guard = await requireUser();
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entity_type");
  const entityId = searchParams.get("entity_id");

  if (entityType && entityId) {
    const favorited = await isFavorited({ entityType, entityId });
    return NextResponse.json({ favorited });
  }
  const favorites = await listForUser();
  return NextResponse.json({ favorites });
}

interface FavPostBody {
  entity_type?: string;
  entity_id?: string;
  workspace_id?: string | null;
  label?: string | null;
  // reorder variant
  action?: "reorder";
  ordered_ids?: string[];
}

export async function POST(req: NextRequest) {
  const guard = await requireUser();
  if (guard) return guard;

  let body: FavPostBody;
  try {
    body = (await req.json()) as FavPostBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body.action === "reorder") {
    if (!Array.isArray(body.ordered_ids)) {
      return NextResponse.json(
        { error: "missing_ordered_ids" },
        { status: 400 }
      );
    }
    const res = await reorderFavorites(body.ordered_ids);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (!body.entity_type || !body.entity_id) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const res = await addFavorite({
    entityType: body.entity_type,
    entityId: body.entity_id,
    workspaceId: body.workspace_id ?? null,
    label: body.label ?? null,
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ favorite: res.favorite });
}

interface FavDeleteBody {
  entity_type?: string;
  entity_id?: string;
}

export async function DELETE(req: NextRequest) {
  const guard = await requireUser();
  if (guard) return guard;

  let body: FavDeleteBody;
  try {
    body = (await req.json()) as FavDeleteBody;
  } catch {
    // Allow query-string fallback so the star button can be wired
    // either way.
    body = {};
  }
  const { searchParams } = new URL(req.url);
  const entityType = body.entity_type ?? searchParams.get("entity_type");
  const entityId = body.entity_id ?? searchParams.get("entity_id");
  if (!entityType || !entityId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const res = await removeFavorite({ entityType, entityId });
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
