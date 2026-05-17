import Link from "next/link";

import {
  getActiveWorkspaceId,
  getEmployeeForCallerInWorkspace,
  listMyTimeOffRequests,
  listTeamApprovedTimeOff,
  listTimeOffBalances,
  listTimeOffPolicies,
} from "@/lib/people/server";
import type { TimeOffPolicy, TimeOffRequest } from "@/lib/people/types";

import TimeOffRequestForm from "../_components/TimeOffRequestForm";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Time off · Space Field",
};

// UAE public holidays for 2026 (approximate; user-overridable in admin).
const UAE_HOLIDAYS_2026: { date: string; name: string }[] = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-03-20", name: "Eid al-Fitr (obs.)" },
  { date: "2026-03-21", name: "Eid al-Fitr" },
  { date: "2026-03-22", name: "Eid al-Fitr" },
  { date: "2026-05-26", name: "Arafah Day" },
  { date: "2026-05-27", name: "Eid al-Adha" },
  { date: "2026-05-28", name: "Eid al-Adha" },
  { date: "2026-05-29", name: "Eid al-Adha" },
  { date: "2026-06-17", name: "Hijri New Year" },
  { date: "2026-08-26", name: "Prophet's Birthday" },
  { date: "2026-12-01", name: "Commemoration Day" },
  { date: "2026-12-02", name: "National Day" },
  { date: "2026-12-03", name: "National Day" },
];

