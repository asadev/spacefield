"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

type ServiceState = "operational" | "degraded" | "partial" | "major";
type SubTab = "live" | "history" | "components";

interface ServiceRow {
  id: string;
  name: string;
  state: ServiceState;
  uptime: number;
  region?: string;
}

interface IncidentRow {
  id: string;
  title: string;
  date: string;
  state: "investigating" | "identified" | "monitoring" | "resolved";
  note: string;
}

interface StatusState {
  brand: string;
  accent: string;
  services: ServiceRow[];
  incidents: IncidentRow[];
  subscriptions?: {
    email?: boolean;
    rss?: boolean;
    webhook?: boolean;
    sms?: boolean;
  };
  archiveMonths?: number;
}

const LS_KEY = "solutions:status-page:v1";

const uid = () => Math.random().toString(36).slice(2, 9);

const STATE_LABEL: Record<ServiceState, string> = {
  operational: "Operational",
  degraded: "Degraded performance",
  partial: "Partial outage",
  major: "Major outage",
};

const STATE_COLOR: Record<ServiceState, string> = {
  operational: "#10b981",
  degraded: "#f59e0b",
  partial: "#f97316",
  major: "#ef4444",
};

const STATE_DOT: Record<ServiceState, string> = {
  operational: "bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.7)]",
  degraded: "bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.7)]",
  partial: "bg-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.7)]",
  major: "bg-rose-500 shadow-[0_0_12px_rgba(239,68,68,0.7)]",
};

const STATE_BANNER: Record<ServiceState, string> = {
  operational: "bg-tool-accent-soft border-tool-accent/40",
  degraded: "bg-amber-500/10 border-amber-400/40",
  partial: "bg-orange-500/10 border-orange-400/40",
  major: "bg-rose-500/10 border-rose-400/40",
};

const STATE_BANNER_TEXT: Record<ServiceState, string> = {
  operational: "text-tool-accent",
  degraded: "text-amber-500",
  partial: "text-orange-500",
  major: "text-rose-500",
};

const INCIDENT_CHIP: Record<IncidentRow["state"], string> = {
  resolved: "bg-tool-accent-soft text-tool-accent border-tool-accent/30",
  monitoring: "bg-amber-500/15 text-amber-500 border-amber-400/30",
  identified: "bg-orange-500/15 text-orange-500 border-orange-400/30",
  investigating: "bg-rose-500/15 text-rose-500 border-rose-400/30",
};

