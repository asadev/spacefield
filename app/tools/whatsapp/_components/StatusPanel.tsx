"use client";

/* Status panel (EPIC-18) — schedule/post WhatsApp Status (text/image/video).
 *
 * Lazy-loaded (next/dynamic from _app) so this never inflates the initial
 * bundle. Posting always queues (status='scheduled', scheduled_at=now for
 * "Post now") and the send-runner cron drains it through the anti-ban throttle.
 * Reading others' status is out of scope.
 *
 * Mobile-first; responsive CSS only.
 */

import { useCallback, useEffect, useState } from "react";
import {
  createStatusPost,
  deleteStatusPost,
  fetchStatusPosts,
  type WaStatusPost,
} from "./api";
import {
  EmptyState,
  ErrorBlock,
  MiniIcon,
  Pill,
  PrimaryButton,
  SecondaryButton,
  formatRelative,
} from "./ui";

interface Props {
  workspaceId: string;
  compact: boolean;
}

const STATUS_TONE: Record<
  WaStatusPost["status"],
  "neutral" | "info" | "success" | "danger" | "warn"
> = {
  draft: "neutral",
  scheduled: "info",
  queued: "warn",
  sent: "success",
  failed: "danger",
};

export default function StatusPanel({ workspaceId, compact }: Props) {
  const [items, setItems] = useState<WaStatusPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetchStatusPosts(workspaceId);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setItems(res.data);
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="flex h-full flex-col bg-app">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-app bg-app-elevated px-3 py-2">
        <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
          WhatsApp Status
        </h3>
        <PrimaryButton onClick={() => setComposing(true)}>
          <MiniIcon name="plus" /> New status
        </PrimaryButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-xs text-faint">loading…</div>
        ) : error ? (
          <div className="p-3">
            <ErrorBlock body={error} onRetry={refresh} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            kicker="whatsapp.status"
            compact={compact}
            title="No status posts yet"
            body={
              <span>
                Post a text, image, or video Status to all your contacts — your
                free daily storefront. Schedule it and the runner posts it under
                the anti-ban throttle.
              </span>
            }
          />
        ) : (
          <ul role="list" className="divide-y divide-app">
            {items.map((s) => (
              <li key={s.id} className="flex items-start gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={STATUS_TONE[s.status]}>{s.status}</Pill>
                    <span className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-faint">
                      {s.kind}
                    </span>
                    {s.scheduled_at && s.status === "scheduled" ? (
                      <span className="font-mono text-[0.6rem] text-faint">
                        scheduled {formatRelative(s.scheduled_at)}
                      </span>
                    ) : null}
                    {s.sent_at ? (
                      <span className="font-mono text-[0.6rem] text-faint">
                        sent {formatRelative(s.sent_at)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm text-app">
                    {s.text_content || s.caption || s.media_url || "—"}
                  </div>
                  {s.last_error ? (
                    <div className="mt-1 text-[0.65rem] text-rose-600 dark:text-rose-300">
                      {s.last_error}
                    </div>
                  ) : null}
                </div>
                {s.status === "scheduled" || s.status === "draft" ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await deleteStatusPost(workspaceId, s.id);
                      if (res.ok) void refresh();
                    }}
                    className="shrink-0 rounded-md p-1 text-rose-500 hover:bg-rose-500/10"
                    aria-label="Delete status"
                  >
                    <MiniIcon name="trash" size={14} />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {composing ? (
        <StatusComposer
          workspaceId={workspaceId}
          onClose={() => setComposing(false)}
          onSaved={() => {
            setComposing(false);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function StatusComposer({
  workspaceId,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"text" | "image" | "video">("text");
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [bg, setBg] = useState("#075E54");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setError(null);
    if (kind === "text" && !text.trim()) {
      setError("Write some text.");
      return;
    }
    if ((kind === "image" || kind === "video") && !mediaUrl.trim()) {
      setError("Paste a media URL.");
      return;
    }
    if (when === "later" && !scheduledAt) {
      setError("Pick a time.");
      return;
    }
    setBusy(true);
    const res = await createStatusPost(workspaceId, {
      kind,
      text_content: kind === "text" ? text.trim() : undefined,
      media_url: kind === "text" ? undefined : mediaUrl.trim(),
      caption: caption.trim() || undefined,
      background_color: kind === "text" ? bg : undefined,
      scheduled_at: when === "later" ? new Date(scheduledAt).toISOString() : null,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
  }, [workspaceId, kind, text, mediaUrl, caption, bg, when, scheduledAt, onSaved]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-app bg-app-elevated shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-app px-4 py-3">
          <h3 className="text-base font-semibold text-app">New WhatsApp Status</h3>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <div className="flex gap-1.5">
            {(["text", "image", "video"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs capitalize ${
                  kind === k
                    ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                    : "border-app text-secondary hover:bg-surface"
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          {kind === "text" ? (
            <>
              <label className="block">
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
                  Text
                </span>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  placeholder="New arrivals just dropped! 🧵 DM to order."
                  className="mt-1 w-full resize-y rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-secondary">
                Background
                <input
                  type="color"
                  value={bg}
                  onChange={(e) => setBg(e.target.value)}
                  className="h-7 w-12 rounded border border-app bg-surface"
                />
              </label>
            </>
          ) : (
            <>
              <label className="block">
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
                  {kind === "image" ? "Image URL" : "Video URL"}
                </span>
                <input
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://…"
                  className="mt-1 w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
                  Caption (optional)
                </span>
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="mt-1 w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
                />
              </label>
            </>
          )}

          <div>
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
              When
            </span>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setWhen("now")}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  when === "now"
                    ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                    : "border-app text-secondary hover:bg-surface"
                }`}
              >
                Post now
              </button>
              <button
                type="button"
                onClick={() => setWhen("later")}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  when === "later"
                    ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                    : "border-app text-secondary hover:bg-surface"
                }`}
              >
                Schedule
              </button>
              {when === "later" ? (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="rounded-md border border-app bg-surface px-2 py-1 text-xs text-app outline-none focus:border-tool-accent"
                />
              ) : null}
            </div>
            <p className="mt-1 text-[0.6rem] text-faint">
              Posted through the anti-ban throttle on the next runner tick.
            </p>
          </div>

          {error ? <ErrorBlock body={error} /> : null}
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-app px-4 py-3">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} loading={busy}>
            {when === "later" ? "Schedule" : "Queue status"}
          </PrimaryButton>
        </footer>
      </div>
    </div>
  );
}
