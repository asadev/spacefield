import Link from "next/link";
import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AiCostSummaryRow } from "@/lib/ai/cost";
import { withLatencyBudget } from "@/lib/perf/budgets";
import { releaseInfo } from "@/lib/release-info";

export const dynamic = "force-dynamic";

/**
 * /admin/insights/health — single-pane health dashboard.
 *
 * Aggregates the production-readiness signals an on-call admin wants
 * at 3am into one read-only screen:
 *
 *   1. /api/health deep-mode probe (Supabase REST, commit SHA, region)
 *   2. 24h api_latency_summary RPC (request volume, worst p95, error rate)
 *   3. 24h ai_cost_summary RPC (calls, tokens, cost in USD)
 *   4. Latest 5 anomaly + stuck-job notifications
 *   5. Workflow + AI-batch rows currently in status='stuck'
 *
 * Server component, no client JS. Uses the same SVG bar charts pattern
 * as the rest of /admin/insights so visual style is consistent.
 */

type LatencyRow = {
  source: string;
  count: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  err_rate: number;
};

type HealthProbe = { name: string; ok: boolean; ms: number; detail?: string };

interface HealthResponse {
  ok: boolean;
  status: string;
  checked_at: string;
  probes: HealthProbe[];
  commit?: string | null;
  region?: string | null;
  /** Local-only annotation: did we reach the endpoint at all? */
  reachable: boolean;
  /** Set when reachable=false. */
  error?: string;
}

type NotificationLite = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  created_at: string;
};

/**
 * Build the absolute URL for an internal API call from a server
 * component. Prefers VERCEL_URL (cleaner on previews), falls back to
 * x-forwarded-host / host from the inbound request.
 */
