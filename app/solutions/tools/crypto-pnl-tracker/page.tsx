"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ScenarioBar from "../../_components/ScenarioBar";
import { readShareState, toCsv } from "../../_lib/scenarios";

interface Tx {
  id: string;
  date: string;
  symbol: string;
  side: "buy" | "sell";
  qty: string;
  price: string;
  fees: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

interface Lot {
  qty: number;
  costPerUnit: number; // includes allocated buy fees
  date: string;
}

interface SymbolResult {
  symbol: string;
  holdings: number;
  avgCost: number;
  totalBought: number;
  totalSold: number;
  realized: number;
  unrealized: number;
  marketValue: number;
  currentPrice: number;
}

function computePnL(
  txs: Tx[],
  prices: Record<string, number>
): { bySymbol: SymbolResult[]; totalRealized: number; totalUnrealized: number; err?: string } {
  const bySymbol = new Map<
    string,
    {
      lots: Lot[];
      realized: number;
      bought: number;
      sold: number;
    }
  >();

  // Sort by date ascending, stable.
  const sorted = [...txs].sort((a, b) => {
    if (a.date === b.date) return 0;
    return a.date < b.date ? -1 : 1;
  });

  let err: string | undefined;

  for (const tx of sorted) {
    const sym = tx.symbol.trim().toUpperCase();
    if (!sym) continue;
    const qty = parseFloat(tx.qty) || 0;
    const price = parseFloat(tx.price) || 0;
    const fees = parseFloat(tx.fees) || 0;
    if (qty <= 0) continue;

    if (!bySymbol.has(sym)) {
      bySymbol.set(sym, { lots: [], realized: 0, bought: 0, sold: 0 });
    }
    const s = bySymbol.get(sym)!;

    if (tx.side === "buy") {
      const totalCost = qty * price + fees;
      s.lots.push({ qty, costPerUnit: totalCost / qty, date: tx.date });
      s.bought += qty;
    } else {
      // FIFO sell: draw down oldest lots first.
      let remaining = qty;
      const proceeds = qty * price - fees;
      let costBasisUsed = 0;
      while (remaining > 0 && s.lots.length > 0) {
        const lot = s.lots[0];
        const take = Math.min(lot.qty, remaining);
        costBasisUsed += take * lot.costPerUnit;
        lot.qty -= take;
        remaining -= take;
        if (lot.qty <= 1e-12) s.lots.shift();
      }
      if (remaining > 0 && !err) {
        err = `Sell of ${qty} ${sym} on ${tx.date} exceeds holdings. Short selling not supported.`;
      }
      s.realized += proceeds - costBasisUsed;
      s.sold += qty - remaining;
    }
  }

  const results: SymbolResult[] = [];
  let totalRealized = 0;
  let totalUnrealized = 0;

  for (const [sym, s] of bySymbol) {
    const holdings = s.lots.reduce((a, l) => a + l.qty, 0);
    const totalCostRemaining = s.lots.reduce((a, l) => a + l.qty * l.costPerUnit, 0);
    const avgCost = holdings > 0 ? totalCostRemaining / holdings : 0;
    const price = prices[sym] ?? 0;
    const marketValue = holdings * price;
    const unrealized = marketValue - totalCostRemaining;
    totalRealized += s.realized;
    totalUnrealized += unrealized;
    results.push({
      symbol: sym,
      holdings,
      avgCost,
      totalBought: s.bought,
      totalSold: s.sold,
      realized: s.realized,
      unrealized,
      marketValue,
      currentPrice: price,
    });
  }

  results.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return { bySymbol: results, totalRealized, totalUnrealized, err };
}

interface Inputs {
  txs: Tx[];
  prices: Record<string, string>;
  taxYear: string;
}

const DEFAULT_TXS: Tx[] = [
  { id: "t1", date: "2024-01-15", symbol: "BTC", side: "buy", qty: "0.25", price: "43000", fees: "25" },
  { id: "t2", date: "2024-04-02", symbol: "BTC", side: "buy", qty: "0.15", price: "68000", fees: "30" },
  { id: "t3", date: "2024-11-10", symbol: "BTC", side: "sell", qty: "0.1", price: "88000", fees: "18" },
  { id: "t4", date: "2024-03-08", symbol: "ETH", side: "buy", qty: "4", price: "3400", fees: "15" },
];

const fieldInput =
  "w-full rounded-lg border border-app bg-app px-3 py-2 font-mono text-[0.85rem] tabular-nums text-app outline-none transition-colors placeholder:text-faint focus:border-tool-accent focus:ring-1 focus:ring-tool-accent";

const tickerColors = [
  "#14b8a6",
  "#6366f1",
  "#f59e0b",
  "#ec4899",
  "#22c55e",
  "#0ea5e9",
  "#a855f7",
  "#ef4444",
];

type ViewKey = "holdings" | "trades" | "realized" | "tax";

export default function CryptoPnLTrackerPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [txs, setTxs] = useState<Tx[]>(DEFAULT_TXS);
  const [taxYear, setTaxYear] = useState<string>(new Date().getFullYear().toString());
  const [paste, setPaste] = useState("");
  const [view, setView] = useState<ViewKey>("holdings");

