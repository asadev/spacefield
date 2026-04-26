"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

const STORAGE_TEXT = "solutions:word-count:text:v1";
const STORAGE_LANG = "solutions:word-count:lang:v1";
const STORAGE_STOP = "solutions:word-count:stop:v1";
const STORAGE_TAB = "solutions:word-count:tab:v1";

const STOPWORDS = new Set(
  `a an and the of to in for on at by with from is are was were be been being it this that these those i you he she we they them us our your their my me his her its as or but if so not no yes do does did done have has had will would can could should may might must about into over under than then there here when where why how what who which also just only very more most some any all each every own same other such only also own`.split(
    /\s+/,
  ),
);

// Reading and speaking speeds per language (words per minute).
// Silent reading: https://www.sciencedirect.com/science/article/pii/S0749596X19300786 (Brysbaert 2019).
// Speaking: average conversational pace ~130 wpm (en); adjusted by language density.
const LANGUAGE_SPEEDS: Record<string, { label: string; read: number; speak: number }> = {
  en: { label: "English", read: 238, speak: 150 },
  es: { label: "Spanish", read: 218, speak: 180 },
  fr: { label: "French", read: 214, speak: 195 },
  de: { label: "German", read: 260, speak: 179 },
  it: { label: "Italian", read: 285, speak: 188 },
  pt: { label: "Portuguese", read: 181, speak: 170 },
  nl: { label: "Dutch", read: 228, speak: 202 },
  ru: { label: "Russian", read: 184, speak: 160 },
  ar: { label: "Arabic", read: 181, speak: 150 },
  zh: { label: "Chinese (char/min)", read: 260, speak: 158 },
  ja: { label: "Japanese (char/min)", read: 230, speak: 193 },
  ko: { label: "Korean", read: 226, speak: 170 },
  hi: { label: "Hindi", read: 161, speak: 150 },
  tr: { label: "Turkish", read: 212, speak: 166 },
};

