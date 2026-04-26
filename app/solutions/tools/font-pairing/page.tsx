"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";

type FontCategory = "serif" | "sans" | "display" | "mono";

type Font = {
  name: string;
  category: FontCategory;
  // Representative adjectives used in reasoning blurbs.
  tags: string[];
  // Google Fonts URL slug; e.g. "Inter" -> "Inter"
  slug: string;
  // Weights to load
  weights: string;
};

const FONTS: Font[] = [
  // Serif
  { name: "Playfair Display", category: "serif", tags: ["high-contrast", "display", "editorial"], slug: "Playfair+Display", weights: "wght@400;700" },
  { name: "Merriweather", category: "serif", tags: ["humanist", "readable", "body"], slug: "Merriweather", weights: "wght@400;700" },
  { name: "Lora", category: "serif", tags: ["warm", "humanist", "body"], slug: "Lora", weights: "wght@400;700" },
  { name: "Source Serif 4", category: "serif", tags: ["neutral", "editorial", "body"], slug: "Source+Serif+4", weights: "wght@400;700" },
  { name: "EB Garamond", category: "serif", tags: ["classic", "literary"], slug: "EB+Garamond", weights: "wght@400;700" },
  { name: "Cormorant Garamond", category: "serif", tags: ["elegant", "display"], slug: "Cormorant+Garamond", weights: "wght@400;700" },
  { name: "PT Serif", category: "serif", tags: ["neutral", "body"], slug: "PT+Serif", weights: "wght@400;700" },
  { name: "Libre Baskerville", category: "serif", tags: ["traditional", "body"], slug: "Libre+Baskerville", weights: "wght@400;700" },

  // Sans
  { name: "Inter", category: "sans", tags: ["neutral", "geometric", "ui"], slug: "Inter", weights: "wght@400;600;700" },
  { name: "Work Sans", category: "sans", tags: ["warm", "humanist"], slug: "Work+Sans", weights: "wght@400;600;700" },
  { name: "DM Sans", category: "sans", tags: ["geometric", "ui"], slug: "DM+Sans", weights: "wght@400;700" },
  { name: "Manrope", category: "sans", tags: ["geometric", "modern"], slug: "Manrope", weights: "wght@400;600;700" },
  { name: "Nunito", category: "sans", tags: ["rounded", "friendly"], slug: "Nunito", weights: "wght@400;700" },
  { name: "Montserrat", category: "sans", tags: ["geometric", "display"], slug: "Montserrat", weights: "wght@400;700" },
  { name: "Poppins", category: "sans", tags: ["geometric", "rounded"], slug: "Poppins", weights: "wght@400;600;700" },
  { name: "Space Grotesk", category: "sans", tags: ["geometric", "editorial"], slug: "Space+Grotesk", weights: "wght@400;700" },
  { name: "Roboto", category: "sans", tags: ["neutral", "ui"], slug: "Roboto", weights: "wght@400;700" },
  { name: "Open Sans", category: "sans", tags: ["humanist", "ui"], slug: "Open+Sans", weights: "wght@400;700" },
  { name: "Lato", category: "sans", tags: ["humanist", "warm"], slug: "Lato", weights: "wght@400;700" },
  { name: "Raleway", category: "sans", tags: ["elegant", "thin"], slug: "Raleway", weights: "wght@400;600" },
  { name: "IBM Plex Sans", category: "sans", tags: ["neutral", "technical"], slug: "IBM+Plex+Sans", weights: "wght@400;600" },

  // Display
  { name: "Bebas Neue", category: "display", tags: ["condensed", "bold"], slug: "Bebas+Neue", weights: "wght@400" },
  { name: "Archivo Black", category: "display", tags: ["bold", "heavy"], slug: "Archivo+Black", weights: "wght@400" },
  { name: "Abril Fatface", category: "display", tags: ["display", "editorial"], slug: "Abril+Fatface", weights: "wght@400" },
  { name: "Fraunces", category: "display", tags: ["editorial", "quirky"], slug: "Fraunces", weights: "wght@400;700" },
  { name: "Anton", category: "display", tags: ["condensed", "heavy"], slug: "Anton", weights: "wght@400" },
  { name: "Oswald", category: "display", tags: ["condensed", "geometric"], slug: "Oswald", weights: "wght@400;700" },

  // Extra serifs
  { name: "Bitter", category: "serif", tags: ["humanist", "body"], slug: "Bitter", weights: "wght@400;700" },
  { name: "Crimson Pro", category: "serif", tags: ["classic", "body", "literary"], slug: "Crimson+Pro", weights: "wght@400;700" },
  { name: "Spectral", category: "serif", tags: ["editorial", "body"], slug: "Spectral", weights: "wght@400;700" },
  { name: "DM Serif Display", category: "serif", tags: ["high-contrast", "display"], slug: "DM+Serif+Display", weights: "wght@400" },

  // Extra sans
  { name: "Plus Jakarta Sans", category: "sans", tags: ["geometric", "modern"], slug: "Plus+Jakarta+Sans", weights: "wght@400;600;700" },
  { name: "Outfit", category: "sans", tags: ["geometric", "modern"], slug: "Outfit", weights: "wght@400;600;700" },
  { name: "Figtree", category: "sans", tags: ["neutral", "geometric"], slug: "Figtree", weights: "wght@400;600;700" },
  { name: "Albert Sans", category: "sans", tags: ["humanist", "ui"], slug: "Albert+Sans", weights: "wght@400;600;700" },
  { name: "Be Vietnam Pro", category: "sans", tags: ["geometric", "neutral"], slug: "Be+Vietnam+Pro", weights: "wght@400;600;700" },
  { name: "Sora", category: "sans", tags: ["geometric", "modern"], slug: "Sora", weights: "wght@400;600;700" },
  { name: "Urbanist", category: "sans", tags: ["geometric", "ui"], slug: "Urbanist", weights: "wght@400;600;700" },

  // Extra display
  { name: "Unbounded", category: "display", tags: ["display", "bold"], slug: "Unbounded", weights: "wght@400;700" },
  { name: "Syne", category: "display", tags: ["editorial", "quirky"], slug: "Syne", weights: "wght@400;700" },
  { name: "Bricolage Grotesque", category: "display", tags: ["editorial", "quirky"], slug: "Bricolage+Grotesque", weights: "wght@400;700" },

  // Mono
  { name: "JetBrains Mono", category: "mono", tags: ["technical", "mono"], slug: "JetBrains+Mono", weights: "wght@400;700" },
  { name: "Space Mono", category: "mono", tags: ["mono", "geometric"], slug: "Space+Mono", weights: "wght@400;700" },
  { name: "IBM Plex Mono", category: "mono", tags: ["technical", "mono"], slug: "IBM+Plex+Mono", weights: "wght@400" },
  { name: "Fira Code", category: "mono", tags: ["technical", "ligatures"], slug: "Fira+Code", weights: "wght@400;700" },
  { name: "Geist Mono", category: "mono", tags: ["technical", "modern"], slug: "Geist+Mono", weights: "wght@400;700" },
];

