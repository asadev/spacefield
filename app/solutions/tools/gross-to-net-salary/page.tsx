"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

interface Breakdown {
  label: string;
  amount: number;
  note?: string;
}

type CountryResult = {
  currency: string;
  symbol: string;
  locale: string;
  gross: number;
  net: number;
  breakdown: Breakdown[];
  note: string;
};

// ---- Country-specific progressive tax calculations (annual, simplified) ----

type Bracket = { rate: number; upTo: number | null };

function progressiveTax(income: number, brackets: Bracket[]) {
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    const top = b.upTo ?? Infinity;
    if (income <= prev) break;
    const taxable = Math.min(income, top) - prev;
    tax += taxable * b.rate;
    prev = top;
    if (income <= top) break;
  }
  return tax;
}

// US — 2025 federal single, plus flat 7.65% FICA (SS capped at $176,100; Medicare uncapped).
function computeUS(gross: number): CountryResult {
  const FED_BRACKETS: Bracket[] = [
    { rate: 0.10, upTo: 11925 },
    { rate: 0.12, upTo: 48475 },
    { rate: 0.22, upTo: 103350 },
    { rate: 0.24, upTo: 197300 },
    { rate: 0.32, upTo: 250525 },
    { rate: 0.35, upTo: 626350 },
    { rate: 0.37, upTo: null },
  ];
  const STD_DEDUCTION = 15000; // 2025 single
  const taxable = Math.max(0, gross - STD_DEDUCTION);
  const fed = progressiveTax(taxable, FED_BRACKETS);
  const ssWage = Math.min(gross, 176100);
  const ss = ssWage * 0.062;
  const medicare = gross * 0.0145 + Math.max(0, gross - 200000) * 0.009; // additional Medicare 0.9% over $200k
  const total = fed + ss + medicare;
  return {
    currency: "USD",
    symbol: "$",
    locale: "en-US",
    gross,
    net: gross - total,
    breakdown: [
      { label: "Federal income tax", amount: fed, note: "2025 single, std. deduction $15,000" },
      { label: "Social Security (6.2%)", amount: ss, note: "Capped at $176,100 wage base" },
      { label: "Medicare (1.45% + 0.9% over $200k)", amount: medicare },
    ],
    note: "US federal + FICA only. State tax, 401(k), health premiums, and local taxes not included.",
  };
}

// UK — 2024/25 England & NI PAYE: personal allowance £12,570 (tapered at £100k), basic/higher/additional.
// NI (employee, 2024/25): 8% between £12,570–£50,270, 2% above.
function computeUK(gross: number): CountryResult {
  let allowance = 12570;
  if (gross > 100000) {
    allowance = Math.max(0, allowance - (gross - 100000) / 2);
  }
  const taxable = Math.max(0, gross - allowance);
  const PAYE: Bracket[] = [
    { rate: 0.20, upTo: Math.max(0, 37700) }, // basic up to £37,700 of taxable
    { rate: 0.40, upTo: Math.max(0, 125140 - allowance) },
    { rate: 0.45, upTo: null },
  ];
  const paye = progressiveTax(taxable, PAYE);

  const niBand1 = Math.max(0, Math.min(gross, 50270) - 12570);
  const niBand2 = Math.max(0, gross - 50270);
  const ni = niBand1 * 0.08 + niBand2 * 0.02;

  const total = paye + ni;
  return {
    currency: "GBP",
    symbol: "£",
    locale: "en-GB",
    gross,
    net: gross - total,
    breakdown: [
      { label: "Income tax (PAYE)", amount: paye, note: `Personal allowance ${allowance.toFixed(0)}` },
      { label: "National Insurance", amount: ni, note: "8% band 1 / 2% above £50,270" },
    ],
    note: "England/Wales/NI 2024/25 basis. Scotland uses different bands. Excludes pension, student loan, benefits.",
  };
}

// UAE — no personal income tax.
function computeUAE(gross: number): CountryResult {
  return {
    currency: "AED",
    symbol: "AED",
    locale: "en-AE",
    gross,
    net: gross,
    breakdown: [{ label: "Income tax", amount: 0, note: "UAE levies no personal income tax" }],
    note: "UAE nationals contribute to GPSSA/ADRPBF; expats generally do not. Employer may deduct pension for nationals — not modelled here.",
  };
}

