"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field } from "../../_components/ToolCard";

const CLASSIC = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum".split(" ");

const HIPSTER = "artisan beard vinyl mustache kombucha brooklyn cold-brew taxidermy narwhal humblebrag chia kale pabst banjo shabby-chic fanny-pack pour-over mason-jar gluten-free authentic locavore biodiesel fixie pickled kickstarter asymmetrical listicle thundercats salvia snackwave literally organic wayfarer blog".split(" ");

const CORPORATE = "synergy leverage disruptive paradigm scalable robust empower ideate innovate optimize actionable deliverable stakeholder alignment bandwidth circle-back deep-dive pivot streamline holistic iterate bleeding-edge low-hanging-fruit move-the-needle value-add cross-functional end-to-end future-proof game-changer thought-leader hyperlocal mission-critical core-competency".split(" ");

const PIRATE = "ahoy avast matey scurvy doubloon bilge kraken parley plunder grog landlubber yo-ho-ho scallywag cutlass treasure yarr sea-dog booty jolly-roger savvy blimey buccaneer chantey hornpipe keelhaul marooned navigator sloop privateer cannonball tide spar tricorn rum shiver-me-timbers".split(" ");

const CYBER = "cyberpunk neon matrix encrypted firewall protocol datastream hyperlink augmentation netrunner chrome implant biohack wetware vaporwave glitch override mainframe sysadmin daemon packet zero-day exploit backdoor cipher vector payload rootkit kernel-panic latency bandwidth zeta tachyon polygon simulated recursive neural lattice subroutine holographic".split(" ");

const MEDIEVAL = "thee thou hast thy doth verily forsooth hark mine knight squire castle tower dungeon dragon quest valor honor chivalry minstrel jester crown crest shield blade parchment scroll tome wizard alchemy potion enchanted cursed blessed realm fief vassal serf bard scribe pilgrimage crusade ye dost whither yonder hither".split(" ");

const VARIANTS = {
  classic: { words: CLASSIC, start: "Lorem ipsum dolor sit amet" },
  hipster: { words: HIPSTER, start: "Artisan kombucha vinyl brooklyn" },
  corporate: { words: CORPORATE, start: "Leverage synergy to ideate deliverables" },
  pirate: { words: PIRATE, start: "Yarr avast matey ahoy scurvy" },
  cyber: { words: CYBER, start: "Neon cyberpunk protocol datastream vaporwave" },
  medieval: { words: MEDIEVAL, start: "Hark thee dost hath thy verily" },
} as const;

type Variant = keyof typeof VARIANTS;
type Unit = "paragraphs" | "sentences" | "words" | "list";
type OutputFmt = "plain" | "html" | "markdown";

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

// Deterministic-ish pseudo-random based on seed so regenerate is explicit.
function rng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function makeSentence(words: string[], rand: () => number, wordCount: number, start?: string): string {
  const len = Math.max(3, wordCount);
  const out: string[] = [];
  for (let i = 0; i < len; i++) out.push(pick(words, rand));
  let s = out.join(" ");
  if (start) s = start.toLowerCase() + " " + s.split(" ").slice(5).join(" ");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  // sprinkle commas
  if (len > 8 && rand() > 0.5) {
    const idx = Math.floor(len / 2);
    const parts = s.split(" ");
    parts[idx] = parts[idx] + ",";
    s = parts.join(" ");
  }
  return s + ".";
}

function generate(opts: {
  variant: Variant;
  unit: Unit;
  count: number;
  wordsPerPara: number;
  startClassic: boolean;
  seed: number;
}): string {
  const { words, start } = VARIANTS[opts.variant];
  const rand = rng(opts.seed);

  if (opts.unit === "words") {
    const out: string[] = [];
    for (let i = 0; i < opts.count; i++) out.push(pick(words, rand));
    let txt = out.join(" ");
    txt = txt.charAt(0).toUpperCase() + txt.slice(1);
    return txt + ".";
  }

  if (opts.unit === "list") {
    const out: string[] = [];
    for (let i = 0; i < opts.count; i++) {
      const len = 3 + Math.floor(rand() * 5);
      const items: string[] = [];
      for (let j = 0; j < len; j++) items.push(pick(words, rand));
      let line = items.join(" ");
      line = line.charAt(0).toUpperCase() + line.slice(1);
      out.push(`- ${line}`);
    }
    return out.join("\n");
  }

  if (opts.unit === "sentences") {
    const sentences: string[] = [];
    for (let i = 0; i < opts.count; i++) {
      const len = 8 + Math.floor(rand() * 10);
      sentences.push(makeSentence(words, rand, len, i === 0 && opts.startClassic ? start : undefined));
    }
    return sentences.join(" ");
  }

  // paragraphs
  const paragraphs: string[] = [];
  for (let p = 0; p < opts.count; p++) {
    const targetWords = opts.wordsPerPara;
    const sentences: string[] = [];
    let usedWords = 0;
    let first = true;
    while (usedWords < targetWords) {
      const len = 8 + Math.floor(rand() * 10);
      sentences.push(makeSentence(words, rand, len, first && p === 0 && opts.startClassic ? start : undefined));
      usedWords += len;
      first = false;
    }
    paragraphs.push(sentences.join(" "));
  }
  return paragraphs.join("\n\n");
}

