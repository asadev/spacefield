"use client";

/* CommentsThread — polymorphic comment thread.
 *
 * Renders a flat list (one level of nesting for replies) of comments on
 * (entityType, entityId), with a composer at the bottom. Optimistic
 * appends on submit; on error, reverts and surfaces a small message
 * under the composer.
 *
 * The component is intentionally self-contained: it fetches its own
 * data from /api/comments, so a host page can just drop
 *   <CommentsThread entityType="task" entityId={id} … />
 * and not worry about wiring loaders.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { pushUndo } from "@/lib/undo";
import { toast } from "@/lib/toast";

import MentionInput, { type MentionMember } from "./MentionInput";

interface Author {
  user_id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export interface CommentItem {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  author_user_id: string;
  body: string;
  mentions: string[];
  parent_comment_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  author?: Author | null;
}

interface Props {
  entityType: string;
  entityId: string;
  currentUserId: string;
  workspaceId: string;
  /** Optional members for the mention dropdown when /api/people is
   *  unavailable. */
  members?: MentionMember[];
}

export default function CommentsThread({
  entityType,
  entityId,
  currentUserId,
  workspaceId,
  members,
}: Props) {
  const [items, setItems] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyMentions, setReplyMentions] = useState<string[]>([]);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/comments?entity_type=${encodeURIComponent(
          entityType
        )}&entity_id=${encodeURIComponent(entityId)}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as { items?: CommentItem[]; error?: string };
      if (!res.ok) {
        setError(json.error ?? "failed_to_load");
        return;
      }
      setItems(json.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "network_error");
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  async function submitTop() {
    const trimmed = body.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    const optimistic: CommentItem = {
      id: `optimistic-${Date.now()}`,
      workspace_id: workspaceId,
      entity_type: entityType,
      entity_id: entityId,
      author_user_id: currentUserId,
      body: trimmed,
      mentions,
      parent_comment_id: null,
      edited_at: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
      author: null,
    };
    setItems((prev) => [...prev, optimistic]);
    setBody("");
    setMentions([]);

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          entity_type: entityType,
          entity_id: entityId,
          body: trimmed,
          mentions,
        }),
      });
      const json = (await res.json()) as { item?: CommentItem; error?: string };
      if (!res.ok || !json.item) {
        throw new Error(json.error ?? "create_failed");
      }
      // Replace the optimistic entry with the canonical row.
      setItems((prev) =>
        prev.map((c) => (c.id === optimistic.id ? json.item! : c))
      );
      // Profile join isn't in the POST response, so re-fetch in the
      // background to pick up author metadata. Non-blocking.
      void fetchItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "create_failed");
      setItems((prev) => prev.filter((c) => c.id !== optimistic.id));
      setBody(trimmed);
    } finally {
      setBusy(false);
    }
  }

  async function submitReply(parentId: string) {
    const trimmed = replyBody.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          entity_type: entityType,
          entity_id: entityId,
          body: trimmed,
          mentions: replyMentions,
          parent_comment_id: parentId,
        }),
      });
      const json = (await res.json()) as { item?: CommentItem; error?: string };
      if (!res.ok || !json.item) {
        throw new Error(json.error ?? "create_failed");
      }
      setReplyBody("");
      setReplyMentions([]);
      setReplyTo(null);
      await fetchItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "create_failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteComment(commentId: string) {
    // No native confirm here — the Undo snackbar gives the user a 5-second
    // window to recover from an accidental click, which is friendlier
    // than a modal interrupting flow for an ordinary edit.
    const target = items.find((c) => c.id === commentId);
    if (!target) return;
    // Optimistic remove
    setItems((prev) => prev.filter((c) => c.id !== commentId));
    try {
      const res = await fetch(
        `/api/comments?comment_id=${encodeURIComponent(commentId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "delete_failed");
      }
      pushUndo("Comment deleted.", async () => {
        try {
          const restoreRes = await fetch("/api/trash", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "restore",
              entity_type: "comment",
              entity_id: commentId,
              workspace_id: workspaceId,
            }),
          });
          if (!restoreRes.ok) throw new Error("restore_failed");
          // Re-insert the comment in its original slot.
          setItems((prev) => {
            if (prev.some((c) => c.id === commentId)) return prev;
            return [...prev, { ...target, deleted_at: null }];
          });
          toast.success("Comment restored.");
        } catch {
          toast.error("Couldn't restore the comment.");
        }
      });
    } catch (e) {
      // Roll back the optimistic remove on a network/API failure.
      setItems((prev) =>
        prev.some((c) => c.id === commentId) ? prev : [...prev, target]
      );
      setError(e instanceof Error ? e.message : "delete_failed");
    }
  }

  // Group: top-level + nested. We do one level only — replies-to-replies
  // get rendered as siblings to keep the UI readable.
  const { topLevel, repliesByParent } = useMemo(() => {
    const top: CommentItem[] = [];
    const replies: Record<string, CommentItem[]> = {};
    for (const c of items) {
      if (c.parent_comment_id) {
        const k = c.parent_comment_id;
        replies[k] = replies[k] ? [...replies[k], c] : [c];
      } else {
        top.push(c);
      }
    }
    return { topLevel: top, repliesByParent: replies };
  }, [items]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="text-xs text-muted">Loading comments…</div>
        ) : topLevel.length === 0 ? (
          <div className="rounded-md border border-dashed border-app bg-app-elevated px-3 py-4 text-center text-xs text-muted">
            No comments yet. Start the thread below.
          </div>
        ) : (
          topLevel.map((c) => (
            <div key={c.id} className="flex flex-col gap-2">
              <CommentRow
                comment={c}
                isAuthor={c.author_user_id === currentUserId}
                onReply={() => {
                  setReplyTo(c.id);
                  setReplyBody("");
                  setReplyMentions([]);
                }}
                onDelete={() => deleteComment(c.id)}
              />
              {(repliesByParent[c.id] ?? []).map((r) => (
                <div key={r.id} className="ms-8">
                  <CommentRow
                    comment={r}
                    isAuthor={r.author_user_id === currentUserId}
                    onDelete={() => deleteComment(r.id)}
                  />
                </div>
              ))}
              {replyTo === c.id && (
                <div className="ms-8">
                  <MentionInput
                    value={replyBody}
                    mentions={replyMentions}
                    onChange={(n) => {
                      setReplyBody(n.value);
                      setReplyMentions(n.mentions);
                    }}
                    workspaceId={workspaceId}
                    members={members}
                    placeholder={`Reply to ${displayNameFor(c.author)}…`}
                    rows={2}
                    disabled={busy}
                    onSubmit={() => void submitReply(c.id)}
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void submitReply(c.id)}
                      disabled={busy || !replyBody.trim()}
                      className="inline-flex items-center rounded-md bg-tool-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      Reply
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplyTo(null)}
                      className="text-xs text-muted hover:text-app"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-app pt-3">
        <MentionInput
          value={body}
          mentions={mentions}
          onChange={(n) => {
            setBody(n.value);
            setMentions(n.mentions);
          }}
          workspaceId={workspaceId}
          members={members}
          disabled={busy}
          onSubmit={() => void submitTop()}
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="text-[0.6rem] uppercase tracking-[0.15em] text-faint">
            Cmd/Ctrl+Enter to post
          </div>
          <button
            type="button"
            onClick={() => void submitTop()}
            disabled={busy || !body.trim()}
            className="inline-flex items-center rounded-md bg-tool-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {busy ? "Posting…" : "Post comment"}
          </button>
        </div>
        {error && (
          <div className="mt-2 text-xs text-red-500">Error: {error}</div>
        )}
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  isAuthor,
  onReply,
  onDelete,
}: {
  comment: CommentItem;
  isAuthor: boolean;
  onReply?: () => void;
  onDelete?: () => void;
}) {
  const name = displayNameFor(comment.author);
  const initials = name.trim().slice(0, 1).toUpperCase();
  return (
    <div className="flex items-start gap-3 rounded-md border border-app bg-app-elevated px-3 py-2">
      {comment.author?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={comment.author.avatar_url}
          alt=""
          width={28}
          height={28}
          className="shrink-0 rounded-full border border-app object-cover"
        />
      ) : (
        <div
          className="shrink-0 rounded-full border border-app bg-app text-center text-[10px] font-semibold text-secondary"
          style={{ width: 28, height: 28, lineHeight: "28px" }}
        >
          {initials}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-xs">
          <span className="font-medium text-app">{name}</span>
          <span className="text-[0.6rem] uppercase tracking-[0.15em] text-faint">
            {relativeTime(comment.created_at)}
          </span>
          {comment.edited_at && (
            <span className="text-[0.55rem] text-faint">(edited)</span>
          )}
        </div>
        <div className="mt-1 whitespace-pre-wrap break-words text-sm text-app">
          {renderBody(comment.body)}
        </div>
        <div className="mt-1.5 flex items-center gap-3 text-[0.6rem] text-muted">
          {onReply && (
            <button
              type="button"
              onClick={onReply}
              className="uppercase tracking-[0.15em] hover:text-app"
            >
              Reply
            </button>
          )}
          {isAuthor && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="uppercase tracking-[0.15em] hover:text-red-500"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function displayNameFor(author: Author | null | undefined): string {
  if (!author) return "Member";
  return author.full_name || author.username || "Member";
}

/** Render the body with `@token` chips. We don't try to resolve the
 *  uuid form back to a display name — the host page can pass a member
 *  map if it wants prettier rendering. */
function renderBody(body: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /@([\w.-]+)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m.index > lastIndex) {
      parts.push(body.slice(lastIndex, m.index));
    }
    parts.push(
      <span
        key={`m-${m.index}`}
        className="rounded-sm bg-tool-accent-soft px-1 text-tool-accent"
      >
        @{m[1]}
      </span>
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < body.length) parts.push(body.slice(lastIndex));
  return parts;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
