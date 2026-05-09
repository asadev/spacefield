import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonGhostClass,
  fetchAuthUsersByIds,
  formatDateTime,
} from "../../_lib";
import type { CohortRow } from "../../_types";
import { deleteCohort, recomputeCohort, updateCohort } from "../_actions";
import CohortForm from "../_components/CohortForm";

export const dynamic = "force-dynamic";

const MEMBERS_PER_PAGE = 50;

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mpage?: string }>;
};

type MemberRow = {
  cohort_id: string;
  user_id: string;
  added_at: string;
};

export default async function CohortDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id: rawId } = await params;
  const sp = await searchParams;
  const id = decodeURIComponent(rawId).toLowerCase();
  const memberPage = Math.max(1, Number(sp.mpage) || 1);

  const admin = createAdminClient();
  const { data: cohortData } = await admin
    .from("cohorts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const cohort = (cohortData as CohortRow | null) ?? null;
  if (!cohort) notFound();

  const from = (memberPage - 1) * MEMBERS_PER_PAGE;
  const to = from + MEMBERS_PER_PAGE - 1;

  const { data: memberData, count: memberCount } = await admin
    .from("cohort_users")
    .select("*", { count: "exact" })
    .eq("cohort_id", id)
    .order("added_at", { ascending: false })
    .range(from, to);
  const members = (memberData ?? []) as MemberRow[];
  const totalMembers = memberCount ?? cohort.user_count ?? 0;
  const totalMemberPages = Math.max(
    1,
    Math.ceil(totalMembers / MEMBERS_PER_PAGE)
  );

  const userIds = members.map((m) => m.user_id);
  const emailMap = await fetchAuthUsersByIds(userIds);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/cohorts"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Cohorts
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-app">{cohort.display_name}</h1>
          <span className="rounded-full border border-app bg-app px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-secondary">
            {cohort.id}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
              cohort.enabled
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-app text-faint border border-app"
            }`}
          >
            {cohort.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          <span className="rounded-md border border-app bg-app px-2 py-1">
            updated {formatDateTime(cohort.updated_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            created {formatDateTime(cohort.created_at)}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card label="User count" value={(cohort.user_count ?? 0).toLocaleString()} tone="violet" />
        <Card
          label="Last computed"
          value={formatDateTime(cohort.last_computed_at)}
          mono
        />
        <Card
          label="Definition keys"
          value={Object.keys(cohort.definition ?? {}).join(", ") || "—"}
        />
      </div>

      {/* Recompute action */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-app">Recompute</h2>
            <p className="mt-0.5 text-xs text-muted">
              Re-evaluates the definition against current users and rewrites
              the membership table. Logged in audit. Currently honors{" "}
              <code className="font-mono">tier</code>,{" "}
              <code className="font-mono">signed_up_after</code>, and{" "}
              <code className="font-mono">signed_up_before</code>.
            </p>
          </div>
          <form action={recomputeCohort}>
            <input type="hidden" name="id" value={cohort.id} />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Run recompute
            </button>
          </form>
        </div>
      </section>

      {/* Edit form */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Edit cohort</h2>
        <p className="mt-0.5 text-xs text-muted">
          Changing the definition does NOT re-run membership — click Recompute
          afterwards.
        </p>
        <div className="mt-4">
          <CohortForm
            cohort={cohort}
            action={updateCohort}
            submitLabel="Save changes"
          />
        </div>
      </section>

      {/* Members table */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-app">Members</h2>
            <p className="mt-0.5 text-xs text-muted">
              {totalMembers.toLocaleString()} member
              {totalMembers === 1 ? "" : "s"} · page {memberPage} of{" "}
              {totalMemberPages}
            </p>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-app bg-app">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">User</th>
                <th className="px-3 py-2 text-left font-normal">Email</th>
                <th className="px-3 py-2 text-left font-normal">Added</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-faint">
                    No members. Run Recompute to populate.
                  </td>
                </tr>
              ) : (
                members.map((m) => {
                  const auth = emailMap.get(m.user_id);
                  return (
                    <tr
                      key={m.user_id}
                      className="border-b border-app last:border-b-0"
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/users/${m.user_id}`}
                          className="font-mono text-xs text-app hover:text-tool-accent"
                        >
                          {m.user_id.slice(0, 8)}…{m.user_id.slice(-4)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs text-secondary">
                        {auth?.email ?? <span className="text-faint">—</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                        {formatDateTime(m.added_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {totalMemberPages > 1 && (
          <div className="mt-3 flex items-center justify-end gap-2 text-xs">
            <MemberPageLink
              id={cohort.id}
              page={memberPage - 1}
              disabled={memberPage <= 1}
            >
              ← Prev
            </MemberPageLink>
            <span className="font-mono tabular-nums text-muted">
              {memberPage} / {totalMemberPages}
            </span>
            <MemberPageLink
              id={cohort.id}
              page={memberPage + 1}
              disabled={memberPage >= totalMemberPages}
            >
              Next →
            </MemberPageLink>
          </div>
        )}
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
        <h2 className="text-sm font-semibold text-rose-500">Danger zone</h2>
        <p className="mt-1 text-xs text-rose-500/80">
          Permanently delete this cohort and all membership rows.
        </p>
        <form action={deleteCohort} className="mt-3">
          <input type="hidden" name="id" value={cohort.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
          >
            Delete {cohort.id}
          </button>
        </form>
      </section>

      <div>
        <Link href="/admin/cohorts" className={buttonGhostClass}>
          Back to cohorts
        </Link>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  tone = "default",
  mono = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "violet";
  mono?: boolean;
}) {
  const toneCls = tone === "violet" ? "text-tool-accent" : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div
        className={`mt-1 truncate font-semibold tabular-nums ${toneCls} ${
          mono ? "font-mono text-base" : "text-2xl"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function MemberPageLink({
  id,
  page,
  disabled,
  children,
}: {
  id: string;
  page: number;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const cls =
    "rounded-lg border border-app px-2.5 py-1 transition-colors " +
    (disabled
      ? "pointer-events-none opacity-40 text-faint"
      : "bg-app-elevated text-app hover:border-tool-accent");
  if (disabled) return <span className={cls}>{children}</span>;
  return (
    <Link
      href={`/admin/cohorts/${encodeURIComponent(id)}?mpage=${page}`}
      className={cls}
    >
      {children}
    </Link>
  );
}
