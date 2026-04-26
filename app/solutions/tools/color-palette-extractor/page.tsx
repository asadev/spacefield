"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";

type Swatch = { r: number; g: number; b: number; weight: number };

type ExportFmt = "css" | "tailwind" | "scss" | "figma" | "json";
type Harmony = "complementary" | "analogous" | "triadic" | "tetradic" | "monochromatic";

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
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
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

// K-means clustering on a downsampled image buffer.
function kmeans(
  pixels: Uint8ClampedArray,
  k: number,
  iterations = 12
): Swatch[] {
  const n = pixels.length / 4;
  if (n === 0) return [];

  // Init: pick k pixels with even stride.
  const centers: [number, number, number][] = [];
  const step = Math.max(1, Math.floor(n / k));
  for (let i = 0; i < k; i++) {
    const idx = (i * step) % n;
    centers.push([pixels[idx * 4], pixels[idx * 4 + 1], pixels[idx * 4 + 2]]);
  }

  const assignments = new Uint16Array(n);

  for (let it = 0; it < iterations; it++) {
    // assign
    for (let i = 0; i < n; i++) {
      const r = pixels[i * 4];
      const g = pixels[i * 4 + 1];
      const b = pixels[i * 4 + 2];
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const dr = r - centers[c][0];
        const dg = g - centers[c][1];
        const db = b - centers[c][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assignments[i] = best;
    }
    // update
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      sums[c][0] += pixels[i * 4];
      sums[c][1] += pixels[i * 4 + 1];
      sums[c][2] += pixels[i * 4 + 2];
      sums[c][3] += 1;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][3] > 0) {
        centers[c] = [
          Math.round(sums[c][0] / sums[c][3]),
          Math.round(sums[c][1] / sums[c][3]),
          Math.round(sums[c][2] / sums[c][3]),
        ];
      }
    }
  }

  // Count final weights
  const counts = new Array(k).fill(0);
  for (let i = 0; i < n; i++) counts[assignments[i]]++;

  const swatches: Swatch[] = centers.map((c, i) => ({
    r: c[0],
    g: c[1],
    b: c[2],
    weight: counts[i] / n,
  }));

  return swatches.sort((a, b) => b.weight - a.weight);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * (l / 100) - 1)) * (s / 100);
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l / 100 - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (hh < 60) { r1 = c; g1 = x; }
  else if (hh < 120) { r1 = x; g1 = c; }
  else if (hh < 180) { g1 = c; b1 = x; }
  else if (hh < 240) { g1 = x; b1 = c; }
  else if (hh < 300) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

function generateHarmony(base: Swatch, kind: Harmony): Swatch[] {
  const [h, s, l] = rgbToHsl(base.r, base.g, base.b);
  const mk = (hh: number, ll = l, ss = s): Swatch => {
    const [r, g, b] = hslToRgb(hh, ss, ll);
    return { r, g, b, weight: 0 };
  };
  switch (kind) {
    case "complementary":
      return [base, mk(h + 180)];
    case "analogous":
      return [mk(h - 30), base, mk(h + 30)];
    case "triadic":
      return [base, mk(h + 120), mk(h + 240)];
    case "tetradic":
      return [base, mk(h + 90), mk(h + 180), mk(h + 270)];
    case "monochromatic":
      return [mk(h, Math.max(5, l - 30), s), mk(h, Math.max(5, l - 15), s), base, mk(h, Math.min(95, l + 15), s), mk(h, Math.min(95, l + 30), s)];
  }
}

function formatCss(swatches: Swatch[]): string {
  return `:root {\n${swatches
    .map((s, i) => `  --color-${i + 1}: ${rgbToHex(s.r, s.g, s.b)};`)
    .join("\n")}\n}`;
}

