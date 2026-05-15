import { NextResponse, type NextRequest } from "next/server";

import { withApiHandler } from "@/lib/api-wrap";
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
 *
 * Hardening (V-3): each verb is wrapped in withApiHandler with a
 * separate rate-limit bucket. POST/PATCH additionally cap mentions at
 * 10 per comment so a single create can't fan out a notification storm.
 */

const MAX_MENTIONS = 10;

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

// Resolved 2026-05-15: keep V-3's withApiHandler wrapper (rate-limit
// + error-log via lib/api-wrap) and layer V-5's safeErrorMessage so
// production responses don't leak raw DB error strings.
export const GET = withApiHandler(
  async (req: NextRequest) => {
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
  },
  { source: "comments.list", rateLimit: { count: 120, window_sec: 60 } }
);

export const POST = withApiHandler(
  async (req: NextRequest) => {
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
    const mentionsRaw = Array.isArray(payload.mentions)
      ? (payload.mentions as unknown[]).map(String)
      : [];
    if (mentionsRaw.length > MAX_MENTIONS) {
      return NextResponse.json(
        { error: "too_many_mentions", max: MAX_MENTIONS },
        { status: 400 }
      );
    }
    const mentions = mentionsRaw;
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
  },
  { source: "comments.create", rateLimit: { count: 30, window_sec: 60 } }
);

export const PATCH = withApiHandler(
  async (req: NextRequest) => {
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
    const mentionsRaw = Array.isArray(payload.mentions)
      ? (payload.mentions as unknown[]).map(String)
      : [];
    if (mentionsRaw.length > MAX_MENTIONS) {
      return NextResponse.json(
        { error: "too_many_mentions", max: MAX_MENTIONS },
        { status: 400 }
      );
    }
    const mentions = mentionsRaw;
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
  },
  { source: "comments.update", rateLimit: { count: 30, window_sec: 60 } }
);

export const DELETE = withApiHandler(
  async (req: NextRequest) => {
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
  },
  { source: "comments.delete", rateLimit: { count: 30, window_sec: 60 } }
);
