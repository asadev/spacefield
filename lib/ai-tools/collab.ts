/* AI tools — collab (notifications + comments + activity).
 *
 * Surfaces the cross-cutting collab primitives to the agent runtime
 * as a SkillDefinition. Mirrors the shape of `lib/agent/skills/*` so
 * if the agent index ever wants to register this skill it can drop
 * in directly:
 *
 *   import { collabSkill } from "@/lib/ai-tools/collab";
 *   ALL_SKILLS.push(collabSkill);
 *
 * All tool implementations use `ctx.supabase` (RLS-scoped) for reads
 * + mark-read. Writes that need to bypass RLS (creating notifications
 * during comment fan-out) go through the lib helpers, which use the
 * service-role client internally with the calling user as `actor`.
 */

import { clampList, toolError, toolOk } from "@/lib/agent/skills/_helpers";
import { createComment } from "@/lib/collab/comments";
import type {
  SkillDefinition,
  ToolDefinition,
} from "@/lib/agent/runtime/types";

const list_my_notifications: ToolDefinition = {
  name: "list_my_notifications",
  description:
    "List the caller's notifications (most recent first). Use this to answer 'what's in my inbox' / 'who tagged me'.",
  input_schema: {
    type: "object",
    properties: {
      unread_only: { type: "boolean" },
      limit: { type: "number" },
    },
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { unread_only, limit } = input as {
      unread_only?: boolean;
      limit?: number;
    };
    let q = ctx.supabase
      .from("notifications")
      .select(
        "id, kind, title, body, href, read_at, archived_at, created_at, source_entity_type, source_entity_id"
      )
      .eq("recipient_user_id", ctx.userId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit ?? 20, 50));
    if (unread_only) q = q.is("read_at", null);
    const { data, error } = await q;
    if (error) return toolError(error.message);
    return toolOk(clampList(data ?? [], 50));
  },
};

const mark_notification_read: ToolDefinition = {
  name: "mark_notification_read",
  description:
    "Mark a notification as read by id. Use after the user has acknowledged it.",
  input_schema: {
    type: "object",
    properties: { notification_id: { type: "string" } },
    required: ["notification_id"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const { notification_id } = input as { notification_id: string };
    if (!notification_id) return toolError("missing notification_id");
    const { error } = await ctx.supabase.rpc("notification_mark_read", {
      p_id: notification_id,
    });
    if (error) return toolError(error.message);
    return toolOk({ id: notification_id, read: true });
  },
};

const post_comment: ToolDefinition = {
  name: "post_comment",
  description:
    "Post a comment on any entity in the current workspace. Accepts mentions as an array of user ids; the body itself can also contain `@<uuid>` tokens that will be parsed as mentions.",
  input_schema: {
    type: "object",
    properties: {
      entity_type: { type: "string" },
      entity_id: { type: "string" },
      body: { type: "string" },
      mentions: { type: "array", items: { type: "string" } },
      parent_comment_id: { type: "string" },
    },
    required: ["entity_type", "entity_id", "body"],
    additionalProperties: false,
  },
  read_only: false,
  execute: async (input, ctx) => {
    const { entity_type, entity_id, body, mentions, parent_comment_id } =
      input as {
        entity_type: string;
        entity_id: string;
        body: string;
        mentions?: string[];
        parent_comment_id?: string;
      };
    if (!entity_type || !entity_id || !body?.trim()) {
      return toolError("missing entity_type, entity_id, or body");
    }
    try {
      const item = await createComment({
        workspaceId: ctx.workspaceId,
        entityType: entity_type,
        entityId: entity_id,
        authorUserId: ctx.userId,
        body: body.trim(),
        mentions: mentions ?? [],
        parentCommentId: parent_comment_id ?? null,
      });
      return toolOk(item);
    } catch (e) {
      return toolError(e instanceof Error ? e.message : "create_failed");
    }
  },
};

const list_activity_for: ToolDefinition = {
  name: "list_activity_for",
  description:
    "List the activity timeline for a specific entity (most recent first). Use this to answer 'what happened with X'.",
  input_schema: {
    type: "object",
    properties: {
      entity_type: { type: "string" },
      entity_id: { type: "string" },
      limit: { type: "number" },
    },
    required: ["entity_type", "entity_id"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { entity_type, entity_id, limit } = input as {
      entity_type: string;
      entity_id: string;
      limit?: number;
    };
    const { data, error } = await ctx.supabase
      .from("activities")
      .select(
        "id, workspace_id, actor_user_id, verb, entity_type, entity_id, payload, created_at"
      )
      .eq("entity_type", entity_type)
      .eq("entity_id", entity_id)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit ?? 25, 100));
    if (error) return toolError(error.message);
    return toolOk(clampList(data ?? [], 100));
  },
};

