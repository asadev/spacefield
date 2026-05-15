"use client";

import { useEffect, useState, useTransition } from "react";

import { createClient as createBrowserClient } from "@/lib/supabase/client";

interface CommentRow {
  id: string;
  body: string;
  author_user_id: string;
  created_at: string;
  edited_at: string | null;
}

interface Props {
  taskId: string;
  workspaceId: string;
}

/**
 * Thin comments thread for a task. Polymorphic via
 * (entity_type='task', entity_id=taskId) per the shared collab schema.
 *
 * Reads + writes go through the browser supabase client so RLS sees
 * the user — the comments table allows authenticated workspace members
 * to insert with author_user_id = auth.uid().
 */
export default function TaskComments({ taskId, workspaceId }: Props) {
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [authed, setAuthed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createBrowserClient();
      const { data: u } = await supabase.auth.getUser();
      if (!cancelled) setAuthed(u.user?.id ?? null);
      const { data } = await supabase
        .from("comments")
        .select("id, body, author_user_id, created_at, edited_at")
        .eq("entity_type", "task")
        .eq("entity_id", taskId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!cancelled) setRows((data as CommentRow[]) ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  function submit() {
    const text = body.trim();
    if (!text || !authed) return;
    setBody("");
    startTransition(async () => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from("comments")
        .insert({
          workspace_id: workspaceId,
          entity_type: "task",
          entity_id: taskId,
          author_user_id: authed,
          body: text,
        })
        .select("id, body, author_user_id, created_at, edited_at")
        .single();
      if (!error && data) {
        setRows((prev) => [...prev, data as CommentRow]);
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        Comments
      </div>
      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="text-xs text-faint">No comments yet.</div>
        ) : (
          rows.map((c) => (
            <div
              key={c.id}
              className="rounded-md border border-app bg-app-elevated px-3 py-2"
            >
              <div className="flex items-center justify-between text-[10px] text-faint">
                <span className="font-mono">{c.author_user_id.slice(0, 8)}</span>
                <span className="font-mono">
                  {new Date(c.created_at).toISOString().replace("T", " ").slice(0, 16)}
                  {c.edited_at ? " (edited)" : ""}
                </span>
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-app">
                {c.body}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={2}
          placeholder={authed ? "Write a comment… (cmd/ctrl-enter to send)" : "Sign in to comment"}
          disabled={!authed}
          className="flex-1 resize-y rounded-md border border-app bg-app-elevated px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent disabled:opacity-60"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!authed || pending || !body.trim()}
          className="rounded-md bg-tool-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
