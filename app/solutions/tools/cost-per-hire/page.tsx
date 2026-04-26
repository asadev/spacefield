"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

// SHRM 2024 Talent Access Benchmarking Report: average cost-per-hire ~ $4,700.
// Time-to-hire median ~ 36 days (SHRM 2024). Use as context, not ground truth.
const SHRM_AVG_CPH = 4700;
const SHRM_MEDIAN_TTH_DAYS = 36;

interface RoleLine {
  id: string;
  role: string;
  hires: string;
  cost: string;
  daysToFill: string;
}

const ROLES_KEY = "solutions:cost-per-hire:roles:v1";

type Stage = "sourcing" | "screening" | "interview" | "offer";

const STAGE_META: Record<
  Stage,
  { label: string; sub: string; weightInternal: number }
> = {
  sourcing: {
    label: "Sourcing",
    sub: "Boards, referrals, employer brand",
    weightInternal: 0.25,
  },
  screening: {
    label: "Screening",
    sub: "Resumes, recruiter calls, agency intake",
    weightInternal: 0.3,
  },
  interview: {
    label: "Interview",
    sub: "Loops, assessments, background",
    weightInternal: 0.35,
  },
  offer: {
    label: "Offer",
    sub: "Negotiation, relocation, sign-on",
    weightInternal: 0.1,
  },
};

const STAGES: Stage[] = ["sourcing", "screening", "interview", "offer"];

// Foundation field — neutral border + bg-elevated, accent-on-focus.
const fieldInput =
  "w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-[0.85rem] tabular-nums text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-tool-accent focus:ring-1 focus:ring-tool-accent";

const inlineInput =
  "w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-sm text-[var(--text)] outline-none transition-colors focus:border-tool-accent focus:ring-1 focus:ring-tool-accent";