type Pairing = { body: Font; reason: string };

function reasonFor(heading: Font, body: Font): string {
  // Heuristic reasoning based on categories + tags.
  const h = heading;
  const b = body;

  if (h.category === "display" && b.category === "sans" && b.tags.includes("neutral")) {
    return "Loud display over a neutral sans — the workhorse combination that never fights your layout.";
  }
  if (h.category === "serif" && b.category === "sans" && (b.tags.includes("humanist") || b.tags.includes("warm"))) {
    return "Classic serif heading, humanist sans body — high contrast with warmth in the reading experience.";
  }
  if (h.category === "serif" && b.category === "sans" && b.tags.includes("geometric")) {
    return "Editorial serif over a geometric sans — a clean, modern-magazine pairing.";
  }
  if (h.category === "sans" && b.category === "serif") {
    return "Sans heading over a serif body — flips the usual hierarchy and reads as confident and literary.";
  }
  if (h.category === "sans" && b.category === "sans" && h.tags.includes("geometric") && b.tags.includes("humanist")) {
    return "Geometric + humanist duo — structured headings, inviting body.";
  }
  if (h.category === "sans" && b.category === "sans") {
    return "Single-family feel with enough difference in weight and width to separate heading from body.";
  }
  if (h.category === "serif" && b.category === "serif") {
    return "All-serif pairing — the body wears a plainer dress so the heading can carry the drama.";
  }
  if (b.category === "mono") {
    return "Mono body for an unmistakably technical tone. Use for docs, changelogs, and dev-facing pages.";
  }
  return "Balanced pairing with clear hierarchy and enough style contrast to keep the eye moving.";
}

