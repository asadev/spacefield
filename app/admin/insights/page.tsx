import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatBytes, formatDateTime } from "../_lib";

import { ChartLegend, MultiLineChart, SingleLineChart } from "./_components/Charts";

export const dynamic = "force-dynamic";

const STORAGE_DOLLAR_PER_GB_MONTH = 0.015;

type RangeKey = "7d" | "30d" | "90d";

const RANGE_DAYS: Record<RangeKey, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function parseRange(value: string | undefined): RangeKey {
  const v = (value ?? "").toLowerCase();
  if (v === "7d" || v === "90d") return v;
  return "30d";
}

type SubscriptionRow = {
  user_id: string;
  tier_id: string;
  status: string;
  started_at: string;
};

type TierRow = {
  tier_id: string;
  price_cents_monthly: number;
};

type PaddleRow = {
  event_id: string;
  type: string;
  payload: Record<string, unknown>;
  received_at: string;
};

type CreditEventRow = {
  workspace_id: string;
  tokens: number;
  model: string;
  call_kind: string;
  bucket: string;
  created_at: string;
};

type ModelCostRow = {
  id: string;
  cost_input_per_million: number;
  cost_output_per_million: number;
};

type WorkspaceFileRow = {
  workspace_id: string;
  size_bytes: number;
  deleted_at: string | null;
};

type WorkspaceLite = {
  id: string;
  name: string | null;
  slug: string;
};

type AuthEventLite = {
  user_id: string | null;
  created_at: string;
};

type FailedPayment = {
  event_id: string;
  type: string;
  received_at: string;
  amount_cents: number | null;
  currency: string | null;
  email: string | null;
};

