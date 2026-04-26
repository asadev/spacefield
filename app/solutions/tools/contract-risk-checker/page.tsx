"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";

type Risk = "critical" | "high" | "medium" | "low";

type Rule = {
  id: string;
  label: string;
  risk: Risk;
  explain: string;
  // Regex applied to each sentence, case-insensitive.
  pattern: RegExp;
};

const RULES: Rule[] = [
  {
    id: "unlimited-liability",
    label: "Unlimited liability",
    risk: "critical",
    explain:
      "Clauses removing a cap on damages expose you to losses far exceeding contract value. Push for a mutual liability cap tied to fees paid in the trailing 12 months.",
    pattern:
      /\b(unlimited\s+liability|no\s+limit(ation)?\s+of\s+liability|without\s+any\s+limit(ation)?\s+of\s+liability)\b/i,
  },
  {
    id: "auto-renewal",
    label: "Automatic renewal without notice",
    risk: "high",
    explain:
      "Auto-renewing terms with short or no notice windows lock you in. Require 30-60 days written notice and disable auto-renewal by default.",
    pattern:
      /\b(automatically\s+renew(s|ed)?|auto-?renew(al|s|ed)?|evergreen\s+(term|clause)|shall\s+renew\s+automatically)\b/i,
  },
  {
    id: "broad-indemnification",
    label: "Broad indemnification",
    risk: "critical",
    explain:
      "Broad indemnities force you to defend the other side against claims you did not cause. Narrow to third-party IP and confidentiality, and make it mutual.",
    pattern:
      /\b(indemnify|indemnification|hold\s+harmless)\b.*\b(any\s+and\s+all|all\s+claims|any\s+claim)\b/i,
  },
  {
    id: "sole-discretion",
    label: "Sole discretion",
    risk: "medium",
    explain:
      "\"Sole discretion\" gives the other side unilateral power to change or terminate. Ask for \"reasonable discretion\" with notice and cure periods.",
    pattern: /\bsole\s+(and\s+absolute\s+)?discretion\b/i,
  },
  {
    id: "assignment-affiliates",
    label: "Assignment to affiliates",
    risk: "medium",
    explain:
      "Assignment-to-affiliates clauses let the other side transfer the contract to a related entity without consent. Require written consent for any assignment, affiliate or otherwise.",
    pattern:
      /\b(assign(ment)?|transfer)\b.*\b(affiliate|subsidiar(y|ies)|parent\s+compan(y|ies)|related\s+entit(y|ies))\b/i,
  },
  {
    id: "perpetual-license",
    label: "Perpetual license",
    risk: "high",
    explain:
      "A perpetual license means rights never expire and cannot be revoked for most breaches. Limit to the term of the agreement plus a short survival window.",
    pattern: /\bperpetual\s+(and\s+irrevocable\s+)?license\b/i,
  },
  {
    id: "non-compete",
    label: "Non-compete",
    risk: "medium",
    explain:
      "Non-competes restrict future work with competitors and are increasingly unenforceable. Narrow the scope, geography, and duration — or remove entirely.",
    pattern: /\b(non-?compete|shall\s+not\s+compete|covenant\s+not\s+to\s+compete)\b/i,
  },
  {
    id: "as-is",
    label: "\"As is\" without warranty",
    risk: "medium",
    explain:
      "\"As is, without warranty\" disclaims implied warranties of fitness and merchantability. For paid deliverables, require at least a limited warranty of conformance.",
    pattern:
      /\bas\s+is\b.*\b(without\s+warrant(y|ies)|no\s+warrant(y|ies))\b/i,
  },
  {
    id: "liquidated-damages",
    label: "Liquidated damages",
    risk: "high",
    explain:
      "Liquidated damages set a fixed payout on breach that may exceed actual harm. Confirm the number is a reasonable pre-estimate, not a penalty.",
    pattern: /\bliquidated\s+damages\b/i,
  },
  {
    id: "exclusivity",
    label: "Exclusivity",
    risk: "low",
    explain:
      "Exclusivity locks you to a single partner. Make sure there is a term, performance condition, and exit right.",
    pattern: /\b(exclusiv(e|ity))\b.*\b(right|arrangement|supplier|customer|licensee|license)\b/i,
  },
];

type Finding = {
  rule: Rule;
  sentence: string;
  position: number;
};

