"use client";

/* Area Comparison — native window app.
 *
 * Mirror of app/tools/area-comparison/page.tsx with the chrome stripped:
 * no AuthGate, no PageHeader, no frame=1, no macOS hero padding, no back
 * link, no ToolRecommendations. Cross-tool navigation uses props.openApp
 * instead of <Link>.
 *
 * Width-driven layout — no sm:/md:/lg: breakpoints; column counts on the
 * picker grid, comparison table, weights grid, and matchups grid all key
 * off the live `width` prop and feed inline `gridTemplateColumns`. Canvas
 * tone derives from `resolved` so dark/light themes draw correctly.
 *
 * Foundation tokens only (bg-app, bg-app-elevated, border-app,
 * text-app/secondary/muted, tool-accent variants). data-tool-theme="intelligence"
 * scopes the violet accent.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { NativeAppProps } from "../_data/tools-list";
import {
  communities,
  type Community,
  DATA_UPDATED,
} from "@/lib/neighborhood-data";
import {
  computeAllScores,
  type CommunityScores,
} from "@/lib/neighborhood-scoring";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const sorted = [...communities].sort((a, b) => a.name.localeCompare(b.name));

// Per-area swatches (used for radar shapes & subtle area dots).
// Picks a violet ramp so they cohere with the intelligence accent.
const SWATCHES = ["#8b5cf6", "#a855f7", "#c084fc"];

function mid(r: { min: number; max: number }) {
  return (r.min + r.max) / 2;
}

function fmt(n: number) {
  return n.toLocaleString("en-AE");
}

function bestSchoolRating(c: Community): string {
  const order = ["Outstanding", "Very Good", "Good", "Acceptable"];
  for (const r of order) {
    if (c.familyFriendliness.schools.some((s) => s.rating === r)) return r;
  }
  return "N/A";
}

type Direction = "high" | "low" | "none";

interface MetricRow {
  label: string;
  group: "Price" | "Yield" | "Lifestyle" | "Connectivity" | "Summary";
  getValue: (c: Community, scores: CommunityScores) => string | number;
  getNumeric?: (c: Community, scores: CommunityScores) => number;
  direction: Direction;
}

const METRICS: MetricRow[] = [
  {
    label: "Overall Score",
    group: "Summary",
    getValue: (_, s) => `${s.overall}/10`,
    getNumeric: (_, s) => s.overall,
    direction: "high",
  },
  {
    label: "Price per sqft (AED)",
    group: "Price",
    getValue: (c) =>
      `${fmt(c.pricing.pricePerSqft.min)} – ${fmt(c.pricing.pricePerSqft.max)}`,
    getNumeric: (c) => mid(c.pricing.pricePerSqft),
    direction: "low",
  },
  {
    label: "Total price range",
    group: "Price",
    getValue: (c) =>
      `${fmt(c.pricing.priceRangeAed[0])} – ${fmt(c.pricing.priceRangeAed[1])}`,
    getNumeric: (c) => c.pricing.priceRangeAed[0],
    direction: "low",
  },
  {
    label: "Service charge / sqft",
    group: "Price",
    getValue: (c) =>
      `AED ${c.pricing.serviceChargePerSqft.min} – ${c.pricing.serviceChargePerSqft.max}`,
    getNumeric: (c) => mid(c.pricing.serviceChargePerSqft),
    direction: "low",
  },
  {
    label: "Freehold status",
    group: "Price",
    getValue: (c) =>
      c.freeholdStatus === "freehold" ? "Freehold" : "Leasehold",
    direction: "none",
  },
  {
    label: "Rental yield",
    group: "Yield",
    getValue: (c) =>
      `${c.investment.rentalYieldPct.min}% – ${c.investment.rentalYieldPct.max}%`,
    getNumeric: (c) => mid(c.investment.rentalYieldPct),
    direction: "high",
  },
  {
    label: "Dubai 2040 impact",
    group: "Yield",
    getValue: (c) =>
      c.futureGrowth.dubai2040Impact.charAt(0).toUpperCase() +
      c.futureGrowth.dubai2040Impact.slice(1),
    getNumeric: (c) =>
      c.futureGrowth.dubai2040Impact === "high"
        ? 3
        : c.futureGrowth.dubai2040Impact === "medium"
          ? 2
          : 1,
    direction: "high",
  },
  {
    label: "Completion status",
    group: "Yield",
    getValue: (c) => `${Math.round(c.futureGrowth.completionStatus * 100)}%`,
    getNumeric: (c) => c.futureGrowth.completionStatus,
    direction: "high",
  },
  {
    label: "Developer",
    group: "Yield",
    getValue: (c) => c.developer,
    direction: "none",
  },
  {
    label: "Nearest metro",
    group: "Connectivity",
    getValue: (c) =>
      `${c.connectivity.nearestMetro.name} (${c.connectivity.nearestMetro.distanceKm} km)`,
    getNumeric: (c) => c.connectivity.nearestMetro.distanceKm,
    direction: "low",
  },
  {
    label: "Commute to DIFC",
    group: "Connectivity",
    getValue: (c) => `${c.connectivity.commuteMinutes.difc} min`,
    getNumeric: (c) => c.connectivity.commuteMinutes.difc,
    direction: "low",
  },
  {
    label: "Commute to Marina",
    group: "Connectivity",
    getValue: (c) => `${c.connectivity.commuteMinutes.marina} min`,
    getNumeric: (c) => c.connectivity.commuteMinutes.marina,
    direction: "low",
  },
  {
    label: "Commute to Airport",
    group: "Connectivity",
    getValue: (c) => `${c.connectivity.commuteMinutes.airport} min`,
    getNumeric: (c) => c.connectivity.commuteMinutes.airport,
    direction: "low",
  },
  {
    label: "Walkability",
    group: "Connectivity",
    getValue: (c) => `${c.connectivity.walkabilityScore}/10`,
    getNumeric: (c) => c.connectivity.walkabilityScore,
    direction: "high",
  },
  {
    label: "Beach distance",
    group: "Lifestyle",
    getValue: (c) => `${c.livability.beachDistanceKm} km`,
    getNumeric: (c) => c.livability.beachDistanceKm,
    direction: "low",
  },
  {
    label: "Schools",
    group: "Lifestyle",
    getValue: (c) =>
      `${c.familyFriendliness.schools.length} (best: ${bestSchoolRating(c)})`,
    getNumeric: (c) => c.familyFriendliness.schools.length,
    direction: "high",
  },
  {
    label: "Parks",
    group: "Lifestyle",
    getValue: (c) => `${c.livability.nearbyParks.length}`,
    getNumeric: (c) => c.livability.nearbyParks.length,
    direction: "high",
  },
  {
    label: "Pet friendly",
    group: "Lifestyle",
    getValue: (c) => (c.livability.petFriendly ? "Yes" : "No"),
    direction: "none",
  },
  {
    label: "Noise level",
    group: "Lifestyle",
    getValue: (c) =>
      c.livability.noiseLevel.charAt(0).toUpperCase() +
      c.livability.noiseLevel.slice(1),
    getNumeric: (c) =>
      c.livability.noiseLevel === "low"
        ? 3
        : c.livability.noiseLevel === "moderate"
          ? 2
          : 1,
    direction: "high",
  },
  {
    label: "Community feel",
    group: "Lifestyle",
    getValue: (c) => c.livability.communityFeel,
    direction: "none",
  },
];

const METRIC_GROUPS: MetricRow["group"][] = [
  "Summary",
  "Price",
  "Yield",
  "Connectivity",
  "Lifestyle",
];

/* Tabs in-place navigation between sub-views */
type View = "compare" | "weights" | "popular";
const VIEWS: { id: View; label: string }[] = [
  { id: "compare", label: "Compare" },
  { id: "weights", label: "Weights" },
  { id: "popular", label: "Matchups" },
];