  useEffect(() => {
    const shared = readShareState<Inputs>();
    if (shared?.txs) setTxs(shared.txs);
    if (shared?.prices) setPrices(shared.prices);
    if (shared?.taxYear) setTaxYear(shared.taxYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const symbols = useMemo(() => {
    const set = new Set<string>();
    txs.forEach((t) => {
      const s = t.symbol.trim().toUpperCase();
      if (s) set.add(s);
    });
    return Array.from(set).sort();
  }, [txs]);

  const [prices, setPrices] = useState<Record<string, string>>({
    BTC: "95000",
    ETH: "3200",
  });

  // Parse a multi-ticker price paste like "BTC 95000, ETH 3200, SOL 140".
  // Accepts comma/newline/whitespace separators and "SYMBOL=value" syntax.
  const applyPaste = () => {
    if (!paste.trim()) return;
    const next = { ...prices };
    const parts = paste.split(/[\n,]+/);
    for (const part of parts) {
      const match = part.trim().match(/([A-Za-z0-9]+)\s*[:=]?\s*([0-9.]+)/);
      if (match) {
        next[match[1].toUpperCase()] = match[2];
      }
    }
    setPrices(next);
    setPaste("");
  };

  const priceMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of symbols) {
      m[s] = parseFloat(prices[s] ?? "") || 0;
    }
    return m;
  }, [prices, symbols]);

  const result = useMemo(() => computePnL(txs, priceMap), [txs, priceMap]);

