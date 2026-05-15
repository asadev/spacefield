import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getActiveOnboardingRun,
  getCurrentUserId,
  getEmployee,
  listEmployeeDocuments,
  listMyTimeOffRequests,
  listTimeOffBalances,
  listTimeOffPolicies,
} from "@/lib/people/server";

import EmployeeAvatar from "../_components/EmployeeAvatar";
import ExpiryBadge from "../_components/ExpiryBadge";
import OnboardingTaskList from "./_OnboardingTaskList";

export const dynamic = "force-dynamic";

type Tab = "overview" | "timeoff" | "documents" | "onboarding";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "timeoff", label: "Time off" },
  { id: "documents", label: "Documents" },
  { id: "onboarding", label: "Onboarding" },
];

export default async function EmployeeProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.id === sp.tab)?.id ?? "overview") as Tab;

  const employee = await getEmployee(id);
  if (!employee) notFound();

  const callerId = await getCurrentUserId();
  const isSelf = !!callerId && callerId === employee.user_id;

  // Manager link
  const manager = employee.manager_id ? await getEmployee(employee.manager_id) : null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 pb-24">
      <Link
        href="/people"
        className="text-xs text-muted hover:text-tool-accent"
      >
        ← Directory
      </Link>

      <header className="mt-4 flex flex-wrap items-center gap-4">
        <EmployeeAvatar name={employee.full_name} size={56} />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-app">{employee.full_name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{employee.job_title ?? "—"}</span>
            {employee.department && (
              <>
                <span className="text-faint">·</span>
                <span>{employee.department}</span>
              </>
            )}
            {employee.location && (
              <>
                <span className="text-faint">·</span>
                <span>{employee.location}</span>
              </>
            )}
            {manager && (
              <>
                <span className="text-faint">·</span>
                <span>
                  Reports to{" "}
                  <Link
                    href={`/people/${manager.id}`}
                    className="text-tool-accent hover:underline"
                  >
                    {manager.full_name}
                  </Link>
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      <nav className="mt-6 flex gap-2 border-b border-app text-sm">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <Link
              key={t.id}
              href={`/people/${id}?tab=${t.id}`}
              className={[
                "px-3 py-2 -mb-px border-b-2 transition-colors",
                active
                  ? "border-tool-accent text-tool-accent font-medium"
                  : "border-transparent text-secondary hover:text-app",
              ].join(" ")}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <section className="mt-6">
        {tab === "overview" && <OverviewTab employee={employee} isSelf={isSelf} />}
        {tab === "timeoff" && (
          <TimeOffTab employeeId={employee.id} workspaceId={employee.workspace_id} />
        )}
        {tab === "documents" && (
          <DocumentsTab employeeId={employee.id} canEdit={isSelf} />
        )}
        {tab === "onboarding" && <OnboardingTab employeeId={employee.id} />}
      </section>
    </main>
  );
}

/* ───────────────────────── Overview ───────────────────────── */

function OverviewTab({
  employee,
  isSelf,
}: {
  employee: Awaited<ReturnType<typeof getEmployee>> & object;
  isSelf: boolean;
}) {
  const e = employee;
  const showSensitive = isSelf; // Other workspace members get the public view.
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Job title" value={e.job_title} />
      <Field label="Department" value={e.department} />
      <Field label="Location" value={e.location} />
      <Field
        label="Employment"
        value={e.employment_type.replace("_", " ")}
      />
      <Field label="Status" value={e.status.replace("_", " ")} />
      <Field label="Hire date" value={e.hire_date} />
      {showSensitive && <Field label="Email" value={e.email} />}
      {showSensitive && (
        <Field
          label="Termination date"
          value={e.termination_date}
        />
      )}
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className="mt-1 text-sm text-app">{value || "—"}</div>
    </div>
  );
}

/* ───────────────────────── Time off ───────────────────────── */

async function TimeOffTab({
  employeeId,
  workspaceId,
}: {
  employeeId: string;
  workspaceId: string;
}) {
  const [balances, policies, requests] = await Promise.all([
    listTimeOffBalances(employeeId),
    listTimeOffPolicies(workspaceId),
    listMyTimeOffRequests(workspaceId, employeeId),
  ]);
  const policyById = new Map(policies.map((p) => [p.id, p]));
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-app">Balances</h3>
        {balances.length === 0 ? (
          <p className="mt-2 text-xs text-muted">No balances initialised yet.</p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {balances.map((b) => {
              const p = policyById.get(b.policy_id);
              return (
                <div
                  key={b.id}
                  className="rounded-xl border border-app bg-app-elevated p-4"
                >
                  <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
                    {p?.name ?? "Policy"}
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-app">
                    {Number(b.balance_days).toFixed(1)}
                  </div>
                  <div className="text-xs text-muted">days available</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-app">Requests</h3>
        {requests.length === 0 ? (
          <p className="mt-2 text-xs text-muted">No requests yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-app bg-app-elevated">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                  <th className="px-3 py-2 text-left font-normal">Policy</th>
                  <th className="px-3 py-2 text-left font-normal">Dates</th>
                  <th className="px-3 py-2 text-left font-normal">Days</th>
                  <th className="px-3 py-2 text-left font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const p = policyById.get(r.policy_id);
                  return (
                    <tr key={r.id} className="border-b border-app last:border-b-0">
                      <td className="px-3 py-2 text-app">{p?.name ?? r.policy_id.slice(0, 6)}</td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                        {r.start_date} → {r.end_date}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-app">{Number(r.days).toFixed(1)}</td>
                      <td className="px-3 py-2">
                        <StatusPill status={r.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
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

/* ───────────────────────── Documents ───────────────────────── */

async function DocumentsTab({
  employeeId,
  canEdit,
}: {
  employeeId: string;
  canEdit: boolean;
}) {
  const docs = await listEmployeeDocuments(employeeId);
  return (
    <div className="space-y-4">
      {canEdit && (
        <p className="text-xs text-muted">
          You can add documents below. Files are stored via the workspace
          storage; this list tracks the metadata + expiry.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Kind</th>
              <th className="px-3 py-2 text-left font-normal">Name</th>
              <th className="px-3 py-2 text-left font-normal">Number</th>
              <th className="px-3 py-2 text-left font-normal">Issued</th>
              <th className="px-3 py-2 text-left font-normal">Expires</th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-faint">
                  No documents on file.
                </td>
              </tr>
            ) : (
              docs.map((d) => (
                <tr key={d.id} className="border-b border-app last:border-b-0">
                  <td className="px-3 py-2 text-app">{d.kind.replace("_", " ")}</td>
                  <td className="px-3 py-2 text-app">
                    {d.file_url ? (
                      <a
                        href={d.file_url}
                        className="hover:text-tool-accent"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {d.name}
                      </a>
                    ) : (
                      d.name
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-secondary">
                    {d.number ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-secondary">
                    {d.issued_at ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-secondary">
                        {d.expires_at ?? "—"}
                      </span>
                      <ExpiryBadge expiresAt={d.expires_at} />
                    </div>
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

/* ───────────────────────── Onboarding ───────────────────────── */

async function OnboardingTab({ employeeId }: { employeeId: string }) {
  const run = await getActiveOnboardingRun(employeeId);
  if (!run) {
    return (
      <p className="text-sm text-muted">
        No active onboarding run. An admin can start one from{" "}
        <Link href="/admin/people/onboarding" className="text-tool-accent hover:underline">
          /admin/people/onboarding
        </Link>
        .
      </p>
    );
  }
  return <OnboardingTaskList run={run} />;
}