function defaultState(): StatusState {
  return {
    brand: "Your Company",
    accent: "#84cc16",
    services: [
      { id: uid(), name: "Web App", state: "operational", uptime: 99.98, region: "us-east-1" },
      { id: uid(), name: "Web App", state: "operational", uptime: 99.96, region: "eu-west-1" },
      { id: uid(), name: "API", state: "operational", uptime: 99.95, region: "us-east-1" },
      { id: uid(), name: "API", state: "operational", uptime: 99.92, region: "eu-west-1" },
      { id: uid(), name: "Dashboard", state: "operational", uptime: 99.92, region: "global" },
    ],
    incidents: [],
    subscriptions: { email: true, rss: true, webhook: false, sms: false },
    archiveMonths: 3,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function overallState(services: ServiceRow[]): ServiceState {
  if (services.some((s) => s.state === "major")) return "major";
  if (services.some((s) => s.state === "partial")) return "partial";
  if (services.some((s) => s.state === "degraded")) return "degraded";
  return "operational";
}

// Generate a deterministic 90-day uptime grid based on service id + uptime %.
// Lower uptime → more amber/rose cells. Pure display.
function buildDayGrid(seed: string, uptime: number): Array<"ok" | "warn" | "down"> {
  const days: Array<"ok" | "warn" | "down"> = [];
  // Simple seeded pseudo-random (mulberry32-ish)
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rand = () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // expected bad-day rate scales with downtime
  const downRate = Math.max(0, (100 - uptime) / 100) * 1.2;
  const warnRate = downRate * 1.8;
  for (let i = 0; i < 90; i++) {
    const r = rand();
    if (r < downRate) days.push("down");
    else if (r < downRate + warnRate) days.push("warn");
    else days.push("ok");
  }
  return days;
}

function buildHtml(s: StatusState): string {
  const overall = overallState(s.services);
  const overallLabel =
    overall === "operational" ? "All systems operational" : STATE_LABEL[overall];

  const byRegion = new Map<string, ServiceRow[]>();
  s.services.forEach((svc) => {
    const r = svc.region || "global";
    if (!byRegion.has(r)) byRegion.set(r, []);
    byRegion.get(r)!.push(svc);
  });

  const servicesHtml = Array.from(byRegion.entries())
    .map(
      ([region, list]) => `
    <section class="region">
      <h3 class="region-title">${escapeHtml(region)}</h3>
      <ul class="svc-list">
        ${list
          .map(
            (svc) => `
        <li class="svc">
          <span class="dot" style="background:${STATE_COLOR[svc.state]}"></span>
          <span class="name">${escapeHtml(svc.name)}</span>
          <span class="state">${escapeHtml(STATE_LABEL[svc.state])}</span>
          <span class="uptime">${svc.uptime.toFixed(2)}%</span>
        </li>`
          )
          .join("")}
      </ul>
    </section>`
    )
    .join("");

  const subs = s.subscriptions || {};
  const subsHtml = [
    subs.email ? "Email" : null,
    subs.rss ? "RSS" : null,
    subs.webhook ? "Webhook" : null,
    subs.sms ? "SMS" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const archiveMonths = s.archiveMonths || 3;

  const incidentsHtml =
    s.incidents.length === 0
      ? `<p class="empty">No recent incidents.</p>`
      : s.incidents
          .map(
            (i) => `
    <article class="inc">
      <header><h3>${escapeHtml(i.title)}</h3><time>${escapeHtml(i.date)}</time></header>
      <span class="tag tag-${i.state}">${escapeHtml(i.state)}</span>
      <p>${escapeHtml(i.note)}</p>
    </article>`
          )
          .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(s.brand)} · Status</title>
<style>
  :root { --accent: ${s.accent}; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:#0b0b0f; color:#e5e7eb; }
  .wrap { max-width: 920px; margin: 0 auto; padding: 48px 24px; }
  h1 { font-size: 1.4rem; margin: 0 0 8px; color: #fff; }
  .sub { color: #9ca3af; font-size: .9rem; margin-bottom: 32px; }
  .banner { padding: 18px 20px; border-radius: 12px; background: rgba(16,185,129,.1); border:1px solid rgba(16,185,129,.3); color:#a7f3d0; font-weight:600; }
  .banner.state-major { background: rgba(239,68,68,.1); border-color: rgba(239,68,68,.35); color:#fecaca; }
  .banner.state-partial { background: rgba(249,115,22,.1); border-color: rgba(249,115,22,.35); color:#fed7aa; }
  .banner.state-degraded { background: rgba(245,158,11,.1); border-color: rgba(245,158,11,.35); color:#fde68a; }
  h2 { font-size: 1rem; margin: 36px 0 14px; text-transform: uppercase; letter-spacing: .15em; color: #9ca3af; }
  .region { margin-bottom: 16px; }
  .region-title { font-size: .7rem; text-transform: uppercase; letter-spacing: .15em; color: var(--accent); margin: 0 0 8px; }
  .svc-list { list-style: none; margin:0; padding:0; border:1px solid rgba(255,255,255,.08); border-radius: 12px; overflow:hidden; }
  .svc { display: grid; grid-template-columns: auto 1fr auto auto; gap:14px; align-items:center; padding: 14px 18px; border-top: 1px solid rgba(255,255,255,.06); }
  .svc:first-child { border-top: 0; }
  .subs { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
  .sub-tag { border: 1px solid rgba(255,255,255,.1); border-radius: 999px; padding: 4px 12px; font-size: .75rem; color: #9ca3af; }
  .archive-note { margin-top: 24px; font-size: .8rem; color: #6b7280; text-align: center; }
  .dot { width:10px; height:10px; border-radius:50%; }
  .name { color:#fff; }
  .state { color:#9ca3af; font-size:.85rem; }
  .uptime { color:var(--accent); font-variant-numeric: tabular-nums; font-weight:600; }
  .inc { border:1px solid rgba(255,255,255,.08); border-radius: 10px; padding:14px 18px; margin-bottom:10px; background: rgba(255,255,255,.02); }
  .inc header { display:flex; justify-content: space-between; align-items:baseline; gap:12px; }
  .inc h3 { margin:0; font-size:1rem; color:#fff; }
  .inc time { color:#6b7280; font-size:.8rem; }
  .inc p { color:#9ca3af; margin: 8px 0 0; font-size: .9rem; }
  .tag { display:inline-block; margin-top:8px; padding:2px 8px; border-radius:999px; font-size:.7rem; text-transform:uppercase; letter-spacing:.1em; border:1px solid rgba(255,255,255,.12); color:#9ca3af; }
  .tag-resolved { color:#10b981; border-color: rgba(16,185,129,.35); }
  .tag-investigating { color:#ef4444; border-color: rgba(239,68,68,.35); }
  .tag-identified { color:#f97316; border-color: rgba(249,115,22,.35); }
  .tag-monitoring { color:#f59e0b; border-color: rgba(245,158,11,.35); }
  .empty { color:#6b7280; font-style:italic; }
  footer { margin-top: 40px; color:#6b7280; font-size:.8rem; text-align:center; }
</style>
</head>
<body>
<div class="wrap">
  <h1>${escapeHtml(s.brand)} Status</h1>
  <p class="sub">Last updated ${new Date().toLocaleString()}</p>
  <div class="banner state-${overall}">${escapeHtml(overallLabel)}</div>

  <h2>Services</h2>
  ${servicesHtml}

  ${
    subsHtml
      ? `<h2>Subscribe to updates</h2>
    <div class="subs">
      ${[
        subs.email ? '<span class="sub-tag">Email alerts</span>' : "",
        subs.rss ? '<span class="sub-tag">RSS feed</span>' : "",
        subs.webhook ? '<span class="sub-tag">Webhook</span>' : "",
        subs.sms ? '<span class="sub-tag">SMS</span>' : "",
      ]
        .filter(Boolean)
        .join("")}
    </div>`
      : ""
  }

  <h2>Recent incidents</h2>
  ${incidentsHtml}

  <p class="archive-note">Incident archive retained for ${archiveMonths} month${
    archiveMonths === 1 ? "" : "s"
  }.</p>

  <footer>Generated with example.com/solutions</footer>
</div>
</body>
</html>`;
}

// ---- Native UI helpers ----

function UptimeDial({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="relative h-[88px] w-[88px]">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="7"
        />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="var(--tool-accent)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[0.95rem] font-semibold text-tool-accent">
          {pct.toFixed(2)}
        </span>
        <span className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
          uptime
        </span>
      </div>
    </div>
  );
}

function DayGrid({ seed, uptime }: { seed: string; uptime: number }) {
  const days = useMemo(() => buildDayGrid(seed, uptime), [seed, uptime]);
  return (
    <div className="flex flex-wrap gap-[2px]">
      {days.map((d, i) => (
        <span
          key={i}
          title={`Day ${i + 1}: ${d}`}
          className={`h-3 w-[5px] rounded-[1px] ${
            d === "ok"
              ? "bg-tool-accent/70"
              : d === "warn"
              ? "bg-amber-400/80"
              : "bg-rose-500/80"
          }`}
        />
      ))}
    </div>
  );
}

export default function StatusPagePage() {
  const [state, setState] = useState<StatusState>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceRegion, setNewServiceRegion] = useState("");
  const [tab, setTab] = useState<SubTab>("live");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

  const html = useMemo(() => buildHtml(state), [state]);
  const overall = overallState(state.services);
  const overallLabel =
    overall === "operational" ? "All systems operational" : STATE_LABEL[overall];

  const avgUptime =
    state.services.length === 0
      ? 100
      : state.services.reduce((acc, s) => acc + s.uptime, 0) / state.services.length;

  const counts = {
    operational: state.services.filter((s) => s.state === "operational").length,
    degraded: state.services.filter((s) => s.state === "degraded").length,
    partial: state.services.filter((s) => s.state === "partial").length,
    major: state.services.filter((s) => s.state === "major").length,
  };

  const activeIncidents = state.incidents.filter((i) => i.state !== "resolved");
  const recentIncidents = state.incidents.filter((i) => i.state === "resolved");

  const download = () => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.brand.toLowerCase().replace(/\s+/g, "-")}-status.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addService = () => {
    const name = newServiceName.trim() || "New service";
    setState({
      ...state,
      services: [
        ...state.services,
        {
          id: uid(),
          name,
          state: "operational",
          uptime: 99.9,
          region: newServiceRegion.trim() || "global",
        },
      ],
    });
    setNewServiceName("");
    setNewServiceRegion("");
  };

  return (
    <div
      data-tool-theme="support"
      data-tool="status-page-generator"
      className="min-h-full"
    >
      <ToolShell
        category="Support & Ops"
        title="Status Page Generator"
        description="Build a branded, self-contained HTML status page. Host it anywhere."
      >
        {/* In-tool app shell */}
        <div className="overflow-hidden rounded-2xl border border-app bg-app-elevated backdrop-blur-sm">
          {/* macOS-style chrome */}
          <div className="flex items-center gap-2 border-b border-app bg-app/40 px-4 py-2.5">
            <span className="h-3 w-3 rounded-full bg-rose-400/70" />
            <span className="h-3 w-3 rounded-full bg-amber-400/70" />
            <span className="h-3 w-3 rounded-full bg-tool-accent/80" />
            <div className="ml-3 flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.2em] text-muted">
              <span className="text-tool-accent">●</span>
              status.app
              <span className="text-muted/60">/</span>
              <span>{state.brand.toLowerCase().replace(/\s+/g, "-")}</span>
            </div>
            <div className="ml-auto font-mono text-[0.65rem] text-muted">
              {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>

          {/* Status banner hero */}
          <div className={`tool-hero relative border-b border-app px-6 py-6`}>
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${STATE_BANNER[overall]}`}
                >
                  <span
                    className={`inline-block h-3 w-3 rounded-full ${STATE_DOT[overall]} tool-pulse`}
                  />
                </div>
                <div>
                  <div className="text-[0.6rem] uppercase tracking-[0.25em] text-muted">
                    Incident response deck
                  </div>
                  <h1
                    className={`mt-0.5 text-2xl font-semibold ${
                      overall === "operational" ? "text-app" : STATE_BANNER_TEXT[overall]
                    }`}
                  >
                    {overallLabel}
                  </h1>
                  <div className="mt-1 text-xs text-secondary">
                    {state.services.length} components ·{" "}
                    {activeIncidents.length} active incident
                    {activeIncidents.length === 1 ? "" : "s"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <UptimeDial value={avgUptime} />
                <div className="grid grid-cols-2 gap-1.5 text-[0.65rem]">
                  <Chip tone="ok" label="OK" n={counts.operational} />
                  <Chip tone="amber" label="Degraded" n={counts.degraded} />
                  <Chip tone="orange" label="Partial" n={counts.partial} />
                  <Chip tone="rose" label="Major" n={counts.major} />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={download}
                className="inline-flex items-center gap-2 rounded-full bg-tool-accent px-5 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-black shadow-[0_6px_20px_-8px_var(--tool-accent-ring)] transition hover:brightness-110"
              >
                Export HTML
              </button>
              <button
                onClick={() => setPreviewOpen(true)}
                className="rounded-full border border-tool-accent/40 bg-tool-accent-soft px-4 py-2 text-[0.7rem] uppercase tracking-[0.18em] text-tool-accent transition hover:bg-tool-accent/20"
              >
                Preview status page
              </button>
              <input
                value={state.brand}
                onChange={(e) => setState({ ...state, brand: e.target.value })}
                className="ml-auto rounded-full border border-app bg-app-elevated px-4 py-2 text-sm text-app placeholder:text-muted focus:border-app-focus focus:outline-none focus:ring-1 ring-tool-accent"
                placeholder="Brand"
              />
              <input
                type="color"
                value={state.accent}
                onChange={(e) => setState({ ...state, accent: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded-full border border-app bg-transparent p-1"
                title="Accent color"
              />
            </div>
          </div>

          {/* Sub-tabs (state buttons) */}
          <div className="flex items-center gap-1 border-b border-app bg-app/40 px-4 py-2">
            {(
              [
                { id: "live", label: "Live", count: state.services.length },
                {
                  id: "history",
                  label: "Incidents",
                  count: state.incidents.length,
                },
                { id: "components", label: "90-day uptime", count: 90 },
              ] as const
            ).map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative rounded-md px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] transition ${
                    active
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-muted hover:bg-app-elevated hover:text-secondary"
                  }`}
                >
                  {t.label}
                  <span
                    className={`ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[0.55rem] ${
                      active
                        ? "bg-tool-accent text-black"
                        : "bg-app-elevated text-muted"
                    }`}
                  >
                    {t.count}
                  </span>
                  {active && (
                    <span className="absolute -bottom-2 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-tool-accent" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        {tab === "live" && (
          <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            {/* Components deck */}
            <section className="rounded-2xl border border-app bg-app-elevated backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-app px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-tool-accent tool-pulse" />
                  <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-secondary">
                    Components
                  </h2>
                </div>
                <span className="font-mono text-[0.65rem] text-muted">
                  {state.services.length} tracked
                </span>
              </div>

              {/* Service rows */}
              <ul className="divide-y divide-app">
                {state.services.map((svc) => {
                  const latest = state.incidents.find(
                    (i) =>
                      i.title.toLowerCase().includes(svc.name.toLowerCase()) &&
                      i.state !== "resolved"
                  );
                  return (
                    <li
                      key={svc.id}
                      className="group grid items-center gap-3 px-5 py-3 md:grid-cols-[auto_1.5fr_0.8fr_1fr_auto_auto]"
                    >
                      <span
                        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${STATE_DOT[svc.state]}`}
                      />
                      <input
                        value={svc.name}
                        onChange={(e) =>
                          setState({
                            ...state,
                            services: state.services.map((x) =>
                              x.id === svc.id ? { ...x, name: e.target.value } : x
                            ),
                          })
                        }
                        className="rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-app hover:border-app focus:border-app-focus focus:outline-none"
                      />
                      <input
                        value={svc.region || ""}
                        onChange={(e) =>
                          setState({
                            ...state,
                            services: state.services.map((x) =>
                              x.id === svc.id ? { ...x, region: e.target.value } : x
                            ),
                          })
                        }
                        placeholder="region"
                        className="rounded-md border border-transparent bg-transparent px-2 py-1 font-mono text-[0.7rem] text-secondary hover:border-app focus:border-app-focus focus:outline-none"
                      />
                      <select
                        value={svc.state}
                        onChange={(e) =>
                          setState({
                            ...state,
                            services: state.services.map((x) =>
                              x.id === svc.id
                                ? { ...x, state: e.target.value as ServiceState }
                                : x
                            ),
                          })
                        }
                        className="rounded-md border border-app bg-app-elevated px-2 py-1 text-xs text-app focus:border-app-focus focus:outline-none"
                      >
                        {(Object.keys(STATE_LABEL) as ServiceState[]).map((s) => (
                          <option key={s} value={s}>
                            {STATE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2">
                        {/* Uptime % bar + value */}
                        <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-app">
                          <div
                            className={`h-full rounded-full ${
                              svc.uptime >= 99.9
                                ? "bg-tool-accent"
                                : svc.uptime >= 99
                                ? "bg-amber-400"
                                : "bg-rose-500"
                            }`}
                            style={{
                              width: `${Math.max(0, Math.min(100, svc.uptime))}%`,
                            }}
                          />
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          value={svc.uptime}
                          onChange={(e) =>
                            setState({
                              ...state,
                              services: state.services.map((x) =>
                                x.id === svc.id
                                  ? { ...x, uptime: Number(e.target.value) || 0 }
                                  : x
                              ),
                            })
                          }
                          className="w-16 rounded-md border border-transparent bg-transparent px-1 py-1 text-right font-mono text-sm text-tool-accent hover:border-app focus:border-app-focus focus:outline-none"
                        />
                        <span className="font-mono text-xs text-tool-accent">%</span>
                      </div>
                      <button
                        onClick={() =>
                          setState({
                            ...state,
                            services: state.services.filter((x) => x.id !== svc.id),
                          })
                        }
                        className="rounded-md px-2 py-1 text-muted opacity-0 transition hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100"
                        aria-label="Remove service"
                      >
                        ×
                      </button>
                      {latest && (
                        <span className="col-span-full -mt-1 ml-6 text-[0.65rem] text-amber-500">
                          ↳ {latest.title}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Inline add */}
              <div className="flex items-center gap-2 border-t border-dashed border-app bg-app/40 px-5 py-3">
                <span className="text-tool-accent">+</span>
                <input
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addService()}
                  placeholder="Component name"
                  className="flex-1 bg-transparent text-sm text-app placeholder:text-muted focus:outline-none"
                />
                <input
                  value={newServiceRegion}
                  onChange={(e) => setNewServiceRegion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addService()}
                  placeholder="region"
                  className="w-24 bg-transparent font-mono text-xs text-secondary placeholder:text-muted focus:outline-none"
                />
                <button
                  onClick={addService}
                  className="rounded-md bg-tool-accent-soft px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-tool-accent hover:bg-tool-accent/25"
                >
                  Add
                </button>
              </div>
            </section>

            {/* Right column — subs + SLA */}
            <section className="space-y-5">
              <div className="rounded-2xl border border-app bg-app-elevated p-5 backdrop-blur-sm">
                <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-secondary">
                  Subscriptions
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Shown on the public page as pills.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(
                    [
                      { key: "email", label: "Email" },
                      { key: "rss", label: "RSS" },
                      { key: "webhook", label: "Webhook" },
                      { key: "sms", label: "SMS" },
                    ] as const
                  ).map((opt) => {
                    const checked = !!state.subscriptions?.[opt.key];
                    return (
                      <label
                        key={opt.key}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                          checked
                            ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                            : "border-app bg-app text-secondary hover:border-tool-accent/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setState({
                              ...state,
                              subscriptions: {
                                ...(state.subscriptions || {}),
                                [opt.key]: e.target.checked,
                              },
                            })
                          }
                          className="accent-lime-500"
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
                <div className="mt-4">
                  <label className="text-[0.6rem] uppercase tracking-[0.22em] text-muted">
                    Archive retention (months)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={36}
                    value={state.archiveMonths || 3}
                    onChange={(e) =>
                      setState({
                        ...state,
                        archiveMonths: Number(e.target.value) || 3,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-app bg-app px-3 py-2 font-mono text-sm text-app focus:border-app-focus focus:outline-none focus:ring-1 ring-tool-accent"
                  />
                </div>
              </div>

              {/* SLA snapshot mini */}
              <div className="rounded-2xl border border-app bg-app-elevated p-5 backdrop-blur-sm">
                <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-secondary">
                  SLA snapshot
                </h2>
                <div className="mt-3 space-y-2">
                  {state.services.slice(0, 4).map((s) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <span className="w-24 truncate text-xs text-secondary">
                        {s.name}
                      </span>
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-app">
                        <div
                          className="h-full rounded-full bg-tool-accent"
                          style={{
                            width: `${Math.max(0, Math.min(100, s.uptime))}%`,
                          }}
                        />
                      </div>
                      <span className="w-14 text-right font-mono text-[0.7rem] text-tool-accent">
                        {s.uptime.toFixed(2)}%
                      </span>
                    </div>
                  ))}
                  {state.services.length === 0 && (
                    <p className="text-xs italic text-muted">No components yet.</p>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* 90-day uptime grid (components tab) */}
        {tab === "components" && (
          <section className="mt-5 rounded-2xl border border-app bg-app-elevated backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-app px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-tool-accent tool-pulse" />
                <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-secondary">
                  90-day uptime
                </h2>
              </div>
              <div className="flex items-center gap-3 text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-tool-accent/70" /> ok
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-amber-400/80" /> degraded
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-rose-500/80" /> down
                </span>
              </div>
            </div>
            <ul className="divide-y divide-app">
              {state.services.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-muted">
                  No components to chart yet.
                </li>
              )}
              {state.services.map((svc) => (
                <li
                  key={svc.id}
                  className="grid items-center gap-3 px-5 py-3 md:grid-cols-[1.5fr_2.5fr_auto]"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`relative inline-flex h-2.5 w-2.5 rounded-full ${STATE_DOT[svc.state]}`}
                    />
                    <span className="text-sm font-medium text-app">{svc.name}</span>
                    <span className="font-mono text-[0.65rem] text-muted">
                      {svc.region || "global"}
                    </span>
                  </div>
                  <DayGrid seed={svc.id + svc.name} uptime={svc.uptime} />
                  <span className="text-right font-mono text-sm text-tool-accent">
                    {svc.uptime.toFixed(2)}%
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Incident timeline (history tab) */}
        {tab === "history" && (
          <section className="mt-5 rounded-2xl border border-app bg-app-elevated backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-app px-5 py-3">
              <div className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    activeIncidents.length > 0
                      ? "bg-rose-500 tool-pulse"
                      : "bg-tool-accent"
                  }`}
                />
                <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-secondary">
                  Incident timeline
                </h2>
                <span className="ml-2 font-mono text-[0.65rem] text-muted">
                  {activeIncidents.length} active · {recentIncidents.length} resolved
                </span>
              </div>
              <button
                onClick={() =>
                  setState({
                    ...state,
                    incidents: [
                      ...state.incidents,
                      {
                        id: uid(),
                        title: "",
                        date: new Date().toISOString().slice(0, 10),
                        state: "investigating",
                        note: "",
                      },
                    ],
                  })
                }
                className="rounded-md bg-tool-accent-soft px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-tool-accent hover:bg-tool-accent/25"
              >
                + Log incident
              </button>
            </div>

            <div className="relative p-5">
              {state.incidents.length === 0 && (
                <div className="rounded-lg border border-dashed border-app bg-app p-6 text-center">
                  <div className="mx-auto mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-tool-accent-soft text-tool-accent">
                    ✓
                  </div>
                  <p className="text-sm text-secondary">
                    No incidents logged. All quiet on the wire.
                  </p>
                </div>
              )}

              {state.incidents.length > 0 && (
                <div className="relative pl-6">
                  {/* Timeline rail */}
                  <span
                    className="absolute left-2 top-2 bottom-2 w-px bg-app"
                    aria-hidden
                  />
                  <ul className="space-y-3">
                    {state.incidents.map((inc) => {
                      const dotColor =
                        inc.state === "resolved"
                          ? "bg-tool-accent"
                          : inc.state === "monitoring"
                          ? "bg-amber-500"
                          : inc.state === "identified"
                          ? "bg-orange-500"
                          : "bg-rose-500";
                      return (
                        <li key={inc.id} className="relative">
                          {/* Timeline node */}
                          <span
                            className={`absolute -left-[14px] top-3 inline-flex h-2.5 w-2.5 rounded-full ${dotColor} ring-4 ring-app-elevated`}
                          />
                          <article className="group rounded-lg border border-app bg-app p-3 transition hover:border-tool-accent/40">
                            <div className="grid gap-2 md:grid-cols-[2fr_auto_auto_auto]">
                              <input
                                value={inc.title}
                                onChange={(e) =>
                                  setState({
                                    ...state,
                                    incidents: state.incidents.map((x) =>
                                      x.id === inc.id
                                        ? { ...x, title: e.target.value }
                                        : x
                                    ),
                                  })
                                }
                                placeholder="Incident title"
                                className="rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-app hover:border-app focus:border-app-focus focus:outline-none"
                              />
                              <input
                                type="date"
                                value={inc.date}
                                onChange={(e) =>
                                  setState({
                                    ...state,
                                    incidents: state.incidents.map((x) =>
                                      x.id === inc.id
                                        ? { ...x, date: e.target.value }
                                        : x
                                    ),
                                  })
                                }
                                className="rounded-md border border-app bg-app-elevated px-2 py-1 font-mono text-xs text-app focus:border-app-focus focus:outline-none"
                              />
                              <select
                                value={inc.state}
                                onChange={(e) =>
                                  setState({
                                    ...state,
                                    incidents: state.incidents.map((x) =>
                                      x.id === inc.id
                                        ? {
                                            ...x,
                                            state: e.target
                                              .value as IncidentRow["state"],
                                          }
                                        : x
                                    ),
                                  })
                                }
                                className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] focus:outline-none ${INCIDENT_CHIP[inc.state]}`}
                              >
                                <option value="investigating">Investigating</option>
                                <option value="identified">Identified</option>
                                <option value="monitoring">Monitoring</option>
                                <option value="resolved">Resolved</option>
                              </select>
                              <button
                                onClick={() =>
                                  setState({
                                    ...state,
                                    incidents: state.incidents.filter(
                                      (x) => x.id !== inc.id
                                    ),
                                  })
                                }
                                className="rounded-md px-2 py-1 text-muted opacity-0 transition hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100"
                              >
                                ×
                              </button>
                            </div>
                            <input
                              value={inc.note}
                              onChange={(e) =>
                                setState({
                                  ...state,
                                  incidents: state.incidents.map((x) =>
                                    x.id === inc.id
                                      ? { ...x, note: e.target.value }
                                      : x
                                  ),
                                })
                              }
                              placeholder="Brief update — what happened, who's on it, ETA"
                              className="mt-2 w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-secondary hover:border-app focus:border-app-focus focus:outline-none"
                            />
                          </article>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Preview modal */}
        {previewOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setPreviewOpen(false)}
          >
            <div
              className="relative flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-tool-accent/30 bg-app-elevated shadow-[0_40px_100px_-20px_var(--tool-accent-ring)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 border-b border-app bg-app/40 px-4 py-2.5">
                <span className="h-3 w-3 rounded-full bg-rose-400/70" />
                <span className="h-3 w-3 rounded-full bg-amber-400/70" />
                <span className="h-3 w-3 rounded-full bg-tool-accent/80" />
                <span className="ml-3 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted">
                  Preview · {state.brand}
                </span>
                <button
                  onClick={() => setPreviewOpen(false)}
                  className="ml-auto rounded-md border border-app px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-secondary hover:border-tool-accent hover:text-tool-accent"
                >
                  Close
                </button>
              </div>
              <iframe
                title="status-preview-modal"
                srcDoc={html}
                className="flex-1 w-full bg-white"
              />
            </div>
          </div>
        )}
      </ToolShell>
    </div>
  );
}

function Chip({
  tone,
  label,
  n,
}: {
  tone: "ok" | "amber" | "orange" | "rose";
  label: string;
  n: number;
}) {
  const map = {
    ok: "bg-tool-accent-soft text-tool-accent border-tool-accent/30",
    amber: "bg-amber-500/15 text-amber-500 border-amber-400/30",
    orange: "bg-orange-500/15 text-orange-500 border-orange-400/30",
    rose: "bg-rose-500/15 text-rose-500 border-rose-400/30",
  } as const;
  return (
    <span
      className={`inline-flex items-center justify-between gap-2 rounded-full border px-2.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] ${map[tone]}`}
    >
      <span>{label}</span>
      <span className="font-semibold">{n}</span>
    </span>
  );
}