function splitSentences(text: string): { text: string; start: number }[] {
  const result: { text: string; start: number }[] = [];
  const re = /[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const s = m[0].trim();
    if (s.length > 0) {
      result.push({ text: s, start: m.index });
    }
  }
  return result;
}

function scan(text: string): Finding[] {
  if (!text.trim()) return [];
  const sentences = splitSentences(text);
  const found: Finding[] = [];
  for (const s of sentences) {
    for (const rule of RULES) {
      if (rule.pattern.test(s.text)) {
        found.push({ rule, sentence: s.text, position: s.start });
      }
    }
  }
  return found;
}

const SAMPLE = `This Agreement shall automatically renew for successive one-year terms unless either party provides notice of non-renewal.

The Supplier's liability under this Agreement shall be unlimited for any breach of confidentiality, indemnity, or data protection obligations.

Customer agrees to indemnify and hold harmless Supplier from any and all claims, losses, and expenses arising out of Customer's use of the Services.

Supplier may modify the pricing at its sole and absolute discretion upon thirty (30) days notice.

The Software is provided "as is" without warranty of any kind, express or implied.

Supplier is granted a perpetual, irrevocable license to use any feedback provided by Customer.

Customer may not assign this Agreement, but Supplier may assign to any affiliate without consent.

During the term and for two years thereafter, Customer shall not compete with Supplier in any market.`;

// Risk weighting drives the overall score. Critical dwarfs the rest so a
// single critical clause cannot be drowned out by multiple low-severity hits.
const RISK_WEIGHT: Record<Risk, number> = {
  critical: 25,
  high: 12,
  medium: 5,
  low: 2,
};

const RISK_LABEL: Record<Risk, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

// Severity tones — keep semantic colors (rose / amber / sky / emerald).
const RISK_TEXT: Record<Risk, string> = {
  critical: "text-rose-500",
  high: "text-rose-500",
  medium: "text-amber-500",
  low: "text-emerald-500",
};

const RISK_BORDER: Record<Risk, string> = {
  critical: "border-rose-500/40",
  high: "border-rose-500/30",
  medium: "border-amber-500/30",
  low: "border-emerald-500/30",
};

const RISK_TINT: Record<Risk, string> = {
  critical: "bg-rose-500/10",
  high: "bg-rose-500/[0.07]",
  medium: "bg-amber-500/[0.07]",
  low: "bg-emerald-500/[0.07]",
};

const RISK_DOT: Record<Risk, string> = {
  critical: "bg-rose-500",
  high: "bg-rose-400",
  medium: "bg-amber-400",
  low: "bg-emerald-400",
};

const RISK_BADGE: Record<Risk, string> = {
  critical: "border-rose-500/40 bg-rose-500/15 text-rose-500",
  high: "border-rose-500/30 bg-rose-500/10 text-rose-500",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
};

const RISK_RAIL: Record<Risk, string> = {
  critical: "bg-rose-500",
  high: "bg-rose-400",
  medium: "bg-amber-400",
  low: "bg-emerald-400",
};

// Highlighted clause text uses the tool-accent-soft surface so it tracks the
// active legal theme rather than a hard-coded hue.
function renderHighlightedSentence(sentence: string, rule: Rule) {
  const re = new RegExp(rule.pattern.source, rule.pattern.flags.replace("g", ""));
  const match = sentence.match(re);
  if (!match || match.index === undefined) {
    return <>{sentence}</>;
  }
  const before = sentence.slice(0, match.index);
  const hit = sentence.slice(match.index, match.index + match[0].length);
  const after = sentence.slice(match.index + match[0].length);
  return (
    <>
      {before}
      <mark className="rounded-sm bg-tool-accent-soft px-0.5 text-tool-accent underline decoration-tool-accent/60 decoration-wavy underline-offset-4">
        {hit}
      </mark>
      {after}
    </>
  );
}

type ViewKey = "scan" | "findings" | "recommendations";

const VIEWS: { k: ViewKey; label: string }[] = [
  { k: "scan", label: "Scan" },
  { k: "findings", label: "Findings" },
  { k: "recommendations", label: "Recommendations" },
];

