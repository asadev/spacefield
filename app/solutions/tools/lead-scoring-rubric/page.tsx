"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

type AttrType = "firmographic" | "behavioral" | "intent" | "fit";

type Attribute = {
  id: string;
  name: string;
  type: AttrType;
  weight: string; // 0-10
  value: string; // 0-10 for this specific lead
};

const STORAGE_KEY = "spacefield.leadScoringRubric.v2";

type IcpPreset = "b2b-saas" | "ecomm" | "fintech" | "custom";

const ICP_PRESETS: Record<IcpPreset, { label: string; attrs: Attribute[] }> = {
  "b2b-saas": {
    label: "B2B SaaS",
    attrs: [
      { id: "company-size", name: "Company size (50-500 FTE)", type: "firmographic", weight: "8", value: "7" },
      { id: "industry", name: "Industry (Tech/SaaS/Agency)", type: "fit", weight: "7", value: "8" },
      { id: "tech-stack", name: "Tech-stack fit (Salesforce/HubSpot)", type: "fit", weight: "6", value: "7" },
      { id: "title", name: "VP+ / Head-of title", type: "firmographic", weight: "9", value: "7" },
      { id: "funding", name: "Series A-C or profitable", type: "firmographic", weight: "6", value: "8" },
      { id: "page-visits", name: "Pricing page ≥ 3 visits", type: "behavioral", weight: "7", value: "8" },
      { id: "demo-requested", name: "Demo requested", type: "intent", weight: "10", value: "10" },
      { id: "webinar-attended", name: "Webinar attended", type: "behavioral", weight: "5", value: "5" },
    ],
  },
  ecomm: {
    label: "E-commerce",
    attrs: [
      { id: "gmv", name: "GMV $1M-$50M", type: "firmographic", weight: "9", value: "7" },
      { id: "platform", name: "On Shopify/BigCommerce/Magento", type: "fit", weight: "7", value: "9" },
      { id: "aov", name: "AOV > $50", type: "firmographic", weight: "6", value: "7" },
      { id: "brand-age", name: "Brand age > 2 years", type: "firmographic", weight: "5", value: "6" },
      { id: "paid-channels", name: "Runs paid ads", type: "fit", weight: "6", value: "8" },
      { id: "cart-abandon", name: "Abandoned cart recovery signup", type: "behavioral", weight: "7", value: "6" },
      { id: "demo-requested", name: "Demo requested", type: "intent", weight: "10", value: "8" },
      { id: "case-study", name: "Case study downloaded", type: "behavioral", weight: "6", value: "5" },
    ],
  },
  fintech: {
    label: "Fintech",
    attrs: [
      { id: "regulated", name: "Regulated (FCA/SEC/MAS)", type: "fit", weight: "9", value: "8" },
      { id: "txn-volume", name: "Monthly txn volume", type: "firmographic", weight: "8", value: "7" },
      { id: "license", name: "Holds payment/EMI license", type: "fit", weight: "7", value: "7" },
      { id: "region", name: "Target region match", type: "firmographic", weight: "6", value: "8" },
      { id: "compliance-title", name: "Compliance/Risk decision-maker", type: "firmographic", weight: "8", value: "7" },
      { id: "sandbox", name: "API sandbox signup", type: "intent", weight: "8", value: "9" },
      { id: "demo-requested", name: "Demo requested", type: "intent", weight: "10", value: "8" },
      { id: "security-doc", name: "Security/SOC2 docs downloaded", type: "behavioral", weight: "6", value: "6" },
    ],
  },
  custom: {
    label: "Custom",
    attrs: [],
  },
};

