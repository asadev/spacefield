"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * ReportsView — analytics dashboard backed by the workspace's CRM data.
 *
 * Tiles:
 *   - Pipeline value (bar chart by stage)
 *   - Win rate (last 30 days)
 *   - Average deal size
 *   - Activities this week (count by kind)
 *   - Top contributors (deals + activities per user)
 *   - Conversion funnel (lead status breakdown)
 *   - Stale deals (count past stage rot_days)
 *
 * Charts are inline SVG — no chart library, in line with Phase 1's
 * dependency footprint. Each tile click-throughs back to the matching list
 * view by setting a section key via the `onJump` prop.
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspaces/client";
import { createClient } from "@/lib/supabase/client";
import type {
  CrmActivity,
  CrmActivityKind,
  CrmDeal,
  CrmLead,
  CrmPipelineStage,
  CrmSection,
} from "../types";
import { ACTIVITY_KIND_VALUES, LEAD_STATUS_VALUES } from "../types";

export interface ReportsViewProps {
  onJump?: (section: CrmSection) => void;
}

interface ReportData {
  deals: CrmDeal[];
  stages: CrmPipelineStage[];
  leads: CrmLead[];
  activities: CrmActivity[];
}

export default function ReportsView({ onJump }: ReportsViewProps) {
  const { current, signedIn } = useWorkspace();
  const workspaceId = current.kind === "team" ? current.id : null;

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const sb = createClient();
      const sinceWeek = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const [dealsRes, stagesRes, leadsRes, actsRes] = await Promise.all([
        sb
          .from("crm_deals")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(2000),
        sb
          .from("crm_pipeline_stages")
          .select("*, pipeline:crm_pipelines!inner(workspace_id)")
          .eq("pipeline.workspace_id", workspaceId)
          .order("position", { ascending: true })
          .limit(200),
        sb
          .from("crm_leads")
          .select("*")
          .eq("workspace_id", workspaceId)
          .limit(2000),
        sb
          .from("crm_activities")
          .select("*")
          .eq("workspace_id", workspaceId)
          .gte("created_at", sinceWeek)
          .order("created_at", { ascending: false })
          .limit(2000),
      ]);
      setData({
        deals: ((dealsRes.data as CrmDeal[]) ?? []),
        stages: ((stagesRes.data as CrmPipelineStage[]) ?? []),
        leads: ((leadsRes.data as CrmLead[]) ?? []),
        activities: ((actsRes.data as CrmActivity[]) ?? []),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!signedIn || !workspaceId) {
    return (
      <div className="flex h-full items-center justify-center bg-app p-6">
        <div className="rounded-md border border-app bg-app-elevated p-4 text-sm text-secondary">
          Sign in and pick a team workspace to see reports.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-app">
      <header className="flex shrink-0 items-center justify-between border-b border-app bg-app-elevated px-3 py-2">
        <div>
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
            crm.reports
          </div>
          <h2 className="text-sm font-semibold text-app">Reports</h2>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-md border border-app px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary hover:text-app"
        >
          Refresh
        </button>
      </header>
      <div className="flex-1 overflow-auto p-3">
        {error && (
          <div className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
            {error}
          </div>
        )}
        {loading || !data ? (
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
            Loading…
          </div>
        ) : (
          <ReportTiles data={data} onJump={onJump} />
        )}
      </div>
    </div>
  );
}

// ── tile composition ───────────────────────────────────────────────────

function ReportTiles({
  data,
  onJump,
}: {
  data: ReportData;
  onJump?: (s: CrmSection) => void;
}) {
  const { deals, stages, leads, activities } = data;
  const stageById = useMemo(() => {
    const m = new Map<string, CrmPipelineStage>();
    for (const s of stages) m.set(s.id, s);
    return m;
  }, [stages]);

  // Pipeline value per stage (open deals only).
  const pipelineByStage = useMemo(() => {
    const buckets = new Map<string, { stage: CrmPipelineStage; total: number }>();
    for (const s of stages) buckets.set(s.id, { stage: s, total: 0 });
    for (const d of deals) {
      if (d.status !== "open") continue;
      const b = buckets.get(d.stage_id);
      if (b) b.total += d.amount ?? 0;
    }
    return Array.from(buckets.values()).filter((b) => b.stage.kind === "open");
  }, [deals, stages]);

  // Win rate, avg deal size — last 30d.
  const since30 = Date.now() - 30 * 24 * 3600 * 1000;
  const closed30 = deals.filter(
    (d) =>
      (d.status === "won" || d.status === "lost") &&
      d.closed_at &&
      new Date(d.closed_at).getTime() >= since30
  );
  const won30 = closed30.filter((d) => d.status === "won");
  const winRate =
    closed30.length === 0 ? 0 : Math.round((won30.length / closed30.length) * 100);
  const avgDealSize =
    won30.length === 0
      ? 0
      : Math.round(
          won30.reduce((acc, d) => acc + (d.amount ?? 0), 0) / won30.length
        );

  // Activities this week by kind.
  const sinceWeek = Date.now() - 7 * 24 * 3600 * 1000;
  const activitiesByKind = useMemo(() => {
    const counts: Record<CrmActivityKind, number> = {
      task: 0,
      call: 0,
      meeting: 0,
      email: 0,
      note: 0,
      sms: 0,
    };
    for (const a of activities) {
      if (new Date(a.created_at).getTime() < sinceWeek) continue;
      counts[a.kind] = (counts[a.kind] ?? 0) + 1;
    }
    return counts;
  }, [activities, sinceWeek]);

  // Top contributors — deals created + activities logged per created_by.
  const topContributors = useMemo(() => {
    const tally = new Map<string, { deals: number; activities: number }>();
    for (const d of deals) {
      const k = d.created_by ?? "unknown";
      const cur = tally.get(k) ?? { deals: 0, activities: 0 };
      cur.deals += 1;
      tally.set(k, cur);
    }
    for (const a of activities) {
      const k = a.created_by ?? "unknown";
      const cur = tally.get(k) ?? { deals: 0, activities: 0 };
      cur.activities += 1;
      tally.set(k, cur);
    }
    return Array.from(tally.entries())
      .map(([userId, v]) => ({
        userId,
        deals: v.deals,
        activities: v.activities,
        score: v.deals * 3 + v.activities,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [deals, activities]);

  // Lead funnel.
  const leadFunnel = useMemo(() => {
    const counts = new Map<string, number>();
    for (const status of LEAD_STATUS_VALUES) counts.set(status, 0);
    for (const l of leads) {
      counts.set(l.status, (counts.get(l.status) ?? 0) + 1);
    }
    const total = leads.length || 1;
    return LEAD_STATUS_VALUES.map((status) => ({
      status,
      count: counts.get(status) ?? 0,
      pct: Math.round(((counts.get(status) ?? 0) / total) * 100),
    }));
  }, [leads]);

  // Stale deals (open + past stage rot_days).
  const staleDeals = useMemo(() => {
    let n = 0;
    const now = Date.now();
    for (const d of deals) {
      if (d.status !== "open") continue;
      const stage = stageById.get(d.stage_id);
      if (!stage || stage.rot_days === null) continue;
      const lastTouch = new Date(d.updated_at).getTime();
      if (now - lastTouch > stage.rot_days * 24 * 3600 * 1000) n += 1;
    }
    return n;
  }, [deals, stageById]);

  const totalPipeline = pipelineByStage.reduce((a, b) => a + b.total, 0);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Tile title="Pipeline value" onClick={() => onJump?.("pipeline")}>
        <div className="mb-2 font-mono text-lg font-semibold text-app">
          {formatMoney(totalPipeline)}
        </div>
        <BarChart
          rows={pipelineByStage.map((b) => ({
            label: b.stage.name,
            value: b.total,
            color: b.stage.color ?? null,
          }))}
        />
      </Tile>

      <Tile title="Win rate (30d)" onClick={() => onJump?.("deals")}>
        <Donut percent={winRate} />
        <div className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
          {won30.length} won · {closed30.length - won30.length} lost
        </div>
      </Tile>

      <Tile title="Avg deal size (30d)" onClick={() => onJump?.("deals")}>
        <div className="font-mono text-2xl font-semibold text-app">
          {formatMoney(avgDealSize)}
        </div>
        <div className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
          across {won30.length} closed-won
        </div>
      </Tile>

      <Tile title="Activities this week" onClick={() => onJump?.("activities")}>
        <BarChart
          rows={ACTIVITY_KIND_VALUES.map((k) => ({
            label: k,
            value: activitiesByKind[k] ?? 0,
            color: null,
          }))}
        />
      </Tile>

      <Tile title="Top contributors">
        {topContributors.length === 0 ? (
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
            No activity yet.
          </div>
        ) : (
          <ul className="space-y-1">
            {topContributors.map((c) => (
              <li
                key={c.userId}
                className="flex items-center justify-between gap-2 font-mono text-[0.65rem]"
              >
                <code className="truncate text-secondary">
                  {c.userId.slice(0, 8)}
                </code>
                <span className="text-app">
                  {c.deals}d · {c.activities}a
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tile>

      <Tile title="Lead funnel" onClick={() => onJump?.("leads")}>
        <div className="space-y-1">
          {leadFunnel.map((row) => (
            <div key={row.status} className="flex items-center gap-2">
              <span className="w-20 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
                {row.status}
              </span>
              <div className="relative h-2 flex-1 rounded-full bg-app">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-tool-accent"
                  style={{ width: `${row.pct}%` }}
                />
              </div>
              <span className="w-10 text-right font-mono text-[0.6rem] text-app">
                {row.count}
              </span>
            </div>
          ))}
        </div>
      </Tile>

      <Tile title="Stale deals" onClick={() => onJump?.("pipeline")}>
        <div className="font-mono text-2xl font-semibold text-app">
          {staleDeals}
        </div>
        <div className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
          past their stage&apos;s rot threshold
        </div>
      </Tile>
    </div>
  );
}

function Tile({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-xl border border-app bg-app-elevated p-3 text-left ${
        onClick ? "cursor-pointer hover:border-tool-accent" : ""
      }`}
    >
      <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
        {title}
      </div>
      {children}
    </Tag>
  );
}

function BarChart({
  rows,
}: {
  rows: { label: string; value: number; color: string | null }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-20 truncate font-mono text-[0.55rem] uppercase tracking-[0.14em] text-faint">
            {r.label}
          </span>
          <div className="relative h-2 flex-1 rounded-full bg-app">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${(r.value / max) * 100}%`,
                background: r.color ?? "var(--tool-accent)",
              }}
            />
          </div>
          <span className="w-12 text-right font-mono text-[0.6rem] text-app">
            {r.value < 1000 ? r.value : formatShort(r.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Donut({ percent }: { percent: number }) {
  const pct = Math.max(0, Math.min(100, percent));
  const r = 28;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg viewBox="0 0 80 80" width={80} height={80} aria-hidden="true">
      <circle
        cx={40}
        cy={40}
        r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth={8}
      />
      <circle
        cx={40}
        cy={40}
        r={r}
        fill="none"
        stroke="var(--tool-accent)"
        strokeWidth={8}
        strokeDasharray={`${dash} ${c - dash}`}
        strokeDashoffset={c / 4}
        strokeLinecap="round"
      />
      <text
        x="50%"
        y="52%"
        textAnchor="middle"
        fill="var(--text)"
        fontSize="14"
        fontFamily="var(--font-mono, monospace)"
        fontWeight="600"
      >
        {pct}%
      </text>
    </svg>
  );
}

function formatMoney(n: number): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$${n.toFixed(0)}`;
  }
}

function formatShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}