function formatOutput(raw: string, unit: Unit, fmt: OutputFmt): string {
  if (fmt === "plain") return raw;
  if (unit !== "paragraphs") return raw;
  const paras = raw.split(/\n\n+/);
  if (fmt === "html") return paras.map((p) => `<p>${p}</p>`).join("\n");
  // markdown: paragraphs already separated by blank lines
  return paras.join("\n\n");
}

const PARA_PRESETS = [1, 3, 5, 10];
const WORD_PRESETS = [50, 100, 200, 500];

export default function LoremIpsumGeneratorPage() {
  const [variant, setVariant] = useState<Variant>("classic");
  const [unit, setUnit] = useState<Unit>("paragraphs");
  const [count, setCount] = useState(3);
  const [wordsPerPara, setWordsPerPara] = useState(80);
  const [startClassic, setStartClassic] = useState(true);
  const [seed, setSeed] = useState(1);
  const [outputFmt, setOutputFmt] = useState<OutputFmt>("plain");
  const [copied, setCopied] = useState(false);

  const raw = useMemo(
    () => generate({ variant, unit, count, wordsPerPara, startClassic, seed }),
    [variant, unit, count, wordsPerPara, startClassic, seed],
  );
  const text = useMemo(() => formatOutput(raw, unit, outputFmt), [raw, unit, outputFmt]);

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* noop */
    }
  };

  const charCount = text.length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const paragraphs = useMemo(() => raw.split(/\n\n+/), [raw]);

  const maxCount =
    unit === "paragraphs" ? 50 : unit === "sentences" ? 100 : unit === "list" ? 40 : 500;

  const unitLabel =
    unit === "words"
      ? "Words"
      : unit === "sentences"
        ? "Sentences"
        : unit === "list"
          ? "List items"
          : "Paragraphs";

  return (
    <div data-tool-theme="design" data-tool="lorem-ipsum-generator">
      <ToolShell
        category="Data & Developer"
        title="Lorem Ipsum Generator"
        description="Classic, hipster, corporate, or pirate placeholder text. Configure paragraphs, sentences, or raw word count."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              {variant}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {unit}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              lorem.specimen
              <span className="text-faint">/</span>
              <span className="text-secondary">
                №{String(seed).padStart(3, "0")}.{outputFmt}
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              {count}{unit === "paragraphs" ? `×~${wordsPerPara}w` : ""}
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Type Specimen · Placeholder Text
                </div>

                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                  <span className="italic">Aa</span>{" "}
                  <span className="text-secondary">Bb Cc</span>{" "}
                  <span className="text-tool-accent">Dd</span>{" "}
                  <span className="text-muted">Ee Ff</span>
                </h2>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent">
                    {wordCount} words
                  </span>
                  <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent">
                    {charCount} chars
                  </span>
                  <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent">
                    {paragraphs.length} ¶
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setSeed((s) => s + 1)}
                  className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                >
                  ↻ Regenerate
                </button>
                <button
                  onClick={copy}
                  className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                  style={{ color: "var(--bg)" }}
                >
                  {copied ? "✓ Copied" : "⧉ Copy"}
                </button>
              </div>
            </div>
          </div>

          {/* sub-tab strip — output mode (segmented pills) */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(["paragraphs", "sentences", "words", "list"] as Unit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] capitalize transition-colors ${
                    unit === u
                      ? "bg-tool-accent text-app-elevated"
                      : "text-secondary hover:text-app"
                  }`}
                  style={unit === u ? { color: "var(--bg)" } : undefined}
                >
                  {u}
                </button>
              ))}
            </div>

            {unit === "paragraphs" && (
              <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
                {(["plain", "html", "markdown"] as OutputFmt[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setOutputFmt(f)}
                    className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                      outputFmt === f
                        ? "bg-tool-accent-soft text-tool-accent"
                        : "text-secondary hover:text-app"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}

            {variant === "classic" && unit !== "words" && unit !== "list" && (
              <label className="ml-1 flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                <input
                  type="checkbox"
                  checked={startClassic}
                  onChange={(e) => setStartClassic(e.target.checked)}
                  className="accent-tool-accent"
                  style={{ accentColor: "var(--tool-accent)" }}
                />
                Begin with classic
              </label>
            )}
          </div>
        </section>

        {/* =========== CONTROL PANEL + OUTPUT =========== */}
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          {/* LEFT: CONTROLS */}
          <aside className="space-y-5">
            <ToolCard title="Variant" subtitle="Word dictionary">
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(VARIANTS) as Variant[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVariant(v)}
                    className={`rounded-lg border px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.14em] capitalize transition-colors ${
                      variant === v
                        ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                        : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-app"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </ToolCard>

            <ToolCard
              title={unitLabel}
              subtitle={`How many · 1–${maxCount}`}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {PARA_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setCount(Math.min(maxCount, p))}
                    className={`min-w-[3rem] rounded-lg border px-3 py-1 font-mono text-xs transition-colors ${
                      count === p
                        ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                        : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-app"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <Field label="Custom">
                  <input
                    type="number"
                    min={1}
                    max={maxCount}
                    value={count}
                    onChange={(e) =>
                      setCount(
                        Math.max(1, Math.min(maxCount, parseInt(e.target.value) || 1)),
                      )
                    }
                    className="w-24 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-center font-mono text-xs text-app outline-none transition-colors focus:border-tool-accent"
                  />
                </Field>
              </div>
            </ToolCard>

            {unit === "paragraphs" && (
              <ToolCard title="Words / paragraph" subtitle="50–150">
                <div className="flex flex-wrap items-center gap-1.5">
                  {WORD_PRESETS.map((w) => {
                    const clamped = Math.max(50, Math.min(150, w));
                    const active = wordsPerPara === clamped;
                    return (
                      <button
                        key={w}
                        onClick={() => setWordsPerPara(clamped)}
                        className={`min-w-[3.5rem] rounded-lg border px-3 py-1 font-mono text-xs transition-colors ${
                          active
                            ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                            : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-app"
                        } ${w > 150 ? "opacity-60" : ""}`}
                        title={w > 150 ? `Clamped to 150` : undefined}
                      >
                        {clamped}
                      </button>
                    );
                  })}
                  <input
                    type="number"
                    min={50}
                    max={150}
                    value={wordsPerPara}
                    onChange={(e) =>
                      setWordsPerPara(
                        Math.max(50, Math.min(150, parseInt(e.target.value) || 50)),
                      )
                    }
                    className="w-20 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-center font-mono text-xs text-app outline-none transition-colors focus:border-tool-accent"
                  />
                </div>
              </ToolCard>
            )}

            <ToolCard title="Stats" subtitle="Live readout">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-2">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    Words
                  </div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-tool-accent">
                    {wordCount}
                  </div>
                </div>
                <div className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-2">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    Chars
                  </div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-tool-accent">
                    {charCount}
                  </div>
                </div>
                <div className="rounded-lg border border-tool-accent bg-tool-accent-soft px-3 py-2">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    Blocks
                  </div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-tool-accent">
                    {paragraphs.length}
                  </div>
                </div>
              </div>
            </ToolCard>
          </aside>

          {/* RIGHT: OUTPUT PREVIEW */}
          <ToolCard title="Specimen" subtitle={`${variant} · ${unit} · №${String(seed).padStart(3, "0")}`}>
            <div className="rounded-xl border border-app bg-app-elevated">
              <div className="flex items-center justify-between border-b border-app px-4 py-2">
                <div className="flex items-center gap-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                  <span className="text-tool-accent">▸</span>
                  preview.{outputFmt}
                </div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                  {wordCount}w · {charCount}c
                </div>
              </div>

              <div className="px-5 py-6 sm:px-7 sm:py-8">
                {outputFmt === "html" && unit === "paragraphs" ? (
                  <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap font-mono text-[0.85rem] leading-relaxed text-app">
                    {text}
                  </pre>
                ) : unit === "list" ? (
                  <ul className="space-y-1.5 text-[0.95rem] leading-[1.7] text-app">
                    {raw.split("\n").map((line, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-tool-accent">▸</span>
                        <span>{line.replace(/^-\s*/, "")}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="space-y-5 text-[1.05rem] leading-[1.75] text-app sm:text-[1.1rem]">
                    {paragraphs.map((p, i) => (
                      <p
                        key={i}
                        className={
                          i === 0 && unit === "paragraphs"
                            ? "first-letter:float-left first-letter:mr-2 first-letter:text-5xl first-letter:font-semibold first-letter:leading-[0.85] first-letter:text-tool-accent sm:first-letter:text-6xl"
                            : ""
                        }
                      >
                        {p}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-app bg-app px-4 py-2.5">
                <div className="flex items-center gap-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                  <span>{wordCount} w</span>
                  <span className="text-faint">·</span>
                  <span>{charCount} c</span>
                  <span className="text-faint">·</span>
                  <span>{paragraphs.length} ¶</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setSeed((s) => s + 1)}
                    className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                  >
                    ↻ Regenerate
                  </button>
                  <button
                    onClick={copy}
                    className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                    style={{ color: "var(--bg)" }}
                  >
                    {copied ? "✓ Copied" : "⧉ Copy"}
                  </button>
                </div>
              </div>
            </div>
          </ToolCard>
        </div>
      </ToolShell>
    </div>
  );
}
