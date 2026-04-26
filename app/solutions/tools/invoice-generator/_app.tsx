"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Invoice Generator — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Receives NativeAppProps from the workspace Window. No iframe, no
   ToolShell, no AuthGate, no PageHeader, no back-links, no
   ToolRecommendations, no bespoke macOS chrome. Width-driven layout —
   below 900px the editor stacks; above, edit/preview live side by side.
   All invoice math, hooks, and print logic preserved verbatim from
   page.tsx.
═══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import type { NativeAppProps } from "../../../tools/_data/tools-list";

type Line = { description: string; qty: string; rate: string };

type TabKey = "edit" | "preview" | "export";

function inputCls(extra = "") {
  return `w-full rounded-md border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-faint transition-colors focus:border-tool-accent focus:outline-none ${extra}`;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[0.62rem] uppercase tracking-[0.18em] text-secondary">
          {label}
        </span>
        {hint && <span className="text-[0.6rem] text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export default function InvoiceGeneratorApp(props: NativeAppProps) {
  const { width } = props;

  // Below 900px → stack tabs vertically (single column). Above → keep tabs but
  // give the preview some breathing room.
  const isWide = width >= 900;

  const [from, setFrom] = useState("Your Company\n123 Main St\nCity, State");
  const [to, setTo] = useState("Client Name\n456 Client Ave\nCity, State");
  const [number, setNumber] = useState("INV-0001");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [taxRate, setTaxRate] = useState("0");
  const [notes, setNotes] = useState("Thanks for your business.");
  const [lines, setLines] = useState<Line[]>([
    { description: "Consulting services", qty: "10", rate: "150" },
  ]);
  const [tab, setTab] = useState<TabKey>("edit");

  const { subtotal, tax, total } = useMemo(() => {
    const sub = lines.reduce(
      (s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0),
      0
    );
    const t = sub * ((parseFloat(taxRate) || 0) / 100);
    return { subtotal: sub, tax: t, total: sub + t };
  }, [lines, taxRate]);

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: 2 });

  const updateLine = (i: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, { description: "", qty: "1", rate: "0" }]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  // Derive a short company name from the "from" block for the masthead monogram.
  const companyName = from.split("\n")[0] || "Your Company";
  const monogram = companyName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const tabs: { k: TabKey; label: string }[] = [
    { k: "edit", label: "Edit" },
    { k: "preview", label: "Preview" },
    { k: "export", label: "Export" },
  ];

  // The printed invoice (paper) — paper-white user data, kept stable across themes.
  const PrintableInvoice = (
    <div id="invoice-print-root" className="invoice-paper">
      <div className="paper p-8 sm:p-10">
        {/* Masthead */}
        <div className="masthead -mx-8 sm:-mx-10 -mt-8 sm:-mt-10 mb-7 px-8 sm:px-10 pt-6 pb-5 rounded-t-[14px]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="logo-mark" aria-hidden="true">{monogram || "Co"}</div>
              <div>
                <div className="doc-tag">Issued by</div>
                <div className="mt-1 text-lg font-semibold paper-ink">
                  {companyName}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="doc-tag">Document</div>
              <div className="mt-1 text-3xl font-semibold paper-ink">
                INVOICE
              </div>
              <div className="ledger mt-1 text-sm paper-accent">#{number}</div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
            <div>
              <div className="doc-tag">Issue date</div>
              <div className="ledger mt-1 paper-ink-soft">{issueDate || "—"}</div>
            </div>
            <div>
              <div className="doc-tag">Due date</div>
              <div className="ledger mt-1 paper-ink-soft">{dueDate || "—"}</div>
            </div>
            <div>
              <div className="doc-tag">Currency</div>
              <div className="ledger mt-1 paper-ink-soft">{currency}</div>
            </div>
          </div>
        </div>

        {/* From / Bill to */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="party-block">
            <div className="doc-tag">From</div>
            <pre className="mt-1.5 whitespace-pre-wrap font-sans text-sm paper-ink-soft">{from}</pre>
          </div>
          <div className="party-block">
            <div className="doc-tag">Bill to</div>
            <pre className="mt-1.5 whitespace-pre-wrap font-sans text-sm paper-ink-soft">{to}</pre>
          </div>
        </div>

        <div className="perforation my-7" />

        {/* Itemised table */}
        <div className="mb-2 doc-tag">Items</div>
        <table className="ledger w-full text-sm">
          <thead>
            <tr className="text-[0.55rem] uppercase tracking-[0.15em] paper-ink-faint">
              <th className="p-2 text-left">Description</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Rate</th>
              <th className="p-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const amt = (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0);
              return (
                <tr key={i}>
                  <td className="p-2 paper-ink">{l.description || "—"}</td>
                  <td className="p-2 text-right paper-ink-soft">{l.qty || "0"}</td>
                  <td className="p-2 text-right paper-ink-soft">{fmt(parseFloat(l.rate) || 0)}</td>
                  <td className="p-2 text-right font-medium paper-ink">{fmt(amt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Ledger totals */}
        <div className="mt-5 flex justify-end">
          <div className="ledger w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between paper-ink-soft">
              <span className="doc-tag">Subtotal</span>
              <span>{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between paper-ink-soft">
              <span className="doc-tag">Tax ({taxRate || 0}%)</span>
              <span>{fmt(tax)}</span>
            </div>
            <div className="perforation" />
            <div className="flex items-baseline justify-between rounded-md paper-total px-3 py-2">
              <span className="doc-tag">Total due</span>
              <span className="text-2xl font-semibold paper-accent">{fmt(total)}</span>
            </div>
          </div>
        </div>

        <div className="perforation my-7" />

        {/* Payment terms / footer */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <div className="doc-tag">Payment terms</div>
            <p className="mt-1.5 text-sm paper-ink-soft">
              {notes || "Payment due upon receipt."}
            </p>
          </div>
          <div className="text-right">
            <div className="doc-tag">Reference</div>
            <div className="ledger mt-1 text-sm paper-ink-soft">{number}</div>
            <div className="mt-3 doc-tag">Thank you</div>
            <div className="text-xs paper-ink-faint">for your business</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      data-tool-theme="finance"
      data-tool="invoice-generator"
      className="h-full w-full overflow-auto bg-app text-app"
    >
      {/* Print + paper-only styling. The paper-* classes pin invoice ink to neutral
          slate so the printed PDF / paper looks identical regardless of app theme. */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          #invoice-print-root, #invoice-print-root * { visibility: visible !important; }
          #invoice-print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 32px !important;
            background: white !important;
            color: black !important;
          }
          #invoice-print-root * { color: black !important; background: white !important; border-color: #ccc !important; box-shadow: none !important; }
        }

        /* ===== Paper (printed invoice) ===== */
        [data-tool="invoice-generator"] .paper {
          position: relative;
          background: #ffffff;
          color: #0f172a;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          box-shadow:
            0 1px 0 rgba(255, 255, 255, 0.8) inset,
            0 30px 60px -30px rgba(15, 23, 42, 0.18);
        }
        [data-tool="invoice-generator"] .paper-ink { color: #0f172a; }
        [data-tool="invoice-generator"] .paper-ink-soft { color: rgba(15, 23, 42, 0.78); }
        [data-tool="invoice-generator"] .paper-ink-faint { color: rgba(15, 23, 42, 0.5); }
        [data-tool="invoice-generator"] .paper-accent { color: var(--tool-accent); }

        [data-tool="invoice-generator"] .masthead {
          background: linear-gradient(
            135deg,
            color-mix(in srgb, var(--tool-accent) 10%, white) 0%,
            #ffffff 100%
          );
          border-bottom: 1px dashed color-mix(in srgb, var(--tool-accent) 28%, #d4d4d8);
        }
        [data-tool="invoice-generator"] .logo-mark {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 56px;
          border-radius: 12px;
          background: color-mix(in srgb, var(--tool-accent) 12%, white);
          border: 1px solid color-mix(in srgb, var(--tool-accent) 35%, #e5e7eb);
          color: var(--tool-accent);
          font-weight: 600;
          font-size: 1.25rem;
          letter-spacing: 0.04em;
        }
        [data-tool="invoice-generator"] .ledger {
          font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
          font-variant-numeric: tabular-nums;
        }
        [data-tool="invoice-generator"] .ledger thead tr {
          background: color-mix(in srgb, var(--tool-accent) 6%, white);
        }
        [data-tool="invoice-generator"] .ledger tbody tr:nth-child(odd) {
          background: rgba(15, 23, 42, 0.018);
        }
        [data-tool="invoice-generator"] .ledger tbody tr {
          border-bottom: 1px dashed color-mix(in srgb, var(--tool-accent) 16%, #e5e7eb);
        }
        [data-tool="invoice-generator"] .doc-tag {
          font-family: inherit;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          font-size: 0.55rem;
          color: color-mix(in srgb, var(--tool-accent) 70%, #475569);
        }
        [data-tool="invoice-generator"] .perforation {
          height: 1px;
          background-image: linear-gradient(
            to right,
            color-mix(in srgb, var(--tool-accent) 30%, #cbd5e1) 0,
            color-mix(in srgb, var(--tool-accent) 30%, #cbd5e1) 6px,
            transparent 6px,
            transparent 12px
          );
          background-size: 12px 1px;
          background-repeat: repeat-x;
        }
        [data-tool="invoice-generator"] .party-block {
          border-left: 2px solid color-mix(in srgb, var(--tool-accent) 35%, #cbd5e1);
          padding-left: 0.85rem;
        }
        [data-tool="invoice-generator"] .paper-total {
          border: 1px solid color-mix(in srgb, var(--tool-accent) 40%, #e5e7eb);
          background: color-mix(in srgb, var(--tool-accent) 10%, white);
        }
      `}</style>

      <div className={isWide ? "px-6 pb-8 pt-5" : "px-4 pb-8 pt-5"}>
        {/* ============================== HEADER / TABS ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          <div className="relative p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-tool-accent" />
                  Invoice · Billing document
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    #{number || "—"}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {currency}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {lines.length} item{lines.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                  {fmt(total)} <span className="text-base font-normal text-muted">total due</span>
                </div>
              </div>
            </div>
          </div>

          {/* Segmented tab strip */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {tabs.map((t) => (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    tab === t.k
                      ? "bg-tool-accent text-app-elevated"
                      : "text-secondary hover:text-app"
                  }`}
                  style={tab === t.k ? { color: "var(--bg)" } : undefined}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
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

        {tab === "edit" && (
          <div className="rounded-xl border border-app bg-app-elevated p-5 no-print">
            <div className="mb-5">
              <div className="text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                Edit
              </div>
              <h2 className="mt-2 text-lg font-semibold tracking-tight text-app">
                Invoice details
              </h2>
            </div>
            <div className={isWide ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3 sm:grid-cols-2"}>
              <Field label="Invoice #"><input value={number} onChange={(e) => setNumber(e.target.value)} className={inputCls()} /></Field>
              <Field label="Currency">
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls()}>
                  <option>USD</option><option>EUR</option><option>GBP</option><option>AED</option><option>SAR</option><option>TRY</option><option>JPY</option><option>SGD</option>
                </select>
              </Field>
              <Field label="Issue date"><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputCls()} /></Field>
              <Field label="Due date"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls()} /></Field>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="From"><textarea value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls("min-h-[88px]")} /></Field>
              <Field label="Bill to"><textarea value={to} onChange={(e) => setTo(e.target.value)} className={inputCls("min-h-[88px]")} /></Field>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                  Line items
                </span>
                <button
                  onClick={addLine}
                  className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                >
                  + Add
                </button>
              </div>
              <div className="space-y-2">
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_70px_90px_auto] gap-2">
                    <input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} placeholder="Description" className={inputCls("text-xs")} />
                    <input type="number" value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} placeholder="Qty" className={inputCls("text-xs")} />
                    <input type="number" value={l.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} placeholder="Rate" className={inputCls("text-xs")} />
                    <button
                      onClick={() => removeLine(i)}
                      className="rounded-md border border-app px-2 text-[0.7rem] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                      aria-label="Remove line"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Tax rate (%)"><input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className={inputCls()} min="0" step="0.1" /></Field>
              <Field label="Notes / payment terms"><input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls()} /></Field>
            </div>

            {/* Totals strip in app chrome */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-app bg-app p-3">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">Subtotal</div>
                <div className="mt-1 text-sm font-semibold text-app">{fmt(subtotal)}</div>
              </div>
              <div className="rounded-lg border border-app bg-app p-3">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">Tax</div>
                <div className="mt-1 text-sm font-semibold text-app">{fmt(tax)}</div>
              </div>
              <div className="rounded-lg border border-tool-accent bg-tool-accent-soft p-3">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">Total</div>
                <div className="mt-1 text-sm font-semibold text-tool-accent">{fmt(total)}</div>
              </div>
            </div>
          </div>
        )}

        {tab === "preview" && (
          <div className="rounded-xl border border-app bg-app-elevated p-5 sm:p-8">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                Paper preview
              </span>
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                A4 · ready to print
              </span>
            </div>
            {PrintableInvoice}
          </div>
        )}

        {tab === "export" && (
          <div className="rounded-xl border border-app bg-app-elevated p-5">
            <div className="mb-5">
              <div className="text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                Print / save
              </div>
              <h2 className="mt-2 text-lg font-semibold tracking-tight text-app">
                Export
              </h2>
            </div>
            <p className="text-sm text-secondary">
              Use your browser&apos;s print dialog to save this invoice as a PDF, or
              send it directly to a printer. The page layout is tuned for A4.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => window.print()}
                className="rounded-lg bg-tool-accent px-4 py-2 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Print / Save as PDF
              </button>
              <button
                onClick={() => setTab("preview")}
                className="rounded-lg border border-app bg-app-elevated px-4 py-2 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Back to preview
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-app bg-app p-3">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">Number</div>
                <div className="mt-1 text-sm font-semibold text-app">{number || "—"}</div>
              </div>
              <div className="rounded-lg border border-app bg-app p-3">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">Issued</div>
                <div className="mt-1 text-sm font-semibold text-app">{issueDate || "—"}</div>
              </div>
              <div className="rounded-lg border border-app bg-app p-3">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">Due</div>
                <div className="mt-1 text-sm font-semibold text-app">{dueDate || "—"}</div>
              </div>
              <div className="rounded-lg border border-tool-accent bg-tool-accent-soft p-3">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">Total</div>
                <div className="mt-1 text-sm font-semibold text-tool-accent">{fmt(total)}</div>
              </div>
            </div>
          </div>
        )}

        {/* The print root must always exist in the DOM so window.print() works
            from any tab. Hidden off-screen when not on Preview/Export tabs. */}
        {tab === "edit" && (
          <div className="absolute -left-[10000px] top-0" aria-hidden="true">
            {PrintableInvoice}
          </div>
        )}
      </div>
    </div>
  );
}
