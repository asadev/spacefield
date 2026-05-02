"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import { Field, inputCls } from "../../_components/ToolCard";
import WorkspaceSwitcher from "@/components/solutions/WorkspaceSwitcher";
import {
  loadWorkspaceDataClient,
  useWorkspace,
} from "@/lib/workspaces/client";
import { saveWorkspaceData } from "@/lib/workspaces/server";
import MintShareButton from "@/app/(share)/_components/MintShareButton";
import type { PageBlock } from "@/lib/share/types";

const LS_KEY = "solutions:pricing-calculator:v1";
const NAMESPACE = "pricing-calculator";
const DATA_KEY = "current";
const SAVE_DEBOUNCE_MS = 700;

interface Tier {
  id: string;
  name: string;
  tagline: string;
  monthly: number;
  annual: number;
  highlight: boolean;
  features: { id: string; label: string; included: boolean }[];
}

interface State {
  currency: string;
  tiers: Tier[];
  freemium?: boolean;
}

// Real 2025 pricing comparisons (per-user Business tier unless noted).
const PRICING_REFS: Array<{ name: string; starter: string; pro: string; business: string; notes: string }> = [
  { name: "Slack", starter: "Free", pro: "$8.75/user/mo", business: "$15/user/mo", notes: "Per-user annual billing" },
  { name: "Notion", starter: "Free", pro: "$10/user/mo", business: "$18/user/mo", notes: "Per-user annual" },
  { name: "Linear", starter: "Free (10 users)", pro: "$8/user/mo", business: "$14/user/mo", notes: "Per-user monthly" },
  { name: "HubSpot (Sales)", starter: "$15/seat/mo", pro: "$100/seat/mo", business: "$150/seat/mo", notes: "Tiers: Starter / Pro / Enterprise" },
  { name: "Stripe", starter: "Free", pro: "2.9% + 30¢", business: "Custom", notes: "Usage-based payments" },
  { name: "Figma", starter: "Free", pro: "$15/editor/mo", business: "$45/editor/mo", notes: "Per-editor annual" },
  { name: "Intercom", starter: "$29/seat/mo", pro: "$85/seat/mo", business: "$132/seat/mo", notes: "Support seat pricing 2025" },
];

const uid = () => Math.random().toString(36).slice(2, 9);

function defaultState(): State {
  return {
    currency: "USD",
    tiers: [
      {
        id: uid(),
        name: "Starter",
        tagline: "For individuals",
        monthly: 19,
        annual: 190,
        highlight: false,
        features: [
          { id: uid(), label: "5 projects", included: true },
          { id: uid(), label: "Email support", included: true },
          { id: uid(), label: "API access", included: false },
          { id: uid(), label: "SSO", included: false },
        ],
      },
      {
        id: uid(),
        name: "Pro",
        tagline: "For teams",
        monthly: 79,
        annual: 790,
        highlight: true,
        features: [
          { id: uid(), label: "Unlimited projects", included: true },
          { id: uid(), label: "Priority support", included: true },
          { id: uid(), label: "API access", included: true },
          { id: uid(), label: "SSO", included: false },
        ],
      },
      {
        id: uid(),
        name: "Enterprise",
        tagline: "For scale",
        monthly: 299,
        annual: 2990,
        highlight: false,
        features: [
          { id: uid(), label: "Unlimited projects", included: true },
          { id: uid(), label: "Dedicated CSM", included: true },
          { id: uid(), label: "API access", included: true },
          { id: uid(), label: "SSO", included: true },
        ],
      },
    ],
  };
}

export default function PricingCalculatorPage() {
  return (
    <ToolShell
      category="Growth & Strategy"
      title="Pricing Calculator"
      description="Design 3–5 pricing tiers with feature checkboxes, monthly + annual. Export as HTML embed or JSON."
    >
      <PricingInner />
    </ToolShell>
  );
}

