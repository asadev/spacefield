"use client";

import { useState, useCallback, useEffect, useMemo, useRef, Suspense } from "react";
import AuthGate from "@/components/AuthGate";
import { motion, AnimatePresence } from "framer-motion";
import { useUserPreferences } from "@/lib/useUserPreferences";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ToolRecommendations from "@/components/ToolRecommendations";
import { awardXP } from "@/lib/xp-actions";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

type DealType = "sale-secondary" | "sale-offplan" | "rental-annual" | "rental-monthly";
type Currency = "AED" | "USD" | "EUR" | "GBP";

interface CommissionResult {
  dealType: DealType;
  transactionValue: number;
  commissionRate: number;
  totalCommission: number;
  vatAmount: number;
  dldFee: number;
  nocFee: number;
  agencyShare: number;
  agentShare: number;
  totalCostToBuyer: number;
  tier: TierBracket | null;
  effectiveRate: number;
}

interface TierBracket {
  label: string;
  min: number;
  max: number; // Infinity for top
  rate: number;
}

const DEAL_TYPES: { value: DealType; label: string; defaultRate: number }[] = [
  { value: "sale-secondary", label: "Sale (Secondary)", defaultRate: 2 },
  { value: "sale-offplan", label: "Sale (Off-Plan)", defaultRate: 3 },
  { value: "rental-annual", label: "Rental (Annual)", defaultRate: 5 },
  { value: "rental-monthly", label: "Rental (Monthly)", defaultRate: 100 },
];

const PRESETS: { label: string; dealType: DealType; rate: number }[] = [
  { label: "Standard 2% Sale", dealType: "sale-secondary", rate: 2 },
  { label: "Developer 3% Off-Plan", dealType: "sale-offplan", rate: 3 },
  { label: "Annual Rental 5%", dealType: "rental-annual", rate: 5 },
];

// Common UAE agency tier ladders (visual reference + auto-pick rate
// for the active tier when "Use Tier Ladder" is on).
const TIER_LADDERS: Record<Exclude<DealType, "rental-monthly">, TierBracket[]> = {
  "sale-secondary": [
    { label: "Up to 1M", min: 0, max: 1_000_000, rate: 2.5 },
    { label: "1M – 3M", min: 1_000_000, max: 3_000_000, rate: 2.0 },
    { label: "3M – 10M", min: 3_000_000, max: 10_000_000, rate: 1.75 },
    { label: "10M+", min: 10_000_000, max: Infinity, rate: 1.5 },
  ],
  "sale-offplan": [
    { label: "Up to 2M", min: 0, max: 2_000_000, rate: 4.0 },
    { label: "2M – 5M", min: 2_000_000, max: 5_000_000, rate: 3.0 },
    { label: "5M – 15M", min: 5_000_000, max: 15_000_000, rate: 2.5 },
    { label: "15M+", min: 15_000_000, max: Infinity, rate: 2.0 },
  ],
  "rental-annual": [
    { label: "Up to 100K", min: 0, max: 100_000, rate: 5.0 },
    { label: "100K – 250K", min: 100_000, max: 250_000, rate: 5.0 },
    { label: "250K – 500K", min: 250_000, max: 500_000, rate: 4.0 },
    { label: "500K+", min: 500_000, max: Infinity, rate: 3.0 },
  ],
};

// Indicative FX vs AED — purely visual; not live.
const FX: Record<Currency, number> = {
  AED: 1,
  USD: 0.272,
  EUR: 0.252,
  GBP: 0.215,
};

function isSaleDeal(dt: DealType) {
  return dt === "sale-secondary" || dt === "sale-offplan";
}

function pickTier(value: number, ladder: TierBracket[]): TierBracket | null {
  return ladder.find((b) => value >= b.min && value < b.max) || null;
}

export default function CommissionCalculatorPage() {
  return (
    <Suspense fallback={null}>
      <CommissionCalculatorInner />
    </Suspense>
  );
}

