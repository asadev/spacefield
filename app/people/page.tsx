import Link from "next/link";

import {
  getActiveWorkspaceId,
  listEmployees,
} from "@/lib/people/server";
import type { Employee } from "@/lib/people/types";

import EmployeeAvatar from "./_components/EmployeeAvatar";
import { peopleInputClass } from "./_components/styles";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "People · Space Field",
};

type SP = { q?: string; dept?: string; status?: string };

/**
 * Public directory for workspace members. Search by name/email/title/dept.
 * Filter by department + status. Click a row to open the profile.
 */
export default async function PeopleDirectory({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const dept = (sp.dept ?? "").trim();
  const statusFilter = (sp.status ?? "active") as Employee["status"];

  const workspaceId = await getActiveWorkspaceId();

  if (!workspaceId) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-app">People</h1>
        <p className="mt-3 text-sm text-secondary">
          You need to be in a workspace to use the People directory.
        </p>
        <Link
          href="/solutions/workspaces"
          className="mt-4 inline-flex rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app hover:border-tool-accent"
        >
          Create a workspace
        </Link>
      </main>
    );
  }

  const employees = await listEmployees({
    workspaceId,
    query: q,
    department: dept || undefined,
    status: statusFilter,
    limit: 500,
  });

  const departments = Array.from(
    new Set(employees.map((e) => e.department).filter((d): d is string => !!d))
  ).sort();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            HR
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-app">
            People directory
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            {employees.length.toLocaleString()} {statusFilter}
            {dept ? ` · ${dept}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/people/org-chart"
            className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app hover:border-tool-accent"
          >
            Org chart
          </Link>
          <Link
            href="/people/time-off"
            className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app hover:border-tool-accent"
          >
            Time off
          </Link>
        </div>
      </header>

      <form
        action="/people"
        className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_140px_auto]"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name, email, title…"
          className={peopleInputClass}
        />
        <select name="dept" defaultValue={dept} className={peopleInputClass}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={statusFilter}
          className={peopleInputClass}
        >
          <option value="active">Active</option>
          <option value="on_leave">On leave</option>
          <option value="terminated">Terminated</option>
        </select>
        <button
          type="submit"
          className="rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app hover:border-tool-accent"
        >
          Filter
        </button>
      </form>

      <section className="mt-6 overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Name</th>
              <th className="px-3 py-2 text-left font-normal">Title</th>
              <th className="px-3 py-2 text-left font-normal">Department</th>
              <th className="px-3 py-2 text-left font-normal">Location</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-faint">
                  No employees match.{" "}
                  <Link
                    href="/admin/people"
                    className="text-tool-accent hover:underline"
                  >
                    Add some in admin →
                  </Link>
                </td>
              </tr>
            ) : (
              employees.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-app last:border-b-0 hover:bg-app/40"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/people/${e.id}`}
                      className="flex items-center gap-2"
                    >
                      <EmployeeAvatar name={e.full_name} />
                      <span className="font-medium text-app hover:text-tool-accent">
                        {e.full_name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-secondary">{e.job_title ?? "—"}</td>
                  <td className="px-3 py-2 text-secondary">{e.department ?? "—"}</td>
                  <td className="px-3 py-2 text-secondary">{e.location ?? "—"}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={e.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function StatusPill({ status }: { status: Employee["status"] }) {
  const cls =
    status === "active"
      ? "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400"
      : status === "on_leave"
      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
      : "bg-rose-500/15 text-rose-600 dark:text-rose-400";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
