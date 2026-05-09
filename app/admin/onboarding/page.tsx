import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../_lib";
import type { OnboardingFlowRow, OnboardingStepRow } from "../_types";
import StatusChip from "./_components/StatusChip";

export const dynamic = "force-dynamic";

/**
 * Index of every row in `public.onboarding_flows`. Onboarding flows are
 * ordered lists of steps the user sees on first_login / signup / etc.
 * The runtime that renders them is wired separately; this page is the
 * authoring surface.
 *
 * Filters are server-side via search params so the page stays a server
 * component — no client state.
 */

type SearchParams = {
  status?: string;
  trigger?: string;
  q?: string;
};

const STATUSES = new Set(["live", "draft", "archived"]);

export default async function AdminOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filterStatus = STATUSES.has(params.status ?? "")
    ? (params.status as "live" | "draft" | "archived")
    : "";
  const filterTrigger = (params.trigger ?? "").trim();
  const filterQ = (params.q ?? "").trim().toLowerCase();

  const admin = createAdminClient();
  const [flowsRes, stepsRes] = await Promise.all([
    admin
      .from("onboarding_flows")
      .select("*")
      .order("updated_at", { ascending: false }),
    admin
      .from("onboarding_steps")
      .select("flow_id, id"),
  ]);

  if (flowsRes.error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load onboarding flows: {flowsRes.error.message}
      </div>
    );
  }

  const flows = (flowsRes.data ?? []) as OnboardingFlowRow[];
  const stepRows = (stepsRes.data ?? []) as Pick<
    OnboardingStepRow,
    "flow_id" | "id"
  >[];

  const stepCountByFlow = new Map<string, number>();
  for (const s of stepRows) {
    stepCountByFlow.set(s.flow_id, (stepCountByFlow.get(s.flow_id) ?? 0) + 1);
  }

  const triggerEvents = Array.from(
    new Set(flows.map((f) => f.trigger_event).filter(Boolean))
  ).sort();

  const filtered = flows.filter((f) => {
    if (filterStatus && f.status !== filterStatus) return false;
    if (filterTrigger && f.trigger_event !== filterTrigger) return false;
    if (filterQ) {
      const hay = `${f.id} ${f.display_name} ${f.description}`.toLowerCase();
      if (!hay.includes(filterQ)) return false;
    }
    return true;
  });

  const counts = {
    total: flows.length,
    live: flows.filter((f) => f.status === "live").length,
    draft: flows.filter((f) => f.status === "draft").length,
    archived: flows.filter((f) => f.status === "archived").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Communication
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Onboarding</h1>
          <p className="mt-0.5 text-xs text-muted">
            {counts.total} flow{counts.total === 1 ? "" : "s"} ·{" "}
            {counts.live} live · {counts.draft} draft · {counts.archived}{" "}
            archived. Each flow is an ordered list of steps shown to the user
            when its trigger fires.
          </p>
        </div>
        <Link
          href="/admin/onboarding/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          + New flow
        </Link>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-app bg-app-elevated p-3"
      >
        <FilterField label="Search">
          <input
            type="search"
            name="q"
            defaultValue={filterQ}
            placeholder="id, name, description"
            className="h-9 w-52 rounded-lg border border-app bg-app px-3 py-1.5 text-sm text-app outline-none transition-colors focus:border-tool-accent placeholder:text-faint"
          />
        </FilterField>
        <FilterField label="Trigger">
          <select
            name="trigger"
            defaultValue={filterTrigger}
            className="h-9 rounded-lg border border-app bg-app px-2 text-sm text-app outline-none transition-colors focus:border-tool-accent"
          >
            <option value="">all</option>
            {triggerEvents.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Status">
          <select
            name="status"
            defaultValue={filterStatus}
            className="h-9 rounded-lg border border-app bg-app px-2 text-sm text-app outline-none transition-colors focus:border-tool-accent"
          >
            <option value="">all</option>
            <option value="live">live</option>
            <option value="draft">draft</option>
            <option value="archived">archived</option>
          </select>
        </FilterField>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-xs font-medium text-app transition-colors hover:border-tool-accent"
        >
          Apply
        </button>
        <Link
          href="/admin/onboarding"
          className="text-[11px] text-faint transition-colors hover:text-app"
        >
          Reset
        </Link>
      </form>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Flow</th>
              <th className="px-3 py-2 text-left font-normal">ID</th>
              <th className="px-3 py-2 text-left font-normal">Trigger</th>
              <th className="px-3 py-2 text-left font-normal">Audience</th>
              <th className="px-3 py-2 text-left font-normal">Steps</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-faint">
                  {flows.length === 0
                    ? "No onboarding flows yet — click \"+ New flow\" to add one."
                    : "No flows match the current filters."}
                </td>
              </tr>
            ) : (
              filtered.map((f) => {
                const stepCount = stepCountByFlow.get(f.id) ?? 0;
                return (
                  <tr
                    key={f.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/onboarding/${encodeURIComponent(f.id)}`}
                        className="text-app hover:text-tool-accent"
                      >
                        <div className="font-medium">{f.display_name}</div>
                        {f.description && (
                          <div className="mt-0.5 max-w-xl truncate text-[11px] text-muted">
                            {f.description}
                          </div>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {f.id}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {f.trigger_event}
                    </td>
                    <td className="px-3 py-2 text-xs text-secondary">
                      {f.audience}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums text-secondary">
                      {stepCount}
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip status={f.status} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(f.updated_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/onboarding/${encodeURIComponent(f.id)}`}
                        className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
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

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-muted">
      {label}
      {children}
    </label>
  );
}