// Spain — simplified IRPF (state + default autonomous). 2024 brackets combined approx.
// Using combined national rate scale widely cited for residents without regional variations.
function computeSpain(gross: number): CountryResult {
  // Employee social security ~6.48% up to monthly cap of €4,720.5 (annual ~€56,646).
  const ssCap = 56646;
  const ss = Math.min(gross, ssCap) * 0.0648;

  // Earned income reduction (simplified): personal/family minimum ~€5,550.
  const personalMinimum = 5550;
  const taxable = Math.max(0, gross - ss - personalMinimum);

  const IRPF: Bracket[] = [
    { rate: 0.19, upTo: 12450 },
    { rate: 0.24, upTo: 20200 },
    { rate: 0.30, upTo: 35200 },
    { rate: 0.37, upTo: 60000 },
    { rate: 0.45, upTo: 300000 },
    { rate: 0.47, upTo: null },
  ];
  const irpf = progressiveTax(taxable, IRPF);

  const total = ss + irpf;
  return {
    currency: "EUR",
    symbol: "€",
    locale: "es-ES",
    gross,
    net: gross - total,
    breakdown: [
      { label: "Social security (6.48%)", amount: ss, note: "Capped near €56,646 base" },
      { label: "IRPF (national scale)", amount: irpf, note: "After SS + €5,550 personal minimum" },
    ],
    note: "Simplified 2024 combined scale. Real IRPF varies by autonomous community (Madrid, Cataluña, etc.) and family circumstances.",
  };
}

// Netherlands — 2025 box 1. Two brackets + general tax credit (simplified).
// Source: Belastingdienst 2025 tarieven.
function computeNL(gross: number): CountryResult {
  const b1 = Math.min(gross, 75518) * 0.3697;
  const b2 = Math.max(0, gross - 75518) * 0.495;
  const income = b1 + b2;
  // Arbeidskorting + algemene heffingskorting (simplified combined reduction).
  const credits = Math.min(income, 5600);
  const total = Math.max(0, income - credits);
  return {
    currency: "EUR",
    symbol: "€",
    locale: "nl-NL",
    gross,
    net: gross - total,
    breakdown: [
      { label: "Income tax box 1 (36.97%)", amount: b1, note: "Up to €75,518" },
      { label: "Income tax box 1 (49.5%)", amount: b2, note: "Above €75,518" },
      { label: "Combined tax credits", amount: -credits, note: "Approx. arbeidskorting + AHK" },
    ],
    note: "Netherlands 2025 box 1. Ignores 30% ruling, pension, zvw employer-paid. Source: Belastingdienst tarieven 2025.",
  };
}

// Germany — 2025 einkommensteuer progressive formula (simplified) + social.
// Source: BMF 2025 Lohnsteuertabellen.
function computeDE(gross: number): CountryResult {
  // Simplified tax via linear brackets approximating the full formula.
  const DE: Bracket[] = [
    { rate: 0, upTo: 12096 },
    { rate: 0.14, upTo: 17443 },
    { rate: 0.24, upTo: 68480 },
    { rate: 0.42, upTo: 277825 },
    { rate: 0.45, upTo: null },
  ];
  const tax = progressiveTax(gross, DE);
  // Soli (5.5% above threshold, simplified off for most)
  const soli = tax > 20000 ? tax * 0.055 : 0;
  // Social: pension 9.3%, health 7.3%, care 1.8%, unemployment 1.3% (employee).
  const ssBase = Math.min(gross, 96600);
  const social = ssBase * (0.093 + 0.073 + 0.018 + 0.013);
  const total = tax + soli + social;
  return {
    currency: "EUR",
    symbol: "€",
    locale: "de-DE",
    gross,
    net: gross - total,
    breakdown: [
      { label: "Einkommensteuer", amount: tax, note: "Single, 2025 table approx." },
      { label: "Solidaritätszuschlag", amount: soli },
      { label: "Social contributions (~19.7%)", amount: social, note: "Capped at €96,600" },
    ],
    note: "Germany 2025, class I single. Ignores church tax, private vs public health, Riester. Source: BMF Lohnsteuertabelle 2025.",
  };
}

