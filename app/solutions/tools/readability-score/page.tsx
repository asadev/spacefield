"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

// Rough syllable counter: good enough for readability scoring.
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const cleaned = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "");
  const matches = cleaned.match(/[aeiouy]{1,2}/g);
  return matches ? Math.max(1, matches.length) : 1;
}

function isComplex(word: string): boolean {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.endsWith("es") || w.endsWith("ed") || w.endsWith("ing")) {
    return countSyllables(w) > 3;
  }
  return countSyllables(w) >= 3;
}

const DALE_CHALL_EASY = new Set(
  `a about above across act add afraid after again against age ago agree ahead aid air airplane all almost alone along already also always am among an and angel anger angry animal another answer ant any anyone anything anywhere apart apple are area arm army around arrive arrow art as ask asleep at ate attack attention aunt auto autumn away awful baby back bad bag ball balloon band bang bank bar bare bark barn base basket bat bath battle be bean bear beat beautiful became because become bed bee been before began begin behave behind being believe bell belong below beside best better between beyond bicycle big bill bird birthday bit black blanket bless blew blind block blood blow blue board boat body bone book born borrow both bother bottle bottom bought bow box boy brain branch brave bread break breakfast breath brick bridge bright bring broke broken brook broom brother brought brown brush build built burn burst bush busy but butter buy by cabin cake call came camp can candle candy cane cannot cap cape captain car card care careful carry case castle cat catch caught cause cent center certain chain chair chance change charge chase cheap cheer cheese cherry chicken chief child children choice choose chop church cigarette circle city class classroom clay clean clear climb clock close cloth clothes cloud coal coat coffee cold collar color come coming company complete contain cook cool corn corner cost cottage cotton could count country course cousin cover cow crack crawl cream creek crept cross crowd crown cry cup curtain cut daily dance dark date daughter day dead dear decide deep deer den desk did die different dig dinner dirt dirty dish do doctor does dog doll dollar done door down draw drawer dream dress drink drive drop drown drum dry duck dug during dust each ear early earn earth east easy eat edge egg eight either elbow elephant else empty end enemy engine enjoy enough enter even evening ever every everyone everything except excited exciting expect eye face fact fair fairy fall family famous fan far farm farmer fast fat father favor feather feed feel feet fell fellow fence few field fifteen fifty fight figure fill finally find fine finger finish fire firm first fish five fix flag flame flash flat flew floor flour flower fly fog follow food fool foolish foot for forehead forest forever forget forgot form forth forty forward found four fourth fox free fresh friend from front fruit full fun funny fur gain game garden gate gave geese general gentle gentleman get giant gift girl give glad glass go goes going gold gone good goodbye goodness goose got grade grain grand grandfather grandmother grandpa grass gravel gray great green grew ground group grow guard guess gun had hair half hall hand handle hang happen happy hard harm has hat hatch have having hay he head heap hear heard heart heat heavy held hello help hen her here herself hid hide high hill him himself his hit hog hold hole holiday home honey hook hope horn horse hospital hot hotel hour house how huge human hundred hung hungry hunt hurry hurt i ice idea if ill immediately important in inch indeed inside instead into iron is island it its itself job join joke joy judge jump just keep kept key kick kill kind king kiss kitchen kite kitten knee knew knife knock know known lady laid lake lamp land language lap large last late laugh laundry law lay lazy lead leader leaf learn least leather leave led left leg lemon length less lesson let letter level library lick lid life lift light like line lion lip list listen little live load loaf long look loose lose lost lot loud love low luck lump lunch machine made main make man manner many map march mark market master match matter may maybe me meal mean measure meat meet melt men mend mention met middle midnight might mile milk mill mind mine minute mirror miss mistake mix moment money monkey month moo moon more morning most mother mountain mouse mouth move mr mrs much mud music must my nail name near neat neck need needle neighbor neither nest never new newspaper next nice night nine no nobody nod noise none noon nor north nose not note nothing notice now number nurse nut oak obey ocean odd of off offer office often oh oil old on once one only open or order other our out outside over overalls own owe ox pack page paid pail pain paint pair pal palace pale pan pants papa paper parade park part party pass past paste pasture path pay peace pen people perhaps person pet pick picnic picture pie piece pig pile pill pin pine pink pipe place plain plan plant play playmate please plenty plow plum pocket poem point poke police pond poor pop porch possible post postman pot potato pound pour powder power prayer present pretty price prince princess prison prize probably problem promise proud prove pull pump puppy pupil purple push put quack quart queen question quick quiet quite rabbit race rag rain raise ran ranch rang rat rather reach read ready real realize really reason receive red refuse remain remember repeat reply rest return rib rice rich ride right ring river road roar rob rock roll roof room root rope rose round row rub rubber rug run sad safe safety said sail sailor salt same sand sandwich sang sank sat save saw say scare school science scold scratch sea seal seat second secret see seed seem seen sell send sent serve set settle seven several sew shade shake shall shame shape sharp she sheep shell shine ship shirt shoe shoemaker shone shoot shop shore short should shoulder shout show shower sick side sight sign silk silver simple since sing single sir sister sit six size skate skin sky sled sleep slept slide slow slowly small smart smell smile smoke smooth snake snow so soak soap sock soft soil sold soldier some somebody someone something sometime somewhere son song soon sorrow sorry sort sound soup south space speak speech speed spell spend spent spider spin spirit splash spoke spoon sport spot spray spread spring square stable stack stage stairs stand star stare start state station stay steal steam steel steep step stick still stir stone stood stop store storm story stove straight strange stranger straw stream street stretch strike string strong struck student study stuff such suck sudden suddenly sugar suit summer sun sunlight sunny sunrise sunset supper suppose sure surface surprise sweet swim swing table tail tailor take tale talk tall tank tap taste taught tea teach teacher team tear tell ten tent terrible test than thank that the their them themselves then there these they thick thin thing think third thirty this those though thought thousand thread three threw throat through throw thumb thunder tick tie tiger tight till time tin tiny tip tire tired to today together told tomorrow tongue tonight too took top tore touch tow toward towel tower town toy track trade train trap travel tree trick tried trip trot trouble truck true truly trunk trust truth try tub tug tune turkey turn twelve twenty twice two ugly uncle under underneath understand until up upon us use used useful valley vegetable very village visit voice wag wagon wait wake walk wall want war warm was wash waste watch water watermelon wave way we wear weather weave web week weep weigh welcome well went were west wet what wheat wheel when where whether which while whip whisper whistle white who whole whose why wide wife wild will win wind window wing winter wipe wire wise wish with within without woke woman women wonder wonderful wood word wore work world worry worse would wound wrap write written wrong yard year yellow yes yesterday yet you young your yourself zoo`.split(
    /\s+/,
  ),
);

