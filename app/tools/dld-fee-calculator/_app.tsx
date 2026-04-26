"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   DLD Fee Calculator — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Receives NativeAppProps from the workspace Window. No iframe, no AuthGate,
   no PageHeader, no back-links, no ToolRecommendations, no bespoke macOS
   chrome. Uses props.width to switch between two-column and stacked layout
   below 900px. All DLD fee math, hooks and state are preserved verbatim
   from page.tsx.
═══════════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportButton from "@/components/ExportButton";
import { awardXP } from "@/lib/xp-actions";
import { useCanvasTone } from "@/lib/useCanvasTone";
import type { NativeAppProps } from "../_data/tools-list";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

type PropertyType = "apartment" | "villa" | "land" | "commercial";
type TransactionType = "secondary" | "offplan" | "mortgage-only";
type BuyerType = "individual" | "company";
type TransferFeePayer = "buyer" | "seller" | "split";

interface FeeBreakdown {
  dldTransferFee: number;
  dldAdminFee: number;
  knowledgeFee: number;
  innovationFee: number;
  trusteeFee: number;
  agentCommission: number;
  agentCommissionVat: number;
  nocFee: number;
  mortgageRegFee: number;
  mortgageAdmin: number;
  oqoodFee: number;
  oqoodAdmin: number;
  titleDeedFee: number;
  vatOnProperty: number;
  buyerPays: number;
  sellerPays: number;
  totalCost: number;
}

const DEVELOPERS: { label: string; fee: number }[] = [
  { label: "Emaar", fee: 1000 },
  { label: "DAMAC", fee: 5000 },
  { label: "Nakheel", fee: 500 },
  { label: "Dubai Properties", fee: 1000 },
  { label: "Meraas", fee: 1000 },
  { label: "Sobha", fee: 5000 },
  { label: "Danube", fee: 1000 },
  { label: "Azizi", fee: 2000 },
  { label: "MAG", fee: 1000 },
  { label: "Omniyat", fee: 5000 },
  { label: "Select Group", fee: 2500 },
  { label: "Binghatti", fee: 1000 },
  { label: "Ellington", fee: 2000 },
  { label: "Other / Unknown", fee: 2000 },
];

const CHART_COLORS = [
  "#3b82f6cc",
  "#60a5facc",
  "#818cf8cc",
  "#0ea5e9cc",
  "#06b6d4cc",
  "#6366f1cc",
  "#8b5cf6cc",
  "#0284c7cc",
  "#2563ebcc",
];