const summarize_thread: ToolDefinition = {
  name: "summarize_thread",
  description:
    "Fetch the full comment thread + activity timeline for an entity and return a context block formatted for an LLM to summarise. Use this when the user asks 'what's going on with X'.",
  input_schema: {
    type: "object",
    properties: {
      entity_type: { type: "string" },
      entity_id: { type: "string" },
    },
    required: ["entity_type", "entity_id"],
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { entity_type, entity_id } = input as {
      entity_type: string;
      entity_id: string;
    };

    const [commentsRes, activityRes] = await Promise.all([
      ctx.supabase
        .from("comments")
        .select(
          "id, author_user_id, body, mentions, parent_comment_id, created_at"
        )
        .eq("entity_type", entity_type)
        .eq("entity_id", entity_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(100),
      ctx.supabase
        .from("activities")
        .select("id, actor_user_id, verb, payload, created_at")
        .eq("entity_type", entity_type)
        .eq("entity_id", entity_id)
        .order("created_at", { ascending: true })
        .limit(100),
    ]);

    if (commentsRes.error) return toolError(commentsRes.error.message);
    if (activityRes.error) return toolError(activityRes.error.message);

    const comments = commentsRes.data ?? [];
    const activity = activityRes.data ?? [];
    const merged = [
      ...comments.map((c) => ({
        kind: "comment" as const,
        at: c.created_at as string,
        actor: c.author_user_id as string,
        text: c.body as string,
      })),
      ...activity.map((a) => ({
        kind: "activity" as const,
        at: a.created_at as string,
        actor: (a.actor_user_id as string | null) ?? "system",
        text: `${a.verb}${
          a.payload && typeof a.payload === "object"
            ? ` ${JSON.stringify(a.payload)}`
            : ""
        }`,
      })),
    ].sort((a, b) => a.at.localeCompare(b.at));

    const lines = merged.map(
      (e) => `[${e.at}] (${e.kind}) ${e.actor}: ${e.text}`
    );
    return toolOk({
      entity_type,
      entity_id,
      comment_count: comments.length,
      activity_count: activity.length,
      timeline: lines.join("\n"),
    });
  },
};

/** Alias requested in the brief — same as summarize_thread. */
const ask_about_thread: ToolDefinition = {
  ...summarize_thread,
  name: "ask_about_thread",
  description:
    "Same as summarize_thread — fetches the thread + activity timeline for an entity and returns a formatted context block. Kept as a separate name because callers ask 'tell me about this' and that phrasing hints at this tool.",
};

export const collabSkill: SkillDefinition = {
  id: "collab",
  label: "Collab",
  description:
    "Read the caller's inbox, post comments on any entity, summarise threads, list activity for any record.",
  systemFragment:
    "Comments, notifications, and activity are workspace-scoped. Use list_my_notifications to answer 'what's in my inbox'. Use post_comment to add a comment on any entity (entity_type is the table name, snake_case; entity_id is the row uuid). Use list_activity_for or summarize_thread when asked 'what happened with X' or 'tell me about X'. Mentions can be passed as user-id strings; tag fan-out is automatic.",
  tools: [
    list_my_notifications,
    mark_notification_read,
    post_comment,
    list_activity_for,
    summarize_thread,
    ask_about_thread,
  ],
};

export default collabSkill;
