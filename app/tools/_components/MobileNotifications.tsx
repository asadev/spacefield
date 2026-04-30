"use client";

/* MobileNotifications — top-edge slide-down sheet that mirrors iOS's
 * Notification Center. Reads/writes the same workspace-scoped storage
 * key as NotificationCenter so dismissals stay in sync between shells.
 *
 * v1: same seed list as NotificationCenter, full-width cards, tap-x to
 * dismiss, drag-down-to-close gesture on the sheet.
 */

import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceKey } from "./useWorkspaces";

const STORAGE_SUFFIX = "tools-desktop-notifications-v1";
const EASE = [0.25, 0.46, 0.45, 0.94] as const;

type NotificationKind = "info" | "insight" | "release";

interface Notification {
  id: string;
  title: string;
  body: string;
  kind: NotificationKind;
  createdAt: number;
  dismissed: boolean;
}

function defaultNotifications(now: number): Notification[] {
  return [
    {
      id: "welcome",
      title: "Welcome to your workspace",
      body: "Tap an app on the home screen to get started.",
      kind: "info",
      createdAt: now - 2 * 60 * 1000,
      dismissed: false,
    },
    {
      id: "market-pulse-jvc",
      title: "Market Pulse",
      body: "JVC yields are up 0.4% week-over-week.",
      kind: "insight",
      createdAt: now - 60 * 60 * 1000,
      dismissed: false,
    },
    {
      id: "release-neighborhood-2",
      title: "New tool available",
      body: "Neighborhood Report 2.0 just shipped — give it a spin.",
      kind: "release",
      createdAt: now - 3 * 60 * 60 * 1000,
      dismissed: false,
    },
  ];
}

function loadNotifications(storageKey: string): Notification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (n): n is Notification =>
            n &&
            typeof n.id === "string" &&
            typeof n.title === "string" &&
            typeof n.body === "string" &&
            (n.kind === "info" || n.kind === "insight" || n.kind === "release") &&
            typeof n.createdAt === "number" &&
            typeof n.dismissed === "boolean"
        );
      }
    }
  } catch {}
  return defaultNotifications(Date.now());
}

function saveNotifications(storageKey: string, list: Notification[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(list));
  } catch {}
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

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function MobileNotifications({ open, onClose }: Props) {
  const STORAGE_KEY = useWorkspaceKey(STORAGE_SUFFIX);
  const [items, setItems] = useState<Notification[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    setItems(loadNotifications(STORAGE_KEY));
    setHydrated(true);
  }, [STORAGE_KEY]);

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const dismiss = useCallback(
    (id: string) => {
      setItems((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, dismissed: true } : n));
        saveNotifications(STORAGE_KEY, next);
        return next;
      });
    },
    [STORAGE_KEY]
  );

  const clearAll = useCallback(() => {
    setItems((prev) => {
      const next = prev.map((n) => ({ ...n, dismissed: true }));
      saveNotifications(STORAGE_KEY, next);
      return next;
    });
  }, [STORAGE_KEY]);

  const visible = useMemo(
    () => items.filter((n) => !n.dismissed).sort((a, b) => b.createdAt - a.createdAt),
    [items]
  );

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y < -80 || info.velocity.y < -500) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[80]"
          role="dialog"
          aria-modal="true"
          aria-label="Notifications"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={{ type: "tween", ease: EASE, duration: 0.32 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.3}
            onDragEnd={onDragEnd}
            className="sf-glass-window absolute inset-x-0 top-0 max-h-[88dvh] overflow-y-auto rounded-b-[24px]"
            style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted">
                  Notification Center
                </div>
                <div className="mt-0.5 text-base font-semibold text-app">Today</div>
              </div>
              <div className="flex items-center gap-1">
                {hydrated && visible.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="rounded-md px-2 py-1 text-xs text-secondary active:bg-surface"
                  >
                    Clear all
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close notifications"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-app text-secondary active:bg-surface"
                >
                  <svg
                    width="14"
                    height="14"
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

            <div className="px-3 pb-3">
              {!hydrated ? null : visible.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-app bg-app text-muted">
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.7 21a2 2 0 01-3.4 0" />
                    </svg>
                  </span>
                  <div className="text-sm font-medium text-app">You&rsquo;re all caught up.</div>
                </div>
              ) : (
                <ul className="space-y-2">
                  <AnimatePresence initial={false}>
                    {visible.map((n) => (
                      <Card
                        key={n.id}
                        notification={n}
                        now={now}
                        onDismiss={() => dismiss(n.id)}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>

            {/* Drag handle at the bottom */}
            <div className="flex justify-center pb-3">
              <div className="h-1 w-10 rounded-full bg-app/30" aria-hidden="true" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Card({
  notification,
  now,
  onDismiss,
}: {
  notification: Notification;
  now: number;
  onDismiss: () => void;
}) {
  const time = relativeTime(notification.createdAt, now);
  const tone =
    notification.kind === "info"
      ? "bg-blue-500/15 text-blue-400 dark:text-blue-300"
      : notification.kind === "insight"
        ? "bg-emerald-500/15 text-emerald-500 dark:text-emerald-300"
        : "bg-violet-500/15 text-violet-500 dark:text-violet-300";
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 80 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="relative rounded-2xl border border-app bg-app p-3 shadow-sm"
    >
      <div className="flex gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 100 20 10 10 0 000-20z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1 pr-5">
          <div className="flex items-baseline justify-between gap-2">
            <div className="truncate text-sm font-semibold text-app">{notification.title}</div>
            <div className="shrink-0 text-[10px] text-faint tabular-nums">{time}</div>
          </div>
          <div className="mt-0.5 text-[13px] leading-snug text-secondary">{notification.body}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Dismiss ${notification.title}`}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-faint active:bg-surface"
      >
        <svg
          width="11"
          height="11"
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
