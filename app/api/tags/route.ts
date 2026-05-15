import { NextResponse, type NextRequest } from "next/server";

import {
  attachTag,
  createTag,
  deleteTag,
  detachTag,
  listForEntity,
  listTags,
  updateTag,
} from "@/lib/tags";
import { createClient } from "@/lib/supabase/server";

/**
 * Workspace tag library + polymorphic links.
 *
 *   GET  /api/tags?workspace_id=…             → list workspace tags
 *   GET  /api/tags?entity_type=…&entity_id=…  → list tags on one entity
 *   POST /api/tags                            → create / attach / detach
 *   PATCH /api/tags                            → rename / recolor
 *   DELETE /api/tags?id=…                      → delete tag
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
  const workspaceId = searchParams.get("workspace_id");
  const entityType = searchParams.get("entity_type");
  const entityId = searchParams.get("entity_id");

  if (entityType && entityId) {
    const tags = await listForEntity({ entityType, entityId });
    return NextResponse.json({ tags });
  }
  if (workspaceId) {
    const tags = await listTags(workspaceId);
    return NextResponse.json({ tags });
  }
  return NextResponse.json(
    { error: "missing_workspace_id_or_entity" },
    { status: 400 }
  );
}

interface TagPostBody {
  workspace_id?: string;
  name?: string;
  color?: string | null;
  // attach / detach variants
  action?: "attach" | "detach";
  tag_id?: string;
  entity_type?: string;
  entity_id?: string;
}

export async function POST(req: NextRequest) {
  const guard = await requireUser();
  if (guard) return guard;

  let body: TagPostBody;
  try {
    body = (await req.json()) as TagPostBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body.action === "attach" || body.action === "detach") {
    if (!body.tag_id || !body.entity_type || !body.entity_id) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }
    const fn = body.action === "attach" ? attachTag : detachTag;
    const res = await fn({
      tagId: body.tag_id,
      entityType: body.entity_type,
      entityId: body.entity_id,
    });
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (!body.workspace_id || !body.name) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const res = await createTag({
    workspaceId: body.workspace_id,
    name: body.name,
    color: body.color ?? null,
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ tag: res.tag });
}

interface TagPatchBody {
  id?: string;
  name?: string;
  color?: string | null;
}

export async function PATCH(req: NextRequest) {
  const guard = await requireUser();
  if (guard) return guard;

  let body: TagPatchBody;
  try {
    body = (await req.json()) as TagPatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }
  const res = await updateTag({
    tagId: body.id,
    name: body.name,
    color: body.color,
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ tag: res.tag });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireUser();
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }
  const res = await deleteTag(id);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
