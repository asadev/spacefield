"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";

type TwitterCard = "summary" | "summary_large_image";
type Mode = "single" | "bulk";
type Platform = "google" | "facebook" | "twitter" | "linkedin";

// 2024 Google SERP guidance — sourced from Google Search Central
// documentation and their ongoing SERP-pixel rendering (Dec 2024).
// Title link: typically shown up to ~580-600px (roughly 50-60 chars on desktop).
// Description: Google often rewrites snippets, but aims for ~140-160 chars.
// Emojis: rendered in title/desc since 2015 but Google may strip decorative
// ones; use sparingly and only when they add meaning.
const GUIDE = {
  titleOptimal: [50, 60] as const,
  titleHardMax: 70,
  descOptimal: [140, 160] as const,
  descHardMax: 175,
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Count emojis in a string for warnings.
function countEmojis(s: string): number {
  // Simple range match — covers most common emoji blocks.
  const m = s.match(/\p{Extended_Pictographic}/gu);
  return m ? m.length : 0;
}

type PairStatus = "ok" | "warn" | "error";
type Pair = {
  title: string;
  description: string;
  titleLen: number;
  descLen: number;
  titleStatus: PairStatus;
  descStatus: PairStatus;
  emojis: number;
  notes: string[];
};

function validatePair(title: string, description: string): Pair {
  const notes: string[] = [];
  const titleLen = title.length;
  const descLen = description.length;

  let titleStatus: PairStatus = "ok";
  if (titleLen === 0) titleStatus = "error";
  else if (titleLen < GUIDE.titleOptimal[0]) {
    titleStatus = "warn";
    notes.push(`Title short (${titleLen}): optimal ${GUIDE.titleOptimal[0]}-${GUIDE.titleOptimal[1]}.`);
  } else if (titleLen > GUIDE.titleOptimal[1]) {
    titleStatus = titleLen > GUIDE.titleHardMax ? "error" : "warn";
    notes.push(
      `Title long (${titleLen}): Google truncates around ${GUIDE.titleOptimal[1]} chars on desktop.`,
    );
  }

  let descStatus: PairStatus = "ok";
  if (descLen === 0) descStatus = "error";
  else if (descLen < GUIDE.descOptimal[0]) {
    descStatus = "warn";
    notes.push(`Description short (${descLen}): aim for ${GUIDE.descOptimal[0]}-${GUIDE.descOptimal[1]}.`);
  } else if (descLen > GUIDE.descOptimal[1]) {
    descStatus = descLen > GUIDE.descHardMax ? "error" : "warn";
    notes.push(
      `Description long (${descLen}): Google usually shows ${GUIDE.descOptimal[0]}-${GUIDE.descOptimal[1]} chars.`,
    );
  }

  const emojis = countEmojis(title) + countEmojis(description);
  if (emojis > 2) notes.push(`${emojis} emojis — Google may strip decorative emojis from SERP.`);

  return { title, description, titleLen, descLen, titleStatus, descStatus, emojis, notes };
}

const CHIP: Record<PairStatus, string> = {
  ok: "border-tool-accent bg-tool-accent-soft text-tool-accent",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  error: "border-rose-500/40 bg-rose-500/10 text-rose-500",
};
const CHIP_LABEL: Record<PairStatus, string> = {
  ok: "good",
  warn: "off",
  error: "bad",
};
const TEXT: Record<PairStatus, string> = {
  ok: "text-emerald-500",
  warn: "text-amber-500",
  error: "text-rose-500",
};
const BORDER: Record<PairStatus, string> = {
  ok: "border-emerald-500/30",
  warn: "border-amber-500/30",
  error: "border-rose-500/30",
};

const STORAGE_KEY = "solutions:seo-meta-tags:state:v1";

function CountChip({
  status,
  label,
  value,
  range,
}: {
  status: PairStatus;
  label: string;
  value: number;
  range: readonly [number, number];
}) {
  const tone =
    value === 0
      ? "bad"
      : value < range[0]
        ? "short"
        : value > range[1]
          ? "long"
          : "good";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] ${CHIP[status]}`}
    >
      <span className="opacity-60">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="opacity-60">/ {range[1]}</span>
      <span className="opacity-50">·</span>
      <span>{tone === "good" ? CHIP_LABEL[status] : tone}</span>
    </span>
  );
}

export default function SeoMetaTagsPage() {
  const [mode, setMode] = useState<Mode>("single");
  const [platform, setPlatform] = useState<Platform>("google");
  const [title, setTitle] = useState("How to write copy that ships — a 10-minute guide");
  const [description, setDescription] = useState(
    "Skip the jargon. Write like a person. This quick guide walks through the seven rules that turn copy from filler into conversion — with examples you can steal.",
  );
  const [canonical, setCanonical] = useState("https://example.com/blog/copy-that-ships");
  const [ogImage, setOgImage] = useState("https://example.com/og/copy-that-ships.png");
  const [siteName, setSiteName] = useState("Example Co.");
  const [twitterCard, setTwitterCard] = useState<TwitterCard>("summary_large_image");
  const [twitterHandle, setTwitterHandle] = useState("@example");
  const [bulk, setBulk] = useState(
    `How to write copy that ships | Skip the jargon — seven rules that turn copy from filler into conversion.
10 SEO meta tips for 2024 | Fresh Google guidance on title length, description truncation, and emoji handling in SERPs.
Short title | Too short a description`,
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.title === "string") setTitle(s.title);
      if (typeof s.description === "string") setDescription(s.description);
      if (typeof s.canonical === "string") setCanonical(s.canonical);
      if (typeof s.ogImage === "string") setOgImage(s.ogImage);
      if (typeof s.siteName === "string") setSiteName(s.siteName);
      if (s.twitterCard === "summary" || s.twitterCard === "summary_large_image")
        setTwitterCard(s.twitterCard);
      if (typeof s.twitterHandle === "string") setTwitterHandle(s.twitterHandle);
      if (typeof s.bulk === "string") setBulk(s.bulk);
      if (s.mode === "single" || s.mode === "bulk") setMode(s.mode);
      if (
        s.platform === "google" ||
        s.platform === "facebook" ||
        s.platform === "twitter" ||
        s.platform === "linkedin"
      )
        setPlatform(s.platform);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mode,
          platform,
          title,
          description,
          canonical,
          ogImage,
          siteName,
          twitterCard,
          twitterHandle,
          bulk,
        }),
      );
    } catch {}
  }, [mode, platform, title, description, canonical, ogImage, siteName, twitterCard, twitterHandle, bulk]);

  const html = useMemo(() => {
    const t = escapeHtml(title);
    const d = escapeHtml(description);
    const c = escapeHtml(canonical);
    const img = escapeHtml(ogImage);
    const sn = escapeHtml(siteName);
    const tw = escapeHtml(twitterHandle);
    return [
      `<!-- Primary -->`,
      `<title>${t}</title>`,
      `<meta name="description" content="${d}" />`,
      `<link rel="canonical" href="${c}" />`,
      ``,
      `<!-- Open Graph -->`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="${sn}" />`,
      `<meta property="og:title" content="${t}" />`,
      `<meta property="og:description" content="${d}" />`,
      `<meta property="og:url" content="${c}" />`,
      `<meta property="og:image" content="${img}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      ``,
      `<!-- Twitter -->`,
      `<meta name="twitter:card" content="${twitterCard}" />`,
      `<meta name="twitter:site" content="${tw}" />`,
      `<meta name="twitter:title" content="${t}" />`,
      `<meta name="twitter:description" content="${d}" />`,
      `<meta name="twitter:image" content="${img}" />`,
    ].join("\n");
  }, [title, description, canonical, ogImage, siteName, twitterCard, twitterHandle]);

  const singlePair = useMemo(() => validatePair(title, description), [title, description]);

  const bulkPairs = useMemo<Pair[]>(() => {
    return bulk
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [t, ...rest] = line.split("|");
        const d = rest.join("|").trim();
        return validatePair((t || "").trim(), d);
      });
  }, [bulk]);

  const bulkSummary = useMemo(() => {
    let ok = 0;
    let warn = 0;
    let err = 0;
    for (const p of bulkPairs) {
      const worst =
        p.titleStatus === "error" || p.descStatus === "error"
          ? "error"
          : p.titleStatus === "warn" || p.descStatus === "warn"
            ? "warn"
            : "ok";
      if (worst === "ok") ok++;
      else if (worst === "warn") warn++;
      else err++;
    }
    return { ok, warn, err, total: bulkPairs.length };
  }, [bulkPairs]);

  const copy = () => navigator.clipboard?.writeText(html);

  const copyBulkCsv = () => {
    const header = "title,description,title_len,desc_len,status,notes";
    const rows = bulkPairs.map((p) => {
      const status =
        p.titleStatus === "error" || p.descStatus === "error"
          ? "error"
          : p.titleStatus === "warn" || p.descStatus === "warn"
            ? "warn"
            : "ok";
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      return [
        esc(p.title),
        esc(p.description),
        p.titleLen,
        p.descLen,
        status,
        esc(p.notes.join(" ")),
      ].join(",");
    });
    navigator.clipboard?.writeText([header, ...rows].join("\n"));
  };

  const domain = (() => {
    try {
      return new URL(canonical).hostname.replace(/^www\./, "");
    } catch {
      return canonical;
    }
  })();

  // Render the HTML code block with property highlighting in tool-accent.
  const renderHtmlBlock = (src: string) => {
    const parts: { text: string; kind: "prop" | "plain" }[] = [];
    const re = /\b(?:property|name|content|href|rel)=/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      if (m.index > last) parts.push({ text: src.slice(last, m.index), kind: "plain" });
      parts.push({ text: m[0], kind: "prop" });
      last = m.index + m[0].length;
    }
    if (last < src.length) parts.push({ text: src.slice(last), kind: "plain" });
    return parts.map((p, i) =>
      p.kind === "prop" ? (
        <span key={i} className="text-tool-accent">{p.text}</span>
      ) : (
        <span key={i}>{p.text}</span>
      ),
    );
  };

  const platformTabs: { k: Platform; label: string }[] = [
    { k: "google", label: "Google" },
    { k: "twitter", label: "Twitter / X" },
    { k: "facebook", label: "Facebook" },
    { k: "linkedin", label: "LinkedIn" },
  ];

  return (
    <div data-tool-theme="content" data-tool="seo-meta-tags">
      <ToolShell
        category="Writing & Content"
        title="SEO Meta Tags Generator"
        description="Generate clean HTML meta tags with Google SERP, Open Graph (1200×630) and Twitter card previews. Bulk mode validates many title|description pairs at once."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              meta:tags
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {mode === "single" ? "single" : "bulk"}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              seo.preview
              <span className="text-faint">/</span>
              <span className="text-secondary">{domain || "domain"}</span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">◉ autosaved</div>
          </div>

          <div className="relative p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Meta &amp; Social Preview
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                  {title || "Untitled page"}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <CountChip
                    status={singlePair.titleStatus}
                    label="title"
                    value={singlePair.titleLen}
                    range={GUIDE.titleOptimal}
                  />
                  <CountChip
                    status={singlePair.descStatus}
                    label="desc"
                    value={singlePair.descLen}
                    range={GUIDE.descOptimal}
                  />
                  {singlePair.emojis > 0 && (
                    <span className="rounded-md border border-app bg-app px-2 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                      emoji×{singlePair.emojis}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* sub-tab strip */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(["single", "bulk"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    mode === m
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  {m === "single" ? "Single" : "Bulk"}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={copy}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Copy HTML
              </button>
              {mode === "bulk" && (
                <button
                  onClick={copyBulkCsv}
                  className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                >
                  Copy CSV
                </button>
              )}
            </div>
          </div>
        </section>

        {mode === "single" ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            {/* LEFT — form + generated tags */}
            <div className="space-y-6">
              <ToolCard title="Fields" subtitle="Title, description, social">
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                        Title
                      </label>
                      <CountChip
                        status={singlePair.titleStatus}
                        label="title"
                        value={singlePair.titleLen}
                        range={GUIDE.titleOptimal}
                      />
                    </div>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className={inputCls(
                        singlePair.titleStatus === "warn"
                          ? "border-amber-500/40"
                          : singlePair.titleStatus === "error"
                            ? "border-rose-500/40"
                            : "",
                      )}
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                        Description
                      </label>
                      <CountChip
                        status={singlePair.descStatus}
                        label="desc"
                        value={singlePair.descLen}
                        range={GUIDE.descOptimal}
                      />
                    </div>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className={inputCls(
                        `min-h-[88px] text-sm ${
                          singlePair.descStatus === "warn"
                            ? "border-amber-500/40"
                            : singlePair.descStatus === "error"
                              ? "border-rose-500/40"
                              : ""
                        }`,
                      )}
                    />
                  </div>

                  <Field label="Canonical URL">
                    <input
                      value={canonical}
                      onChange={(e) => setCanonical(e.target.value)}
                      className={inputCls()}
                    />
                  </Field>
                  <Field label="OG Image URL" hint="1200×630 recommended">
                    <input
                      value={ogImage}
                      onChange={(e) => setOgImage(e.target.value)}
                      className={inputCls()}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Site name">
                      <input
                        value={siteName}
                        onChange={(e) => setSiteName(e.target.value)}
                        className={inputCls()}
                      />
                    </Field>
                    <Field label="Twitter handle">
                      <input
                        value={twitterHandle}
                        onChange={(e) => setTwitterHandle(e.target.value)}
                        className={inputCls()}
                      />
                    </Field>
                  </div>
                  <Field label="Twitter card type">
                    <select
                      value={twitterCard}
                      onChange={(e) => setTwitterCard(e.target.value as TwitterCard)}
                      className={inputCls()}
                    >
                      <option value="summary">summary</option>
                      <option value="summary_large_image">summary_large_image</option>
                    </select>
                  </Field>

                  {singlePair.notes.length > 0 && (
                    <ul className="mt-1 space-y-1 rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-2 text-[0.7rem] text-secondary">
                      {singlePair.notes.map((n, i) => (
                        <li key={i}>· {n}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </ToolCard>

              <ToolCard title="Generated tags" subtitle="Paste into <head>">
                <div className="relative">
                  <button
                    onClick={copy}
                    className="absolute right-2 top-2 rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-tool-accent transition-colors hover:bg-tool-accent hover:opacity-90"
                  >
                    Copy
                  </button>
                  <pre className="overflow-auto rounded-lg border border-app bg-app-elevated p-3 font-mono text-[0.7rem] text-app whitespace-pre-wrap">
                    {renderHtmlBlock(html)}
                  </pre>
                </div>
              </ToolCard>
            </div>

            {/* RIGHT — segmented platform preview */}
            <div className="space-y-6">
              <ToolCard
                title="Live preview"
                subtitle="How this page appears on each platform"
              >
                {/* segmented platform pills */}
                <div className="mb-4 inline-flex flex-wrap overflow-hidden rounded-lg border border-app bg-app-elevated">
                  {platformTabs.map((t) => (
                    <button
                      key={t.k}
                      onClick={() => setPlatform(t.k)}
                      className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                        platform === t.k
                          ? "bg-tool-accent text-app-elevated"
                          : "text-secondary hover:text-app"
                      }`}
                      style={
                        platform === t.k
                          ? { color: "var(--bg)" }
                          : undefined
                      }
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* preview surface — wrapped in app-elevated, but the previews keep native colors */}
                <div className="rounded-lg border border-app bg-app-elevated p-4">
                  {platform === "google" && (
                    <div className="rounded border border-black/5 bg-white p-4 text-black font-sans">
                      <div className="flex items-center gap-2">
                        <div className="grid h-6 w-6 place-items-center rounded-full bg-gray-100 text-[0.55rem] font-semibold text-gray-500">
                          {domain.charAt(0).toUpperCase()}
                        </div>
                        <div className="leading-tight">
                          <div className="text-[0.78rem] text-gray-800">{siteName || domain}</div>
                          <div className="text-[0.7rem] text-gray-500">{domain}</div>
                        </div>
                      </div>
                      <div className="mt-2 text-[1.15rem] leading-tight text-[#1a0dab]">
                        {title.slice(0, 60)}
                        {title.length > 60 && "…"}
                      </div>
                      <div className="mt-1 text-sm text-[#4d5156] leading-snug">
                        {description.slice(0, 160)}
                        {description.length > 160 && "…"}
                      </div>
                    </div>
                  )}

                  {platform === "twitter" && (
                    <div className="overflow-hidden rounded-2xl border border-black/10 bg-white max-w-[520px] text-black">
                      {twitterCard === "summary_large_image" ? (
                        <>
                          <div
                            className="aspect-[2/1] w-full bg-gray-100 bg-cover bg-center"
                            style={ogImage ? { backgroundImage: `url(${ogImage})` } : {}}
                          />
                          <div className="px-3 py-2">
                            <div className="text-[0.7rem] text-gray-500">{domain}</div>
                            <div className="mt-0.5 text-[0.9rem] font-semibold leading-tight text-gray-900">
                              {title}
                            </div>
                            <div className="mt-1 line-clamp-2 text-[0.8rem] text-gray-600">
                              {description}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex">
                          <div
                            className="h-28 w-28 flex-shrink-0 bg-gray-100 bg-cover bg-center"
                            style={ogImage ? { backgroundImage: `url(${ogImage})` } : {}}
                          />
                          <div className="px-3 py-2">
                            <div className="text-[0.7rem] text-gray-500">{domain}</div>
                            <div className="mt-0.5 text-[0.9rem] font-semibold leading-tight text-gray-900">
                              {title}
                            </div>
                            <div className="mt-1 line-clamp-2 text-[0.8rem] text-gray-600">
                              {description}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {platform === "facebook" && (
                    <div className="overflow-hidden rounded border border-black/10 bg-[#f0f2f5]">
                      <div
                        className="aspect-[1200/630] w-full bg-gray-200 bg-cover bg-center"
                        style={ogImage ? { backgroundImage: `url(${ogImage})` } : {}}
                      />
                      <div className="bg-white p-3 text-black">
                        <div className="text-[0.6rem] uppercase tracking-[0.12em] text-gray-500">
                          {domain}
                        </div>
                        <div className="mt-1 text-[0.95rem] font-semibold leading-tight text-gray-900">
                          {title}
                        </div>
                        <div className="mt-1 line-clamp-2 text-[0.8rem] text-gray-600">
                          {description}
                        </div>
                      </div>
                    </div>
                  )}

                  {platform === "linkedin" && (
                    <div className="overflow-hidden rounded border border-black/10 bg-white">
                      <div
                        className="aspect-[1200/630] w-full bg-gray-200 bg-cover bg-center"
                        style={ogImage ? { backgroundImage: `url(${ogImage})` } : {}}
                      />
                      <div className="bg-[#f3f2ef] p-3 text-black">
                        <div className="text-[0.95rem] font-semibold leading-tight text-gray-900">
                          {title}
                        </div>
                        <div className="mt-1 text-[0.7rem] text-gray-500">
                          {domain}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <p className="mt-3 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                  {platform === "google"
                    ? "Google Search Central 2024 — desktop title ~580-600px, description ~140-160 chars"
                    : platform === "twitter"
                      ? `card: ${twitterCard}${twitterHandle ? ` · posted as ${twitterHandle}` : ""}`
                      : platform === "facebook"
                        ? "Open Graph 1200 × 630"
                        : "LinkedIn shared link card"}
                </p>
              </ToolCard>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
              <ToolCard title="Bulk input" subtitle="One pair per line: title | description">
                <Field label="Pairs">
                  <textarea
                    value={bulk}
                    onChange={(e) => setBulk(e.target.value)}
                    className={inputCls("min-h-[320px] font-mono text-xs")}
                  />
                </Field>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={copyBulkCsv}
                    className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-tool-accent transition-colors hover:bg-tool-accent hover:opacity-90"
                  >
                    Copy results as CSV
                  </button>
                </div>
                <p className="mt-3 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                  Validation thresholds: title {GUIDE.titleOptimal[0]}-{GUIDE.titleOptimal[1]} chars, description {GUIDE.descOptimal[0]}-{GUIDE.descOptimal[1]} chars. Source: Google Search Central 2024.
                </p>
              </ToolCard>

              <ToolCard
                title="Summary"
                subtitle={`${bulkSummary.total} pair${bulkSummary.total === 1 ? "" : "s"}`}
              >
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-tool-accent bg-tool-accent-soft p-3 text-center">
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                      Good
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-tool-accent">
                      {bulkSummary.ok}
                    </div>
                  </div>
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-center">
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-amber-500">
                      Off
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-amber-500">
                      {bulkSummary.warn}
                    </div>
                  </div>
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-center">
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-rose-500">
                      Bad
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-rose-500">
                      {bulkSummary.err}
                    </div>
                  </div>
                </div>
              </ToolCard>
            </div>

            <div className="mt-6">
              <ToolCard title="Validated pairs" subtitle="Per-row result">
                {bulkPairs.length === 0 ? (
                  <div className="text-xs text-muted">Add one pair per line.</div>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {bulkPairs.map((p, i) => {
                      const worst: PairStatus =
                        p.titleStatus === "error" || p.descStatus === "error"
                          ? "error"
                          : p.titleStatus === "warn" || p.descStatus === "warn"
                            ? "warn"
                            : "ok";
                      return (
                        <li
                          key={i}
                          className={`rounded-lg border bg-app-elevated p-3 ${BORDER[worst]}`}
                        >
                          <div className="flex flex-wrap items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.15em]">
                            <span className={TEXT[worst]}>
                              #{i + 1} · {worst}
                            </span>
                            <CountChip
                              status={p.titleStatus}
                              label="title"
                              value={p.titleLen}
                              range={GUIDE.titleOptimal}
                            />
                            <CountChip
                              status={p.descStatus}
                              label="desc"
                              value={p.descLen}
                              range={GUIDE.descOptimal}
                            />
                            {p.emojis > 0 && (
                              <span className="text-muted">emoji×{p.emojis}</span>
                            )}
                          </div>
                          <div className="mt-2 font-semibold text-app">
                            {p.title || <span className="text-faint">(missing title)</span>}
                          </div>
                          <div className="mt-0.5 text-secondary">
                            {p.description || (
                              <span className="text-faint">(missing description)</span>
                            )}
                          </div>
                          {p.notes.length > 0 && (
                            <ul className="mt-2 space-y-0.5 text-[0.65rem] text-muted">
                              {p.notes.map((n, j) => (
                                <li key={j}>· {n}</li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ToolCard>
            </div>
          </>
        )}
      </ToolShell>
    </div>
  );
}
