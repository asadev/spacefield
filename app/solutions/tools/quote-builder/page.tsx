"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";
import MintShareButton from "@/app/_share/_components/MintShareButton";

type Line = {
  id: string;
  description: string;
  unit: string;
  qty: string;
  listPrice: string;
  discount: string; // %
};

type Quote = {
  name: string;
  number: string;
  from: string;
  to: string;
  issueDate: string;
  expirationDate: string;
  currency: string;
  terms: string;
  notes: string;
  lines: Line[];
};

const STORAGE_KEY = "spacefield.quoteBuilder.v1";
const CATALOG_KEY = "spacefield.quoteBuilder.catalog.v1";
const MODE_KEY = "spacefield.quoteBuilder.mode.v1";

type CatalogItem = { sku: string; description: string; unit: string; listPrice: string };

const DEFAULT_CATALOG: CatalogItem[] = [
  { sku: "IMPL-HR", description: "Implementation services", unit: "hour", listPrice: "200" },
  { sku: "LIC-SEAT", description: "Platform license — annual", unit: "seat", listPrice: "600" },
  { sku: "TRAIN-SESSION", description: "Training session", unit: "session", listPrice: "1500" },
  { sku: "SUPPORT-PREM", description: "Premium support — annual", unit: "org", listPrice: "12000" },
  { sku: "ADDON-API", description: "API add-on — monthly", unit: "month", listPrice: "500" },
];

type DiscountMatrix = "none" | "volume" | "deal-length" | "strategic";

const DISCOUNT_MATRIX: Record<DiscountMatrix, { label: string; rows: { condition: string; discount: number }[] }> = {
  none: { label: "No preset", rows: [] },
  volume: {
    label: "Volume",
    rows: [
      { condition: "1-9 seats", discount: 0 },
      { condition: "10-49 seats", discount: 5 },
      { condition: "50-99 seats", discount: 10 },
      { condition: "100-249 seats", discount: 15 },
      { condition: "250+ seats", discount: 20 },
    ],
  },
  "deal-length": {
    label: "Deal length",
    rows: [
      { condition: "Monthly", discount: 0 },
      { condition: "Annual", discount: 10 },
      { condition: "2-year commit", discount: 15 },
      { condition: "3-year commit", discount: 20 },
    ],
  },
  strategic: {
    label: "Strategic",
    rows: [
      { condition: "Pilot", discount: 25 },
      { condition: "Logo grab (competitive takeout)", discount: 30 },
      { condition: "Reference customer", discount: 20 },
      { condition: "Multi-product", discount: 15 },
    ],
  },
};

const TERMS_LIBRARY: Record<string, string> = {
  "Net 30 standard": "Net 30 on signature. Prices in USD, exclusive of applicable taxes. Late payments subject to 1.5% monthly interest.",
  "Net 15 early-pay 2%": "Net 15 on signature. 2% discount for payment within 5 business days. Prices exclusive of applicable taxes.",
  "50/50 milestone": "50% due on signature, 50% on go-live. Any out-of-scope work billed at standard rates.",
  "Annual prepay": "Annual fee due on contract signature. Non-refundable. Renews automatically unless cancelled 30 days before renewal.",
  "Professional services": "Services delivered on a T&M basis against the quoted estimate. Any 10%+ overages require written approval.",
  "Enterprise MSA": "Subject to Enterprise Master Services Agreement dated ________. Order form controls in case of conflict.",
};

type TabKey = "edit" | "preview" | "send";

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function defaultQuote(): Quote {
  const today = new Date();
  const exp = new Date();
  exp.setDate(exp.getDate() + 30);
  return {
    name: "Untitled quote",
    number: `Q-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}-001`,
    from: "Your Company\n123 Main St\nCity, State",
    to: "Prospect Name\n456 Client Ave\nCity, State",
    issueDate: today.toISOString().slice(0, 10),
    expirationDate: exp.toISOString().slice(0, 10),
    currency: "USD",
    terms: "Net 30 on signature. Prices in USD, exclusive of applicable taxes.",
    notes: "Quote is valid for 30 days.",
    lines: [
      {
        id: newId(),
        description: "Implementation services",
        unit: "hour",
        qty: "40",
        listPrice: "200",
        discount: "10",
      },
      {
        id: newId(),
        description: "Platform license — annual",
        unit: "seat",
        qty: "25",
        listPrice: "600",
        discount: "15",
      },
    ],
  };
}