export default function ContractRiskCheckerPage() {
  const [text, setText] = useState(SAMPLE);
  const [view, setView] = useState<ViewKey>("scan");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const findings = useMemo(() => scan(text), [text]);

  const byRisk = useMemo(() => {
    return {
      critical: findings.filter((f) => f.rule.risk === "critical").length,
      high: findings.filter((f) => f.rule.risk === "high").length,
      medium: findings.filter((f) => f.rule.risk === "medium").length,
      low: findings.filter((f) => f.rule.risk === "low").length,
    };
  }, [findings]);

  // Total risk score — sum of weighted hits, capped at 100 for display.
  const score = useMemo(() => {
    const raw =
      byRisk.critical * RISK_WEIGHT.critical +
      byRisk.high * RISK_WEIGHT.high +
      byRisk.medium * RISK_WEIGHT.medium +
      byRisk.low * RISK_WEIGHT.low;
    return Math.min(100, raw);
  }, [byRisk]);

  // Group findings by sentence so the contract preview shows one
  // highlighted block per sentence with all matching dots stacked.
  const findingsBySentence = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const f of findings) {
      const arr = map.get(f.sentence) ?? [];
      arr.push(f);
      map.set(f.sentence, arr);
    }
    return map;
  }, [findings]);

  const paperSentences = useMemo(() => splitSentences(text), [text]);

  const overallRisk: Risk =
    byRisk.critical > 0
      ? "critical"
      : byRisk.high > 0
      ? "high"
      : byRisk.medium > 0
      ? "medium"
      : "low";

  // Verdict copy keyed off score, not just count.
  const verdict =
    byRisk.critical > 0
      ? "Critical exposure — block until rewritten"
      : byRisk.high > 0
      ? "High risk — negotiate before signing"
      : byRisk.medium > 0
      ? "Manageable — tighten the language"
      : findings.length > 0
      ? "Low risk — second read recommended"
      : "No red flags detected";

  // Document chip — derive from the first non-empty word of the contract.
  const docChip = useMemo(() => {
    const m = text.trim().match(/[A-Za-z][A-Za-z0-9-]+/);
    return m ? m[0].toLowerCase().slice(0, 14) : "contract";
  }, [text]);

  return (
    <div data-tool-theme="legal" data-tool="contract-risk-checker">
      <ToolShell
        category="Legal & Compliance"
        title="Contract Risk Checker"
        description="Paste a contract and get a quick scan for risky clauses. Everything runs locally in your browser — no data leaves your machine."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — verdict + doc chips */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${RISK_BADGE[overallRisk]}`}
            >
              {findings.length === 0 ? "CLEAR" : RISK_LABEL[overallRisk].toUpperCase()}
            </span>
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              doc:{docChip}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              contract.review
              <span className="text-faint">/</span>
              <span className="text-secondary">scan.{RULES.length}-rules</span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              {hydrated ? "◉ local-only" : ""}
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Clause review · red-flag scan
                </div>

                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                  {verdict}
                </h1>

                <p className="mt-2 max-w-xl text-sm leading-relaxed text-secondary">
                  Heuristic scan against {RULES.length} common red-flag patterns.
                  Highlights mark the exact language matched. Not legal advice —
                  for material deals, route to counsel.
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {paperSentences.length} sentence{paperSentences.length === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {findings.length} flag{findings.length === 1 ? "" : "s"}
                  </span>
                  {byRisk.critical > 0 && (
                    <span className={`rounded-md border px-2.5 py-1 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] ${RISK_BADGE.critical}`}>
                      {byRisk.critical} critical
                    </span>
                  )}
                </div>
              </div>

              {/* Risk score readout */}
              <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-4 py-3">
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Total risk score
                  </div>
                  <div className={`font-mono text-3xl font-bold tracking-tight ${RISK_TEXT[overallRisk]}`}>
                    {score}
                    <span className="ml-0.5 text-sm text-muted">/100</span>
                  </div>
                </div>
                <div className="h-12 w-px bg-app" />
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Severity
                  </div>
                  <div className={`text-sm font-semibold ${RISK_TEXT[overallRisk]}`}>
                    {findings.length === 0 ? "None" : RISK_LABEL[overallRisk]}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* sub-tab strip — segmented pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {VIEWS.map((t) => (
                <button
                  key={t.k}
                  onClick={() => setView(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    view === t.k
                      ? "bg-tool-accent text-app-elevated"
                      : "text-secondary hover:text-app"
                  }`}
                  style={view === t.k ? { color: "var(--bg)" } : undefined}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => setText(SAMPLE)}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Load sample
              </button>
              <button
                onClick={() => setText("")}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Clear
              </button>
            </div>
          </div>

          {/* severity strip */}
          <div className="grid grid-cols-2 border-t border-app md:grid-cols-4">
            <SeverityCell tone="critical" count={byRisk.critical} hint="Block until rewritten" />
            <SeverityCell tone="high" count={byRisk.high} hint="Negotiate hard" />
            <SeverityCell tone="medium" count={byRisk.medium} hint="Tighten language" />
            <SeverityCell tone="low" count={byRisk.low} hint="Second read" />
          </div>
        </section>

        {/* ============================== VIEWS ============================== */}
        {view === "scan" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.55fr_1fr]">
            {/* Contract input + marked-up preview */}
            <ToolCard title="Contract" subtitle="Paste · Highlight · Review">
              <Field label="Paste contract text">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className={inputCls("min-h-[180px] font-mono text-xs")}
                  spellCheck={false}
                />
              </Field>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span>Marked-up preview</span>
                  <span className="text-muted">
                    {findings.length} flag{findings.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="relative overflow-hidden rounded-xl border border-app bg-app">
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-tool-accent/60" />
                  <div className="max-h-[520px] overflow-auto px-6 py-6 font-mono text-[0.85rem] leading-7 text-app sm:px-8">
                    {paperSentences.length === 0 ? (
                      <p className="italic text-faint">
                        Paste a contract above to see clause-level highlights.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {paperSentences.map((s, i) => {
                          const matches = findingsBySentence.get(s.text) ?? [];
                          const top: Risk | null =
                            matches.find((m) => m.rule.risk === "critical")?.rule.risk ??
                            matches.find((m) => m.rule.risk === "high")?.rule.risk ??
                            matches.find((m) => m.rule.risk === "medium")?.rule.risk ??
                            matches.find((m) => m.rule.risk === "low")?.rule.risk ??
                            null;

                          if (!top) {
                            return (
                              <p key={i} className="text-secondary">
                                {s.text}
                              </p>
                            );
                          }

                          return (
                            <div
                              key={i}
                              className={`relative rounded-lg border-l-4 px-3 py-2 ${RISK_BORDER[top]} ${RISK_TINT[top]}`}
                              style={{ borderLeftColor: undefined }}
                            >
                              <span
                                className={`absolute left-0 top-0 h-full w-1 ${RISK_RAIL[top]}`}
                              />
                              <div className="absolute -left-7 top-3 hidden flex-col gap-1 sm:flex">
                                {matches.map((m, idx) => (
                                  <span
                                    key={idx}
                                    title={`${RISK_LABEL[m.rule.risk]} risk · ${m.rule.label}`}
                                    className={`h-2.5 w-2.5 rounded-full ${RISK_DOT[m.rule.risk]}`}
                                  />
                                ))}
                              </div>
                              <p className="text-app">
                                {renderHighlightedSentence(s.text, matches[0].rule)}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {matches.map((m, idx) => (
                                  <span
                                    key={idx}
                                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.18em] ${RISK_BADGE[m.rule.risk]}`}
                                  >
                                    <span className={`h-1.5 w-1.5 rounded-full ${RISK_DOT[m.rule.risk]}`} />
                                    {m.rule.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <p className="mt-4 text-[0.65rem] leading-relaxed text-faint">
                This is a heuristic scan, not legal advice. Runs entirely in your
                browser. For material deals, have counsel review before signing.
              </p>
            </ToolCard>

            {/* Side-rail of flagged clauses */}
            <ToolCard
              title="Flagged clauses"
              subtitle={
                findings.length === 0
                  ? "No matches"
                  : `${findings.length} flag${findings.length === 1 ? "" : "s"}`
              }
            >
              {findings.length === 0 ? (
                <div className={`rounded-xl border p-4 ${RISK_BORDER.low} ${RISK_TINT.low}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${RISK_DOT.low}`} />
                    <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-emerald-500">
                      Clean scan
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-secondary">
                    No common red-flag patterns matched. That doesn&apos;t mean
                    the contract is safe — it means none of these specific
                    patterns triggered. Have counsel review.
                  </p>
                </div>
              ) : (
                <div className="max-h-[640px] space-y-2.5 overflow-auto pr-1">
                  {findings.map((f, i) => (
                    <FindingRow key={i} f={f} />
                  ))}
                </div>
              )}
            </ToolCard>
          </div>
        )}

        {view === "findings" && (
          <ToolCard
            title="All findings"
            subtitle={
              findings.length === 0
                ? "No matches"
                : `${findings.length} flagged clause${findings.length === 1 ? "" : "s"}`
            }
          >
            {findings.length === 0 ? (
              <div className="rounded-xl border border-app bg-app p-6 text-center text-sm text-muted">
                Nothing flagged yet. Switch back to <span className="text-tool-accent">Scan</span> and paste a contract.
              </div>
            ) : (
              <div className="space-y-2.5">
                {findings.map((f, i) => (
                  <FindingRow key={i} f={f} expanded />
                ))}
              </div>
            )}
          </ToolCard>
        )}

        {view === "recommendations" && (
          <ToolCard title="Recommendations" subtitle="What to push back on, in order">
            {findings.length === 0 ? (
              <div className="rounded-xl border border-app bg-app p-6 text-center text-sm text-muted">
                No findings — nothing to negotiate. Run a scan first.
              </div>
            ) : (
              <ol className="space-y-3">
                {[...findings]
                  .sort(
                    (a, b) =>
                      RISK_WEIGHT[b.rule.risk] - RISK_WEIGHT[a.rule.risk]
                  )
                  .map((f, i) => (
                    <li
                      key={i}
                      className="rounded-xl border border-app bg-app-elevated p-4"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border bg-app font-mono text-xs font-bold ${RISK_BORDER[f.rule.risk]} ${RISK_TEXT[f.rule.risk]}`}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-md border px-2 py-0.5 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.18em] ${RISK_BADGE[f.rule.risk]}`}
                            >
                              {RISK_LABEL[f.rule.risk]}
                            </span>
                            <span className="text-sm font-semibold text-app">
                              {f.rule.label}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-secondary">
                            {f.rule.explain}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
              </ol>
            )}
          </ToolCard>
        )}
      </ToolShell>
    </div>
  );
}

function FindingRow({ f, expanded = false }: { f: Finding; expanded?: boolean }) {
  return (
    <article
      className={`group relative overflow-hidden rounded-xl border bg-app-elevated p-3.5 transition-colors hover:border-tool-accent ${RISK_BORDER[f.rule.risk]}`}
    >
      <span className={`absolute left-0 top-0 h-full w-1 ${RISK_RAIL[f.rule.risk]}`} />
      <div className="flex items-start justify-between gap-3 pl-1">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${RISK_DOT[f.rule.risk]}`} />
          <div className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-app">
            {f.rule.label}
          </div>
        </div>
        <div
          className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-[0.5rem] font-semibold uppercase tracking-[0.2em] ${RISK_BADGE[f.rule.risk]}`}
        >
          {RISK_LABEL[f.rule.risk]}
        </div>
      </div>

      <blockquote className="mt-2.5 rounded border-l-2 border-app bg-app py-1.5 pl-3 text-[0.78rem] italic leading-relaxed text-secondary">
        {renderHighlightedSentence(f.sentence, f.rule)}
      </blockquote>

      {expanded && (
        <div className="mt-2.5">
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
            Why it matters
          </div>
          <p className="mt-1 text-[0.78rem] leading-relaxed text-secondary">
            {f.rule.explain}
          </p>
        </div>
      )}
      {!expanded && (
        <p className="mt-2.5 text-[0.78rem] leading-relaxed text-muted">
          {f.rule.explain}
        </p>
      )}
    </article>
  );
}

function SeverityCell({
  tone,
  count,
  hint,
}: {
  tone: Risk;
  count: number;
  hint: string;
}) {
  const active = count > 0;
  return (
    <div
      className={`flex items-center justify-between border-app px-4 py-3 [&:not(:last-child)]:border-r ${
        active ? RISK_TINT[tone] : "bg-app"
      }`}
    >
      <div>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${active ? RISK_DOT[tone] : "bg-app-elevated"}`} />
          <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
            {RISK_LABEL[tone]}
          </span>
        </div>
        <div className="mt-0.5 text-[0.65rem] text-faint">{hint}</div>
      </div>
      <div
        className={`font-mono text-2xl font-bold tracking-tight ${
          active ? RISK_TEXT[tone] : "text-faint"
        }`}
      >
        {count}
      </div>
    </div>
  );
}