export default function CostPerHirePage() {
  const [internal, setInternal] = useState("60000");
  const [agencyFees, setAgencyFees] = useState("25000");
  const [jobBoards, setJobBoards] = useState("5000");
  const [backgroundChecks, setBackgroundChecks] = useState("2000");
  const [referralBonuses, setReferralBonuses] = useState("8000");
  const [relocation, setRelocation] = useState("0");
  const [hires, setHires] = useState("12");
  const [activeStage, setActiveStage] = useState<Stage>("sourcing");

  const [roles, setRoles] = useState<RoleLine[]>([
    { id: "r1", role: "Engineering", hires: "6", cost: "35000", daysToFill: "42" },
    { id: "r2", role: "Sales", hires: "3", cost: "12000", daysToFill: "28" },
    { id: "r3", role: "Support / Ops", hires: "3", cost: "8000", daysToFill: "21" },
  ]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ROLES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) setRoles(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(ROLES_KEY, JSON.stringify(roles));
    } catch {}
  }, [roles]);

  const { totalInternal, totalExternal, total, perHire } = useMemo(() => {
    const i = parseFloat(internal) || 0;
    const e =
      (parseFloat(agencyFees) || 0) +
      (parseFloat(jobBoards) || 0) +
      (parseFloat(backgroundChecks) || 0) +
      (parseFloat(referralBonuses) || 0) +
      (parseFloat(relocation) || 0);
    const n = parseFloat(hires) || 0;
    const t = i + e;
    return { totalInternal: i, totalExternal: e, total: t, perHire: n > 0 ? t / n : 0 };
  }, [internal, agencyFees, jobBoards, backgroundChecks, referralBonuses, relocation, hires]);

  const roleRows = useMemo(
    () =>
      roles.map((r) => {
        const h = parseFloat(r.hires) || 0;
        const c = parseFloat(r.cost) || 0;
        const d = parseFloat(r.daysToFill) || 0;
        return { ...r, perHire: h > 0 ? c / h : 0, totalCost: c, hiresN: h, days: d };
      }),
    [roles]
  );
  const totalRoleCost = roleRows.reduce((a, r) => a + r.totalCost, 0);
  const totalRoleHires = roleRows.reduce((a, r) => a + r.hiresN, 0);
  const avgDaysToFill =
    roleRows.reduce((a, r) => a + r.days * r.hiresN, 0) / (totalRoleHires || 1);

  const deltaVsShrm = perHire - SHRM_AVG_CPH;
  const verdict =
    perHire === 0
      ? { label: "Awaiting input", tone: "text-[var(--text-muted)]" }
      : deltaVsShrm < -500
      ? { label: "Well below US average — check you're not under-investing", tone: "text-tool-accent" }
      : Math.abs(deltaVsShrm) <= 1000
      ? { label: "In line with US average", tone: "text-tool-accent" }
      : deltaVsShrm < 5000
      ? { label: "Premium hiring — justify the spend", tone: "text-tool-accent" }
      : { label: "Expensive — leaks in the funnel, most likely", tone: "text-tool-accent" };

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  function updateRole(id: string, patch: Partial<RoleLine>) {
    setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // Recruiting funnel — distribute external spend across 4 stages with fixed
  // weights derived from typical mid-market splits. Internal spend split too.
  const funnelStages = useMemo(() => {
    const sourcing =
      (parseFloat(jobBoards) || 0) + (parseFloat(referralBonuses) || 0);
    const screening = (parseFloat(agencyFees) || 0) * 0.4;
    const interview =
      (parseFloat(agencyFees) || 0) * 0.6 + (parseFloat(backgroundChecks) || 0);
    const offer = parseFloat(relocation) || 0;
    const externalByStage: Record<Stage, number> = {
      sourcing,
      screening,
      interview,
      offer,
    };
    const stages = STAGES.map((key) => {
      const meta = STAGE_META[key];
      const cost = externalByStage[key] + totalInternal * meta.weightInternal;
      return { key, ...meta, cost };
    });
    const max = Math.max(...stages.map((s) => s.cost), 1);
    return stages.map((s) => ({
      ...s,
      pct: (s.cost / max) * 100,
      sharePct: total > 0 ? (s.cost / total) * 100 : 0,
    }));
  }, [jobBoards, referralBonuses, agencyFees, backgroundChecks, relocation, totalInternal, total]);

  const activeFunnel = funnelStages.find((s) => s.key === activeStage) ?? funnelStages[0];

  // Funnel conversion shape — drops candidate volume across stages so a CPH
  // shift in screening/interview reads as obvious leak surface area.
  const candidateFlow = useMemo(() => {
    const targetHires = parseFloat(hires) || 0;
    const conv = { sourcing: 1, screening: 0.18, interview: 0.06, offer: 0.012 };
    const top = targetHires > 0 ? targetHires / conv.offer : 0;
    return STAGES.map((key) => ({
      key,
      label: STAGE_META[key].label,
      candidates: Math.round(top * (conv as Record<Stage, number>)[key]),
    }));
  }, [hires]);

  const benchmarkPct = Math.min(100, (perHire / (SHRM_AVG_CPH * 3)) * 100);
  const benchmarkMarker = Math.min(100, (SHRM_AVG_CPH / (SHRM_AVG_CPH * 3)) * 100);

  const heroNumber = perHire || 0;

  return (
    <ToolShell
      category="HR & People"
      title="Cost-per-Hire Calculator"
      description="Sum recruiting costs, benchmark against SHRM 2024, and break down per-role spend and time-to-hire."
    >
      <div
        data-tool-theme="hr"
        data-tool="cost-per-hire"
        className="space-y-6 text-[var(--text-secondary)]"
      >
        {/* Hero — total CPH big number + benchmark strip */}
        <header className="tool-hero relative overflow-hidden rounded-2xl border border-[var(--border)] bg-tool-surface px-6 py-7 shadow-sm sm:px-9">
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                HR · Cost-per-Hire
              </div>
              <div className="mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.24em] text-tool-accent">
                Total cost-per-hire
              </div>
              <div className="mt-2 font-mono text-5xl font-bold tabular-nums text-[var(--text)] sm:text-6xl">
                {fmt(heroNumber)}
              </div>
              <div className={`mt-2 text-sm ${verdict.tone}`}>{verdict.label}</div>
            </div>
            <div className="grid min-w-[260px] grid-cols-3 gap-2 text-right">
              <HeroStat label="Hires" value={(parseFloat(hires) || 0).toString()} />
              <HeroStat label="Total spend" value={fmt(total)} />
              <HeroStat
                label="Avg days"
                value={`${avgDaysToFill ? avgDaysToFill.toFixed(0) : 0}d`}
              />
            </div>
          </div>

          {/* Benchmark strip */}
          <div className="relative mt-6">
            <div className="mb-1.5 flex items-center justify-between text-[0.6rem] uppercase tracking-[0.2em] text-[var(--text-muted)]">
              <span>You</span>
              <span>SHRM 2024 benchmark · {fmt(SHRM_AVG_CPH)}</span>
              <span>{fmt(SHRM_AVG_CPH * 3)}</span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]">
              <div
                className="absolute inset-y-0 left-0 bg-tool-accent transition-all"
                style={{ width: `${benchmarkPct}%`, opacity: 0.55 }}
              />
              <div
                className="absolute inset-y-0 z-10 w-px bg-[var(--text)]"
                style={{ left: `${benchmarkMarker}%` }}
                title="SHRM US average"
              />
            </div>
          </div>
        </header>

        {/* Recruiting funnel — sub-tabs as state buttons + stage-cost bars */}
        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-tool-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3">
            <div>
              <div className="text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                Recruiting funnel
              </div>
              <h3 className="text-sm font-semibold text-[var(--text)]">
                Cost per stage · sourcing → offer
              </h3>
            </div>
            <div className="font-mono text-[0.65rem] tabular-nums text-[var(--text-muted)]">
              {fmt(total)} / {parseFloat(hires) || 0} hires
            </div>
          </div>

          {/* Stage tabs (state buttons) */}
          <div className="border-b border-[var(--border)] px-5 pt-4">
            <div
              role="tablist"
              aria-label="Funnel stage"
              className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1 font-mono text-[0.6rem] uppercase tracking-[0.2em]"
            >
              {STAGES.map((s) => {
                const active = activeStage === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveStage(s)}
                    className={`rounded-md px-3 py-1.5 transition-colors ${
                      active
                        ? "bg-tool-accent text-white shadow-sm"
                        : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                    }`}
                  >
                    {STAGE_META[s].label}
                  </button>
                );
              })}
            </div>

            {/* Active-stage detail strip */}
            <div className="mt-4 grid grid-cols-1 gap-3 pb-4 sm:grid-cols-3">
              <StageDetail
                label="Stage cost"
                value={fmt(activeFunnel.cost)}
                sub={`${activeFunnel.sharePct.toFixed(0)}% of total spend`}
                emphasized
              />
              <StageDetail
                label="Cost per hire share"
                value={fmt((activeFunnel.cost / Math.max(parseFloat(hires) || 1, 1)))}
                sub="this stage / hire"
              />
              <StageDetail
                label="Candidates here"
                value={
                  candidateFlow
                    .find((c) => c.key === activeStage)
                    ?.candidates.toLocaleString() ?? "0"
                }
                sub="modelled funnel volume"
              />
            </div>
          </div>

          <div className="space-y-4 px-5 py-5">
            {funnelStages.map((s, idx) => {
              const active = s.key === activeStage;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setActiveStage(s.key)}
                  className={`group block w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                    active
                      ? "border-tool-accent bg-tool-accent-soft"
                      : "border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-[0.65rem] font-bold ${
                          active
                            ? "bg-tool-accent text-white"
                            : "bg-tool-accent-soft text-tool-accent"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--text)]">
                          {s.label}
                        </div>
                        <div className="truncate text-[0.65rem] text-[var(--text-muted)]">
                          {s.sub}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-sm font-semibold tabular-nums text-[var(--text)]">
                        {fmt(s.cost)}
                      </div>
                      <div className="font-mono text-[0.6rem] tabular-nums text-[var(--text-muted)]">
                        {s.sharePct.toFixed(0)}% of spend
                      </div>
                    </div>
                  </div>
                  <div className="relative mt-2 h-2.5 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]">
                    <div
                      className="h-full rounded-full bg-tool-accent transition-all"
                      style={{
                        width: `${Math.max(2, s.pct)}%`,
                        opacity: 0.45 + idx * 0.15,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Cost inputs — Internal + External */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel title="Internal costs" subtitle="Recruiter time, tooling">
            <div className="space-y-3">
              <NumField
                label="Recruiter + HR salaries allocated ($)"
                value={internal}
                onChange={setInternal}
                step="1000"
              />
              <NumField
                label="Number of hires in period"
                value={hires}
                onChange={setHires}
                step="1"
              />
            </div>
          </Panel>
          <Panel title="External costs" subtitle="Agencies, boards, checks">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumField
                label="Agency / search fees ($)"
                value={agencyFees}
                onChange={setAgencyFees}
                step="500"
              />
              <NumField
                label="Job boards / ads ($)"
                value={jobBoards}
                onChange={setJobBoards}
                step="500"
              />
              <NumField
                label="Background checks ($)"
                value={backgroundChecks}
                onChange={setBackgroundChecks}
                step="100"
              />
              <NumField
                label="Referral bonuses paid ($)"
                value={referralBonuses}
                onChange={setReferralBonuses}
                step="500"
              />
              <div className="sm:col-span-2">
                <NumField
                  label="Relocation / sign-on ($)"
                  value={relocation}
                  onChange={setRelocation}
                  step="500"
                />
              </div>
            </div>
          </Panel>
        </div>

        {/* Spend split summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Total internal" value={fmt(totalInternal)} />
          <KpiCard label="Total external" value={fmt(totalExternal)} />
          <KpiCard label="Total spend" value={fmt(total)} />
          <KpiCard label="Cost per hire" value={fmt(perHire)} emphasized />
        </div>

        {/* Benchmark comparison panel */}
        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-tool-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3">
            <div>
              <div className="text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                Benchmark comparison
              </div>
              <h3 className="text-sm font-semibold text-[var(--text)]">
                vs SHRM 2024 Talent Access Report
              </h3>
            </div>
            <span
              className={`rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[0.65rem] font-medium ${verdict.tone}`}
            >
              {verdict.label}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-3">
            <BenchmarkRow
              label="Your CPH"
              value={fmt(perHire)}
              sub="all-in cost / hires"
              emphasized
            />
            <BenchmarkRow
              label="SHRM US average"
              value={fmt(SHRM_AVG_CPH)}
              sub="median across industries"
            />
            <BenchmarkRow
              label="Δ vs benchmark"
              value={`${deltaVsShrm >= 0 ? "+" : ""}${fmt(deltaVsShrm)}`}
              sub={deltaVsShrm >= 0 ? "above benchmark" : "below benchmark"}
            />
          </div>
          <div className="border-t border-[var(--border)] px-5 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <BenchmarkRow
                label="Weighted avg days-to-hire"
                value={`${avgDaysToFill ? avgDaysToFill.toFixed(0) : 0} days`}
                sub={`SHRM median ${SHRM_MEDIAN_TTH_DAYS} days`}
              />
              <BenchmarkRow
                label="Total hires"
                value={(totalRoleHires || 0).toString()}
                sub={`Total role spend ${fmt(totalRoleCost)}`}
              />
            </div>
          </div>
        </section>

        {/* Per-role breakdown */}
        <Panel title="Per-role breakdown" subtitle="Costs and time-to-hire by team">
          <div className="space-y-2">
            <div className="hidden grid-cols-[1.2fr_0.7fr_1fr_0.9fr_0.9fr_auto] gap-2 px-1 text-[0.55rem] uppercase tracking-[0.18em] text-[var(--text-muted)] sm:grid">
              <span>Role</span>
              <span>Hires</span>
              <span>Cost ($)</span>
              <span>Days to fill</span>
              <span className="text-right">Cost/hire</span>
              <span />
            </div>
            {roles.map((r) => {
              const row = roleRows.find((x) => x.id === r.id)!;
              const overTth = row.days > SHRM_MEDIAN_TTH_DAYS * 1.4;
              return (
                <div
                  key={r.id}
                  className="grid grid-cols-2 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 sm:grid-cols-[1.2fr_0.7fr_1fr_0.9fr_0.9fr_auto] sm:border-0 sm:bg-transparent sm:p-0"
                >
                  <input
                    value={r.role}
                    onChange={(e) => updateRole(r.id, { role: e.target.value })}
                    className={inlineInput}
                    placeholder="Role"
                  />
                  <input
                    type="number"
                    value={r.hires}
                    onChange={(e) => updateRole(r.id, { hires: e.target.value })}
                    className={inlineInput}
                    min="0"
                  />
                  <input
                    type="number"
                    value={r.cost}
                    onChange={(e) => updateRole(r.id, { cost: e.target.value })}
                    className={inlineInput}
                    min="0"
                    step="500"
                  />
                  <input
                    type="number"
                    value={r.daysToFill}
                    onChange={(e) => updateRole(r.id, { daysToFill: e.target.value })}
                    className={`${inlineInput} ${overTth ? "text-tool-accent" : ""}`}
                    min="0"
                  />
                  <div className="text-right font-mono text-sm tabular-nums text-[var(--text)]">
                    {fmt(row.perHire)}
                  </div>
                  <button
                    onClick={() => setRoles((prev) => prev.filter((x) => x.id !== r.id))}
                    className="px-2 text-xs text-[var(--text-faint)] transition-colors hover:text-tool-accent"
                    aria-label="Remove role"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              onClick={() =>
                setRoles((prev) => [
                  ...prev,
                  {
                    id: `r${Date.now()}`,
                    role: "New role",
                    hires: "1",
                    cost: "5000",
                    daysToFill: "30",
                  },
                ])
              }
              className="mt-2 rounded-md border border-[var(--border)] bg-tool-accent-soft px-3 py-1.5 text-xs font-medium text-tool-accent transition-colors hover:bg-tool-accent hover:text-white"
            >
              + Add role
            </button>
          </div>
        </Panel>

        <p className="text-[0.65rem] text-[var(--text-muted)]">
          Source: SHRM 2024 Talent Access Benchmarking Report (avg cost-per-hire $4,700;
          median time-to-hire 36 days).
        </p>
      </div>
    </ToolShell>
  );
}

/* ── Visual sub-components (presentational only) ───────────────────────── */

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-tool-surface">
      <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3">
        <div className="text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
          {title}
        </div>
        {subtitle && (
          <div className="text-sm font-semibold text-[var(--text)]">{subtitle}</div>
        )}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function NumField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={fieldInput}
        min="0"
        step={step}
      />
    </label>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-2 text-right">
      <div className="text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--text)]">
        {value}
      </div>
    </div>
  );
}

function StageDetail({
  label,
  value,
  sub,
  emphasized = false,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border p-3 " +
        (emphasized
          ? "border-tool-accent bg-tool-accent-soft"
          : "border-[var(--border)] bg-[var(--bg-elevated)]")
      }
    >
      <div
        className={
          "text-[0.6rem] font-semibold uppercase tracking-[0.18em] " +
          (emphasized ? "text-tool-accent" : "text-[var(--text-muted)]")
        }
      >
        {label}
      </div>
      <div
        className={
          "mt-1 font-mono tabular-nums " +
          (emphasized
            ? "text-lg font-bold text-tool-accent"
            : "text-base font-semibold text-[var(--text)]")
        }
      >
        {value}
      </div>
      {sub && <div className="text-[0.6rem] text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}

function KpiCard({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border p-3 transition-colors " +
        (emphasized
          ? "border-tool-accent bg-tool-accent-soft"
          : "border-[var(--border)] bg-tool-surface")
      }
    >
      <div
        className={
          "text-[0.6rem] font-semibold uppercase tracking-[0.2em] " +
          (emphasized ? "text-tool-accent" : "text-[var(--text-muted)]")
        }
      >
        {label}
      </div>
      <div
        className={
          "mt-1 font-mono tabular-nums " +
          (emphasized
            ? "text-xl font-bold text-tool-accent"
            : "text-lg font-semibold text-[var(--text)]")
        }
      >
        {value}
      </div>
    </div>
  );
}

function BenchmarkRow({
  label,
  value,
  sub,
  emphasized = false,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border p-3 " +
        (emphasized
          ? "border-tool-accent bg-tool-accent-soft"
          : "border-[var(--border)] bg-[var(--bg-elevated)]")
      }
    >
      <div className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {label}
      </div>
      <div
        className={
          "mt-0.5 font-mono text-lg font-bold tabular-nums " +
          (emphasized ? "text-tool-accent" : "text-[var(--text)]")
        }
      >
        {value}
      </div>
      {sub && <div className="text-[0.65rem] text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}