export default function QuoteBuilderPage() {
  const [quote, setQuote] = useState<Quote>(defaultQuote);
  const [saved, setSaved] = useState<Record<string, Quote>>({});
  const [loaded, setLoaded] = useState(false);
  const [loadPick, setLoadPick] = useState("");
  const [catalog, setCatalog] = useState<CatalogItem[]>(DEFAULT_CATALOG);
  const [matrix, setMatrix] = useState<DiscountMatrix>("none");
  const [includeDocusignPlaceholders, setIncludeDocusignPlaceholders] = useState(false);
  const [mode, setMode] = useState<TabKey>("edit");

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.saved) setSaved(parsed.saved);
        if (parsed && parsed.current) setQuote(parsed.current);
      }
      const craw = typeof window !== "undefined" ? localStorage.getItem(CATALOG_KEY) : null;
      if (craw) {
        const parsed = JSON.parse(craw);
        if (Array.isArray(parsed) && parsed.length) setCatalog(parsed);
      }
      const m = typeof window !== "undefined" ? localStorage.getItem(MODE_KEY) : null;
      if (m === "edit" || m === "preview" || m === "send") setMode(m as TabKey);
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
    } catch {}
  }, [catalog, loaded]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ saved, current: quote }));
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [saved, quote, mode, loaded]);

  const setField = <K extends keyof Quote>(k: K, v: Quote[K]) => setQuote((q) => ({ ...q, [k]: v }));

  const addLine = () =>
    setQuote((q) => ({
      ...q,
      lines: [...q.lines, { id: newId(), description: "", unit: "ea", qty: "1", listPrice: "0", discount: "0" }],
    }));
  const removeLine = (id: string) =>
    setQuote((q) => ({ ...q, lines: q.lines.filter((l) => l.id !== id) }));
  const updateLine = (id: string, patch: Partial<Line>) =>
    setQuote((q) => ({ ...q, lines: q.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));

  const totals = useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    for (const l of quote.lines) {
      const qty = parseFloat(l.qty) || 0;
      const lp = parseFloat(l.listPrice) || 0;
      const disc = (parseFloat(l.discount) || 0) / 100;
      const gross = qty * lp;
      const d = gross * disc;
      subtotal += gross;
      discountTotal += d;
    }
    const net = subtotal - discountTotal;
    return { subtotal, discountTotal, net };
  }, [quote.lines]);

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: quote.currency, maximumFractionDigits: 2 });

  const saveQuote = () => {
    const name = quote.name.trim() || "Untitled quote";
    setSaved((p) => ({ ...p, [name]: { ...quote, name } }));
  };
  const loadQuote = (name: string) => {
    const q = saved[name];
    if (q) {
      setQuote(q);
      setLoadPick("");
    }
  };
  const deleteQuote = (name: string) => {
    setSaved((p) => {
      const copy = { ...p };
      delete copy[name];
      return copy;
    });
  };
  const newQuote = () => setQuote(defaultQuote());

  // Pull primary masthead lines from "from" field
  const fromLines = quote.from.split(/\r?\n/).filter(Boolean);
  const fromCompany = fromLines[0] || "Your Company";
  const fromAddress = fromLines.slice(1);
  const toLines = quote.to.split(/\r?\n/).filter(Boolean);
  const toCompany = toLines[0] || "Customer";
  const toAddress = toLines.slice(1);
  const initials =
    (fromCompany.match(/[A-Za-z0-9]+/g) || [])
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("") || "QO";

  const savingsPct = totals.subtotal > 0 ? (totals.discountTotal / totals.subtotal) * 100 : 0;

  return (
    <ToolShell
      category="Sales"
      title="Quote Builder"
      description="Build a line-item quote with per-line discounts, expiration, and terms. Save named quotes in your browser; print or save as PDF."
    >
      <div data-tool-theme="finance" data-tool="quote-builder">
        {/* Print-only styles — preserved so the printed PDF stays a clean paper layout */}
        <style jsx global>{`
          @media print {
            body * { visibility: hidden !important; }
            #quote-print-root, #quote-print-root * { visibility: visible !important; }
            #quote-print-root {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              padding: 32px !important;
              background: white !important;
              color: black !important;
            }
            #quote-print-root * {
              color: black !important;
              background: white !important;
              border-color: #ccc !important;
              box-shadow: none !important;
            }
            #quote-print-root .qb-ledger {
              font-family: ui-monospace, SFMono-Regular, monospace;
              font-variant-numeric: tabular-nums;
            }
          }
          /* Tabular ledger numerics — used in screen + print */
          [data-tool="quote-builder"] .qb-ledger {
            font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
            font-variant-numeric: tabular-nums;
          }
        `}</style>

        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* Status strip */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              {quote.currency}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {quote.lines.length} line{quote.lines.length === 1 ? "" : "s"}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              quote
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {(quote.number || "draft").toLowerCase()}
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              {loaded ? "◉ autosaved" : ""}
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Quote · {quote.number}
                </div>

                <div className="mt-3">
                  <input
                    value={quote.name}
                    onChange={(e) => setField("name", e.target.value)}
                    placeholder="Untitled quote"
                    className="w-full bg-transparent text-2xl font-semibold tracking-tight text-app placeholder:text-faint outline-none md:text-3xl"
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    Issued {quote.issueDate}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    Valid through {quote.expirationDate || "—"}
                  </span>
                </div>
              </div>

              {/* Total hero — large mono $ + savings chip */}
              <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-4 py-3">
                <div className="text-right">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Total due
                  </div>
                  <div className="qb-ledger mt-0.5 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                    {fmt(totals.net)}
                  </div>
                  {totals.discountTotal > 0 && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
                      Save {fmt(totals.discountTotal)} · {savingsPct.toFixed(0)}%
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sub-tab strip — Edit / Preview / Send segmented pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "edit", label: "Edit" },
                  { k: "preview", label: "Preview" },
                  { k: "send", label: "Send" },
                ] as { k: TabKey; label: string }[]
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
              value={loadPick}
              onChange={(e) => {
                setLoadPick(e.target.value);
                if (e.target.value) loadQuote(e.target.value);
              }}
              className="rounded-lg border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary outline-none transition-colors hover:border-tool-accent"
            >
              <option value="">Load saved…</option>
              {Object.keys(saved).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={newQuote}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                New
              </button>
              <button
                onClick={saveQuote}
                className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent"
                style={{}}
              >
                Save
              </button>
              {Object.keys(saved).length > 0 && quote.name && saved[quote.name] && (
                <button
                  onClick={() => deleteQuote(quote.name)}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-rose-500 transition-colors hover:bg-rose-500/20"
                >
                  Delete
                </button>
              )}
              <button
                onClick={() => window.print()}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Print / PDF
              </button>
            </div>
          </div>
        </section>

        {/* ============================== EDIT ============================== */}
        {mode === "edit" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.1fr]">
            <ToolCard title="Quote details" subtitle="Edit">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quote name">
                  <input value={quote.name} onChange={(e) => setField("name", e.target.value)} className={inputCls()} />
                </Field>
                <Field label="Quote #">
                  <input value={quote.number} onChange={(e) => setField("number", e.target.value)} className={inputCls()} />
                </Field>
                <Field label="Issue date">
                  <input
                    type="date"
                    value={quote.issueDate}
                    onChange={(e) => setField("issueDate", e.target.value)}
                    className={inputCls()}
                  />
                </Field>
                <Field label="Valid through">
                  <input
                    type="date"
                    value={quote.expirationDate}
                    onChange={(e) => setField("expirationDate", e.target.value)}
                    className={inputCls()}
                  />
                </Field>
                <Field label="Currency">
                  <select
                    value={quote.currency}
                    onChange={(e) => setField("currency", e.target.value)}
                    className={inputCls()}
                  >
                    <option>USD</option>
                    <option>EUR</option>
                    <option>GBP</option>
                    <option>AED</option>
                    <option>SAR</option>
                    <option>TRY</option>
                    <option>JPY</option>
                    <option>SGD</option>
                  </select>
                </Field>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="From (company info)">
                  <textarea
                    value={quote.from}
                    onChange={(e) => setField("from", e.target.value)}
                    className={inputCls("min-h-[88px]")}
                  />
                </Field>
                <Field label="Quote to (customer)">
                  <textarea
                    value={quote.to}
                    onChange={(e) => setField("to", e.target.value)}
                    className={inputCls("min-h-[88px]")}
                  />
                </Field>
              </div>

              {/* Catalog */}
              <div className="mt-5 rounded-xl border border-app bg-app p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                    Product catalog
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        const csv = ["sku,description,unit,listPrice", ...catalog.map((c) => `${c.sku},${c.description},${c.unit},${c.listPrice}`)].join("\n");
                        navigator.clipboard.writeText(csv);
                      }}
                      className="rounded-lg border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                    >
                      Export CSV
                    </button>
                    <button
                      onClick={() => {
                        const input = prompt("Paste catalog CSV (sku,description,unit,listPrice):");
                        if (!input) return;
                        const lines = input.trim().split(/\r?\n/);
                        const startIdx = /sku|description/i.test(lines[0]) ? 1 : 0;
                        const parsed: CatalogItem[] = [];
                        for (let i = startIdx; i < lines.length; i++) {
                          const p = lines[i].split(",").map((x) => x.trim());
                          if (p.length >= 4) parsed.push({ sku: p[0], description: p[1], unit: p[2], listPrice: p[3] });
                        }
                        if (parsed.length) setCatalog(parsed);
                      }}
                      className="rounded-lg border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                    >
                      Import
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {catalog.map((c) => (
                    <button
                      key={c.sku}
                      onClick={() =>
                        setQuote((q) => ({
                          ...q,
                          lines: [
                            ...q.lines,
                            { id: newId(), description: c.description, unit: c.unit, qty: "1", listPrice: c.listPrice, discount: "0" },
                          ],
                        }))
                      }
                      className="rounded-lg border border-app bg-app-elevated px-2 py-0.5 text-[0.65rem] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                      title={`${c.sku} · ${c.listPrice} / ${c.unit}`}
                    >
                      + {c.description}
                    </button>
                  ))}
                </div>
              </div>

              {/* Discount matrix — segmented pills tier picker */}
              <div className="mt-3 rounded-xl border border-app bg-app p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                    Discount matrix
                  </span>
                </div>
                <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-app bg-app-elevated">
                  {(Object.keys(DISCOUNT_MATRIX) as DiscountMatrix[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setMatrix(k)}
                      className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                        matrix === k
                          ? "bg-tool-accent text-app-elevated"
                          : "text-secondary hover:text-app"
                      }`}
                      style={matrix === k ? { color: "var(--bg)" } : undefined}
                    >
                      {DISCOUNT_MATRIX[k].label}
                    </button>
                  ))}
                </div>
                {matrix !== "none" && (
                  <div className="mt-3 grid grid-cols-2 gap-1 text-xs">
                    {DISCOUNT_MATRIX[matrix].rows.map((r) => (
                      <button
                        key={r.condition}
                        onClick={() => {
                          setQuote((q) => ({
                            ...q,
                            lines: q.lines.map((l) => ({ ...l, discount: String(r.discount) })),
                          }));
                        }}
                        className="flex items-center justify-between rounded-lg border border-app bg-app-elevated px-2.5 py-1.5 text-left text-secondary transition-colors hover:border-tool-accent hover:text-app"
                      >
                        <span>{r.condition}</span>
                        <span className="qb-ledger font-semibold text-tool-accent">{r.discount}%</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Line items */}
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                    Line items
                  </span>
                  <button
                    onClick={addLine}
                    className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                  >
                    + add line
                  </button>
                </div>
                <div className="grid grid-cols-[1.6fr_0.7fr_0.6fr_0.9fr_0.7fr_auto] gap-1.5 text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                  <span>Description</span>
                  <span>Unit</span>
                  <span>Qty</span>
                  <span>Rate</span>
                  <span>Disc %</span>
                  <span />
                </div>
                <div className="mt-1 space-y-2">
                  {quote.lines.map((l) => (
                    <div
                      key={l.id}
                      className="grid grid-cols-[1.6fr_0.7fr_0.6fr_0.9fr_0.7fr_auto] items-center gap-1.5"
                    >
                      <input
                        value={l.description}
                        onChange={(e) => updateLine(l.id, { description: e.target.value })}
                        className="rounded-lg border border-app bg-app px-2 py-1.5 text-xs text-app placeholder:text-faint outline-none focus:border-tool-accent"
                      />
                      <input
                        value={l.unit}
                        onChange={(e) => updateLine(l.id, { unit: e.target.value })}
                        className="rounded-lg border border-app bg-app px-2 py-1.5 text-xs text-app placeholder:text-faint outline-none focus:border-tool-accent"
                      />
                      <input
                        type="number"
                        value={l.qty}
                        onChange={(e) => updateLine(l.id, { qty: e.target.value })}
                        className="qb-ledger rounded-lg border border-app bg-app px-2 py-1.5 text-right text-xs text-app outline-none focus:border-tool-accent"
                        min="0"
                      />
                      <input
                        type="number"
                        value={l.listPrice}
                        onChange={(e) => updateLine(l.id, { listPrice: e.target.value })}
                        className="qb-ledger rounded-lg border border-app bg-app px-2 py-1.5 text-right text-xs text-app outline-none focus:border-tool-accent"
                        min="0"
                      />
                      <input
                        type="number"
                        value={l.discount}
                        onChange={(e) => updateLine(l.id, { discount: e.target.value })}
                        className="qb-ledger rounded-lg border border-app bg-app px-2 py-1.5 text-right text-xs text-app outline-none focus:border-tool-accent"
                        min="0"
                        max="100"
                      />
                      <button
                        onClick={() => removeLine(l.id)}
                        className="rounded-md border border-app px-2 text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                        aria-label="Remove line"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <Field label="Terms">
                  <textarea
                    value={quote.terms}
                    onChange={(e) => setField("terms", e.target.value)}
                    className={inputCls("min-h-[60px]")}
                  />
                </Field>
                <Field label="Notes">
                  <input value={quote.notes} onChange={(e) => setField("notes", e.target.value)} className={inputCls()} />
                </Field>
              </div>

              <div className="mt-5 rounded-xl border border-app bg-app p-3">
                <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                  Terms library
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(TERMS_LIBRARY).map((k) => (
                    <button
                      key={k}
                      onClick={() => setField("terms", TERMS_LIBRARY[k])}
                      className="rounded-lg border border-app bg-app-elevated px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>

              <label className="mt-4 flex items-center gap-2 text-xs text-secondary">
                <input
                  type="checkbox"
                  checked={includeDocusignPlaceholders}
                  onChange={(e) => setIncludeDocusignPlaceholders(e.target.checked)}
                  className="h-4 w-4"
                  style={{ accentColor: "var(--tool-accent)" }}
                />
                Include DocuSign signature placeholders in preview
              </label>
            </ToolCard>

            {/* Live preview pane (compact print-doc) */}
            <div>
              <QuotePrintDoc
                quote={quote}
                totals={totals}
                fmt={fmt}
                fromCompany={fromCompany}
                fromAddress={fromAddress}
                toCompany={toCompany}
                toAddress={toAddress}
                initials={initials}
                includeDocusignPlaceholders={includeDocusignPlaceholders}
              />
            </div>
          </div>
        )}

        {/* ============================== PREVIEW ============================== */}
        {mode === "preview" && (
          <div>
            <QuotePrintDoc
              quote={quote}
              totals={totals}
              fmt={fmt}
              fromCompany={fromCompany}
              fromAddress={fromAddress}
              toCompany={toCompany}
              toAddress={toAddress}
              initials={initials}
              includeDocusignPlaceholders={includeDocusignPlaceholders}
            />
          </div>
        )}

        {/* ============================== SEND ============================== */}
        {mode === "send" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <ToolCard title="Send quote" subtitle="Delivery">
              <p className="text-sm text-secondary">
                Generate a clean PDF and email it directly, or copy a shareable summary.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => window.print()}
                  className="rounded-lg bg-tool-accent px-4 py-2 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                  style={{ color: "var(--bg)" }}
                >
                  Print / Save as PDF
                </button>
                <button
                  onClick={() => {
                    const subject = encodeURIComponent(`Quote ${quote.number} — ${quote.name}`);
                    const body = encodeURIComponent(
                      `Hi ${toCompany},\n\nPlease find quote ${quote.number} attached.\n\nTotal: ${fmt(totals.net)}\nValid through: ${quote.expirationDate || "—"}\n\nBest,\n${fromCompany}`
                    );
                    window.location.href = `mailto:?subject=${subject}&body=${body}`;
                  }}
                  className="rounded-lg border border-tool-accent bg-tool-accent-soft px-4 py-2 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                >
                  Compose email
                </button>
                <button
                  onClick={() => {
                    const summary = `Quote ${quote.number} — ${quote.name}\nTotal: ${fmt(totals.net)} (${quote.currency})\nValid through: ${quote.expirationDate || "—"}\nLine items: ${quote.lines.length}`;
                    navigator.clipboard.writeText(summary);
                  }}
                  className="rounded-lg border border-app bg-app-elevated px-4 py-2 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                >
                  Copy summary
                </button>
              </div>
              <div className="mt-5 rounded-xl border border-app bg-app p-4">
                <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                  Share as public link
                </div>
                <p className="mb-3 text-xs text-secondary">
                  Publish this quote at share.example.com/q/… — recipient sees a clean itemized quote with totals, validity, and terms.
                </p>
                <MintShareButton
                  type="quote"
                  sourceTool="quote-builder"
                  label="Share as link"
                  disabled={quote.lines.length === 0 || !quote.name.trim()}
                  payload={() => ({
                    title: quote.name || "Quote",
                    recipientName: toCompany || undefined,
                    recipientCompany: toCompany || undefined,
                    issuedDate:
                      quote.issueDate || new Date().toISOString().split("T")[0],
                    validUntil: quote.expirationDate || undefined,
                    lineItems: quote.lines.map((l) => {
                      const qty = parseFloat(l.qty) || 0;
                      const lp = parseFloat(l.listPrice) || 0;
                      const disc = (parseFloat(l.discount) || 0) / 100;
                      const netUnit = lp * (1 - disc);
                      const discLabel =
                        disc > 0 ? ` (−${(disc * 100).toFixed(0)}%)` : "";
                      return {
                        description: `${l.description || "—"}${l.unit ? ` / ${l.unit}` : ""}${discLabel}`,
                        quantity: qty,
                        unitPrice: netUnit,
                      };
                    }),
                    currency: quote.currency || "USD",
                    notes: quote.notes || undefined,
                    termsHtml: quote.terms
                      ? `<p>${quote.terms.replace(/\n/g, "</p><p>")}</p>`
                      : undefined,
                  })}
                />
              </div>
              <div className="mt-5 rounded-xl border border-app bg-app p-4">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
                  Send checklist
                </div>
                <ul className="mt-2 space-y-1 text-sm text-secondary">
                  <li>· Confirm Quote # and currency</li>
                  <li>· Verify expiration date matches your sales motion</li>
                  <li>· Check discounts against approval matrix</li>
                  <li>· Attach MSA / order form references in Terms</li>
                  <li>· If using DocuSign, toggle the signature placeholders</li>
                </ul>
              </div>
            </ToolCard>

            <ToolCard title="Quote summary" subtitle="At a glance">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted">Reference</dt>
                <dd className="qb-ledger text-right text-app">{quote.number}</dd>
                <dt className="text-muted">Customer</dt>
                <dd className="text-right text-app">{toCompany}</dd>
                <dt className="text-muted">Currency</dt>
                <dd className="qb-ledger text-right text-app">{quote.currency}</dd>
                <dt className="text-muted">Line items</dt>
                <dd className="qb-ledger text-right text-app">{quote.lines.length}</dd>
                <dt className="text-muted">Subtotal</dt>
                <dd className="qb-ledger text-right text-app">{fmt(totals.subtotal)}</dd>
                <dt className="text-muted">Discount</dt>
                <dd className="qb-ledger text-right text-tool-accent">−{fmt(totals.discountTotal)}</dd>
                <dt className="text-app">Total</dt>
                <dd className="qb-ledger text-right text-lg font-semibold text-app">{fmt(totals.net)}</dd>
              </dl>
            </ToolCard>
          </div>
        )}

        {/* Off-screen print root — only present once and used by window.print() in any mode */}
        {mode !== "preview" && mode !== "edit" && (
          <div className="sr-only" aria-hidden>
            <div id="quote-print-root">
              <QuotePrintDoc
                quote={quote}
                totals={totals}
                fmt={fmt}
                fromCompany={fromCompany}
                fromAddress={fromAddress}
                toCompany={toCompany}
                toAddress={toAddress}
                initials={initials}
                includeDocusignPlaceholders={includeDocusignPlaceholders}
              />
            </div>
          </div>
        )}
      </div>
    </ToolShell>
  );
}

/**
 * Print-ready quote document.
 *
 * The container has id="quote-print-root" — when window.print() fires,
 * the @media print rules above hide everything else and reveal this block
 * as a clean black-on-white page. On screen it lives inside the app chrome
 * and uses neutral theme tokens.
 */
function QuotePrintDoc({
  quote,
  totals,
  fmt,
  fromCompany,
  fromAddress,
  toCompany,
  toAddress,
  initials,
  includeDocusignPlaceholders,
}: {
  quote: Quote;
  totals: { subtotal: number; discountTotal: number; net: number };
  fmt: (n: number) => string;
  fromCompany: string;
  fromAddress: string[];
  toCompany: string;
  toAddress: string[];
  initials: string;
  includeDocusignPlaceholders: boolean;
}) {
  return (
    <div id="quote-print-root">
      <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
        {/* Masthead */}
        <div className="border-b border-app bg-app px-7 py-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-start gap-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-xl border border-tool-accent bg-tool-accent-soft font-mono text-base font-semibold text-tool-accent"
              >
                {initials}
              </div>
              <div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">From</div>
                <div className="mt-1 text-lg font-semibold tracking-tight text-app">{fromCompany}</div>
                {fromAddress.length > 0 && (
                  <div className="mt-0.5 text-xs leading-relaxed text-secondary">
                    {fromAddress.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">Quote</div>
              <div className="qb-ledger mt-1 text-2xl font-semibold tracking-tight text-app">
                {quote.number}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1 text-right">
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">Issued</div>
                  <div className="qb-ledger text-xs text-app">{quote.issueDate}</div>
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">Valid through</div>
                  <div className="qb-ledger text-xs text-app">{quote.expirationDate || "—"}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-7">
          {/* Customer block */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-app bg-app p-4">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">Prepared for</div>
              <div className="mt-2 text-sm font-semibold text-app">{toCompany}</div>
              {toAddress.length > 0 && (
                <div className="mt-1 text-xs leading-relaxed text-secondary">
                  {toAddress.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-app bg-app p-4">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">Quote summary</div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-secondary">
                <dt className="text-muted">Reference</dt>
                <dd className="qb-ledger text-right text-app">{quote.number}</dd>
                <dt className="text-muted">Currency</dt>
                <dd className="qb-ledger text-right text-app">{quote.currency}</dd>
                <dt className="text-muted">Line items</dt>
                <dd className="qb-ledger text-right text-app">{quote.lines.length}</dd>
                <dt className="text-muted">Status</dt>
                <dd className="text-right">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    Pending acceptance
                  </span>
                </dd>
              </dl>
            </div>
          </div>

          {/* Line items */}
          <div className="mb-2 flex items-center justify-between">
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">Line items</div>
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
              {quote.lines.length} {quote.lines.length === 1 ? "row" : "rows"}
            </div>
          </div>
          <table className="qb-ledger w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-app text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                <th className="px-2 py-2.5 text-left">Description</th>
                <th className="w-16 px-2 py-2.5 text-right">Qty</th>
                <th className="w-16 px-2 py-2.5 text-right">Unit</th>
                <th className="w-24 px-2 py-2.5 text-right">Rate</th>
                <th className="w-16 px-2 py-2.5 text-right">Disc</th>
                <th className="w-28 px-2 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((l) => {
                const qty = parseFloat(l.qty) || 0;
                const lp = parseFloat(l.listPrice) || 0;
                const disc = (parseFloat(l.discount) || 0) / 100;
                const gross = qty * lp;
                const amt = gross * (1 - disc);
                return (
                  <tr key={l.id} className="border-b border-app">
                    <td className="px-2 py-2.5 text-app">{l.description || "—"}</td>
                    <td className="px-2 py-2.5 text-right text-app">{l.qty}</td>
                    <td className="px-2 py-2.5 text-right text-secondary">{l.unit}</td>
                    <td className="px-2 py-2.5 text-right text-app">{fmt(lp)}</td>
                    <td className="px-2 py-2.5 text-right text-secondary">{l.discount}%</td>
                    <td className="px-2 py-2.5 text-right font-semibold text-app">{fmt(amt)}</td>
                  </tr>
                );
              })}
              {quote.lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-xs text-muted">
                    No line items yet — add one from the catalog or use + add line.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Subtotal / discount / tax / total ledger */}
          <div className="mt-4 flex justify-end">
            <div className="qb-ledger w-72 text-xs">
              <div className="flex justify-between py-1.5 text-secondary">
                <span>Subtotal (list)</span>
                <span>{fmt(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between py-1.5 text-secondary">
                <span>Discount</span>
                <span className="text-tool-accent">−{fmt(totals.discountTotal)}</span>
              </div>
              <div className="flex justify-between border-t border-app py-1.5 text-secondary">
                <span>Tax</span>
                <span className="text-muted">—</span>
              </div>
              <div className="mt-1 flex justify-between rounded-lg border border-tool-accent bg-tool-accent-soft px-2 py-2.5 text-base font-semibold text-app">
                <span>Total due</span>
                <span className="text-tool-accent">{fmt(totals.net)}</span>
              </div>
            </div>
          </div>

          {/* Terms */}
          {quote.terms && (
            <div className="mt-7">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                Terms &amp; conditions
              </div>
              <p className="mt-2 text-xs leading-relaxed text-secondary">{quote.terms}</p>
            </div>
          )}
          {quote.notes && (
            <div className="mt-4">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">Notes</div>
              <p className="mt-2 text-xs italic text-muted">{quote.notes}</p>
            </div>
          )}

          {/* Signature row */}
          <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
            <div>
              {includeDocusignPlaceholders ? (
                <div className="border-t border-app pt-3">
                  <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    Authorized — Seller
                  </div>
                  <div className="border-b border-dashed border-app pb-8 font-mono text-[0.7rem] text-tool-accent">
                    {"{{sig_seller}}"}
                  </div>
                  <div className="mt-2 text-xs text-secondary">Name: {"{{name_seller}}"}</div>
                  <div className="text-xs text-secondary">Date: {"{{date_seller}}"}</div>
                </div>
              ) : (
                <div className="border-t border-app pt-3">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    Authorized — Seller
                  </div>
                  <div className="mt-1 text-xs text-secondary">{fromCompany}</div>
                  <div className="mt-0.5 text-[0.6rem] text-faint">Signature · Name · Date</div>
                </div>
              )}
            </div>
            <div>
              {includeDocusignPlaceholders ? (
                <div className="border-t border-app pt-3">
                  <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    Accepted — Buyer
                  </div>
                  <div className="border-b border-dashed border-app pb-8 font-mono text-[0.7rem] text-tool-accent">
                    {"{{sig_buyer}}"}
                  </div>
                  <div className="mt-2 text-xs text-secondary">Name: {"{{name_buyer}}"}</div>
                  <div className="text-xs text-secondary">Date: {"{{date_buyer}}"}</div>
                </div>
              ) : (
                <div className="border-t border-app pt-3">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    Accepted — Buyer
                  </div>
                  <div className="mt-1 text-xs text-secondary">{toCompany}</div>
                  <div className="mt-0.5 text-[0.6rem] text-faint">Signature · Name · Date</div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 flex items-center justify-between border-t border-app pt-4 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <span>Quote · {quote.number}</span>
            <span>{fromCompany}</span>
            <span>Valid {quote.expirationDate || "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
