// AlertsWidget — server component summarising saved searches + unread
// notification count for the dashboard.

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

interface AlertsWidgetProps {
  userId: string;
}

export default async function AlertsWidget({ userId }: AlertsWidgetProps) {
  const supabase = await createClient();

  const [{ count: alertCount }, { count: unreadCount }] = await Promise.all([
    supabase
      .from("saved_searches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false),
  ]);

  const alerts = alertCount || 0;
  const unread = unreadCount || 0;

  return (
    <div className="border border-white/[0.10] bg-white/[0.02] p-5">
      <div className="flex items-center justify-between">
        <div className="text-[0.55rem] uppercase tracking-[0.25em] text-gray-500">
          Alerts
        </div>
        {unread > 0 && (
          <span className="border border-teal-400/40 bg-teal-400/10 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.15em] text-teal-300">
            {unread} new
          </span>
        )}
      </div>

      <div className="mt-3 text-2xl font-semibold text-white">
        {alerts}
        <span className="ml-2 text-[0.6rem] uppercase tracking-[0.15em] text-gray-500">
          saved {alerts === 1 ? "search" : "searches"}
        </span>
      </div>

      <div className="mt-1 text-[0.65rem] text-gray-500">
        {alerts === 0
          ? "Set up alerts to get notified when new content matches."
          : unread > 0
          ? `You have ${unread} unread ${unread === 1 ? "match" : "matches"}.`
          : "No new matches. We'll let you know."}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Link
          href="/dashboard/alerts"
          className="border border-white/[0.10] px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.15em] text-gray-300 hover:border-white/[0.25] hover:text-white"
        >
          {alerts === 0 ? "Create an alert" : "Manage alerts"}
        </Link>
      </div>
    </div>
  );
}
