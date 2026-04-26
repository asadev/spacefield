"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Property Comparison — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Receives NativeAppProps from the workspace Window. No iframe, no AuthGate,
   no PageHeader, no frame=1 chrome, no back-link, no ToolRecommendations,
   no bespoke macOS framing. All comparison math (computeMetrics, computeScore,
   getWinnerIndex, formatValue) is preserved verbatim from page.tsx — only the
   shell is restyled for window-driven layout.

   Width-driven layouts: the property card grid, the matrix column template,
   the score dial row and the action header all key off the live `width` prop
   instead of sm:/md:/lg: breakpoints. Foundation tokens only (bg-app,
   bg-app-elevated, border-app, text-app/secondary/muted, tool-accent
   variants). data-tool-theme="research" scopes the research accent.
═══════════════════════════════════════════════════════════════════════════ */

import { useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { NativeAppProps } from "../_data/tools-list";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

interface PropertyInput {
  id: string;
  name: string;
  image: string | null;
  price: string;
  size: string;
  bedrooms: string;
  location: string;
  type: string;
  yearBuilt: string;
  serviceCharge: string;
  monthlyRent: string;
  walkScore: string;
  furnished: boolean;
  parkingSpots: string;
  appreciation: string;
}

interface MetricDef {
  key: string;
  label: string;
  format: "currency" | "percentage" | "number" | "text" | "year";
  direction: "lower" | "higher" | "none";
  computed?: boolean;
}

const PROPERTY_TYPES = ["Apartment", "Villa", "Townhouse", "Penthouse"];
const WALK_SCORES = ["High", "Medium", "Low"];

const METRICS: MetricDef[] = [
  { key: "price", label: "Purchase Price", format: "currency", direction: "lower" },
  { key: "size", label: "Size (sqft)", format: "number", direction: "higher" },
  { key: "pricePerSqft", label: "Price / sqft", format: "currency", direction: "lower", computed: true },
  { key: "bedrooms", label: "Bedrooms", format: "number", direction: "higher" },
  { key: "pricePerBedroom", label: "Price / Bedroom", format: "currency", direction: "lower", computed: true },
  { key: "location", label: "Location", format: "text", direction: "none" },
  { key: "type", label: "Property Type", format: "text", direction: "none" },
  { key: "furnished", label: "Furnished", format: "text", direction: "none" },
  { key: "parkingSpots", label: "Parking Spots", format: "number", direction: "higher" },
  { key: "yearBuilt", label: "Year Built", format: "year", direction: "higher" },
  { key: "serviceCharge", label: "Service Charge (Annual)", format: "currency", direction: "lower" },
  { key: "monthlyRent", label: "Monthly Rent", format: "currency", direction: "higher" },
  { key: "rentalYield", label: "Rental Yield", format: "percentage", direction: "higher", computed: true },
  { key: "annualROI", label: "Annual ROI %", format: "percentage", direction: "higher", computed: true },
  { key: "monthlyCashFlow", label: "Monthly Cash Flow", format: "currency", direction: "higher", computed: true },
  { key: "fiveYearAppreciation", label: "5-Year Appreciation", format: "currency", direction: "higher", computed: true },
  { key: "monthlyMortgage", label: "Est. Monthly Mortgage", format: "currency", direction: "lower", computed: true },
  { key: "walkScore", label: "Walk Score", format: "text", direction: "none" },
];

// Score weights — preserved verbatim.
const SCORE_WEIGHTS: Record<string, number> = {
  pricePerSqft: 0.2,
  rentalYield: 0.25,
  appreciation: 0.15,
  serviceChargeEff: 0.1,
  size: 0.1,
  bedrooms: 0.1,
  recency: 0.1,
};

let idCounter = 0;

function createEmptyProperty(label: string): PropertyInput {
  return {
    id: `prop-${++idCounter}`,
    name: label,
    image: null,
    price: "",
    size: "",
    bedrooms: "",
    location: "",
    type: "",
    yearBuilt: "",
    serviceCharge: "",
    monthlyRent: "",
    walkScore: "",
    furnished: false,
    parkingSpots: "",
    appreciation: "5",
  };
}

/* ------------------------------------------------------------------ */
/*  Math (preserved verbatim from page.tsx)                           */
/* ------------------------------------------------------------------ */

function computeMetrics(p: PropertyInput): Record<string, number | string | null> {
  const price = Number(p.price) || 0;
  const size = Number(p.size) || 0;
  const rent = Number(p.monthlyRent) || 0;
  const beds = Number(p.bedrooms) || 0;
  const sc = Number(p.serviceCharge) || 0;
  const app = Number(p.appreciation) || 5;

  const pricePerSqft = price > 0 && size > 0 ? price / size : null;
  const pricePerBedroom = price > 0 && beds > 0 ? price / beds : null;
  const rentalYield = price > 0 && rent > 0 ? ((rent * 12) / price) * 100 : null;
  const annualROI =
    price > 0 && rent > 0
      ? (((rent * 12 - sc) / price) * 100) + app
      : null;
  const monthlyCashFlow = rent > 0 ? rent - sc / 12 : null;
  const fiveYearAppreciation = price > 0 ? price * (Math.pow(1 + app / 100, 5) - 1) : null;

  let monthlyMortgage: number | null = null;
  if (price > 0) {
    const principal = price * 0.8;
    const r = 0.05 / 12;
    const n = 25 * 12;
    monthlyMortgage = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  return {
    price: price || null,
    size: size || null,
    pricePerSqft,
    bedrooms: beds || null,
    pricePerBedroom,
    location: p.location || null,
    type: p.type || null,
    furnished: p.furnished ? "Yes" : "No",
    parkingSpots: Number(p.parkingSpots) || null,
    yearBuilt: Number(p.yearBuilt) || null,
    serviceCharge: sc || null,
    monthlyRent: rent || null,
    rentalYield,
    annualROI,
    monthlyCashFlow,
    fiveYearAppreciation,
    monthlyMortgage,
    walkScore: p.walkScore || null,
  };
}

function computeScore(p: PropertyInput, allProperties: PropertyInput[]): number {
  const price = Number(p.price) || 0;
  const size = Number(p.size) || 0;
  const beds = Number(p.bedrooms) || 0;
  const rent = Number(p.monthlyRent) || 0;
  const sc = Number(p.serviceCharge) || 0;
  const yearBuilt = Number(p.yearBuilt) || 0;
  const app = Number(p.appreciation) || 5;

  if (!price || !size) return 0;

  const allVals = allProperties.map((pp) => {
    const pr = Number(pp.price) || 0;
    const sz = Number(pp.size) || 0;
    const bd = Number(pp.bedrooms) || 0;
    const rn = Number(pp.monthlyRent) || 0;
    const scc = Number(pp.serviceCharge) || 0;
    const yb = Number(pp.yearBuilt) || 0;
    const ap = Number(pp.appreciation) || 5;
    return { pr, sz, bd, rn, scc, yb, ap };
  });

  function normalize(val: number, all: number[], higherBetter: boolean): number {
    const valid = all.filter((v) => v > 0);
    if (valid.length < 2) return 50;
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    if (max === min) return 50;
    const norm = ((val - min) / (max - min)) * 100;
    return higherBetter ? norm : 100 - norm;
  }

  const pps = price / size;
  const rentalYield = rent > 0 ? ((rent * 12) / price) * 100 : 0;
  const scEff = sc > 0 ? price / sc : 0;

  const scores: Record<string, number> = {
    pricePerSqft: normalize(pps, allVals.map((v) => v.pr / (v.sz || 1)), false),
    rentalYield: normalize(rentalYield, allVals.map((v) => v.rn > 0 ? ((v.rn * 12) / (v.pr || 1)) * 100 : 0), true),
    appreciation: normalize(app, allVals.map((v) => v.ap), true),
    serviceChargeEff: normalize(scEff, allVals.map((v) => v.scc > 0 ? (v.pr || 1) / v.scc : 0), true),
    size: normalize(size, allVals.map((v) => v.sz), true),
    bedrooms: normalize(beds, allVals.map((v) => v.bd), true),
    recency: normalize(yearBuilt, allVals.map((v) => v.yb), true),
  };

  let total = 0;
  for (const [key, weight] of Object.entries(SCORE_WEIGHTS)) {
    total += (scores[key] || 50) * weight;
  }

  return Math.round(Math.min(100, Math.max(0, total)));
}

function getWinnerIndex(
  values: (number | string | null)[],
  direction: "lower" | "higher" | "none",
): number | null {
  if (direction === "none") return null;
  const valid = values
    .map((v, i) => ({ value: typeof v === "number" ? v : null, index: i }))
    .filter((e) => e.value !== null && e.value > 0);
  if (valid.length < 2) return null;
  const winner =
    direction === "lower"
      ? valid.reduce((min, e) => (e.value! < min.value! ? e : min))
      : valid.reduce((max, e) => (e.value! > max.value! ? e : max));
  return winner.index;
}

function formatValue(value: number | string | null, format: MetricDef["format"]): string {
  if (value === null || value === "") return "—";
  if (format === "text") return String(value);
  if (format === "year") return String(value);
  if (format === "percentage") return `${(value as number).toFixed(2)}%`;
  if (format === "currency") return `AED ${Math.round(value as number).toLocaleString()}`;
  if (format === "number") return Number(value).toLocaleString();
  return String(value);
}

const INPUT_FIELDS: {
  key: keyof PropertyInput;
  label: string;
  type: string;
  placeholder: string;
  required?: boolean;
}[] = [
  { key: "price", label: "Purchase Price (AED)", type: "number", placeholder: "e.g. 2000000", required: true },
  { key: "size", label: "Size (sqft)", type: "number", placeholder: "e.g. 1200", required: true },
  { key: "bedrooms", label: "Bedrooms", type: "number", placeholder: "e.g. 2" },
  { key: "location", label: "Location", type: "text", placeholder: "e.g. Dubai Marina" },
  { key: "yearBuilt", label: "Year Built", type: "number", placeholder: "e.g. 2022" },
  { key: "serviceCharge", label: "Annual Service Charge (AED)", type: "number", placeholder: "e.g. 15000" },
  { key: "monthlyRent", label: "Expected Monthly Rent (AED)", type: "number", placeholder: "e.g. 10000" },
  { key: "parkingSpots", label: "Parking Spots", type: "number", placeholder: "e.g. 1" },
  { key: "appreciation", label: "Annual Appreciation (%)", type: "number", placeholder: "e.g. 5" },
];

/* ------------------------------------------------------------------ */
/*  PhotoSlot                                                         */
/* ------------------------------------------------------------------ */

function PhotoSlot({
  image,
  onUpload,
}: {
  image: string | null;
  onUpload: (data: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onUpload(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-tool-accent-soft ring-1 ring-tool-accent/20">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt="Property"
            className="h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={() => onUpload(null)}
            className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-app/80 text-[10px] text-app shadow-sm backdrop-blur transition hover:bg-app"
            aria-label="Remove photo"
          >
            ×
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-tool-accent transition hover:bg-tool-accent/10"
        >
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2v-9z" />
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">
            Add Photo
          </span>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ScoreDial                                                         */
/* ------------------------------------------------------------------ */

function ScoreDial({ score, size = 64 }: { score: number; size?: number }) {
  const radius = size / 2 - 5;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--tool-accent-soft)"
          strokeWidth="4"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--tool-accent)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-app tabular-nums">
        {score}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PropertyCard + KeyMetric                                          */
/* ------------------------------------------------------------------ */

function KeyMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      <span className={`mt-0.5 text-xs font-semibold tabular-nums ${accent ? "text-tool-accent" : "text-app"}`}>
        {value}
      </span>
    </div>
  );
}

function PropertyCard({
  property,
  index,
  canRemove,
  metrics,
  onUpdate,
  onRemove,
  onImageUpload,
  onEdit,
}: {
  property: PropertyInput;
  index: number;
  canRemove: boolean;
  metrics: Record<string, number | string | null>;
  onUpdate: (id: string, field: keyof PropertyInput, value: string) => void;
  onRemove: (id: string) => void;
  onImageUpload: (id: string, data: string | null) => void;
  onEdit: () => void;
}) {
  const inlineCls =
    "w-full bg-transparent text-app outline-none placeholder:text-muted focus:placeholder:text-muted/60";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.45, delay: index * 0.05, ease }}
      className="group flex flex-col gap-3 rounded-xl border border-app bg-app-elevated p-3 ring-1 ring-tool-accent/10 transition hover:ring-tool-accent/25"
    >
      <PhotoSlot
        image={property.image}
        onUpload={(data) => onImageUpload(property.id, data)}
      />

      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-tool-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-tool-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
          Property {String(index + 1).padStart(2, "0")}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(property.id)}
            className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted transition hover:text-tool-accent"
          >
            Remove
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <input
          type="text"
          placeholder="Property name…"
          value={property.name}
          onChange={(e) => onUpdate(property.id, "name", e.target.value)}
          className={`${inlineCls} text-base font-semibold tracking-tight`}
        />
        <input
          type="text"
          placeholder="Location, e.g. Dubai Marina"
          value={property.location}
          onChange={(e) => onUpdate(property.id, "location", e.target.value)}
          className={`${inlineCls} text-xs text-secondary`}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-app p-2 ring-1 ring-inset ring-app">
        <KeyMetric
          label="Price"
          value={metrics.price ? `AED ${Math.round(metrics.price as number).toLocaleString()}` : "—"}
        />
        <KeyMetric
          label="Size"
          value={metrics.size ? `${(metrics.size as number).toLocaleString()} sqft` : "—"}
        />
        <KeyMetric
          label="Beds"
          value={metrics.bedrooms ? String(metrics.bedrooms) : "—"}
        />
        <KeyMetric
          label="Yield"
          value={metrics.rentalYield ? `${(metrics.rentalYield as number).toFixed(1)}%` : "—"}
          accent={!!metrics.rentalYield}
        />
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-app bg-app px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-secondary transition hover:border-tool-accent/40 hover:bg-tool-accent-soft hover:text-tool-accent"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        Edit Details
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  EditDrawer                                                        */
/* ------------------------------------------------------------------ */

function EditDrawer({
  property,
  onClose,
  onUpdate,
}: {
  property: PropertyInput;
  onClose: () => void;
  onUpdate: (id: string, field: keyof PropertyInput, value: string) => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="absolute inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.4, ease }}
          onClick={(e) => e.stopPropagation()}
          className="flex h-full w-full max-w-md flex-col bg-app-elevated shadow-2xl ring-1 ring-app"
        >
          <header className="flex items-center justify-between border-b border-app bg-tool-accent-soft px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-tool-accent">
                Editing
              </p>
              <h3 className="mt-0.5 text-base font-semibold text-app">
                {property.name || "Untitled property"}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-app text-app transition hover:bg-tool-accent hover:text-white"
              aria-label="Close"
            >
              ×
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            <fieldset className="mb-5">
              <legend className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-secondary">
                Type
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {PROPERTY_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onUpdate(property.id, "type", property.type === t ? "" : t)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                      property.type === t
                        ? "border-tool-accent bg-tool-accent text-white shadow-sm"
                        : "border-app bg-app text-secondary hover:border-tool-accent/40 hover:bg-tool-accent-soft hover:text-tool-accent"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mb-5 flex items-center justify-between rounded-lg border border-app bg-app px-3 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">
                Furnished
              </span>
              <button
                type="button"
                onClick={() => onUpdate(property.id, "furnished", property.furnished ? "false" : "true")}
                className={`relative h-6 w-11 rounded-full transition ${
                  property.furnished ? "bg-tool-accent" : "bg-app-elevated ring-1 ring-app"
                }`}
                aria-pressed={property.furnished}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    property.furnished ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            <fieldset className="mb-5">
              <legend className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-secondary">
                Walk Score
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {WALK_SCORES.map((ws) => (
                  <button
                    key={ws}
                    type="button"
                    onClick={() => onUpdate(property.id, "walkScore", property.walkScore === ws ? "" : ws)}
                    className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                      property.walkScore === ws
                        ? "border-tool-accent bg-tool-accent text-white"
                        : "border-app bg-app text-secondary hover:border-tool-accent/40 hover:bg-tool-accent-soft hover:text-tool-accent"
                    }`}
                  >
                    {ws}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-3.5">
              {INPUT_FIELDS.map((field) => (
                <label key={field.key} className="block">
                  <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-secondary">
                    {field.label}
                  </span>
                  <input
                    type={field.type}
                    required={field.required}
                    placeholder={field.placeholder}
                    value={property[field.key] as string}
                    onChange={(e) => onUpdate(property.id, field.key, e.target.value)}
                    className="w-full rounded-lg border border-app bg-app px-3 py-2.5 text-sm text-app outline-none transition placeholder:text-muted focus:border-tool-accent focus:bg-app-elevated focus:ring-2 focus:ring-tool-accent/30"
                  />
                </label>
              ))}
            </div>
          </div>

          <footer className="border-t border-app bg-app px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-tool-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
            >
              Done
            </button>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  ComparisonMatrix                                                  */
/* ------------------------------------------------------------------ */

function ComparisonMatrix({
  properties,
  allMetrics,
  metricWinCounts,
  overallWinnerIdx,
  totalDirectionalMetrics,
  labelCol,
}: {
  properties: PropertyInput[];
  allMetrics: Record<string, number | string | null>[];
  metricWinCounts: number[];
  overallWinnerIdx: number | null;
  totalDirectionalMetrics: number;
  labelCol: number;
}) {
  const colTemplate = `${labelCol}px repeat(${properties.length}, minmax(0, 1fr))`;

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: labelCol + properties.length * 140 }}>
        <div
          className="grid border-b border-app bg-app-elevated"
          style={{ gridTemplateColumns: colTemplate }}
        >
          <div className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-secondary">
            Attribute
          </div>
          {properties.map((p, i) => (
            <div
              key={p.id}
              className={`relative border-l border-app px-4 py-3 ${
                overallWinnerIdx === i ? "bg-tool-accent-soft" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                {p.image && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={p.image}
                    alt={p.name || `Property ${i + 1}`}
                    className="h-8 w-8 rounded-md object-cover ring-1 ring-app"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-app">
                    {p.name || `Property ${i + 1}`}
                  </p>
                  {p.location && (
                    <p className="truncate text-[10px] text-muted">{p.location}</p>
                  )}
                </div>
              </div>
              {overallWinnerIdx === i && (
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-tool-accent px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-white">
                  Best
                </span>
              )}
            </div>
          ))}
        </div>

        {METRICS.map((metric, mi) => {
          const values = allMetrics.map((m) => m[metric.key]);
          const winIdx = getWinnerIndex(values, metric.direction);
          return (
            <motion.div
              key={metric.key}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: mi * 0.02, ease }}
              className="grid border-b border-app last:border-b-0"
              style={{ gridTemplateColumns: colTemplate }}
            >
              <div className="flex items-center gap-1.5 px-4 py-2.5">
                <span className="text-[11px] text-secondary">{metric.label}</span>
                {metric.computed && (
                  <span className="rounded bg-tool-accent-soft px-1 py-px text-[8px] font-semibold uppercase tracking-wider text-tool-accent">
                    auto
                  </span>
                )}
              </div>
              {values.map((val, vi) => {
                const isWinner = winIdx === vi;
                return (
                  <div
                    key={properties[vi].id}
                    className={`flex items-center justify-end border-l border-app px-4 py-2.5 text-sm tabular-nums transition ${
                      isWinner
                        ? "bg-tool-accent-soft font-semibold text-tool-accent"
                        : "text-app"
                    }`}
                  >
                    {isWinner && (
                      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                    )}
                    {formatValue(val, metric.format)}
                  </div>
                );
              })}
            </motion.div>
          );
        })}

        <div
          className="grid border-t-2 border-tool-accent/40 bg-tool-accent-soft/50"
          style={{ gridTemplateColumns: colTemplate }}
        >
          <div className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-tool-accent">
            Metric Wins
          </div>
          {metricWinCounts.map((count, si) => (
            <div
              key={properties[si].id}
              className={`flex items-center justify-end gap-2 border-l border-app px-4 py-3 ${
                overallWinnerIdx === si ? "bg-tool-accent-soft" : ""
              }`}
            >
              <span className={`text-base font-bold tabular-nums ${overallWinnerIdx === si ? "text-tool-accent" : "text-app"}`}>
                {count}
              </span>
              <span className="text-[10px] text-muted">/ {totalDirectionalMetrics}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ScoresPanel                                                       */
/* ------------------------------------------------------------------ */

function ScoresPanel({
  properties,
  scores,
  winnerIdx,
  dialCols,
}: {
  properties: PropertyInput[];
  scores: number[];
  winnerIdx: number | null;
  dialCols: number;
}) {
  const ranked = scores
    .map((s, i) => ({ score: s, idx: i }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-5 px-4 py-5 sm:px-6">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${dialCols}, minmax(0, 1fr))` }}
      >
        {properties.map((p, i) => (
          <div
            key={p.id}
            className={`flex flex-col items-center gap-2 rounded-lg border bg-app p-4 ring-1 ${
              winnerIdx === i
                ? "border-tool-accent/40 ring-tool-accent/30"
                : "border-app ring-app"
            }`}
          >
            <ScoreDial score={scores[i]} size={88} />
            <p className="mt-1 max-w-full truncate text-center text-xs font-semibold text-app">
              {p.name || `Property ${i + 1}`}
            </p>
            {winnerIdx === i && (
              <span className="rounded-full bg-tool-accent px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white">
                Recommended
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-app">
        <div className="border-b border-app bg-app-elevated px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-secondary">
          Ranked Score
        </div>
        <div className="divide-y divide-app">
          {ranked.map((r, place) => {
            const p = properties[r.idx];
            const isWinner = winnerIdx === r.idx;
            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 px-4 py-3 ${isWinner ? "bg-tool-accent-soft" : "bg-app"}`}
              >
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                    isWinner ? "bg-tool-accent text-white" : "bg-app-elevated text-secondary ring-1 ring-app"
                  }`}
                >
                  {place + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-app">
                  {p.name || `Property ${r.idx + 1}`}
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-32 overflow-hidden rounded-full bg-app-elevated ring-1 ring-app">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${r.score}%` }}
                      transition={{ duration: 0.7, delay: place * 0.08, ease }}
                      className={`h-full ${isWinner ? "bg-tool-accent" : "bg-tool-accent/50"}`}
                    />
                  </div>
                  <span className={`w-10 text-right text-sm font-bold tabular-nums ${isWinner ? "text-tool-accent" : "text-app"}`}>
                    {r.score}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main                                                              */
/* ------------------------------------------------------------------ */

export default function PropertyComparisonApp({ width }: NativeAppProps) {
  const [properties, setProperties] = useState<PropertyInput[]>([
    createEmptyProperty(""),
    createEmptyProperty(""),
  ]);
  const [showComparison, setShowComparison] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [tab, setTab] = useState<"matrix" | "scores">("matrix");

  const updateProperty = useCallback(
    (id: string, field: keyof PropertyInput, value: string) => {
      setProperties((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          if (field === "furnished") return { ...p, furnished: value === "true" };
          return { ...p, [field]: value };
        }),
      );
      setShowComparison(false);
    },
    [],
  );

  const handleImageUpload = useCallback(
    (id: string, data: string | null) => {
      setProperties((prev) =>
        prev.map((p) => (p.id === id ? { ...p, image: data } : p)),
      );
    },
    [],
  );

  const addProperty = () => {
    if (properties.length >= 4) return;
    setProperties((prev) => [...prev, createEmptyProperty("")]);
    setShowComparison(false);
  };

  const removeProperty = useCallback(
    (id: string) => {
      if (properties.length <= 2) return;
      setProperties((prev) => prev.filter((p) => p.id !== id));
      setShowComparison(false);
    },
    [properties.length],
  );

  const handleCompare = () => setShowComparison(true);

  const allMetrics = useMemo(() => properties.map(computeMetrics), [properties]);
  const allScores = useMemo(
    () => properties.map((p) => computeScore(p, properties)),
    [properties],
  );
  const winnerScoreIdx = useMemo(() => {
    if (allScores.length < 2) return null;
    let maxI = 0;
    for (let i = 1; i < allScores.length; i++) {
      if (allScores[i] > allScores[maxI]) maxI = i;
    }
    return allScores[maxI] > 0 ? maxI : null;
  }, [allScores]);

  const metricWinCounts = useMemo(() => {
    const counts = properties.map(() => 0);
    for (const metric of METRICS) {
      const values = allMetrics.map((m) => m[metric.key]);
      const winIdx = getWinnerIndex(values, metric.direction);
      if (winIdx !== null) counts[winIdx]++;
    }
    return counts;
  }, [allMetrics, properties]);

  const overallWinnerIdx = useMemo(() => {
    if (metricWinCounts.length < 2) return null;
    let maxI = 0;
    for (let i = 1; i < metricWinCounts.length; i++) {
      if (metricWinCounts[i] > metricWinCounts[maxI]) maxI = i;
    }
    return metricWinCounts[maxI] > 0 ? maxI : null;
  }, [metricWinCounts]);

  const editingProperty = editId ? properties.find((p) => p.id === editId) ?? null : null;

  /* ------------------------------------------------------------------ */
  /*  Width-driven layouts                                              */
  /* ------------------------------------------------------------------ */

  // Card grid columns scale to property count + window width.
  let cardCols: number;
  if (properties.length === 2) {
    cardCols = width >= 640 ? 2 : 1;
  } else if (properties.length === 3) {
    cardCols = width >= 880 ? 3 : width >= 600 ? 2 : 1;
  } else {
    cardCols = width >= 1100 ? 4 : width >= 760 ? 2 : 1;
  }
  const cardGridStyle = {
    gridTemplateColumns: `repeat(${cardCols}, minmax(0, 1fr))`,
  };

  // Score dial row.
  let dialCols: number;
  if (properties.length === 2) {
    dialCols = 2;
  } else if (properties.length === 3) {
    dialCols = width >= 600 ? 3 : 2;
  } else {
    dialCols = width >= 900 ? 4 : 2;
  }

  // Matrix label column.
  const labelCol = width >= 720 ? 200 : 160;

  const compact = width < 640;
  const sectionPadX = compact ? 16 : 24;

  const totalDirectionalMetrics = METRICS.filter((m) => m.direction !== "none").length;
  const filledCount = properties.filter((p) => Number(p.price) > 0 && Number(p.size) > 0).length;

  return (
    <div
      data-tool-theme="research"
      data-tool="property-comparison"
      className="relative h-full w-full overflow-y-auto bg-app text-app"
    >
      <section
        className="relative mx-auto pt-5 pb-10"
        style={{
          maxWidth: 1280,
          paddingLeft: sectionPadX,
          paddingRight: sectionPadX,
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="overflow-hidden rounded-xl border border-app bg-app-elevated ring-1 ring-tool-accent/10"
        >
          {/* In-tool header */}
          <div className="tool-hero relative overflow-hidden border-b border-app rounded-t-xl">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.08]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, currentColor 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 24px)",
                color: "var(--tool-accent)",
                maskImage: "radial-gradient(ellipse at 85% 0%, black 0%, transparent 70%)",
              }}
            />
            <div
              className="relative flex flex-wrap items-center justify-between gap-3 py-4"
              style={{ paddingLeft: sectionPadX, paddingRight: sectionPadX }}
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-tool-accent text-white shadow-sm">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 3v18h18" />
                    <path d="M7 14l4-4 4 4 6-6" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-app">
                    Property Comparison
                  </h2>
                  <p className="text-[11px] text-secondary">
                    {properties.length} propert{properties.length === 1 ? "y" : "ies"} · {filledCount} ready
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={addProperty}
                  disabled={properties.length >= 4}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-tool-accent/30 bg-tool-accent-soft px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-tool-accent transition hover:bg-tool-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="text-base leading-none">+</span> Add Property
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProperties([createEmptyProperty(""), createEmptyProperty("")]);
                    setShowComparison(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary transition hover:border-tool-accent/40 hover:text-tool-accent"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handleCompare}
                  disabled={filledCount < 2}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Compare
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Card stack */}
          <div
            className="py-5"
            style={{ paddingLeft: sectionPadX, paddingRight: sectionPadX }}
          >
            <AnimatePresence mode="popLayout">
              <div className="grid gap-4" style={cardGridStyle}>
                {properties.map((prop, i) => (
                  <PropertyCard
                    key={prop.id}
                    property={prop}
                    index={i}
                    canRemove={properties.length > 2}
                    metrics={allMetrics[i]}
                    onUpdate={updateProperty}
                    onRemove={removeProperty}
                    onImageUpload={handleImageUpload}
                    onEdit={() => setEditId(prop.id)}
                  />
                ))}
              </div>
            </AnimatePresence>
          </div>

          {/* Comparison area */}
          <AnimatePresence mode="wait">
            {showComparison && (
              <motion.div
                key="comparison"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease }}
                className="border-t border-app"
              >
                <div
                  className="flex items-center gap-1 border-b border-app bg-tool-accent-soft/40 py-2"
                  style={{ paddingLeft: sectionPadX, paddingRight: sectionPadX }}
                >
                  <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-tool-accent">
                    View
                  </span>
                  {(
                    [
                      { key: "matrix", label: "Matrix" },
                      { key: "scores", label: "Scores" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setTab(opt.key)}
                      className={`rounded-lg px-3 py-1 text-[11px] font-medium transition ${
                        tab === opt.key
                          ? "bg-tool-accent text-white shadow-sm"
                          : "bg-app-elevated text-secondary hover:bg-tool-accent-soft hover:text-tool-accent"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-secondary">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {properties.length} compared
                  </span>
                </div>

                {tab === "matrix" ? (
                  <ComparisonMatrix
                    properties={properties}
                    allMetrics={allMetrics}
                    metricWinCounts={metricWinCounts}
                    overallWinnerIdx={overallWinnerIdx}
                    totalDirectionalMetrics={totalDirectionalMetrics}
                    labelCol={labelCol}
                  />
                ) : (
                  <ScoresPanel
                    properties={properties}
                    scores={allScores}
                    winnerIdx={winnerScoreIdx}
                    dialCols={dialCols}
                  />
                )}

                <p
                  className="border-t border-app py-3 text-[10px] leading-relaxed text-muted"
                  style={{ paddingLeft: sectionPadX, paddingRight: sectionPadX }}
                >
                  Mortgage estimate assumes 80% LTV, 5% interest rate, 25-year term. Score weights: Price/sqft 20%, Rental Yield 25%, Appreciation 15%, Service Charge 10%, Size 10%, Bedrooms 10%, Recency 10%.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </section>

      {editingProperty && (
        <EditDrawer
          property={editingProperty}
          onClose={() => setEditId(null)}
          onUpdate={updateProperty}
        />
      )}
    </div>
  );
}
