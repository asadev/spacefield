import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../_lib";
import type { SurveyRow, SurveyStatus } from "../_types";

export const dynamic = "force-dynamic";

const STATUS_CHIP: Record<SurveyStatus, string> = {
  live: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
  draft: "bg-app-elevated text-secondary border border-app",
  archived: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

const TRIGGER_CHIP: Record<string, string> = {
  manual: "bg-app-elevated text-secondary border border-app",
  signup: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  milestone: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  recurring: "bg-tool-accent-soft text-tool-accent",
};

export default async function AdminSurveysPage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("surveys")
    .select("*")
    .order("status", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(500);

  const rows = (data ?? []) as SurveyRow[];
  const live = rows.filter((r) => r.status === "live").length;
  const draft = rows.filter((r) => r.status === "draft").length;
  const archived = rows.filter((r) => r.status === "archived").length;
  const totalResponses = rows.reduce(
    (acc, r) => acc + (Number.isFinite(r.response_count) ? r.response_count : 0),
    0
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Communication
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Surveys & NPS</h1>
          <p className="mt-0.5 text-xs text-muted">
            User-facing surveys: NPS, ratings, free-text. Drafts won&apos;t show
            to anyone; archived ones stop collecting.
          </p>
        </div>
        <Link
          href="/admin/surveys/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          + New survey
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Live" value={live} tone="emerald" />
        <StatCard label="Drafts" value={draft} tone="muted" />
        <StatCard label="Archived" value={archived} />
        <StatCard label="Total responses" value={totalResponses} />
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
              <th className="px-3 py-2 text-left font-normal">Survey</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Trigger</th>
              <th className="px-3 py-2 text-right font-normal">Responses</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-faint">
                  No surveys yet. Click &ldquo;+ New survey&rdquo; to add one.
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-app last:border-b-0 hover:bg-app/40"
                >
                  <td className="max-w-md px-3 py-2">
                    <Link
                      href={`/admin/surveys/${encodeURIComponent(s.id)}`}
                      className="font-medium text-app hover:text-tool-accent"
                    >
                      <span className="line-clamp-1">{s.display_name}</span>
                    </Link>
                    <span className="block font-mono text-[10px] tabular-nums text-faint">
                      {s.id}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_CHIP[s.status]}`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        TRIGGER_CHIP[s.trigger_kind] ?? TRIGGER_CHIP.manual
                      }`}
                    >
                      {s.trigger_kind}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-app">
                    {(s.response_count ?? 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                    {formatDateTime(s.updated_at)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/admin/surveys/${encodeURIComponent(s.id)}`}
                      className="rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                    >
                      Open
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