// Ireland — 2025 PAYE (20% up to €44,000 single, 40% above), plus PRSI 4.1% and USC.
// Source: Revenue.ie 2025 tax credits and rate bands.
function computeIE(gross: number): CountryResult {
  const taxCredits = 4000; // personal + PAYE credit simplified
  const cutoff = 44000;
  const paye = Math.min(gross, cutoff) * 0.20 + Math.max(0, gross - cutoff) * 0.40;
  const income = Math.max(0, paye - taxCredits);
  const prsi = gross * 0.041;
  // USC: 0.5% <=12012, 2% <=25760, 4% <=70044, 8% above
  let usc = 0;
  usc += Math.min(gross, 12012) * 0.005;
  if (gross > 12012) usc += Math.min(gross - 12012, 25760 - 12012) * 0.02;
  if (gross > 25760) usc += Math.min(gross - 25760, 70044 - 25760) * 0.04;
  if (gross > 70044) usc += (gross - 70044) * 0.08;
  const total = income + prsi + usc;
  return {
    currency: "EUR",
    symbol: "€",
    locale: "en-IE",
    gross,
    net: gross - total,
    breakdown: [
      { label: "PAYE income tax", amount: income, note: "20% / 40% — net of credits" },
      { label: "PRSI (4.1%)", amount: prsi },
      { label: "Universal Social Charge", amount: usc, note: "0.5% / 2% / 4% / 8% bands" },
    ],
    note: "Ireland 2025 single. Tax credits simplified to €4,000. Source: Revenue.ie.",
  };
}

// Singapore — 2025 resident progressive brackets (IRAS). No social for locals
// (CPF for citizens/PRs @ 20% employee, capped at $6,800/mo OW). Expats pay none.
function computeSG(gross: number): CountryResult {
  const IRAS: Bracket[] = [
    { rate: 0, upTo: 20000 },
    { rate: 0.02, upTo: 30000 },
    { rate: 0.035, upTo: 40000 },
    { rate: 0.07, upTo: 80000 },
    { rate: 0.115, upTo: 120000 },
    { rate: 0.15, upTo: 160000 },
    { rate: 0.18, upTo: 200000 },
    { rate: 0.19, upTo: 240000 },
    { rate: 0.195, upTo: 280000 },
    { rate: 0.20, upTo: 320000 },
    { rate: 0.22, upTo: 500000 },
    { rate: 0.23, upTo: 1000000 },
    { rate: 0.24, upTo: null },
  ];
  const tax = progressiveTax(gross, IRAS);
  return {
    currency: "SGD",
    symbol: "S$",
    locale: "en-SG",
    gross,
    net: gross - tax,
    breakdown: [
      { label: "Income tax (IRAS 2025)", amount: tax, note: "Resident progressive" },
    ],
    note: "Singapore resident 2025. CPF applies to citizens/PRs (20% employee, cap $6,800 ord wage) — not included. Source: IRAS.",
  };
}

// Canada — 2025 federal + Ontario provincial + CPP + EI (ballpark).
// Source: CRA 2025 federal brackets, Ontario provincial brackets.
function computeCA(gross: number): CountryResult {
  const FED: Bracket[] = [
    { rate: 0.15, upTo: 57375 },
    { rate: 0.205, upTo: 114750 },
    { rate: 0.26, upTo: 177882 },
    { rate: 0.29, upTo: 253414 },
    { rate: 0.33, upTo: null },
  ];
  const ON: Bracket[] = [
    { rate: 0.0505, upTo: 52886 },
    { rate: 0.0915, upTo: 105775 },
    { rate: 0.1116, upTo: 150000 },
    { rate: 0.1216, upTo: 220000 },
    { rate: 0.1316, upTo: null },
  ];
  const basic = 15705;
  const taxable = Math.max(0, gross - basic);
  const fed = progressiveTax(taxable, FED);
  const prov = progressiveTax(taxable, ON);
  const cpp = Math.min(gross, 71300 - 3500) * 0.0595;
  const ei = Math.min(gross, 65700) * 0.0164;
  const total = fed + prov + cpp + ei;
  return {
    currency: "CAD",
    symbol: "C$",
    locale: "en-CA",
    gross,
    net: gross - total,
    breakdown: [
      { label: "Federal income tax", amount: fed, note: "2025 brackets, BPA $15,705" },
      { label: "Ontario provincial tax", amount: prov, note: "2025 ON brackets" },
      { label: "CPP (5.95%)", amount: cpp, note: "Capped at $71,300 YMPE" },
      { label: "EI (1.64%)", amount: ei, note: "Capped at $65,700" },
    ],
    note: "Canada 2025 Ontario resident. Ignores non-refundable credits beyond BPA. Sources: CRA / Ontario Finance.",
  };
}