export default async function AdminInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const days = RANGE_DAYS[range];

  const admin = createAdminClient();

  const now = new Date();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const since30d = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since7d = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sinceRange = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  // For DAU/WAU/MAU we need 12 months of monthly data.
  const since12mo = new Date(today);
  since12mo.setUTCMonth(since12mo.getUTCMonth() - 12);

  const [
    subsRes,
    tiersRes,
    paddleRecentRes,
    paddleFailedRes,
    creditEventsRes,
    modelsRes,
    filesRes,
    workspacesRes,
    authEvents12moRes,
  ] = await Promise.all([
    admin
      .from("subscriptions")
      .select("user_id, tier_id, status, started_at"),
    admin
      .from("subscription_tiers")
      .select("tier_id, price_cents_monthly"),
    admin
      .from("paddle_webhook_events")
      .select("event_id, type, payload, received_at")
      .gte("received_at", since30d.toISOString())
      .order("received_at", { ascending: false }),
    admin
      .from("paddle_webhook_events")
      .select("event_id, type, payload, received_at")
      .gte("received_at", since7d.toISOString())
      .ilike("type", "%failed%")
      .order("received_at", { ascending: false })
      .limit(100),
    admin
      .from("agent_credit_events")
      .select("workspace_id, tokens, model, call_kind, bucket, created_at")
      .gte("created_at", sinceRange.toISOString())
      .order("created_at", { ascending: false })
      .limit(100000),
    admin
      .from("ai_models")
      .select("id, cost_input_per_million, cost_output_per_million"),
    admin
      .from("workspace_files")
      .select("workspace_id, size_bytes, deleted_at"),
    admin.from("workspaces").select("id, name, slug"),
    admin
      .from("auth_events")
      .select("user_id, created_at")
      .gte("created_at", since12mo.toISOString())
      .limit(200000),
  ]);

  const subs = (subsRes.data ?? []) as SubscriptionRow[];
  const tiers = (tiersRes.data ?? []) as TierRow[];
  const paddleRecent = (paddleRecentRes.data ?? []) as PaddleRow[];
  const paddleFailed = (paddleFailedRes.data ?? []) as PaddleRow[];
  const credits = (creditEventsRes.data ?? []) as CreditEventRow[];
  const models = (modelsRes.data ?? []) as ModelCostRow[];
  const files = (filesRes.data ?? []) as WorkspaceFileRow[];
  const workspaces = (workspacesRes.data ?? []) as WorkspaceLite[];
  const authEvents = (authEvents12moRes.data ?? []) as AuthEventLite[];

  /* ───────────────────────── top stats ───────────────────────── */

  const tierPriceMap = new Map<string, number>(
    tiers.map((t) => [t.tier_id, Number(t.price_cents_monthly) || 0])
  );

  const activeSubs = subs.filter(
    (s) => s.status === "active" || s.status === "trialing"
  );
  const mrrCents = activeSubs.reduce(
    (acc, s) => acc + (tierPriceMap.get(s.tier_id) ?? 0),
    0
  );

  // "Paying users" = active subs on a non-free tier.
  const payingUsers = activeSubs.filter(
    (s) => (tierPriceMap.get(s.tier_id) ?? 0) > 0
  ).length;

  // 30d revenue: sum amounts on `transaction.completed` paddle events.
  let revenue30dCents = 0;
  const seenTxn = new Set<string>();
  for (const ev of paddleRecent) {
    if (ev.type !== "transaction.completed") continue;
    const amount = extractPaddleAmountCents(ev.payload);
    if (amount === null) continue;
    if (seenTxn.has(ev.event_id)) continue;
    seenTxn.add(ev.event_id);
    revenue30dCents += amount;
  }

  // Churn rate = canceled in last 30d / active at start of period.
  // Approximation: "canceled in last 30d" = subscriptions whose status is
  // canceled and whose updated row sits within the window. We don't have
  // an `updated_at` on `subscriptions` exposed here, so we approximate
  // using paddle subscription.canceled events.
  const canceledLast30d = paddleRecent.filter((ev) =>
    ev.type.toLowerCase().includes("subscription.canceled")
  ).length;
  const startOfPeriodActives = activeSubs.length + canceledLast30d;
  const churnPct =
    startOfPeriodActives > 0
      ? (canceledLast30d / startOfPeriodActives) * 100
      : 0;

  /* ────────────────────── AI spend per call_kind ────────────────────── */

  const modelCost = new Map<string, ModelCostRow>(
    models.map((m) => [m.id, m])
  );

  // Build daily buckets between sinceRange and today.
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    dayKeys.push(d.toISOString().slice(0, 10));
  }

  const callKinds = new Set<string>();
  // Map of dayKey → { call_kind → spend in cents }
  const spendByDay = new Map<string, Map<string, number>>();
  for (const k of dayKeys) {
    spendByDay.set(k, new Map());
  }

  // Per-workspace AI spend across the window.
  const wsSpend = new Map<string, number>();

  for (const ev of credits) {
    const day = ev.created_at.slice(0, 10);
    const kind = ev.call_kind || "unknown";
    callKinds.add(kind);
    const cost = costForCreditEvent(ev, modelCost);
    if (cost <= 0) continue;
    const bucket = spendByDay.get(day);
    if (bucket) {
      bucket.set(kind, (bucket.get(kind) ?? 0) + cost);
    }
    if (ev.workspace_id) {
      wsSpend.set(ev.workspace_id, (wsSpend.get(ev.workspace_id) ?? 0) + cost);
    }
  }

  const seriesKeys = Array.from(callKinds).sort();
  const lineData = dayKeys.map((day) => {
    const bucket = spendByDay.get(day);
    const values: Record<string, number> = {};
    for (const k of seriesKeys) {
      // Convert cents back to dollars for the chart Y-axis.
      values[k] = (bucket?.get(k) ?? 0) / 100;
    }
    return { day, values };
  });

  /* ───────────────── Top 10 expensive workspaces ───────────────── */

  const wsName = new Map<string, string>(
    workspaces.map((w) => [w.id, w.name ?? w.slug ?? w.id.slice(0, 8)])
  );

  const topAiWorkspaces = Array.from(wsSpend.entries())
    .map(([id, cents]) => ({
      id,
      name: wsName.get(id) ?? id.slice(0, 8),
      spendCents: cents,
    }))
    .sort((a, b) => b.spendCents - a.spendCents)
    .slice(0, 10);

  /* ───────────────── Storage spend by workspace ───────────────── */

  const wsBytes = new Map<string, number>();
  for (const f of files) {
    if (f.deleted_at) continue;
    wsBytes.set(
      f.workspace_id,
      (wsBytes.get(f.workspace_id) ?? 0) + Number(f.size_bytes ?? 0)
    );
  }

  const topStorage = Array.from(wsBytes.entries())
    .map(([id, bytes]) => {
      const gb = bytes / (1024 * 1024 * 1024);
      return {
        id,
        name: wsName.get(id) ?? id.slice(0, 8),
        bytes,
        gb,
        monthlyCost: gb * STORAGE_DOLLAR_PER_GB_MONTH,
      };
    })
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10);

  const totalStorageBytes = Array.from(wsBytes.values()).reduce(
    (acc, b) => acc + b,
    0
  );
  const totalStorageGb = totalStorageBytes / (1024 * 1024 * 1024);
  const totalStorageCost = totalStorageGb * STORAGE_DOLLAR_PER_GB_MONTH;

  /* ───────────────── Failed payments last 7d ───────────────── */

  const failedPayments: FailedPayment[] = paddleFailed.map((ev) => ({
    event_id: ev.event_id,
    type: ev.type,
    received_at: ev.received_at,
    amount_cents: extractPaddleAmountCents(ev.payload),
    currency: extractPaddleCurrency(ev.payload),
    email: extractPaddleEmail(ev.payload),
  }));

  /* ───────────────── DAU / WAU / MAU ───────────────── */

  const dau = buildDailyDistinct(authEvents, 30);
  const wau = buildWeeklyDistinct(authEvents, 12);
  const mau = buildMonthlyDistinct(authEvents, 12);

  /* ───────────────────── render ───────────────────── */

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Ops
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">
            Cost &amp; insights
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Business health + cloud spend in one view. Read-only.
          </p>
        </div>
      </header>

      {/* Top stat cards */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="MRR"
          value={formatUsd(mrrCents / 100)}
          sub={`${activeSubs.length} active subs`}
          accent="#10b981"
        />
        <StatCard
          label="Paying users"
          value={payingUsers.toLocaleString()}
          sub={`of ${activeSubs.length.toLocaleString()} active`}
          accent="#3b82f6"
        />
        <StatCard
          label="Revenue 30d"
          value={formatUsd(revenue30dCents / 100)}
          sub={`${seenTxn.size.toLocaleString()} txns`}
          accent="#a855f7"
        />
        <StatCard
          label="Churn 30d"
          value={`${churnPct.toFixed(1)}%`}
          sub={`${canceledLast30d.toLocaleString()} canceled`}
          accent="#ef4444"
        />
      </section>

      {/* AI spend chart with date range */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
              AI spend by call_kind
            </div>
            <h2 className="mt-1 text-sm font-semibold text-app">
              Last {days} days
            </h2>
          </div>
          <RangeSelector range={range} />
        </div>
        <div className="mt-4">
          <MultiLineChart
            data={lineData}
            seriesKeys={seriesKeys}
            height={220}
            valueFormatter={(v) => `$${v.toFixed(2)}`}
            ariaLabel={`AI spend per day, last ${days} days, grouped by call_kind`}
          />
        </div>
        {seriesKeys.length > 0 && (
          <div className="mt-3">
            <ChartLegend seriesKeys={seriesKeys} />
          </div>
        )}
        <div className="mt-3 text-[11px] text-faint">
          Window total:{" "}
          <span className="font-mono tabular-nums text-secondary">
            {formatUsd(
              lineData.reduce(
                (acc, d) => acc + Object.values(d.values).reduce((a, b) => a + b, 0),
                0
              )
            )}
          </span>
        </div>
      </section>

      {/* Top expensive workspaces + storage */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-app bg-app-elevated">
          <header className="flex items-baseline justify-between border-b border-app px-3 py-2">
            <h2 className="text-sm font-semibold text-app">
              Top 10 AI-spend workspaces
            </h2>
            <span className="text-[11px] text-faint">last {days}d</span>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Workspace</th>
                <th className="px-3 py-2 text-right font-normal">Spend</th>
              </tr>
            </thead>
            <tbody>
              {topAiWorkspaces.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-3 py-8 text-center text-faint"
                  >
                    No AI spend in window.
                  </td>
                </tr>
              ) : (
                topAiWorkspaces.map((w) => (
                  <tr
                    key={w.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/workspaces/${w.id}`}
                        className="text-app hover:text-tool-accent"
                        title={w.id}
                      >
                        <span className="line-clamp-1 break-all">
                          {w.name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-app">
                      {formatUsd(w.spendCents / 100)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-app bg-app-elevated">
          <header className="flex items-baseline justify-between border-b border-app px-3 py-2">
            <h2 className="text-sm font-semibold text-app">
              Storage spend by workspace
            </h2>
            <span className="text-[11px] text-faint">
              total {formatBytes(totalStorageBytes)} ·{" "}
              {formatUsd(totalStorageCost)}/mo
            </span>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Workspace</th>
                <th className="px-3 py-2 text-right font-normal">Size</th>
                <th className="px-3 py-2 text-right font-normal">$/mo</th>
              </tr>
            </thead>
            <tbody>
              {topStorage.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-8 text-center text-faint"
                  >
                    No files yet.
                  </td>
                </tr>
              ) : (
                topStorage.map((w) => (
                  <tr
                    key={w.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/workspaces/${w.id}`}
                        className="text-app hover:text-tool-accent"
                        title={w.id}
                      >
                        <span className="line-clamp-1 break-all">
                          {w.name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-app">
                      {formatBytes(w.bytes)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-secondary">
                      {formatUsd(w.monthlyCost)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="border-t border-app px-3 py-2 text-[10px] text-faint">
            estimated at ${STORAGE_DOLLAR_PER_GB_MONTH.toFixed(3)}/GB-month (R2)
          </div>
        </div>
      </section>

      {/* Failed payments + DAU/WAU/MAU */}
      <section className="rounded-xl border border-app bg-app-elevated">
        <header className="flex items-baseline justify-between border-b border-app px-3 py-2">
          <h2 className="text-sm font-semibold text-app">
            Failed payments — last 7d
          </h2>
          <span className="text-[11px] text-faint">
            {failedPayments.length.toLocaleString()} events
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">When</th>
                <th className="px-3 py-2 text-left font-normal">Type</th>
                <th className="px-3 py-2 text-left font-normal">Email</th>
                <th className="px-3 py-2 text-right font-normal">Amount</th>
                <th className="px-3 py-2 text-left font-normal">Event ID</th>
              </tr>
            </thead>
            <tbody>
              {failedPayments.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-faint"
                  >
                    No failed payments in window.
                  </td>
                </tr>
              ) : (
                failedPayments.map((p) => (
                  <tr
                    key={p.event_id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(p.received_at)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-500">
                        {p.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-app">
                      <span className="line-clamp-1 break-all">
                        {p.email ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-secondary">
                      {p.amount_cents !== null
                        ? `${(p.amount_cents / 100).toFixed(2)} ${p.currency ?? ""}`.trim()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-faint">
                      {p.event_id.slice(0, 12)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <ActivityChart
          title="DAU"
          subtitle="last 30 days"
          values={dau.values}
          labels={dau.labels}
          stroke="#3b82f6"
          ariaLabel="Daily active users — distinct user_id from auth_events per day, last 30 days"
        />
        <ActivityChart
          title="WAU"
          subtitle="last 12 weeks"
          values={wau.values}
          labels={wau.labels}
          stroke="#10b981"
          ariaLabel="Weekly active users — distinct user_id from auth_events per week, last 12 weeks"
        />
        <ActivityChart
          title="MAU"
          subtitle="last 12 months"
          values={mau.values}
          labels={mau.labels}
          stroke="#a855f7"
          ariaLabel="Monthly active users — distinct user_id from auth_events per month, last 12 months"
        />
      </section>
    </div>
  );
}

/* ───────────────────────── components ───────────────────────── */

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {accent ? (
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: accent }}
          />
        ) : null}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-app">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

function RangeSelector({ range }: { range: RangeKey }) {
  const opts: Array<{ k: RangeKey; label: string }> = [
    { k: "7d", label: "7 days" },
    { k: "30d", label: "30 days" },
    { k: "90d", label: "90 days" },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated text-xs">
      {opts.map((o) => {
        const params = new URLSearchParams();
        params.set("range", o.k);
        const active = range === o.k;
        return (
          <Link
            key={o.k}
            href={`/admin/insights?${params.toString()}`}
            className={`px-3 py-1.5 transition-colors ${
              active
                ? "bg-tool-accent text-white"
                : "text-secondary hover:text-app"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

function ActivityChart({
  title,
  subtitle,
  values,
  labels,
  stroke,
  ariaLabel,
}: {
  title: string;
  subtitle: string;
  values: number[];
  labels: string[];
  stroke: string;
  ariaLabel?: string;
}) {
  const peak = values.length ? Math.max(...values) : 0;
  const last = values.length ? values[values.length - 1] : 0;
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            {title}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">{subtitle}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg tabular-nums text-app">
            {last.toLocaleString()}
          </div>
          <div className="text-[10px] text-faint">peak {peak.toLocaleString()}</div>
        </div>
      </div>
      <div className="mt-3">
        <SingleLineChart
          values={values}
          labels={labels}
          stroke={stroke}
          ariaLabel={ariaLabel}
        />
      </div>
    </div>
  );
}

/* ───────────────────────── helpers ───────────────────────── */

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  if (Math.abs(value) >= 1000) {
    return `$${value.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })}`;
  }
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Estimate cost (in cents) for a single agent_credit_event row.
 *
 * The events table records `tokens` as a single combined number (the
 * runtime currently sums input + output). We don't have separate
 * input/output token columns, so we use the model's average per-million
 * cost (input + output) / 2 as a reasonable midpoint. Returns 0 when
 * the model's cost data is missing.
 */
function costForCreditEvent(
  ev: CreditEventRow,
  modelCost: Map<string, ModelCostRow>
): number {
  const tokens = Number(ev.tokens) || 0;
  if (tokens <= 0) return 0;
  const m = modelCost.get(ev.model);
  if (!m) return 0;
  const avgPerMillion =
    (Number(m.cost_input_per_million) + Number(m.cost_output_per_million)) / 2;
  if (!avgPerMillion) return 0;
  // Convert dollars-per-million to cents.
  return (tokens * avgPerMillion * 100) / 1_000_000;
}

function buildDailyDistinct(
  events: AuthEventLite[],
  days: number
): { values: number[]; labels: string[] } {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const buckets = new Map<string, Set<string>>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    buckets.set(d.toISOString().slice(0, 10), new Set());
  }
  for (const e of events) {
    if (!e.user_id) continue;
    const day = e.created_at.slice(0, 10);
    const set = buckets.get(day);
    if (set) set.add(e.user_id);
  }
  const labels: string[] = [];
  const values: number[] = [];
  for (const [day, set] of buckets.entries()) {
    labels.push(day.slice(5));
    values.push(set.size);
  }
  return { values, labels };
}

function buildWeeklyDistinct(
  events: AuthEventLite[],
  weeks: number
): { values: number[]; labels: string[] } {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // Anchor to the most recent Monday.
  const monday = new Date(today);
  const dow = monday.getUTCDay();
  // ISO week starts Monday — shift back to Mon.
  const offset = (dow + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - offset);

  const weekStarts: Date[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const d = new Date(monday.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    weekStarts.push(d);
  }
  const buckets = weekStarts.map(() => new Set<string>());

  for (const e of events) {
    if (!e.user_id) continue;
    const t = Date.parse(e.created_at);
    if (Number.isNaN(t)) continue;
    // Find the week index by binary-ish linear scan (12 weeks max).
    for (let i = weekStarts.length - 1; i >= 0; i -= 1) {
      const ws = weekStarts[i].getTime();
      const we = ws + 7 * 24 * 60 * 60 * 1000;
      if (t >= ws && t < we) {
        buckets[i].add(e.user_id);
        break;
      }
    }
  }
  return {
    values: buckets.map((s) => s.size),
    labels: weekStarts.map((d) => d.toISOString().slice(5, 10)),
  };
}

function buildMonthlyDistinct(
  events: AuthEventLite[],
  months: number
): { values: number[]; labels: string[] } {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const monthStarts: Date[] = [];
  const baseYear = today.getUTCFullYear();
  const baseMonth = today.getUTCMonth();
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(baseYear, baseMonth - i, 1));
    monthStarts.push(d);
  }
  const buckets = monthStarts.map(() => new Set<string>());
  for (const e of events) {
    if (!e.user_id) continue;
    const t = new Date(e.created_at);
    if (Number.isNaN(t.getTime())) continue;
    const yyyymm = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
    for (let i = 0; i < monthStarts.length; i += 1) {
      const ms = monthStarts[i];
      const msKey = `${ms.getUTCFullYear()}-${String(ms.getUTCMonth() + 1).padStart(2, "0")}`;
      if (msKey === yyyymm) {
        buckets[i].add(e.user_id);
        break;
      }
    }
  }
  return {
    values: buckets.map((s) => s.size),
    labels: monthStarts.map((d) =>
      `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCFullYear()).slice(2)}`
    ),
  };
}

/* ───── Paddle payload extractors. Defensive — payloads vary by event ───── */

function extractPaddleAmountCents(
  payload: Record<string, unknown> | null | undefined
): number | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: Record<string, unknown> }).data;
  if (!data || typeof data !== "object") return null;

  const details = (data as { details?: Record<string, unknown> }).details;
  if (details && typeof details === "object") {
    const totals = (details as { totals?: Record<string, unknown> }).totals;
    if (totals && typeof totals === "object") {
      const grand = (totals as { grand_total?: string | number }).grand_total;
      if (typeof grand === "string" && /^-?\d+$/.test(grand)) return Number(grand);
      if (typeof grand === "number") return grand;
    }
  }

  const items = (data as { items?: unknown[] }).items;
  if (Array.isArray(items)) {
    let cents = 0;
    for (const it of items) {
      if (it && typeof it === "object") {
        const t = (it as { totals?: Record<string, unknown> }).totals;
        if (t && typeof t === "object") {
          const g = (t as { total?: string | number }).total;
          if (typeof g === "string" && /^-?\d+$/.test(g)) cents += Number(g);
          else if (typeof g === "number") cents += g;
        }
      }
    }
    if (cents > 0) return cents;
  }

  return null;
}

function extractPaddleCurrency(
  payload: Record<string, unknown> | null | undefined
): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: Record<string, unknown> }).data;
  if (!data || typeof data !== "object") return null;
  const cc = (data as { currency_code?: string }).currency_code;
  return typeof cc === "string" ? cc : null;
}

function extractPaddleEmail(
  payload: Record<string, unknown> | null | undefined
): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: Record<string, unknown> }).data;
  if (!data || typeof data !== "object") return null;
  const customer = (data as { customer?: Record<string, unknown> }).customer;
  if (customer && typeof customer === "object") {
    const e = (customer as { email?: string }).email;
    if (typeof e === "string") return e;
  }
  const email = (data as { email?: string }).email;
  return typeof email === "string" ? email : null;
}
