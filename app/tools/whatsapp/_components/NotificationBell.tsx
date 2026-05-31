"use client";

/* WhatsApp inbox v2 — Wave 4 · EPIC-16 in-app notification bell.
 *
 * Reads the SHARED notifications table (filtered to WhatsApp kinds) via
 * /api/whatsapp/notifications. Polls for the unread count; opens a dropdown
 * with the recent items; mark-one / mark-all-read. Reuses the platform's
 * existing notification storage — no parallel system.
 *
 * Mounted in the WhatsApp app header (mobile + desktop identical).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type WaNotification,
} from "./api";
import { MiniIcon } from "./ui";

const POLL_MS = 45_000;

function relative(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<WaNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const res = await fetchNotifications(false);
    if (res.ok) {
      setItems(res.data.items);
      setUnread(res.data.unread_count);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const onOpen = useCallback(() => {
    setOpen((v) => !v);
    if (!open) void load();
  }, [open, load]);

  const onMarkOne = useCallback(
    async (id: string) => {
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
      );
      setUnread((u) => Math.max(0, u - 1));
      await markNotificationRead(id);
    },
    [],
  );

  const onMarkAll = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnread(0);
    await markAllNotificationsRead();
  }, []);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={onOpen}
        className="relative rounded-md border border-transparent p-1.5 text-secondary hover:bg-surface hover:text-app"
        aria-label="WhatsApp notifications"
      >
        <MiniIcon name="inbox" size={16} />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[0.55rem] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-1 w-72 overflow-hidden rounded-lg border border-app bg-app shadow-xl">
          <div className="flex items-center justify-between border-b border-app bg-app-elevated px-3 py-2">
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
              Notifications
            </span>
            {unread > 0 ? (
              <button
                onClick={onMarkAll}
                className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-tool-accent hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-faint">
                No notifications yet.
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onMarkOne(n.id)}
                  className={`block w-full border-b border-app px-3 py-2 text-left last:border-b-0 hover:bg-surface ${
                    n.read_at ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-app">
                      {n.title}
                    </span>
                    <span className="shrink-0 text-[0.6rem] text-faint">
                      {relative(n.created_at)}
                    </span>
                  </div>
                  {n.body ? (
                    <p className="mt-0.5 truncate text-[0.7rem] text-secondary">{n.body}</p>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
