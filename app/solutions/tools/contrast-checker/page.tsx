"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, "");
  if (![3, 6].includes(h.length)) return null;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      case b:
        h = ((r - g) / d + 4) * 60;
        break;
    }
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hh >= 0 && hh < 1) { r1 = c; g1 = x; b1 = 0; }
  else if (hh < 2) { r1 = x; g1 = c; b1 = 0; }
  else if (hh < 3) { r1 = 0; g1 = c; b1 = x; }
  else if (hh < 4) { r1 = 0; g1 = x; b1 = c; }
  else if (hh < 5) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  const m = l - c / 2;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

function relLuminance(r: number, g: number, b: number): number {
  const srgb = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const L1 = relLuminance(...a);
  const L2 = relLuminance(...b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

// APCA (Accessible Perceptual Contrast Algorithm) — WCAG 3 candidate.
// Reference implementation: github.com/Myndex/SAPC-APCA (MIT).
// This is a simplified port that returns the Lc value (-108 to +106).
function apca(fg: [number, number, number], bg: [number, number, number]): number {
  const mainTRC = 2.4;
  const normBG = 0.56;
  const normTXT = 0.57;
  const revTXT = 0.62;
  const revBG = 0.65;
  const blkThrs = 0.022;
  const blkClmp = 1.414;
  const scaleBoW = 1.14;
  const loBoWoffset = 0.027;
  const scaleWoB = 1.14;
  const loWoBoffset = 0.027;
  const deltaYmin = 0.0005;

  function sRGBtoY(rgb: [number, number, number]): number {
    const sR = Math.pow(rgb[0] / 255, mainTRC);
    const sG = Math.pow(rgb[1] / 255, mainTRC);
    const sB = Math.pow(rgb[2] / 255, mainTRC);
    return 0.2126729 * sR + 0.7151522 * sG + 0.0721750 * sB;
  }

  let txtY = sRGBtoY(fg);
  let bgY = sRGBtoY(bg);
  if (txtY < blkThrs) txtY = txtY + Math.pow(blkThrs - txtY, blkClmp);
  if (bgY < blkThrs) bgY = bgY + Math.pow(blkThrs - bgY, blkClmp);
  if (Math.abs(bgY - txtY) < deltaYmin) return 0;
  let out: number;
  if (bgY > txtY) {
    const c = (Math.pow(bgY, normBG) - Math.pow(txtY, normTXT)) * scaleBoW;
    out = c < loBoWoffset ? 0 : (c - loBoWoffset) * 100;
  } else {
    const c = (Math.pow(bgY, revBG) - Math.pow(txtY, revTXT)) * scaleWoB;
    out = c > -loWoBoffset ? 0 : (c + loWoBoffset) * 100;
  }
  return out;
}

// Color-blindness simulation matrices (Brettel/Viénot + Machado), common approximations.
function simulate(rgb: [number, number, number], kind: "deut" | "prot" | "trit"): [number, number, number] {
  const [r, g, b] = rgb;
  let nr = r, ng = g, nb = b;
  if (kind === "deut") {
    nr = 0.625 * r + 0.375 * g;
    ng = 0.70 * r + 0.30 * g;
    nb = 0.30 * g + 0.70 * b;
  } else if (kind === "prot") {
    nr = 0.567 * r + 0.433 * g;
    ng = 0.558 * r + 0.442 * g;
    nb = 0.242 * g + 0.758 * b;
  } else if (kind === "trit") {
    nr = 0.95 * r + 0.05 * g;
    ng = 0.433 * g + 0.567 * b;
    nb = 0.475 * g + 0.525 * b;
  }
  return [Math.round(nr), Math.round(ng), Math.round(nb)];
}

function findNearestPassing(
  fgRgb: [number, number, number],
  bgRgb: [number, number, number],
  targetRatio: number
): [number, number, number] | null {
  const [h, s] = rgbToHsl(...fgRgb);
  const [, , startL] = rgbToHsl(...fgRgb);
  // Search both up and down in lightness and pick the closest passing shade.
  let best: { rgb: [number, number, number]; delta: number } | null = null;
  for (let delta = 0; delta <= 1; delta += 0.01) {
    for (const dir of [-1, 1]) {
      const l = Math.min(1, Math.max(0, startL + dir * delta));
      const candRgb = hslToRgb(h, s, l);
      const ratio = contrastRatio(candRgb, bgRgb);
      if (ratio >= targetRatio) {
        const d = Math.abs(l - startL);
        if (!best || d < best.delta) {
          best = { rgb: candRgb, delta: d };
        }
      }
    }
    if (best) break;
  }
  return best?.rgb ?? null;
}

export default function ContrastCheckerPage() {
  const [fgHex, setFgHex] = useState("#0f766e");
  const [bgHex, setBgHex] = useState("#ffffff");

  const fgRgb = useMemo<[number, number, number]>(
    () => hexToRgb(fgHex) ?? [0, 0, 0],
    [fgHex]
  );
  const bgRgb = useMemo<[number, number, number]>(
    () => hexToRgb(bgHex) ?? [255, 255, 255],
    [bgHex]
  );
  const ratio = useMemo(() => contrastRatio(fgRgb, bgRgb), [fgRgb, bgRgb]);
  const ratioStr = ratio.toFixed(2);

  const checks = {
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
    uiComponents: ratio >= 3,
  };

  const [h, s, lRaw] = rgbToHsl(...fgRgb);
  const [lightness, setLightness] = useState<number | null>(null);
  const currentL = lightness === null ? lRaw : lightness;
  const adjustedRgb = useMemo(() => hslToRgb(h, s, currentL), [h, s, currentL]);
  const adjustedHex = rgbToHex(...adjustedRgb);
  const adjustedRatio = contrastRatio(adjustedRgb, bgRgb);

  const suggestedAA = useMemo(() => findNearestPassing(fgRgb, bgRgb, 4.5), [fgRgb, bgRgb]);
  const suggestedAAA = useMemo(() => findNearestPassing(fgRgb, bgRgb, 7), [fgRgb, bgRgb]);

  const apcaLc = useMemo(() => apca(fgRgb, bgRgb), [fgRgb, bgRgb]);
  const apcaVerdict = (lc: number) => {
    const abs = Math.abs(lc);
    if (abs >= 75) return "Fluent body text";
    if (abs >= 60) return "Readable body";
    if (abs >= 45) return "Readable content";
    if (abs >= 30) return "Large text only";
    if (abs >= 15) return "Non-content UI only";
    return "Insufficient";
  };
  const apcaLabel = apcaVerdict(apcaLc);
  const apcaPass = Math.abs(apcaLc) >= 60;

  // Colour-blindness simulations
  const deut = simulate(fgRgb, "deut");
  const prot = simulate(fgRgb, "prot");
  const trit = simulate(fgRgb, "trit");
  const deutBg = simulate(bgRgb, "deut");
  const protBg = simulate(bgRgb, "prot");
  const tritBg = simulate(bgRgb, "trit");

  const swap = () => {
    setFgHex(bgHex);
    setBgHex(fgHex);
    setLightness(null);
  };

  const resetSlider = () => setLightness(null);

  const verdictLabel =
    ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA Large" : "Fail";
  const overallPass = ratio >= 4.5;

  // Ratio bar — 0..21 mapped, marker for current.
  const RATIO_MAX = 21;
  const ratioPct = Math.min(1, ratio / RATIO_MAX);

  return (
    <div data-tool-theme="design" data-tool="contrast-checker">
      <ToolShell
        category="Design & Creative"
        title="Contrast Checker"
        description="Test WCAG AA and AAA contrast for text and UI components. Adjust the foreground lightness to find the nearest passing shade."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — verdict + swatches */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${
                overallPass
                  ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                  : ratio >= 3
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-500"
                    : "border-rose-500/40 bg-rose-500/15 text-rose-500"
              }`}
            >
              {verdictLabel}
            </span>
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              {ratioStr}:1
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              wcag.contrast
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {fgHex.toLowerCase()}-on-{bgHex.toLowerCase()}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm border border-app"
                style={{ backgroundColor: fgHex }}
              />
              <span
                className="inline-block h-3 w-3 rounded-sm border border-app"
                style={{ backgroundColor: bgHex }}
              />
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Design · Accessibility · WCAG 2 + APCA
                </div>

                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                  Contrast Checker
                </h1>
                <p className="mt-1 max-w-xl text-sm text-secondary">
                  WCAG 2 ratio, WCAG 3 perceptual contrast, and colour-blind simulation in one view.
                </p>
              </div>

              {/* Big ratio readout */}
              <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-4 py-3">
                <div className="font-mono text-4xl font-semibold tabular-nums leading-none tracking-tight text-app">
                  {ratioStr}
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Contrast ratio
                  </div>
                  <div className="text-sm font-semibold text-app">
                    {verdictLabel}
                  </div>
                </div>
              </div>
            </div>

            {/* Ratio scale bar */}
            <div className="mt-5">
              <div className="mb-1.5 flex items-center justify-between font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                <span>1:1</span>
                <span>3</span>
                <span>4.5</span>
                <span>7</span>
                <span>21:1</span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full border border-app bg-app">
                {/* threshold ticks */}
                {[3, 4.5, 7].map((t) => (
                  <span
                    key={t}
                    className="absolute top-0 h-full w-px bg-app"
                    style={{ left: `${(t / RATIO_MAX) * 100}%` }}
                  />
                ))}
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-tool-accent transition-all"
                  style={{ width: `${ratioPct * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* sub-action strip */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <span className="rounded-lg border border-app bg-app-elevated px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {overallPass ? "Use freely" : ratio >= 3 ? "Large text only" : "Don't ship"}
            </span>
            <span
              className={`rounded-lg border px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] ${
                apcaPass
                  ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                  : "border-app bg-app-elevated text-secondary"
              }`}
            >
              APCA Lc {apcaLc.toFixed(1)}
            </span>
            <span className="rounded-lg border border-app bg-app-elevated px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              {apcaLabel}
            </span>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={swap}
                className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
              >
                ↔ Swap fg / bg
              </button>
            </div>
          </div>
        </section>

        {/* WCAG conformance grid */}
        <ToolCard
          title="WCAG 2 conformance"
          subtitle="Pass / fail at each threshold"
          className="mb-6"
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { k: "aaNormal", label: "AA · Normal text", req: "4.5:1" },
              { k: "aaLarge", label: "AA · Large text", req: "3:1" },
              { k: "aaaNormal", label: "AAA · Normal text", req: "7:1" },
              { k: "aaaLarge", label: "AAA · Large text", req: "4.5:1" },
              { k: "uiComponents", label: "UI components", req: "3:1" },
            ].map(({ k, label, req }) => {
              const pass = (checks as Record<string, boolean>)[k];
              return (
                <div
                  key={k}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-xs ${
                    pass
                      ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                      : "border-app bg-app-elevated text-secondary"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        pass ? "bg-tool-accent" : "bg-faint"
                      }`}
                    />
                    <span className="font-medium">{label}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-[0.6rem] opacity-70">{req}</span>
                    <span className="text-[0.65rem] uppercase tracking-wider">
                      {pass ? "pass" : "fail"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </ToolCard>

        {/* Inputs + sample */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.3fr]">
          {/* Color pickers */}
          <ToolCard title="Colours" subtitle="Foreground · Background">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Foreground", value: fgHex, set: (v: string) => { setFgHex(v); setLightness(null); } },
                { label: "Background", value: bgHex, set: (v: string) => setBgHex(v) },
              ].map(({ label, value, set }) => (
                <Field key={label} label={label}>
                  <div className="relative overflow-hidden rounded-lg border border-app">
                    <div
                      className="h-16 w-full"
                      style={{ backgroundColor: value }}
                    />
                    <input
                      type="color"
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      aria-label={`${label} colour picker`}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </div>
                  <input
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    className={`${inputCls("mt-2 font-mono text-[0.78rem] tabular-nums")}`}
                    spellCheck={false}
                  />
                </Field>
              ))}
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                <span>Adjust foreground lightness</span>
                <button
                  onClick={resetSlider}
                  className="font-mono text-[0.55rem] text-faint transition-colors hover:text-tool-accent"
                >
                  reset
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={currentL}
                onChange={(e) => setLightness(parseFloat(e.target.value))}
                className="w-full accent-tool-accent"
              />
              <div className="mt-2 flex items-center justify-between font-mono text-[0.7rem]">
                <span className="text-secondary">
                  {adjustedHex.toUpperCase()}
                </span>
                <span
                  className={`tabular-nums ${
                    adjustedRatio >= 4.5
                      ? "text-tool-accent"
                      : adjustedRatio >= 3
                        ? "text-amber-500"
                        : "text-rose-500"
                  }`}
                >
                  {adjustedRatio.toFixed(2)}:1
                </span>
              </div>
            </div>

            {(suggestedAA || suggestedAAA) && (
              <div className="mt-6 space-y-2">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  Nearest passing shades
                </div>
                {suggestedAA && suggestedAA.join(",") !== fgRgb.join(",") && (
                  <button
                    onClick={() => {
                      setFgHex(rgbToHex(...suggestedAA));
                      setLightness(null);
                    }}
                    className="flex w-full items-center justify-between rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-2 font-mono text-xs text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-sm border border-app"
                        style={{ backgroundColor: rgbToHex(...suggestedAA) }}
                      />
                      Snap to AA · 4.5:1
                    </span>
                    <span className="tabular-nums">{rgbToHex(...suggestedAA).toUpperCase()}</span>
                  </button>
                )}
                {suggestedAAA && suggestedAAA.join(",") !== fgRgb.join(",") && (
                  <button
                    onClick={() => {
                      setFgHex(rgbToHex(...suggestedAAA));
                      setLightness(null);
                    }}
                    className="flex w-full items-center justify-between rounded-lg border border-app bg-app-elevated px-3 py-2 font-mono text-xs text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-sm border border-app"
                        style={{ backgroundColor: rgbToHex(...suggestedAAA) }}
                      />
                      Snap to AAA · 7:1
                    </span>
                    <span className="tabular-nums">{rgbToHex(...suggestedAAA).toUpperCase()}</span>
                  </button>
                )}
              </div>
            )}
          </ToolCard>

          {/* Sample text preview */}
          <ToolCard title="Live preview" subtitle="Sample type · Multiple sizes">
            <div className="overflow-hidden rounded-xl border border-app">
              <div
                className="space-y-5 p-7"
                style={{ backgroundColor: bgHex, color: fgHex }}
              >
                <div className="flex items-baseline justify-between">
                  <div className="text-[0.55rem] font-mono uppercase tracking-[0.22em] opacity-60">
                    Display · 32 / bold
                  </div>
                  <div className="font-mono text-[0.55rem] tabular-nums opacity-60">
                    {ratioStr}:1
                  </div>
                </div>
                <div className="text-3xl font-bold leading-tight" style={{ color: fgHex }}>
                  Design that everyone can read.
                </div>
                <div className="text-xl font-semibold" style={{ color: fgHex }}>
                  Headline copy at twenty pixels reads here.
                </div>
                <div className="text-base leading-relaxed" style={{ color: fgHex }}>
                  Body text at base size. The quick brown fox jumps over the lazy dog. Contrast
                  drives whether someone finishes a paragraph or bounces.
                </div>
                <div className="text-sm" style={{ color: fgHex }}>
                  Small text · captions, footnotes, legal disclaimers, helper text.
                </div>
                <div className="text-xs uppercase tracking-[0.18em]" style={{ color: fgHex }}>
                  Eyebrow · 12px uppercase
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    className="rounded-lg px-4 py-2 text-sm font-semibold"
                    style={{ backgroundColor: fgHex, color: bgHex }}
                  >
                    Primary action
                  </button>
                  <button
                    className="rounded-lg border-2 px-4 py-2 text-sm font-semibold"
                    style={{ borderColor: fgHex, color: fgHex }}
                  >
                    Secondary
                  </button>
                  <span className="text-sm underline underline-offset-2" style={{ color: fgHex }}>
                    Inline link
                  </span>
                </div>
              </div>
            </div>

            {/* Colour-blindness simulation */}
            <div className="mt-5">
              <div className="mb-2 flex items-baseline justify-between">
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                  Colour-blindness simulation
                </div>
                <div className="font-mono text-[0.55rem] text-faint">
                  ~8% of men · ~0.5% of women
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Deuteranopia", fg: deut, bg: deutBg, note: "red-green · most common" },
                  { label: "Protanopia", fg: prot, bg: protBg, note: "red-green" },
                  { label: "Tritanopia", fg: trit, bg: tritBg, note: "blue-yellow" },
                ].map((x) => {
                  const r = contrastRatio(x.fg, x.bg);
                  return (
                    <div
                      key={x.label}
                      className="overflow-hidden rounded-xl border border-app bg-app-elevated"
                    >
                      <div
                        className="flex items-center justify-center p-4 text-2xl font-bold"
                        style={{
                          backgroundColor: rgbToHex(...x.bg),
                          color: rgbToHex(...x.fg),
                        }}
                      >
                        Aa
                      </div>
                      <div className="border-t border-app p-2 text-[0.6rem]">
                        <div className="font-medium text-app">
                          {x.label}
                        </div>
                        <div className="text-muted">{x.note}</div>
                        <div className="mt-1 font-mono tabular-nums text-tool-accent">
                          {r.toFixed(2)}:1
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ToolCard>
        </div>

        <p className="mt-6 text-[0.65rem] leading-relaxed text-muted">
          WCAG 2 ratio range is 1:1 (no contrast) to 21:1 (black on white). AA needs 4.5:1 for
          normal text and 3:1 for large or UI; AAA pushes to 7:1. APCA (WCAG 3 candidate) measures
          perceived contrast — Lc 60+ is comfortable body text.
        </p>
      </ToolShell>
    </div>
  );
}
