"use client";

/* usePendingInvites — small hook that returns the count of workspace
 * invites pending for the current signed-in user.
 *
 * Behavioural contract:
 *   - Returns `{ count: number, refresh }`. count is 0 until the first
 *     query resolves, and 0 if the user is signed out / Supabase isn't
 *     configured.
 *   - Refetches every 60s and on tab focus (visibilitychange).
 *   - Callers that mutate invite state (accept / decline) should call
 *     refresh() manually so the bell-icon badge updates without waiting
 *     for the next interval.
 *   - Cheap query — only selects `id`. No-op when signed out.
 *
 * Used by both NotificationBell (desktop top bar) and the MobileShell
 * status-bar bell so the red dot stays in sync between layouts.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./useAuth";

const POLL_INTERVAL_MS = 60_000;

export function usePendingInvites(): { count: number; refresh: () => void } {
  const { user, enabled, supabase } = useAuth();
  const [count, setCount] = useState(0);

  // Keep the latest user info in a ref so the polling closure doesn't
  // need to be re-created every time the user object stabilises.
  const userRef = useRef(user);
  userRef.current = user;

  const refresh = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      return;
    }
    const u = userRef.current;
    if (!u) {
      setCount(0);
      return;
    }
    try {
      const email = u.email?.toLowerCase() ?? "";
      const { data, error } = await supabase
        .from("workspace_invites")
        .select("id", { count: "exact" })
        .eq("status", "pending")
        .or(
          email
            ? `invitee_user_id.eq.${u.id},invitee_email.eq.${email}`
            : `invitee_user_id.eq.${u.id}`
        );
      if (error) {
        // RLS / network failures shouldn't bubble — just leave count at
        // its previous value so the badge doesn't flicker.
        return;
      }
      setCount((data as { id: string }[] | null)?.length ?? 0);
    } catch {
      // Same — swallow.
    }
  }, [enabled, supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh, user?.id]);

  // Poll every 60s + on tab focus.
  useEffect(() => {
    if (!enabled || !user) return;
    const id = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, user, refresh]);

  return { count, refresh };
}
