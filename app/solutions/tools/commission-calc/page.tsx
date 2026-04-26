"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";

type Tier = { threshold: string; rate: string };
type Spif = { name: string; amount: string };

type PresetKey =
  | "saas-ramp"
  | "enterprise-ae"
  | "strategic-ae"
  | "bdr"
  | "sdr"
  | "hunter"
  | "farmer"
  | "cs-retention"
  | "cs-expansion"
  | "partner-channel"
  | "custom";

interface Preset {
  tiers: Tier[];
  accelAttainment: string; // attainment % threshold for accelerator
  accelMultiplier: string; // e.g. 1.5x
  quota: string;
  spifs: Spif[];
}

const PRESET_LABEL: Record<PresetKey, string> = {
  "saas-ramp": "SaaS AE (ramp)",
  "enterprise-ae": "Enterprise AE",
  "strategic-ae": "Strategic AE",
  "bdr": "BDR",
  "sdr": "SDR",
  "hunter": "Hunter (new-logo)",
  "farmer": "Farmer (renewal)",
  "cs-retention": "CS — retention",
  "cs-expansion": "CS — expansion",
  "partner-channel": "Channel manager",
  "custom": "Custom",
};

const PRESETS: Record<PresetKey, Preset> = {
  "saas-ramp": {
    tiers: [
      { threshold: "0", rate: "8" },
      { threshold: "50000", rate: "10" },
      { threshold: "100000", rate: "12" },
    ],
    accelAttainment: "100",
    accelMultiplier: "1.5",
    quota: "120000",
    spifs: [],
  },
  "enterprise-ae": {
    tiers: [
      { threshold: "0", rate: "10" },
      { threshold: "500000", rate: "13" },
      { threshold: "1000000", rate: "16" },
    ],
    accelAttainment: "100",
    accelMultiplier: "2",
    quota: "1000000",
    spifs: [{ name: "Logo bonus (new)", amount: "5000" }],
  },
  "strategic-ae": {
    tiers: [
      { threshold: "0", rate: "12" },
      { threshold: "1500000", rate: "18" },
      { threshold: "3000000", rate: "22" },
    ],
    accelAttainment: "100",
    accelMultiplier: "2.5",
    quota: "2500000",
    spifs: [
      { name: "Champion referral", amount: "10000" },
      { name: "Multi-year deal bonus", amount: "15000" },
    ],
  },
  bdr: {
    tiers: [
      { threshold: "0", rate: "5" },
      { threshold: "30000", rate: "7" },
    ],
    accelAttainment: "100",
    accelMultiplier: "1.25",
    quota: "60000",
    spifs: [{ name: "Per-meeting SPIF", amount: "100" }],
  },
  sdr: {
    tiers: [
      { threshold: "0", rate: "0" },
    ],
    accelAttainment: "100",
    accelMultiplier: "1",
    quota: "40000",
    spifs: [
      { name: "SQL booked", amount: "75" },
      { name: "SQL accepted", amount: "125" },
      { name: "Closed-won assist", amount: "500" },
    ],
  },
  hunter: {
    tiers: [
      { threshold: "0", rate: "12" },
      { threshold: "300000", rate: "15" },
      { threshold: "600000", rate: "20" },
    ],
    accelAttainment: "100",
    accelMultiplier: "2",
    quota: "600000",
    spifs: [{ name: "New-logo bounty", amount: "2500" }],
  },
  farmer: {
    tiers: [
      { threshold: "0", rate: "4" },
      { threshold: "500000", rate: "6" },
    ],
    accelAttainment: "100",
    accelMultiplier: "1.3",
    quota: "750000",
    spifs: [{ name: "Multi-year renewal", amount: "3000" }],
  },
  "cs-retention": {
    tiers: [
      { threshold: "0", rate: "2" },
      { threshold: "500000", rate: "3" },
    ],
    accelAttainment: "95",
    accelMultiplier: "1.5",
    quota: "500000",
    spifs: [{ name: "NPS milestone", amount: "1000" }],
  },
  "cs-expansion": {
    tiers: [
      { threshold: "0", rate: "6" },
      { threshold: "100000", rate: "9" },
      { threshold: "250000", rate: "12" },
    ],
    accelAttainment: "100",
    accelMultiplier: "1.75",
    quota: "250000",
    spifs: [{ name: "Upsell deal", amount: "500" }],
  },
  "partner-channel": {
    tiers: [
      { threshold: "0", rate: "3" },
      { threshold: "1000000", rate: "5" },
      { threshold: "2500000", rate: "8" },
    ],
    accelAttainment: "100",
    accelMultiplier: "1.5",
    quota: "2000000",
    spifs: [{ name: "Net-new partner activated", amount: "5000" }],
  },
  custom: {
    tiers: [
      { threshold: "0", rate: "5" },
      { threshold: "50000", rate: "8" },
      { threshold: "100000", rate: "12" },
    ],
    accelAttainment: "100",
    accelMultiplier: "1.5",
    quota: "120000",
    spifs: [],
  },
};