const COUNTRIES = {
  us: { label: "United States (Federal + FICA)", short: "US", fn: computeUS },
  uk: { label: "United Kingdom (England/Wales/NI)", short: "UK", fn: computeUK },
  ca: { label: "Canada (Federal + Ontario)", short: "CA", fn: computeCA },
  de: { label: "Germany (Einkommensteuer)", short: "DE", fn: computeDE },
  nl: { label: "Netherlands (Box 1)", short: "NL", fn: computeNL },
  ie: { label: "Ireland (PAYE + USC)", short: "IE", fn: computeIE },
  es: { label: "Spain (IRPF simplified)", short: "ES", fn: computeSpain },
  sg: { label: "Singapore (IRAS resident)", short: "SG", fn: computeSG },
  ae: { label: "United Arab Emirates", short: "AE", fn: computeUAE },
} as const;

type CountryKey = keyof typeof COUNTRIES;

interface Inputs {
  country: CountryKey;
  gross: string;
}

const DEFAULTS: Inputs = { country: "us", gross: "120000" };

export default function GrossToNetSalaryPage() {
  const [state, setState] = useState<Inputs>(DEFAULTS);
  useEffect(() => {
    const shared = readShareState<Inputs>();
    if (shared) setState({ ...DEFAULTS, ...shared });
  }, []);
  const { country, gross } = state;
  const setCountry = (v: CountryKey) => setState((s) => ({ ...s, country: v }));
  const setGross = (v: string) => setState((s) => ({ ...s, gross: v }));

  const result = useMemo(() => {
    const g = parseFloat(gross) || 0;
    return COUNTRIES[country].fn(g);
  }, [country, gross]);

  // Compare take-home across all countries at the same nominal gross.
  const crossCountry = useMemo(() => {
    const g = parseFloat(gross) || 0;
    return (Object.keys(COUNTRIES) as CountryKey[]).map((k) => {
      const r = COUNTRIES[k].fn(g);
      const eff = r.gross > 0 ? 1 - r.net / r.gross : 0;
      return { key: k, label: COUNTRIES[k].label, short: COUNTRIES[k].short, net: r.net, currency: r.currency, locale: r.locale, eff };
    });
  }, [gross]);

  const fmt = (n: number) =>
    n.toLocaleString(result.locale, {
      style: "currency",
      currency: result.currency,
      maximumFractionDigits: 0,
    });

  const totalTax = result.breakdown.reduce((s, b) => s + b.amount, 0);
  const effective = result.gross > 0 ? totalTax / result.gross : 0;
  const takeHomePct = result.gross > 0 ? (result.net / result.gross) * 100 : 0;

  // Stacked-bar segments: positive deductions are debits; negative entries (credits) reduce burden.
  const stackedBar = useMemo(() => {
    const grossN = result.gross || 0;
    if (grossN <= 0) return { segments: [] as { key: string; label: string; pct: number; amount: number }[], netPct: 0 };
    // Only positive deductions for the bar; credits net into the deductions visually.
    const adjusted = result.breakdown.map((b) => ({ label: b.label, amount: b.amount }));
    const totalDeduct = Math.max(0, adjusted.reduce((s, b) => s + b.amount, 0));
    const netPct = Math.max(0, ((grossN - totalDeduct) / grossN) * 100);
    const segments = adjusted
      .filter((b) => b.amount > 0)
      .map((b, i) => ({
        key: `${b.label}-${i}`,
        label: b.label,
        pct: (b.amount / grossN) * 100,
        amount: b.amount,
      }));
    return { segments, netPct };
  }, [result]);

  // Read --tool-accent from CSS at draw time for the bar.
  const barRef = useRef<HTMLDivElement | null>(null);
  const [accent, setAccent] = useState<string>("");
  useEffect(() => {
    if (!barRef.current) return;
    const v = getComputedStyle(barRef.current).getPropertyValue("--tool-accent").trim();
    if (v) setAccent(v);
  }, [country]);

  return (
    <div data-tool-theme="finance" data-tool="gross-to-net-salary">
      <ToolShell
        category="Finance"
        title="Gross-to-Net Salary"
        description="What actually lands in your account across US, UK, UAE, and Spain. Know the take-home, know the deductions."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              {COUNTRIES[country].short}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {result.currency}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              payroll.ledger
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {COUNTRIES[country].short.toLowerCase()}.gross-to-net
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              ◉ live
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-end justify-between gap-6">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Net pay · annual take-home
                </div>

                <div className="mt-3 flex flex-wrap items-baseline gap-3">
                  <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight text-app sm:text-5xl">
                    {fmt(result.net)}
                  </div>
                  <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
                    {takeHomePct.toFixed(1)}% take-home
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted">
                  <span>
                    Monthly{" "}
                    <span className="ml-1 text-secondary tabular-nums">
                      {fmt(result.net / 12)}
                    </span>
                  </span>
                  <span>
                    Bi-weekly{" "}
                    <span className="ml-1 text-secondary tabular-nums">
                      {fmt(result.net / 26)}
                    </span>
                  </span>
                  <span>
                    Weekly{" "}
                    <span className="ml-1 text-secondary tabular-nums">
                      {fmt(result.net / 52)}
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Effective rate
                  </div>
                  <div className="text-lg font-semibold tabular-nums text-app">
                    {(effective * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="h-8 w-px bg-app" style={{ background: "var(--border)" }} />
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Total taken
                  </div>
                  <div className="text-lg font-semibold tabular-nums text-tool-accent">
                    −{fmt(totalTax)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* country picker — segmented pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(Object.keys(COUNTRIES) as CountryKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setCountry(k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    country === k
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                  title={COUNTRIES[k].label}
                >
                  {COUNTRIES[k].short}
                </button>
              ))}
            </div>
            <div className="ml-auto font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              {COUNTRIES[country].label}
            </div>
          </div>
        </section>

        {/* =========== LEFT RAIL INPUTS + MAIN BODY =========== */}
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          {/* LEFT RAIL */}
          <aside>
            <div className="sticky top-6 space-y-4 rounded-xl border border-app bg-app-elevated p-4">
              <div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                  Earnings · employee
                </div>
                <div className="mt-1 text-[0.65rem] text-muted">section A</div>
              </div>

              <label className="block">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="font-mono text-[0.6rem] font-medium uppercase tracking-[0.18em] text-secondary">
                    Gross annual salary
                  </span>
                  <span className="font-mono text-[0.55rem] italic text-faint">
                    {result.symbol}
                  </span>
                </div>
                <input
                  type="number"
                  value={gross}
                  onChange={(e) => setGross(e.target.value)}
                  min="0"
                  step="1000"
                  className="w-full rounded-lg border border-app bg-app px-3 py-2 font-mono text-base tabular-nums text-app outline-none transition-colors placeholder:text-faint focus:border-tool-accent"
                />
              </label>

              <div className="space-y-2 rounded-lg border border-app bg-app px-3 py-3 font-mono text-[0.7rem] tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="text-[0.58rem] uppercase tracking-[0.2em] text-muted">
                    Gross (annual)
                  </span>
                  <span className="text-app">{fmt(result.gross)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[0.58rem] uppercase tracking-[0.2em] text-muted">
                    Gross (monthly)
                  </span>
                  <span className="text-secondary">{fmt(result.gross / 12)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[0.58rem] uppercase tracking-[0.2em] text-muted">
                    Total deductions
                  </span>
                  <span className="text-tool-accent">−{fmt(totalTax)}</span>
                </div>
                <div className="border-t border-dashed border-app pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.58rem] uppercase tracking-[0.2em] text-tool-accent">
                      Net pay
                    </span>
                    <span className="font-semibold text-tool-accent">
                      {fmt(result.net)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-t border-app pt-3">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                  Quick jump
                </div>
                <div className="mt-2 space-y-1 font-mono text-[0.65rem]">
                  <a href="#gn-flow" className="block text-secondary transition-colors hover:text-tool-accent">
                    ▸ gross → net flow
                  </a>
                  <a href="#gn-deductions" className="block text-secondary transition-colors hover:text-tool-accent">
                    ▸ deductions ledger
                  </a>
                  <a href="#gn-compare" className="block text-secondary transition-colors hover:text-tool-accent">
                    ▸ cross-country
                  </a>
                </div>
              </div>
            </div>
          </aside>

          {/* MAIN BODY */}
          <div className="space-y-5">
            {/* Stacked bar visualization */}
            <section id="gn-flow">
              <div className="rounded-xl border border-app bg-app-elevated p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                      Gross → net · breakdown
                    </div>
                    <h3 className="mt-1 text-lg font-semibold tracking-tight text-app">
                      Where every dollar of your gross goes
                    </h3>
                  </div>
                  <span className="rounded-md border border-app bg-app px-2 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                    100% = {fmt(result.gross)}
                  </span>
                </div>

                <div ref={barRef} className="mt-4">
                  <div className="flex h-10 w-full overflow-hidden rounded-lg border border-app bg-app">
                    {stackedBar.segments.map((seg, i) => {
                      const colors = [
                        "rgba(244, 63, 94, 0.7)",
                        "rgba(245, 158, 11, 0.7)",
                        "rgba(168, 85, 247, 0.7)",
                        "rgba(14, 165, 233, 0.7)",
                      ];
                      return (
                        <div
                          key={seg.key}
                          className="relative h-full transition-all"
                          style={{
                            width: `${Math.max(0, seg.pct)}%`,
                            background: colors[i % colors.length],
                          }}
                          title={`${seg.label}: ${fmt(seg.amount)} (${seg.pct.toFixed(1)}%)`}
                        />
                      );
                    })}
                    <div
                      className="relative h-full transition-all"
                      style={{
                        width: `${Math.max(0, stackedBar.netPct)}%`,
                        background: accent || "var(--tool-accent)",
                      }}
                      title={`Net: ${fmt(result.net)} (${stackedBar.netPct.toFixed(1)}%)`}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                    {stackedBar.segments.map((seg, i) => {
                      const colors = [
                        "rgba(244, 63, 94, 0.7)",
                        "rgba(245, 158, 11, 0.7)",
                        "rgba(168, 85, 247, 0.7)",
                        "rgba(14, 165, 233, 0.7)",
                      ];
                      return (
                        <span key={seg.key} className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block h-2 w-2 rounded-sm"
                            style={{ background: colors[i % colors.length] }}
                          />
                          <span className="text-secondary">{seg.label}</span>
                          <span className="text-faint">{seg.pct.toFixed(1)}%</span>
                        </span>
                      );
                    })}
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-sm"
                        style={{ background: accent || "var(--tool-accent)" }}
                      />
                      <span className="text-tool-accent">Net pay</span>
                      <span className="text-faint">{stackedBar.netPct.toFixed(1)}%</span>
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Deductions ledger */}
            <section id="gn-deductions">
              <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
                <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                    ▾ deductions · itemised
                  </div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    section B
                  </div>
                </div>

                <div className="px-5 py-4">
                  {/* Ledger header */}
                  <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-dashed border-app pb-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    <div>Description</div>
                    <div className="text-right">% of gross</div>
                    <div className="w-28 text-right">Amount</div>
                  </div>

                  {/* Gross — credit */}
                  <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-app py-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-5 items-center rounded-md border border-tool-accent bg-tool-accent-soft px-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                        Credit
                      </span>
                      <span className="text-sm text-app">Gross earnings</span>
                    </div>
                    <div className="text-right font-mono text-[0.7rem] tabular-nums text-muted">
                      100.0%
                    </div>
                    <div className="w-28 text-right font-mono text-sm font-medium tabular-nums text-app">
                      {fmt(result.gross)}
                    </div>
                  </div>

                  {/* Deduction rows */}
                  {result.breakdown.map((b, i) => {
                    const pct = result.gross > 0 ? (b.amount / result.gross) * 100 : 0;
                    const isCredit = b.amount < 0;
                    return (
                      <div
                        key={i}
                        className="grid grid-cols-[1fr_auto_auto] items-start gap-4 border-b border-app py-3 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex h-5 items-center rounded-md border px-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] ${
                                isCredit
                                  ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                                  : "border-rose-500/30 bg-rose-500/10 text-rose-500"
                              }`}
                            >
                              {isCredit ? "Credit" : "Debit"}
                            </span>
                            <span className="truncate text-sm text-app">{b.label}</span>
                          </div>
                          {b.note && (
                            <div className="mt-1 pl-[60px] font-mono text-[0.62rem] italic text-faint">
                              {b.note}
                            </div>
                          )}
                          <div className="mt-2 h-1 overflow-hidden rounded-full bg-app">
                            <div
                              className={`h-full ${
                                isCredit ? "bg-tool-accent" : "bg-rose-500/60"
                              }`}
                              style={{ width: `${Math.min(100, Math.abs(pct))}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right font-mono text-[0.7rem] tabular-nums text-muted">
                          {Math.abs(pct).toFixed(1)}%
                        </div>
                        <div
                          className={`w-28 text-right font-mono text-sm font-medium tabular-nums ${
                            isCredit ? "text-tool-accent" : "text-rose-500"
                          }`}
                        >
                          {isCredit ? "+" : "−"}
                          {fmt(Math.abs(b.amount))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Net line */}
                  <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-3">
                    <div className="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                      Net pay → bank
                    </div>
                    <div className="text-right font-mono text-[0.7rem] tabular-nums text-tool-accent">
                      {(100 - effective * 100).toFixed(1)}%
                    </div>
                    <div className="w-28 text-right font-mono text-base font-semibold tabular-nums text-tool-accent">
                      {fmt(result.net)}
                    </div>
                  </div>

                  <p className="mt-4 font-mono text-[0.62rem] leading-relaxed text-muted">
                    {result.note}
                  </p>
                </div>
              </div>
            </section>

            {/* Cross-country */}
            <section id="gn-compare">
              <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app bg-app px-4 py-2.5">
                  <div>
                    <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                      ▾ cross-country comparison
                    </div>
                    <div className="mt-0.5 font-mono text-[0.62rem] text-muted">
                      Same nominal gross. No FX. Burden, not buying power.
                    </div>
                  </div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    section C
                  </div>
                </div>
                <div className="overflow-x-auto px-5 py-4">
                  <table className="w-full font-mono text-[0.78rem] tabular-nums">
                    <thead>
                      <tr className="border-b border-dashed border-app text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                        <th className="px-2 py-2 text-left font-medium">Code</th>
                        <th className="px-2 py-2 text-left font-medium">Country</th>
                        <th className="px-2 py-2 text-right font-medium">Net take-home</th>
                        <th className="px-2 py-2 text-right font-medium">Effective</th>
                        <th className="hidden px-2 py-2 text-left font-medium sm:table-cell">
                          Burden
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {crossCountry
                        .sort((a, b) => b.net - a.net)
                        .map((r, i) => {
                          const isCurrent = r.key === country;
                          const fmtR = r.net.toLocaleString(r.locale, {
                            style: "currency",
                            currency: r.currency,
                            maximumFractionDigits: 0,
                          });
                          return (
                            <tr
                              key={r.key}
                              className={`border-b border-app last:border-b-0 ${
                                isCurrent ? "bg-tool-accent-soft" : ""
                              }`}
                            >
                              <td className="px-2 py-2 text-tool-accent">
                                {String(i + 1).padStart(2, "0")} · {r.short}
                              </td>
                              <td className="px-2 py-2 text-app">
                                {r.label}
                                {isCurrent && (
                                  <span className="ml-2 rounded-md border border-tool-accent bg-tool-accent-soft px-1.5 py-0.5 text-[0.5rem] uppercase tracking-[0.18em] text-tool-accent">
                                    You
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-right text-app">{fmtR}</td>
                              <td className="px-2 py-2 text-right text-secondary">
                                {(r.eff * 100).toFixed(1)}%
                              </td>
                              <td className="hidden px-2 py-2 sm:table-cell">
                                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-app">
                                  <div
                                    className="h-full bg-rose-500/60"
                                    style={{ width: `${Math.min(100, r.eff * 100)}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </div>

        <ScenarioBar<Inputs>
          slug="gross-to-net-salary"
          state={state}
          onLoad={(d) => setState({ ...DEFAULTS, ...d })}
          exports={{
            csv: () =>
              toCsv([
                ["Item", "Amount"],
                ["Gross", result.gross.toFixed(2)],
                ...result.breakdown.map((b) => [b.label, b.amount.toFixed(2)]),
                ["Net", result.net.toFixed(2)],
                ["Effective rate %", (effective * 100).toFixed(2)],
              ]),
            json: () => ({ state, result, crossCountry }),
            markdown: () =>
              `# Gross-to-net\n\n- Country: ${COUNTRIES[country].label}\n- Gross: ${fmt(result.gross)}\n- Net: **${fmt(result.net)}**\n- Effective rate: ${(effective * 100).toFixed(1)}%\n\n${result.breakdown.map((b) => `- ${b.label}: ${fmt(b.amount)}`).join("\n")}\n`,
          }}
        />
      </ToolShell>
    </div>
  );
}
