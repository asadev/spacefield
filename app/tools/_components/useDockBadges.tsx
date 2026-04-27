"use client";

/* useDockBadges — aggregate badge counts (or "any-positive" dots) per dock
 * slug. The Dock + the mobile dock both consume this hook so a single
 * source of truth drives the small red bubbles.
 *
 * Sources we aggregate (each is best-effort — a failure in one source
 * never breaks the others):
 *   - "files-manager" → restorable files in the active workspace's Trash.
 *     There's no trash API yet (Agent 4 owns it), so we default to 0 and
 *     log nothing. When Agent 4 lands a /api/files/trash endpoint we can
 *     wire it here without touching consumers.
 *   - "documents" / "sheets" → unsaved changes in any open editor instance.
 *     Editors broadcast their state via the global event
 *       window.dispatchEvent(new CustomEvent("spacefield:unsaved-changed",
 *         { detail: { slug, count } }))
 *     Each (slug, count) pair is stored in a Map; emit count: 0 to clear.
 *   - "settings" → pending workspace invites (usePendingInvites).
 *   - "notifications" → unread notifications from the
 *     `tools-desktop-notifications-v1` localStorage list (count of
 *     entries with dismissed === false).
 *
 * The hook returns a stable object keyed by slug (`Record<string, number>`)
 * + a helper getCount(slug). Counts of zero are still represented so
 * consumers don't need to differentiate between "no badge" and "no entry".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePendingInvites } from "./usePendingInvites";
import { useWorkspaceKey } from "./useWorkspaces";

const NOTIFICATIONS_SUFFIX = "tools-desktop-notifications-v1";

interface NotificationLite {
  id: string;
  dismissed: boolean;
}

function readUnreadCount(storageKey: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return 0;
    return (parsed as NotificationLite[]).filter(
      (n) => n && typeof n === "object" && n.dismissed === false
    ).length;
  } catch {
    return 0;
  }
}

interface UnsavedDetail {
  slug: string;
  count: number;
}

export function useDockBadges() {
  const notificationsKey = useWorkspaceKey(NOTIFICATIONS_SUFFIX);

  // Pending invites — already polls + refreshes on focus internally.
  const { count: pendingInviteCount } = usePendingInvites();

  // Unread notifications — read from localStorage; refresh on storage
  // events from the same workspace key, plus a low-frequency tick so the
  // badge clears within a few seconds when the user dismisses an item
  // through the panel (NotificationCenter writes to the same key).
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  useEffect(() => {
    setUnreadNotifications(readUnreadCount(notificationsKey));
    const onStorage = (e: StorageEvent) => {
      if (e.key === notificationsKey) {
        setUnreadNotifications(readUnreadCount(notificationsKey));
      }
    };
    window.addEventListener("storage", onStorage);
    // Also re-read on focus + every 5 s — the NotificationCenter writes
    // localStorage from the same tab, which doesn't fire `storage`.
    const onFocus = () => setUnreadNotifications(readUnreadCount(notificationsKey));
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const id = window.setInterval(
      () => setUnreadNotifications(readUnreadCount(notificationsKey)),
      5000
    );
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(id);
    };
  }, [notificationsKey]);

  // Editor-broadcasted unsaved-changes counts per slug.
  const unsavedRef = useRef<Map<string, number>>(new Map());
  const [unsavedTick, setUnsavedTick] = useState(0);
  useEffect(() => {
    const onUnsaved = (e: Event) => {
      const ce = e as CustomEvent<UnsavedDetail>;
      const detail = ce.detail;
      if (!detail || typeof detail.slug !== "string") return;
      const count = Math.max(0, Number(detail.count) || 0);
      const map = unsavedRef.current;
      if (count <= 0) {
        if (!map.has(detail.slug)) return;
        map.delete(detail.slug);
      } else {
        if (map.get(detail.slug) === count) return;
        map.set(detail.slug, count);
      }
      setUnsavedTick((t) => t + 1);
    };
    window.addEventListener("spacefield:unsaved-changed", onUnsaved as EventListener);
    return () =>
      window.removeEventListener(
        "spacefield:unsaved-changed",
        onUnsaved as EventListener
      );
  }, []);

  // Files Manager Trash — no API yet, default to 0. Wired here so when
  // Agent 4 lands /api/files/trash it's a one-line change.
  const filesTrashCount = 0;

  const badges = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (filesTrashCount > 0) map["files-manager"] = filesTrashCount;
    if (pendingInviteCount > 0) map["settings"] = pendingInviteCount;
    if (unreadNotifications > 0) map["notifications"] = unreadNotifications;
    for (const [slug, count] of unsavedRef.current.entries()) {
      if (count > 0) map[slug] = count;
    }
    return map;
    // unsavedTick forces recompute when the broadcast map mutates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesTrashCount, pendingInviteCount, unreadNotifications, unsavedTick]);

  const getCount = useCallback((slug: string) => badges[slug] ?? 0, [badges]);

  return { badges, getCount };
}