function formatTailwind(swatches: Swatch[]): string {
  const v3 = swatches.map((s, i) => `        brand${i + 1}: "${rgbToHex(s.r, s.g, s.b)}",`).join("\n");
  const v4 = swatches.map((s, i) => `  --color-brand-${i + 1}: ${rgbToHex(s.r, s.g, s.b)};`).join("\n");
  return `/* Tailwind v3 — tailwind.config.js */\nmodule.exports = {\n  theme: {\n    extend: {\n      colors: {\n${v3}\n      }\n    }\n  }\n};\n\n/* Tailwind v4 — @theme in CSS */\n@theme {\n${v4}\n}`;
}

function formatScss(swatches: Swatch[]): string {
  return swatches.map((s, i) => `$brand-${i + 1}: ${rgbToHex(s.r, s.g, s.b)};`).join("\n");
}

function formatFigmaTokens(swatches: Swatch[]): string {
  // Figma tokens plugin / W3C design-tokens schema
  const tokens: Record<string, { $type: string; $value: string }> = {};
  swatches.forEach((s, i) => {
    tokens[`brand${i + 1}`] = { $type: "color", $value: rgbToHex(s.r, s.g, s.b) };
  });
  return JSON.stringify({ palette: tokens }, null, 2);
}

function formatJson(swatches: Swatch[]): string {
  return JSON.stringify(
    swatches.map((s) => {
      const hex = rgbToHex(s.r, s.g, s.b);
      const [h, sat, l] = rgbToHsl(s.r, s.g, s.b);
      return {
        hex,
        rgb: { r: s.r, g: s.g, b: s.b },
        hsl: { h, s: sat, l },
        weight: Number(s.weight.toFixed(3)),
      };
    }),
    null,
    2
  );
}

