import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../_lib";
import type { PushCampaignRow, PushStatus } from "../_types";

export const dynamic = "force-dynamic";

const STATUS_CHIP: Record<PushStatus, string> = {
  draft: "bg-app-elevated text-secondary border border-app",
  scheduled: "bg-tool-accent-soft text-tool-accent",
  sending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  sent: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
  failed: "bg-rose-500/15 text-rose-500",
};

function audienceChip(a: string): string {
  switch (a) {
    case "all":
      return "bg-app-elevated text-secondary border border-app";
    case "tier":
      return "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400";
    case "allowlist":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "workspace":
      return "bg-tool-accent-soft text-tool-accent";
    default:
      return "bg-app-elevated text-secondary border border-app";
  }
}

export default async function AdminPushPage() {
  const admin = createAdminClient();

  const [campaignsRes, subsRes] = await Promise.all([
    admin
      .from("push_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("push_subscriptions")
      .select("id, enabled", { count: "exact" })
      .limit(1),
  ]);

  const campaigns = (campaignsRes.data ?? []) as PushCampaignRow[];
  const totalSubs = subsRes.count ?? 0;

  const draft = campaigns.filter((c) => c.status === "draft").length;
  const scheduled = campaigns.filter((c) => c.status === "scheduled").length;
  const sentRows = campaigns.filter((c) => c.status === "sent");
  const sending = campaigns.filter((c) => c.status === "sending").length;
  const totalSent = sentRows.reduce((acc, c) => acc + (c.total_sent ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Communication
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Push campaigns</h1>
          <p className="mt-0.5 text-xs text-muted">
            Web-push notifications. Worker resolves audience joins and writes
            back per-row delivery status.
          </p>
        </div>
        <Link
          href="/admin/push/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          + New campaign
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Subscribers" value={totalSubs} tone="default" />
        <StatCard label="Drafts" value={draft} tone="muted" />
        <StatCard label="Scheduled" value={scheduled} />
        <StatCard label="Sending" value={sending} />
        <StatCard label="Total sent" value={totalSent} tone="emerald" />
      </div>

      {campaignsRes.error && (
        <div className="rounded-xl border border-app bg-app-elevated p-3 text-xs text-rose-500">
          Read failed: {campaignsRes.error.message}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Title</th>
              <th className="px-3 py-2 text-left font-normal">Audience</th>
              <th className="px-3 py-2 text-left font-normal">Schedule</th>
              <th className="px-3 py-2 text-left font-normal">Stats</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-faint">
                  No campaigns yet. Create one to broadcast a push notification.
                </td>
              </tr>
            ) : (
              campaigns.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-app last:border-b-0 hover:bg-app/40"
                >
                  <td className="max-w-md px-3 py-2">
                    <Link
                      href={`/admin/push/${c.id}`}
                      className="font-medium text-app hover:text-tool-accent"
                    >
                      <span className="line-clamp-1">{c.title}</span>
                    </Link>
                    <div className="mt-0.5 line-clamp-1 text-[11px] text-faint">
                      {c.body}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${audienceChip(c.audience)}`}
                    >
                      {c.audience}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                    <div>scheduled {formatDateTime(c.scheduled_at)}</div>
                    <div className="text-faint">sent {formatDateTime(c.sent_at)}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                    <div>{c.total_sent.toLocaleString()} / {c.total_targets.toLocaleString()}</div>
                    {c.total_failed > 0 && (
                      <div className="text-rose-500">{c.total_failed.toLocaleString()} failed</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_CHIP[c.status]}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/admin/push/${c.id}`}
                      className="rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                    >
                      {c.status === "sent" || c.status === "sending"
                        ? "View"
                        : "Edit"}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "emerald" | "muted";
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-500 dark:text-emerald-400"
      : tone === "muted"
        ? "text-secondary"
        : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