function PricingInner() {
  const { current, loading: wsLoading } = useWorkspace();
  const [state, setState] = useState<State>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSig = useRef<string | null>(null);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  useEffect(() => {
    if (wsLoading) return;
    let cancelled = false;
    const load = async () => {
      setHydrated(false);
      if (current.kind === "team") {
        const data = await loadWorkspaceDataClient<State>(
          current.id,
          NAMESPACE,
          DATA_KEY
        );
        if (cancelled) return;
        if (data && Array.isArray(data.tiers)) setState(data);
        else setState(defaultState());
      } else {
        try {
          const raw = localStorage.getItem(LS_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as State;
            if (parsed && Array.isArray(parsed.tiers)) setState(parsed);
            else setState(defaultState());
          } else setState(defaultState());
        } catch {
          setState(defaultState());
        }
      }
      lastSig.current = null;
      setHydrated(true);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [current, wsLoading]);

  useEffect(() => {
    if (!hydrated) return;
    const sig = JSON.stringify(state);
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (current.kind === "team") {
        setSyncing(true);
        const res = await saveWorkspaceData(
          current.id,
          NAMESPACE,
          DATA_KEY,
          state
        );
        setSyncing(false);
        if (res.ok) setSyncedAt(new Date().toLocaleTimeString());
      } else {
        try {
          localStorage.setItem(LS_KEY, sig);
          setSyncedAt(new Date().toLocaleTimeString());
        } catch {}
      }
    }, SAVE_DEBOUNCE_MS);
  }, [state, hydrated, current]);

  const updateTier = (id: string, patch: Partial<Tier>) =>
    setState((s) => ({
      ...s,
      tiers: s.tiers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));

  const addTier = () => {
    if (state.tiers.length >= 5) return;
    setState((s) => ({
      ...s,
      tiers: [
        ...s.tiers,
        {
          id: uid(),
          name: "New tier",
          tagline: "",
          monthly: 0,
          annual: 0,
          highlight: false,
          features: [{ id: uid(), label: "Feature", included: true }],
        },
      ],
    }));
  };

  const removeTier = (id: string) =>
    setState((s) => ({ ...s, tiers: s.tiers.filter((t) => t.id !== id) }));

  const addFeature = (tid: string) =>
    updateTier(tid, {
      features: [
        ...(state.tiers.find((t) => t.id === tid)?.features ?? []),
        { id: uid(), label: "Feature", included: true },
      ],
    });

  const updateFeature = (
    tid: string,
    fid: string,
    patch: Partial<Tier["features"][number]>
  ) => {
    const t = state.tiers.find((x) => x.id === tid);
    if (!t) return;
    updateTier(tid, {
      features: t.features.map((f) => (f.id === fid ? { ...f, ...patch } : f)),
    });
  };

  const removeFeature = (tid: string, fid: string) => {
    const t = state.tiers.find((x) => x.id === tid);
    if (!t) return;
    updateTier(tid, { features: t.features.filter((f) => f.id !== fid) });
  };

  const exportHtml = () => {
    const html = `<div style="display:flex;gap:16px;font-family:system-ui">${state.tiers
      .map(
        (t) => `<div style="flex:1;border:1px solid #eee;border-radius:12px;padding:24px${
          t.highlight ? ";box-shadow:0 0 0 2px #14b8a6" : ""
        }">
  <h3 style="margin:0 0 4px">${escapeHtml(t.name)}</h3>
  <p style="margin:0 0 12px;color:#666;font-size:13px">${escapeHtml(t.tagline)}</p>
  <div style="font-size:28px;font-weight:700">${state.currency} ${t.monthly}<span style="font-size:14px;color:#888;font-weight:400">/mo</span></div>
  <ul style="padding-left:18px;margin:12px 0">${t.features
    .map(
      (f) =>
        `<li style="color:${f.included ? "#111" : "#aaa"};text-decoration:${
          f.included ? "none" : "line-through"
        }">${escapeHtml(f.label)}</li>`
    )
    .join("")}</ul>
</div>`
      )
      .join("")}</div>`;
    navigator.clipboard.writeText(html);
    alert("HTML embed copied to clipboard.");
  };

  const exportJson = () => {
    navigator.clipboard.writeText(JSON.stringify(state, null, 2));
    alert("JSON copied to clipboard.");
  };

  // ── Derived insights for hero / ledger / recommendation ──────────
  const insights = useMemo(() => {
    const tiers = state.tiers;
    const recommended =
      tiers.find((t) => t.highlight) ??
      tiers[Math.floor(tiers.length / 2)] ??
      tiers[0];
    const cheapest = tiers.reduce(
      (a, t) => (a == null || t.monthly < a.monthly ? t : a),
      null as Tier | null
    );
    const top = tiers.reduce(
      (a, t) => (a == null || t.monthly > a.monthly ? t : a),
      null as Tier | null
    );
    const span =
      cheapest && top && cheapest.monthly > 0
        ? top.monthly / Math.max(1, cheapest.monthly)
        : 0;
    const avgFeatures =
      tiers.length > 0
        ? tiers.reduce((a, t) => a + t.features.filter((f) => f.included).length, 0) /
          tiers.length
        : 0;
    // Average annual savings vs monthly across all tiers (simple ROI signal).
    const savings =
      tiers.length > 0
        ? tiers.reduce((a, t) => {
            if (t.monthly <= 0 || t.annual <= 0) return a;
            const pct = ((t.monthly * 12 - t.annual) / (t.monthly * 12)) * 100;
            return a + Math.max(0, pct);
          }, 0) / tiers.length
        : 0;
    return { recommended, cheapest, top, span, avgFeatures, savings };
  }, [state.tiers]);

  const fmtMoney = (n: number) =>
    n.toLocaleString(undefined, {
      style: "currency",
      currency: state.currency,
      maximumFractionDigits: 0,
    });

  return (
    <div
      data-tool-theme="finance"
      data-tool="pricing-calculator"
      className="space-y-6 text-app"
    >
      <WorkspaceSwitcher />

      {/* In-tool header — pricing strategist's chrome */}
      <header className="tool-hero relative overflow-hidden rounded-2xl border border-app bg-tool-surface px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-tool-accent">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
              Finance · Packaging & Pricing
            </div>
            <h1 className="font-tool-heading text-2xl font-semibold tracking-tight text-app">
              Pricing Calculator
            </h1>
            <p className="mt-1 max-w-xl text-sm text-secondary">
              Stack tiers, draw the value gap, ship the page. Recommendation chip flags the anchor.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
              {state.tiers.length} tiers · {state.currency}
            </div>
            <div className="flex items-center gap-2 rounded-md border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-wider text-muted">
              {syncing ? (
                <>
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                  Saving…
                </>
              ) : syncedAt ? (
                <>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Saved {syncedAt}
                </>
              ) : (
                <>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent/40" />
                  {current.kind === "team" ? "Team" : "Personal"}
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* HERO — 3-tier price cards with billing toggle + recommendation chip */}
      <section className="relative overflow-hidden rounded-2xl border border-app bg-tool-surface px-6 py-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[0.6rem] font-medium uppercase tracking-[0.22em] text-muted">
              Price-card hero
              {insights.recommended && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-tool-accent/40 bg-tool-accent-soft px-2 py-0.5 text-[0.55rem] font-semibold tracking-[0.15em] text-tool-accent">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                  Anchor: {insights.recommended.name}
                </span>
              )}
            </div>
            <h2 className="font-tool-heading text-lg font-semibold tracking-tight text-app">
              Three lanes. One anchor.
            </h2>
            <p className="mt-1 max-w-md text-xs text-secondary">
              Tag the middle tier as recommended — that&apos;s your psychological anchor. Annual gets a discount badge.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <BillingToggle billing={billing} setBilling={setBilling} savings={insights.savings} />
            <button
              onClick={addTier}
              disabled={state.tiers.length >= 5}
              className="rounded-md border border-tool-accent/30 bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-white disabled:opacity-40"
            >
              + Tier
            </button>
          </div>
        </div>

        <div
          className={`grid gap-4 ${
            state.tiers.length >= 4
              ? "md:grid-cols-2 lg:grid-cols-4"
              : "md:grid-cols-3"
          }`}
        >
          {state.tiers.map((t) => {
            const price = billing === "monthly" ? t.monthly : t.annual;
            const annualSavingsPct =
              t.monthly > 0
                ? Math.max(0, ((t.monthly * 12 - t.annual) / (t.monthly * 12)) * 100)
                : 0;
            const includedCount = t.features.filter((f) => f.included).length;

            return (
              <div
                key={t.id}
                className={`relative flex flex-col overflow-hidden rounded-xl border bg-app-elevated p-4 shadow-sm transition-shadow hover:shadow-md ${
                  t.highlight
                    ? "border-tool-accent/60 ring-1 ring-tool-accent/30"
                    : "border-app"
                }`}
              >
                {t.highlight && (
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-tool-accent px-2 py-0.5 font-mono text-[0.5rem] font-semibold uppercase tracking-[0.18em] text-white">
                    <span className="inline-block h-1 w-1 rounded-full bg-white/90" />
                    Recommended
                  </span>
                )}

                {/* Card head — name & tagline (editable) */}
                <div className="mb-3">
                  <input
                    value={t.name}
                    onChange={(e) => updateTier(t.id, { name: e.target.value })}
                    className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 font-tool-heading text-base font-semibold text-app outline-none transition-colors hover:border-app focus:border-tool-accent focus:bg-app"
                  />
                  <input
                    value={t.tagline}
                    onChange={(e) => updateTier(t.id, { tagline: e.target.value })}
                    placeholder="One-line positioning"
                    className="mt-0.5 w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-muted outline-none transition-colors hover:border-app focus:border-tool-accent focus:bg-app placeholder:text-muted"
                  />
                </div>

                {/* Price block */}
                <div className="mb-3 rounded-lg border border-app bg-app p-3">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                      {state.currency}
                    </span>
                    <span
                      className={`font-mono text-3xl font-semibold tabular-nums leading-none tracking-tight ${
                        t.highlight ? "text-tool-accent" : "text-app"
                      }`}
                    >
                      {price.toLocaleString()}
                    </span>
                    <span className="font-mono text-xs text-muted">
                      /{billing === "monthly" ? "mo" : "yr"}
                    </span>
                  </div>
                  {billing === "annual" && annualSavingsPct > 0 && (
                    <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-emerald-500">
                      <span className="inline-block h-1 w-1 rounded-full bg-emerald-500" />
                      Save {annualSavingsPct.toFixed(0)}% vs monthly
                    </div>
                  )}
                  {billing === "monthly" && t.annual > 0 && t.monthly > 0 && annualSavingsPct > 0 && (
                    <div className="mt-1.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                      Annual: {fmtMoney(t.annual)} ({annualSavingsPct.toFixed(0)}% off)
                    </div>
                  )}
                </div>

                {/* Editable price inputs */}
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-0.5 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                      Monthly
                    </span>
                    <input
                      type="number"
                      value={t.monthly}
                      onChange={(e) =>
                        updateTier(t.id, { monthly: Number(e.target.value) || 0 })
                      }
                      className="w-full rounded-md border border-app bg-app px-2 py-1 text-right font-mono text-xs tabular-nums text-app outline-none transition-colors focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                      Annual
                    </span>
                    <input
                      type="number"
                      value={t.annual}
                      onChange={(e) =>
                        updateTier(t.id, { annual: Number(e.target.value) || 0 })
                      }
                      className="w-full rounded-md border border-app bg-app px-2 py-1 text-right font-mono text-xs tabular-nums text-app outline-none transition-colors focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                    />
                  </label>
                </div>

                {/* Feature checklist */}
                <div className="mb-3 flex-1">
                  <div className="mb-1.5 flex items-center justify-between font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    <span>Features</span>
                    <span className="tabular-nums text-tool-accent">
                      {includedCount}/{t.features.length}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {t.features.map((f) => (
                      <li key={f.id} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateFeature(t.id, f.id, { included: !f.included })
                          }
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                            f.included
                              ? "border-tool-accent/60 bg-tool-accent text-white"
                              : "border-app bg-transparent text-transparent"
                          }`}
                          aria-label={f.included ? "Included" : "Not included"}
                        >
                          {f.included ? (
                            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="2.5 6.5 5 9 9.5 3.5" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <line x1="3" y1="6" x2="9" y2="6" />
                            </svg>
                          )}
                        </button>
                        <input
                          value={f.label}
                          onChange={(e) =>
                            updateFeature(t.id, f.id, { label: e.target.value })
                          }
                          className={`w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs outline-none transition-colors hover:border-app focus:border-tool-accent focus:bg-app ${
                            f.included
                              ? "text-secondary"
                              : "text-muted line-through"
                          }`}
                        />
                        <button
                          onClick={() => removeFeature(t.id, f.id)}
                          className="shrink-0 rounded-md border border-transparent px-1.5 font-mono text-xs text-muted transition-colors hover:border-rose-400/40 hover:text-rose-500"
                          aria-label="Remove feature"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => addFeature(t.id)}
                    className="mt-2 rounded-md border border-app bg-app px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-tool-accent/40 hover:text-tool-accent"
                  >
                    + Feature
                  </button>
                </div>

                {/* Card footer — recommend toggle + remove */}
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-app pt-3">
                  <label className="flex items-center gap-2 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                    <input
                      type="checkbox"
                      checked={t.highlight}
                      onChange={(e) =>
                        updateTier(t.id, { highlight: e.target.checked })
                      }
                      className="h-3.5 w-3.5 accent-tool-accent"
                    />
                    Anchor
                  </label>
                  <button
                    onClick={() => removeTier(t.id)}
                    className="rounded-md border border-transparent px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-rose-400/40 hover:text-rose-500"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Hero secondary metrics ledger */}
        <div className="relative mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-app font-mono text-sm sm:grid-cols-4">
          <div className="bg-tool-surface p-3">
            <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
              Tiers
            </div>
            <div className="mt-1 tabular-nums text-app">
              {state.tiers.length}
            </div>
          </div>
          <div className="bg-tool-surface p-3">
            <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
              Price span
            </div>
            <div className="mt-1 tabular-nums text-app">
              {insights.span > 0 ? `${insights.span.toFixed(1)}×` : "—"}
            </div>
          </div>
          <div className="bg-tool-surface p-3">
            <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
              Avg features
            </div>
            <div className="mt-1 tabular-nums text-app">
              {insights.avgFeatures.toFixed(1)}
            </div>
          </div>
          <div className="bg-tool-surface p-3">
            <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
              Recommended
            </div>
            <div className="mt-1 tabular-nums text-tool-accent">
              {insights.recommended ? insights.recommended.name : "—"}
            </div>
          </div>
        </div>
      </section>

      {/* Value-vs-cost ledger — visual gap between tiers */}
      <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h2 className="font-tool-heading text-sm font-semibold uppercase tracking-[0.18em] text-app">
              Value vs cost ledger
            </h2>
            <p className="mt-0.5 text-[0.7rem] text-secondary">
              Per-tier: features earned per dollar. Bars show the value-to-cost ratio at a glance.
            </p>
          </div>
          <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
            {billing === "monthly" ? "Monthly" : "Annual"}
          </span>
        </div>

        <div className="grid grid-cols-[minmax(0,1.2fr)_5rem_5rem_minmax(0,1.4fr)_4rem] gap-3 border-b border-app pb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
          <span>Tier</span>
          <span className="text-right">Price</span>
          <span className="text-right">Features</span>
          <span>Value bar</span>
          <span className="text-right">$/feat</span>
        </div>

        <div className="mt-2 space-y-1">
          {state.tiers.map((t) => {
            const price = billing === "monthly" ? t.monthly : t.annual;
            const incCount = t.features.filter((f) => f.included).length;
            const perFeature = incCount > 0 ? price / incCount : 0;
            const peakFeatures = Math.max(
              ...state.tiers.map((x) => x.features.filter((f) => f.included).length),
              1
            );
            const peakPrice = Math.max(
              ...state.tiers.map((x) => (billing === "monthly" ? x.monthly : x.annual)),
              1
            );
            const featPct = (incCount / peakFeatures) * 100;
            const pricePct = (price / peakPrice) * 100;

            return (
              <div
                key={t.id}
                className={`grid grid-cols-[minmax(0,1.2fr)_5rem_5rem_minmax(0,1.4fr)_4rem] items-center gap-3 rounded-md px-2 py-2 ${
                  t.highlight ? "bg-tool-accent-soft" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  {t.highlight && (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-tool-accent" />
                  )}
                  <span className="font-mono text-sm text-app">
                    {t.name}
                  </span>
                </div>
                <span className="text-right font-mono text-xs tabular-nums text-secondary">
                  {fmtMoney(price)}
                </span>
                <span className="text-right font-mono text-xs tabular-nums text-secondary">
                  {incCount}/{t.features.length}
                </span>
                <div className="space-y-1">
                  <div className="relative h-1.5 overflow-hidden rounded-sm bg-app">
                    <div
                      className="absolute inset-y-0 left-0 bg-tool-accent"
                      style={{ width: `${featPct}%` }}
                      title="Value (features)"
                    />
                  </div>
                  <div className="relative h-1.5 overflow-hidden rounded-sm bg-app">
                    <div
                      className="absolute inset-y-0 left-0 bg-rose-500/70"
                      style={{ width: `${pricePct}%` }}
                      title="Cost (price)"
                    />
                  </div>
                </div>
                <span className="text-right font-mono text-xs tabular-nums text-muted">
                  {perFeature > 0 ? fmtMoney(perFeature) : "—"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm bg-tool-accent" /> Value (features)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm bg-rose-500/70" /> Cost (price)
          </span>
          <span className="ml-auto text-tool-accent">
            Lower $/feat → better packaged value
          </span>
        </div>
      </section>

      {/* Packaging options */}
      <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-tool-heading text-sm font-semibold uppercase tracking-[0.18em] text-app">
            Packaging options
          </h2>
          <label className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <input
              type="checkbox"
              checked={!!state.freemium}
              onChange={(e) => setState((s) => ({ ...s, freemium: e.target.checked }))}
              className="h-4 w-4 accent-tool-accent"
            />
            Include freemium tier
          </label>
        </div>
        {state.freemium && (
          <div className="rounded-md border border-tool-accent/30 bg-tool-accent-soft px-3 py-2.5 text-xs text-secondary">
            Freemium guidance: cap a key dimension (users, projects, API calls). Free-to-paid conversion targets 2–5% for SaaS, per OpenView 2024 Product Benchmarks. Without friction (rate limit, watermark, feature lock) conversion stalls below 1%.
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={exportHtml}
            className="rounded-md border border-tool-accent/30 bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-white"
          >
            Copy HTML embed
          </button>
          <button
            onClick={exportJson}
            className="rounded-md border border-app bg-app px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-secondary transition-colors hover:border-tool-accent/40 hover:text-tool-accent"
          >
            Copy JSON
          </button>
          <MintShareButton
            type="page"
            sourceTool="pricing-calculator"
            label="Share as link"
            variant="ghost"
            workspaceId={current.kind === "team" ? current.id : undefined}
            disabled={state.tiers.length === 0}
            payload={() => buildPricingSharePayload(state)}
          />
        </div>
      </section>

      {/* ROI / pricing calculators */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <h2 className="font-tool-heading text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Seat-based ROI
              </h2>
              <p className="mt-0.5 text-[0.7rem] text-secondary">
                Flat per-seat with volume discount.
              </p>
            </div>
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
              MRR · ARR
            </span>
          </div>
          <SeatPricingCalc currency={state.currency} />
        </div>
        <div className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <h2 className="font-tool-heading text-sm font-semibold uppercase tracking-[0.18em] text-app">
                Usage-based ROI
              </h2>
              <p className="mt-0.5 text-[0.7rem] text-secondary">
                Metered with included units & overage.
              </p>
            </div>
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
              Bill · effective $/unit
            </span>
          </div>
          <UsagePricingCalc currency={state.currency} />
        </div>
      </section>

      {/* SaaS reference benchmarks */}
      <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h2 className="font-tool-heading text-sm font-semibold uppercase tracking-[0.18em] text-app">
              SaaS pricing benchmarks
            </h2>
            <p className="mt-0.5 text-[0.7rem] text-secondary">
              2025 vendor reference. Cross-check before launch.
            </p>
          </div>
          <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
            7 vendors
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                <th className="px-2 py-2 text-left">Product</th>
                <th className="px-2 py-2 text-left">Starter</th>
                <th className="px-2 py-2 text-left">Pro</th>
                <th className="px-2 py-2 text-left">Business</th>
                <th className="px-2 py-2 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {PRICING_REFS.map((r) => (
                <tr
                  key={r.name}
                  className="border-t border-app"
                >
                  <td className="px-2 py-1.5 font-semibold text-app">
                    {r.name}
                  </td>
                  <td className="px-2 py-1.5 text-secondary">
                    {r.starter}
                  </td>
                  <td className="px-2 py-1.5 text-secondary">
                    {r.pro}
                  </td>
                  <td className="px-2 py-1.5 text-secondary">
                    {r.business}
                  </td>
                  <td className="px-2 py-1.5 text-[0.65rem] text-muted">
                    {r.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
          Sources: vendor pricing pages as of 2025.
        </p>
      </section>

      {/* Comparison matrix */}
      <section className="rounded-2xl border border-app bg-tool-surface p-5 shadow-sm">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h2 className="font-tool-heading text-sm font-semibold uppercase tracking-[0.18em] text-app">
              Comparison matrix
            </h2>
            <p className="mt-0.5 text-[0.7rem] text-secondary">
              Feature × tier — confirms the value gap is real.
            </p>
          </div>
        </div>
        <div className="overflow-auto rounded-lg border border-app">
          <table className="w-full font-mono text-xs">
            <thead className="bg-app text-muted">
              <tr>
                <th className="px-3 py-2 text-left text-[0.55rem] uppercase tracking-[0.18em] font-medium">
                  Feature
                </th>
                {state.tiers.map((t) => (
                  <th
                    key={t.id}
                    className={`px-3 py-2 text-center text-[0.55rem] uppercase tracking-[0.18em] font-medium ${
                      t.highlight ? "text-tool-accent" : ""
                    }`}
                  >
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-secondary">
              {allFeatureLabels(state.tiers).map((label) => (
                <tr key={label} className="border-t border-app">
                  <td className="px-3 py-1.5">{label}</td>
                  {state.tiers.map((t) => {
                    const f = t.features.find((x) => x.label === label);
                    const ok = !!(f && f.included);
                    return (
                      <td
                        key={t.id}
                        className={`px-3 py-1.5 text-center tabular-nums ${
                          ok
                            ? t.highlight
                              ? "text-tool-accent"
                              : "text-emerald-500"
                            : "text-muted"
                        }`}
                      >
                        {ok ? "✓" : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// Reusable billing cycle toggle (monthly/annual with savings %).
function BillingToggle({
  billing,
  setBilling,
  savings,
}: {
  billing: "monthly" | "annual";
  setBilling: (b: "monthly" | "annual") => void;
  savings: number;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <div className="inline-flex rounded-md border border-app bg-app-elevated p-1">
        {(["monthly", "annual"] as const).map((b) => (
          <button
            key={b}
            onClick={() => setBilling(b)}
            className={`rounded px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] transition-colors ${
              billing === b
                ? "bg-tool-accent text-white shadow-sm"
                : "text-muted hover:text-app"
            }`}
          >
            {b}
          </button>
        ))}
      </div>
      {billing === "annual" && savings > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-emerald-500">
          <span className="inline-block h-1 w-1 rounded-full bg-emerald-500" />
          Save {savings.toFixed(0)}%
        </span>
      )}
    </div>
  );
}

function SeatPricingCalc({ currency }: { currency: string }) {
  const [pricePerSeat, setPricePerSeat] = useState("15");
  const [seats, setSeats] = useState("25");
  const [volumeDiscount, setVolumeDiscount] = useState("10");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");
  const p = parseFloat(pricePerSeat) || 0;
  const s = parseFloat(seats) || 0;
  const d = (parseFloat(volumeDiscount) || 0) / 100;
  const grossMonthly = p * s;
  const netMonthly = grossMonthly * (1 - d);
  const mrr = netMonthly;
  const arr = mrr * 12;
  const annualPaid = billingCycle === "annual" ? arr : null;

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: 0 });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price per seat / month">
          <input type="number" value={pricePerSeat} onChange={(e) => setPricePerSeat(e.target.value)} className={inputCls()} min="0" step="1" />
        </Field>
        <Field label="Seats">
          <input type="number" value={seats} onChange={(e) => setSeats(e.target.value)} className={inputCls()} min="0" step="1" />
        </Field>
        <Field label="Volume discount (%)">
          <input type="number" value={volumeDiscount} onChange={(e) => setVolumeDiscount(e.target.value)} className={inputCls()} min="0" max="100" step="1" />
        </Field>
        <Field label="Billing cycle">
          <select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as "monthly" | "annual")} className={inputCls()}>
            <option value="monthly">Monthly</option>
            <option value="annual">Annual prepay</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-app font-mono text-sm">
        <div className="bg-tool-surface p-3">
          <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">MRR</div>
          <div className="mt-1 tabular-nums text-app">{fmt(mrr)}</div>
        </div>
        <div className="bg-tool-surface p-3">
          <div className="text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">ARR</div>
          <div className="mt-1 tabular-nums text-tool-accent">{fmt(arr)}</div>
        </div>
        {annualPaid != null && (
          <div className="bg-tool-surface p-3">
            <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">Annual charge</div>
            <div className="mt-1 tabular-nums text-app">{fmt(annualPaid)}</div>
          </div>
        )}
        <div className="bg-tool-surface p-3">
          <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">Effective $/seat</div>
          <div className="mt-1 tabular-nums text-app">{s > 0 ? fmt(netMonthly / s) : "—"}</div>
        </div>
      </div>
    </div>
  );
}

function UsagePricingCalc({ currency }: { currency: string }) {
  const [includedUnits, setIncludedUnits] = useState("10000");
  const [pricePerUnit, setPricePerUnit] = useState("0.002");
  const [overagePrice, setOveragePrice] = useState("0.005");
  const [baseFee, setBaseFee] = useState("50");
  const [actualUsage, setActualUsage] = useState("25000");
  const fmt = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: 2 });
  const included = parseFloat(includedUnits) || 0;
  const ppu = parseFloat(pricePerUnit) || 0;
  const op = parseFloat(overagePrice) || 0;
  const base = parseFloat(baseFee) || 0;
  const usage = parseFloat(actualUsage) || 0;
  const usedIncluded = Math.min(usage, included);
  const overage = Math.max(0, usage - included);
  const bill = base + usedIncluded * ppu + overage * op;
  const effective = usage > 0 ? bill / usage : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Base fee / month">
          <input type="number" value={baseFee} onChange={(e) => setBaseFee(e.target.value)} className={inputCls()} min="0" step="1" />
        </Field>
        <Field label="Included units">
          <input type="number" value={includedUnits} onChange={(e) => setIncludedUnits(e.target.value)} className={inputCls()} min="0" step="100" />
        </Field>
        <Field label="Price per unit ($)">
          <input type="number" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} className={inputCls()} min="0" step="0.0001" />
        </Field>
        <Field label="Overage price ($)" hint="after included">
          <input type="number" value={overagePrice} onChange={(e) => setOveragePrice(e.target.value)} className={inputCls()} min="0" step="0.0001" />
        </Field>
        <Field label="Actual usage this month">
          <input type="number" value={actualUsage} onChange={(e) => setActualUsage(e.target.value)} className={inputCls()} min="0" step="100" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-app bg-app font-mono text-sm">
        <div className="bg-tool-surface p-3">
          <div className="text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">Monthly bill</div>
          <div className="mt-1 tabular-nums text-tool-accent">{fmt(bill)}</div>
        </div>
        <div className="bg-tool-surface p-3">
          <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">Overage units</div>
          <div className="mt-1 tabular-nums text-app">{Math.round(overage).toLocaleString()}</div>
        </div>
        <div className="bg-tool-surface p-3 col-span-2">
          <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">Effective price / unit</div>
          <div className="mt-1 tabular-nums text-app">{fmt(effective)}</div>
        </div>
      </div>
    </div>
  );
}

function allFeatureLabels(tiers: Tier[]): string[] {
  const set = new Set<string>();
  tiers.forEach((t) => t.features.forEach((f) => set.add(f.label)));
  return Array.from(set);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Build the share.example.com PagePayload for the pricing tiers.
 * The hero "stats" block lays out the tiers side-by-side; each tier then
 * gets its own heading + tagline + feature list block. */
function buildPricingSharePayload(state: State) {
  const blocks: PageBlock[] = [];

  if (state.tiers.length) {
    blocks.push({
      kind: "stats",
      items: state.tiers.map((t) => ({
        label: t.name + (t.highlight ? " · Recommended" : ""),
        value: `${state.currency} ${t.monthly.toLocaleString()}/mo`,
      })),
    });
  }

  for (const t of state.tiers) {
    blocks.push({ kind: "heading", text: t.name, level: 2 });
    if (t.tagline) blocks.push({ kind: "paragraph", text: t.tagline });

    const includedFeatures = t.features
      .filter((f) => f.included)
      .map((f) => f.label || "Feature");
    if (includedFeatures.length) {
      blocks.push({ kind: "list", items: includedFeatures });
    }

    const excludedFeatures = t.features
      .filter((f) => !f.included)
      .map((f) => f.label || "Feature");
    if (excludedFeatures.length) {
      blocks.push({ kind: "paragraph", text: `Not included: ${excludedFeatures.join(", ")}` });
    }
  }

  if (state.freemium) {
    blocks.push({ kind: "heading", text: "Free tier available", level: 3 });
    blocks.push({
      kind: "paragraph",
      text: "A limited free plan is offered alongside the paid tiers.",
    });
  }

  return {
    title: "Pricing",
    blocks,
  };
}
