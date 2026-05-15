import { NextResponse, type NextRequest } from "next/server";

import {
  createComment,
  listComments,
  softDeleteComment,
  updateCommentBody,
} from "@/lib/collab/comments";
import { safeErrorMessage } from "@/lib/safe-error";
import { createClient } from "@/lib/supabase/server";

/* /api/comments — polymorphic thread API.
 *
 * GET   ?entity_type=task&entity_id=<uuid>
 *   List all non-deleted comments on the entity (RLS gates visibility).
 *
 * POST  { workspace_id, entity_type, entity_id, body, mentions[]?,
 *         parent_comment_id? }
 *   Create a new comment as the calling user. mention fan-out to
 *   notifications + activity_emit happen in lib/collab/comments.ts.
 *
 * PATCH { comment_id, body, mentions[]? }
 *   Edit your own comment. RLS allows update only when
 *   author_user_id = auth.uid().
 *
 * DELETE ?comment_id=<uuid>
 *   Soft-delete your own comment.
 */

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const entityType = req.nextUrl.searchParams.get("entity_type");
  const entityId = req.nextUrl.searchParams.get("entity_id");
  if (!entityType || !entityId) {
    return NextResponse.json(
      { error: "missing entity_type or entity_id" },
      { status: 400 }
    );
  }
  try {
    const items = await listComments({ entityType, entityId });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "comments.list",
          userId: user.id,
          fallback: "list_failed",
        }),
      },
      { status: 400 }
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const workspaceId = String(payload.workspace_id ?? "");
  const entityType = String(payload.entity_type ?? "");
  const entityId = String(payload.entity_id ?? "");
  const body = String(payload.body ?? "").trim();
  const mentions = Array.isArray(payload.mentions)
    ? (payload.mentions as unknown[]).map(String)
    : [];
  const parentCommentId =
    typeof payload.parent_comment_id === "string"
      ? (payload.parent_comment_id as string)
      : null;

  if (!workspaceId || !entityType || !entityId || !body) {
    return NextResponse.json(
      { error: "missing workspace_id, entity_type, entity_id, or body" },
      { status: 400 }
    );
  }
  if (body.length > 8_000) {
    return NextResponse.json({ error: "body_too_long" }, { status: 400 });
  }

  try {
    const item = await createComment({
      workspaceId,
      entityType,
      entityId,
      authorUserId: user.id,
      body,
      mentions,
      parentCommentId,
    });
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "comments.create",
          userId: user.id,
          fallback: "create_failed",
        }),
      },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const commentId = String(payload.comment_id ?? "");
  const body = String(payload.body ?? "").trim();
  const mentions = Array.isArray(payload.mentions)
    ? (payload.mentions as unknown[]).map(String)
    : [];
  if (!commentId || !body) {
    return NextResponse.json(
      { error: "missing comment_id or body" },
      { status: 400 }
    );
  }
  if (body.length > 8_000) {
    return NextResponse.json({ error: "body_too_long" }, { status: 400 });
  }
  try {
    const item = await updateCommentBody({
      commentId,
      byUserId: user.id,
      body,
      mentions,
    });
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "comments.update",
          userId: user.id,
          fallback: "update_failed",
        }),
      },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const commentId = req.nextUrl.searchParams.get("comment_id");
  if (!commentId) {
    return NextResponse.json(
      { error: "missing comment_id" },
      { status: 400 }
    );
  }
  try {
    await softDeleteComment(commentId, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "comments.delete",
          userId: user.id,
          fallback: "delete_failed",
        }),
      },
      { status: 400 }
    );
  }
}