export default async function TimeOffPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const workspaceId = await getActiveWorkspaceId();

  if (!workspaceId) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-app">Time off</h1>
        <p className="mt-3 text-sm text-secondary">
          Join or create a workspace first.
        </p>
      </main>
    );
  }

  const me = await getEmployeeForCallerInWorkspace(workspaceId);
  const [policies, requests] = await Promise.all([
    listTimeOffPolicies(workspaceId),
    me
      ? listMyTimeOffRequests(workspaceId, me.id)
      : Promise.resolve<TimeOffRequest[]>([]),
  ]);

  const balances = me ? await listTimeOffBalances(me.id) : [];

  // Month grid logic.
  const month = parseMonth(sp.month);
  const monthStart = new Date(Date.UTC(month.year, month.month, 1));
  const monthEnd = new Date(Date.UTC(month.year, month.month + 1, 0));
  const calStart = monthStart.toISOString().slice(0, 10);
  const calEnd = monthEnd.toISOString().slice(0, 10);
  const teamRequests = await listTeamApprovedTimeOff(
    workspaceId,
    me?.department ?? null,
    calStart,
    calEnd
  );

  const policyById = new Map(policies.map((p) => [p.id, p]));

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 pb-24">
      <Link href="/people" className="text-xs text-muted hover:text-tool-accent">
        ← Directory
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-app">Time off</h1>

      {!me && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
          You don't have an employee record in this workspace yet. Ask an admin
          to add one in <span className="font-mono">/admin/people</span>.
        </div>
      )}

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-xl border border-app bg-app-elevated p-5">
          <h2 className="text-sm font-semibold text-app">Submit a request</h2>
          <div className="mt-3">
            <TimeOffRequestForm policies={policies.filter((p) => p.active)} />
          </div>
        </div>

        <div className="rounded-xl border border-app bg-app-elevated p-5">
          <h2 className="text-sm font-semibold text-app">Your balances</h2>
          {balances.length === 0 ? (
            <p className="mt-2 text-xs text-muted">
              No balance rows yet. They appear after your first approved request,
              or your admin can seed them.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {balances.map((b) => {
                const p = policyById.get(b.policy_id);
                return (
                  <li
                    key={b.id}
                    className="flex items-center justify-between rounded-lg border border-app bg-app px-3 py-2 text-sm"
                  >
                    <span className="text-app">{p?.name ?? "Policy"}</span>
                    <span className="font-mono tabular-nums text-app">
                      {Number(b.balance_days).toFixed(1)} days
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-8">
        <header className="flex items-end justify-between">
          <div>
            <h2 className="text-sm font-semibold text-app">My requests</h2>
            <p className="text-xs text-muted">
              {requests.length} total
            </p>
          </div>
        </header>
        <div className="mt-3 overflow-x-auto rounded-xl border border-app bg-app-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Policy</th>
                <th className="px-3 py-2 text-left font-normal">Dates</th>
                <th className="px-3 py-2 text-left font-normal">Days</th>
                <th className="px-3 py-2 text-left font-normal">Status</th>
                <th className="px-3 py-2 text-left font-normal">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-faint">
                    No requests yet.
                  </td>
                </tr>
              ) : (
                requests.map((r) => {
                  const p = policyById.get(r.policy_id);
                  return (
                    <tr key={r.id} className="border-b border-app last:border-b-0">
                      <td className="px-3 py-2 text-app">{p?.name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                        {r.start_date} → {r.end_date}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-app">
                        {Number(r.days).toFixed(1)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-secondary">
                        {r.created_at.slice(0, 10)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <TeamCalendar
        monthYear={month}
        teamRequests={teamRequests}
        department={me?.department ?? null}
      />
    </main>
  );
}

function parseMonth(raw?: string): { year: number; month: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    return { year: y, month: m - 1 };
  }
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "approved"
      ? "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400"
      : status === "denied" || status === "cancelled"
      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
      : "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {status}
    </span>
  );
}

/**
 * Month grid showing days, marked with: H = UAE public holiday;
 * coloured dots = team members on approved leave that day.
 */
function TeamCalendar({
  monthYear,
  teamRequests,
  department,
}: {
  monthYear: { year: number; month: number };
  teamRequests: TimeOffRequest[];
  department: string | null;
}) {
  const { year, month } = monthYear;
  const firstDay = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  const startWeekday = firstDay.getUTCDay();
  const totalDays = lastDay.getUTCDate();
  const monthIso = `${year}-${String(month + 1).padStart(2, "0")}`;
  const prevMonth = (() => {
    const d = new Date(Date.UTC(year, month - 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();
  const nextMonth = (() => {
    const d = new Date(Date.UTC(year, month + 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();

  const holidayMap = new Map(UAE_HOLIDAYS_2026.map((h) => [h.date, h.name]));

  // For each day, who's out?
  const dayOuts = new Map<string, TimeOffRequest[]>();
  for (let day = 1; day <= totalDays; day += 1) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const hits = teamRequests.filter((r) => r.start_date <= iso && r.end_date >= iso);
    dayOuts.set(iso, hits);
  }

  const cells: { iso: string | null; day: number | null }[] = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push({ iso: null, day: null });
  for (let day = 1; day <= totalDays; day += 1) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ iso, day });
  }

  return (
    <section className="mt-8">
      <header className="flex items-end justify-between">
        <div>
          <h2 className="text-sm font-semibold text-app">Team calendar</h2>
          <p className="text-xs text-muted">
            {department
              ? `Approved leave in ${department} this month`
              : "Approved leave across your workspace this month"}
          </p>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <Link
            href={`/people/time-off?month=${prevMonth}`}
            className="rounded-md border border-app bg-app-elevated px-2 py-1 hover:border-tool-accent"
          >
            ←
          </Link>
          <span className="px-2 font-mono tabular-nums text-secondary">{monthIso}</span>
          <Link
            href={`/people/time-off?month=${nextMonth}`}
            className="rounded-md border border-app bg-app-elevated px-2 py-1 hover:border-tool-accent"
          >
            →
          </Link>
        </div>
      </header>

      <div className="mt-3 rounded-xl border border-app bg-app-elevated p-4">
        <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wide text-faint">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((c, i) => {
            if (!c.iso) {
              return <div key={`pad-${i}`} className="h-20 rounded-md bg-transparent" />;
            }
            const holiday = holidayMap.get(c.iso);
            const outs = dayOuts.get(c.iso) ?? [];
            return (
              <div
                key={c.iso}
                className="min-h-[5rem] rounded-md border border-app bg-app p-1.5 text-[11px]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono tabular-nums text-app">{c.day}</span>
                  {holiday && (
                    <span
                      className="rounded bg-tool-accent-soft px-1 py-px text-[9px] font-medium text-tool-accent"
                      title={holiday}
                    >
                      H
                    </span>
                  )}
                </div>
                {outs.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {outs.slice(0, 6).map((r) => (
                      <span
                        key={r.id}
                        className="h-1.5 w-1.5 rounded-full bg-amber-500"
                        title={`Out: ${r.employee_id.slice(0, 6)}`}
                      />
                    ))}
                    {outs.length > 6 && (
                      <span className="text-[9px] text-faint">+{outs.length - 6}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-[10px] text-faint">
          <span className="me-3 inline-flex items-center gap-1">
            <span className="rounded bg-tool-accent-soft px-1 py-px font-medium text-tool-accent">
              H
            </span>{" "}
            UAE public holiday
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />{" "}
            person on approved leave
          </span>
        </div>
      </div>
    </section>
  );
}
