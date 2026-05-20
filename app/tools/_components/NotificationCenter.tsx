"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

/* Notification kinds we colour-code locally. The server can emit any
 * kind string; anything we don't recognise falls back to "info". */
type NotificationKind = "info" | "insight" | "release";

interface Notification {
  id: string;
  title: string;
  body: string;
  kind: NotificationKind;
  href: string | null;
  read: boolean;
  createdAt: number; // epoch ms
}

/* Raw row shape returned by GET /api/notifications. */
interface ApiItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  created_at: string;
}

function normaliseKind(k: string): NotificationKind {
  if (k === "insight" || k === "release") return k;
  return "info";
}

function rowToNotification(r: ApiItem): Notification {
  return {
    id: r.id,
    title: r.title,
    body: r.body ?? "",
    kind: normaliseKind(r.kind),
    href: r.href,
    read: r.read,
    createdAt: Date.parse(r.created_at) || Date.now(),
  };
}

function relativeTime(then: number, now: number): string {
  const diff = Math.max(0, now - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(then).toLocaleDateString();
}

/* Right-side slide-in panel modeled on macOS Notification Center.
 * Anchored under the 32px TopBar (h-8), 360px wide, full remaining height.
 *
 * Data source: GET /api/notifications (latest 30 rows for auth.uid()).
 * Marking read: POST /api/notifications/mark-read with { id }.
 * The previous localStorage demo seed was a placeholder pre-API and has
 * been removed (qa-d-notif-fake-seed). */
export default function NotificationCenter({ open, onClose }: Props) {
  const [items, setItems] = useState<Notification[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());

  // Fetch the inbox each time the panel opens. Cheap (latest 30 rows)
  // and avoids stale data when notifications arrive while the panel is
  // closed. We don't poll here — bell badge owns that elsewhere.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setHydrated(false);
    void (async () => {
      try {
        const res = await fetch("/api/notifications?limit=30", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!cancelled) {
            setItems([]);
            setHydrated(true);
          }
          return;
        }
        const data = (await res.json()) as { items?: ApiItem[] };
        if (cancelled) return;
        const rows = Array.isArray(data.items) ? data.items : [];
        setItems(rows.map(rowToNotification));
        setHydrated(true);
      } catch {
        if (!cancelled) {
          setItems([]);
          setHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Tick the relative-time clock once a minute so labels stay fresh while
  // the panel is open. Cheap and bounded.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [open]);

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* Mark a single notification read on the server, then optimistically
   * remove it from the visible list. If the server call fails (offline,
   * 401, race), we leave the row visible so the user can try again. */
  const dismiss = useCallback(async (id: string) => {
    // Optimistic: hide it. Restore if the API call fails.
    const previous = items;
    setItems((prev) => prev.filter((n) => n.id !== id));
    try {
      const res = await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        setItems(previous);
      }
    } catch {
      setItems(previous);
    }
  }, [items]);

  const clearAll = useCallback(async () => {
    const previous = items;
    setItems([]);
    try {
      const res = await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id: "all" }),
      });
      if (!res.ok) {
        setItems(previous);
      }
    } catch {
      setItems(previous);
    }
  }, [items]);

  // Visible (unread) sorted newest first. Read items don't appear in
  // the center — they're history, surfaced in /inbox.
  const visible = useMemo(
    () => items.filter((n) => !n.read).sort((a, b) => b.createdAt - a.createdAt),
    [items],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[80]"
          role="dialog"
          aria-label="Notification Center"
          aria-modal="true"
        >
          {/* Backdrop — click to dismiss. Semi-transparent + blur so the
           * desktop is still legible behind it. */}
          <button
            type="button"
            aria-label="Close Notification Center"
            onClick={onClose}
            className="absolute inset-0 cursor-default backdrop-blur-sm"
            style={{ background: "rgba(15, 23, 42, 0.28)" }}
          />

          {/* Panel — slides in from the right, anchored under the 32px
           * TopBar. 360px wide, full remaining height. */}
          <motion.aside
            initial={{ x: 380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 380, opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            className="sf-glass-window absolute right-0 top-8 flex h-[calc(100dvh-2rem)] w-[360px] max-w-[92vw] flex-col border-l"
            aria-label="Notifications"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-app px-5 py-3">
              <div>
                <div className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                  Notification Center
                </div>
                <div className="mt-0.5 text-base font-semibold text-app">
                  Today
                </div>
              </div>
              <div className="flex items-center gap-1">
                {hydrated && visible.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void clearAll()}
                    className="rounded-md px-2 py-1 text-[11px] text-secondary hover:bg-surface hover:text-app transition-colors"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close Notification Center"
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-app text-secondary hover:bg-surface hover:text-app transition-colors"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Body — stack of cards or empty state */}
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {!hydrated ? null : visible.length === 0 ? (
                <EmptyState />
              ) : (
                <ul className="space-y-2">
                  <AnimatePresence initial={false}>
                    {visible.map((n) => (
                      <NotificationCard
                        key={n.id}
                        notification={n}
                        now={now}
                        onDismiss={() => void dismiss(n.id)}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>

            {/* Footer hint */}
            <div className="border-t border-app px-5 py-2 text-center text-[10px] text-faint">
              Press{" "}
              <kbd className="rounded border border-app bg-surface px-1.5 py-0.5 font-sans text-[10px]">
                Esc
              </kbd>{" "}
              to close
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ───────────── Card ───────────── */

function NotificationCard({
  notification,
  now,
  onDismiss,
}: {
  notification: Notification;
  now: number;
  onDismiss: () => void;
}) {
  const time = relativeTime(notification.createdAt, now);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="group relative rounded-xl border border-app bg-app p-3 shadow-sm hover:border-app-hover transition-colors"
    >
      <div className="flex gap-3">
        <KindIcon kind={notification.kind} />
        <div className="min-w-0 flex-1 pr-5">
          <div className="flex items-baseline justify-between gap-2">
            <div className="truncate text-[0.78rem] font-semibold text-app">
              {notification.title}
            </div>
            <div className="shrink-0 text-[10px] text-faint tabular-nums">
              {time}
            </div>
          </div>
          <div className="mt-0.5 text-[0.75rem] leading-snug text-secondary">
            {notification.body}
          </div>
        </div>
      </div>
      {/* Mark-read × — visible on hover/focus. Always reachable for keyboard. */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Mark ${notification.title} read`}
        className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-faint opacity-0 transition-all hover:bg-surface hover:text-app focus:opacity-100 group-hover:opacity-100"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </motion.li>
  );
}

function KindIcon({ kind }: { kind: NotificationKind }) {
  // One foundation-token swatch per kind. Subtle so the card itself stays
  // neutral — only the badge carries colour.
  const conf = {
    info: {
      path: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 5a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5zm1.25 11h-2.5v-7h2.5v7z",
      tone: "bg-blue-500/15 text-blue-400 dark:text-blue-300",
    },
    insight: {
      path: "M3 17l6-6 4 4 8-8v4h2V3h-8v2h4l-6 6-4-4-8 8 2 2z",
      tone: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-300",
    },
    release: {
      path: "M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4zm-1 13l-4-4 1.4-1.4L11 12.2l5.6-5.6L18 8l-7 7z",
      tone: "bg-violet-500/15 text-violet-500 dark:text-violet-300",
    },
  }[kind];
  return (
    <span
      aria-hidden="true"
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${conf.tone}`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d={conf.path} />
      </svg>
    </span>
  );
}

/* ───────────── Empty state ───────────── */

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center rounded-2xl border border-app bg-surface text-muted"
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 01-3.4 0" />
        </svg>
      </span>
      <div className="mt-4 text-sm font-medium text-app">
        You&rsquo;re all caught up.
      </div>
      <div className="mt-1 text-[11px] text-muted">
        New notifications will appear here.
      </div>
    </div>
  );
}
