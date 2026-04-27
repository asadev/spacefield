"use client";

// NotificationBell — polls /api/notifications every 60s, shows unread badge,
// dropdown with last 10. Graceful when signed out (just renders nothing).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  async function fetchItems() {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.status === 401) {
        setAuthed(false);
        return;
      }
      setAuthed(true);
      const json = await res.json();
      setItems(json.items || []);
      setUnread(json.unread || 0);
    } catch {
      // network hiccups are non-fatal; leave stale state
    }
  }

  useEffect(() => {
    fetchItems();
    const id = setInterval(fetchItems, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    fetchItems();
  }

  async function markOneRead(id: string) {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    fetchItems();
  }

  if (authed === false) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-8 w-8 items-center justify-center border border-app bg-surface text-secondary hover:border-app-hover hover:text-app"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[16px] items-center justify-center border border-black bg-teal-400 px-1 text-[9px] font-semibold leading-[14px] text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[110%] z-50 w-80 border border-app bg-app-elevated shadow-xl">
          <div className="flex items-center justify-between border-b border-app px-3 py-2">
            <span className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              Notifications
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[0.6rem] uppercase tracking-[0.15em] text-teal-500 hover:text-teal-400"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center text-[0.7rem] text-muted">
                Nothing yet. You are caught up.
              </div>
            ) : (
              items.map((n) => (
                <NotificationRow
                  key={n.id}
                  item={n}
                  onClick={() => markOneRead(n.id)}
                />
              ))
            )}
          </div>
          <div className="border-t border-app px-3 py-2 text-right">
            <Link
              href="/dashboard/alerts"
              className="text-[0.6rem] uppercase tracking-[0.15em] text-muted hover:text-app"
            >
              Manage alerts
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  item,
  onClick,
}: {
  item: NotificationItem;
  onClick: () => void;
}) {
  const inner = (
    <div
      onClick={onClick}
      className={`cursor-pointer border-b border-app px-3 py-2 last:border-b-0 hover:bg-surface ${
        item.read ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        {!item.read && (
          <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 bg-teal-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-app">{item.title}</div>
          {item.body && (
            <div className="mt-0.5 line-clamp-2 text-[0.65rem] text-muted">
              {item.body}
            </div>
          )}
          <div className="mt-1 text-[0.55rem] uppercase tracking-[0.15em] text-faint">
            {relativeTime(item.created_at)}
          </div>
        </div>
      </div>
    </div>
  );
  return item.href ? <Link href={item.href}>{inner}</Link> : inner;
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