function CommissionCalculatorInner() {
  const searchParams = useSearchParams();
  const isFramed = searchParams?.get("frame") === "1";

  const [form, setForm] = useState({
    transactionValue: "",
    commissionRate: "2",
    agentSplit: "50",
    dealType: "sale-secondary" as DealType,
    includeVat: false,
    nocFee: "",
    useTierLadder: false,
  });
  const [currency, setCurrency] = useState<Currency>("AED");
  const { prefs, updatePrefs, loading: prefsLoading } = useUserPreferences();
  const prefsApplied = useRef(false);

  useEffect(() => {
    if (!prefsLoading && !prefsApplied.current) {
      prefsApplied.current = true;
      if (prefs.defaultAgentSplit) {
        setForm((prev) => ({
          ...prev,
          agentSplit: prefs.defaultAgentSplit,
        }));
      }
    }
  }, [prefsLoading, prefs]);

  const [copied, setCopied] = useState(false);
  const xpAwarded = useRef(false);

  const setDealType = useCallback((dt: DealType) => {
    const found = DEAL_TYPES.find((d) => d.value === dt);
    const rate = found ? (dt === "rental-monthly" ? "100" : String(found.defaultRate)) : "2";
    setForm((prev) => ({ ...prev, dealType: dt, commissionRate: rate }));
  }, []);

  const applyPreset = useCallback((preset: typeof PRESETS[number]) => {
    setForm((prev) => ({
      ...prev,
      dealType: preset.dealType,
      commissionRate: String(preset.rate),
    }));
  }, []);

  // Active tier ladder (sale + annual rental only).
  const activeLadder = useMemo<TierBracket[] | null>(() => {
    if (form.dealType === "rental-monthly") return null;
    return TIER_LADDERS[form.dealType] || null;
  }, [form.dealType]);

  // Live result — useMemo (no submit needed; results react to inputs).
  const result = useMemo<CommissionResult | null>(() => {
    const value = Number(form.transactionValue);
    if (!value || value <= 0) return null;

    let rate = Number(form.commissionRate) || 0;
    let tier: TierBracket | null = null;
    if (form.useTierLadder && activeLadder) {
      tier = pickTier(value, activeLadder);
      if (tier) rate = tier.rate;
    }

    const split = Number(form.agentSplit) / 100;
    const noc = Number(form.nocFee) || 0;

    let commission: number;
    if (form.dealType === "rental-monthly") {
      commission = value;
    } else {
      commission = value * (rate / 100);
    }

    const vatAmount = form.includeVat ? commission * 0.05 : 0;
    const dldFee = isSaleDeal(form.dealType) ? value * 0.04 : 0;
    const agentShare = commission * split;
    const agencyShare = commission - agentShare;
    const totalCostToBuyer = value + dldFee + commission + vatAmount + noc;
    const effectiveRate = value > 0 ? (commission / value) * 100 : 0;

    return {
      dealType: form.dealType,
      transactionValue: value,
      commissionRate: rate,
      totalCommission: commission,
      vatAmount,
      dldFee,
      nocFee: noc,
      agencyShare,
      agentShare,
      totalCostToBuyer,
      tier,
      effectiveRate,
    };
  }, [form, activeLadder]);

  // Award XP once per session when a real result first appears.
  useEffect(() => {
    if (result && !xpAwarded.current) {
      xpAwarded.current = true;
      awardXP("tool_use", "tool", "commission-calculator").catch(() => {});
    }
  }, [result]);

  const fxRate = FX[currency];
  const fmt = (n: number) =>
    `${currency} ${Math.round(n * fxRate).toLocaleString()}`;
  const fmtCompact = (n: number) => {
    const v = n * fxRate;
    if (Math.abs(v) >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(2)}M`;
    if (Math.abs(v) >= 1_000) return `${currency} ${(v / 1_000).toFixed(0)}K`;
    return `${currency} ${Math.round(v).toLocaleString()}`;
  };

  const getShareText = useCallback(() => {
    if (!result) return "";
    const lines = [
      `Commission Breakdown`,
      `---`,
      `Sale Price: ${fmt(result.transactionValue)}`,
      `Commission Rate: ${result.commissionRate}%`,
      `Total Commission: ${fmt(result.totalCommission)}`,
      `Agency Share: ${fmt(result.agencyShare)}`,
      `Agent Share: ${fmt(result.agentShare)}`,
    ];
    if (result.vatAmount > 0) lines.push(`VAT (5%): ${fmt(result.vatAmount)}`);
    if (result.dldFee > 0) lines.push(`DLD Fee (4%): ${fmt(result.dldFee)}`);
    if (result.nocFee > 0) lines.push(`NOC Fee: ${fmt(result.nocFee)}`);
    lines.push(`---`);
    lines.push(`Calculate yours at example.com/tools/commission-calculator`);
    return lines.join("\n");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, currency]);

  const copyBreakdown = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(getShareText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result, getShareText]);

  const shareWhatsApp = useCallback(() => {
    if (!result) return;
    const text = getShareText();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }, [result, getShareText]);

  // Alternative take-home (70/30 vs 50/50)
  const altSplit = result ? (Number(form.agentSplit) === 70 ? 50 : 70) : 70;
  const altAgentShare = result ? result.totalCommission * (altSplit / 100) : 0;

  // Net take-home: agent's share of commission (what the rep actually keeps)
  const netTakeHome = result ? result.agentShare : 0;

  const dealLabel = result
    ? DEAL_TYPES.find((d) => d.value === result.dealType)?.label ?? ""
    : "";

  // Splits panel — agent vs agency vs buyer-borne fees.
  const splitsViz = useMemo(() => {
    if (!result) return null;
    const total = Math.max(
      0.01,
      result.agentShare + result.agencyShare + result.dldFee + result.nocFee + result.vatAmount
    );
    return [
      { label: "You (Agent)", value: result.agentShare, accent: true },
      { label: "Agency", value: result.agencyShare, accent: false },
      ...(result.vatAmount > 0
        ? [{ label: "VAT", value: result.vatAmount, accent: false }]
        : []),
      ...(result.dldFee > 0
        ? [{ label: "DLD (Buyer)", value: result.dldFee, accent: false }]
        : []),
      ...(result.nocFee > 0
        ? [{ label: "NOC", value: result.nocFee, accent: false }]
        : []),
    ].map((s) => ({ ...s, pct: (s.value / total) * 100 }));
  }, [result]);

  return (
    <AuthGate>
      <div
        data-tool-theme="calculators"
        data-tool="commission-calculator"
        className="min-h-screen bg-app text-app"
      >
        <style jsx>{`
          .cc-mono {
            font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo,
              Consolas, monospace;
            font-variant-numeric: tabular-nums;
            letter-spacing: -0.02em;
          }
          .cc-input {
            background-color: var(--surface);
            border: 1px solid var(--border);
            color: var(--text);
            transition: border-color 120ms ease, box-shadow 120ms ease,
              background-color 120ms ease;
          }
          .cc-input::placeholder {
            color: var(--text-faint);
          }
          .cc-input:focus {
            outline: none;
            border-color: var(--tool-accent);
            box-shadow: 0 0 0 3px var(--tool-accent-ring);
          }
          .cc-range {
            -webkit-appearance: none;
            appearance: none;
            width: 100%;
            height: 6px;
            border-radius: 999px;
            background: linear-gradient(
              to right,
              var(--tool-accent) 0%,
              var(--tool-accent) var(--cc-pct, 0%),
              var(--border) var(--cc-pct, 0%),
              var(--border) 100%
            );
            outline: none;
          }
          .cc-range::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 20px;
            height: 20px;
            border-radius: 999px;
            background: var(--bg-elevated);
            border: 2px solid var(--tool-accent);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
            cursor: pointer;
          }
          .cc-range::-moz-range-thumb {
            width: 20px;
            height: 20px;
            border-radius: 999px;
            background: var(--bg-elevated);
            border: 2px solid var(--tool-accent);
            cursor: pointer;
          }
        `}</style>

        {/* ═════════ HERO HEADER ═════════ */}
        {!isFramed && (
          <header
            className="tool-hero relative overflow-hidden border-b border-app"
          >
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
              <div className="mb-3 flex items-center gap-3">
                <span className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">
                  Tools
                </span>
                <span className="text-muted">/</span>
                <span className="text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent">
                  Calculator
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tool-accent-soft ring-1 ring-tool-accent">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-6 w-6 text-tool-accent"
                  >
                    <path d="M4 4h16v6H4z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 14h7v6H4z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M14 14h6v6h-6z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    Commission Calculator
                  </h1>
                  <p className="mt-1 text-sm text-secondary sm:text-base">
                    Total commission, agency split, VAT, DLD — every number
                    visible at a glance.
                  </p>
                </div>
                {/* Currency pill row */}
                <div
                  role="tablist"
                  aria-label="Display currency"
                  className="inline-flex rounded-full border border-app bg-app-elevated p-1"
                >
                  {(Object.keys(FX) as Currency[]).map((c) => {
                    const active = currency === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setCurrency(c)}
                        className={`cc-mono rounded-full px-3 py-1 text-[0.7rem] font-semibold transition-colors ${
                          active
                            ? "bg-tool-accent text-white"
                            : "text-secondary hover:text-app"
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </header>
        )}

        <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:pt-10">
          {/* ═════════ TOTAL HERO ═════════ */}
          <section
            aria-label="Commission total"
            className="rounded-2xl border border-app bg-app-elevated p-6 shadow-card sm:p-8"
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.25em] text-muted">
                  {result ? "Total Commission" : "Awaiting input"}
                </p>
                <motion.p
                  key={result ? result.totalCommission : "empty"}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease }}
                  className="cc-mono mt-2 text-4xl font-bold sm:text-5xl lg:text-6xl"
                >
                  {result ? fmt(result.totalCommission) : `${currency} —`}
                </motion.p>
                {result && (
                  <p className="cc-mono mt-2 text-xs text-secondary">
                    {result.effectiveRate.toFixed(2)}% effective ·{" "}
                    {dealLabel}
                  </p>
                )}
              </div>
              {result && (
                <div className="flex flex-wrap items-stretch gap-2">
                  <SplitChip
                    label={`You (${form.agentSplit}%)`}
                    value={fmtCompact(result.agentShare)}
                    primary
                  />
                  <SplitChip
                    label={`Agency (${100 - Number(form.agentSplit || 0)}%)`}
                    value={fmtCompact(result.agencyShare)}
                  />
                  {result.vatAmount > 0 && (
                    <SplitChip label="VAT 5%" value={fmtCompact(result.vatAmount)} />
                  )}
                  {result.dldFee > 0 && (
                    <SplitChip label="DLD 4%" value={fmtCompact(result.dldFee)} />
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ═════════ TWO-COLUMN WORKSPACE ═════════ */}
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            {/* ───── INPUTS ───── */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease }}
              aria-label="Deal inputs"
              className="rounded-2xl border border-app bg-app-elevated p-5 shadow-card sm:p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[0.65rem] uppercase tracking-[0.22em] text-muted">
                  Deal Entry
                </p>
                <span className="cc-mono text-[0.6rem] text-muted">
                  FORM W-COMM
                </span>
              </div>

              {/* Deal Type — state buttons */}
              <Field label="Deal Type">
                <div
                  role="tablist"
                  aria-label="Deal type"
                  className="grid grid-cols-2 gap-2"
                >
                  {DEAL_TYPES.map((dt) => {
                    const active = form.dealType === dt.value;
                    return (
                      <button
                        key={dt.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setDealType(dt.value)}
                        className={`rounded-lg border px-3 py-2.5 text-[0.7rem] font-medium uppercase tracking-[0.1em] transition-colors ${
                          active
                            ? "border-tool-accent bg-tool-accent-soft text-app"
                            : "border-app text-secondary hover:text-app hover:bg-surface-hover"
                        }`}
                      >
                        {dt.label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              {/* Presets — pill buttons */}
              <Field label="Quick Presets" hint="One-tap common configurations">
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="rounded-full border border-app bg-app px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.1em] text-secondary transition-colors hover:border-tool-accent hover:bg-tool-accent-soft hover:text-app"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Transaction Value */}
              <Field
                label={
                  form.dealType === "rental-monthly"
                    ? "Monthly Rent (AED)"
                    : form.dealType === "rental-annual"
                      ? "Annual Rent (AED)"
                      : "Deal Value (AED)"
                }
              >
                <div className="relative">
                  <span className="cc-mono pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[0.7rem] text-muted">
                    AED
                  </span>
                  <input
                    type="number"
                    placeholder={
                      form.dealType.startsWith("rental") ? "120,000" : "3,000,000"
                    }
                    value={form.transactionValue}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        transactionValue: e.target.value,
                      }))
                    }
                    className="cc-input cc-mono w-full rounded-lg px-4 py-3 pl-14 text-sm"
                  />
                </div>
              </Field>

              {/* Commission Rate */}
              {form.dealType !== "rental-monthly" && (
                <Field
                  label="Commission %"
                  hint={
                    form.dealType === "sale-offplan"
                      ? "Off-plan typically 2–5%"
                      : undefined
                  }
                  right={
                    activeLadder && (
                      <button
                        type="button"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            useTierLadder: !p.useTierLadder,
                          }))
                        }
                        aria-pressed={form.useTierLadder}
                        className={`rounded-full border px-2.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.15em] transition-colors ${
                          form.useTierLadder
                            ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                            : "border-app text-muted hover:text-app"
                        }`}
                      >
                        {form.useTierLadder ? "Tier ladder ON" : "Tier ladder OFF"}
                      </button>
                    )
                  }
                >
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      placeholder="2.0"
                      disabled={form.useTierLadder}
                      value={form.commissionRate}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          commissionRate: e.target.value,
                        }))
                      }
                      className="cc-input cc-mono w-full rounded-lg px-4 py-3 pr-10 text-sm disabled:opacity-50"
                    />
                    <span className="cc-mono pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.7rem] text-muted">
                      %
                    </span>
                  </div>
                </Field>
              )}

              {/* Tier Ladder Visualization — stacked horizontal bars */}
              {activeLadder && (
                <Field label="Commission Tier Ladder" hint="Active tier highlights when deal value lands inside it">
                  <div className="space-y-2">
                    {activeLadder.map((bracket) => {
                      const isActive =
                        result?.tier?.label === bracket.label && form.useTierLadder;
                      const isMatch =
                        result &&
                        result.transactionValue >= bracket.min &&
                        result.transactionValue < bracket.max;
                      const widthPct = Math.min(
                        100,
                        20 +
                          (Math.log10(Math.max(1, bracket.rate)) /
                            Math.log10(5)) *
                            80
                      );
                      return (
                        <div
                          key={bracket.label}
                          className={`relative overflow-hidden rounded-lg border px-3 py-2 transition-all ${
                            isActive
                              ? "border-tool-accent bg-tool-accent-soft"
                              : isMatch
                                ? "border-tool-accent/40 bg-app"
                                : "border-app bg-app"
                          }`}
                        >
                          <div
                            className="absolute inset-y-0 left-0 -z-0"
                            style={{
                              width: `${widthPct}%`,
                              background: isActive
                                ? "var(--tool-accent-soft)"
                                : "color-mix(in srgb, var(--tool-accent) 4%, transparent)",
                            }}
                          />
                          <div className="relative flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  isActive ? "bg-tool-accent" : "bg-app border border-app"
                                }`}
                              />
                              <span
                                className={`text-[0.7rem] font-medium ${
                                  isActive ? "text-app" : "text-secondary"
                                }`}
                              >
                                {bracket.label}
                              </span>
                            </div>
                            <span
                              className={`cc-mono text-[0.75rem] font-semibold ${
                                isActive ? "text-tool-accent" : "text-muted"
                              }`}
                            >
                              {bracket.rate}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Field>
              )}

              {/* Agent Split */}
              <Field
                label="Your Split"
                right={
                  <span className="cc-mono text-[0.7rem] font-semibold text-tool-accent">
                    {form.agentSplit}% / {100 - Number(form.agentSplit || 0)}%
                  </span>
                }
              >
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={form.agentSplit}
                    onChange={(e) => {
                      const value = e.target.value;
                      setForm((prev) => ({ ...prev, agentSplit: value }));
                      updatePrefs({ defaultAgentSplit: value });
                    }}
                    className="cc-range flex-1"
                    style={
                      {
                        ["--cc-pct"]: `${Number(form.agentSplit) || 0}%`,
                      } as React.CSSProperties
                    }
                  />
                  <div className="relative w-20">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={form.agentSplit}
                      onChange={(e) => {
                        const value = e.target.value;
                        setForm((prev) => ({ ...prev, agentSplit: value }));
                        updatePrefs({ defaultAgentSplit: value });
                      }}
                      className="cc-input cc-mono w-full rounded-lg px-2 py-2 pr-6 text-center text-sm"
                    />
                    <span className="cc-mono pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[0.6rem] text-muted">
                      %
                    </span>
                  </div>
                </div>
              </Field>

              {/* NOC */}
              {isSaleDeal(form.dealType) && (
                <Field label="Agency / NOC Fee (AED)" hint="Optional — flat-fee deductions">
                  <input
                    type="number"
                    placeholder="5,000"
                    value={form.nocFee}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, nocFee: e.target.value }))
                    }
                    className="cc-input cc-mono w-full rounded-lg px-4 py-3 text-sm"
                  />
                </Field>
              )}

              {/* VAT Toggle */}
              <div className="mt-4 flex items-center justify-between rounded-lg border border-app bg-app px-4 py-3">
                <div>
                  <p className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-app">
                    VAT 5%
                  </p>
                  <p className="text-[0.65rem] text-muted">
                    Apply on commission
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      includeVat: !prev.includeVat,
                    }))
                  }
                  aria-pressed={form.includeVat}
                  aria-label="Toggle VAT"
                  className={`relative h-6 w-11 rounded-full border transition-all duration-200 ${
                    form.includeVat
                      ? "border-tool-accent bg-tool-accent"
                      : "border-app bg-surface"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all duration-200 ${
                      form.includeVat ? "left-[22px]" : "left-1"
                    }`}
                  />
                </button>
              </div>
            </motion.section>

            {/* ───── BREAKDOWN PANEL ───── */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease, delay: 0.05 }}
              aria-label="Commission breakdown"
              className="rounded-2xl border border-app bg-app-elevated p-5 shadow-card sm:p-6"
            >
              <AnimatePresence mode="wait">
                {result ? (
                  <motion.div
                    key="breakdown"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-5"
                  >
                    {/* Net take-home */}
                    <div className="rounded-xl border border-tool-accent bg-tool-accent-soft p-5">
                      <p className="text-[0.6rem] uppercase tracking-[0.25em] text-tool-accent">
                        Net — You Take Home
                      </p>
                      <p className="cc-mono mt-2 text-3xl font-bold text-app sm:text-4xl">
                        {fmt(netTakeHome)}
                      </p>
                      <p className="cc-mono mt-1 text-[0.7rem] text-secondary">
                        {(
                          (netTakeHome / (result.transactionValue || 1)) *
                          100
                        ).toFixed(2)}
                        % of deal · Buyer all-in{" "}
                        <span className="text-app">
                          {fmt(result.totalCostToBuyer)}
                        </span>
                      </p>
                    </div>

                    {/* Splits visualization — stacked bar */}
                    {splitsViz && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-[0.6rem] uppercase tracking-[0.22em] text-muted">
                            Splits
                          </p>
                          <p className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                            % of stack
                          </p>
                        </div>
                        <div
                          className="flex h-3 w-full overflow-hidden rounded-full border border-app bg-app"
                          role="img"
                          aria-label="Stacked split visualization"
                        >
                          {splitsViz.map((s, i) => (
                            <span
                              key={s.label}
                              title={`${s.label} · ${s.pct.toFixed(1)}%`}
                              style={{
                                width: `${s.pct}%`,
                                background: s.accent
                                  ? "var(--tool-accent)"
                                  : `color-mix(in srgb, var(--tool-accent) ${
                                      45 - i * 8
                                    }%, transparent)`,
                              }}
                            />
                          ))}
                        </div>
                        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {splitsViz.map((s) => (
                            <li
                              key={s.label}
                              className="flex items-center justify-between gap-2 rounded-md border border-app bg-app px-2 py-1.5"
                            >
                              <span className="flex items-center gap-1.5 text-[0.65rem] text-secondary">
                                <span
                                  className="h-2 w-2 rounded-sm"
                                  style={{
                                    background: s.accent
                                      ? "var(--tool-accent)"
                                      : "color-mix(in srgb, var(--tool-accent) 30%, transparent)",
                                  }}
                                />
                                {s.label}
                              </span>
                              <span className="cc-mono text-[0.65rem] text-app">
                                {s.pct.toFixed(0)}%
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Line items */}
                    <div className="rounded-xl border border-app bg-app">
                      <Row label="Deal Value" value={fmt(result.transactionValue)} faint />
                      <Row
                        label={`Gross Commission @ ${result.commissionRate}%`}
                        value={fmt(result.totalCommission)}
                        emphasis
                      />
                      {result.vatAmount > 0 && (
                        <Row
                          label="VAT (5%) on commission"
                          value={`+ ${fmt(result.vatAmount)}`}
                          muted
                        />
                      )}
                      <SubHeader label="Deductions" />
                      <Row
                        label={`Agency split (${100 - Number(form.agentSplit || 0)}%)`}
                        value={`− ${fmt(result.agencyShare)}`}
                        deduction
                      />
                      {result.nocFee > 0 && (
                        <Row
                          label="NOC / Agency fee"
                          value={`− ${fmt(result.nocFee)}`}
                          deduction
                        />
                      )}
                      {result.dldFee > 0 && (
                        <Row
                          label="DLD Transfer (buyer-borne, 4%)"
                          value={fmt(result.dldFee)}
                          faint
                          last
                        />
                      )}
                    </div>

                    {/* What-if comparison */}
                    <div className="rounded-xl border border-app bg-app p-4">
                      <p className="text-[0.6rem] uppercase tracking-[0.22em] text-muted">
                        What-if
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="text-[0.75rem] text-secondary">
                          If split were{" "}
                          <span className="text-app">
                            {altSplit}/{100 - altSplit}
                          </span>{" "}
                          instead of{" "}
                          <span className="text-app">
                            {form.agentSplit}/
                            {100 - Number(form.agentSplit || 0)}
                          </span>
                        </p>
                        <div className="text-right">
                          <p className="cc-mono text-base font-semibold text-tool-accent">
                            {fmt(altAgentShare)}
                          </p>
                          <p className="cc-mono text-[0.6rem] text-muted">
                            {altAgentShare > netTakeHome ? "+" : ""}
                            {fmt(altAgentShare - netTakeHome)} diff
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={copyBreakdown}
                        className="rounded-lg border border-app bg-app px-3 py-2 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-secondary transition-colors hover:border-tool-accent hover:bg-tool-accent-soft hover:text-app"
                      >
                        {copied ? "Copied ✓" : "Copy Stub"}
                      </button>
                      <button
                        type="button"
                        onClick={shareWhatsApp}
                        className="rounded-lg border border-app bg-app px-3 py-2 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-secondary transition-colors hover:border-tool-accent hover:bg-tool-accent-soft hover:text-app"
                      >
                        WhatsApp
                      </button>
                      <Link
                        href="/tools/sales-offer-generator"
                        className="ml-auto inline-flex items-center gap-2 self-center text-[0.7rem] font-medium uppercase tracking-[0.12em] text-muted transition-colors hover:text-tool-accent"
                      >
                        Generate Offer →
                      </Link>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-app bg-app p-10 text-center"
                  >
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-tool-accent-soft">
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="text-tool-accent"
                      >
                        <path d="M9 3h6a2 2 0 0 1 2 2v16l-3-2-2 2-2-2-3 2V5a2 2 0 0 1 2-2Z" />
                        <path d="M9 7h6M9 11h6M9 15h3" />
                      </svg>
                    </div>
                    <p className="text-[0.7rem] uppercase tracking-[0.2em] text-muted">
                      No breakdown yet
                    </p>
                    <p className="mt-2 text-sm text-secondary">
                      Enter a deal value. Your take-home appears here in
                      real-time.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          </div>

          {!isFramed && <ToolRecommendations slug="commission-calculator" />}
        </main>
      </div>
    </AuthGate>
  );
}

/* ──────────────────────── helpers ──────────────────────── */

function Field({
  label,
  hint,
  right,
  children,
}: {
  label: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-secondary">
          {label}
        </label>
        {right}
      </div>
      {children}
      {hint && (
        <p className="mt-1 text-[0.65rem] text-muted">{hint}</p>
      )}
    </div>
  );
}

function SplitChip({
  label,
  value,
  primary,
}: {
  label: string;
  value: string;
  primary?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        primary
          ? "border-tool-accent bg-tool-accent-soft"
          : "border-app bg-app"
      }`}
    >
      <p className="text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </p>
      <p
        className={`cc-mono mt-1 text-sm font-semibold ${
          primary ? "text-tool-accent" : "text-app"
        }`}
        style={{
          fontFamily:
            "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, monospace",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  emphasis,
  muted,
  faint,
  deduction,
  last,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
  faint?: boolean;
  deduction?: boolean;
  last?: boolean;
}) {
  const labelClass = faint
    ? "text-muted"
    : muted
      ? "text-secondary"
      : deduction
        ? "text-app"
        : emphasis
          ? "text-app"
          : "text-secondary";
  const valueClass = faint
    ? "text-muted"
    : deduction
      ? "text-rose-400"
      : emphasis
        ? "text-app font-semibold"
        : muted
          ? "text-secondary"
          : "text-app";
  return (
    <div
      className={`flex items-center justify-between px-4 py-2.5 text-[0.78rem] ${
        last ? "" : "border-b border-app"
      }`}
      style={{
        fontFamily:
          "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, monospace",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span className={labelClass}>{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

function SubHeader({ label }: { label: string }) {
  return (
    <div className="border-b border-app bg-app/40 px-4 py-1.5">
      <p className="text-[0.55rem] uppercase tracking-[0.25em] text-muted">
        {label}
      </p>
    </div>
  );
}
