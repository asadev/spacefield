"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

// Normal inverse CDF (approximation by Beasley-Springer-Moro / simplified Acklam)
function normInv(p: number): number {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number, r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) / ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
  } else if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5]) * q / (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) / ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
  }
}

function sampleSize(p1: number, mde: number, alpha: number, power: number): number {
  const p2 = p1 * (1 + mde);
  const zAlpha = normInv(1 - alpha / 2);
  const zBeta = normInv(power);
  const sd1 = Math.sqrt(2 * ((p1 + p2) / 2) * (1 - (p1 + p2) / 2));
  const sd2 = Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  const n = Math.pow(zAlpha * sd1 + zBeta * sd2, 2) / Math.pow(p2 - p1, 2);
  return Math.ceil(n);
}

type SubTab = "calc" | "curves" | "plan";

export default function AbTestSamplePage() {
  const [baseline, setBaseline] = useState("5");
  const [mde, setMde] = useState("10");
  const [confidence, setConfidence] = useState("95");
  const [power, setPower] = useState("80");
  const [dailyTraffic, setDailyTraffic] = useState("2000");
  const [trafficAllocation, setTrafficAllocation] = useState("100");
  const [tab, setTab] = useState<SubTab>("calc");

  const { perVariant, total, liftAbs, targetRate } = useMemo(() => {
    const p1 = (parseFloat(baseline) || 0) / 100;
    const m = (parseFloat(mde) || 0) / 100;
    const alpha = 1 - (parseFloat(confidence) || 95) / 100;
    const pwr = (parseFloat(power) || 80) / 100;
    if (p1 <= 0 || p1 >= 1 || m <= 0) {
      return { perVariant: 0, total: 0, liftAbs: 0, targetRate: p1 };
    }
    const n = sampleSize(p1, m, alpha, pwr);
    return {
      perVariant: n,
      total: n * 2,
      liftAbs: p1 * m,
      targetRate: p1 * (1 + m),
    };
  }, [baseline, mde, confidence, power]);

  const { daysToComplete, weeklyMdeTable } = useMemo(() => {
    const traffic = parseFloat(dailyTraffic) || 0;
    const alloc = (parseFloat(trafficAllocation) || 100) / 100;
    const usable = traffic * alloc;
    const days = usable > 0 ? total / usable : 0;
    const p1 = (parseFloat(baseline) || 0) / 100;
    const alpha = 1 - (parseFloat(confidence) || 95) / 100;
    const pwr = (parseFloat(power) || 80) / 100;
    const mdes = [5, 10, 15, 20, 30, 50];
    const rows = mdes.map((pct) => {
      if (p1 <= 0 || p1 >= 1) return { mde: pct, perVariant: 0, days: 0 };
      const n = sampleSize(p1, pct / 100, alpha, pwr);
      const d = usable > 0 ? (n * 2) / usable : 0;
      return { mde: pct, perVariant: n, days: d };
    });
    return { daysToComplete: days, weeklyMdeTable: rows };
  }, [total, dailyTraffic, trafficAllocation, baseline, confidence, power]);

  // Detection curve: at fixed N (= current perVariant), what MDE is detectable
  // across a sweep of sample sizes? Inverse problem — solved numerically.
  const curve = useMemo(() => {
    const p1 = (parseFloat(baseline) || 0) / 100;
    const alpha = 1 - (parseFloat(confidence) || 95) / 100;
    const pwr = (parseFloat(power) || 80) / 100;
    if (p1 <= 0 || p1 >= 1) return { points: [] as { n: number; mde: number }[], xMax: 1, yMax: 1 };
    // Sweep n from perVariant/8 .. perVariant*4
    const baseN = Math.max(perVariant, 500);
    const minN = Math.max(100, Math.floor(baseN / 8));
    const maxN = Math.ceil(baseN * 4);
    const points: { n: number; mde: number }[] = [];
    const STEPS = 36;
    for (let i = 0; i <= STEPS; i++) {
      const n = Math.round(minN + ((maxN - minN) * i) / STEPS);
      // Bisect for MDE that produces this n
      let lo = 0.001, hi = 2.0;
      for (let k = 0; k < 30; k++) {
        const mid = (lo + hi) / 2;
        const need = sampleSize(p1, mid, alpha, pwr);
        if (need > n) lo = mid; else hi = mid;
      }
      points.push({ n, mde: (lo + hi) / 2 });
    }
    return {
      points,
      xMax: maxN,
      yMax: Math.min(1.5, points[0]?.mde ?? 1),
    };
  }, [baseline, confidence, power, perVariant]);

  const alpha = 1 - (parseFloat(confidence) || 95) / 100;
  const beta = 1 - (parseFloat(power) || 80) / 100;

  return (
    <ToolShell
      category="Marketing"
      title="A/B Test Sample Size Calculator"
      description="Calculate required sample size per variant for a given baseline rate, minimum detectable effect, and confidence/power."
    >
      <div data-tool-theme="data" data-tool="ab-test-sample-size" className="space-y-5 text-app">
        {/* Console header strip */}
        <div className="tool-hero flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app bg-tool-surface px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-tool-accent-soft font-mono text-sm font-bold text-tool-accent">
              σ
            </div>
            <div>
              <div className="font-mono text-[0.65rem] uppercase tracking-[0.22em] text-tool-accent">
                statistics.power.calculator
              </div>
              <div className="text-sm font-semibold text-app">A/B Sample Size</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[0.65rem]">
            <span className="rounded-md border border-tool-accent/30 bg-tool-accent-soft px-2 py-1 text-tool-accent">
              two-tailed
            </span>
            <span className="rounded-md border border-tool-accent/30 bg-tool-accent-soft px-2 py-1 text-tool-accent">
              {confidence}% conf
            </span>
            <span className="rounded-md border border-tool-accent/30 bg-tool-accent-soft px-2 py-1 text-tool-accent">
              α={alpha.toFixed(3)}
            </span>
            <span className="rounded-md border border-tool-accent/30 bg-tool-accent-soft px-2 py-1 text-tool-accent">
              β={beta.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Sub-tabs (state buttons) */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              { k: "calc", label: "Calc" },
              { k: "curves", label: "Curves" },
              { k: "plan", label: "Plan" },
            ] as { k: SubTab; label: string }[]
          ).map(({ k, label }) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={
                "rounded-md border px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] transition " +
                (tab === k
                  ? "border-tool-accent/50 bg-tool-accent-soft text-tool-accent"
                  : "border-app bg-app-elevated text-muted hover:text-secondary")
              }
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "calc" && (
          <>
            {/* Hero: massive mono required-N */}
            <div className="tool-hero relative overflow-hidden rounded-2xl border border-app bg-tool-surface p-6 backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.25em] text-tool-accent">
                  &gt; compute(n)
                </div>
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.25em] text-muted">
                  samples.per.arm
                </div>
              </div>

              <div className="mt-4">
                <div className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
                  Required sample size per variant
                </div>
                <div className="mt-2 inline-block">
                  <div className="font-mono text-6xl font-bold tabular-nums tracking-tight text-app sm:text-7xl md:text-8xl">
                    {perVariant.toLocaleString()}
                  </div>
                  <div className="mt-1 h-[3px] w-full rounded-full bg-gradient-to-r from-tool-accent via-tool-accent/60 to-transparent" />
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3 border-t border-app pt-4">
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    total (A+B)
                  </div>
                  <div className="mt-1 font-mono text-lg tabular-nums text-app">
                    {total.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    target rate
                  </div>
                  <div className="mt-1 font-mono text-lg tabular-nums text-app">
                    {(targetRate * 100).toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    duration
                  </div>
                  <div className="mt-1 font-mono text-lg tabular-nums text-tool-accent">
                    {daysToComplete > 0
                      ? daysToComplete < 1
                        ? "<1d"
                        : `${daysToComplete.toFixed(1)}d`
                      : "—"}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-md border border-app bg-app p-3 font-mono text-[0.65rem] text-muted">
                <span className="text-tool-accent">//</span> absolute lift = {(liftAbs * 100).toFixed(2)} pp · detect{" "}
                {(parseFloat(mde) || 0).toFixed(1)}% relative improvement at {power}% power
              </div>
            </div>

            {/* Slider deck */}
            <div className="rounded-2xl border border-app bg-tool-surface p-5 backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.25em] text-tool-accent">
                  inputs.deck
                </div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  drag or type
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <SliderField
                  label="baseline_rate"
                  unit="%"
                  value={baseline}
                  onChange={setBaseline}
                  min={0.1}
                  max={50}
                  step={0.1}
                  hint="current control conversion rate"
                />
                <SliderField
                  label="min_detectable_effect"
                  unit="%"
                  value={mde}
                  onChange={setMde}
                  min={1}
                  max={100}
                  step={0.5}
                  hint="relative improvement you want to detect"
                />
                <SegmentField
                  label="confidence_level"
                  value={confidence}
                  onChange={setConfidence}
                  options={[
                    ["90", "90%"],
                    ["95", "95%"],
                    ["99", "99%"],
                  ]}
                />
                <SegmentField
                  label="statistical_power"
                  value={power}
                  onChange={setPower}
                  options={[
                    ["80", "80%"],
                    ["90", "90%"],
                    ["95", "95%"],
                  ]}
                />
                <SliderField
                  label="daily_traffic"
                  unit="v/d"
                  value={dailyTraffic}
                  onChange={setDailyTraffic}
                  min={0}
                  max={50000}
                  step={100}
                  hint="daily visitors to test surface"
                />
                <SliderField
                  label="traffic_allocation"
                  unit="%"
                  value={trafficAllocation}
                  onChange={setTrafficAllocation}
                  min={1}
                  max={100}
                  step={1}
                  hint="% of traffic opted into the test"
                />
              </div>
            </div>

            {/* Formula reference */}
            <div className="rounded-2xl border border-app bg-tool-surface p-5 backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.25em] text-tool-accent">
                  reference.tex
                </div>
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-rose-400/60" />
                  <span className="h-2 w-2 rounded-full bg-amber-400/60" />
                  <span className="h-2 w-2 rounded-full bg-emerald-400/60" />
                </div>
              </div>
              <div className="mt-4 grid gap-3 font-mono text-xs md:grid-cols-[1.2fr_1fr]">
                <div className="rounded-md border border-app bg-app p-3 leading-relaxed text-secondary">
                  <div className="text-tool-accent">n = </div>
                  <div className="pl-3">
                    [<span className="text-tool-accent">z</span><sub>α/2</sub>·√(2p̄q̄) +{" "}
                    <span className="text-tool-accent">z</span><sub>β</sub>·√(p₁q₁ + p₂q₂)]²
                  </div>
                  <div className="border-t border-app pl-3">(p₂ − p₁)²</div>
                </div>
                <div className="space-y-1 text-secondary">
                  <div>
                    <span className="text-tool-accent">p₁</span> ={" "}
                    {(parseFloat(baseline) / 100).toFixed(4)}{" "}
                    <span className="text-muted">baseline</span>
                  </div>
                  <div>
                    <span className="text-tool-accent">p₂</span> = {targetRate.toFixed(4)}{" "}
                    <span className="text-muted">target</span>
                  </div>
                  <div>
                    <span className="text-tool-accent">p̄</span> ={" "}
                    {((parseFloat(baseline) / 100 + targetRate) / 2).toFixed(4)}{" "}
                    <span className="text-muted">pooled</span>
                  </div>
                  <div>
                    <span className="text-tool-accent">z<sub>α/2</sub></span> ={" "}
                    {normInv(1 - alpha / 2).toFixed(3)}
                  </div>
                  <div>
                    <span className="text-tool-accent">z<sub>β</sub></span> ={" "}
                    {normInv((parseFloat(power) || 80) / 100).toFixed(3)}
                  </div>
                </div>
              </div>
              <p className="mt-4 border-t border-app pt-3 font-mono text-[0.6rem] leading-relaxed text-muted">
                Normal-approximation. Degrades at p&lt;1% or tiny MDEs — treat result as a lower
                bound.
              </p>
            </div>
          </>
        )}

        {tab === "curves" && (
          <div className="rounded-2xl border border-app bg-tool-surface p-5 backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.25em] text-tool-accent">
                detection.curve
              </div>
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                mde detectable @ N · α={alpha.toFixed(2)} · pwr={power}%
              </div>
            </div>

            <MdeCurveChart
              points={curve.points}
              currentN={perVariant}
              currentMde={(parseFloat(mde) || 0) / 100}
            />

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <CurveStat
                label="@ ½ N"
                sub={`${Math.round(perVariant / 2).toLocaleString()} samples`}
                value={
                  curve.points.length
                    ? `${(findMdeAt(curve.points, perVariant / 2) * 100).toFixed(1)}%`
                    : "—"
                }
              />
              <CurveStat
                label="@ N"
                sub={`${perVariant.toLocaleString()} samples`}
                value={`${(parseFloat(mde) || 0).toFixed(1)}%`}
                emphasized
              />
              <CurveStat
                label="@ 2× N"
                sub={`${(perVariant * 2).toLocaleString()} samples`}
                value={
                  curve.points.length
                    ? `${(findMdeAt(curve.points, perVariant * 2) * 100).toFixed(1)}%`
                    : "—"
                }
              />
            </div>

            <p className="mt-4 border-t border-app pt-3 font-mono text-[0.6rem] leading-relaxed text-muted">
              <span className="text-tool-accent">//</span> halving N roughly doubles the smallest
              detectable effect (n ∝ 1/MDE²). The curve flattens fast — diminishing returns.
            </p>
          </div>
        )}

        {tab === "plan" && (
          <div className="rounded-2xl border border-app bg-tool-surface p-5 backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.25em] text-tool-accent">
                sensitivity.scan
              </div>
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                days ~ mde⁻²
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-app bg-app">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="border-b border-app bg-tool-accent-soft text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    <th className="px-3 py-2 text-left">mde</th>
                    <th className="px-3 py-2 text-right">per_variant</th>
                    <th className="px-3 py-2 text-right">total</th>
                    <th className="px-3 py-2 text-right">days</th>
                    <th className="px-3 py-2 text-right">verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyMdeTable.map((r) => {
                    const color =
                      r.days > 0 && r.days < 28
                        ? "text-emerald-400"
                        : r.days < 56
                        ? "text-amber-400"
                        : "text-rose-400";
                    const verdict =
                      r.days <= 0
                        ? "—"
                        : r.days < 14
                        ? "fast"
                        : r.days < 28
                        ? "ok"
                        : r.days < 56
                        ? "slow"
                        : "unrealistic";
                    return (
                      <tr key={r.mde} className="border-t border-app hover:bg-tool-accent-soft">
                        <td className="px-3 py-2 text-app">{r.mde}%</td>
                        <td className="px-3 py-2 text-right tabular-nums text-secondary">
                          {r.perVariant.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-secondary">
                          {(r.perVariant * 2).toLocaleString()}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums font-semibold ${color}`}
                        >
                          {r.days > 0 ? (r.days < 1 ? "<1" : r.days.toFixed(0)) : "—"}
                        </td>
                        <td className={`px-3 py-2 text-right ${color}`}>{verdict}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_1fr]">
              <div className="rounded-md border border-amber-400/30 bg-amber-500/10 p-3 font-mono text-xs">
                <div className="mb-1 text-[0.55rem] uppercase tracking-[0.2em] text-amber-400">
                  // WARN: peeking
                </div>
                <p className="font-sans text-secondary">
                  Don&rsquo;t call the test early just because p&lt;0.05 at day 2. Every peek
                  inflates false positives. If you must peek, switch to mSPRT / Always Valid
                  Inference or adjust alpha for your peeks.
                </p>
              </div>
              <div className="rounded-md border border-app bg-app p-3 font-mono text-[0.65rem] leading-relaxed text-muted">
                <span className="text-tool-accent">refs:</span>
                <div className="mt-1">evanmiller.org/ab-testing</div>
                <div>optimizely.com/stats-engine</div>
                <div>Kohavi, Tang &amp; Xu 2020</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ToolShell>
  );
}

function findMdeAt(points: { n: number; mde: number }[], n: number): number {
  if (!points.length) return 0;
  let prev = points[0];
  for (const p of points) {
    if (p.n >= n) {
      const span = p.n - prev.n || 1;
      const t = (n - prev.n) / span;
      return prev.mde + (p.mde - prev.mde) * t;
    }
    prev = p;
  }
  return points[points.length - 1].mde;
}

function MdeCurveChart({
  points,
  currentN,
  currentMde,
}: {
  points: { n: number; mde: number }[];
  currentN: number;
  currentMde: number;
}) {
  const W = 600;
  const H = 220;
  const padL = 40;
  const padR = 12;
  const padT = 12;
  const padB = 28;

  if (points.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-md border border-app bg-app font-mono text-xs text-muted">
        adjust baseline_rate to see curve
      </div>
    );
  }

  const xMax = points[points.length - 1].n;
  const xMin = points[0].n;
  const yMax = Math.min(1.5, points[0].mde * 1.05);
  const xOf = (n: number) =>
    padL + ((W - padL - padR) * (n - xMin)) / Math.max(1, xMax - xMin);
  const yOf = (m: number) =>
    H - padB - ((H - padT - padB) * Math.min(yMax, m)) / yMax;

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.n).toFixed(1)} ${yOf(p.mde).toFixed(1)}`)
    .join(" ");

  // Area fill under the curve
  const area =
    `M ${xOf(points[0].n).toFixed(1)} ${(H - padB).toFixed(1)} ` +
    points.map((p) => `L ${xOf(p.n).toFixed(1)} ${yOf(p.mde).toFixed(1)}`).join(" ") +
    ` L ${xOf(points[points.length - 1].n).toFixed(1)} ${(H - padB).toFixed(1)} Z`;

  const cx = xOf(Math.max(xMin, Math.min(xMax, currentN)));
  const cy = yOf(Math.max(0, Math.min(yMax, currentMde)));

  // Y-axis ticks at fractions of yMax
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  // X-axis: 4 ticks
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => xMin + (xMax - xMin) * f);

  return (
    <div className="overflow-hidden rounded-md border border-app bg-app p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        {/* Grid */}
        {yTicks.map((t, i) => (
          <line
            key={`yg-${i}`}
            x1={padL}
            x2={W - padR}
            y1={yOf(t)}
            y2={yOf(t)}
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={1}
          />
        ))}
        {/* Area + line */}
        <path d={area} fill="var(--tool-accent)" fillOpacity={0.12} />
        <path
          d={path}
          fill="none"
          stroke="var(--tool-accent)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {/* Crosshair to current point */}
        <line
          x1={cx}
          x2={cx}
          y1={padT}
          y2={H - padB}
          stroke="var(--tool-accent)"
          strokeOpacity={0.4}
          strokeDasharray="3 3"
          strokeWidth={1}
        />
        <line
          x1={padL}
          x2={cx}
          y1={cy}
          y2={cy}
          stroke="var(--tool-accent)"
          strokeOpacity={0.4}
          strokeDasharray="3 3"
          strokeWidth={1}
        />
        <circle
          cx={cx}
          cy={cy}
          r={5}
          fill="var(--tool-accent)"
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeWidth={2}
        />
        {/* Y labels */}
        {yTicks.map((t, i) => (
          <text
            key={`yl-${i}`}
            x={padL - 6}
            y={yOf(t) + 3}
            textAnchor="end"
            fontFamily="ui-monospace, SFMono-Regular, monospace"
            fontSize={9}
            fill="currentColor"
            fillOpacity={0.55}
          >
            {(t * 100).toFixed(0)}%
          </text>
        ))}
        {/* X labels */}
        {xTicks.map((t, i) => (
          <text
            key={`xl-${i}`}
            x={xOf(t)}
            y={H - padB + 14}
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, monospace"
            fontSize={9}
            fill="currentColor"
            fillOpacity={0.55}
          >
            {t >= 1000 ? `${(t / 1000).toFixed(1)}k` : Math.round(t).toString()}
          </text>
        ))}
        {/* Axis labels */}
        <text
          x={W / 2}
          y={H - 4}
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, monospace"
          fontSize={9}
          fill="currentColor"
          fillOpacity={0.45}
        >
          samples per variant (N)
        </text>
        <text
          x={10}
          y={padT + 8}
          fontFamily="ui-monospace, SFMono-Regular, monospace"
          fontSize={9}
          fill="currentColor"
          fillOpacity={0.45}
        >
          MDE
        </text>
      </svg>
    </div>
  );
}

function CurveStat({
  label,
  sub,
  value,
  emphasized,
}: {
  label: string;
  sub: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={
        "rounded-md border p-3 " +
        (emphasized
          ? "border-tool-accent/50 bg-tool-accent-soft"
          : "border-app bg-app")
      }
    >
      <div className="flex items-baseline justify-between">
        <span
          className={
            "font-mono text-[0.6rem] uppercase tracking-[0.18em] " +
            (emphasized ? "text-tool-accent" : "text-muted")
          }
        >
          {label}
        </span>
        <span className="font-mono text-[0.55rem] text-muted">{sub}</span>
      </div>
      <div
        className={
          "mt-1 font-mono tabular-nums " +
          (emphasized
            ? "text-xl font-bold text-tool-accent"
            : "text-lg font-semibold text-app")
        }
      >
        {value}
      </div>
    </div>
  );
}

function SliderField({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  step,
  hint,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step: number;
  hint?: string;
}) {
  const numeric = parseFloat(value) || 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-tool-accent">
          {label}
        </label>
        <div className="flex items-center gap-1 font-mono text-xs">
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-20 rounded border border-app bg-app px-2 py-1 text-right tabular-nums text-app outline-none focus:border-app-focus focus:ring-1 ring-tool-accent"
            min={min}
            max={max}
            step={step}
          />
          <span className="text-muted">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        className="mt-3 w-full accent-tool-accent"
        value={numeric}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        step={step}
      />
      {hint && (
        <div className="mt-1 font-mono text-[0.6rem] text-muted">
          <span className="text-tool-accent/60">#</span> {hint}
        </div>
      )}
    </div>
  );
}

function SegmentField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div>
      <label className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-tool-accent">
        {label}
      </label>
      <div className="mt-2 flex gap-1.5 rounded-md border border-app bg-app p-1">
        {options.map(([v, lbl]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 rounded px-2 py-1.5 font-mono text-xs transition ${
              value === v
                ? "bg-tool-accent-soft text-tool-accent ring-1 ring-tool-accent"
                : "text-muted hover:text-secondary"
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}