const BE = /\b(am|is|are|was|were|be|been|being)\b/i;
// Adverb heuristic: common -ly adverbs (imperfect but useful for writing feedback).
const ADVERB = /\b[a-z]+ly\b/gi;

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .filter((s) => s.trim().length > 0);
}

function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
}

function splitWords(text: string): string[] {
  return text.match(/\b[a-zA-Z][a-zA-Z'-]*\b/g) || [];
}

type Analysis = {
  words: number;
  sentences: number;
  syllables: number;
  complexWords: number;
  difficultDC: number;
  flesch: number;
  fkGrade: number;
  fog: number;
  smog: number;
  ari: number;
  daleChall: number;
  chars: number;
  avgWordsPerSentence: number;
  avgSyllablesPerWord: number;
  longSentences: string[];
  complexList: string[];
  passiveList: string[];
  adverbCount: number;
  adverbList: string[];
};

type ParaScore = {
  idx: number;
  text: string;
  words: number;
  fkGrade: number;
  flesch: number;
};

function analyzeCore(text: string): Analysis | null {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return null;
  const allWords = splitWords(text);
  if (allWords.length === 0) return null;

  let syllables = 0;
  let complex = 0;
  let difficult = 0;
  const complexList = new Set<string>();
  for (const w of allWords) {
    const n = countSyllables(w);
    syllables += n;
    if (isComplex(w)) {
      complex++;
      complexList.add(w);
    }
    if (!DALE_CHALL_EASY.has(w.toLowerCase())) difficult++;
  }

  const words = allWords.length;
  const sc = sentences.length;
  const chars = text.replace(/[^a-zA-Z0-9]/g, "").length;

  const flesch = 206.835 - 1.015 * (words / sc) - 84.6 * (syllables / words);
  const fkGrade = 0.39 * (words / sc) + 11.8 * (syllables / words) - 15.59;
  const fog = 0.4 * (words / sc + 100 * (complex / words));
  const smog = 1.043 * Math.sqrt((complex * 30) / sc) + 3.1291;
  const ari = 4.71 * (chars / words) + 0.5 * (words / sc) - 21.43;
  const pctDiff = (difficult / words) * 100;
  let dc = 0.1579 * pctDiff + 0.0496 * (words / sc);
  if (pctDiff > 5) dc += 3.6365;

  const longSentences = sentences.filter((s) => splitWords(s).length > 20);

  const passiveList: string[] = [];
  for (const s of sentences) {
    if (!BE.test(s)) continue;
    const ws = splitWords(s);
    const pastPartIdx = ws.findIndex((w) => /(?:ed|en)$/i.test(w) && w.length > 4);
    const beIdx = ws.findIndex((w) => BE.test(w));
    if (pastPartIdx > -1 && beIdx > -1 && pastPartIdx > beIdx && pastPartIdx - beIdx < 4) {
      passiveList.push(s);
    }
  }

  const adverbMatches = text.match(ADVERB) || [];
  const adverbSet = new Set(adverbMatches.map((w) => w.toLowerCase()));

  return {
    words,
    sentences: sc,
    syllables,
    complexWords: complex,
    difficultDC: difficult,
    flesch,
    fkGrade,
    fog,
    smog,
    ari,
    daleChall: dc,
    chars,
    avgWordsPerSentence: words / sc,
    avgSyllablesPerWord: syllables / words,
    longSentences,
    complexList: [...complexList].slice(0, 30),
    passiveList,
    adverbCount: adverbMatches.length,
    adverbList: [...adverbSet].slice(0, 30),
  };
}

function analyzeParagraphs(text: string): ParaScore[] {
  const paras = splitParagraphs(text);
  const out: ParaScore[] = [];
  paras.forEach((p, i) => {
    const a = analyzeCore(p);
    if (!a) return;
    out.push({
      idx: i + 1,
      text: p,
      words: a.words,
      fkGrade: a.fkGrade,
      flesch: a.flesch,
    });
  });
  return out;
}

function fleschLabel(score: number): { label: string; audience: string } {
  if (score >= 90) return { label: "Very Easy", audience: "5th grade" };
  if (score >= 80) return { label: "Easy", audience: "6th grade" };
  if (score >= 70) return { label: "Fairly Easy", audience: "7th grade" };
  if (score >= 60) return { label: "Standard", audience: "8-9th grade" };
  if (score >= 50) return { label: "Fairly Difficult", audience: "10-12th grade" };
  if (score >= 30) return { label: "Difficult", audience: "College" };
  return { label: "Very Difficult", audience: "College graduate" };
}

// Map a numeric reading grade (FK) to its ordinal grade-level label.
function gradeLevelLabel(grade: number): string {
  const g = Math.max(1, Math.round(grade));
  if (g >= 16) return "Graduate";
  if (g >= 13) return "College";
  if (g === 12) return "12th grade";
  if (g === 11) return "11th grade";
  if (g === 10) return "10th grade";
  if (g === 9) return "9th grade";
  if (g === 8) return "8th grade";
  if (g === 7) return "7th grade";
  if (g === 6) return "6th grade";
  if (g === 5) return "5th grade";
  if (g === 4) return "4th grade";
  if (g === 3) return "3rd grade";
  if (g === 2) return "2nd grade";
  return "1st grade";
}

// Tone heuristics from the body of text.
type Tone = { key: string; label: string; tip: string };
function detectTones(text: string, a: Analysis): Tone[] {
  const out: Tone[] = [];
  const t = text.toLowerCase();
  if (a.avgWordsPerSentence > 22)
    out.push({ key: "dense", label: "Dense", tip: "Long sentences slow readers." });
  if (a.flesch >= 70)
    out.push({ key: "plain", label: "Plain", tip: "Easy to skim." });
  if (a.flesch < 50)
    out.push({ key: "academic", label: "Academic", tip: "Reads like a paper." });
  if (a.adverbCount / Math.max(1, a.words) > 0.04)
    out.push({ key: "hedged", label: "Hedged", tip: "Lots of -ly adverbs." });
  if (a.passiveList.length / Math.max(1, a.sentences) > 0.15)
    out.push({ key: "passive", label: "Passive", tip: "Switch to active voice." });
  if (/(!|\?){2,}|amazing|incredible|revolutionary|game-changing/.test(t))
    out.push({ key: "hype", label: "Hype", tip: "Soften superlatives." });
  if (a.avgWordsPerSentence < 12)
    out.push({ key: "punchy", label: "Punchy", tip: "Short, direct lines." });
  if (out.length === 0)
    out.push({ key: "neutral", label: "Neutral", tip: "Balanced register." });
  return out;
}

const DEFAULT = `The quick brown fox jumps over the lazy dog. This is a sample paragraph intended to demonstrate how readability scoring works in practice.

Longer sentences can drag down a reading ease score significantly because they increase the average words per sentence, and if those sentences are also packed with polysyllabic jargon — terminology, specificity, complexity — then the Gunning Fog and SMOG indices will climb accordingly.

Shorter lines help. So does plain English. Use them.`;

const STORAGE = "solutions:readability-score:text:v1";

type HighlightMode = "all" | "long" | "complex" | "passive" | "none";

// Sub-tab as a state button.
function StateButton({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.14em] transition ${
        active
          ? "border-tool-accent bg-tool-accent text-black shadow-sm"
          : "border-app bg-app-elevated text-secondary hover:border-app-strong hover:text-app"
      }`}
    >
      <span>{children}</span>
      {typeof count === "number" && (
        <span
          className={`tabular-nums rounded-full px-1.5 text-[0.6rem] ${
            active ? "bg-black/15 text-black" : "bg-tool-accent-soft text-tool-accent"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// Small dial card for one readability metric.
function DialCard({
  label,
  value,
  sub,
  fill,
  invert,
}: {
  label: string;
  value: string;
  sub: string;
  // fill 0..1 — what the dial shows
  fill: number;
  // invert: true when "higher = better" (Flesch). false when "lower = better" (FK, Fog, SMOG, ARI).
  invert?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, fill));
  // Quality 0..1 (1 = good, 0 = bad)
  const quality = invert ? pct : 1 - pct;
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * pct;
  const tone =
    quality > 0.66 ? "ok" : quality > 0.33 ? "warn" : "bad";
  const ringClass =
    tone === "ok"
      ? "stroke-tool-accent"
      : tone === "warn"
      ? "stroke-amber-500"
      : "stroke-rose-500";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-3">
      <div className="flex items-center gap-3">
        <div className="relative h-[60px] w-[60px] shrink-0">
          <svg
            viewBox="0 0 64 64"
            className="h-full w-full -rotate-90"
            aria-hidden
          >
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              className="stroke-app"
              strokeWidth="5"
              opacity="0.35"
            />
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              className={ringClass}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[0.7rem] font-semibold tabular-nums text-app">
            {value}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.55rem] uppercase tracking-[0.18em] text-muted">
            {label}
          </div>
          <div className="mt-0.5 text-[0.65rem] leading-tight text-secondary">
            {sub}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToneChip({ tone }: { tone: Tone }) {
  return (
    <span
      title={tone.tip}
      className="inline-flex items-center gap-1.5 rounded-full border border-app bg-app-elevated px-2.5 py-1 text-[0.65rem] font-medium text-secondary"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
      {tone.label}
    </span>
  );
}

// Highlight the editor's text by splitting into sentences and marking them.
function HighlightedText({
  text,
  longSet,
  passiveSet,
  complexSet,
  mode,
}: {
  text: string;
  longSet: Set<string>;
  passiveSet: Set<string>;
  complexSet: Set<string>;
  mode: HighlightMode;
}) {
  if (mode === "none") {
    return <>{text}</>;
  }
  // Split text preserving paragraph breaks
  const paragraphs = text.split(/(\n\s*\n)/);
  return (
    <>
      {paragraphs.map((para, pi) => {
        if (/^\n\s*\n$/.test(para)) {
          return <span key={pi}>{para}</span>;
        }
        // Split sentences but keep their separators by re-splitting on whitespace after .!?
        const tokens = para.split(/(\s+)/);
        // Group tokens into sentences using punctuation boundaries
        const sentences: string[] = [];
        let buf = "";
        for (const tok of tokens) {
          buf += tok;
          if (/[.!?]$/.test(tok.trim()) && buf.trim().length > 0) {
            sentences.push(buf);
            buf = "";
          }
        }
        if (buf.length > 0) sentences.push(buf);
        return (
          <span key={pi}>
            {sentences.map((s, si) => {
              const trimmed = s.trim();
              const isLong = longSet.has(trimmed);
              const isPassive = passiveSet.has(trimmed);
              const showLong = (mode === "all" || mode === "long") && isLong;
              const showPassive = (mode === "all" || mode === "passive") && isPassive;
              if (showLong || showPassive) {
                const cls = showPassive
                  ? "bg-rose-500/15 text-app border-b border-rose-500/40"
                  : "bg-amber-500/15 text-app border-b border-amber-500/40";
                return (
                  <mark
                    key={si}
                    className={`rounded-sm px-0.5 ${cls}`}
                    title={
                      showPassive
                        ? "Passive voice — prefer active"
                        : "Long sentence — split it"
                    }
                  >
                    {mode === "all" && complexSet.size > 0
                      ? markComplex(s, complexSet)
                      : s}
                  </mark>
                );
              }
              if ((mode === "all" || mode === "complex") && complexSet.size > 0) {
                return <span key={si}>{markComplex(s, complexSet)}</span>;
              }
              return <span key={si}>{s}</span>;
            })}
          </span>
        );
      })}
    </>
  );
}

function markComplex(s: string, complexSet: Set<string>) {
  const parts = s.split(/(\b[a-zA-Z][a-zA-Z'-]*\b)/);
  return parts.map((p, i) => {
    if (complexSet.has(p.toLowerCase())) {
      return (
        <mark
          key={i}
          className="rounded-sm bg-tool-accent-soft px-0.5 text-app"
          title="Complex word — try a simpler swap"
        >
          {p}
        </mark>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export default function ReadabilityScorePage() {
  const [text, setText] = useState(DEFAULT);
  const [copied, setCopied] = useState(false);
  const [highlight, setHighlight] = useState<HighlightMode>("all");
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved != null) setText(saved);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, text);
    } catch {}
  }, [text]);

  const a = useMemo(() => analyzeCore(text), [text]);
  const paraScores = useMemo(() => analyzeParagraphs(text), [text]);

  const worstParas = useMemo(
    () => [...paraScores].sort((x, y) => y.fkGrade - x.fkGrade).slice(0, 3),
    [paraScores],
  );
  const worstSet = new Set(worstParas.map((p) => p.idx));
  const maxGrade = Math.max(1, ...paraScores.map((p) => p.fkGrade));

  const tones = useMemo(() => (a ? detectTones(text, a) : []), [text, a]);

  const longSet = useMemo(
    () => new Set((a?.longSentences || []).map((s) => s.trim())),
    [a],
  );
  const passiveSet = useMemo(
    () => new Set((a?.passiveList || []).map((s) => s.trim())),
    [a],
  );
  const complexSet = useMemo(
    () => new Set((a?.complexList || []).map((w) => w.toLowerCase())),
    [a],
  );

  const readMinutes = a ? Math.max(1, Math.round(a.words / 230)) : 0;
  const grade = a ? a.fkGrade : 0;

  function handleCopy() {
    try {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  }

  return (
    <ToolShell
      category="Writing & Content"
      title="Readability Score"
      description="Flesch, Flesch-Kincaid, Gunning Fog, SMOG, ARI, Dale-Chall — with live writing feedback and paragraph-level callouts."
    >
      <div data-tool-theme="content" data-tool="readability-score">
        {/* ─── Hero: reading-grade number + grade-level label ─────────────── */}
        <div className="tool-hero relative mb-6 overflow-hidden rounded-2xl border border-app bg-app-elevated px-6 py-7 sm:px-8">
          <div className="absolute inset-0 -z-10 opacity-50 [background-image:radial-gradient(circle_at_85%_-15%,var(--tool-accent-soft),transparent_55%)]" />
          <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="flex items-baseline gap-3">
              <div className="text-[5.5rem] font-semibold leading-none tracking-tight text-app font-tool-heading tabular-nums">
                {a ? a.fkGrade.toFixed(1) : "—"}
              </div>
              <div className="flex flex-col">
                <span className="text-[0.6rem] uppercase tracking-[0.22em] text-muted">
                  Reading grade
                </span>
                <span className="mt-1 text-base font-semibold text-tool-accent">
                  {a ? gradeLevelLabel(a.fkGrade) : "—"}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {a && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-tool-accent px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-black">
                  {fleschLabel(a.flesch).label} · {fleschLabel(a.flesch).audience}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-app bg-app-elevated px-3 py-1.5 text-[0.65rem] font-medium text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                {(a?.words || 0).toLocaleString()} words
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-app bg-app-elevated px-3 py-1.5 text-[0.65rem] font-medium text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                {a?.sentences || 0} sentences
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-app bg-app-elevated px-3 py-1.5 text-[0.65rem] font-medium text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                ~{readMinutes} min read
              </span>
            </div>
          </div>
        </div>

        {/* ─── Workspace: editor + sidebar ─────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* Editor column */}
          <div className="rounded-2xl border border-app bg-app-elevated overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-app px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <StateButton
                  active={!showPreview && highlight === "all"}
                  onClick={() => {
                    setShowPreview(false);
                    setHighlight("all");
                  }}
                >
                  All
                </StateButton>
                <StateButton
                  active={!showPreview && highlight === "long"}
                  onClick={() => {
                    setShowPreview(true);
                    setHighlight("long");
                  }}
                  count={a?.longSentences.length ?? 0}
                >
                  Long
                </StateButton>
                <StateButton
                  active={!showPreview && highlight === "complex"}
                  onClick={() => {
                    setShowPreview(true);
                    setHighlight("complex");
                  }}
                  count={a?.complexWords ?? 0}
                >
                  Complex
                </StateButton>
                <StateButton
                  active={!showPreview && highlight === "passive"}
                  onClick={() => {
                    setShowPreview(true);
                    setHighlight("passive");
                  }}
                  count={a?.passiveList.length ?? 0}
                >
                  Passive
                </StateButton>
                <StateButton
                  active={showPreview === false && highlight === "none"}
                  onClick={() => {
                    setShowPreview(false);
                    setHighlight("none");
                  }}
                >
                  Edit
                </StateButton>
              </div>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-full border border-app bg-app-elevated px-3 py-1.5 text-[0.65rem] font-semibold text-secondary transition hover:border-app-strong hover:text-app"
              >
                {copied ? "Copied" : "Copy text"}
              </button>
            </div>

            <div className="relative">
              {showPreview ? (
                <div
                  aria-label="Annotated preview"
                  className="min-h-[460px] whitespace-pre-wrap p-6 font-tool-heading text-[1.02rem] leading-[1.8] text-app"
                >
                  <HighlightedText
                    text={text}
                    longSet={longSet}
                    passiveSet={passiveSet}
                    complexSet={complexSet}
                    mode={highlight}
                  />
                </div>
              ) : (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Start writing..."
                  spellCheck
                  className="block w-full min-h-[460px] resize-none border-0 bg-transparent p-6 font-tool-heading text-[1.02rem] leading-[1.8] text-app placeholder:text-muted focus:outline-none"
                />
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-app px-4 py-2.5 text-[0.65rem] tabular-nums text-muted">
              <div>
                {text.length.toLocaleString()} chars · {paraScores.length}{" "}
                paragraph{paraScores.length === 1 ? "" : "s"}
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3 rounded bg-amber-500/30 ring-1 ring-amber-500/40" />
                  long
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3 rounded bg-rose-500/30 ring-1 ring-rose-500/40" />
                  passive
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3 rounded bg-tool-accent-soft ring-1 ring-tool-accent/40" />
                  complex
                </span>
              </div>
            </div>
          </div>

          {/* Metrics sidebar */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-app bg-app-elevated p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <div className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                  Score gauges
                </div>
                {a && (
                  <div className="text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    live
                  </div>
                )}
              </div>
              {!a ? (
                <div className="rounded-xl border border-dashed border-app p-8 text-center text-xs text-muted">
                  Type something to see live metrics.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <DialCard
                    label="Flesch"
                    value={a.flesch.toFixed(0)}
                    sub="Reading ease — higher is easier"
                    fill={Math.max(0, Math.min(1, a.flesch / 100))}
                    invert
                  />
                  <DialCard
                    label="Gunning Fog"
                    value={a.fog.toFixed(1)}
                    sub="Years of education needed"
                    fill={Math.min(1, a.fog / 20)}
                  />
                  <DialCard
                    label="SMOG"
                    value={a.smog.toFixed(1)}
                    sub="Polysyllable index"
                    fill={Math.min(1, a.smog / 20)}
                  />
                  <DialCard
                    label="FK Grade"
                    value={a.fkGrade.toFixed(1)}
                    sub="US school grade"
                    fill={Math.min(1, a.fkGrade / 18)}
                  />
                </div>
              )}
            </div>

            {/* Tone analysis */}
            <div className="rounded-2xl border border-app bg-app-elevated p-4">
              <div className="mb-2 text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                Tone
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tones.map((t) => (
                  <ToneChip key={t.key} tone={t} />
                ))}
              </div>
            </div>

            {/* Structure */}
            {a && (
              <div className="rounded-2xl border border-app bg-app-elevated p-4">
                <div className="mb-3 text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                  Structure
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label="Words" value={a.words.toString()} />
                  <MiniStat label="Sents" value={a.sentences.toString()} />
                  <MiniStat
                    label="W/sent"
                    value={a.avgWordsPerSentence.toFixed(1)}
                  />
                  <MiniStat label="Syllables" value={a.syllables.toString()} />
                  <MiniStat
                    label="Syl/word"
                    value={a.avgSyllablesPerWord.toFixed(2)}
                  />
                  <MiniStat label="ARI" value={a.ari.toFixed(1)} />
                </div>
              </div>
            )}

            {/* Suggestions */}
            {a && (
              <div className="rounded-2xl border border-app bg-app-elevated p-4">
                <div className="mb-2 text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                  Suggestions
                </div>
                <div className="space-y-1.5">
                  <SuggestionChip
                    count={a.longSentences.length}
                    label="Hard sentences"
                    hint="Split those over 20 words."
                  />
                  <SuggestionChip
                    count={a.passiveList.length}
                    label="Passive voice"
                    hint="Prefer the active voice."
                  />
                  <SuggestionChip
                    count={a.adverbCount}
                    label="Adverbs (-ly)"
                    hint="Cut weak modifiers."
                  />
                  <SuggestionChip
                    count={a.complexWords}
                    label="Complex words"
                    hint="Swap for simpler ones."
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Paragraph trend + worst offenders ──────────────────────────── */}
        {paraScores.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-app bg-app-elevated p-5">
              <div className="mb-3 flex items-baseline justify-between">
                <div>
                  <div className="text-sm font-semibold text-app">
                    Grade trend
                  </div>
                  <div className="text-[0.65rem] text-muted">
                    Flesch-Kincaid per paragraph
                  </div>
                </div>
                <div className="text-[0.6rem] tabular-nums text-muted">
                  max {maxGrade.toFixed(1)}
                </div>
              </div>
              <div className="flex h-40 items-end gap-1.5 border-b border-app pb-0.5">
                {paraScores.map((p) => {
                  const h = Math.max(
                    6,
                    Math.min(100, (p.fkGrade / Math.max(12, maxGrade)) * 100),
                  );
                  const isWorst = worstSet.has(p.idx);
                  return (
                    <div
                      key={p.idx}
                      className="group flex flex-1 flex-col items-center gap-1"
                    >
                      <div className="text-[0.55rem] tabular-nums text-muted opacity-0 transition group-hover:opacity-100">
                        {p.fkGrade.toFixed(1)}
                      </div>
                      <div
                        title={`Paragraph ${p.idx}: grade ${p.fkGrade.toFixed(1)} · ${p.words} words`}
                        className={`w-full rounded-t-md transition ${
                          isWorst
                            ? "bg-tool-accent"
                            : "bg-tool-accent-soft group-hover:bg-tool-accent/60"
                        }`}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between text-[0.6rem] text-muted">
                <span>¶1</span>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2 w-3 rounded bg-tool-accent-soft" />
                    normal
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2 w-3 rounded bg-tool-accent" />
                    worst 3
                  </span>
                </div>
                <span>¶{paraScores.length}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-app bg-app-elevated p-5">
              <div className="mb-3">
                <div className="text-sm font-semibold text-app">
                  Worst offenders
                </div>
                <div className="text-[0.65rem] text-muted">
                  Highest-grade paragraphs — rewrite candidates
                </div>
              </div>
              {worstParas.length === 0 ? (
                <div className="text-xs text-muted">None.</div>
              ) : (
                <ul className="space-y-2.5 text-xs text-secondary">
                  {worstParas.map((p) => (
                    <li
                      key={p.idx}
                      className="rounded-lg border-l-2 border-tool-accent bg-tool-accent-soft p-3"
                    >
                      <div className="mb-1 flex items-center justify-between text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                        <span>
                          ¶{p.idx} · {p.words} words
                        </span>
                        <span className="tabular-nums">
                          grade {p.fkGrade.toFixed(1)} · ease{" "}
                          {p.flesch.toFixed(0)}
                        </span>
                      </div>
                      <div className="line-clamp-3 leading-relaxed">{p.text}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ─── Detail panels ──────────────────────────────────────────────── */}
        {a && (
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <DetailPanel
              title="Long sentences"
              count={a.longSentences.length}
              empty="None. Clean pacing."
            >
              {a.longSentences.slice(0, 6).map((s, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-app bg-app-elevated p-2.5 leading-relaxed"
                >
                  {s}
                </li>
              ))}
            </DetailPanel>

            <div className="rounded-2xl border border-app bg-app-elevated p-4">
              <div className="mb-2 flex items-baseline justify-between">
                <div className="text-sm font-semibold text-app">
                  Complex words
                </div>
                <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[0.6rem] font-semibold text-tool-accent">
                  {a.complexWords}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {a.complexList.map((w) => (
                  <span
                    key={w}
                    className="rounded-md border border-tool-accent/30 bg-tool-accent-soft px-2 py-0.5 text-[0.65rem] text-secondary"
                  >
                    {w}
                  </span>
                ))}
                {a.complexList.length === 0 && (
                  <span className="text-[0.7rem] italic text-muted">None.</span>
                )}
              </div>
            </div>

            <DetailPanel
              title="Passive voice"
              count={a.passiveList.length}
              empty="None detected."
            >
              {a.passiveList.slice(0, 5).map((s, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-app bg-app-elevated p-2.5 leading-relaxed"
                >
                  {s}
                </li>
              ))}
            </DetailPanel>
          </div>
        )}

        <div className="mt-4 text-[0.6rem] text-muted">
          Dale-Chall easy-word list: ~500-word sample baked in from the
          public-domain Dale &amp; Chall list (1948/1995). Full 3,000-word list
          can be swapped for publishing-grade precision.
        </div>
      </div>
    </ToolShell>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-app bg-app p-2.5 text-center">
      <div className="text-[0.55rem] uppercase tracking-[0.15em] text-muted">
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums text-app">
        {value}
      </div>
    </div>
  );
}

function DetailPanel({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-app bg-app-elevated p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-sm font-semibold text-app">{title}</div>
        <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[0.6rem] font-semibold text-tool-accent">
          {count}
        </span>
      </div>
      <ul className="space-y-1.5 text-xs text-secondary">
        {count > 0 ? children : <li className="italic text-muted">{empty}</li>}
      </ul>
    </div>
  );
}

function SuggestionChip({
  count,
  label,
  hint,
}: {
  count: number;
  label: string;
  hint: string;
}) {
  const active = count > 0;
  return (
    <div
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 transition ${
        active
          ? "border border-tool-accent/40 bg-tool-accent-soft"
          : "border border-app bg-app opacity-70"
      }`}
    >
      <span
        className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md px-1.5 text-[0.7rem] font-bold tabular-nums ${
          active ? "bg-tool-accent text-black" : "bg-app-elevated text-muted"
        }`}
      >
        {count}
      </span>
      <span className="flex-1">
        <span className="block text-[0.72rem] font-medium text-app">
          {label}
        </span>
        <span className="block text-[0.6rem] text-muted">{hint}</span>
      </span>
    </div>
  );
}