function pickPairings(heading: Font): Pairing[] {
  const candidates: Pairing[] = [];
  const blocked = new Set<string>([heading.name]);

  // Prefer these pools depending on heading category
  let pool: Font[];
  if (heading.category === "display" || heading.category === "serif") {
    pool = FONTS.filter((f) => f.category === "sans");
  } else if (heading.category === "sans") {
    // mix: serif body recs + sans siblings + one mono
    pool = [
      ...FONTS.filter((f) => f.category === "serif"),
      ...FONTS.filter((f) => f.category === "sans" && f.name !== heading.name),
    ];
  } else {
    pool = FONTS.filter((f) => f.category === "sans");
  }

  // Tag-aware scoring for diversity.
  const ranked = pool
    .filter((f) => !blocked.has(f.name))
    .map((body) => {
      let score = 0;
      if (body.tags.includes("body") || body.tags.includes("humanist") || body.tags.includes("neutral")) score += 3;
      if (body.tags.includes("ui")) score += 2;
      // Avoid pairing display with display
      if (body.category === "display") score -= 5;
      return { body, score };
    })
    .sort((a, b) => b.score - a.score);

  for (const { body } of ranked) {
    candidates.push({ body, reason: reasonFor(heading, body) });
    if (candidates.length >= 5) break;
  }

  // Add a mono option if room
  if (candidates.length < 5) {
    const mono = FONTS.find((f) => f.category === "mono");
    if (mono) candidates.push({ body: mono, reason: reasonFor(heading, mono) });
  }

  return candidates.slice(0, 5);
}