async function selfBaseUrl(): Promise<string> {
  const h = await headers();
  const fwdHost = h.get("x-forwarded-host");
  const host = fwdHost ?? h.get("host");
  const proto =
    h.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "development" ? "http" : "https");
  if (host) return `${proto}://${host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Probe /api/health with deep=1 + the HEALTH_DEEP_TOKEN (or CRON_SECRET
 * fallback) so the response includes commit + region. We don't ever
 * surface the token in the rendered HTML — it stays server-side.
 */
async function probeHealth(): Promise<HealthResponse> {
  const token =
    process.env.HEALTH_DEEP_TOKEN || process.env.CRON_SECRET || "";
  const base = await selfBaseUrl();
  const url = `${base}/api/health?deep=1`;
  try {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    const body = (await res.json()) as Omit<HealthResponse, "reachable">;
    return { ...body, reachable: true };
  } catch (err) {
    return {
      ok: false,
      status: "unreachable",
      checked_at: new Date().toISOString(),
      probes: [],
      reachable: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function AdminHealthPage() {
  return withLatencyBudget("admin.insights.health", () => renderPage());
}

async function renderPage() {
  const admin = createAdminClient();
  const release = releaseInfo();

  // Fire everything in parallel — none of these depend on each other.
  const [
    healthRes,
    latencyRes,
    aiCostRes,
    notifsRes,
    workflowStuckRes,
    batchStuckRes,
  ] = await Promise.all([
    probeHealth(),
    admin.rpc("api_latency_summary", { p_window_minutes: 1440 }),
    admin.rpc("ai_cost_summary", {
      p_window_minutes: 1440,
      p_workspace_id: null,
    }),
    admin
      .from("notifications")
      .select("id, kind, title, body, created_at")
      .in("kind", ["ops.anomaly.latency", "ops.jobs.stuck"])
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("workflow_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "stuck"),
    admin
      .from("ai_batch_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "stuck"),
  ]);

  const latency = (latencyRes.data ?? []) as LatencyRow[];
  const aiCost = (aiCostRes.data ?? []) as AiCostSummaryRow[];
  const notifs = (notifsRes.data ?? []) as NotificationLite[];

  /* ──────────────── derive top-line numbers ──────────────── */

  const reqCount = latency.reduce((acc, r) => acc + Number(r.count ?? 0), 0);
  const worstP95 = latency.reduce(
    (acc, r) => (Number(r.p95_ms ?? 0) > acc ? Number(r.p95_ms) : acc),
    0,
  );
  const weightedErr =
    reqCount > 0
      ? latency.reduce(
          (acc, r) =>
            acc + Number(r.err_rate ?? 0) * Number(r.count ?? 0),
          0,
        ) / reqCount
      : 0;

  const aiCalls = aiCost.reduce((acc, r) => acc + Number(r.calls ?? 0), 0);
  const aiCost24hUsd = aiCost.reduce(
    (acc, r) => acc + Number(r.cost_usd ?? 0),
    0,
  );

  const workflowStuck = workflowStuckRes.count ?? 0;
  const batchStuck = batchStuckRes.count ?? 0;
  const totalStuck = workflowStuck + batchStuck;

  /* ──────────────── chart series ──────────────── */

  // Top-5 sources by request count → bar chart.
  const topSources = latency
    .slice()
    .sort((a, b) => Number(b.count) - Number(a.count))
    .slice(0, 5)
    .map((r) => ({ label: r.source, value: Number(r.p95_ms ?? 0) }));

  // Top-5 AI models by cost → bar chart.
  const topModels = aiCost
    .slice()
    .sort((a, b) => Number(b.cost_usd) - Number(a.cost_usd))
    .slice(0, 5)
    .map((r) => ({ label: r.model || "unknown", value: Number(r.cost_usd) }));

  // p95 distribution band: count of sources in each bucket.
  const p95Bands = bandify(
    latency.map((r) => Number(r.p95_ms ?? 0)),
    [100, 250, 500, 1000, 2500],
  );

  /* ──────────────── render ──────────────── */

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Observability
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Health</h1>
          <p className="mt-0.5 text-xs text-muted">
            Operator-grade snapshot of {" "}
            <code className="rounded bg-app px-1 text-[11px]">
              /api/health
            </code>{" "}
            + 24h latency + 24h AI spend + anomaly inbox + stuck jobs.
            Read-only.
          </p>
        </div>
        <div className="text-right text-[10px] text-faint">
          <div>
            commit{" "}
            <code className="text-secondary">
              {healthRes.commit ?? release.commit}
            </code>
          </div>
          <div>
            region{" "}
            <code className="text-secondary">
              {healthRes.region ?? release.region}
            </code>
          </div>
          <div>env {release.env}</div>
        </div>
      </header>

      {/* Five stat tiles */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label="Status"
          value={healthRes.ok ? "Healthy" : healthRes.status}
          accent={
            healthRes.ok
              ? "emerald"
              : healthRes.reachable
              ? "rose"
              : "amber"
          }
          sub={`checked ${formatRelative(healthRes.checked_at)}`}
        />
        <StatTile
          label="24h requests"
          value={reqCount.toLocaleString()}
          sub={`${latency.length} sources`}
          accent="emerald"
        />
        <StatTile
          label="Worst p95"
          value={`${worstP95.toLocaleString()} ms`}
          sub="latency last 24h"
          accent={
            worstP95 > 1500
              ? "rose"
              : worstP95 > 800
              ? "amber"
              : "emerald"
          }
        />
        <StatTile
          label="Weighted error"
          value={`${(weightedErr * 100).toFixed(2)}%`}
          sub="last 24h"
          accent={
            weightedErr > 0.05
              ? "rose"
              : weightedErr > 0.01
              ? "amber"
              : "emerald"
          }
        />
        <StatTile
          label="Stuck jobs"
          value={totalStuck.toLocaleString()}
          sub={`${workflowStuck} workflow · ${batchStuck} batch`}
          accent={
            totalStuck > 0 ? (totalStuck > 5 ? "rose" : "amber") : "emerald"
          }
        />
      </section>

      {/* Probes detail */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <header className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-app">Probes</h2>
          <span className="text-[11px] text-faint">
            from /api/health deep mode
          </span>
        </header>
        {healthRes.reachable ? (
          <ul className="mt-3 space-y-1.5">
            {healthRes.probes.length === 0 ? (
              <li className="text-xs text-faint">No probes returned.</li>
            ) : (
              healthRes.probes.map((p) => (
                <li
                  key={p.name}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        p.ok ? "bg-emerald-500" : "bg-rose-500"
                      }`}
                    />
                    <span className="font-mono text-app">{p.name}</span>
                    {p.detail ? (
                      <span className="text-faint">— {p.detail}</span>
                    ) : null}
                  </span>
                  <span className="font-mono tabular-nums text-secondary">
                    {p.ms} ms
                  </span>
                </li>
              ))
            )}
          </ul>
        ) : (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
            Couldn&apos;t reach /api/health from this server context:{" "}
            <span className="font-mono">
              {healthRes.error ?? "unknown error"}
            </span>
            . That doesn&apos;t mean the public probe is down — verify at{" "}
            <a
              href="/api/health"
              target="_blank"
              rel="noopener noreferrer"
              className="text-tool-accent hover:underline"
            >
              /api/health
            </a>
            .
          </div>
        )}
      </section>

      {/* Three SVG bar charts */}
      <section className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Top sources — p95 (ms)"
          subtitle="last 24h, by request count"
        >
          <BarChart
            data={topSources}
            valueFormatter={(v) => `${v.toLocaleString()} ms`}
            colorFor={(v) =>
              v > 1500 ? "#ef4444" : v > 800 ? "#f59e0b" : "#10b981"
            }
            ariaLabel="Top 5 API sources by request count, p95 latency in milliseconds"
          />
        </ChartCard>
        <ChartCard
          title="AI cost — top models"
          subtitle="last 24h, USD"
        >
          <BarChart
            data={topModels}
            valueFormatter={(v) => `$${v.toFixed(2)}`}
            colorFor={() => "#a855f7"}
            ariaLabel="Top 5 AI models by 24h cost in USD"
          />
        </ChartCard>
        <ChartCard
          title="p95 distribution"
          subtitle={`${latency.length} sources, last 24h`}
        >
          <BarChart
            data={p95Bands}
            valueFormatter={(v) => v.toLocaleString()}
            colorFor={(_, i) =>
              ["#10b981", "#34d399", "#f59e0b", "#f97316", "#ef4444", "#7c3aed"][
                i % 6
              ]
            }
            ariaLabel="Distribution of API sources across p95 latency buckets"
          />
        </ChartCard>
      </section>

      {/* AI spend summary */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <header className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-app">
            AI spend (last 24h)
          </h2>
          <Link
            href="/admin/insights/ai-costs"
            className="text-[11px] text-tool-accent hover:underline"
          >
            full breakdown →
          </Link>
        </header>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Calls" value={aiCalls.toLocaleString()} />
          <MiniStat
            label="Input tokens"
            value={aiCost
              .reduce((a, r) => a + Number(r.input_tokens ?? 0), 0)
              .toLocaleString()}
          />
          <MiniStat
            label="Output tokens"
            value={aiCost
              .reduce((a, r) => a + Number(r.output_tokens ?? 0), 0)
              .toLocaleString()}
          />
          <MiniStat label="Cost" value={`$${aiCost24hUsd.toFixed(2)}`} />
        </div>
      </section>

      {/* Latest 5 anomaly + stuck-job notifications */}
      <section className="rounded-xl border border-app bg-app-elevated">
        <header className="flex items-baseline justify-between border-b border-app px-3 py-2">
          <h2 className="text-sm font-semibold text-app">
            Recent ops notifications
          </h2>
          <span className="text-[11px] text-faint">latest 5</span>
        </header>
        <ul>
          {notifs.length === 0 ? (
            <li className="px-3 py-8 text-center text-xs text-faint">
              No anomaly or stuck-job notifications recorded. (Either we&apos;ve
              been quiet, or the kinds{" "}
              <code className="rounded bg-app px-1 text-[10px]">
                ops.anomaly.latency
              </code>{" "}
              /{" "}
              <code className="rounded bg-app px-1 text-[10px]">
                ops.jobs.stuck
              </code>{" "}
              aren&apos;t populated.)
            </li>
          ) : (
            notifs.map((n) => (
              <li
                key={n.id}
                className="border-b border-app last:border-b-0 px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-app line-clamp-1">
                      {n.title}
                    </div>
                    {n.body ? (
                      <div className="mt-0.5 text-[11px] text-muted line-clamp-2">
                        {n.body}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right text-[10px] text-faint">
                    <div>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                          n.kind === "ops.anomaly.latency"
                            ? "bg-rose-500/15 text-rose-500"
                            : "bg-amber-500/15 text-amber-500"
                        }`}
                      >
                        {n.kind}
                      </span>
                    </div>
                    <div className="mt-1 font-mono tabular-nums">
                      {formatRelative(n.created_at)}
                    </div>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <p className="text-[11px] text-faint">
        See{" "}
        <Link
          href="/admin/insights/latency"
          className="text-tool-accent hover:underline"
        >
          API latency
        </Link>{" "}
        for per-source p50/p95/p99,{" "}
        <Link
          href="/admin/insights/ai-costs"
          className="text-tool-accent hover:underline"
        >
          AI costs
        </Link>{" "}
        for full model breakdown, and{" "}
        <Link
          href="/admin/status"
          className="text-tool-accent hover:underline"
        >
          /admin/status
        </Link>{" "}
        for the production-readiness checklist.
      </p>
    </div>
  );
}

/* ──────────────────────────── components ──────────────────────────── */

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "emerald" | "amber" | "rose";
}) {
  const dot =
    accent === "rose"
      ? "bg-rose-500"
      : accent === "amber"
      ? "bg-amber-500"
      : accent === "emerald"
      ? "bg-emerald-500"
      : "";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-3">
      <div className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {dot ? (
          <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        ) : null}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-app">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-muted">{sub}</div> : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg tabular-nums text-app">
        {value}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          {title}
        </div>
        <div className="mt-0.5 text-[11px] text-muted">{subtitle}</div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * Minimal SVG bar chart — horizontal bars, labels on the left. Sized
 * to fit a column tile (no responsive scaling beyond viewBox).
 */
function BarChart({
  data,
  valueFormatter,
  colorFor,
  ariaLabel,
}: {
  data: Array<{ label: string; value: number }>;
  valueFormatter: (v: number) => string;
  colorFor: (value: number, index: number) => string;
  ariaLabel?: string;
}) {
  const W = 400;
  const rowH = 22;
  const padL = 110;
  const padR = 56;
  const padT = 4;
  const padB = 4;
  const H = padT + padB + Math.max(1, data.length) * rowH;

  if (data.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${W} 60`}
        className="w-full"
        role="img"
        aria-label={ariaLabel}
      >
        <text
          x={W / 2}
          y={32}
          textAnchor="middle"
          fontSize={11}
          className="fill-faint"
        >
          no data
        </text>
      </svg>
    );
  }

  const max = Math.max(1, ...data.map((d) => d.value));
  const trackW = W - padL - padR;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={ariaLabel}
    >
      {data.map((d, i) => {
        const y = padT + i * rowH + 4;
        const barH = rowH - 8;
        const barW = (d.value / max) * trackW;
        return (
          <g key={`${d.label}-${i}`}>
            <text
              x={padL - 6}
              y={y + barH - 3}
              textAnchor="end"
              fontSize={10}
              className="fill-secondary"
            >
              {truncate(d.label, 16)}
            </text>
            <rect
              x={padL}
              y={y}
              width={Math.max(1, barW)}
              height={barH}
              fill={colorFor(d.value, i)}
              rx={2}
            />
            <text
              x={padL + barW + 4}
              y={y + barH - 3}
              fontSize={10}
              className="fill-app font-mono"
            >
              {valueFormatter(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ──────────────────────────── helpers ──────────────────────────── */

/**
 * Bucket a list of numbers into bands defined by the boundary values.
 * Example bands=[100, 500] → "<100", "100-499", "500+".
 */
function bandify(
  values: number[],
  bands: number[],
): Array<{ label: string; value: number }> {
  const out: Array<{ label: string; value: number }> = [];
  let prev = 0;
  for (let i = 0; i < bands.length; i++) {
    const upper = bands[i];
    out.push({
      label: i === 0 ? `<${upper}` : `${prev}-${upper - 1}`,
      value: values.filter((v) => v >= prev && v < upper).length,
    });
    prev = upper;
  }
  out.push({
    label: `${prev}+`,
    value: values.filter((v) => v >= prev).length,
  });
  return out;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