export default function ColorPaletteExtractorPage() {
  const [k, setK] = useState(8);
  const [swatches, setSwatches] = useState<Swatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [exportFmt, setExportFmt] = useState<ExportFmt>("css");
  const [harmony, setHarmony] = useState<Harmony | null>(null);
  const [harmonyBase, setHarmonyBase] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const extractFromImage = useCallback(
    async (src: string) => {
      setBusy(true);
      setError(null);
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        const loaded = new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Failed to load image (check CORS for remote URLs)"));
        });
        img.src = src;
        await loaded;

        // Downsample to max 200px on the longer side for speed.
        const maxSide = 200;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.floor(img.width * scale));
        const h = Math.max(1, Math.floor(img.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas unavailable");
        ctx.drawImage(img, 0, 0, w, h);
        let imageData: ImageData;
        try {
          imageData = ctx.getImageData(0, 0, w, h);
        } catch {
          throw new Error("Canvas is tainted by CORS — try uploading the image directly");
        }

        // Filter mostly-transparent pixels.
        const buf = imageData.data;
        const opaque: number[] = [];
        for (let i = 0; i < buf.length; i += 4) {
          if (buf[i + 3] >= 200) {
            opaque.push(buf[i], buf[i + 1], buf[i + 2], 255);
          }
        }
        const pixels = new Uint8ClampedArray(opaque);
        const result = kmeans(pixels, Math.max(3, Math.min(16, k)));
        setSwatches(result);
        setImgSrc(src);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [k]
  );

  const onFile = (f: File | null) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") extractFromImage(reader.result);
    };
    reader.readAsDataURL(f);
  };

  const onUrl = () => {
    if (!urlInput.trim()) return;
    extractFromImage(urlInput.trim());
  };

  const exportSwatches = useMemo(() => {
    if (!harmony || swatches.length === 0) return swatches;
    const base = swatches[Math.min(harmonyBase, swatches.length - 1)];
    return generateHarmony(base, harmony);
  }, [swatches, harmony, harmonyBase]);

  const exportText = () => {
    const sw = exportSwatches;
    if (sw.length === 0) return "";
    switch (exportFmt) {
      case "css": return formatCss(sw);
      case "tailwind": return formatTailwind(sw);
      case "scss": return formatScss(sw);
      case "figma": return formatFigmaTokens(sw);
      case "json": return formatJson(sw);
    }
  };

  const topFive = swatches.slice(0, 5);
  const dominant = swatches[0];
  const accents = swatches.slice(1, 5);

  return (
    <div data-tool-theme="design" data-tool="color-palette-extractor">
      <ToolShell
        category="Design & Creative"
        title="Color Palette Extractor"
        description="Upload an image and pull dominant colors via k-means clustering. Runs entirely in your browser on canvas."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              k-means
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              k:{k}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              palette.extract
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {imgSrc ? `${swatches.length}sw.image` : "no.source"}
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              {busy ? "◉ extracting" : swatches.length > 0 ? "◉ ready" : ""}
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Image · Color Quantization · Browser Canvas
                </div>

                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                  Pull a brand palette from any image
                </h2>
                <p className="mt-1.5 max-w-xl text-sm text-secondary">
                  Drop a photo, screenshot, or moodboard. K-means clusters the pixels and surfaces the dominant tones with hex, RGB, and HSL.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {swatches.length} swatch{swatches.length === 1 ? "" : "es"}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    200px sample
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    12 iterations
                  </span>
                </div>
              </div>

              {/* mini palette preview */}
              {topFive.length > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
                  <div className="flex overflow-hidden rounded-lg border border-app">
                    {topFive.map((s, i) => (
                      <div
                        key={i}
                        className="h-12 w-6"
                        style={{ backgroundColor: rgbToHex(s.r, s.g, s.b) }}
                        title={rgbToHex(s.r, s.g, s.b)}
                      />
                    ))}
                  </div>
                  <div>
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                      Top swatches
                    </div>
                    <div className="text-sm font-semibold text-app">
                      {topFive.length} of {swatches.length}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* =========== INPUT ROW: drop zone + source controls =========== */}
        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          {/* Drop-zone / preview */}
          <ToolCard title="Source image" subtitle="Drop a file or load by URL">
            <label
              htmlFor="cpe-file"
              className="group relative flex aspect-[16/10] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-app bg-app-elevated transition-colors hover:border-tool-accent"
            >
              {imgSrc ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imgSrc}
                    alt="Source"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {/* Extracted overlay strip — preserves true colors */}
                  {topFive.length > 0 && (
                    <div className="absolute inset-x-3 bottom-3 flex h-12 overflow-hidden rounded-lg border border-app shadow-lg">
                      {topFive.map((s, i) => (
                        <div
                          key={i}
                          className="flex flex-1 items-end justify-center pb-1 font-mono text-[0.55rem] text-white"
                          style={{
                            backgroundColor: rgbToHex(s.r, s.g, s.b),
                            textShadow: "0 1px 2px rgba(0,0,0,0.7)",
                          }}
                        >
                          {(s.weight * 100).toFixed(0)}%
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="relative z-10 flex flex-col items-center gap-2 px-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-tool-accent bg-tool-accent-soft text-xl text-tool-accent">
                    ⬆
                  </div>
                  <div className="text-sm font-medium text-app">
                    Drop an image or click to upload
                  </div>
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-secondary">
                    JPG · PNG · WEBP · GIF
                  </div>
                </div>
              )}
              <input
                id="cpe-file"
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            {busy && (
              <div className="mt-2 text-center font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                ◉ Extracting…
              </div>
            )}
          </ToolCard>

          {/* Source controls */}
          <ToolCard title="Controls" subtitle="URL · cluster size · re-run">
            <div className="space-y-4">
              <div>
                <Field label="Image URL">
                  <div className="flex gap-2">
                    <input
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://…"
                      className={inputCls("font-mono text-xs")}
                    />
                    <button
                      onClick={onUrl}
                      className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-2 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                    >
                      Load
                    </button>
                  </div>
                </Field>
                <p className="mt-1.5 text-[0.65rem] leading-relaxed text-muted">
                  Remote URLs must allow CORS. If extraction fails, download the image first and upload it directly.
                </p>
              </div>

              <div>
                <Field label={`Swatches (${k})`}>
                  <input
                    type="range"
                    min={3}
                    max={16}
                    step={1}
                    value={k}
                    onChange={(e) => setK(parseInt(e.target.value))}
                    className="w-full"
                    style={{ accentColor: "var(--tool-accent)" }}
                  />
                </Field>
                <button
                  onClick={() => imgSrc && extractFromImage(imgSrc)}
                  disabled={!imgSrc || busy}
                  className="mt-2 w-full rounded-lg bg-tool-accent px-3 py-2 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ color: "var(--bg)" }}
                >
                  {busy ? "Extracting…" : "Re-run extraction"}
                </button>
              </div>

              {error && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-500">
                  {error}
                </div>
              )}
            </div>
          </ToolCard>
        </div>

        {/* =========== TOP 5 SWATCHES =========== */}
        {topFive.length > 0 && (
          <section className="mt-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
            <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                ▾ top 5 swatches · click any to copy hex
              </div>
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                sorted by weight
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-5">
              {topFive.map((s, i) => {
                const hex = rgbToHex(s.r, s.g, s.b);
                const [hh, sat, ll] = rgbToHsl(s.r, s.g, s.b);
                return (
                  <button
                    key={i}
                    onClick={() => navigator.clipboard?.writeText(hex)}
                    className="group relative overflow-hidden rounded-xl border border-app bg-app text-left transition-colors hover:border-tool-accent"
                    title="Copy hex"
                  >
                    <div
                      className="relative h-28"
                      style={{ backgroundColor: hex }}
                    >
                      <div
                        className="absolute right-2 top-2 rounded-md border border-white/20 bg-black/45 px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-wider text-white backdrop-blur"
                        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
                      >
                        {(s.weight * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="space-y-1 border-t border-app bg-app-elevated p-3">
                      <div className="font-mono text-sm font-semibold text-app">
                        {hex.toUpperCase()}
                      </div>
                      <div className="font-mono text-[0.6rem] text-secondary">
                        rgb({s.r},{s.g},{s.b})
                      </div>
                      <div className="font-mono text-[0.6rem] text-muted">
                        hsl({hh},{sat}%,{ll}%)
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* =========== DOMINANT vs ACCENTS =========== */}
        {dominant && (
          <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
            <ToolCard title="Dominant" subtitle="Most-weighted cluster">
              <div
                className="aspect-square w-full rounded-xl border border-app shadow-lg"
                style={{ backgroundColor: rgbToHex(dominant.r, dominant.g, dominant.b) }}
              />
              <div className="mt-3 space-y-1">
                <div className="font-mono text-base font-semibold text-app">
                  {rgbToHex(dominant.r, dominant.g, dominant.b).toUpperCase()}
                </div>
                <div className="font-mono text-[0.7rem] text-muted">
                  {(dominant.weight * 100).toFixed(1)}% of pixels
                </div>
              </div>
            </ToolCard>

            <ToolCard title="Accents" subtitle="Next four clusters">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {accents.map((s, i) => {
                  const hex = rgbToHex(s.r, s.g, s.b);
                  return (
                    <button
                      key={i}
                      onClick={() => navigator.clipboard?.writeText(hex)}
                      className="group overflow-hidden rounded-xl border border-app text-left transition-colors hover:border-tool-accent"
                    >
                      <div
                        className="h-16"
                        style={{ backgroundColor: hex }}
                      />
                      <div className="border-t border-app bg-app-elevated p-2">
                        <div className="font-mono text-[0.7rem] text-app">
                          {hex.toUpperCase()}
                        </div>
                        <div className="font-mono text-[0.55rem] text-muted">
                          {(s.weight * 100).toFixed(0)}%
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ToolCard>
          </section>
        )}

        {/* =========== FULL PALETTE + EXPORT =========== */}
        {swatches.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
            <ToolCard title="Full palette" subtitle={`${swatches.length} colors`}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {swatches.map((s, i) => {
                  const hex = rgbToHex(s.r, s.g, s.b);
                  const [h, sat, l] = rgbToHsl(s.r, s.g, s.b);
                  return (
                    <div
                      key={i}
                      className="overflow-hidden rounded-lg border border-app"
                    >
                      <div
                        className="flex h-16 items-end justify-end p-2 font-mono text-[0.6rem] text-white"
                        style={{
                          backgroundColor: hex,
                          textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                        }}
                      >
                        {(s.weight * 100).toFixed(0)}%
                      </div>
                      <div className="space-y-0.5 border-t border-app bg-app-elevated p-2 text-[0.65rem]">
                        <button
                          onClick={() => navigator.clipboard?.writeText(hex)}
                          className="block w-full text-left font-mono text-app transition-colors hover:text-tool-accent"
                          title="Copy hex"
                        >
                          {hex.toUpperCase()}
                        </button>
                        <div className="font-mono text-muted">
                          rgb({s.r},{s.g},{s.b})
                        </div>
                        <div className="font-mono text-muted">
                          hsl({h},{sat}%,{l}%)
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 rounded-lg border border-app bg-app p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                  <span>Harmony from swatch</span>
                  <select
                    value={harmonyBase}
                    onChange={(e) => setHarmonyBase(parseInt(e.target.value))}
                    className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.65rem] text-app outline-none transition-colors hover:border-tool-accent"
                  >
                    {swatches.map((_, i) => (
                      <option key={i} value={i}>#{i + 1}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setHarmony(null)}
                    className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] transition-colors ${
                      !harmony
                        ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                        : "border-app bg-app-elevated text-secondary hover:text-app"
                    }`}
                  >
                    Extracted
                  </button>
                  {(["complementary", "analogous", "triadic", "tetradic", "monochromatic"] as Harmony[]).map((h) => (
                    <button
                      key={h}
                      onClick={() => setHarmony(h)}
                      className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] transition-colors ${
                        harmony === h
                          ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                          : "border-app bg-app-elevated text-secondary hover:text-app"
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
                {harmony && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {exportSwatches.map((s, i) => (
                      <div
                        key={i}
                        className="h-10 w-10 rounded-md border border-app"
                        style={{ backgroundColor: rgbToHex(s.r, s.g, s.b) }}
                        title={rgbToHex(s.r, s.g, s.b)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </ToolCard>

            <ToolCard title="Export" subtitle="Copy palette in your format">
              {/* segmented format pills */}
              <div className="mb-3 inline-flex flex-wrap overflow-hidden rounded-lg border border-app bg-app-elevated">
                {(
                  [
                    { k: "css", label: "CSS" },
                    { k: "tailwind", label: "Tailwind" },
                    { k: "scss", label: "SCSS" },
                    { k: "figma", label: "Figma" },
                    { k: "json", label: "JSON" },
                  ] as { k: ExportFmt; label: string }[]
                ).map(({ k: fk, label }) => (
                  <button
                    key={fk}
                    onClick={() => setExportFmt(fk)}
                    className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                      exportFmt === fk
                        ? "bg-tool-accent-soft text-tool-accent"
                        : "text-secondary hover:text-app"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <pre className="max-h-[320px] overflow-auto rounded-lg border border-app bg-app p-4 font-mono text-xs text-app">
                {exportText()}
              </pre>
              <button
                onClick={() => navigator.clipboard?.writeText(exportText())}
                className="mt-2 w-full rounded-lg bg-tool-accent px-3 py-2 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Copy
              </button>
            </ToolCard>
          </div>
        )}

        {swatches.length === 0 && !busy && (
          <div className="mt-6 rounded-xl border border-dashed border-app bg-app-elevated p-10 text-center text-sm text-muted">
            Drop an image above or paste a URL to extract a palette.
          </div>
        )}
      </ToolShell>
    </div>
  );
}