const DEFAULTS: Attribute[] = [
  { id: "company-size", name: "Company size", type: "firmographic", weight: "8", value: "7" },
  { id: "industry", name: "Industry fit", type: "fit", weight: "7", value: "8" },
  { id: "region", name: "Region / geography", type: "firmographic", weight: "4", value: "6" },
  { id: "title", name: "Decision-maker title", type: "firmographic", weight: "9", value: "7" },
  { id: "email-opens", name: "Email opens (last 30d)", type: "behavioral", weight: "5", value: "5" },
  { id: "page-visits", name: "Pricing page visits", type: "behavioral", weight: "7", value: "8" },
  { id: "demo-requested", name: "Demo requested", type: "intent", weight: "10", value: "10" },
];

const TYPES: { key: AttrType; label: string }[] = [
  { key: "firmographic", label: "Firmographic" },
  { key: "behavioral", label: "Behavioral" },
  { key: "intent", label: "Intent" },
  { key: "fit", label: "Fit" },
];

type SubTab = "rubric" | "leads" | "batch";

type SortKey = "name" | "score" | "tier";

type Lead = {
  name: string;
  score: number;
  tier: "A" | "B" | "C";
};

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function LeadScoringRubricPage() {
  const [attrs, setAttrs] = useState<Attribute[]>([]);
  const [hotThreshold, setHotThreshold] = useState("80");
  const [warmThreshold, setWarmThreshold] = useState("60");
  const [loaded, setLoaded] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");
  const [batchCsv, setBatchCsv] = useState("");
  const [batchOutput, setBatchOutput] = useState("");
  const [leadName, setLeadName] = useState("Acme Corp");
  const [tab, setTab] = useState<SubTab>("rubric");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.attrs)) {
          setAttrs(parsed.attrs);
          if (parsed.hotThreshold) setHotThreshold(parsed.hotThreshold);
          if (parsed.warmThreshold) setWarmThreshold(parsed.warmThreshold);
          if (Array.isArray(parsed.leads)) setLeads(parsed.leads);
          setLoaded(true);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setAttrs(DEFAULTS);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ attrs, hotThreshold, warmThreshold, leads })
      );
    } catch {
      /* ignore */
    }
  }, [attrs, hotThreshold, warmThreshold, leads, loaded]);

  const addAttr = () =>
    setAttrs((p) => [...p, { id: newId(), name: "New criterion", type: "firmographic", weight: "5", value: "5" }]);
  const removeAttr = (id: string) => setAttrs((p) => p.filter((a) => a.id !== id));
  const updateAttr = (id: string, patch: Partial<Attribute>) =>
    setAttrs((p) => p.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const { score, weightedMax, weightedSum, byType } = useMemo(() => {
    let wSum = 0;
    let mSum = 0;
    const byType: Record<AttrType, { w: number; m: number }> = {
      firmographic: { w: 0, m: 0 },
      behavioral: { w: 0, m: 0 },
      intent: { w: 0, m: 0 },
      fit: { w: 0, m: 0 },
    };
    for (const a of attrs) {
      const w = Math.max(0, Math.min(10, parseFloat(a.weight) || 0));
      const v = Math.max(0, Math.min(10, parseFloat(a.value) || 0));
      wSum += w * v;
      mSum += w * 10;
      byType[a.type].w += w * v;
      byType[a.type].m += w * 10;
    }
    const score = mSum > 0 ? (wSum / mSum) * 100 : 0;
    return { score, weightedMax: mSum, weightedSum: wSum, byType };
  }, [attrs]);

  const hot = parseFloat(hotThreshold) || 0;
  const warm = parseFloat(warmThreshold) || 0;
  const tier: "A" | "B" | "C" = score >= hot ? "A" : score >= warm ? "B" : "C";
  const tierLabel = tier === "A" ? "Tier A · Hot" : tier === "B" ? "Tier B · Warm" : "Tier C · Cold";

  const exportJson = () => {
    const json = JSON.stringify(
      {
        rubric: attrs.map(({ id: _id, value: _v, ...rest }) => rest),
        thresholds: { hot, warm },
      },
      null,
      2
    );
    try {
      navigator.clipboard.writeText(json);
      setCopyMsg("Rubric copied");
      setTimeout(() => setCopyMsg(""), 1800);
    } catch {
      setCopyMsg("Copy failed");
      setTimeout(() => setCopyMsg(""), 1800);
    }
  };

  const scoreAnother = () => {
    setAttrs((p) => p.map((a) => ({ ...a, value: "5" })));
    setLeadName("New lead");
    setCopyMsg("Cleared scores — ready for next lead");
    setTimeout(() => setCopyMsg(""), 2000);
  };

  const saveLead = () => {
    const name = leadName.trim() || `Lead ${leads.length + 1}`;
    const next: Lead = { name, score: Math.round(score), tier };
    setLeads((p) => [next, ...p].slice(0, 50));
    setCopyMsg(`Saved “${name}” to lead list`);
    setTimeout(() => setCopyMsg(""), 1800);
  };

  const removeLead = (idx: number) =>
    setLeads((p) => p.filter((_, i) => i !== idx));

  const typePct = (t: AttrType) =>
    byType[t].m > 0 ? (byType[t].w / byType[t].m) * 100 : 0;

  const sortedLeads = useMemo(() => {
    const copy = [...leads];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "score") cmp = a.score - b.score;
      else cmp = a.tier.localeCompare(b.tier);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [leads, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  };

  const tierClass = (t: "A" | "B" | "C") =>
    t === "A"
      ? "bg-tool-accent text-white"
      : t === "B"
      ? "bg-tool-accent-soft text-tool-accent border border-tool-accent/40"
      : "bg-surface text-secondary border border-app";

  return (
    <ToolShell
      category="Sales"
      title="Lead Scoring Rubric"
      description="Define criteria, weights and thresholds. Score a lead inline and watch the tier update live."
    >
      <div data-tool-theme="sales" data-tool="lead-scoring-rubric">
        {/* Hero */}
        <section className="tool-hero mb-6 overflow-hidden rounded-2xl border border-tool-accent/20 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tool-accent text-white shadow-sm">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3v18h18" />
                    <path d="M7 14l4-4 4 4 5-5" />
                  </svg>
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-app font-tool-heading">
                  Lead Scoring Rubric
                </h1>
              </div>
              <p className="mt-1 text-xs text-secondary">
                Sales-ops qualification scorecard · criteria → weights → thresholds → live score
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border border-tool-accent/40 bg-tool-accent-soft px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-tool-accent">
                Hot ≥ {hot}
              </span>
              <span className="rounded-full border border-app bg-surface px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-secondary">
                Warm {warm}–{Math.max(warm, hot - 1)}
              </span>
              <span className="rounded-full border border-app bg-surface px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
                Cold &lt; {warm}
              </span>
            </div>
          </div>
        </section>

        {/* Sub-tabs as state buttons */}
        <div role="tablist" aria-label="Sections" className="mb-4 flex flex-wrap gap-1.5">
          {([
            { k: "rubric", label: "Rubric & Score" },
            { k: "leads", label: `Lead List (${leads.length})` },
            { k: "batch", label: "Batch Score" },
          ] as { k: SubTab; label: string }[]).map((t) => {
            const active = tab === t.k;
            return (
              <button
                key={t.k}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.k)}
                className={
                  active
                    ? "rounded-md bg-tool-accent px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-white shadow-sm"
                    : "rounded-md border border-app bg-surface px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "rubric" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
            {/* Left column - Rubric editor */}
            <div className="rounded-2xl border border-app bg-surface p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                    Rubric Editor
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {attrs.length} criteria · tune weights + point levels
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={addAttr}
                    className="rounded-md bg-tool-accent px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-white shadow-sm hover:brightness-110"
                  >
                    + criterion
                  </button>
                  <button
                    onClick={() => setAttrs(DEFAULTS)}
                    className="rounded-md border border-app bg-surface px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
                  >
                    reset
                  </button>
                </div>
              </div>

              {/* ICP preset chips */}
              <div className="mb-4 rounded-xl border border-app bg-surface-strong/30 p-3">
                <div className="mb-2 text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-muted">
                  Load ICP catalog
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(ICP_PRESETS) as IcpPreset[]).filter((k) => k !== "custom").map((k) => (
                    <button
                      key={k}
                      onClick={() => setAttrs(ICP_PRESETS[k].attrs.map((a) => ({ ...a, id: newId() })))}
                      className="rounded-full border border-app bg-surface px-3 py-1 text-[0.65rem] font-medium text-secondary hover:border-tool-accent hover:bg-tool-accent-soft hover:text-tool-accent"
                    >
                      {ICP_PRESETS[k].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Criterion cards */}
              <div className="space-y-2.5">
                {attrs.map((a, idx) => {
                  const w = Math.max(0, Math.min(10, parseFloat(a.weight) || 0));
                  const v = Math.max(0, Math.min(10, parseFloat(a.value) || 0));
                  const contrib = w * v;
                  return (
                    <div
                      key={a.id}
                      className="group rounded-xl border border-app bg-surface p-3 shadow-sm transition hover:border-tool-accent/40"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-tool-accent-soft text-[0.6rem] font-bold text-tool-accent">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          {/* Row 1: name + type + delete */}
                          <div className="flex items-center gap-2">
                            <input
                              value={a.name}
                              onChange={(e) => updateAttr(a.id, { name: e.target.value })}
                              className="flex-1 border-0 border-b border-transparent bg-transparent px-0 py-0.5 text-sm font-medium text-app outline-none focus:border-tool-accent"
                            />
                            <select
                              value={a.type}
                              onChange={(e) => updateAttr(a.id, { type: e.target.value as AttrType })}
                              className="rounded-md border border-app bg-surface px-2 py-0.5 text-[0.65rem] font-medium text-secondary"
                            >
                              {TYPES.map((t) => (
                                <option key={t.key} value={t.key}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => removeAttr(a.id)}
                              className="rounded px-1.5 text-faint opacity-0 transition hover:text-rose-500 group-hover:opacity-100"
                              aria-label="Remove"
                            >
                              ×
                            </button>
                          </div>

                          {/* Row 2: weight + dots + contribution */}
                          <div className="mt-2 flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[0.55rem] font-semibold uppercase tracking-wider text-muted">
                                Weight
                              </span>
                              <input
                                type="number"
                                value={a.weight}
                                onChange={(e) => updateAttr(a.id, { weight: e.target.value })}
                                min="0"
                                max="10"
                                step="0.5"
                                className="w-12 rounded-md border border-app bg-surface px-1.5 py-0.5 text-center text-xs font-semibold text-app tabular-nums"
                              />
                            </div>

                            <div className="flex items-center gap-1">
                              <span className="mr-1 text-[0.55rem] font-semibold uppercase tracking-wider text-muted">
                                Score
                              </span>
                              {[1, 2, 3, 4, 5].map((level) => {
                                const levelVal = level * 2;
                                const active = v >= levelVal - 1;
                                return (
                                  <button
                                    key={level}
                                    type="button"
                                    onClick={() => updateAttr(a.id, { value: String(levelVal) })}
                                    className={
                                      active
                                        ? "h-4 w-4 rounded-full border border-tool-accent bg-tool-accent shadow-sm transition"
                                        : "h-4 w-4 rounded-full border border-app bg-surface transition hover:border-tool-accent/60"
                                    }
                                    aria-label={`Set ${a.name} to ${levelVal}`}
                                  />
                                );
                              })}
                              <span className="ml-1.5 min-w-[1.5rem] text-[0.65rem] font-bold tabular-nums text-tool-accent">
                                {v.toFixed(0)}
                              </span>
                            </div>

                            <div className="ml-auto flex items-center gap-1.5">
                              <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-strong">
                                <div
                                  className="h-full bg-tool-accent"
                                  style={{ width: `${Math.min(100, contrib)}%` }}
                                />
                              </div>
                              <span className="w-8 text-right text-[0.6rem] font-semibold tabular-nums text-secondary">
                                {contrib.toFixed(0)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Threshold setters */}
              <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-app bg-surface-strong/30 p-3">
                <div>
                  <label className="mb-1 block text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                    Hot threshold
                  </label>
                  <input
                    type="number"
                    value={hotThreshold}
                    onChange={(e) => setHotThreshold(e.target.value)}
                    min="0"
                    max="100"
                    className="w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm font-semibold text-app tabular-nums"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-secondary">
                    Warm threshold
                  </label>
                  <input
                    type="number"
                    value={warmThreshold}
                    onChange={(e) => setWarmThreshold(e.target.value)}
                    min="0"
                    max="100"
                    className="w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm font-semibold text-app tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Right column - Scoring panel */}
            <div className="rounded-2xl border border-app bg-tool-surface p-5">
              <div className="mb-3">
                <div className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                  Scoring Panel
                </div>
                <input
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  placeholder="Lead name"
                  className="mt-1 w-full border-0 border-b border-app bg-transparent px-0 py-1 text-base font-semibold text-app outline-none focus:border-tool-accent"
                />
              </div>

              {/* Big live score */}
              <div className="rounded-2xl border border-app bg-surface p-5 shadow-sm">
                <div className="flex items-baseline justify-between">
                  <span className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-secondary">
                    Live score
                  </span>
                  <span className="text-[0.6rem] tabular-nums text-faint">
                    {weightedSum.toFixed(0)} / {weightedMax.toFixed(0)}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span
                    className="font-tool-heading text-6xl font-bold tabular-nums text-tool-accent"
                    style={{ fontFeatureSettings: "'tnum'" }}
                  >
                    {score.toFixed(0)}
                  </span>
                  <span className="text-lg font-medium text-faint">/ 100</span>
                </div>

                {/* Tier banner */}
                <div className={`mt-3 rounded-lg px-4 py-2.5 text-sm font-bold shadow-sm ${tierClass(tier)}`}>
                  <div className="flex items-center justify-between">
                    <span className="tracking-wide">{tierLabel}</span>
                    <span className="font-tool-heading text-2xl tabular-nums">{tier}</span>
                  </div>
                </div>

                {/* Progress bar with threshold markers (cold/warm/hot) */}
                <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-surface-strong">
                  <div
                    className="h-full bg-tool-accent transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                  />
                  <div
                    className="absolute inset-y-0 w-px bg-tool-accent/60"
                    style={{ left: `${warm}%` }}
                  />
                  <div
                    className="absolute inset-y-0 w-px bg-tool-accent"
                    style={{ left: `${hot}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[0.55rem] font-medium text-faint">
                  <span>Cold</span>
                  <span>Warm · {warm}</span>
                  <span>Hot · {hot}</span>
                  <span>100</span>
                </div>
              </div>

              {/* By-type breakdown bars (firmographic / behavioral / intent / fit) */}
              <div className="mt-3 rounded-xl border border-app bg-surface p-3">
                <div className="mb-2 text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-muted">
                  Score breakdown by dimension
                </div>
                <div className="space-y-2">
                  {TYPES.map((t) => {
                    const pct = typePct(t.key);
                    const has = byType[t.key].m > 0;
                    return (
                      <div key={t.key} className="flex items-center gap-3">
                        <span className="w-20 text-[0.65rem] font-medium text-secondary">
                          {t.label}
                        </span>
                        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-strong">
                          <div
                            className="h-full bg-tool-accent transition-all"
                            style={{ width: has ? `${pct}%` : "0%" }}
                          />
                          {/* threshold markers */}
                          <div
                            className="absolute inset-y-0 w-px bg-tool-accent/60"
                            style={{ left: `${warm}%` }}
                          />
                          <div
                            className="absolute inset-y-0 w-px bg-tool-accent"
                            style={{ left: `${hot}%` }}
                          />
                        </div>
                        <span className="w-9 text-right font-tool-heading text-xs font-bold tabular-nums text-app">
                          {has ? pct.toFixed(0) : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action pills */}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={saveLead}
                  className="flex-1 rounded-md bg-tool-accent px-4 py-2 text-[0.7rem] font-semibold uppercase tracking-wider text-white shadow-sm hover:brightness-110"
                >
                  Save to lead list
                </button>
                <button
                  onClick={exportJson}
                  className="flex-1 rounded-md border border-tool-accent bg-surface px-4 py-2 text-[0.7rem] font-semibold uppercase tracking-wider text-tool-accent hover:bg-tool-accent-soft"
                >
                  Export rubric
                </button>
                <button
                  onClick={scoreAnother}
                  className="rounded-md border border-app bg-surface px-4 py-2 text-[0.7rem] font-semibold uppercase tracking-wider text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
                >
                  Reset
                </button>
              </div>
              {copyMsg && (
                <div className="mt-2 text-center text-[0.65rem] font-medium text-tool-accent">
                  {copyMsg}
                </div>
              )}

              <p className="mt-4 border-t border-app pt-3 text-[0.65rem] leading-relaxed text-muted">
                Good rubrics weight intent + behavioral signals above firmographic once a lead has shown interest.
                Demo requests, pricing visits, and multi-touch engagement routinely outperform title + company size.
              </p>
            </div>
          </div>
        )}

        {tab === "leads" && (
          <div className="rounded-2xl border border-app bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                  Saved Leads
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {leads.length} saved · click a column to sort
                </div>
              </div>
              {leads.length > 0 && (
                <button
                  onClick={() => setLeads([])}
                  className="rounded-md border border-app bg-surface px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-secondary hover:border-rose-400/40 hover:text-rose-500"
                >
                  Clear all
                </button>
              )}
            </div>

            {leads.length === 0 ? (
              <div className="rounded-xl border border-dashed border-app bg-surface-strong/20 p-8 text-center">
                <div className="text-sm font-medium text-secondary">No leads saved yet</div>
                <div className="mt-1 text-xs text-muted">
                  Score a lead in the Rubric tab and tap "Save to lead list".
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-app">
                <table className="w-full text-sm">
                  <thead className="bg-surface-strong/40 text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                    <tr>
                      {([
                        { k: "name" as SortKey, label: "Lead", align: "text-left" },
                        { k: "score" as SortKey, label: "Score", align: "text-right" },
                        { k: "tier" as SortKey, label: "Tier", align: "text-center" },
                      ]).map((c) => (
                        <th
                          key={c.k}
                          className={`px-3 py-2 ${c.align} font-semibold`}
                        >
                          <button
                            onClick={() => toggleSort(c.k)}
                            className="inline-flex items-center gap-1 hover:text-tool-accent"
                          >
                            {c.label}
                            {sortKey === c.k && (
                              <span className="text-tool-accent">
                                {sortDir === "asc" ? "↑" : "↓"}
                              </span>
                            )}
                          </button>
                        </th>
                      ))}
                      <th className="w-10 px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLeads.map((l, i) => (
                      <tr
                        key={`${l.name}-${i}`}
                        className="border-t border-app transition hover:bg-tool-accent-soft/30"
                      >
                        <td className="px-3 py-2 font-medium text-app">{l.name}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-strong">
                              <div
                                className="h-full bg-tool-accent"
                                style={{ width: `${Math.min(100, Math.max(0, l.score))}%` }}
                              />
                            </div>
                            <span className="font-tool-heading w-8 text-right text-sm font-bold tabular-nums text-app">
                              {l.score}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-tool-heading text-xs font-bold ${tierClass(l.tier)}`}
                          >
                            {l.tier}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => removeLead(leads.indexOf(l))}
                            className="rounded px-1.5 text-faint hover:text-rose-500"
                            aria-label="Remove lead"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "batch" && (
          <div className="rounded-2xl border border-app bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                  Batch Scoring
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  CSV in → scored CSV out · attribute columns must match rubric names
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-secondary">
                  Input CSV
                </label>
                <textarea
                  value={batchCsv}
                  onChange={(e) => setBatchCsv(e.target.value)}
                  spellCheck={false}
                  placeholder={`lead_name,${attrs.map((a) => a.name).join(",")}\nAcme,${attrs.map(() => "7").join(",")}`}
                  className="min-h-[180px] w-full rounded-lg border border-app bg-surface px-3 py-2 font-mono text-[0.7rem] text-app outline-none focus:border-tool-accent focus:ring-1 ring-tool-accent"
                />
              </div>
              <div>
                <label className="mb-1 block text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-secondary">
                  Scored output (CSV)
                </label>
                <textarea
                  value={batchOutput}
                  readOnly
                  placeholder="Click Score batch →"
                  className="min-h-[180px] w-full rounded-lg border border-app bg-tool-surface px-3 py-2 font-mono text-[0.7rem] text-app"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  const lines = batchCsv.trim().split(/\r?\n/);
                  if (lines.length < 2) {
                    setBatchOutput("# Need a header row + at least one data row");
                    return;
                  }
                  const header = lines[0].split(",").map((s) => s.trim());
                  const nameIdx = header.findIndex((h) => h.toLowerCase() === "lead_name");
                  const attrCols = attrs.map((a) => ({
                    attr: a,
                    col: header.findIndex((h) => h === a.name),
                  }));
                  const out: string[] = ["lead_name,score,tier"];
                  for (let i = 1; i < lines.length; i++) {
                    const cells = lines[i].split(",").map((s) => s.trim());
                    if (cells.length < 2) continue;
                    const name = nameIdx >= 0 ? cells[nameIdx] : `Lead ${i}`;
                    let wSum = 0,
                      mSum = 0;
                    for (const { attr, col } of attrCols) {
                      if (col < 0) continue;
                      const v = Math.max(0, Math.min(10, parseFloat(cells[col]) || 0));
                      const w = parseFloat(attr.weight) || 0;
                      wSum += w * v;
                      mSum += w * 10;
                    }
                    const s = mSum > 0 ? (wSum / mSum) * 100 : 0;
                    const t = s >= hot ? "A" : s >= warm ? "B" : "C";
                    out.push(`${name},${s.toFixed(0)},${t}`);
                  }
                  setBatchOutput(out.join("\n"));
                }}
                className="rounded-md bg-tool-accent px-4 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-white shadow-sm hover:brightness-110"
              >
                Score batch
              </button>
              <button
                onClick={() => {
                  const header = ["lead_name", ...attrs.map((a) => a.name)].join(",");
                  const sample = [
                    header,
                    `Acme Corp,${attrs.map(() => "8").join(",")}`,
                    `Beta Inc,${attrs.map(() => "5").join(",")}`,
                    `Gamma LLC,${attrs.map(() => "3").join(",")}`,
                  ].join("\n");
                  setBatchCsv(sample);
                }}
                className="rounded-md border border-app bg-surface px-4 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
              >
                Insert sample
              </button>
              <button
                onClick={() => {
                  if (!batchOutput) return;
                  navigator.clipboard.writeText(batchOutput);
                  setCopyMsg("Output copied");
                  setTimeout(() => setCopyMsg(""), 1800);
                }}
                className="rounded-md border border-app bg-surface px-4 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-secondary hover:border-tool-accent/40 hover:text-tool-accent"
              >
                Copy output
              </button>
            </div>
            {copyMsg && (
              <div className="mt-2 text-center text-[0.65rem] font-medium text-tool-accent">
                {copyMsg}
              </div>
            )}
          </div>
        )}
      </div>
    </ToolShell>
  );
}
