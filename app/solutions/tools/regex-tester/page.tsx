"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

const STORAGE_KEY = "regex-tester-history-v1";
const MAX_HISTORY = 10;

// Common regex patterns — paste a few to save hunting around Stack Overflow.
const COMMON_PATTERNS: { label: string; pattern: string; flags: string; note: string }[] = [
  { label: "Email (practical)", pattern: "^[\\w.!#$%&'*+/=?^`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$", flags: "", note: "Close-enough email — not full RFC 5322." },
  { label: "URL (http/https)", pattern: "^https?:\\/\\/(?:[\\w-]+\\.)+[\\w-]{2,}(?:\\/[^\\s]*)?$", flags: "", note: "Basic web URL." },
  { label: "Phone (international)", pattern: "^\\+?[1-9]\\d{1,14}$", flags: "", note: "E.164 compact form." },
  { label: "ISO date (YYYY-MM-DD)", pattern: "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$", flags: "", note: "Calendar-unaware — Feb 30 would match." },
  { label: "ISO datetime", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$", flags: "", note: "RFC 3339 / ISO 8601." },
  { label: "UUID v4", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", flags: "i", note: "Version 4 only." },
  { label: "IPv4", pattern: "^(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)$", flags: "", note: "Dotted-quad, with octet range check." },
  { label: "IPv6", pattern: "^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,7}:|([0-9a-f]{1,4}:){1,6}(:[0-9a-f]{1,4})+)$", flags: "i", note: "Simplified — accepts compressed forms." },
  { label: "Hex color", pattern: "^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$", flags: "i", note: "#RGB, #RRGGBB, or #RRGGBBAA." },
  { label: "Credit card (Luhn-like)", pattern: "^(?:\\d{4}[ -]?){3}\\d{4}$", flags: "", note: "Format only — doesn't Luhn-check." },
  { label: "Slug", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", flags: "", note: "URL-friendly kebab-case." },
  { label: "Semver", pattern: "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[\\w.-]+)?(?:\\+[\\w.-]+)?$", flags: "", note: "Semantic versioning 2.0.0." },
];

// Token-by-token explanation of a regex pattern.
type TokenExpl = { text: string; desc: string };
function explainPattern(p: string): TokenExpl[] {
  const out: TokenExpl[] = [];
  let i = 0;
  const simple: Record<string, string> = {
    "^": "Start of string (or line with /m).",
    "$": "End of string (or line with /m).",
    ".": "Any single character (except newline unless /s).",
    "*": "Quantifier: previous token zero or more times.",
    "+": "Quantifier: previous token one or more times.",
    "?": "Quantifier: previous token zero or one time (optional).",
    "|": "Alternation: match left OR right.",
    "\\d": "Any digit (0-9).",
    "\\D": "Any non-digit.",
    "\\w": "Word character: [A-Za-z0-9_].",
    "\\W": "Non-word character.",
    "\\s": "Whitespace: space, tab, newline.",
    "\\S": "Non-whitespace.",
    "\\b": "Word boundary.",
    "\\B": "Non-word-boundary.",
    "\\n": "Newline.",
    "\\t": "Tab.",
    "\\r": "Carriage return.",
  };
  while (i < p.length) {
    const two = p.slice(i, i + 2);
    if (simple[two]) { out.push({ text: two, desc: simple[two] }); i += 2; continue; }
    if (two === "\\.") { out.push({ text: two, desc: "Literal dot." }); i += 2; continue; }
    if (two.startsWith("\\")) { out.push({ text: two, desc: `Escaped "${two[1]}".` }); i += 2; continue; }
    const ch = p[i];
    if (simple[ch]) { out.push({ text: ch, desc: simple[ch] }); i++; continue; }
    if (ch === "[") {
      const close = p.indexOf("]", i + 1);
      const body = close > 0 ? p.slice(i, close + 1) : p.slice(i);
      out.push({ text: body, desc: body.startsWith("[^") ? "Character class: not any of these." : "Character class: any one of these." });
      i += body.length;
      continue;
    }
    if (ch === "(") {
      const isNonCap = p.slice(i, i + 3) === "(?:";
      const isLook = /^\(\?[=!]/.test(p.slice(i));
      const isNamed = /^\(\?<[^>]+>/.test(p.slice(i));
      out.push({
        text: isNonCap ? "(?:" : isLook ? p.slice(i, i + 3) : isNamed ? p.slice(i, p.indexOf(">", i) + 1) : "(",
        desc: isNonCap ? "Non-capturing group." : isLook ? (p[i + 2] === "=" ? "Positive lookahead." : "Negative lookahead.") : isNamed ? "Named capturing group." : "Capturing group.",
      });
      i += isNonCap ? 3 : isLook ? 3 : isNamed ? p.indexOf(">", i) - i + 1 : 1;
      continue;
    }
    if (ch === ")") { out.push({ text: ")", desc: "End of group." }); i++; continue; }
    if (ch === "{") {
      const close = p.indexOf("}", i);
      if (close > 0) { out.push({ text: p.slice(i, close + 1), desc: "Quantifier {n}, {n,}, or {n,m}." }); i = close + 1; continue; }
    }
    out.push({ text: ch, desc: `Literal "${ch}".` });
    i++;
  }
  return out;
}

type MatchInfo = {
  index: number;
  length: number;
  match: string;
  groups: string[];
};

type Segment =
  | { kind: "text"; value: string }
  | { kind: "match"; value: string; matchIndex: number };

function toSegments(text: string, matches: MatchInfo[]): Segment[] {
  if (matches.length === 0) return [{ kind: "text", value: text }];
  const segs: Segment[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.index > cursor) {
      segs.push({ kind: "text", value: text.slice(cursor, m.index) });
    }
    segs.push({ kind: "match", value: text.slice(m.index, m.index + m.length), matchIndex: i });
    cursor = m.index + m.length;
  });
  if (cursor < text.length) {
    segs.push({ kind: "text", value: text.slice(cursor) });
  }
  return segs;
}

// Cycling palette so adjacent matches are visually distinct.
const MATCH_PALETTE = [
  "bg-amber-300/80 text-neutral-900",
  "bg-emerald-300/80 text-neutral-900",
  "bg-sky-300/80 text-neutral-900",
  "bg-pink-300/80 text-neutral-900",
  "bg-violet-300/80 text-neutral-900",
];

type TabKey = "test" | "replace" | "reference";

export default function RegexTesterPage() {
  const [pattern, setPattern] = useState("\\b([A-Z][a-z]+)\\s([A-Z][a-z]+)\\b");
  const [flags, setFlags] = useState("g");
  const [test, setTest] = useState(
    "Alex Thompson joined Acme.\nJordan Lee wrote the policy.\nMeet Sam Patel at Beta Inc."
  );
  const [replacement, setReplacement] = useState("$2, $1");
  const [history, setHistory] = useState<string[]>([]);
  const [showPatterns, setShowPatterns] = useState(false);
  const [mode, setMode] = useState<TabKey>("test");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const saveHistory = (p: string) => {
    if (!p.trim()) return;
    setHistory((h) => {
      const next = [p, ...h.filter((x) => x !== p)].slice(0, MAX_HISTORY);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const { regex, error } = useMemo(() => {
    try {
      return { regex: new RegExp(pattern, flags), error: null as string | null };
    } catch (e) {
      return { regex: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [pattern, flags]);

  const { matches, execMs } = useMemo<{ matches: MatchInfo[]; execMs: number }>(() => {
    if (!regex) return { matches: [], execMs: 0 };
    const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const results: MatchInfo[] = [];
    if (regex.global) {
      let m: RegExpExecArray | null;
      const safe = new RegExp(regex.source, regex.flags);
      let guard = 0;
      while ((m = safe.exec(test)) !== null) {
        results.push({
          index: m.index,
          length: m[0].length,
          match: m[0],
          groups: m.slice(1),
        });
        if (m.index === safe.lastIndex) safe.lastIndex++;
        if (++guard > 10000) break;
      }
    } else {
      const m = regex.exec(test);
      if (m) {
        results.push({
          index: m.index,
          length: m[0].length,
          match: m[0],
          groups: m.slice(1),
        });
      }
    }
    const t1 = (typeof performance !== "undefined" ? performance.now() : Date.now());
    return { matches: results, execMs: t1 - t0 };
  }, [regex, test]);

  const segments = useMemo(() => toSegments(test, matches), [test, matches]);

  const replaced = useMemo(() => {
    if (!regex) return "";
    try {
      return test.replace(regex, replacement);
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }, [test, regex, replacement]);

  const toggleFlag = (f: string) => {
    setFlags((curr) =>
      curr.includes(f) ? curr.replace(f, "") : curr + f
    );
  };

  const copy = (t: string) => navigator.clipboard?.writeText(t);

  const FLAGS = [
    { f: "g", label: "global" },
    { f: "i", label: "case-insensitive" },
    { f: "m", label: "multiline" },
    { f: "s", label: "dotAll" },
    { f: "u", label: "unicode" },
    { f: "y", label: "sticky" },
  ];

  const statusTone: "rose" | "ok" | "idle" = error
    ? "rose"
    : matches.length > 0
      ? "ok"
      : "idle";

  return (
    <div data-tool-theme="data" data-tool="regex-tester">
      <ToolShell
        category="Data & Developer"
        title="Regex Tester"
        description="Test a regular expression against sample text with live match highlighting, capture groups, and a replacement preview."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — status + flags + perf, no dots */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${
                statusTone === "rose"
                  ? "border-rose-500/40 bg-rose-500/15 text-rose-500"
                  : statusTone === "ok"
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
                    : "border-app bg-app-elevated text-secondary"
              }`}
            >
              {error
                ? "INVALID"
                : `${matches.length} MATCH${matches.length === 1 ? "" : "ES"}`}
            </span>
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              flags=/{flags || "—"}/
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              pattern.matcher
              <span className="text-faint">/</span>
              <span className="text-secondary">js.flavor</span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              {execMs.toFixed(2)}ms
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Pattern Matcher · Live Test
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {test.length.toLocaleString()} chars · {test.split("\n").length} ln
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {matches[0]?.groups.length ?? 0} group{(matches[0]?.groups.length ?? 0) === 1 ? "" : "s"}
                  </span>
                </div>

                {/* Slash-wrapped regex line */}
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-app bg-app px-3 py-2 focus-within:border-tool-accent">
                  <span className="select-none font-mono text-base text-tool-accent">/</span>
                  <input
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value)}
                    onBlur={() => saveHistory(pattern)}
                    spellCheck={false}
                    placeholder="\\b([A-Z]\\w+)\\b"
                    className="flex-1 bg-transparent font-mono text-sm text-app outline-none placeholder:text-faint"
                  />
                  <span className="select-none font-mono text-base text-tool-accent">/</span>
                  <span className="select-none font-mono text-xs text-tool-accent">{flags || ""}</span>
                </div>
              </div>
            </div>
          </div>

          {/* sub-tab strip */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "test", label: "Test" },
                  { k: "replace", label: "Replace" },
                  { k: "reference", label: "Reference" },
                ] as { k: TabKey; label: string }[]
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

            <div className="relative">
              <button
                onClick={() => setShowPatterns((v) => !v)}
                className="rounded-lg border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary outline-none transition-colors hover:border-tool-accent"
              >
                Load preset…
              </button>
              {showPatterns && (
                <div className="absolute left-0 z-20 mt-2 w-72 rounded-lg border border-app bg-app-elevated p-2 shadow-2xl">
                  <div className="mb-1 px-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    common patterns
                  </div>
                  <div className="max-h-[260px] overflow-auto">
                    {COMMON_PATTERNS.map((cp) => (
                      <button
                        key={cp.label}
                        onClick={() => {
                          setPattern(cp.pattern);
                          if (cp.flags) setFlags(cp.flags);
                          setShowPatterns(false);
                        }}
                        title={cp.note}
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-app hover:bg-tool-accent-soft"
                      >
                        <div className="font-medium">{cp.label}</div>
                        <div className="truncate font-mono text-[0.6rem] text-muted">
                          {cp.pattern}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => copy(pattern)}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Copy /pattern/
              </button>
              {regex && mode === "replace" && (
                <button
                  onClick={() => copy(replaced)}
                  className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                  style={{ color: "var(--bg)" }}
                >
                  Copy result
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Flag pills + history live above the workspaces */}
        <div className="mb-5 rounded-xl border border-app bg-app-elevated p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
              flags:
            </span>
            {FLAGS.map(({ f, label }) => {
              const on = flags.includes(f);
              return (
                <button
                  key={f}
                  onClick={() => toggleFlag(f)}
                  title={label}
                  className={`rounded-lg border px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.15em] transition-colors ${
                    on
                      ? "border-tool-accent bg-tool-accent text-app-elevated"
                      : "border-app bg-app text-secondary hover:border-tool-accent hover:text-app"
                  }`}
                  style={on ? { color: "var(--bg)" } : undefined}
                >
                  {f}
                </button>
              );
            })}
          </div>

          {history.length > 0 && (
            <div className="mt-3 border-t border-app pt-3">
              <div className="mb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                recent
              </div>
              <div className="flex flex-wrap gap-1.5">
                {history.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPattern(p)}
                    className="max-w-[260px] truncate rounded-lg border border-app bg-app px-2 py-1 font-mono text-[0.6rem] text-secondary hover:border-tool-accent hover:text-tool-accent"
                    title={p}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-mono text-xs text-rose-500">
              {error}
            </div>
          )}
        </div>

        {mode === "reference" ? (
          <div className="rounded-xl border border-app bg-app-elevated p-5">
            <div className="mb-3">
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                token.breakdown
              </div>
              <div className="text-xs text-muted">what each piece of your pattern does</div>
            </div>
            <div className="space-y-0.5">
              {explainPattern(pattern).map((t, i) => (
                <div
                  key={i}
                  className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-tool-accent-soft"
                  title={t.desc}
                >
                  <code className="shrink-0 rounded bg-app px-1.5 py-0.5 font-mono text-[0.7rem] text-tool-accent">
                    {t.text}
                  </code>
                  <span className="text-[0.75rem] leading-snug text-secondary">{t.desc}</span>
                </div>
              ))}
              {explainPattern(pattern).length === 0 && (
                <div className="rounded-lg border border-dashed border-app bg-app p-6 text-center text-sm text-muted">
                  Empty pattern.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* LEFT column: test text editor (+ replacement when in replace mode) */}
            <div className="space-y-4">
              {/* Test-text mono editor with overlay highlights */}
              <div className="rounded-xl border border-app bg-app-elevated p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                      test.string
                    </div>
                    <div className="text-xs text-muted">edit · highlights live</div>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    <span>{test.length.toLocaleString()} chars</span>
                    <span className="text-faint">·</span>
                    <span>{test.split("\n").length} ln</span>
                  </div>
                </div>

                {/* Layered editor: pre under, textarea over */}
                <div className="relative rounded-lg border border-app bg-app focus-within:border-tool-accent">
                  <pre
                    aria-hidden
                    className="pointer-events-none m-0 max-h-[360px] min-h-[220px] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-sm leading-6"
                  >
                    {segments.length === 0 || (segments.length === 1 && segments[0].kind === "text" && segments[0].value === "") ? (
                      <span className="text-transparent">.</span>
                    ) : (
                      segments.map((s, i) =>
                        s.kind === "match" ? (
                          <span
                            key={i}
                            className={`rounded px-0.5 ${MATCH_PALETTE[s.matchIndex % MATCH_PALETTE.length]}`}
                          >
                            {s.value || " "}
                          </span>
                        ) : (
                          <span key={i} className="text-transparent">{s.value}</span>
                        )
                      )
                    )}
                    {/* Trailing newline guard so caret stays in view */}
                    {"\n"}
                  </pre>
                  <textarea
                    value={test}
                    onChange={(e) => setTest(e.target.value)}
                    spellCheck={false}
                    className="absolute inset-0 m-0 h-full w-full resize-none overflow-auto whitespace-pre-wrap break-words bg-transparent p-3 font-mono text-sm leading-6 text-app caret-tool-accent outline-none placeholder:text-faint"
                    placeholder="Paste text to test against your regex..."
                  />
                </div>
              </div>

              {/* Replacement card — only visible in replace mode */}
              {mode === "replace" && (
                <div className="rounded-xl border border-app bg-app-elevated p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                        replacement
                      </div>
                      <div className="text-xs text-muted">
                        Use $1, $2 for capture groups · $&amp; for whole match
                      </div>
                    </div>
                    {regex && (
                      <button
                        onClick={() => copy(replaced)}
                        className="rounded-lg border border-app bg-app px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-secondary hover:border-tool-accent hover:text-tool-accent"
                      >
                        Copy result
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-app bg-app px-3 py-2 focus-within:border-tool-accent">
                    <span className="select-none font-mono text-xs text-tool-accent">$&gt;</span>
                    <input
                      value={replacement}
                      onChange={(e) => setReplacement(e.target.value)}
                      spellCheck={false}
                      placeholder="$2, $1"
                      className="flex-1 bg-transparent font-mono text-xs text-app outline-none placeholder:text-faint"
                    />
                  </div>
                  {regex && (
                    <pre className="mt-3 max-h-[200px] w-full overflow-auto whitespace-pre-wrap break-words rounded-lg border border-app bg-app p-3 font-mono text-xs text-app">
                      {replaced || <span className="text-faint">(empty)</span>}
                    </pre>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT column: capture-groups panel + token explanation */}
            <div className="space-y-4">
              {/* Capture groups */}
              <div className="rounded-xl border border-app bg-app-elevated p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                      capture.groups
                    </div>
                    <div className="text-xs text-muted">first match shown</div>
                  </div>
                  <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    {matches[0]?.groups.length ?? 0} grp
                  </span>
                </div>

                {error ? (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-mono text-xs text-rose-500">
                    pattern is invalid
                  </div>
                ) : matches.length === 0 ? (
                  <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-app bg-app font-mono text-[0.65rem] uppercase tracking-[0.22em] text-muted">
                    no matches
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Whole match */}
                    <div className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                          $0 · whole
                        </span>
                        <span className="font-mono text-[0.55rem] text-tool-accent">
                          @{matches[0].index}
                        </span>
                      </div>
                      <div className="mt-1 break-all font-mono text-xs text-app">
                        {matches[0].match}
                      </div>
                    </div>

                    {matches[0].groups.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-app bg-app px-2.5 py-2 font-mono text-[0.6rem] text-muted">
                        no capture groups in pattern
                      </div>
                    ) : (
                      matches[0].groups.map((g, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-app bg-app px-2.5 py-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-secondary">
                              ${i + 1}
                            </span>
                            {g === undefined && (
                              <span className="font-mono text-[0.55rem] text-faint">undefined</span>
                            )}
                          </div>
                          <div className="mt-1 break-all font-mono text-xs text-app">
                            {g === undefined ? <em className="text-faint">—</em> : g}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {matches.length > 1 && (
                  <div className="mt-3 border-t border-app pt-3">
                    <div className="mb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                      all matches · {matches.length}
                    </div>
                    <div className="flex max-h-[160px] flex-wrap gap-1 overflow-auto">
                      {matches.map((m, i) => (
                        <span
                          key={i}
                          className={`rounded px-1.5 py-0.5 font-mono text-[0.65rem] ${MATCH_PALETTE[i % MATCH_PALETTE.length]}`}
                          title={`@${m.index}`}
                        >
                          {m.match}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Token explanation (compact rail version) */}
              <div className="rounded-xl border border-app bg-app-elevated p-4">
                <div className="mb-3">
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                    token.breakdown
                  </div>
                  <div className="text-xs text-muted">what each piece does</div>
                </div>
                <div className="max-h-[260px] space-y-0.5 overflow-auto pr-1">
                  {explainPattern(pattern).map((t, i) => (
                    <div
                      key={i}
                      className="group flex items-start gap-2 rounded px-2 py-1 hover:bg-tool-accent-soft"
                      title={t.desc}
                    >
                      <code className="shrink-0 rounded bg-app px-1 font-mono text-[0.7rem] text-tool-accent">
                        {t.text}
                      </code>
                      <span className="text-[0.7rem] leading-snug text-secondary">{t.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </ToolShell>
    </div>
  );
}