function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
}
function splitSentences(text: string): string[] {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter((s) => s.trim().length > 0);
}
function splitWords(text: string): string[] {
  return text.match(/\b[a-zA-Z][a-zA-Z'-]*\b/g) || [];
}

const DEFAULT = `Paste your content here. The counters update live as you type.

Keyword density is computed on words 3+ characters that aren't in the stopword list. Use it to spot unintended keyword stuffing or missing primary terms.`;

type Ngram = { phrase: string; count: number };

function buildNgrams(words: string[], n: 2 | 3, useStop: boolean, limit = 15): Ngram[] {
  const freq = new Map<string, number>();
  for (let i = 0; i <= words.length - n; i++) {
    const slice = words.slice(i, i + n).map((w) => w.toLowerCase());
    if (!useStop && slice.some((w) => STOPWORDS.has(w) || w.length < 2)) continue;
    const phrase = slice.join(" ");
    freq.set(phrase, (freq.get(phrase) || 0) + 1);
  }
  return [...freq.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([phrase, count]) => ({ phrase, count }));
}

// "Hemingway-style" highlighter: flag long sentences, adverbs, passive cues, weakeners.
type Highlight = {
  index: number;
  text: string;
  flags: { kind: "long" | "veryLong" | "adverb" | "passive" | "weak"; note: string }[];
};

const ADVERB_RE = /\b\w+ly\b/gi;
const PASSIVE_RE = /\b(is|are|was|were|be|been|being)\s+\w+ed\b/i;
const WEAK_WORDS = new Set(
  `very really quite rather just somewhat actually basically literally simply pretty maybe perhaps possibly`.split(
    /\s+/,
  ),
);

function buildHighlights(sentences: string[]): Highlight[] {
  return sentences.map((s, i) => {
    const words = splitWords(s);
    const wc = words.length;
    const flags: Highlight["flags"] = [];
    if (wc >= 30) flags.push({ kind: "veryLong", note: `${wc} words — split this` });
    else if (wc >= 20) flags.push({ kind: "long", note: `${wc} words — long` });
    const adverbs = (s.match(ADVERB_RE) || []).filter((w) => w.toLowerCase() !== "only" && w.length > 3);
    if (adverbs.length >= 2) flags.push({ kind: "adverb", note: `${adverbs.length} -ly adverbs` });
    if (PASSIVE_RE.test(s)) flags.push({ kind: "passive", note: "passive voice" });
    const weak = words.filter((w) => WEAK_WORDS.has(w.toLowerCase())).length;
    if (weak >= 1) flags.push({ kind: "weak", note: `${weak} weakener${weak > 1 ? "s" : ""}` });
    return { index: i, text: s, flags };
  });
}

// Complexity meter: 0-100 — higher = harder. Mixes avg sentence length + avg word length + long-sentence ratio.
function complexityScore(words: string[], sentences: string[]): number {
  if (words.length === 0 || sentences.length === 0) return 0;
  const avgWordLen = words.reduce((a, w) => a + w.length, 0) / words.length;
  const avgSentLen = words.length / sentences.length;
  const longRatio =
    sentences.filter((s) => (splitWords(s).length || 0) >= 20).length / sentences.length;
  // Empirical mapping — clamps to 0-100
  const wordPart = Math.min(40, Math.max(0, (avgWordLen - 3.5) * 16));
  const sentPart = Math.min(40, Math.max(0, (avgSentLen - 8) * 2.4));
  const longPart = Math.min(20, longRatio * 100);
  return Math.round(wordPart + sentPart + longPart);
}

function complexityBand(score: number): { label: string; tone: "easy" | "medium" | "hard" } {
  if (score < 30) return { label: "Easy read", tone: "easy" };
  if (score < 60) return { label: "Medium", tone: "medium" };
  return { label: "Dense", tone: "hard" };
}

type Tab = "write" | "stats" | "insights";

export default function WordCountPage() {
  const [text, setText] = useState(DEFAULT);
  const [lang, setLang] = useState<keyof typeof LANGUAGE_SPEEDS>("en");
  const [useStopInNgrams, setUseStopInNgrams] = useState(false);
  const [tab, setTab] = useState<Tab>("write");

  useEffect(() => {
    try {
      const t = localStorage.getItem(STORAGE_TEXT);
      if (t != null) setText(t);
      const l = localStorage.getItem(STORAGE_LANG);
      if (l && l in LANGUAGE_SPEEDS) setLang(l as keyof typeof LANGUAGE_SPEEDS);
      const s = localStorage.getItem(STORAGE_STOP);
      if (s != null) setUseStopInNgrams(s === "1");
      const tb = localStorage.getItem(STORAGE_TAB);
      if (tb === "write" || tb === "stats" || tb === "insights") setTab(tb);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TEXT, text);
    } catch {}
  }, [text]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LANG, lang);
    } catch {}
  }, [lang]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_STOP, useStopInNgrams ? "1" : "0");
    } catch {}
  }, [useStopInNgrams]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TAB, tab);
    } catch {}
  }, [tab]);

  const stats = useMemo(() => {
    const chars = text.length;
    const charsNoSpaces = text.replace(/\s/g, "").length;
    const words = splitWords(text);
    const sentences = splitSentences(text);
    const paragraphs = splitParagraphs(text);
    const speeds = LANGUAGE_SPEEDS[lang];
    // For CJK, use characters instead of words for pace
    const unit = lang === "zh" || lang === "ja" ? charsNoSpaces : words.length;
    const readMin = unit / speeds.read;
    const speakMin = unit / speeds.speak;

    // Keyword density
    const freq = new Map<string, number>();
    for (const w of words) {
      const lw = w.toLowerCase();
      if (lw.length < 3) continue;
      if (STOPWORDS.has(lw)) continue;
      freq.set(lw, (freq.get(lw) || 0) + 1);
    }
    const total = [...freq.values()].reduce((a, b) => a + b, 0);
    const top = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, count]) => ({
        word,
        count,
        density: total > 0 ? (count / total) * 100 : 0,
      }));

    const bigrams = buildNgrams(words, 2, useStopInNgrams);
    const trigrams = buildNgrams(words, 3, useStopInNgrams);

    return {
      chars,
      charsNoSpaces,
      words: words.length,
      sentences: sentences.length,
      paragraphs: paragraphs.length,
      readMin,
      speakMin,
      top,
      bigrams,
      trigrams,
      // Visual-only derived data — math is identical to before; just exposed for the new shell.
      sentenceList: sentences,
      complexity: complexityScore(words, sentences),
    };
  }, [text, lang, useStopInNgrams]);

  const formatTime = (mins: number): string => {
    if (mins <= 0 || !isFinite(mins)) return "0s";
    if (mins < 1) return `${Math.round(mins * 60)}s`;
    if (mins < 60) return `${Math.floor(mins)}m ${Math.round((mins % 1) * 60)}s`;
    return `${Math.floor(mins / 60)}h ${Math.floor(mins % 60)}m`;
  };

  const exportReport = () => {
    const l = LANGUAGE_SPEEDS[lang];
    const lines = [
      `Word Count Report`,
      `================`,
      ``,
      `Language: ${l.label} (read ${l.read} wpm / speak ${l.speak} wpm)`,
      `Characters (with spaces): ${stats.chars}`,
      `Characters (no spaces): ${stats.charsNoSpaces}`,
      `Words: ${stats.words}`,
      `Sentences: ${stats.sentences}`,
      `Paragraphs: ${stats.paragraphs}`,
      `Reading time: ${formatTime(stats.readMin)}`,
      `Speaking time: ${formatTime(stats.speakMin)}`,
      ``,
      `Keyword density (top 20):`,
    ];
    for (const t of stats.top) {
      lines.push(`  ${t.word} — ${t.count}x (${t.density.toFixed(1)}%)`);
    }
    lines.push(``, `Top bigrams:`);
    stats.bigrams.forEach((b) => lines.push(`  ${b.phrase} — ${b.count}x`));
    lines.push(``, `Top trigrams:`);
    stats.trigrams.forEach((t) => lines.push(`  ${t.phrase} — ${t.count}x`));
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "word-count-report.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const translateExport = () => {
    // Translation-ready export: sentences on separate lines with zero-width markers
    // so translators can preserve structure. CSV: id,source,target(blank).
    const sentences = splitSentences(text);
    const header = "id,source,target";
    const rows = sentences.map((s, i) => {
      const esc = s.replace(/"/g, '""');
      return `${i + 1},"${esc}",""`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "translate-ready.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const translateTxtExport = () => {
    // Numbered sentences plain-text — easy to paste into any MT tool.
    const sentences = splitSentences(text);
    const lines = sentences.map((s, i) => `${i + 1}. ${s}`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "translate-ready.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const highlights = useMemo(() => buildHighlights(stats.sentenceList), [stats.sentenceList]);
  const flagCounts = useMemo(() => {
    const c = { long: 0, veryLong: 0, adverb: 0, passive: 0, weak: 0 };
    for (const h of highlights) {
      for (const f of h.flags) c[f.kind]++;
    }
    return c;
  }, [highlights]);

  const band = complexityBand(stats.complexity);
  const maxTopCount = stats.top[0]?.count || 1;

  return (
    <ToolShell
      category="Writing & Content"
      title="Word Count"
      description="Real-time counts, language-aware reading/speaking time, keyword density, bigram and trigram analysis, translate-ready CSV export."
    >
      <div data-tool-theme="content" data-tool="word-count">
        {/* Hero — yellow editorial sweep with live word count */}
        <div className="tool-hero mb-6 rounded-2xl border border-app bg-tool-surface p-5 lg:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-1 text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                Live editor
              </div>
              <div className="font-tool-heading flex items-baseline gap-3 text-app">
                <span className="text-4xl font-bold tabular-nums lg:text-5xl">
                  {stats.words.toLocaleString()}
                </span>
                <span className="text-sm font-medium text-secondary">words</span>
                <span className="text-muted">·</span>
                <span className="text-lg font-semibold tabular-nums text-secondary">
                  {stats.chars.toLocaleString()}
                </span>
                <span className="text-sm text-secondary">chars</span>
                <span className="text-muted">·</span>
                <span className="text-lg font-semibold tabular-nums text-secondary">
                  {formatTime(stats.readMin)}
                </span>
                <span className="text-sm text-secondary">read</span>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="inline-flex rounded-xl border border-app bg-app-elevated p-1">
              {(["write", "stats", "insights"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold capitalize transition ${
                    tab === t
                      ? "bg-tool-accent text-white shadow-sm"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* WRITE: serif editor + stats panel */}
        {tab === "write" && (
          <div className="overflow-hidden rounded-2xl border border-app bg-app-elevated">
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
              {/* Editor */}
              <div className="border-b border-app p-5 lg:border-b-0 lg:border-r">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[0.6rem] uppercase tracking-[0.22em] text-muted">
                    Manuscript
                  </div>
                  <div className="flex items-center gap-2 text-[0.6rem] tabular-nums text-muted">
                    <span>{stats.words.toLocaleString()} words</span>
                    <span className="opacity-50">·</span>
                    <span>{stats.chars.toLocaleString()} chars</span>
                  </div>
                </div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Start typing or paste your draft..."
                  className="font-tool-heading min-h-[480px] w-full resize-y bg-transparent text-base leading-[1.75] tracking-[-0.005em] text-app placeholder:text-muted focus:outline-none"
                />

                {/* Controls strip */}
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                      Language
                    </span>
                    <select
                      value={lang}
                      onChange={(e) => setLang(e.target.value as keyof typeof LANGUAGE_SPEEDS)}
                      className="rounded-md border border-app bg-app px-2.5 py-1.5 text-xs text-app focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent/30"
                    >
                      {Object.entries(LANGUAGE_SPEEDS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex h-[34px] items-center gap-2 rounded-md border border-app bg-app px-3 text-[0.7rem] text-secondary">
                    <input
                      type="checkbox"
                      checked={useStopInNgrams}
                      onChange={(e) => setUseStopInNgrams(e.target.checked)}
                      className="h-3 w-3"
                      style={{ accentColor: "var(--tool-accent)" }}
                    />
                    Include stopwords in n-grams
                  </label>
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    <button
                      onClick={exportReport}
                      className="rounded-md border border-app bg-app px-2.5 py-1.5 text-[0.65rem] font-medium text-secondary transition hover:border-tool-accent hover:bg-tool-accent-soft hover:text-tool-accent"
                    >
                      Export report
                    </button>
                    <button
                      onClick={translateExport}
                      className="rounded-md border border-app bg-app px-2.5 py-1.5 text-[0.65rem] font-medium text-secondary transition hover:border-tool-accent hover:bg-tool-accent-soft hover:text-tool-accent"
                    >
                      Translate CSV
                    </button>
                    <button
                      onClick={translateTxtExport}
                      className="rounded-md border border-app bg-app px-2.5 py-1.5 text-[0.65rem] font-medium text-secondary transition hover:border-tool-accent hover:bg-tool-accent-soft hover:text-tool-accent"
                    >
                      Translate .txt
                    </button>
                    <button
                      onClick={() => setText("")}
                      className="rounded-md border border-app bg-app px-2.5 py-1.5 text-[0.65rem] font-medium text-secondary transition hover:border-rose-500 hover:bg-rose-500/10 hover:text-rose-500"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              {/* Stats panel */}
              <div className="bg-tool-surface p-5">
                <div className="mb-3 text-[0.6rem] uppercase tracking-[0.22em] text-muted">
                  Live stats
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <BigStat label="Words" value={stats.words.toLocaleString()} hero />
                  <BigStat label="Characters" value={stats.chars.toLocaleString()} />
                  <BigStat label="Sentences" value={stats.sentences.toLocaleString()} />
                  <BigStat
                    label="Reading"
                    value={formatTime(stats.readMin)}
                    subtitle={`${LANGUAGE_SPEEDS[lang].read} wpm`}
                  />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MiniStat label="No spaces" value={stats.charsNoSpaces.toLocaleString()} />
                  <MiniStat label="Paragraphs" value={stats.paragraphs.toLocaleString()} />
                  <MiniStat label="Speaking" value={formatTime(stats.speakMin)} />
                </div>

                {/* Complexity meter */}
                <div className="mt-5 rounded-xl border border-app bg-app-elevated p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[0.6rem] uppercase tracking-[0.22em] text-muted">
                      Complexity
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold ${
                        band.tone === "easy"
                          ? "bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/30"
                          : band.tone === "medium"
                            ? "bg-tool-accent-soft text-tool-accent ring-1 ring-tool-accent/30"
                            : "bg-rose-500/15 text-rose-500 ring-1 ring-rose-500/30"
                      }`}
                    >
                      {band.label}
                    </span>
                  </div>
                  <div className="relative h-2.5 overflow-hidden rounded-full bg-app">
                    <div
                      className={`h-full rounded-full transition-all ${
                        band.tone === "easy"
                          ? "bg-emerald-500"
                          : band.tone === "medium"
                            ? "bg-tool-accent"
                            : "bg-rose-500"
                      }`}
                      style={{ width: `${Math.max(2, stats.complexity)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[0.55rem] tabular-nums text-muted">
                    <span>0</span>
                    <span className="font-semibold text-secondary">
                      {stats.complexity}/100
                    </span>
                    <span>100</span>
                  </div>
                </div>

                <p className="mt-3 text-[0.55rem] leading-relaxed text-muted">
                  Reading speeds: Brysbaert 2019 silent-reading meta-analysis. Speaking pace:
                  average conversational rate per language.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* STATS: chip cloud + density table + ngrams */}
        {tab === "stats" && (
          <div className="space-y-6">
            {/* Most-used-words chip cloud */}
            <div className="overflow-hidden rounded-2xl border border-app bg-tool-surface">
              <div className="flex items-baseline justify-between border-b border-app px-5 py-3">
                <div>
                  <div className="text-sm font-semibold text-app">Most-used words</div>
                  <div className="text-[0.65rem] text-muted">
                    Top 20 — stopwords filtered, sized by frequency
                  </div>
                </div>
                <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[0.6rem] font-semibold text-tool-accent">
                  {stats.top.length}
                </span>
              </div>
              <div className="p-5">
                {stats.top.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-app p-8 text-center text-xs text-muted">
                    Not enough content yet.
                  </div>
                ) : (
                  <div className="flex flex-wrap items-baseline gap-2">
                    {stats.top.map((t) => {
                      // Map count to a 0.85 → 1.85 rem font scale
                      const scale = 0.85 + (t.count / maxTopCount) * 1.0;
                      const intensity = Math.min(1, 0.4 + (t.count / maxTopCount) * 0.6);
                      return (
                        <span
                          key={t.word}
                          className="inline-flex items-baseline gap-1.5 rounded-full border border-tool-accent/25 bg-tool-accent-soft px-3 py-1 font-medium text-tool-accent transition hover:scale-105"
                          style={{ fontSize: `${scale}rem`, lineHeight: 1.1, opacity: intensity }}
                          title={`${t.count}× · ${t.density.toFixed(1)}%`}
                        >
                          {t.word}
                          <span className="text-[0.55rem] tabular-nums opacity-70">{t.count}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Keyword density table */}
            <div className="overflow-hidden rounded-2xl border border-app bg-app-elevated">
              <div className="flex items-baseline justify-between border-b border-app px-5 py-3">
                <div>
                  <div className="text-sm font-semibold text-app">Keyword density</div>
                  <div className="text-[0.65rem] text-muted">
                    Term frequency as % of meaningful words
                  </div>
                </div>
              </div>
              <div className="p-5">
                {stats.top.length === 0 ? (
                  <div className="text-xs text-muted">Not enough content.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                          <th className="py-2 pr-4">#</th>
                          <th className="py-2 pr-4">Term</th>
                          <th className="py-2 pr-4">Count</th>
                          <th className="py-2 pr-4">Density</th>
                          <th className="py-2">Bar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.top.map((t, i) => (
                          <tr key={t.word} className="border-t border-app">
                            <td className="py-1.5 pr-4 text-muted">{i + 1}</td>
                            <td className="py-1.5 pr-4 font-mono text-app">{t.word}</td>
                            <td className="py-1.5 pr-4 text-secondary">{t.count}</td>
                            <td className="py-1.5 pr-4 font-semibold text-tool-accent">
                              {t.density.toFixed(1)}%
                            </td>
                            <td className="w-1/2 py-1.5">
                              <div className="h-1.5 overflow-hidden rounded-full bg-app">
                                <div
                                  className="h-full rounded-full bg-tool-accent transition-all"
                                  style={{ width: `${Math.min(100, t.density * 4)}%` }}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Bigrams + trigrams */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <NgramCard
                title="Top bigrams"
                subtitle="2-word phrases (count ≥ 2)"
                items={stats.bigrams}
              />
              <NgramCard
                title="Top trigrams"
                subtitle="3-word phrases (count ≥ 2)"
                items={stats.trigrams}
              />
            </div>
          </div>
        )}

        {/* INSIGHTS: Hemingway-style highlights */}
        {tab === "insights" && (
          <div className="overflow-hidden rounded-2xl border border-app bg-app-elevated">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app px-5 py-3">
              <div>
                <div className="text-sm font-semibold text-app">Sentence highlights</div>
                <div className="text-[0.65rem] text-muted">
                  Long lines, adverb stacks, passive voice and weakeners — flagged Hemingway-style
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <FlagPill tone="hard" label="Very long" count={flagCounts.veryLong} />
                <FlagPill tone="warn" label="Long" count={flagCounts.long} />
                <FlagPill tone="adverb" label="Adverbs" count={flagCounts.adverb} />
                <FlagPill tone="passive" label="Passive" count={flagCounts.passive} />
                <FlagPill tone="weak" label="Weakeners" count={flagCounts.weak} />
              </div>
            </div>
            <div className="p-5">
              {highlights.length === 0 ? (
                <div className="rounded-xl border border-dashed border-app p-8 text-center text-xs text-muted">
                  Type something — sentences will appear here with style flags.
                </div>
              ) : (
                <div className="font-tool-heading max-h-[520px] space-y-2 overflow-y-auto pr-2 text-[0.95rem] leading-[1.75] text-app">
                  {highlights.map((h) => {
                    const top = h.flags[0];
                    const bg = !top
                      ? ""
                      : top.kind === "veryLong"
                        ? "bg-rose-500/15 ring-1 ring-rose-500/25 hover:bg-rose-500/20"
                        : top.kind === "long"
                          ? "bg-amber-400/15 ring-1 ring-amber-500/25 hover:bg-amber-400/20"
                          : top.kind === "passive"
                            ? "bg-sky-500/12 ring-1 ring-sky-500/25 hover:bg-sky-500/18"
                            : top.kind === "adverb"
                              ? "bg-violet-500/12 ring-1 ring-violet-500/25 hover:bg-violet-500/18"
                              : "bg-tool-accent-soft ring-1 ring-tool-accent/25 hover:brightness-110";
                    return (
                      <span
                        key={h.index}
                        className={`group inline-block rounded-md px-1.5 py-0.5 transition ${bg} ${!top ? "" : "cursor-help"}`}
                        title={h.flags.map((f) => f.note).join(" · ") || undefined}
                      >
                        {h.text}
                        {h.flags.length > 0 && (
                          <span className="ml-1.5 inline-flex translate-y-[-1px] items-center gap-1 align-middle text-[0.55rem] font-semibold uppercase tracking-[0.15em] opacity-70 group-hover:opacity-100">
                            {h.flags.map((f) => f.note).join(" · ")}
                          </span>
                        )}{" "}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ToolShell>
  );
}

function BigStat({
  label,
  value,
  subtitle,
  hero = false,
}: {
  label: string;
  value: string;
  subtitle?: string;
  hero?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3.5 ${
        hero
          ? "border-tool-accent/30 bg-tool-accent-soft"
          : "border-app bg-app-elevated"
      }`}
    >
      <div className="text-[0.55rem] uppercase tracking-[0.22em] text-muted">{label}</div>
      <div
        className={`font-tool-heading mt-1 text-[1.85rem] font-bold leading-none tracking-tight tabular-nums ${
          hero ? "text-tool-accent" : "text-app"
        }`}
      >
        {value}
      </div>
      {subtitle && (
        <div className="mt-1 text-[0.55rem] tabular-nums text-muted">{subtitle}</div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-app bg-app-elevated px-2.5 py-1.5">
      <div className="text-[0.5rem] uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-app">{value}</div>
    </div>
  );
}

function FlagPill({
  tone,
  label,
  count,
}: {
  tone: "hard" | "warn" | "adverb" | "passive" | "weak";
  label: string;
  count: number;
}) {
  const cls =
    tone === "hard"
      ? "bg-rose-500/15 text-rose-500 ring-1 ring-rose-500/25"
      : tone === "warn"
        ? "bg-amber-400/15 text-amber-500 ring-1 ring-amber-500/25"
        : tone === "passive"
          ? "bg-sky-500/12 text-sky-500 ring-1 ring-sky-500/25"
          : tone === "adverb"
            ? "bg-violet-500/12 text-violet-500 ring-1 ring-violet-500/25"
            : "bg-tool-accent-soft text-tool-accent ring-1 ring-tool-accent/25";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6rem] font-semibold ${cls} ${count === 0 ? "opacity-40" : ""}`}
    >
      {label}
      <span className="rounded-full bg-app px-1.5 py-0.5 text-[0.55rem] tabular-nums">
        {count}
      </span>
    </span>
  );
}

function NgramCard({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: Ngram[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-app bg-app-elevated">
      <div className="border-b border-app px-5 py-3">
        <div className="text-sm font-semibold text-app">{title}</div>
        <div className="text-[0.65rem] text-muted">{subtitle}</div>
      </div>
      <div className="p-5">
        {items.length === 0 ? (
          <div className="text-xs text-muted">No repeated phrases.</div>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {items.map((item) => (
              <li
                key={item.phrase}
                className="flex items-center justify-between rounded-md border border-app bg-tool-surface px-2.5 py-1.5 transition hover:border-tool-accent/40"
              >
                <span className="font-mono text-app">{item.phrase}</span>
                <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 font-semibold text-tool-accent">
                  {item.count}×
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
