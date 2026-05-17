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
import { withIdempotency } from "@/lib/idempotency";
import { emit, OutboxEventTypes } from "@/lib/outbox";

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

/** Stable hex digest of a string. Used to build idempotency keys from
 *  a content-derived fingerprint when the client doesn't supply an
 *  explicit Idempotency-Key header. Web Crypto so it works on edge. */
async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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

    // Idempotency: a network blip after createComment succeeds (which
    // also fans out mention notifications and emits an activity row)
    // would otherwise let the client retry and double-post the comment
    // plus double-fan-out the notifications. We accept either an
    // explicit `Idempotency-Key` header or fall back to a digest of
    // (user, entity, body, parent) so an exact-duplicate retry within
    // the cache window collapses cleanly.
    const headerKey = req.headers.get("idempotency-key") ?? "";
    const fallbackKey = `${user.id}|${entityType}|${entityId}|${parentCommentId ?? ""}|${body}`;
    const idempotencyKey = headerKey
      ? `comments-create:${user.id}:${headerKey}`
      : `comments-create:${await sha1Hex(fallbackKey)}`;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseServiceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE ||
      "";

    type CreateResp =
      | { ok: true; item: unknown }
      | { ok: false; error: string };

    try {
      const wrapped = await withIdempotency<CreateResp>(
        {
          key: idempotencyKey,
          ttl_sec: 60 * 10, // 10 min — enough for exact-dup retries, short enough that legitimate "same comment a while later" still posts
          supabase: { url: supabaseUrl, serviceRoleKey: supabaseServiceRoleKey },
        },
        async () => {
          const item = await createComment({
            workspaceId,
            entityType,
            entityId,
            authorUserId: user.id,
            body,
            mentions,
            parentCommentId,
          });
          // Mention-fanout outbox event for downstream subscribers
          // (push, email digest). The notifications rows themselves
          // are already written inside createComment — this is the
          // pub-sub hook. Dedup by comment id.
          const created = item as { id?: string; mentions?: string[] };
          if (created.id && Array.isArray(created.mentions) && created.mentions.length > 0) {
            void emit(
              OutboxEventTypes.CommentMentionFanout,
              {
                comment_id: created.id,
                workspace_id: workspaceId,
                entity_type: entityType,
                entity_id: entityId,
                mentioned: created.mentions,
                actor_user_id: user.id,
              },
              { dedupeKey: `comment-mention-fanout:${created.id}` }
            );
          }
          return { ok: true, item };
        }
      );
      if (wrapped.ok) {
        return NextResponse.json({ item: wrapped.item });
      }
      return NextResponse.json({ error: wrapped.error }, { status: 400 });
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
