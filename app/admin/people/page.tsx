import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Employee } from "@/lib/people/types";

import ExpiringDocsWidget from "../../people/_components/ExpiringDocsWidget";
import { inputClass } from "../_lib";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

/**
 * Admin oversight for the People module. Lists every employee across all
 * workspaces via the service-role client so admins see the full picture.
 * Search + filter on full_name / department / status.
 */
export default async function AdminPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; dept?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = (sp.status ?? "").trim();
  const dept = (sp.dept ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const admin = createAdminClient();
  let query = admin
    .from("employees")
    .select(
      "id, workspace_id, full_name, email, job_title, department, status, hire_date, manager_id, created_at",
      { count: "exact" }
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  if (q) {
    const needle = q.replace(/[,%]/g, "");
    query = query.or(
      `full_name.ilike.%${needle}%,email.ilike.%${needle}%,job_title.ilike.%${needle}%`
    );
  }
  if (status) query = query.eq("status", status);
  if (dept) query = query.eq("department", dept);

  const { data, count } = await query;
  const rows = (data ?? []) as Employee[];
  const total = count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // Distinct departments
  const { data: deptRows } = await admin
    .from("employees")
    .select("department")
    .not("department", "is", null)
    .limit(500);
  const departments = Array.from(
    new Set(((deptRows ?? []) as { department: string }[]).map((d) => d.department))
  )
    .filter(Boolean)
    .sort();

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            HR / People
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">All employees</h1>
          <p className="mt-0.5 text-xs text-muted">
            {total.toLocaleString()} total · page {page} of {totalPages}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/people/policies"
            className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app hover:border-tool-accent"
          >
            Time-off policies
          </Link>
          <Link
            href="/admin/people/onboarding"
            className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app hover:border-tool-accent"
          >
            Onboarding templates
          </Link>
          <Link
            href={`/admin/people/export?${new URLSearchParams({ q, status, dept }).toString()}`}
            className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app hover:border-tool-accent"
          >
            Export CSV
          </Link>
        </div>
      </div>

      {/* Expiry dashboard widget */}
      <ExpiringDocsWidget withinDays={30} limit={5} />

      <form action="/admin/people" className="flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, email, title"
          className={`${inputClass} h-9 w-72`}
        />
        <select name="status" defaultValue={status} className={`${inputClass} h-9 w-40`}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="on_leave">On leave</option>
          <option value="terminated">Terminated</option>
        </select>
        <select name="dept" defaultValue={dept} className={`${inputClass} h-9 w-48`}>
          <option value="">Any department</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-sm text-app hover:border-tool-accent"
        >
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Name</th>
              <th className="px-3 py-2 text-left font-normal">Email</th>
              <th className="px-3 py-2 text-left font-normal">Title</th>
              <th className="px-3 py-2 text-left font-normal">Dept</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Hire date</th>
              <th className="px-3 py-2 text-left font-normal">Workspace</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-faint">
                  No employees match.
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr key={e.id} className="border-b border-app last:border-b-0 hover:bg-app/40">
                  <td className="px-3 py-2 text-app">
                    <Link href={`/people/${e.id}`} className="hover:text-tool-accent">
                      {e.full_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-secondary">{e.email ?? "—"}</td>
                  <td className="px-3 py-2 text-secondary">{e.job_title ?? "—"}</td>
                  <td className="px-3 py-2 text-secondary">{e.department ?? "—"}</td>
                  <td className="px-3 py-2 text-secondary">{e.status.replace("_", " ")}</td>
                  <td className="px-3 py-2 font-mono text-xs text-secondary">
                    {e.hire_date ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-faint">
                    {e.workspace_id.slice(0, 8)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 text-xs">
        <PageLink page={page - 1} disabled={page <= 1} q={q} status={status} dept={dept}>
          ← Prev
        </PageLink>
        <span className="font-mono tabular-nums text-muted">
          {page} / {totalPages}
        </span>
        <PageLink page={page + 1} disabled={page >= totalPages} q={q} status={status} dept={dept}>
          Next →
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  page,
  disabled,
  children,
  q,
  status,
  dept,
}: {
  page: number;
  disabled?: boolean;
  children: React.ReactNode;
  q?: string;
  status?: string;
  dept?: string;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (dept) params.set("dept", dept);
  const cls =
    "rounded-lg border border-app px-2.5 py-1 transition-colors " +
    (disabled
      ? "pointer-events-none opacity-40 text-faint"
      : "bg-app-elevated text-app hover:border-tool-accent");
  if (disabled) return <span className={cls}>{children}</span>;
  return (
    <Link href={`/admin/people?${params.toString()}`} className={cls}>
      {children}
    </Link>
  );
}