const TIER_LABELS = ["base", "std", "accel", "super"];

type ModeKey = "flat" | "tiered" | "accelerated" | "goal";

export default function CommissionCalcPage() {
  const [preset, setPreset] = useState<PresetKey>("saas-ramp");
  const [tiers, setTiers] = useState<Tier[]>(PRESETS["saas-ramp"].tiers);
  const [accelAttainment, setAccelAttainment] = useState(PRESETS["saas-ramp"].accelAttainment);
  const [accelMultiplier, setAccelMultiplier] = useState(PRESETS["saas-ramp"].accelMultiplier);
  const [quota, setQuota] = useState(PRESETS["saas-ramp"].quota);
  const [spifs, setSpifs] = useState<Spif[]>(PRESETS["saas-ramp"].spifs);
  const [attainmentAmount, setAttainmentAmount] = useState("140000");
  const [ytdClosed, setYtdClosed] = useState("85000");
  const [ytdMonth, setYtdMonth] = useState("7"); // month 1-12
  const [mode, setMode] = useState<ModeKey>("tiered");

  const applyPreset = (k: PresetKey) => {
    setPreset(k);
    const p = PRESETS[k];
    setTiers(p.tiers);
    setAccelAttainment(p.accelAttainment);
    setAccelMultiplier(p.accelMultiplier);
    setQuota(p.quota);
    setSpifs(p.spifs);
  };

  const addTier = () =>
    setTiers((p) => [...p, { threshold: (parseFloat(p[p.length - 1]?.threshold || "0") + 50000).toString(), rate: "10" }]);
  const removeTier = (i: number) => setTiers((p) => p.filter((_, idx) => idx !== i));
  const updateTier = (i: number, patch: Partial<Tier>) =>
    setTiers((p) => p.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const addSpif = () => setSpifs((p) => [...p, { name: "New bonus", amount: "1000" }]);
  const removeSpif = (i: number) => setSpifs((p) => p.filter((_, idx) => idx !== i));
  const updateSpif = (i: number, patch: Partial<Spif>) =>
    setSpifs((p) => p.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const calc = useMemo(() => {
    const sorted = [...tiers]
      .map((t) => ({ threshold: parseFloat(t.threshold) || 0, rate: (parseFloat(t.rate) || 0) / 100 }))
      .sort((a, b) => a.threshold - b.threshold);

    const q = parseFloat(quota) || 0;
    const a = parseFloat(attainmentAmount) || 0;
    const attainmentPct = q > 0 ? (a / q) * 100 : 0;
    const accelThreshold = q * ((parseFloat(accelAttainment) || 100) / 100);
    const accelMult = parseFloat(accelMultiplier) || 1;

    let baseCommission = 0;
    const lineItems: { label: string; amount: number }[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const tierStart = sorted[i].threshold;
      const tierEnd = i + 1 < sorted.length ? sorted[i + 1].threshold : Infinity;
      if (a <= tierStart) break;

      // Slice within this tier, but also bounded by the accelerator threshold.
      const sliceEnd = Math.min(a, tierEnd, accelThreshold);
      if (sliceEnd > tierStart) {
        const amt = (sliceEnd - tierStart) * sorted[i].rate;
        baseCommission += amt;
        lineItems.push({
          label: `Tier ${i + 1} @ ${(sorted[i].rate * 100).toFixed(1)}% on ${(sliceEnd - tierStart).toLocaleString()}`,
          amount: amt,
        });
      }

      // Accelerator slice inside this tier (above accelThreshold)
      const accelSliceStart = Math.max(tierStart, accelThreshold);
      const accelSliceEnd = Math.min(a, tierEnd);
      if (accelSliceEnd > accelSliceStart) {
        const amt = (accelSliceEnd - accelSliceStart) * sorted[i].rate * accelMult;
        baseCommission += amt;
        lineItems.push({
          label: `Accelerator ${accelMult}× @ ${(sorted[i].rate * 100).toFixed(1)}% on ${(
            accelSliceEnd - accelSliceStart
          ).toLocaleString()}`,
          amount: amt,
        });
      }

      if (tierEnd === Infinity) break;
    }

    const spifTotal = spifs.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
    spifs.forEach((s) => {
      const v = parseFloat(s.amount) || 0;
      if (v !== 0) lineItems.push({ label: `SPIF: ${s.name || "—"}`, amount: v });
    });

    const total = baseCommission + spifTotal;
    const effRate = a > 0 ? (total / a) * 100 : 0;
    return { total, baseCommission, spifTotal, lineItems, attainmentPct, effRate };
  }, [tiers, quota, attainmentAmount, accelAttainment, accelMultiplier, spifs]);

  // Derived: per-tier ladder bars (visual only, math from existing line items)
  const ladder = useMemo(() => {
    const sorted = [...tiers]
      .map((t, i) => ({
        idx: i,
        threshold: parseFloat(t.threshold) || 0,
        rate: parseFloat(t.rate) || 0,
        label: TIER_LABELS[i] || `t${i + 1}`,
      }))
      .sort((a, b) => a.threshold - b.threshold);
    const a = parseFloat(attainmentAmount) || 0;
    const q = parseFloat(quota) || 0;
    const accelThreshold = q * ((parseFloat(accelAttainment) || 100) / 100);
    const ceiling = Math.max(a, q, accelThreshold, sorted[sorted.length - 1]?.threshold || 0) * 1.1 || 1;

    return sorted.map((t, i) => {
      const next = sorted[i + 1]?.threshold ?? ceiling;
      const start = t.threshold;
      const end = next;
      const filled = Math.max(0, Math.min(a, end) - start);
      const span = end - start;
      const pctFilled = span > 0 ? (filled / span) * 100 : 0;
      const widthPct = (span / ceiling) * 100;
      const startPct = (start / ceiling) * 100;
      const isHit = a >= end;
      const isActive = a > start && a < end;
      return {
        ...t,
        startPct,
        widthPct,
        pctFilled,
        isHit,
        isActive,
      };
    });
  }, [tiers, attainmentAmount, quota, accelAttainment]);

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  // Dial geometry: attainment as arc 0–150% of quota
  const dialMax = 150;
  const dialPct = Math.max(0, Math.min(dialMax, calc.attainmentPct));
  const dialAngle = (dialPct / dialMax) * 270 - 135; // -135 to +135deg

  return (
    <div data-tool-theme="finance" data-tool="commission-calc">
      <ToolShell
        category="Sales"
        title="Commission Calculator"
        description="Tiered commission + SPIFs + accelerators. Choose a preset (SaaS ramp, enterprise AE, BDR) or build your own. Input attainment amount to see payout."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — preset + attainment chips */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              {PRESET_LABEL[preset]}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {tiers.length} tier{tiers.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {spifs.length} spif{spifs.length === 1 ? "" : "s"}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              comp.plan
              <span className="text-faint">/</span>
              <span className="text-secondary">{preset}.calc</span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              ◉ {calc.attainmentPct.toFixed(0)}% quota
            </div>
          </div>

          <div className="relative p-5">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
              {/* Dial */}
              <div className="flex flex-col items-center justify-center rounded-xl border border-app bg-app py-4">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                  OTE attainment
                </div>
                <div className="relative mt-2">
                  <svg viewBox="0 0 200 200" className="h-40 w-40">
                    {/* track */}
                    <path
                      d="M 30 150 A 80 80 0 1 1 170 150"
                      fill="none"
                      stroke="var(--border)"
                      strokeWidth="10"
                      strokeLinecap="round"
                    />
                    {/* fill */}
                    <path
                      d="M 30 150 A 80 80 0 1 1 170 150"
                      fill="none"
                      stroke="var(--tool-accent)"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={`${(dialPct / dialMax) * 377} 999`}
                    />
                    {/* tick marks */}
                    {[0, 25, 50, 75, 100, 125, 150].map((p) => {
                      const ang = ((p / dialMax) * 270 - 135) * (Math.PI / 180);
                      const r1 = 90;
                      const r2 = p === 100 ? 100 : 96;
                      const cx = 100 + Math.sin(ang) * r1;
                      const cy = 100 - Math.cos(ang) * r1;
                      const cx2 = 100 + Math.sin(ang) * r2;
                      const cy2 = 100 - Math.cos(ang) * r2;
                      return (
                        <line
                          key={p}
                          x1={cx}
                          y1={cy}
                          x2={cx2}
                          y2={cy2}
                          stroke={p === 100 ? "var(--tool-accent)" : "var(--border)"}
                          strokeWidth={p === 100 ? 2 : 1}
                        />
                      );
                    })}
                    {/* needle */}
                    <line
                      x1="100"
                      y1="100"
                      x2="100"
                      y2="40"
                      stroke="var(--tool-accent)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      style={{ transformOrigin: "100px 100px", transform: `rotate(${dialAngle}deg)`, transition: "transform 0.3s ease-out" }}
                    />
                    <circle cx="100" cy="100" r="4" fill="var(--tool-accent)" />
                  </svg>
                  <div className="pointer-events-none absolute inset-x-0 bottom-5 text-center">
                    <div className="font-mono text-2xl font-semibold tabular-nums text-app">
                      {calc.attainmentPct.toFixed(0)}%
                    </div>
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                      of quota
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex w-full justify-between px-3 font-mono text-[0.55rem] text-faint">
                  <span>0%</span>
                  <span>100%</span>
                  <span>150%</span>
                </div>
              </div>

              {/* Big number + summary */}
              <div className="flex flex-col">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                      <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                      Computed payout
                    </div>
                    <div className="mt-2 font-mono text-5xl font-bold leading-none tabular-nums text-app sm:text-6xl">
                      {fmt(calc.total)}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent">
                        eff {calc.effRate.toFixed(2)}%
                      </span>
                      <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                        base {fmt(calc.baseCommission)}
                      </span>
                      <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                        spif {fmt(calc.spifTotal)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">Quota</div>
                    <div className="font-mono text-base tabular-nums text-app">{fmt(parseFloat(quota) || 0)}</div>
                    <div className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">Booked</div>
                    <div className="font-mono text-base tabular-nums text-app">{fmt(parseFloat(attainmentAmount) || 0)}</div>
                  </div>
                </div>

                <div className="my-5 h-px bg-app" />

                {/* Tier ladder */}
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    Commission ladder
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {ladder.map((t, i) => (
                      <div key={i} className="grid grid-cols-[58px_1fr_72px] items-center gap-2.5">
                        <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-secondary">
                          {t.label}
                        </span>
                        <div
                          className={`relative h-[22px] overflow-hidden rounded-lg border ${
                            t.isActive
                              ? "border-tool-accent"
                              : t.isHit
                                ? "border-tool-accent"
                                : "border-app"
                          } bg-app`}
                          style={
                            t.isActive
                              ? { boxShadow: "0 0 0 1px var(--tool-accent-soft)" }
                              : undefined
                          }
                        >
                          <div
                            className="h-full transition-all"
                            style={{
                              width: `${t.pctFilled}%`,
                              background: t.isHit
                                ? "var(--tool-accent)"
                                : "var(--tool-accent-soft)",
                            }}
                          />
                        </div>
                        <div className="text-right font-mono text-[0.7rem] tabular-nums text-secondary">
                          {t.rate.toFixed(1)}%
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between font-mono text-[0.55rem] text-faint">
                    <span>$0</span>
                    <span>tier coverage</span>
                    <span>{fmt(parseFloat(attainmentAmount) || 0)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* sub-tab strip — mode pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "flat", label: "Flat" },
                  { k: "tiered", label: "Tiered" },
                  { k: "accelerated", label: "Accelerated" },
                  { k: "goal", label: "Goal-based" },
                ] as { k: ModeKey; label: string }[]
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setMode(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    mode === t.k
                      ? "bg-tool-accent text-app-elevated"
                      : "text-secondary hover:text-app"
                  }`}
                  style={mode === t.k ? { color: "var(--bg)" } : undefined}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <select
              value={preset}
              onChange={(e) => applyPreset(e.target.value as PresetKey)}
              className="rounded-lg border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary outline-none transition-colors hover:border-tool-accent"
            >
              {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
                <option key={k} value={k}>
                  {PRESET_LABEL[k]}
                </option>
              ))}
            </select>

            <div className="ml-auto font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              mode · <span className="text-tool-accent">{mode}</span>
            </div>
          </div>
        </section>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
          <ToolCard title="Plan builder" subtitle="Tiers + accelerator + SPIFs">
            <div className="mb-4">
              <div className="mb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                Comp plan template
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => applyPreset(k)}
                    className={`rounded-lg border px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.15em] transition-colors ${
                      preset === k
                        ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                        : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-app"
                    }`}
                  >
                    {PRESET_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Annual quota ($)">
                <input
                  type="number"
                  value={quota}
                  onChange={(e) => setQuota(e.target.value)}
                  className={inputCls("font-mono tabular-nums")}
                  min="0"
                  step="10000"
                />
              </Field>
              <Field label="Attainment amount ($)">
                <input
                  type="number"
                  value={attainmentAmount}
                  onChange={(e) => setAttainmentAmount(e.target.value)}
                  className={inputCls("font-mono tabular-nums")}
                  min="0"
                  step="1000"
                />
              </Field>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                  Commission tiers
                </span>
                <button
                  onClick={addTier}
                  className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                >
                  + add
                </button>
              </div>
              <div className="grid grid-cols-[40px_1fr_1fr_auto] gap-2 px-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                <span>Tier</span>
                <span>Starts at $</span>
                <span>Rate %</span>
                <span />
              </div>
              <div className="mt-1 space-y-2">
                {tiers.map((t, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[40px_1fr_1fr_auto] items-center gap-2 rounded-lg border border-app bg-app-elevated p-2"
                  >
                    <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-secondary">
                      {TIER_LABELS[i] || `t${i + 1}`}
                    </span>
                    <input
                      type="number"
                      value={t.threshold}
                      onChange={(e) => updateTier(i, { threshold: e.target.value })}
                      className={inputCls("font-mono tabular-nums text-xs")}
                      min="0"
                    />
                    <input
                      type="number"
                      value={t.rate}
                      onChange={(e) => updateTier(i, { rate: e.target.value })}
                      className={inputCls("font-mono tabular-nums text-xs")}
                      min="0"
                      step="0.1"
                    />
                    <button
                      onClick={() => removeTier(i)}
                      className="rounded-md border border-app px-2 text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                      aria-label="Remove tier"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Field label="Accelerator at (% quota)">
                <input
                  type="number"
                  value={accelAttainment}
                  onChange={(e) => setAccelAttainment(e.target.value)}
                  className={inputCls("font-mono tabular-nums")}
                  min="0"
                  step="5"
                />
              </Field>
              <Field label="Accelerator multiplier (x)">
                <input
                  type="number"
                  value={accelMultiplier}
                  onChange={(e) => setAccelMultiplier(e.target.value)}
                  className={inputCls("font-mono tabular-nums")}
                  min="1"
                  step="0.1"
                />
              </Field>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                  SPIFs / bonuses
                </span>
                <button
                  onClick={addSpif}
                  className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                >
                  + add
                </button>
              </div>
              <div className="space-y-2">
                {spifs.map((s, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1.5fr_1fr_auto] gap-2 rounded-lg border border-app bg-app-elevated p-2"
                  >
                    <input
                      value={s.name}
                      onChange={(e) => updateSpif(i, { name: e.target.value })}
                      className={inputCls("text-xs")}
                    />
                    <input
                      type="number"
                      value={s.amount}
                      onChange={(e) => updateSpif(i, { amount: e.target.value })}
                      className={inputCls("font-mono tabular-nums text-xs")}
                    />
                    <button
                      onClick={() => removeSpif(i)}
                      className="rounded-md border border-app px-2 text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                      aria-label="Remove SPIF"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {spifs.length === 0 && (
                  <div className="rounded-lg border border-dashed border-app bg-app p-3 text-center font-mono text-[0.65rem] text-muted">
                    No SPIFs. Add ad-hoc bonuses above.
                  </div>
                )}
              </div>
            </div>
          </ToolCard>

          <ToolCard title="Payout ledger" subtitle={`${calc.attainmentPct.toFixed(0)}% of quota`}>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Total payout" value={fmt(calc.total)} accent />
              <Stat label="Effective rate" value={`${calc.effRate.toFixed(2)}%`} />
              <Stat label="Tiered + accel" value={fmt(calc.baseCommission)} />
              <Stat label="SPIFs" value={fmt(calc.spifTotal)} />
            </div>

            <div className="mt-5">
              <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                Line items
              </div>
              <div className="space-y-0 font-mono tabular-nums">
                {calc.lineItems.length === 0 ? (
                  <div className="text-xs text-muted">No payout at this attainment.</div>
                ) : (
                  calc.lineItems.map((l, i) => (
                    <div
                      key={i}
                      className="flex justify-between border-b border-dashed border-app py-1.5 text-xs"
                    >
                      <span className="text-secondary">{l.label}</span>
                      <span className="text-app">{fmt(l.amount)}</span>
                    </div>
                  ))
                )}
                {calc.lineItems.length > 0 && (
                  <div className="mt-2 flex justify-between border-t border-app pt-2 text-sm">
                    <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                      Net payout
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-app">
                      {fmt(calc.total)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <p className="mt-5 text-[0.65rem] text-muted">
              Standard SaaS comp: base = 50% of OTE, commission = 50% of OTE at 100% attainment. Accelerators above quota
              keep top reps from coasting and prevent quota-sandbagging.
            </p>
          </ToolCard>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolCard title="YTD progress" subtitle="Pacing vs quota">
            <div className="grid grid-cols-2 gap-3">
              <Field label="YTD closed ($)">
                <input
                  type="number"
                  value={ytdClosed}
                  onChange={(e) => setYtdClosed(e.target.value)}
                  className={inputCls("font-mono tabular-nums")}
                  min="0"
                  step="1000"
                />
              </Field>
              <Field label="Month in year (1-12)">
                <input
                  type="number"
                  value={ytdMonth}
                  onChange={(e) => setYtdMonth(e.target.value)}
                  className={inputCls("font-mono tabular-nums")}
                  min="1"
                  max="12"
                  step="1"
                />
              </Field>
            </div>
            {(() => {
              const q = parseFloat(quota) || 0;
              const ytd = parseFloat(ytdClosed) || 0;
              const m = Math.max(1, Math.min(12, parseFloat(ytdMonth) || 1));
              const expected = q * (m / 12);
              const pacePct = expected > 0 ? (ytd / expected) * 100 : 0;
              const projected = m > 0 ? ytd * (12 / m) : 0;
              const projectedAttainPct = q > 0 ? (projected / q) * 100 : 0;
              return (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label="Expected pace" value={fmt(expected)} />
                    <Stat label="YTD vs pace" value={`${pacePct.toFixed(0)}%`} accent={pacePct >= 100} />
                    <Stat label="Projected year-end" value={fmt(projected)} />
                    <Stat label="Projected attainment" value={`${projectedAttainPct.toFixed(0)}%`} />
                  </div>
                  <div className="relative h-3 overflow-hidden rounded-lg border border-app bg-app">
                    <div
                      className="absolute inset-y-0 bg-app-elevated"
                      style={{ width: `${q > 0 ? Math.min(100, (expected / q) * 100) : 0}%` }}
                    />
                    <div
                      className={`absolute inset-y-0 ${
                        pacePct >= 100
                          ? "bg-emerald-500/60"
                          : pacePct >= 80
                            ? "bg-amber-500/60"
                            : "bg-rose-500/60"
                      }`}
                      style={{ width: `${q > 0 ? Math.min(100, (ytd / q) * 100) : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-secondary">
                    {pacePct >= 100 ? "Ahead of pace." : pacePct >= 80 ? "On track." : "Behind pace — 20%+ gap, act now."}
                  </p>
                </div>
              );
            })()}
          </ToolCard>

          <ToolCard title="Next-tier what-if" subtitle="How much for next payout bump?">
            {(() => {
              const sorted = [...tiers]
                .map((t) => ({ threshold: parseFloat(t.threshold) || 0, rate: (parseFloat(t.rate) || 0) / 100 }))
                .sort((a, b) => a.threshold - b.threshold);
              const a = parseFloat(attainmentAmount) || 0;
              const q = parseFloat(quota) || 0;
              const accelThreshold = q * ((parseFloat(accelAttainment) || 100) / 100);
              // find next threshold above current a
              const targets = [...sorted.map((t) => t.threshold), accelThreshold].filter((t) => t > a).sort((x, y) => x - y);
              const nextTargets = targets.slice(0, 3);
              return (
                <div className="space-y-2.5">
                  {nextTargets.length === 0 ? (
                    <div className="text-xs text-muted">You&rsquo;re past every tier boundary. Keep closing.</div>
                  ) : (
                    nextTargets.map((t) => {
                      const gap = t - a;
                      const pctQuota = q > 0 ? (t / q) * 100 : 0;
                      const isAccel = Math.abs(t - accelThreshold) < 0.01;
                      return (
                        <div
                          key={t}
                          className="rounded-lg border border-app bg-app-elevated p-3 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-secondary">
                              {isAccel ? "Accelerator kicks in" : "Next tier boundary"}
                            </span>
                            <span className="font-mono tabular-nums text-tool-accent">{fmt(t)}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-muted">Gap to reach</span>
                            <span className="font-mono font-semibold tabular-nums text-app">{fmt(gap)}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-muted">% of quota</span>
                            <span className="font-mono tabular-nums text-secondary">{pctQuota.toFixed(0)}%</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })()}
          </ToolCard>
        </div>
      </ToolShell>
    </div>
  );
}