  // Taxable-year summary: realized gains grouped by calendar year, plus
  // short vs long-term holding classification (< or >= 365 days).
  const yearSummary = useMemo(() => {
    const buys = new Map<string, { date: string; costPerUnit: number; qty: number }[]>();
    const byYear: Record<string, { realized: number; shortTerm: number; longTerm: number; count: number }> = {};
    const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : 1));
    for (const tx of sorted) {
      const sym = tx.symbol.trim().toUpperCase();
      if (!sym) continue;
      const qty = parseFloat(tx.qty) || 0;
      const price = parseFloat(tx.price) || 0;
      const fees = parseFloat(tx.fees) || 0;
      if (qty <= 0) continue;
      if (!buys.has(sym)) buys.set(sym, []);
      const lots = buys.get(sym)!;
      if (tx.side === "buy") {
        lots.push({
          date: tx.date,
          costPerUnit: (qty * price + fees) / qty,
          qty,
        });
      } else {
        let remaining = qty;
        const yr = tx.date.slice(0, 4);
        if (!byYear[yr]) byYear[yr] = { realized: 0, shortTerm: 0, longTerm: 0, count: 0 };
        const proceedsPerUnit = (qty * price - fees) / qty;
        while (remaining > 0 && lots.length > 0) {
          const lot = lots[0];
          const take = Math.min(lot.qty, remaining);
          const pnl = (proceedsPerUnit - lot.costPerUnit) * take;
          const days =
            (new Date(tx.date).getTime() - new Date(lot.date).getTime()) /
            86400000;
          byYear[yr].realized += pnl;
          byYear[yr].count += 1;
          if (days >= 365) byYear[yr].longTerm += pnl;
          else byYear[yr].shortTerm += pnl;
          lot.qty -= take;
          remaining -= take;
          if (lot.qty <= 1e-12) lots.shift();
        }
      }
    }
    return byYear;
  }, [txs]);

  // Wash-sale flag: crypto isn't subject to IRS wash-sale rule today, but
  // we detect sells-at-loss followed by repurchase of the same symbol
  // within 30 days — useful for users in jurisdictions that do apply it
  // (UK bed-and-breakfasting rule, e.g.) and as a general awareness cue.
  const washSales = useMemo(() => {
    const flags: { symbol: string; saleDate: string; repurchaseDate: string }[] = [];
    const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : 1));
    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      if (s.side !== "sell") continue;
      // Cheap loss proxy: compare sell price to average earlier buy price.
      const earlierBuys = sorted
        .slice(0, i)
        .filter((t) => t.side === "buy" && t.symbol === s.symbol);
      if (earlierBuys.length === 0) continue;
      const avg =
        earlierBuys.reduce(
          (a, t) => a + (parseFloat(t.price) || 0) * (parseFloat(t.qty) || 0),
          0
        ) /
          earlierBuys.reduce((a, t) => a + (parseFloat(t.qty) || 0), 0) || 0;
      if (parseFloat(s.price) < avg) {
        // Search for repurchase within 30 days after.
        const saleDate = new Date(s.date);
        for (let j = i + 1; j < sorted.length; j++) {
          const f = sorted[j];
          if (f.side !== "buy" || f.symbol !== s.symbol) continue;
          const days =
            (new Date(f.date).getTime() - saleDate.getTime()) / 86400000;
          if (days > 0 && days <= 30) {
            flags.push({
              symbol: s.symbol,
              saleDate: s.date,
              repurchaseDate: f.date,
            });
            break;
          }
        }
      }
    }
    return flags;
  }, [txs]);

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

  const updateTx = (id: string, key: keyof Tx, value: string) =>
    setTxs((p) => p.map((t) => (t.id === id ? { ...t, [key]: value } : t)));

  const addTx = () =>
    setTxs((p) => [
      ...p,
      { id: uid(), date: today, symbol: "BTC", side: "buy", qty: "0", price: "0", fees: "0" },
    ]);
  const removeTx = (id: string) => setTxs((p) => p.filter((t) => t.id !== id));

  const totalPnL = result.totalRealized + result.totalUnrealized;
  const totalMarketValue = result.bySymbol.reduce((a, s) => a + s.marketValue, 0);
  const totalCostBasis = result.bySymbol.reduce(
    (a, s) => a + s.holdings * s.avgCost,
    0
  );
  const totalPnLPct =
    totalCostBasis > 0
      ? ((totalMarketValue - totalCostBasis) / totalCostBasis) * 100
      : 0;

  // Per-position max absolute PnL — used to scale the inline bar visualizations.
  const maxAbsPnL = Math.max(
    1,
    ...result.bySymbol.map((s) => Math.abs(s.unrealized))
  );

  // Allocation pie data: holdings by market value (ignores zero-MV positions).
  const pieData = result.bySymbol
    .filter((s) => s.marketValue > 0)
    .map((s, i) => ({
      symbol: s.symbol,
      value: s.marketValue,
      color: tickerColors[i % tickerColors.length],
    }));
  const pieTotal = pieData.reduce((a, p) => a + p.value, 0);

  // SVG arc segments for the donut chart.
  const pieSegments = (() => {
    if (pieTotal <= 0) return [] as { d: string; color: string; symbol: string; pct: number }[];
    const cx = 60;
    const cy = 60;
    const rOuter = 54;
    const rInner = 32;
    let acc = 0;
    return pieData.map((p) => {
      const start = (acc / pieTotal) * Math.PI * 2 - Math.PI / 2;
      acc += p.value;
      const end = (acc / pieTotal) * Math.PI * 2 - Math.PI / 2;
      const large = end - start > Math.PI ? 1 : 0;
      const x1 = cx + Math.cos(start) * rOuter;
      const y1 = cy + Math.sin(start) * rOuter;
      const x2 = cx + Math.cos(end) * rOuter;
      const y2 = cy + Math.sin(end) * rOuter;
      const x3 = cx + Math.cos(end) * rInner;
      const y3 = cy + Math.sin(end) * rInner;
      const x4 = cx + Math.cos(start) * rInner;
      const y4 = cy + Math.sin(start) * rInner;
      const d = [
        `M ${x1} ${y1}`,
        `A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4}`,
        "Z",
      ].join(" ");
      return { d, color: p.color, symbol: p.symbol, pct: (p.value / pieTotal) * 100 };
    });
  })();

  const dateStamp = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

  const isUp = totalPnL > 0;
  const isDown = totalPnL < 0;
  const heroToneClass = isUp
    ? "text-emerald-500"
    : isDown
      ? "text-rose-500"
      : "text-tool-accent";

  // Realized trades view: compute per-sell realized PnL using FIFO.
  const realizedTrades = useMemo(() => {
    const buys = new Map<string, { date: string; costPerUnit: number; qty: number }[]>();
    const out: {
      id: string;
      date: string;
      symbol: string;
      qty: number;
      proceeds: number;
      costBasis: number;
      pnl: number;
      term: "short" | "long";
    }[] = [];
    const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : 1));
    for (const tx of sorted) {
      const sym = tx.symbol.trim().toUpperCase();
      if (!sym) continue;
      const qty = parseFloat(tx.qty) || 0;
      const price = parseFloat(tx.price) || 0;
      const fees = parseFloat(tx.fees) || 0;
      if (qty <= 0) continue;
      if (!buys.has(sym)) buys.set(sym, []);
      const lots = buys.get(sym)!;
      if (tx.side === "buy") {
        lots.push({ date: tx.date, costPerUnit: (qty * price + fees) / qty, qty });
      } else {
        let remaining = qty;
        const proceedsPerUnit = (qty * price - fees) / qty;
        let costBasisUsed = 0;
        let oldestLotDate = tx.date;
        let usedQty = 0;
        while (remaining > 0 && lots.length > 0) {
          const lot = lots[0];
          const take = Math.min(lot.qty, remaining);
          costBasisUsed += take * lot.costPerUnit;
          if (usedQty === 0) oldestLotDate = lot.date;
          usedQty += take;
          lot.qty -= take;
          remaining -= take;
          if (lot.qty <= 1e-12) lots.shift();
        }
        const filled = qty - remaining;
        const proceeds = proceedsPerUnit * filled;
        const days =
          (new Date(tx.date).getTime() - new Date(oldestLotDate).getTime()) /
          86400000;
        out.push({
          id: tx.id,
          date: tx.date,
          symbol: sym,
          qty: filled,
          proceeds,
          costBasis: costBasisUsed,
          pnl: proceeds - costBasisUsed,
          term: days >= 365 ? "long" : "short",
        });
      }
    }
    return out.reverse();
  }, [txs]);

  // Performance chart: equity curve over time, marking each tx point.
  // Reads --tool-accent from CSS variables at draw time (live).
  const chartRef = useRef<SVGSVGElement | null>(null);
  const [accentColor, setAccentColor] = useState<string>("#14b8a6");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = chartRef.current;
    if (!el) return;
    const c = getComputedStyle(el).getPropertyValue("--tool-accent").trim();
    if (c) setAccentColor(c);
  }, [view, txs.length]);

  const equityPoints = useMemo(() => {
    // walk transactions chronologically, computing realized + unrealized at each step.
    const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : 1));
    const lots = new Map<string, Lot[]>();
    const realized = new Map<string, number>();
    const points: { date: string; pnl: number }[] = [];
    let totalReal = 0;
    for (const tx of sorted) {
      const sym = tx.symbol.trim().toUpperCase();
      if (!sym) continue;
      const qty = parseFloat(tx.qty) || 0;
      const price = parseFloat(tx.price) || 0;
      const fees = parseFloat(tx.fees) || 0;
      if (qty <= 0) continue;
      if (!lots.has(sym)) lots.set(sym, []);
      if (!realized.has(sym)) realized.set(sym, 0);
      const ls = lots.get(sym)!;
      if (tx.side === "buy") {
        ls.push({ qty, costPerUnit: (qty * price + fees) / qty, date: tx.date });
      } else {
        let remaining = qty;
        const proceeds = qty * price - fees;
        let costUsed = 0;
        while (remaining > 0 && ls.length > 0) {
          const lot = ls[0];
          const take = Math.min(lot.qty, remaining);
          costUsed += take * lot.costPerUnit;
          lot.qty -= take;
          remaining -= take;
          if (lot.qty <= 1e-12) ls.shift();
        }
        const r = proceeds - costUsed;
        realized.set(sym, (realized.get(sym) || 0) + r);
        totalReal += r;
      }
      // unrealized snapshot using current marks
      let unreal = 0;
      for (const [s, l] of lots) {
        const px = priceMap[s] || 0;
        const cost = l.reduce((a, lot) => a + lot.qty * lot.costPerUnit, 0);
        const mv = l.reduce((a, lot) => a + lot.qty, 0) * px;
        unreal += mv - cost;
      }
      points.push({ date: tx.date, pnl: totalReal + unreal });
    }
    return points;
  }, [txs, priceMap]);

  return (
    <div data-tool-theme="finance" data-tool="crypto-pnl-tracker">
      <ToolShell
        category="Finance"
        title="Crypto P/L Tracker"
        description="FIFO cost basis. Realized + unrealized P/L per symbol. No APIs, no accounts — your data stays in your browser."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${
                isUp
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
                  : isDown
                    ? "border-rose-500/40 bg-rose-500/15 text-rose-500"
                    : "border-app bg-app-elevated text-secondary"
              }`}
            >
              {isUp ? "▲ GAIN" : isDown ? "▼ LOSS" : "FLAT"}
            </span>
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              fifo
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              portfolio.book
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {result.bySymbol.length}-positions.ledger
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              mark · {dateStamp}
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-end justify-between gap-6">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Crypto Desk · Portfolio P/L
                </div>

                <div className="mt-3 flex items-baseline gap-3">
                  <span className={`font-mono text-2xl font-semibold leading-none ${heroToneClass}`}>
                    {isUp ? "▲" : isDown ? "▼" : "—"}
                  </span>
                  <span
                    className={`font-mono text-5xl font-semibold tabular-nums leading-none tracking-tight sm:text-6xl ${heroToneClass}`}
                  >
                    {fmt(totalPnL)}
                  </span>
                  {totalCostBasis > 0 && (
                    <span className={`font-mono text-xl tabular-nums ${heroToneClass}`}>
                      {totalPnLPct >= 0 ? "+" : ""}
                      {totalPnLPct.toFixed(2)}%
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent">
                    cost basis · {fmt(totalCostBasis)}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    mv · {fmt(totalMarketValue)}
                  </span>
                  <span
                    className={`rounded-md border px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] ${
                      result.totalRealized > 0
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                        : result.totalRealized < 0
                          ? "border-rose-500/30 bg-rose-500/10 text-rose-500"
                          : "border-app bg-app text-secondary"
                    }`}
                  >
                    realized · {fmt(result.totalRealized)}
                  </span>
                  <span
                    className={`rounded-md border px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] ${
                      result.totalUnrealized > 0
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                        : result.totalUnrealized < 0
                          ? "border-rose-500/30 bg-rose-500/10 text-rose-500"
                          : "border-app bg-app text-secondary"
                    }`}
                  >
                    unrealized · {fmt(result.totalUnrealized)}
                  </span>
                </div>
              </div>

              {/* allocation donut */}
              {pieSegments.length > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
                  <svg viewBox="0 0 120 120" className="h-16 w-16" role="img" aria-label="Allocation">
                    {pieSegments.map((seg, i) => (
                      <path key={i} d={seg.d} fill={seg.color} opacity={0.9} />
                    ))}
                  </svg>
                  <div>
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                      Allocation
                    </div>
                    <div className="text-sm font-semibold text-app">
                      {result.bySymbol.length} position{result.bySymbol.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ticker tape */}
          {symbols.length > 0 && (
            <div className="border-t border-app bg-app px-4 py-2">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[0.7rem] tabular-nums">
                {symbols.map((s, i) => {
                  const px = priceMap[s] || 0;
                  const sym = result.bySymbol.find((r) => r.symbol === s);
                  const ref = sym?.avgCost ?? 0;
                  const delta = ref > 0 ? ((px - ref) / ref) * 100 : 0;
                  const tone =
                    delta > 0
                      ? "text-emerald-500"
                      : delta < 0
                        ? "text-rose-500"
                        : "text-muted";
                  return (
                    <span key={s} className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-sm"
                        style={{ backgroundColor: tickerColors[i % tickerColors.length] }}
                      />
                      <span className="font-semibold text-app">{s}</span>
                      <span className="text-secondary">
                        ${px.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </span>
                      <span className={tone}>
                        {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(2)}%
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* sub-tab strip */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "holdings", label: "Holdings" },
                  { k: "trades", label: "Trades" },
                  { k: "realized", label: "Realized" },
                  { k: "tax", label: "Tax" },
                ] as { k: ViewKey; label: string }[]
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setView(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    view === t.k
                      ? "bg-tool-accent text-app-elevated"
                      : "text-secondary hover:text-app"
                  }`}
                  style={view === t.k ? { color: "var(--bg)" } : undefined}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={addTx}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                + Transaction
              </button>
            </div>
          </div>
        </section>

        {result.err && (
          <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-xs text-rose-500">
            {result.err}
          </div>
        )}

        {/* ============================== HOLDINGS VIEW ============================== */}
        {view === "holdings" && (
          <div className="space-y-5">
            {/* Performance chart */}
            {equityPoints.length >= 2 && (
              <section className="rounded-xl border border-app bg-app-elevated p-5">
                <header className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                      Equity curve · realized + unrealized
                    </div>
                    <h2 className="mt-1 text-sm font-semibold tracking-tight text-app">
                      Performance over transactions
                    </h2>
                  </div>
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    {equityPoints.length} marks
                  </span>
                </header>
                <PerformanceChart points={equityPoints} accent={accentColor} fmt={fmt} chartRef={chartRef} />
              </section>
            )}

            {/* Positions */}
            <section className="rounded-xl border border-app bg-app-elevated p-5">
              <header className="mb-4 flex items-center justify-between">
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    Positions · holdings book
                  </div>
                  <h2 className="mt-1 text-sm font-semibold tracking-tight text-app">
                    {result.bySymbol.length} symbol{result.bySymbol.length === 1 ? "" : "s"}
                  </h2>
                </div>
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                  fifo cost · live mark
                </span>
              </header>

              {result.bySymbol.length === 0 ? (
                <div className="rounded-lg border border-dashed border-app bg-app p-8 text-center font-mono text-xs uppercase tracking-[0.18em] text-muted">
                  No positions yet — add a transaction
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[0.9fr_0.9fr_1.1fr_1.1fr_2fr] gap-3 px-3 py-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    <div>Asset / Qty</div>
                    <div className="text-right">Avg cost</div>
                    <div className="text-right">Market value</div>
                    <div className="text-right">P/L · %</div>
                    <div>Visualization</div>
                  </div>
                  {result.bySymbol.map((s, i) => {
                    const cost = s.holdings * s.avgCost;
                    const pct = cost > 0 ? (s.unrealized / cost) * 100 : 0;
                    const up = s.unrealized > 0;
                    const down = s.unrealized < 0;
                    const tone = up
                      ? "text-emerald-500"
                      : down
                        ? "text-rose-500"
                        : "text-muted";
                    const rowTint = up
                      ? "bg-emerald-500/[0.04]"
                      : down
                        ? "bg-rose-500/[0.04]"
                        : "";
                    const barW =
                      Math.min(100, (Math.abs(s.unrealized) / maxAbsPnL) * 100) || 0;
                    return (
                      <div
                        key={s.symbol}
                        className={`grid grid-cols-[0.9fr_0.9fr_1.1fr_1.1fr_2fr] items-center gap-3 rounded-lg border border-app bg-app-elevated px-3 py-2.5 font-mono text-xs ${rowTint}`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-2 w-2 rounded-sm"
                              style={{ backgroundColor: tickerColors[i % tickerColors.length] }}
                            />
                            <span className="font-semibold text-app">{s.symbol}</span>
                          </div>
                          <div className="mt-0.5 text-[0.65rem] tabular-nums text-muted">
                            {s.holdings.toFixed(4)}
                          </div>
                        </div>
                        <div className="text-right tabular-nums text-secondary">
                          {s.holdings > 0 ? fmt(s.avgCost) : "—"}
                        </div>
                        <div className="text-right">
                          <div className="tabular-nums text-app">
                            {fmt(s.marketValue)}
                          </div>
                          <div className="text-[0.65rem] tabular-nums text-muted">
                            @ {fmt(s.currentPrice)}
                          </div>
                        </div>
                        <div className={`text-right tabular-nums ${tone}`}>
                          <div>
                            {up ? "▲" : down ? "▼" : ""} {fmt(s.unrealized)}
                          </div>
                          <div className="text-[0.65rem] opacity-80">
                            {s.holdings > 0
                              ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`
                              : "—"}
                          </div>
                        </div>
                        {/* bar viz: centered axis, left = loss, right = gain */}
                        <div className="relative h-4 rounded-md border border-app bg-app">
                          <div className="absolute left-1/2 top-0 h-full w-px bg-app" style={{ backgroundColor: "var(--border)" }} />
                          {s.holdings > 0 && s.unrealized !== 0 && (
                            <div
                              className={`absolute top-0 h-full ${up ? "bg-emerald-400/70" : "bg-rose-400/70"}`}
                              style={{
                                width: `${barW / 2}%`,
                                left: up ? "50%" : `${50 - barW / 2}%`,
                              }}
                            />
                          )}
                          {s.realized !== 0 && (
                            <div
                              className="absolute -top-px bottom-[-1px] w-px"
                              style={{
                                left: `${
                                  s.realized >= 0
                                    ? Math.min(99, 50 + (Math.abs(s.realized) / maxAbsPnL) * 50)
                                    : Math.max(1, 50 - (Math.abs(s.realized) / maxAbsPnL) * 50)
                                }%`,
                                backgroundColor:
                                  s.realized >= 0 ? "rgb(16 185 129)" : "rgb(244 63 94)",
                              }}
                              title={`Realized ${fmt(s.realized)}`}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="mt-3 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                Bar = unrealized P/L scaled to largest position · tick = realized
              </p>
            </section>

            {/* Allocation legend + Marks */}
            <div className="grid gap-5 lg:grid-cols-2">
              {pieSegments.length > 0 && (
                <section className="rounded-xl border border-app bg-app-elevated p-5">
                  <header className="mb-4">
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                      Allocation · by market value
                    </div>
                    <h2 className="mt-1 text-sm font-semibold tracking-tight text-app">
                      {pieTotal >= 1_000_000
                        ? `$${(pieTotal / 1_000_000).toFixed(2)}M`
                        : pieTotal >= 1_000
                          ? `$${(pieTotal / 1_000).toFixed(1)}K`
                          : `$${pieTotal.toFixed(0)}`}{" "}
                      total
                    </h2>
                  </header>
                  <ul className="space-y-1.5 font-mono text-xs">
                    {pieSegments.map((seg) => (
                      <li
                        key={seg.symbol}
                        className="flex items-center justify-between gap-3 rounded-lg border border-app bg-app px-3 py-2"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: seg.color }}
                          />
                          <span className="font-semibold text-app">{seg.symbol}</span>
                        </span>
                        <span className="tabular-nums text-secondary">
                          {seg.pct.toFixed(1)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="rounded-xl border border-app bg-app-elevated p-5">
                <header className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                      Marks · current prices
                    </div>
                    <h2 className="mt-1 text-sm font-semibold tracking-tight text-app">
                      Manual mark-to-market
                    </h2>
                  </div>
                </header>
                {symbols.length === 0 ? (
                  <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
                    Add a transaction to start tracking.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {symbols.map((s) => (
                      <label
                        key={s}
                        className="grid grid-cols-[5rem_1fr] items-center gap-3"
                      >
                        <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent">
                          {s}
                        </span>
                        <input
                          type="number"
                          value={prices[s] ?? ""}
                          onChange={(e) =>
                            setPrices((p) => ({ ...p, [s]: e.target.value }))
                          }
                          className={fieldInput}
                          min="0"
                          step="0.01"
                        />
                      </label>
                    ))}
                  </div>
                )}

                {/* bulk paste */}
                <div className="mt-4 border-t border-app pt-4">
                  <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    Bulk paste
                  </div>
                  <p className="mb-2 font-mono text-[0.65rem] text-muted">
                    Paste{" "}
                    <span className="text-tool-accent">BTC 95000, ETH 3200</span> or{" "}
                    <span className="text-tool-accent">BTC=95000</span>
                  </p>
                  <textarea
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                    className={`${fieldInput} h-20`}
                    placeholder="BTC 95000&#10;ETH 3200&#10;SOL 140"
                  />
                  <button
                    type="button"
                    onClick={applyPaste}
                    className="mt-2 rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                  >
                    Apply prices
                  </button>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ============================== TRADES VIEW ============================== */}
        {view === "trades" && (
          <section className="rounded-xl border border-app bg-app-elevated">
            <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                ▾ order book · {txs.length} entries
              </div>
              <button
                onClick={addTx}
                className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
              >
                + Transaction
              </button>
            </div>
            <div className="overflow-x-auto p-5">
              <div className="min-w-[800px] space-y-1.5">
                <div className="grid grid-cols-[1.1fr_0.8fr_0.8fr_0.9fr_1fr_0.9fr_2rem] gap-2 px-1 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  <div>Date</div>
                  <div>Symbol</div>
                  <div>Side</div>
                  <div>Qty</div>
                  <div>Price ($)</div>
                  <div>Fees ($)</div>
                  <div />
                </div>
                {txs.map((t) => (
                  <div
                    key={t.id}
                    className={`grid grid-cols-[1.1fr_0.8fr_0.8fr_0.9fr_1fr_0.9fr_2rem] items-center gap-2 rounded-lg border px-1.5 py-1 ${
                      t.side === "buy"
                        ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                        : "border-rose-500/20 bg-rose-500/[0.04]"
                    }`}
                  >
                    <input
                      type="date"
                      value={t.date}
                      onChange={(e) => updateTx(t.id, "date", e.target.value)}
                      className={fieldInput}
                    />
                    <input
                      value={t.symbol}
                      onChange={(e) =>
                        updateTx(t.id, "symbol", e.target.value.toUpperCase())
                      }
                      className={fieldInput}
                      placeholder="BTC"
                    />
                    <select
                      value={t.side}
                      onChange={(e) =>
                        updateTx(t.id, "side", e.target.value as "buy" | "sell")
                      }
                      className={fieldInput}
                    >
                      <option value="buy">Buy</option>
                      <option value="sell">Sell</option>
                    </select>
                    <input
                      type="number"
                      value={t.qty}
                      onChange={(e) => updateTx(t.id, "qty", e.target.value)}
                      className={fieldInput}
                      min="0"
                      step="0.0001"
                    />
                    <input
                      type="number"
                      value={t.price}
                      onChange={(e) => updateTx(t.id, "price", e.target.value)}
                      className={fieldInput}
                      min="0"
                      step="0.01"
                    />
                    <input
                      type="number"
                      value={t.fees}
                      onChange={(e) => updateTx(t.id, "fees", e.target.value)}
                      className={fieldInput}
                      min="0"
                      step="0.01"
                    />
                    <button
                      onClick={() => removeTx(t.id)}
                      className="rounded-md border border-app bg-app text-sm text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                      aria-label="Remove transaction"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ============================== REALIZED VIEW ============================== */}
        {view === "realized" && (
          <section className="rounded-xl border border-app bg-app-elevated">
            <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                ▾ realized P/L · per-sell breakdown
              </div>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                {realizedTrades.length} sells · fifo lots
              </span>
            </div>
            <div className="p-5">
              {realizedTrades.length === 0 ? (
                <div className="rounded-lg border border-dashed border-app bg-app p-8 text-center font-mono text-xs uppercase tracking-[0.18em] text-muted">
                  No sells recorded
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[1fr_0.7fr_0.8fr_1fr_1fr_1fr_0.7fr] gap-2 px-3 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    <div>Date</div>
                    <div>Symbol</div>
                    <div className="text-right">Qty</div>
                    <div className="text-right">Proceeds</div>
                    <div className="text-right">Cost basis</div>
                    <div className="text-right">P/L</div>
                    <div className="text-right">Term</div>
                  </div>
                  {realizedTrades.map((r) => {
                    const up = r.pnl > 0;
                    const down = r.pnl < 0;
                    const tone = up
                      ? "text-emerald-500"
                      : down
                        ? "text-rose-500"
                        : "text-muted";
                    const tint = up
                      ? "bg-emerald-500/[0.04] border-emerald-500/15"
                      : down
                        ? "bg-rose-500/[0.04] border-rose-500/15"
                        : "border-app bg-app";
                    return (
                      <div
                        key={r.id}
                        className={`grid grid-cols-[1fr_0.7fr_0.8fr_1fr_1fr_1fr_0.7fr] items-center gap-2 rounded-lg border px-3 py-2 font-mono text-xs ${tint}`}
                      >
                        <div className="text-secondary">{r.date}</div>
                        <div className="font-semibold text-app">{r.symbol}</div>
                        <div className="text-right tabular-nums text-secondary">
                          {r.qty.toFixed(4)}
                        </div>
                        <div className="text-right tabular-nums text-app">
                          {fmt(r.proceeds)}
                        </div>
                        <div className="text-right tabular-nums text-secondary">
                          {fmt(r.costBasis)}
                        </div>
                        <div className={`text-right tabular-nums font-semibold ${tone}`}>
                          {up ? "▲" : down ? "▼" : ""} {fmt(r.pnl)}
                        </div>
                        <div className="text-right">
                          <span
                            className={`rounded-md border px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] ${
                              r.term === "long"
                                ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-500"
                            }`}
                          >
                            {r.term}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ============================== TAX VIEW ============================== */}
        {view === "tax" && (
          <div className="space-y-5">
            <section className="rounded-xl border border-app bg-app-elevated">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app bg-app px-4 py-2.5">
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  ▾ tax year · short vs long-term
                </div>
                <label className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                  <span>Year</span>
                  <input
                    value={taxYear}
                    onChange={(e) => setTaxYear(e.target.value)}
                    className={`${fieldInput} w-24`}
                  />
                </label>
              </div>
              <div className="p-5">
                {Object.keys(yearSummary).length === 0 ? (
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
                    No realized gains to summarize yet.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-app">
                    <table className="w-full font-mono text-xs">
                      <thead>
                        <tr className="bg-app text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                          <th className="px-3 py-2 text-left">Year</th>
                          <th className="px-3 py-2 text-right">Short-term</th>
                          <th className="px-3 py-2 text-right">Long-term</th>
                          <th className="px-3 py-2 text-right">Total realized</th>
                          <th className="px-3 py-2 text-right">Trades</th>
                        </tr>
                      </thead>
                      <tbody className="tabular-nums text-app">
                        {Object.entries(yearSummary)
                          .sort((a, b) => b[0].localeCompare(a[0]))
                          .map(([y, v]) => (
                            <tr
                              key={y}
                              className={`border-t border-app ${
                                y === taxYear ? "bg-tool-accent-soft" : ""
                              }`}
                            >
                              <td className="px-3 py-2 text-secondary">{y}</td>
                              <td
                                className={`px-3 py-2 text-right ${
                                  v.shortTerm >= 0
                                    ? "text-emerald-500"
                                    : "text-rose-500"
                                }`}
                              >
                                {fmt(v.shortTerm)}
                              </td>
                              <td
                                className={`px-3 py-2 text-right ${
                                  v.longTerm >= 0
                                    ? "text-emerald-500"
                                    : "text-rose-500"
                                }`}
                              >
                                {fmt(v.longTerm)}
                              </td>
                              <td
                                className={`px-3 py-2 text-right font-semibold ${
                                  v.realized >= 0
                                    ? "text-emerald-500"
                                    : "text-rose-500"
                                }`}
                              >
                                {fmt(v.realized)}
                              </td>
                              <td className="px-3 py-2 text-right text-secondary">
                                {v.count}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-3 font-mono text-[0.6rem] text-muted">
                  Short-term &lt; 365 days · long-term ≥ 365. US treats crypto as
                  property. Check IRS Pub 544 / Notice 2014-21.
                </p>
              </div>
            </section>

            {washSales.length > 0 && (
              <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04]">
                <div className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/[0.06] px-4 py-2.5">
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-amber-500">
                    ▾ wash-sale advisory · {washSales.length} flag{washSales.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="p-5">
                  <p className="mb-3 text-xs text-secondary">
                    US IRS does not currently apply wash-sale rules to crypto
                    (stocks/securities only, per §1091). UK, Canada, and others have
                    equivalent rules.
                  </p>
                  <ul className="space-y-1.5 font-mono text-xs">
                    {washSales.map((w, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-amber-500"
                      >
                        <span>
                          <span className="font-semibold">{w.symbol}</span>{" "}
                          <span className="opacity-80">sold at loss</span>{" "}
                          {w.saleDate}
                        </span>
                        <span className="tabular-nums opacity-80">
                          repurchased {w.repurchaseDate}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}
          </div>
        )}

        <p className="mt-6 font-mono text-[0.6rem] text-muted">
          Cost basis uses FIFO — sells consume the oldest lots first. Buy fees
          added to cost; sell fees reduce proceeds. No API calls. Short selling
          and margin not modelled. Not tax advice — rules vary (HIFO, LIFO,
          specific-ID).
        </p>

        <ScenarioBar<Inputs>
          slug="crypto-pnl-tracker"
          state={{ txs, prices, taxYear }}
          onLoad={(d) => {
            if (d?.txs) setTxs(d.txs);
            if (d?.prices) setPrices(d.prices);
            if (d?.taxYear) setTaxYear(d.taxYear);
          }}
          exports={{
            csv: () =>
              toCsv([
                ["Date", "Symbol", "Side", "Qty", "Price", "Fees"],
                ...txs.map((t) => [t.date, t.symbol, t.side, t.qty, t.price, t.fees]),
                [],
                ["Symbol", "Holdings", "AvgCost", "Market", "Realized", "Unrealized"],
                ...result.bySymbol.map((s) => [
                  s.symbol,
                  s.holdings.toFixed(6),
                  s.avgCost.toFixed(2),
                  s.marketValue.toFixed(2),
                  s.realized.toFixed(2),
                  s.unrealized.toFixed(2),
                ]),
              ]),
            json: () => ({ txs, prices, result, yearSummary, washSales }),
            markdown: () =>
              `# Crypto portfolio\n\n- Realized: ${fmt(result.totalRealized)}\n- Unrealized: ${fmt(result.totalUnrealized)}\n- Total: **${fmt(totalPnL)}**\n`,
          }}
        />
      </ToolShell>
    </div>
  );
}

function PerformanceChart({
  points,
  accent,
  fmt,
  chartRef,
}: {
  points: { date: string; pnl: number }[];
  accent: string;
  fmt: (n: number) => string;
  chartRef: React.RefObject<SVGSVGElement | null>;
}) {
  const W = 800;
  const H = 160;
  const padX = 8;
  const padY = 16;
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => p.pnl);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(0, ...ys);
  const rangeY = maxY - minY || 1;
  const xAt = (i: number) =>
    padX + (xs.length === 1 ? W / 2 : (i / (xs.length - 1)) * (W - padX * 2));
  const yAt = (v: number) => padY + (1 - (v - minY) / rangeY) * (H - padY * 2);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(p.pnl).toFixed(2)}`)
    .join(" ");
  const last = points[points.length - 1];
  const isUp = last?.pnl > 0;
  const isDown = last?.pnl < 0;
  const lineColor = isUp ? "rgb(16 185 129)" : isDown ? "rgb(244 63 94)" : accent;
  const zeroY = yAt(0);

  return (
    <svg
      ref={chartRef}
      viewBox={`0 0 ${W} ${H}`}
      className="h-40 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Performance chart"
    >
      {/* zero line */}
      <line
        x1={padX}
        x2={W - padX}
        y1={zeroY}
        y2={zeroY}
        stroke="var(--border)"
        strokeDasharray="3 3"
        strokeWidth="1"
      />
      {/* fill area */}
      <path
        d={`${path} L ${xAt(points.length - 1).toFixed(2)} ${zeroY.toFixed(2)} L ${xAt(0).toFixed(2)} ${zeroY.toFixed(2)} Z`}
        fill={lineColor}
        opacity={0.12}
      />
      {/* line */}
      <path d={path} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={xAt(i)}
          cy={yAt(p.pnl)}
          r={2.5}
          fill={lineColor}
        >
          <title>
            {p.date} · {fmt(p.pnl)}
          </title>
        </circle>
      ))}
    </svg>
  );
}