const fmt = (n: number) =>
  `AED ${Math.round(n).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;

const FEE_TOOLTIPS: Record<string, string> = {
  "DLD Transfer Fee (4%)":
    "Dubai Land Department's 4% transfer fee on the property price. Core government fee paid at closing.",
  "DLD Admin Fee":
    "Administrative fee charged by DLD for processing paperwork. AED 430 for land/villa, AED 580 for apartment.",
  "Knowledge Fee":
    "AED 20 flat fee supporting Dubai's knowledge economy initiatives.",
  "Innovation Fee":
    "AED 10 flat fee supporting government innovation programs.",
  "Trustee Office Fee (incl. VAT)":
    "Fee for the registration trustee office handling the transfer. AED 2,100 under 500k, AED 4,200 above. 5% VAT included.",
  "Agent Commission":
    "Standard real estate agent commission. Typically 2% of property value, paid by buyer.",
  "VAT on Commission (5%)":
    "UAE VAT applied on top of the agent commission amount.",
  "Mortgage Registration (0.25%)":
    "DLD charges 0.25% of the loan amount to register the mortgage against the title deed.",
  "Mortgage Admin Fee":
    "AED 290 administrative fee for processing the mortgage registration.",
  "Oqood Fee (4%)":
    "Off-plan registration fee. DLD registers your purchase contract before completion. 4% of property value.",
  "Oqood Admin Fee":
    "AED 580 administrative fee for Oqood off-plan registration processing.",
  "Title Deed Issuance":
    "AED 250 fee to issue your new title deed certificate.",
  "VAT on Property (5%)":
    "5% UAE VAT applied to commercial property purchases. Residential is exempt.",
};

const tooltipFor = (label: string) => {
  for (const key of Object.keys(FEE_TOOLTIPS)) {
    if (label.startsWith(key.split(" (")[0])) return FEE_TOOLTIPS[key];
  }
  if (label.startsWith("NOC Fee"))
    return "No Objection Certificate fee paid to the developer confirming no outstanding service charges.";
  return "Mandatory transaction fee.";
};

function DonutChart({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const total = segments.reduce((a, s) => a + s.value, 0);
  const tone = useCanvasTone();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || total === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const size = 200;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const outerR = 92;
    const innerR = 62;
    let startAngle = -Math.PI / 2;

    segments.forEach((seg) => {
      const sweep = (seg.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sweep);
      ctx.arc(cx, cy, innerR, startAngle + sweep, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      startAngle += sweep;
    });

    ctx.fillStyle = `rgb(${tone})`;
    ctx.font = "600 14px ui-monospace, SFMono-Regular, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fmt(total), cx, cy - 6);
    ctx.fillStyle = `rgba(${tone}, 0.55)`;
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("TOTAL", cx, cy + 12);
  }, [segments, total, tone]);

  return <canvas ref={canvasRef} className="mx-auto" />;
}

/* ───── Segmented pill row ───── */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  cols,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel?: string;
  cols?: number;
}) {
  const colClass =
    cols === 2
      ? "grid-cols-2"
      : cols === 4
      ? "grid-cols-4"
      : "grid-cols-3";
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`grid ${colClass} gap-1 rounded-full border border-app bg-app-elevated p-0.5`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[0.72rem] font-medium transition-colors ${
              active
                ? "bg-tool-accent text-white shadow-sm"
                : "text-muted hover:text-app"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   NATIVE APP
   ═══════════════════════════════════════════════════ */
export default function DLDFeeCalculatorApp(props: NativeAppProps) {
  const { width, initialParams, initialParamsKey } = props;

  /* Below 900px → stack columns. Below 500px → single payer cell. */
  const isWide = width >= 900;

  const [propertyValue, setPropertyValue] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("apartment");
  const [transactionType, setTransactionType] = useState<TransactionType>("secondary");
  const [buyerType, setBuyerType] = useState<BuyerType>("individual");
  const [developer, setDeveloper] = useState("Emaar");
  const [hasMortgage, setHasMortgage] = useState(false);
  const [loanAmount, setLoanAmount] = useState("");
  const [hasAgent, setHasAgent] = useState(true);
  const [agentRate, setAgentRate] = useState("2");
  const [transferFeePayer, setTransferFeePayer] = useState<TransferFeePayer>("buyer");
  const [result, setResult] = useState<FeeBreakdown | null>(null);
  const [copied, setCopied] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const xpAwarded = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  /* Hydrate from initialParams when openApp() passes context (e.g. from a
     listing detail or a sibling calculator). */
  useEffect(() => {
    if (!initialParams) return;
    if (typeof initialParams.propertyValue === "number") {
      setPropertyValue(String(Math.round(initialParams.propertyValue)));
    } else if (typeof initialParams.propertyValue === "string") {
      setPropertyValue(initialParams.propertyValue.replace(/[^0-9]/g, ""));
    }
    if (
      initialParams.propertyType === "apartment" ||
      initialParams.propertyType === "villa" ||
      initialParams.propertyType === "land" ||
      initialParams.propertyType === "commercial"
    ) {
      setPropertyType(initialParams.propertyType);
    }
    if (
      initialParams.transactionType === "secondary" ||
      initialParams.transactionType === "offplan" ||
      initialParams.transactionType === "mortgage-only"
    ) {
      setTransactionType(initialParams.transactionType);
    }
    if (typeof initialParams.developer === "string") {
      setDeveloper(initialParams.developer);
    }
    if (typeof initialParams.loanAmount === "number") {
      setHasMortgage(true);
      setLoanAmount(String(Math.round(initialParams.loanAmount)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialParamsKey]);

  const today = useMemo(
    () =>
      new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    []
  );
  const refNumber = useMemo(
    () =>
      `DLD-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`,
    []
  );

  const calculate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const val = Number(propertyValue);
      if (!val || val <= 0) return;

      const isCommercial = propertyType === "commercial";
      const isOffplan = transactionType === "offplan";
      const isMortgageOnly = transactionType === "mortgage-only";
      const loan = hasMortgage ? Number(loanAmount) || 0 : 0;

      const dldTransferFee = isMortgageOnly ? 0 : val * 0.04;

      let dldAdminBase = 0;
      if (!isMortgageOnly) {
        dldAdminBase =
          propertyType === "land" || propertyType === "villa" ? 430 : 580;
      }
      const knowledgeFee = isMortgageOnly ? 0 : 20;
      const innovationFee = isMortgageOnly ? 0 : 10;

      let trusteeFee = 0;
      if (!isMortgageOnly && !isOffplan) {
        trusteeFee = val < 500000 ? 2100 : 4200;
      }

      const rate = hasAgent ? Number(agentRate) / 100 : 0;
      const agentCommission = val * rate;
      const agentCommissionVat = agentCommission * 0.05;

      const devData = DEVELOPERS.find((d) => d.label === developer);
      const nocFee = isMortgageOnly ? 0 : devData?.fee || 2000;

      const mortgageRegFee = loan > 0 ? loan * 0.0025 : 0;
      const mortgageAdmin = loan > 0 ? 290 : 0;

      const oqoodFee = isOffplan ? val * 0.04 : 0;
      const oqoodAdmin = isOffplan ? 580 : 0;

      const titleDeedFee = isMortgageOnly ? 0 : 250;

      const vatOnProperty = isCommercial && !isMortgageOnly ? val * 0.05 : 0;

      const allFees =
        dldTransferFee +
        dldAdminBase +
        knowledgeFee +
        innovationFee +
        trusteeFee +
        agentCommission +
        agentCommissionVat +
        nocFee +
        mortgageRegFee +
        mortgageAdmin +
        oqoodFee +
        oqoodAdmin +
        titleDeedFee +
        vatOnProperty;

      let buyerPays = allFees;
      let sellerPays = 0;
      if (transferFeePayer === "seller") {
        sellerPays = dldTransferFee;
        buyerPays = allFees - dldTransferFee;
      } else if (transferFeePayer === "split") {
        sellerPays = dldTransferFee / 2;
        buyerPays = allFees - dldTransferFee / 2;
      }

      setResult({
        dldTransferFee,
        dldAdminFee: dldAdminBase,
        knowledgeFee,
        innovationFee,
        trusteeFee,
        agentCommission,
        agentCommissionVat,
        nocFee,
        mortgageRegFee,
        mortgageAdmin,
        oqoodFee,
        oqoodAdmin,
        titleDeedFee,
        vatOnProperty,
        buyerPays,
        sellerPays,
        totalCost: allFees,
      });
      setShowResult(true);
      if (!xpAwarded.current) {
        xpAwarded.current = true;
        awardXP("tool_use", "tool", "dld-fee-calculator").catch(() => {});
      }
    },
    [
      propertyValue,
      propertyType,
      transactionType,
      developer,
      hasMortgage,
      loanAmount,
      hasAgent,
      agentRate,
      transferFeePayer,
    ]
  );

  const feeCategories = useMemo(() => {
    if (!result) return [];
    const govt = [
      { label: "DLD Transfer Fee (4%)", value: result.dldTransferFee },
      { label: "DLD Admin Fee", value: result.dldAdminFee },
      { label: "Knowledge Fee", value: result.knowledgeFee },
      { label: "Innovation Fee", value: result.innovationFee },
      { label: "Title Deed Issuance", value: result.titleDeedFee },
    ].filter((l) => l.value > 0);

    const trustee = [
      { label: "Trustee Office Fee (incl. VAT)", value: result.trusteeFee },
    ].filter((l) => l.value > 0);

    const agent = [
      { label: "Agent Commission", value: result.agentCommission },
      { label: "VAT on Commission (5%)", value: result.agentCommissionVat },
    ].filter((l) => l.value > 0);

    const mortgage = [
      { label: "Mortgage Registration (0.25%)", value: result.mortgageRegFee },
      { label: "Mortgage Admin Fee", value: result.mortgageAdmin },
    ].filter((l) => l.value > 0);

    const offplan = [
      { label: "Oqood Fee (4%)", value: result.oqoodFee },
      { label: "Oqood Admin Fee", value: result.oqoodAdmin },
    ].filter((l) => l.value > 0);

    const developerNoc = [
      { label: `NOC Fee (${developer})`, value: result.nocFee },
    ].filter((l) => l.value > 0);

    const vat = [
      { label: "VAT on Property (5%)", value: result.vatOnProperty },
    ].filter((l) => l.value > 0);

    return [
      { title: "Government / DLD", lines: govt },
      { title: "Trustee Office", lines: trustee },
      { title: "Developer", lines: developerNoc },
      { title: "Brokerage", lines: agent },
      { title: "Mortgage", lines: mortgage },
      { title: "Off-Plan Registration", lines: offplan },
      { title: "VAT", lines: vat },
    ].filter((c) => c.lines.length > 0);
  }, [result, developer]);

  const allFeeLines = useMemo(
    () => feeCategories.flatMap((c) => c.lines),
    [feeCategories]
  );

  const chartSegments = useMemo(() => {
    if (!allFeeLines.length) return [];
    return allFeeLines.map((line, i) => ({
      label: line.label,
      value: line.value,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [allFeeLines]);

  const getShareText = useCallback(() => {
    if (!result) return "";
    const val = Number(propertyValue);
    const lines = [
      "DLD Closing Statement",
      `Ref ${refNumber}`,
      "---",
      `Property Value: ${fmt(val)}`,
      "",
      ...allFeeLines.map((l) => `${l.label}: ${fmt(l.value)}`),
      "",
      "---",
      `Total Fees: ${fmt(result.totalCost)}`,
      `Buyer Pays: ${fmt(result.buyerPays)}`,
      result.sellerPays > 0 ? `Seller Pays: ${fmt(result.sellerPays)}` : "",
      `Fees as % of Property: ${((result.totalCost / val) * 100).toFixed(2)}%`,
      "",
      "Calculate yours at example.com/tools/dld-fee-calculator",
    ].filter(Boolean);
    return lines.join("\n");
  }, [result, propertyValue, allFeeLines, refNumber]);

  const copyBreakdown = useCallback(() => {
    navigator.clipboard.writeText(getShareText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [getShareText]);

  const shareWhatsApp = useCallback(() => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(getShareText())}`,
      "_blank"
    );
  }, [getShareText]);

  const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
    { value: "apartment", label: "Apartment" },
    { value: "villa", label: "Villa" },
    { value: "land", label: "Land" },
    { value: "commercial", label: "Commercial" },
  ];

  const TRANSACTION_TYPES: { value: TransactionType; label: string }[] = [
    { value: "secondary", label: "Ready" },
    { value: "offplan", label: "Off-Plan" },
    { value: "mortgage-only", label: "Mortgage Only" },
  ];

  const BUYER_TYPES: { value: BuyerType; label: string }[] = [
    { value: "individual", label: "Individual" },
    { value: "company", label: "Company" },
  ];

  const PAYER_OPTIONS: { value: TransferFeePayer; label: string }[] = [
    { value: "buyer", label: "Buyer" },
    { value: "seller", label: "Seller" },
    { value: "split", label: "Split 50/50" },
  ];

  const categoryTotal = (lines: { value: number }[]) =>
    lines.reduce((s, l) => s + l.value, 0);

  return (
    <div
      data-tool-theme="calculators"
      data-tool="dld-fee-calculator"
      className="h-full w-full overflow-auto bg-app text-app"
    >
      <style jsx global>{`
        [data-tool="dld-fee-calculator"] .dld-mono {
          font-variant-numeric: tabular-nums;
          font-feature-settings: "tnum";
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        }
        [data-tool="dld-fee-calculator"] .dld-input {
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          color: inherit;
          border-radius: 10px;
          transition: border-color 120ms ease, box-shadow 120ms ease;
        }
        [data-tool="dld-fee-calculator"] .dld-input:focus {
          outline: none;
          border-color: var(--tool-accent);
          box-shadow: 0 0 0 3px var(--tool-accent-soft);
        }
        [data-tool="dld-fee-calculator"] .dld-card {
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: 16px;
        }
      `}</style>

      <div className="px-4 pb-8 pt-5 sm:px-6">
        {/* Status strip — replaces page hero (the window title bar already
            announces the tool). Keeps the closing-statement framing. */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-app pb-4">
          <div className="min-w-0">
            <p className="dld-mono text-[0.62rem] uppercase tracking-[0.28em] text-tool-accent">
              Closing Statement Preview
            </p>
            <p className="mt-1 text-sm text-secondary">
              Dubai Land Department breakdown — transfer, trustee, NOC, Oqood,
              and the hidden extras.
            </p>
          </div>
          <div className="dld-mono text-right text-[0.62rem] uppercase tracking-wider text-muted">
            <div>Ref {refNumber}</div>
            <div className="mt-0.5">Issued {today}</div>
          </div>
        </div>

        {/* Width-driven layout: two-col above 900px, stacked below. */}
        <div
          className={isWide ? "grid gap-5" : "flex flex-col gap-5"}
          style={
            isWide
              ? { gridTemplateColumns: "minmax(0,420px) minmax(0,1fr)" }
              : undefined
          }
        >
          {/* ───── LEFT: Input form ───── */}
          <motion.form
            onSubmit={calculate}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease }}
            className="dld-card space-y-5 p-5 sm:p-6"
          >
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                <p className="dld-mono text-[0.62rem] uppercase tracking-[0.22em] text-muted">
                  Transaction Details
                </p>
              </div>
              <span className="dld-mono text-[0.62rem] uppercase tracking-[0.22em] text-faint">
                Inputs
              </span>
            </div>

            {/* Property Value */}
            <div>
              <label className="dld-mono mb-2 block text-[0.62rem] font-medium uppercase tracking-[0.22em] text-muted">
                Property Value (AED)
              </label>
              <div className="relative">
                <span className="dld-mono pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs font-medium text-muted">
                  AED
                </span>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="2,000,000"
                  value={propertyValue}
                  onChange={(e) => setPropertyValue(e.target.value)}
                  className="dld-input dld-mono w-full px-3 py-3 pl-14 text-base font-semibold tabular-nums tracking-tight placeholder:text-faint"
                />
              </div>
            </div>

            {/* Property Type */}
            <div>
              <label className="dld-mono mb-2 block text-[0.62rem] font-medium uppercase tracking-[0.22em] text-muted">
                Property Type
              </label>
              <Segmented
                value={propertyType}
                onChange={setPropertyType}
                options={PROPERTY_TYPES}
                ariaLabel="Property type"
                cols={4}
              />
            </div>

            {/* Transaction Type */}
            <div>
              <label className="dld-mono mb-2 block text-[0.62rem] font-medium uppercase tracking-[0.22em] text-muted">
                Transaction Type
              </label>
              <Segmented
                value={transactionType}
                onChange={setTransactionType}
                options={TRANSACTION_TYPES}
                ariaLabel="Transaction type"
                cols={3}
              />
            </div>

            {/* Buyer Residency */}
            <div>
              <label className="dld-mono mb-2 block text-[0.62rem] font-medium uppercase tracking-[0.22em] text-muted">
                Buyer Residency
              </label>
              <Segmented
                value={buyerType}
                onChange={setBuyerType}
                options={BUYER_TYPES}
                ariaLabel="Buyer residency"
                cols={2}
              />
            </div>

            {/* Developer */}
            {transactionType !== "mortgage-only" && (
              <div>
                <label className="dld-mono mb-2 block text-[0.62rem] font-medium uppercase tracking-[0.22em] text-muted">
                  Developer (NOC Fee)
                </label>
                <select
                  value={developer}
                  onChange={(e) => setDeveloper(e.target.value)}
                  className="dld-input w-full px-3 py-2.5 text-sm"
                >
                  {DEVELOPERS.map((d) => (
                    <option key={d.label} value={d.label}>
                      {d.label} — AED {d.fee.toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Who pays transfer fee */}
            {transactionType !== "mortgage-only" && (
              <div>
                <label className="dld-mono mb-2 block text-[0.62rem] font-medium uppercase tracking-[0.22em] text-muted">
                  Who Pays Transfer Fee
                </label>
                <Segmented
                  value={transferFeePayer}
                  onChange={setTransferFeePayer}
                  options={PAYER_OPTIONS}
                  ariaLabel="Transfer fee payer"
                  cols={3}
                />
              </div>
            )}

            {/* Mortgage toggle */}
            <div className="rounded-xl border border-app bg-app p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.78rem] font-medium text-app">
                  Mortgage
                </span>
                <button
                  type="button"
                  onClick={() => setHasMortgage(!hasMortgage)}
                  aria-pressed={hasMortgage}
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    hasMortgage
                      ? "bg-tool-accent"
                      : "bg-app-elevated border border-app"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                      hasMortgage ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
              <AnimatePresence>
                {hasMortgage && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3"
                  >
                    <input
                      type="number"
                      placeholder="Loan amount (AED)"
                      value={loanAmount}
                      onChange={(e) => setLoanAmount(e.target.value)}
                      className="dld-input dld-mono w-full px-3 py-2 text-sm tabular-nums placeholder:text-faint"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Agent toggle */}
            <div className="rounded-xl border border-app bg-app p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.78rem] font-medium text-app">
                  Agent Commission
                </span>
                <button
                  type="button"
                  onClick={() => setHasAgent(!hasAgent)}
                  aria-pressed={hasAgent}
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    hasAgent
                      ? "bg-tool-accent"
                      : "bg-app-elevated border border-app"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                      hasAgent ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
              <AnimatePresence>
                {hasAgent && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={agentRate}
                        onChange={(e) => setAgentRate(e.target.value)}
                        className="dld-input dld-mono w-full px-3 py-2 text-sm tabular-nums"
                      />
                      <span className="dld-mono text-xs text-muted">% rate</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-tool-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.99]"
            >
              Generate Closing Statement
            </button>
          </motion.form>

          {/* ───── RIGHT: Receipt preview ───── */}
          <div className="dld-card overflow-hidden">
            <div className="h-1 w-full bg-tool-accent" />
            <div className="p-5 sm:p-6">
              <AnimatePresence mode="wait">
                {result && showResult ? (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease }}
                    ref={resultsRef}
                    className="space-y-5"
                  >
                    {/* Receipt header */}
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-dashed border-app pb-4">
                      <div className="min-w-0">
                        <p className="dld-mono text-[0.62rem] uppercase tracking-[0.25em] text-muted">
                          Itemised Receipt
                        </p>
                        <p className="mt-1 text-sm font-semibold text-app">
                          Property Value{" "}
                          <span className="dld-mono text-tool-accent">
                            {fmt(Number(propertyValue))}
                          </span>
                        </p>
                        <p className="dld-mono mt-0.5 text-[0.7rem] text-muted">
                          {propertyType} · {transactionType.replace("-", " ")} · {buyerType}
                        </p>
                      </div>
                      <ExportButton
                        targetRef={resultsRef}
                        filename="dld-closing-statement"
                      />
                    </div>

                    {/* Itemised rows by category */}
                    <div className="space-y-5">
                      {feeCategories.map((cat) => (
                        <div key={cat.title}>
                          <div className="mb-2 flex items-center gap-2">
                            <span className="h-px flex-1 bg-app" />
                            <span className="dld-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                              {cat.title}
                            </span>
                            <span className="h-px flex-1 bg-app" />
                          </div>
                          <div className="overflow-hidden rounded-lg border border-app">
                            {cat.lines.map((line, i) => (
                              <motion.div
                                key={line.label}
                                initial={{ opacity: 0, x: -4 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{
                                  duration: 0.3,
                                  delay: i * 0.03,
                                }}
                                className={`group flex items-center justify-between gap-3 px-3 py-2 ${
                                  i % 2 === 0 ? "bg-app" : "bg-app-elevated"
                                }`}
                              >
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className="truncate text-[0.82rem] text-app">
                                    {line.label}
                                  </span>
                                  <span
                                    className="group/tip relative inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-app-elevated text-[0.55rem] font-bold text-muted ring-1 ring-app"
                                    tabIndex={0}
                                  >
                                    i
                                    <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-60 -translate-x-1/2 rounded-md border border-app bg-app-elevated px-3 py-2 text-[0.7rem] font-normal leading-relaxed text-app opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100 group-focus/tip:opacity-100">
                                      {tooltipFor(line.label)}
                                    </span>
                                  </span>
                                </div>
                                <div className="dld-mono flex items-baseline gap-1 text-[0.85rem] font-medium tabular-nums text-app">
                                  <span className="text-[0.62rem] text-faint">
                                    AED
                                  </span>
                                  {Math.round(line.value).toLocaleString()}
                                </div>
                              </motion.div>
                            ))}
                            {cat.lines.length > 1 && (
                              <div className="flex items-center justify-between border-t border-app bg-app-elevated px-3 py-1.5 text-[0.7rem]">
                                <span className="text-muted">Subtotal</span>
                                <span className="dld-mono font-semibold tabular-nums text-secondary">
                                  {fmt(categoryTotal(cat.lines))}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Total at closing */}
                    <div className="relative overflow-hidden rounded-2xl border border-tool-accent bg-tool-accent-soft p-5">
                      <div className="absolute left-0 top-0 h-full w-1 bg-tool-accent" />
                      <p className="dld-mono text-[0.62rem] uppercase tracking-[0.25em] text-tool-accent">
                        Total at Closing
                      </p>
                      <p className="dld-mono mt-1 text-3xl font-bold tabular-nums text-tool-accent sm:text-4xl">
                        {fmt(result.totalCost)}
                      </p>
                      <p className="dld-mono mt-1 text-[0.75rem] tabular-nums text-secondary">
                        {((result.totalCost / Number(propertyValue)) * 100).toFixed(2)}
                        % of property value
                      </p>
                      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-tool-accent/30 pt-3">
                        <div>
                          <p className="dld-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                            Buyer Pays
                          </p>
                          <p className="dld-mono mt-0.5 text-lg font-semibold tabular-nums text-app">
                            {fmt(result.buyerPays)}
                          </p>
                        </div>
                        {result.sellerPays > 0 && (
                          <div>
                            <p className="dld-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                              Seller Pays
                            </p>
                            <p className="dld-mono mt-0.5 text-lg font-semibold tabular-nums text-app">
                              {fmt(result.sellerPays)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Donut chart */}
                    {chartSegments.length > 0 && (
                      <div className="rounded-2xl border border-app bg-app p-4">
                        <p className="dld-mono mb-2 text-[0.6rem] uppercase tracking-[0.25em] text-muted">
                          Fee Composition
                        </p>
                        <DonutChart segments={chartSegments} />
                        <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1.5">
                          {chartSegments.map((seg) => (
                            <div
                              key={seg.label}
                              className="flex items-center gap-1"
                            >
                              <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ backgroundColor: seg.color }}
                              />
                              <span className="text-[0.6rem] text-muted">
                                {seg.label.replace(/\s*\(.*\)/, "")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Hidden costs */}
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[0.6rem] font-bold text-white">
                          !
                        </span>
                        <p className="dld-mono text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">
                          Hidden Costs to Budget
                        </p>
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {[
                          "Ejari registration fee (AED 220)",
                          "First-year service charges",
                          "DEWA deposit (AED 2,000–4,000)",
                          "Moving / fit-out costs",
                          "Home insurance (recommended)",
                          "Mortgage arrangement fee (~1%)",
                          "Property valuation (AED 2,500–3,500)",
                          "Snagging (AED 1,500–3,000)",
                        ].map((note) => (
                          <div
                            key={note}
                            className="flex items-start gap-1.5 text-[0.72rem] text-secondary"
                          >
                            <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-amber-500" />
                            <span>{note}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Footer actions */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-app pt-4">
                      <button
                        type="button"
                        onClick={copyBreakdown}
                        className="rounded-full border border-app bg-app-elevated px-4 py-2 text-[0.7rem] font-medium text-app transition-colors hover:border-tool-accent hover:text-tool-accent"
                      >
                        {copied ? "Copied" : "Copy Statement"}
                      </button>
                      <button
                        type="button"
                        onClick={shareWhatsApp}
                        className="rounded-full bg-tool-accent px-4 py-2 text-[0.7rem] font-semibold text-white transition-opacity hover:opacity-90"
                      >
                        Send via WhatsApp
                      </button>
                      <span className="dld-mono ml-auto self-center text-[0.65rem] text-faint">
                        {refNumber}
                      </span>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex min-h-[420px] items-center justify-center"
                  >
                    <div className="max-w-sm text-center">
                      <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-tool-accent-soft text-tool-accent ring-1 ring-tool-accent/30">
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M8 4h8a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2z" />
                          <path d="M9 9h6M9 13h6M9 17h3" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-app">
                        Awaiting transaction details
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-muted">
                        Enter a property value and we&apos;ll draft a line-by-line
                        closing statement — DLD registration, trustee, NOC,
                        mortgage, and the hidden costs nobody warns you about.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between border-t border-app bg-app px-4 py-2 text-[0.65rem] text-muted">
              <span>Dubai Land Department · live fee schedule</span>
              <span className="dld-mono tabular-nums">
                {result ? `${allFeeLines.length} line items` : "Ready"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