function loadFonts(fonts: Font[]) {
  const id = "font-pairing-link";
  const existing = document.getElementById(id) as HTMLLinkElement | null;
  const unique = Array.from(new Map(fonts.map((f) => [f.name, f])).values());
  const families = unique
    .map((f) => `family=${f.slug}:${f.weights}`)
    .join("&");
  const href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  if (existing) {
    existing.href = href;
  } else {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
}

type SpecimenMode = "heading" | "body" | "sample";

export default function FontPairingPage() {
  const [headingName, setHeadingName] = useState<string>("Playfair Display");
  const heading = useMemo(
    () => FONTS.find((f) => f.name === headingName) ?? FONTS[0],
    [headingName]
  );
  const pairings = useMemo(() => pickPairings(heading), [heading]);
  const [activeBody, setActiveBody] = useState<string>(pairings[0]?.body.name ?? "");
  const [mode, setMode] = useState<SpecimenMode>("sample");

  // When heading changes, default body to first pairing.
  useEffect(() => {
    setActiveBody(pairings[0]?.body.name ?? "");
  }, [pairings]);

  const body =
    FONTS.find((f) => f.name === activeBody) ?? pairings[0]?.body ?? FONTS[0];

  // Load fonts (heading + body + all pairing bodies for chips)
  useEffect(() => {
    const all = [heading, body, ...pairings.map((p) => p.body)];
    loadFonts(all);
  }, [heading, body, pairings]);

  const linkTag = `<link href="https://fonts.googleapis.com/css2?family=${heading.slug}:${heading.weights}&family=${body.slug}:${body.weights}&display=swap" rel="stylesheet">`;
  const bodyStack = body.category === "mono" ? "monospace" : body.category === "serif" ? "serif" : "sans-serif";
  const headingStack = heading.category === "mono" ? "monospace" : heading.category === "serif" ? "serif" : heading.category === "display" ? "sans-serif" : "sans-serif";
  const css = `body {\n  font-family: "${body.name}", ${bodyStack};\n}\n\nh1, h2, h3, h4, h5, h6 {\n  font-family: "${heading.name}", ${headingStack};\n}`;
  const fontFaceCss = `/* Self-host — download from fonts.google.com/specimen/${heading.slug.replace(/\+/g, "-")} and fonts.google.com/specimen/${body.slug.replace(/\+/g, "-")} */
@font-face {
  font-family: "${heading.name}";
  src: url("/fonts/${heading.slug.replace(/\+/g, "-").toLowerCase()}.woff2") format("woff2");
  font-display: swap;
}
@font-face {
  font-family: "${body.name}";
  src: url("/fonts/${body.slug.replace(/\+/g, "-").toLowerCase()}.woff2") format("woff2");
  font-display: swap;
}
${css}`;

  const categoryLabel: Record<FontCategory, string> = {
    serif: "Serif",
    sans: "Sans",
    display: "Display",
    mono: "Mono",
  };

  const grouped: Record<FontCategory, Font[]> = {
    serif: FONTS.filter((f) => f.category === "serif"),
    sans: FONTS.filter((f) => f.category === "sans"),
    display: FONTS.filter((f) => f.category === "display"),
    mono: FONTS.filter((f) => f.category === "mono"),
  };

  // Pairing rationale chip — derived from heading + body categories/tags. Visual only.
  const rationaleChip = (() => {
    const tags = new Set([...heading.tags, ...body.tags]);
    if (heading.category === "display" || tags.has("editorial") || tags.has("high-contrast")) return "editorial";
    if (tags.has("classic") || tags.has("traditional") || tags.has("literary")) return "classic";
    return "modern";
  })();

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";

  const headingFontFamily = `"${heading.name}", ${headingStack}`;
  const bodyFontFamily = `"${body.name}", ${bodyStack}`;

  return (
    <div data-tool-theme="design" data-tool="font-pairing">
      <ToolShell
        category="Design & Creative"
        title="Font Pairing"
        description="Pick a heading font. Get 3-5 body pairings with reasoning, live preview, and copy-ready CSS."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              {rationaleChip}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {categoryLabel[heading.category]} / {categoryLabel[body.category]}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              type.specimen
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {heading.slug.toLowerCase()}+{body.slug.toLowerCase()}.css
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              ◉ google fonts
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Heading + Body Pairing · Live Specimen
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {pairings.length} pairings
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {FONTS.length} fonts
                  </span>
                </div>

                <div
                  className="mt-3 truncate text-2xl font-semibold tracking-tight text-app md:text-3xl"
                  style={{ fontFamily: headingFontFamily }}
                >
                  {heading.name} <span className="text-muted">+</span>{" "}
                  <span style={{ fontFamily: bodyFontFamily }}>{body.name}</span>
                </div>
              </div>

              {/* Aa specimen tile */}
              <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg border border-tool-accent bg-tool-accent-soft text-2xl font-bold text-tool-accent"
                  style={{ fontFamily: headingFontFamily }}
                >
                  Aa
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Specimen
                  </div>
                  <div className="text-sm font-semibold text-app">
                    {categoryLabel[heading.category]}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* sub-tab strip */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "sample", label: "Sample" },
                  { k: "heading", label: "Heading" },
                  { k: "body", label: "Body" },
                ] as { k: SpecimenMode; label: string }[]
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setMode(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    mode === t.k
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => {
                  const next = pairings.find((p) => p.body.name !== activeBody);
                  if (next) setActiveBody(next.body.name);
                }}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Swap body
              </button>
              <button
                onClick={() => navigator.clipboard?.writeText(css)}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Copy CSS
              </button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.5fr]">
          {/* ============================ HEADING PICKER ============================ */}
          <ToolCard title="Heading font" subtitle={`${pairings.length} pairings`}>
            <Field label="Browse curated Google Fonts">
              <select
                value={headingName}
                onChange={(e) => setHeadingName(e.target.value)}
                className={inputCls()}
              >
                {(["serif", "sans", "display", "mono"] as FontCategory[]).map((cat) => (
                  <optgroup key={cat} label={categoryLabel[cat]}>
                    {grouped[cat].map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>

            {/* Heading specimen tile */}
            <div
              className="mt-4 overflow-hidden rounded-xl border border-app bg-app-elevated p-5 text-app"
              style={{ fontFamily: headingFontFamily }}
            >
              <div
                className="flex items-center justify-between"
                style={{ fontFamily: "ui-sans-serif, system-ui" }}
              >
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                  Heading
                </span>
                <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-secondary">
                  {categoryLabel[heading.category]}
                </span>
              </div>
              <div className="mt-3 text-4xl font-bold leading-tight">{heading.name}</div>
              <div className="mt-2 truncate text-base tracking-[0.05em] text-secondary">{alphabet}</div>
              <div className="text-base tracking-[0.05em] text-muted">{numbers}</div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-secondary">
                  Suggested body fonts
                </span>
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  tap to swap
                </span>
              </div>
              <div className="space-y-2">
                {pairings.map((p) => (
                  <button
                    key={p.body.name}
                    onClick={() => setActiveBody(p.body.name)}
                    className={`group w-full rounded-lg border p-3 text-left transition-colors ${
                      activeBody === p.body.name
                        ? "border-tool-accent bg-tool-accent-soft"
                        : "border-app bg-app-elevated hover:border-tool-accent"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div
                        className="truncate text-base font-semibold text-app"
                        style={{
                          fontFamily: `"${p.body.name}", ${
                            p.body.category === "serif"
                              ? "serif"
                              : p.body.category === "mono"
                              ? "monospace"
                              : "sans-serif"
                          }`,
                        }}
                      >
                        {p.body.name}
                      </div>
                      <span className="shrink-0 rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                        {categoryLabel[p.body.category]}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-secondary">{p.reason}</p>
                  </button>
                ))}
              </div>
            </div>
          </ToolCard>

          {/* ============================ SPECIMEN ============================ */}
          <ToolCard title="Type specimen" subtitle={`${heading.name} + ${body.name}`}>
            {/* Type-specimen sheet */}
            <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
              {(mode === "sample" || mode === "heading") && (
                <div className={`p-6 ${mode === "sample" ? "border-b border-app" : ""}`}>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                      Heading — {heading.name}
                    </span>
                    <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                      Aa
                    </span>
                  </div>
                  <h1
                    className="text-[3.25rem] font-bold leading-[1.05] text-app"
                    style={{ fontFamily: headingFontFamily }}
                  >
                    Build things people actually want
                  </h1>
                  <h2
                    className="mt-3 text-2xl font-semibold text-secondary"
                    style={{ fontFamily: headingFontFamily }}
                  >
                    A subheading that carries the next idea
                  </h2>
                  <div
                    className="mt-5 space-y-1 border-t border-app pt-4 text-secondary"
                    style={{ fontFamily: headingFontFamily }}
                  >
                    <div className="text-2xl tracking-[0.04em] text-app">{alphabet}</div>
                    <div className="text-2xl tracking-[0.04em] text-secondary">{alphabet.toLowerCase()}</div>
                    <div className="text-2xl tracking-[0.06em] text-muted">{numbers}</div>
                  </div>
                </div>
              )}

              {(mode === "sample" || mode === "body") && (
                <div className="p-6">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                      Body — {body.name}
                    </span>
                    <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-faint">
                      Aa
                    </span>
                  </div>
                  <p
                    className="text-base leading-relaxed text-app"
                    style={{ fontFamily: bodyFontFamily }}
                  >
                    Body copy sets the rhythm of a page. It should read cleanly at 16–18px, step out of the way
                    of the heading, and still feel like part of the same family of voices. When the pairing
                    works, you stop noticing the type and start noticing the words.
                  </p>
                  <p
                    className="mt-3 text-sm leading-relaxed text-secondary"
                    style={{ fontFamily: bodyFontFamily }}
                  >
                    Smaller supporting copy — captions, metadata, footnotes — should keep the same voice,
                    just quieter.
                  </p>
                  <div
                    className="mt-5 space-y-1 border-t border-app pt-4"
                    style={{ fontFamily: bodyFontFamily }}
                  >
                    <div className="text-lg tracking-[0.03em] text-app">{alphabet}</div>
                    <div className="text-lg tracking-[0.03em] text-secondary">{alphabet.toLowerCase()}</div>
                    <div className="text-lg tracking-[0.05em] text-muted">{numbers}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Typographic scale */}
            <div className="mt-5 rounded-xl border border-app bg-app-elevated p-5">
              <div className="mb-3 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-secondary">
                Typographic scale
              </div>
              <div className="space-y-2" style={{ fontFamily: headingFontFamily }}>
                {[
                  { tag: "H1", size: "48px", lh: "1.1", fw: "700" },
                  { tag: "H2", size: "36px", lh: "1.15", fw: "700" },
                  { tag: "H3", size: "28px", lh: "1.2", fw: "600" },
                  { tag: "H4", size: "22px", lh: "1.25", fw: "600" },
                  { tag: "H5", size: "18px", lh: "1.3", fw: "600" },
                  { tag: "H6", size: "16px", lh: "1.35", fw: "600" },
                ].map((s) => (
                  <div
                    key={s.tag}
                    className="flex items-baseline gap-4 border-b border-app pb-1.5"
                  >
                    <span
                      className="w-8 shrink-0 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted"
                      style={{ fontFamily: "ui-monospace, monospace" }}
                    >
                      {s.tag}
                    </span>
                    <span
                      className="text-app"
                      style={{ fontSize: s.size, lineHeight: s.lh, fontWeight: s.fw }}
                    >
                      Sample heading
                    </span>
                    <span
                      className="ml-auto font-mono text-[0.55rem] text-faint"
                      style={{ fontFamily: "ui-monospace, monospace" }}
                    >
                      {s.size}
                    </span>
                  </div>
                ))}
                <div className="pt-2" style={{ fontFamily: bodyFontFamily }}>
                  <p className="text-[17px] leading-[1.6] text-secondary">
                    Body paragraph at 17px with 1.6 line-height. This is where the bulk of reading happens; make sure it sits comfortably below every heading level in the scale.
                  </p>
                </div>
              </div>
            </div>

            {/* Export blocks */}
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-app bg-app-elevated p-3">
                <div className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-secondary">
                  Google Fonts &lt;link&gt;
                </div>
                <pre className="max-h-[120px] overflow-auto break-all rounded-md border border-app bg-app p-3 font-mono text-[0.6rem] text-app">
                  {linkTag}
                </pre>
                <button
                  onClick={() => navigator.clipboard?.writeText(linkTag)}
                  className="mt-2 w-full rounded-lg border border-app bg-app px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                >
                  Copy
                </button>
              </div>
              <div className="rounded-xl border border-app bg-app-elevated p-3">
                <div className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-secondary">
                  CSS
                </div>
                <pre className="max-h-[120px] overflow-auto rounded-md border border-app bg-app p-3 font-mono text-[0.6rem] text-app">
                  {css}
                </pre>
                <button
                  onClick={() => navigator.clipboard?.writeText(css)}
                  className="mt-2 w-full rounded-lg border border-app bg-app px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                >
                  Copy
                </button>
              </div>
              <div className="rounded-xl border border-tool-accent bg-tool-accent-soft p-3">
                <div className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
                  @font-face (self-host)
                </div>
                <pre className="max-h-[120px] overflow-auto rounded-md border border-app bg-app p-3 font-mono text-[0.55rem] text-app">
                  {fontFaceCss}
                </pre>
                <button
                  onClick={() => navigator.clipboard?.writeText(fontFaceCss)}
                  className="mt-2 w-full rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.15em] transition-opacity hover:opacity-90"
                  style={{ color: "var(--bg)" }}
                >
                  Copy
                </button>
              </div>
            </div>
          </ToolCard>
        </div>
      </ToolShell>
    </div>
  );
}
