"use client";

/* ActivitySection — last 20 events, oldest at the bottom.
 *
 * Visible to every workspace member. We hit /api/workspaces/activity
 * which RLS-gates rows for non-members.
 */

import { useCallback, useEffect, useState } from "react";
import {
  describeActivity,
  relativeTime,
  type ActivityEvent,
} from "./types";

interface Props {
  workspaceId: string;
  onError: (msg: string) => void;
}

export default function ActivitySection({ workspaceId, onError }: Props) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspaces/activity?workspaceId=${encodeURIComponent(
          workspaceId
        )}&limit=20`,
        { cache: "no-store" }
      );
      const body = (await res.json()) as {
        events?: ActivityEvent[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || `Load failed (${res.status})`);
      }
      setEvents(body.events ?? []);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return <div className="h-32 animate-pulse rounded-xl bg-surface" />;
  }
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-app bg-app p-4 text-sm text-secondary">
        No activity yet. Invites, role changes, and settings updates show
        up here.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-app bg-app">
      <ul className="divide-y divide-app">
        {events.map((ev) => (
          <li key={ev.id} className="flex items-start gap-3 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tool-accent text-[0.7rem] font-semibold text-white">
              {ev.actor_avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ev.actor_avatar}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                (ev.actor_name?.[0] ?? "?").toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-app">{describeActivity(ev)}</div>
              <div className="text-xs text-muted">
                {relativeTime(ev.created_at)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
