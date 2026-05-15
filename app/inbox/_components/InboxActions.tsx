"use client";

/* InboxActions — "Mark all read" + per-row click-to-read.
 *
 * Renders a button that POSTs to /api/notifications with { all: true,
 * kind? } and then refreshes the server route via router.refresh().
 *
 * Also exports MarkOneRead for rows in the list (click anywhere on a
 * row triggers a POST { ids: [id] }).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MarkAllReadButton({ kind }: { kind?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, kind }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="inline-flex items-center rounded-md border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app hover:border-tool-accent disabled:opacity-50"
    >
      {busy ? "Marking…" : "Mark all read"}
    </button>
  );
}

export function MarkOneReadInline({
  id,
  unread,
  children,
  href,
}: {
  id: string;
  unread: boolean;
  children: React.ReactNode;
  href: string | null;
}) {
  const router = useRouter();
  const [optimisticallyRead, setRead] = useState(false);
  const isUnread = unread && !optimisticallyRead;

  async function onClick(e: React.MouseEvent) {
    if (!unread) return;
    // Don't await — let the link navigation continue if href is set.
    setRead(true);
    void fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    }).then(() => {
      // No router.refresh when the user is navigating away; otherwise
      // refresh so other tabs/badges update.
      if (!href) router.refresh();
    });
    if (!href) {
      e.preventDefault();
    }
  }

  const className = `block cursor-pointer border-b border-app px-3 py-2.5 transition-colors last:border-b-0 hover:bg-app-elevated ${
    isUnread ? "" : "opacity-60"
  }`;

  if (href) {
    return (
      <a href={href} onClick={onClick} className={className}>
        {children}
      </a>
    );
  }
  return (
    <div onClick={onClick} className={className}>
      {children}
    </div>
  );
}
