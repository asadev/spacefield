"use client";

/* WhatsApp inbox v2 — Wave 4 · EPIC-15 Analytics.
 *
 * Overview (live open/unassigned/today + first-response / resolution / reply
 * times + busiest hours) and Conversation Volume (per-day new/resolved/first-
 * response series) read from the append-only whatsapp_reporting_events table
 * via /api/whatsapp/analytics. CSV export of the daily volume series.
 *
 * Lazy-loaded (next/dynamic) from _app.tsx so its JS stays out of the initial
 * WhatsApp chunk — keeps the Vercel webpack compile under 8GB. Mobile-first;
 * the bar chart is pure CSS (no chart dep).
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchAnalytics,
  analyticsCsvUrl,
  type WaAnalytics,
} from "./api";
import { EmptyState, ErrorBlock } from "./ui";

interface Props {
  workspaceId: string;
  compact?: boolean;
}

const RANGES: Array<{ key: string; label: string; days: number }> = [
  { key: "7", label: "7d", days: 7 },
  { key: "30", label: "30d", days: 30 },
  { key: "90", label: "90d", days: 90 },
];

function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-app bg-app-elevated px-3 py-2.5">
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-app">{value}</div>
      {sub ? <div className="mt-0.5 text-[0.65rem] text-secondary">{sub}</div> : null}
    </div>
  );
}

export default function AnalyticsPanel({ workspaceId }: Props) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<WaAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const res = await fetchAnalytics(workspaceId, {
      from: from.toISOString(),
      to: to.toISOString(),
    });
    if (res.ok) setData(res.data);
    else setError(res.error);
    setLoading(false);
  }, [workspaceId, days]);

  useEffect(() => {
    load();
  }, [load]);

  const o = data?.overview ?? {};
  const volume = data?.volume ?? [];
  const maxVol = Math.max(1, ...volume.map((v) => v.new_convos ?? 0));

  // Busiest hours → sorted top 3.
  const busiest = Object.entries(o.busiest_hours ?? {})
    .map(([h, c]) => ({ hour: Number(h), count: Number(c) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const csvHref = (() => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return analyticsCsvUrl(workspaceId, {
      from: from.toISOString(),
      to: to.toISOString(),
    });
  })();

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-app p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-app">Analytics</h2>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-app">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setDays(r.days)}
                className={`px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] transition-colors ${
                  days === r.days
                    ? "bg-tool-accent text-white"
                    : "text-secondary hover:bg-surface"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <a
            href={csvHref}
            className="rounded-lg border border-app px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-secondary hover:bg-surface"
          >
            Export CSV
          </a>
          <button
            onClick={load}
            className="rounded-lg border border-app px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-secondary hover:bg-surface"
          >
            ⟳
          </button>
        </div>
      </div>

      {error ? <ErrorBlock body={error} onRetry={load} /> : null}

      {loading && !data ? (
        <p className="text-sm text-faint">Loading analytics…</p>
      ) : !data ? (
        <EmptyState
          kicker="Analytics"
          title="No analytics yet"
          body="Activity will appear here as conversations come in."
        />
      ) : (
        <div className="space-y-5">
          {/* Live now */}
          <section>
            <h3 className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
              Right now
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Open" value={String(data.live.open)} />
              <Stat label="Unassigned" value={String(data.live.unassigned)} />
              <Stat label="Created today" value={String(data.live.created_today)} />
            </div>
          </section>

          {/* Conversation volume + response/resolution */}
          <section>
            <h3 className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
              Conversation volume ({days}d)
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="New convos" value={String(o.new_conversations ?? 0)} />
              <Stat label="Resolved" value={String(o.resolved_conversations ?? 0)} />
              <Stat label="Reopened" value={String(o.reopened_conversations ?? 0)} />
              <Stat
                label="Avg first reply"
                value={fmtDuration(o.avg_first_response_seconds)}
                sub={`median ${fmtDuration(o.median_first_response_seconds)}`}
              />
              <Stat
                label="Avg resolution"
                value={fmtDuration(o.avg_resolution_seconds)}
              />
              <Stat
                label="Avg reply time"
                value={fmtDuration(o.avg_reply_seconds)}
                sub={`${o.reply_count ?? 0} replies`}
              />
            </div>
          </section>

          {/* Daily bar chart (pure CSS) */}
          <section>
            <h3 className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
              New conversations / day
            </h3>
            {volume.length === 0 ? (
              <p className="text-xs text-faint">No data in this range.</p>
            ) : (
              <div className="flex h-32 items-end gap-0.5 overflow-x-auto rounded-lg border border-app bg-app-elevated p-2">
                {volume.map((v) => (
                  <div
                    key={v.day}
                    className="group relative flex min-w-[6px] flex-1 flex-col items-center justify-end"
                    title={`${v.day}: ${v.new_convos} new, ${v.resolved} resolved`}
                  >
                    <div
                      className="w-full rounded-t bg-tool-accent/70"
                      style={{
                        height: `${Math.max(2, ((v.new_convos ?? 0) / maxVol) * 100)}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Busiest hours */}
          <section>
            <h3 className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
              Busiest hours
            </h3>
            {busiest.length === 0 ? (
              <p className="text-xs text-faint">Not enough data yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {busiest.map((b) => (
                  <span
                    key={b.hour}
                    className="rounded-full bg-surface px-3 py-1 text-xs text-secondary"
                  >
                    {String(b.hour).padStart(2, "0")}:00 — {b.count}
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