/* ------------------------------------------------------------------ */
/*  Popular comparisons                                               */
/* ------------------------------------------------------------------ */

const POPULAR: { label: string; ids: string[] }[] = [
  {
    label: "JVC vs Dubai Hills",
    ids: ["jumeirah-village-circle", "dubai-hills-estate"],
  },
  {
    label: "Downtown vs Business Bay",
    ids: ["downtown-dubai", "business-bay"],
  },
  {
    label: "Arabian Ranches vs DAMAC Hills",
    ids: ["arabian-ranches", "damac-hills"],
  },
  {
    label: "Dubai Marina vs JBR",
    ids: ["dubai-marina", "jumeirah-beach-residence"],
  },
  {
    label: "Palm Jumeirah vs Emaar Beachfront",
    ids: ["palm-jumeirah", "emaar-beachfront"],
  },
];

/* ------------------------------------------------------------------ */
/*  Radar Chart                                                       */
/* ------------------------------------------------------------------ */

function RadarChart({
  items,
  scoresMap,
  resolved,
}: {
  items: Community[];
  scoresMap: Map<string, CommunityScores>;
  resolved: "dark" | "light";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tone = resolved === "light" ? "15,23,42" : "255,255,255";

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - 40;
    const axes = [
      "Investment",
      "Livability",
      "Connectivity",
      "Family",
      "Value",
      "Growth",
    ] as const;
    const keys: (keyof CommunityScores)[] = [
      "investment",
      "livability",
      "connectivity",
      "family",
      "value",
      "growth",
    ];

    ctx.clearRect(0, 0, w, h);

    for (let ring = 1; ring <= 5; ring++) {
      const r = (radius * ring) / 5;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(${tone},0.08)`;
      ctx.stroke();
    }

    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.strokeStyle = `rgba(${tone},0.12)`;
      ctx.stroke();

      const lx = cx + (radius + 22) * Math.cos(angle);
      const ly = cy + (radius + 22) * Math.sin(angle);
      ctx.fillStyle = `rgba(${tone},0.55)`;
      ctx.font = "11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(axes[i], lx, ly);
    }

    items.forEach((community, idx) => {
      const scores = scoresMap.get(community.id);
      if (!scores) return;

      ctx.beginPath();
      keys.forEach((key, i) => {
        const val = scores[key] / 10;
        const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
        const x = cx + radius * val * Math.cos(angle);
        const y = cy + radius * val * Math.sin(angle);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      const color = SWATCHES[idx] || SWATCHES[0];
      ctx.fillStyle = color + "25";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      keys.forEach((key, i) => {
        const val = scores[key] / 10;
        const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
        const x = cx + radius * val * Math.cos(angle);
        const y = cy + radius * val * Math.sin(angle);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });
    });
  }, [items, scoresMap, tone]);

  useEffect(() => {
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full aspect-square mx-auto"
      style={{ maxWidth: 420 }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Preference Weights                                                */
/* ------------------------------------------------------------------ */

const WEIGHT_KEYS = [
  { key: "investment" as const, label: "Investment" },
  { key: "livability" as const, label: "Livability" },
  { key: "connectivity" as const, label: "Connectivity" },
  { key: "family" as const, label: "Family-Friendliness" },
  { key: "value" as const, label: "Value for Money" },
  { key: "growth" as const, label: "Future Growth" },
];

type WeightKey = (typeof WEIGHT_KEYS)[number]["key"];
type Weights = Record<WeightKey, number>;

const DEFAULT_WEIGHTS: Weights = {
  investment: 5,
  livability: 5,
  connectivity: 5,
  family: 5,
  value: 5,
  growth: 5,
};

function computePersonalizedScore(
  scores: CommunityScores,
  weights: Weights,
): number {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return scores.overall;
  const weighted =
    WEIGHT_KEYS.reduce(
      (sum, { key }) => sum + scores[key] * weights[key],
      0,
    ) / totalWeight;
  return Math.round(weighted * 10) / 10;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export default function AreaComparisonApp({
  width,
  resolved,
  openApp,
}: NativeAppProps) {
  const [selections, setSelections] = useState<(string | null)[]>([null, null]);
  const [compared, setCompared] = useState<Community[]>([]);
  const [showThird, setShowThird] = useState(false);
  const [weights, setWeights] = useState<Weights>({ ...DEFAULT_WEIGHTS });
  const [view, setView] = useState<View>("compare");

  const scoresMap = useMemo(() => computeAllScores(communities), []);

  const canCompare = selections.filter((s) => s !== null).length >= 2;

  function handleSelect(index: number, id: string) {
    setSelections((prev) => {
      const next = [...prev];
      next[index] = id || null;
      return next;
    });
  }

  function handleCompare() {
    const selected = selections
      .filter((s): s is string => s !== null)
      .map((id) => communities.find((c) => c.id === id)!)
      .filter(Boolean);
    setCompared(selected);
    setView("compare");
  }

  function handlePopular(ids: string[]) {
    const next: (string | null)[] = [ids[0], ids[1], null];
    setShowThird(false);
    setSelections(next);
    const selected = ids
      .map((id) => communities.find((c) => c.id === id)!)
      .filter(Boolean);
    setCompared(selected);
    setView("compare");
  }

  function addThird() {
    setShowThird(true);
    setSelections((prev) => [...prev.slice(0, 2), null]);
  }

  function removeThird() {
    setShowThird(false);
    setSelections((prev) => prev.slice(0, 2));
    setCompared((prev) => prev.slice(0, 2));
  }

  function getWinnerLoser(
    metric: MetricRow,
    items: Community[],
  ): Map<string, "winner" | "loser" | "neutral"> {
    const result = new Map<string, "winner" | "loser" | "neutral">();
    if (!metric.getNumeric || metric.direction === "none") {
      items.forEach((c) => result.set(c.id, "neutral"));
      return result;
    }
    const values = items.map((c) => ({
      id: c.id,
      val: metric.getNumeric!(c, scoresMap.get(c.id)!),
    }));
    const nums = values.map((v) => v.val);
    const best =
      metric.direction === "high" ? Math.max(...nums) : Math.min(...nums);
    const worst =
      metric.direction === "high" ? Math.min(...nums) : Math.max(...nums);
    values.forEach(({ id, val }) => {
      if (val === best && best !== worst) result.set(id, "winner");
      else if (val === worst && best !== worst) result.set(id, "loser");
      else result.set(id, "neutral");
    });
    return result;
  }

  // Winner counts across all scorable metrics
  const winCounts = useMemo(() => {
    const counts = new Map<string, number>();
    compared.forEach((c) => counts.set(c.id, 0));
    if (compared.length < 2) return counts;
    METRICS.forEach((m) => {
      if (!m.getNumeric || m.direction === "none") return;
      const wl = getWinnerLoser(m, compared);
      wl.forEach((status, id) => {
        if (status === "winner") counts.set(id, (counts.get(id) ?? 0) + 1);
      });
    });
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compared, scoresMap]);

  const totalScorable = METRICS.filter(
    (m) => m.getNumeric && m.direction !== "none",
  ).length;

  const topWinner = useMemo(() => {
    if (compared.length < 2) return null;
    let bestId: string | null = null;
    let bestN = -1;
    winCounts.forEach((n, id) => {
      if (n > bestN) {
        bestN = n;
        bestId = id;
      }
    });
    const c = compared.find((x) => x.id === bestId);
    return c ? { community: c, wins: bestN } : null;
  }, [compared, winCounts]);

  const selectorCount = showThird ? 3 : 2;

  /* ------------------------------------------------------------------ */
  /*  Width-driven layouts (no sm:/md:/lg: prefixes)                    */
  /* ------------------------------------------------------------------ */

  // Picker slots: 1 col under 560, 2 cols under 820, 3 cols above.
  const pickerCols = width >= 820 ? 3 : width >= 560 ? 2 : 1;
  const pickerGridStyle = {
    gridTemplateColumns: `repeat(${pickerCols}, minmax(0, 1fr))`,
  };

  // Matchups grid: 1/2/3 cols.
  const matchupCols = width >= 880 ? 3 : width >= 600 ? 2 : 1;
  const matchupGridStyle = {
    gridTemplateColumns: `repeat(${matchupCols}, minmax(0, 1fr))`,
  };

  // Weights grid: 2/3/6 cols based on width.
  const weightCols = width >= 900 ? 6 : width >= 600 ? 3 : 2;
  const weightGridStyle = {
    gridTemplateColumns: `repeat(${weightCols}, minmax(0, 1fr))`,
  };

  // Comparison grid: first label column scales with width, then one
  // column per compared community.
  const labelCol = width >= 640 ? 200 : 160;
  const compareCount = Math.max(compared.length, 0);
  const compareGridStyle = {
    gridTemplateColumns:
      compareCount > 0
        ? `${labelCol}px ${"1fr ".repeat(compareCount).trim()}`
        : `${labelCol}px 1fr`,
  };

  const isMobile = width < 700;
  const compact = width < 640 || isMobile;
  const heroPadX = compact ? 16 : 24;
  const sectionPadX = compact ? 16 : 24;

  return (
    <div
      data-tool-theme="intelligence"
      data-tool="area-comparison"
      className="h-full w-full overflow-y-auto bg-app text-app"
    >
      {/* Hero */}
      <div className="border-b border-app">
        <div
          className="mx-auto pt-7 pb-9"
          style={{
            maxWidth: 1080,
            paddingLeft: heroPadX,
            paddingRight: heroPadX,
          }}
        >
          <div
            className="flex gap-4"
            style={{
              flexDirection: width >= 640 ? "row" : "column",
              alignItems: width >= 640 ? "flex-end" : "flex-start",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div className="inline-flex items-center gap-2 mb-3">
                <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                <span className="text-[0.6rem] uppercase tracking-[0.3em] text-tool-accent">
                  Versus Screen
                </span>
              </div>
              <h1
                className="font-tool-heading font-semibold text-app tracking-tight"
                style={{ fontSize: width >= 640 ? "2.25rem" : "1.875rem" }}
              >
                Area Comparison
              </h1>
              <p className="text-sm text-secondary mt-2">
                Pick 2–3 Dubai areas. Winners get highlighted per metric.
              </p>
            </div>

            {compared.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {compared.map((c, i) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-tool-accent-soft border border-app text-xs text-app"
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: SWATCHES[i] }}
                    />
                    {c.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* In-page tab strip */}
          <div className="mt-7 inline-flex p-1 rounded-xl bg-app-elevated border border-app gap-1">
            {VIEWS.map((v) => {
              const active = v.id === view;
              return (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={`px-4 ${isMobile ? "min-h-[44px] text-sm" : "py-2 text-xs"} rounded-lg font-medium uppercase tracking-[0.18em] transition-all ${
                    active
                      ? "bg-tool-accent text-white shadow-sm"
                      : "text-muted hover:text-app"
                  }`}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <section
        className="mx-auto pb-16 pt-7"
        style={{
          maxWidth: 1080,
          paddingLeft: sectionPadX,
          paddingRight: sectionPadX,
        }}
      >
        {/* Area picker */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
          className="rounded-2xl border border-app bg-app-elevated mb-6"
          style={{ padding: compact ? 20 : 24 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[0.65rem] uppercase tracking-[0.25em] text-muted">
              Pick Your Contenders
            </h2>
            <span className="text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent">
              {selections.filter(Boolean).length} / {selectorCount} selected
            </span>
          </div>

          <div className="grid gap-3 mb-4" style={pickerGridStyle}>
            {Array.from({ length: selectorCount }).map((_, i) => {
              const selectedId = selections[i];
              const c = selectedId
                ? communities.find((x) => x.id === selectedId)
                : null;
              return (
                <div
                  key={i}
                  className={`rounded-xl bg-app border border-app p-4 transition-all hover:ring-2 hover:ring-tool-accent ${
                    c ? "ring-1 ring-tool-accent/40" : ""
                  }`}
                >
                  <label className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.2em] text-muted mb-2">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: SWATCHES[i] }}
                    />
                    Slot {i + 1}
                  </label>
                  {c ? (
                    <div className="font-tool-heading text-lg font-semibold text-app mb-2">
                      {c.name}
                    </div>
                  ) : (
                    <div className="text-sm text-muted mb-2">
                      Choose an area
                    </div>
                  )}
                  <select
                    value={selections[i] || ""}
                    onChange={(e) => handleSelect(i, e.target.value)}
                    className={`w-full bg-app-elevated border border-app rounded-lg px-3 ${isMobile ? "min-h-[44px] text-base" : "py-2 text-sm"} text-app focus:outline-none focus:border-app-focus transition-colors cursor-pointer`}
                  >
                    <option value="">Select area…</option>
                    {sorted.map((community) => (
                      <option
                        key={community.id}
                        value={community.id}
                        disabled={
                          selections.includes(community.id) &&
                          selections[i] !== community.id
                        }
                      >
                        {community.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className={`flex items-center gap-3 ${isMobile ? "flex-col" : "flex-wrap"}`}>
            {!showThird ? (
              <button
                onClick={addThird}
                className={`px-4 ${isMobile ? "min-h-[44px] w-full text-sm" : "py-2 text-xs"} rounded-lg bg-tool-accent-soft border border-app font-medium text-tool-accent hover:bg-tool-accent hover:text-white transition-all`}
              >
                + Add Third Area
              </button>
            ) : (
              <button
                onClick={removeThird}
                className={`px-4 ${isMobile ? "min-h-[44px] w-full text-sm" : "py-2 text-xs"} rounded-lg border border-app font-medium text-muted hover:text-app transition-colors`}
              >
                Remove Third
              </button>
            )}

            {!isMobile && <div className="flex-1" />}

            <button
              onClick={handleCompare}
              disabled={!canCompare}
              className={`px-5 ${isMobile ? "min-h-[44px] w-full text-xs" : "py-2.5 text-xs"} rounded-lg font-semibold uppercase tracking-[0.2em] transition-all ${
                canCompare
                  ? "bg-tool-accent text-white hover:brightness-110"
                  : "bg-app-elevated border border-app text-muted cursor-not-allowed"
              }`}
            >
              Run Versus →
            </button>
          </div>
        </motion.div>

        {/* COMPARE VIEW */}
        {view === "compare" && (
          <>
            {/* Summary banner */}
            <AnimatePresence>
              {topWinner && compared.length >= 2 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease }}
                  className="rounded-2xl border border-app bg-tool-accent-soft p-5 mb-6 flex items-center justify-between gap-4 flex-wrap"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-tool-accent text-white font-bold">
                      W
                    </span>
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-tool-accent">
                        Leader
                      </div>
                      <div
                        className="text-app font-medium font-tool-heading"
                        style={{
                          fontSize: width >= 640 ? "1.125rem" : "1rem",
                        }}
                      >
                        <span className="text-tool-accent">
                          {topWinner.community.name}
                        </span>{" "}
                        wins {topWinner.wins} of {totalScorable} metrics
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.2em] text-muted">
                    <span className="h-px w-8 bg-tool-accent" />
                    Head-to-head
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Comparison grid */}
            <AnimatePresence mode="wait">
              {compared.length >= 2 && (
                <motion.div
                  key={compared.map((c) => c.id).join("-")}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.5, ease }}
                >
                  <div className="rounded-2xl border border-app bg-app-elevated overflow-hidden mb-6">
                    {/* Sticky column headers */}
                    <div
                      className="grid border-b border-app"
                      style={compareGridStyle}
                    >
                      <div className="p-4 text-[0.6rem] uppercase tracking-[0.25em] text-muted flex items-center">
                        Metric
                      </div>
                      {compared.map((c, i) => {
                        const wins = winCounts.get(c.id) ?? 0;
                        const isLeader =
                          topWinner && c.id === topWinner.community.id;
                        return (
                          <div
                            key={c.id}
                            className={`p-4 border-l border-app text-center relative ${
                              isLeader ? "bg-tool-accent-soft" : ""
                            }`}
                          >
                            {isLeader && (
                              <span className="absolute top-2 right-2 text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent font-bold">
                                Leader
                              </span>
                            )}
                            <div
                              className="font-tool-heading font-semibold text-app"
                              style={{
                                color: SWATCHES[i],
                                fontSize: width >= 640 ? "1rem" : "0.875rem",
                              }}
                            >
                              {c.name}
                            </div>
                            <div className="text-[0.65rem] uppercase tracking-[0.15em] text-muted mt-1">
                              {scoresMap.get(c.id)?.overall}/10 overall ·{" "}
                              <span className="text-tool-accent">
                                {wins} wins
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Radar chart */}
                    <div className="p-6 border-b border-app">
                      <div className="text-[0.6rem] uppercase tracking-[0.25em] text-muted mb-3 text-center">
                        Profile Shape
                      </div>
                      <RadarChart
                        items={compared}
                        scoresMap={scoresMap}
                        resolved={resolved}
                      />
                    </div>

                    {/* Grouped metric rows */}
                    {METRIC_GROUPS.map((group) => {
                      const rows = METRICS.filter((m) => m.group === group);
                      if (rows.length === 0) return null;
                      return (
                        <div key={group}>
                          {/* Group header */}
                          <div
                            className="grid bg-app border-b border-app"
                            style={compareGridStyle}
                          >
                            <div className="px-4 py-2.5 text-[0.6rem] uppercase tracking-[0.3em] text-tool-accent">
                              {group}
                            </div>
                            <div
                              className="border-l border-app"
                              style={{
                                gridColumn: `span ${compared.length} / span ${compared.length}`,
                              }}
                            />
                          </div>
                          {rows.map((metric, mIdx) => {
                            const wl = getWinnerLoser(metric, compared);
                            const striped = mIdx % 2 === 1;
                            return (
                              <div
                                key={metric.label}
                                className={`grid border-b border-app transition-colors ${
                                  striped ? "bg-app" : "bg-app-elevated"
                                }`}
                                style={compareGridStyle}
                              >
                                <div
                                  className="text-secondary flex items-center"
                                  style={{
                                    padding: compact ? 12 : 16,
                                    fontSize: compact ? "0.75rem" : "0.875rem",
                                  }}
                                >
                                  {metric.label}
                                </div>
                                {compared.map((c) => {
                                  const scores = scoresMap.get(c.id)!;
                                  const val = metric.getValue(c, scores);
                                  const status = wl.get(c.id) || "neutral";
                                  const isWinner = status === "winner";
                                  const isLoser = status === "loser";
                                  return (
                                    <div
                                      key={c.id}
                                      className={`border-l border-app text-center relative ${
                                        isWinner
                                          ? "bg-tool-accent-soft text-tool-accent font-semibold"
                                          : isLoser
                                            ? "text-muted"
                                            : "text-app"
                                      }`}
                                      style={{
                                        padding: compact ? 12 : 16,
                                        fontSize: compact
                                          ? "0.75rem"
                                          : "0.875rem",
                                      }}
                                    >
                                      <span className="relative inline-block">
                                        {val}
                                        {isWinner && (
                                          <span className="absolute -bottom-1 left-0 right-0 h-[2px] bg-tool-accent rounded-full" />
                                        )}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>

                  {/* Verdict */}
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2, ease }}
                    className="rounded-2xl border border-app bg-app-elevated p-5 mb-6"
                  >
                    <h3 className="text-[0.6rem] uppercase tracking-[0.25em] text-tool-accent mb-5">
                      Verdict
                    </h3>
                    <div className="space-y-4">
                      {(() => {
                        const investBest = [...compared].sort(
                          (a, b) =>
                            (scoresMap.get(b.id)?.investment ?? 0) -
                            (scoresMap.get(a.id)?.investment ?? 0),
                        )[0];
                        const familyBest = [...compared].sort(
                          (a, b) =>
                            (scoresMap.get(b.id)?.family ?? 0) -
                            (scoresMap.get(a.id)?.family ?? 0),
                        )[0];
                        const valueBest = [...compared].sort(
                          (a, b) =>
                            (scoresMap.get(b.id)?.value ?? 0) -
                            (scoresMap.get(a.id)?.value ?? 0),
                        )[0];
                        return (
                          <>
                            <div className="flex items-start gap-3">
                              <span className="mt-2 block h-px w-4 flex-shrink-0 bg-tool-accent" />
                              <div className="text-sm text-secondary">
                                <span className="text-app font-medium">
                                  For investment returns: {investBest.name}
                                </span>
                                {" — "}yields{" "}
                                {investBest.investment.rentalYieldPct.min}%–
                                {investBest.investment.rentalYieldPct.max}%,
                                3-year capital appreciation{" "}
                                {
                                  investBest.investment.capitalAppreciation3y
                                    .min
                                }
                                %–
                                {
                                  investBest.investment.capitalAppreciation3y
                                    .max
                                }
                                %.
                              </div>
                            </div>
                            <div className="flex items-start gap-3">
                              <span className="mt-2 block h-px w-4 flex-shrink-0 bg-tool-accent" />
                              <div className="text-sm text-secondary">
                                <span className="text-app font-medium">
                                  For families: {familyBest.name}
                                </span>
                                {" — "}
                                {familyBest.familyFriendliness.schools.length}{" "}
                                school
                                {familyBest.familyFriendliness.schools
                                  .length !== 1
                                  ? "s"
                                  : ""}
                                , {familyBest.livability.nearbyParks.length}{" "}
                                park
                                {familyBest.livability.nearbyParks.length !== 1
                                  ? "s"
                                  : ""}
                                , safety{" "}
                                {familyBest.livability.noiseLevel === "low"
                                  ? "excellent"
                                  : familyBest.livability.noiseLevel ===
                                      "moderate"
                                    ? "good"
                                    : "moderate"}
                                .
                              </div>
                            </div>
                            <div className="flex items-start gap-3">
                              <span className="mt-2 block h-px w-4 flex-shrink-0 bg-tool-accent" />
                              <div className="text-sm text-secondary">
                                <span className="text-app font-medium">
                                  For value: {valueBest.name}
                                </span>
                                {" — "}AED{" "}
                                {fmt(valueBest.pricing.pricePerSqft.min)}–
                                {fmt(valueBest.pricing.pricePerSqft.max)}/sqft
                                {compared.length > 1 &&
                                  compared.filter((c) => c.id !== valueBest.id)
                                    .length > 0 &&
                                  ` vs AED ${fmt(compared.filter((c) => c.id !== valueBest.id)[0].pricing.pricePerSqft.min)}–${fmt(compared.filter((c) => c.id !== valueBest.id)[0].pricing.pricePerSqft.max)}/sqft`}
                                .
                              </div>
                            </div>

                            {/* Cross-tool jumps — replaces ToolRecommendations */}
                            <div className="flex flex-wrap gap-2 pt-2">
                              <button
                                onClick={() =>
                                  openApp("neighborhood-report", {
                                    area: investBest.name,
                                  })
                                }
                                className="rounded-lg border border-app bg-app px-3 py-1.5 text-xs text-secondary hover:text-app hover:border-app-strong transition-colors"
                              >
                                Open report → {investBest.name}
                              </button>
                              <button
                                onClick={() =>
                                  openApp("yield-heatmap", {
                                    area: investBest.name,
                                  })
                                }
                                className="rounded-lg border border-app bg-app px-3 py-1.5 text-xs text-secondary hover:text-app hover:border-app-strong transition-colors"
                              >
                                Yield heatmap
                              </button>
                              <button
                                onClick={() =>
                                  openApp("service-charge-comparison", {
                                    area: valueBest.name,
                                  })
                                }
                                className="rounded-lg border border-app bg-app px-3 py-1.5 text-xs text-secondary hover:text-app hover:border-app-strong transition-colors"
                              >
                                Service charges
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {compared.length < 2 && (
              <div className="rounded-2xl border border-app bg-app-elevated p-12 text-center">
                <div className="text-sm text-muted">
                  Pick at least two areas above and hit{" "}
                  <span className="text-tool-accent font-medium">
                    Run Versus
                  </span>{" "}
                  to see the head-to-head.
                </div>
              </div>
            )}
          </>
        )}

        {/* WEIGHTS VIEW */}
        {view === "weights" && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease }}
            className="rounded-2xl border border-app bg-app-elevated p-5 mb-6"
          >
            <h3 className="text-[0.6rem] uppercase tracking-[0.25em] text-muted mb-4">
              Weight What Matters
            </h3>
            {compared.length < 2 ? (
              <div className="text-sm text-muted py-6 text-center">
                Run a comparison first to personalize the score.
              </div>
            ) : (
              <>
                <div
                  className="grid gap-x-6 gap-y-4"
                  style={weightGridStyle}
                >
                  {WEIGHT_KEYS.map(({ key, label }) => (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                          {label}
                        </span>
                        <span className="text-xs text-tool-accent tabular-nums w-4 text-right">
                          {weights[key]}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={1}
                        value={weights[key]}
                        onChange={(e) =>
                          setWeights((prev) => ({
                            ...prev,
                            [key]: Number(e.target.value),
                          }))
                        }
                        className="w-full h-1 appearance-none bg-app rounded-full cursor-pointer accent-violet-500"
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap gap-4 border-t border-app pt-4">
                  {compared.map((c, i) => {
                    const scores = scoresMap.get(c.id);
                    if (!scores) return null;
                    const ps = computePersonalizedScore(scores, weights);
                    return (
                      <div key={c.id} className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: SWATCHES[i] }}
                        />
                        <span className="text-sm text-secondary">{c.name}</span>
                        <span className="text-sm font-semibold text-tool-accent">
                          {ps}/10
                        </span>
                        <span className="text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                          personalized
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* POPULAR / MATCHUPS VIEW */}
        {view === "popular" && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease }}
          >
            <h2 className="text-[0.65rem] uppercase tracking-[0.25em] text-muted mb-4">
              Popular Matchups
            </h2>
            <div className="grid gap-3" style={matchupGridStyle}>
              {POPULAR.map((p) => (
                <button
                  key={p.label}
                  onClick={() => handlePopular(p.ids)}
                  className="text-left px-5 py-4 rounded-xl border border-app bg-app-elevated hover:bg-tool-accent-soft hover:ring-2 hover:ring-tool-accent transition-all group"
                >
                  <span className="font-tool-heading text-sm font-medium text-app group-hover:text-tool-accent transition-colors">
                    {p.label}
                  </span>
                  <span className="block text-[0.65rem] uppercase tracking-[0.15em] text-muted mt-1.5">
                    Click to compare →
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted mt-12 text-center">
          Data updated {DATA_UPDATED}
        </p>
      </section>
    </div>
  );
}
