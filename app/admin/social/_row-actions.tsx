"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Inlined to avoid pulling the server-only ../_lib through this client
// component (its imports include server-only modules).
const buttonGhostClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent disabled:opacity-50";

/* Per-row action group on /admin/social. Each button hits one of the
 * /api/admin/social/* endpoints and refreshes the server component on
 * success. Kept minimal — no inline edit dialog yet (clicking Edit
 * scrolls to the composer is a v2 polish).
 */

type Channel = "facebook" | "instagram";
type Status = "draft" | "scheduled" | "publishing" | "published" | "failed";

export default function RowActions({
  id,
  status,
  // The remaining props will be wired to a "Load into composer" flow
  // once edit-in-place ships. Accepting them now keeps the page.tsx
  // call shape stable.
  channel: _channel,
  body: _body,
  linkUrl: _linkUrl,
  scheduledAt: _scheduledAt,
  attachmentIds: _attachmentIds,
}: {
  id: string;
  status: Status;
  channel: Channel;
  body: string;
  linkUrl: string | null;
  scheduledAt: string | null;
  attachmentIds: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = async (
    label: string,
    fn: () => Promise<Response>
  ): Promise<void> => {
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(j.error ?? `${label} failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onPublishNow = () =>
    run("publish", () =>
      fetch("/api/admin/social/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
    );

  const onDelete = () => {
    if (!window.confirm("Delete this post from the admin panel? This does not unpublish it from Meta.")) {
      return;
    }
    return run("delete", () =>
      fetch("/api/admin/social/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
    );
  };

  const onRefreshInsights = () =>
    run("refresh insights", () =>
      fetch("/api/admin/social/refresh-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
    );

  const canPublish =
    status === "draft" || status === "scheduled" || status === "failed";
  const canRefresh = status === "published";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1">
        {canPublish && (
          <button
            type="button"
            onClick={onPublishNow}
            disabled={pending}
            className={buttonGhostClass}
          >
            Publish
          </button>
        )}
        {canRefresh && (
          <button
            type="button"
            onClick={onRefreshInsights}
            disabled={pending}
            className={buttonGhostClass}
          >
            Refresh insights
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className={buttonGhostClass}
        >
          Delete
        </button>
      </div>
      {error && (
        <span className="text-[10px] text-red-500 max-w-[260px] text-right">
          {error}
        </span>
      )}
    </div>
  );
}
