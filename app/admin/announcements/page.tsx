import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../_lib";
import type { AnnouncementRow } from "../_types";
import { publishAnnouncement } from "./_actions";

export const dynamic = "force-dynamic";

const CATEGORY_CHIP: Record<AnnouncementRow["category"], string> = {
  product: "bg-tool-accent-soft text-tool-accent",
  platform: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
  security: "bg-rose-500/15 text-rose-500",
  outage: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  marketing: "bg-app-elevated text-secondary border border-app",
};

function audienceChip(a: AnnouncementRow["audience"]): string {
  switch (a) {
    case "all":
      return "bg-app-elevated text-secondary border border-app";
    case "admin":
      return "bg-rose-500/15 text-rose-500";
    case "tier":
      return "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400";
    case "allowlist":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  }
}

async function publishAction(formData: FormData): Promise<void> {
  "use server";
  await publishAnnouncement(formData);
}

export default async function AdminAnnouncementsPage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .select("*")
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (data ?? []) as AnnouncementRow[];
  const drafts = rows.filter((r) => !r.published_at).length;
  const published = rows.length - drafts;
  const pinned = rows.filter((r) => r.pinned).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Communication
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Announcements</h1>
          <p className="mt-0.5 text-xs text-muted">
            Internal what&apos;s-new feed. Drafts (no published_at) are hidden
            from users.
          </p>
        </div>
        <Link
          href="/admin/announcements/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          + New announcement
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Published" value={published} tone="emerald" />
        <StatCard label="Drafts" value={drafts} tone="muted" />
        <StatCard label="Pinned" value={pinned} />
        <StatCard label="Total" value={rows.length} />
      </div>

      {error && (
        <div className="rounded-xl border border-app bg-app-elevated p-3 text-xs text-rose-500">
          Read failed: {error.message}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Title</th>
              <th className="px-3 py-2 text-left font-normal">Category</th>
              <th className="px-3 py-2 text-left font-normal">Audience</th>
              <th className="px-3 py-2 text-left font-normal">Published</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-faint">
                  No announcements yet.
                </td>
              </tr>
            ) : (
              rows.map((a) => {
                const isDraft = !a.published_at;
                return (
                  <tr
                    key={a.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="max-w-md px-3 py-2">
                      <Link
                        href={`/admin/announcements/${a.id}`}
                        className="font-medium text-app hover:text-tool-accent"
                      >
                        <span className="line-clamp-1">{a.title}</span>
                      </Link>
                      {a.pinned && (
                        <span className="ml-2 rounded-full bg-tool-accent-soft px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-tool-accent">
                          pinned
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${CATEGORY_CHIP[a.category]}`}
                      >
                        {a.category}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${audienceChip(a.audience)}`}
                      >
                        {a.audience}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {a.published_at ? formatDateTime(a.published_at) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <form
                        action={publishAction}
                        className="inline-flex items-center gap-2"
                      >
                        <input type="hidden" name="id" value={a.id} />
                        <input
                          type="hidden"
                          name="next"
                          value={isDraft ? "true" : "false"}
                        />
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                            isDraft
                              ? "bg-app-elevated text-secondary border border-app"
                              : "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400"
                          }`}
                        >
                          {isDraft ? "Draft" : "Live"}
                        </span>
                        <button
                          type="submit"
                          className="rounded-md border border-app bg-app px-2 py-0.5 text-[10px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                        >
                          {isDraft ? "Publish" : "Unpublish"}
                        </button>
                      </form>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/announcements/${a.id}`}
                        className="rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })
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
