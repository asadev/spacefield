"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard from "../../_components/ToolCard";

type CronField = { values: number[]; raw: string; wildcard: boolean };
type ParsedCron =
  | { ok: true; fields: CronField[]; withSeconds: boolean; description: string; original: string }
  | { ok: false; error: string };

// Each field: minute, hour, dom, month, dow [, optional seconds prefix]
const RANGES: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // dom
  [1, 12], // month
  [0, 6], // dow (0 = Sun)
];

function parseField(raw: string, min: number, max: number): CronField {
  const values = new Set<number>();
  const parts = raw.split(",");
  for (const part of parts) {
    // step notation: */5 or 1-10/2
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const step = stepMatch ? parseInt(stepMatch[2]) : 1;
    const base = stepMatch ? stepMatch[1] : part;

    let lo: number, hi: number;
    if (base === "*") {
      lo = min;
      hi = max;
    } else if (/^\d+-\d+$/.test(base)) {
      const [a, b] = base.split("-").map(Number);
      lo = a;
      hi = b;
    } else if (/^\d+$/.test(base)) {
      lo = parseInt(base);
      hi = lo;
    } else {
      throw new Error(`bad token: ${part}`);
    }

    if (lo < min || hi > max || lo > hi) {
      throw new Error(`out of range: ${part} (${min}-${max})`);
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return {
    values: [...values].sort((a, b) => a - b),
    raw,
    wildcard: raw === "*",
  };
}

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function describe(fields: CronField[], withSeconds: boolean): string {
  const off = withSeconds ? 1 : 0;
  const min = fields[0 + off];
  const hr = fields[1 + off];
  const dom = fields[2 + off];
  const mon = fields[3 + off];
  const dow = fields[4 + off];
  const sec = withSeconds ? fields[0] : null;

  const parts: string[] = [];

  // Time portion
  if (min.wildcard && hr.wildcard) {
    parts.push(sec && !sec.wildcard ? `At second ${sec.values.join(",")} of every minute` : "Every minute");
  } else if (hr.wildcard && !min.wildcard) {
    if (min.raw.startsWith("*/")) {
      parts.push(`Every ${min.raw.slice(2)} minutes`);
    } else {
      parts.push(`At minute ${min.values.join(",")}`);
    }
  } else if (!min.wildcard && !hr.wildcard) {
    // specific times
    const times: string[] = [];
    for (const h of hr.values) {
      for (const m of min.values) {
        times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    parts.push(`At ${times.slice(0, 6).join(", ")}${times.length > 6 ? "…" : ""}`);
  } else if (min.wildcard && !hr.wildcard) {
    parts.push(`Every minute past hour ${hr.values.join(",")}`);
  }

  // Day portion
  if (!dow.wildcard) {
    const names = dow.values.map((d) => DOW_NAMES[d] || String(d));
    parts.push(`on ${names.join(", ")}`);
  }
  if (!dom.wildcard) {
    parts.push(`on day-of-month ${dom.values.join(", ")}`);
  }
  if (!mon.wildcard) {
    const names = mon.values.map((m) => MONTH_NAMES[m - 1] || String(m));
    parts.push(`in ${names.join(", ")}`);
  }

  return parts.join(" ");
}

function parseCron(expr: string): ParsedCron {
  const tokens = expr.trim().split(/\s+/);
  const withSeconds = tokens.length === 6;
  if (tokens.length !== 5 && tokens.length !== 6) {
    return { ok: false, error: `Expected 5 or 6 fields, got ${tokens.length}.` };
  }
  try {
    const fields: CronField[] = [];
    if (withSeconds) {
      fields.push(parseField(tokens[0], 0, 59));
      for (let i = 0; i < 5; i++) {
        fields.push(parseField(tokens[i + 1], RANGES[i][0], RANGES[i][1]));
      }
    } else {
      for (let i = 0; i < 5; i++) {
        fields.push(parseField(tokens[i], RANGES[i][0], RANGES[i][1]));
      }
    }
    return {
      ok: true,
      fields,
      withSeconds,
      description: describe(fields, withSeconds),
      original: expr.trim(),
    };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function nextRuns(parsed: ParsedCron, count = 5, now = new Date()): Date[] {
  if (!parsed.ok) return [];
  const off = parsed.withSeconds ? 1 : 0;
  const sec = parsed.withSeconds ? parsed.fields[0] : null;
  const min = parsed.fields[0 + off];
  const hr = parsed.fields[1 + off];
  const dom = parsed.fields[2 + off];
  const mon = parsed.fields[3 + off];
  const dow = parsed.fields[4 + off];

  const results: Date[] = [];
  const d = new Date(now.getTime() + 1000); // start 1 second ahead
  d.setMilliseconds(0);
  if (!parsed.withSeconds) d.setSeconds(0);

  let safety = 0;
  while (results.length < count && safety < 1000000) {
    safety++;
    if (!mon.values.includes(d.getMonth() + 1)) {
      // advance to first day of next month
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      d.setMonth(d.getMonth() + 1);
      continue;
    }
    const domOk = dom.values.includes(d.getDate());
    const dowOk = dow.values.includes(d.getDay());
    // If both dom and dow are restricted (non-wildcard), cron OR's them; if only one, use that.
    const dayOk =
      dom.wildcard && dow.wildcard
        ? true
        : dom.wildcard
          ? dowOk
          : dow.wildcard
            ? domOk
            : domOk || dowOk;
    if (!dayOk) {
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + 1);
      continue;
    }
    if (!hr.values.includes(d.getHours())) {
      d.setMinutes(0, 0, 0);
      if (parsed.withSeconds) d.setSeconds(0);
      d.setHours(d.getHours() + 1);
      continue;
    }
    if (!min.values.includes(d.getMinutes())) {
      if (parsed.withSeconds) d.setSeconds(0);
      d.setMilliseconds(0);
      d.setMinutes(d.getMinutes() + 1);
      continue;
    }
    if (sec && !sec.values.includes(d.getSeconds())) {
      d.setSeconds(d.getSeconds() + 1);
      continue;
    }
    results.push(new Date(d));
    d.setTime(d.getTime() + (parsed.withSeconds ? 1000 : 60000));
  }
  return results;
}

// Natural language → cron. Supports a handful of common phrases.
function nlToCron(phrase: string): string | null {
  const p = phrase.toLowerCase().trim();
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^every (\d+) minutes?$/))) return `*/${m[1]} * * * *`;
  if ((m = p.match(/^every (\d+) hours?$/))) return `0 */${m[1]} * * *`;
  if (p === "every minute") return "* * * * *";
  if (p === "every hour") return "0 * * * *";
  if (p === "every day" || p === "daily" || p === "daily at midnight") return "0 0 * * *";
  if ((m = p.match(/^daily at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/))) {
    let h = parseInt(m[1]);
    const min = m[2] ? parseInt(m[2]) : 0;
    if (m[3] === "pm" && h < 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    return `${min} ${h} * * *`;
  }
  if (p === "weekdays" || p === "every weekday") return "0 9 * * 1-5";
  if (p === "weekends") return "0 9 * * 0,6";
  if (p === "every monday") return "0 9 * * 1";
  if (p === "every friday") return "0 9 * * 5";
  if (p === "first of month") return "0 0 1 * *";
  return null;
}

const PRESETS = [
  { label: "every minute", expr: "* * * * *" },
  { label: "every 5 min", expr: "*/5 * * * *" },
  { label: "every 15 min", expr: "*/15 * * * *" },
  { label: "every hour", expr: "0 * * * *" },
  { label: "daily 9am", expr: "0 9 * * *" },
  { label: "daily 00:00", expr: "0 0 * * *" },
  { label: "weekdays 9am", expr: "0 9 * * 1-5" },
  { label: "every monday", expr: "0 9 * * 1" },
  { label: "1st of month", expr: "0 0 1 * *" },
  { label: "sunday noon", expr: "0 12 * * 0" },
];

const FIELD_LABELS_5 = ["minute", "hour", "dom", "month", "dow"];
const FIELD_LABELS_6 = ["second", "minute", "hour", "dom", "month", "dow"];
const FIELD_RANGES_5 = ["0-59", "0-23", "1-31", "1-12", "0-6"];
const FIELD_RANGES_6 = ["0-59", "0-59", "0-23", "1-31", "1-12", "0-6"];

function fieldHuman(label: string, f: CronField): string {
  if (f.wildcard) return `every ${label}`;
  if (f.raw.startsWith("*/")) return `every ${f.raw.slice(2)} ${label}s`;
  if (label === "dow") return f.values.map((d) => DOW_NAMES[d]).join(", ");
  if (label === "month") return f.values.map((m) => MONTH_NAMES[m - 1]).join(", ");
  if (f.values.length <= 4) return f.values.join(", ");
  return `${f.values.length} values`;
}

type Mode = "parse" | "builder";

export default function CronExpressionParserPage() {
  const [expr, setExpr] = useState("0 9 * * 1-5");
  const [nl, setNl] = useState("");
  const [mode, setMode] = useState<Mode>("parse");
  const parsed = useMemo(() => parseCron(expr), [expr]);
  const runs = useMemo(() => nextRuns(parsed, 5), [parsed]);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tokens = expr.trim().split(/\s+/);

  const tryNl = () => {
    const result = nlToCron(nl);
    if (result) setExpr(result);
  };

  const fieldLabels = parsed.ok && parsed.withSeconds ? FIELD_LABELS_6 : FIELD_LABELS_5;
  const fieldRanges = parsed.ok && parsed.withSeconds ? FIELD_RANGES_6 : FIELD_RANGES_5;

  // Builder mode field state — drives the expression
  const builderTokens = tokens.length === 6 || tokens.length === 5 ? tokens : ["*", "*", "*", "*", "*"];
  const updateBuilderToken = (idx: number, value: string) => {
    const next = [...builderTokens];
    next[idx] = value || "*";
    setExpr(next.join(" "));
  };

  return (
    <div data-tool-theme="data" data-tool="cron-expression-parser">
      <ToolShell
        category="Data & Developer"
        title="Cron Expression Parser"
        description="Parse 5- or 6-field cron, translate to English, and see the next 5 runs in your timezone. Builder with common presets."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — validity + tz + field-count chips */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${
                parsed.ok
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
                  : "border-rose-500/40 bg-rose-500/15 text-rose-500"
              }`}
            >
              {parsed.ok ? "valid" : "invalid"}
            </span>
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              {parsed.ok ? (parsed.withSeconds ? "6-field" : "5-field") : `${tokens.length}-field`}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              schedule.parser
              <span className="text-faint">/</span>
              <span className="text-secondary">{expr.trim() || "(empty)"}</span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">tz:{tz}</div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Cron Expression · Schedule Parser
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {tokens.length} field{tokens.length === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {runs.length} upcoming
                  </span>
                </div>

                <div className="mt-3">
                  <input
                    value={expr}
                    onChange={(e) => setExpr(e.target.value)}
                    spellCheck={false}
                    placeholder="* * * * *"
                    className="w-full bg-transparent font-mono text-2xl font-semibold tracking-wider text-app placeholder:text-faint outline-none md:text-3xl"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* sub-tab strip */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "parse", label: "Parse" },
                  { k: "builder", label: "Builder" },
                ] as { k: Mode; label: string }[]
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

            <select
              onChange={(e) => {
                if (e.target.value) setExpr(e.target.value);
                e.target.value = "";
              }}
              className="rounded-lg border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary outline-none transition-colors hover:border-tool-accent"
              defaultValue=""
            >
              <option value="" disabled>
                Load preset…
              </option>
              {PRESETS.map((p) => (
                <option key={p.expr} value={p.expr}>
                  {p.label} — {p.expr}
                </option>
              ))}
            </select>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => navigator.clipboard?.writeText(expr)}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Copy expr
              </button>
              <button
                onClick={() => setExpr("* * * * *")}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Reset
              </button>
            </div>
          </div>
        </section>

        {/* =========== PRESETS + NL INPUT =========== */}
        <ToolCard
          title="Presets & natural language"
          subtitle="Pick a common schedule, or type a phrase"
          className="mb-6"
        >
          <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
            presets
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.expr}
                onClick={() => setExpr(p.expr)}
                className={`rounded-lg border px-2.5 py-1 font-mono text-[0.65rem] transition-colors ${
                  expr === p.expr
                    ? "border-tool-accent bg-tool-accent text-app-elevated"
                    : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:bg-tool-accent-soft hover:text-tool-accent"
                }`}
                style={expr === p.expr ? { color: "var(--bg)" } : undefined}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-2 md:grid-cols-[1fr_auto]">
            <input
              value={nl}
              onChange={(e) => setNl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryNl()}
              placeholder='try: "every 15 minutes" / "daily at 9am" / "weekdays"'
              className="rounded-lg border border-app bg-app px-3 py-2 font-mono text-xs text-app placeholder:text-faint outline-none transition-colors focus:border-tool-accent"
            />
            <button
              onClick={tryNl}
              className="rounded-lg border border-tool-accent bg-tool-accent-soft px-4 py-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
            >
              parse → cron
            </button>
          </div>
        </ToolCard>

        {/* =========== FIELDS BREAKDOWN (segmented chips) =========== */}
        <ToolCard
          title="Field tokens"
          subtitle={parsed.ok ? "Each segment of the expression" : "Syntax error"}
          className="mb-6"
        >
          {parsed.ok ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {parsed.fields.map((f, i) => (
                <div
                  key={i}
                  className={`rounded-xl border p-3 ${
                    f.wildcard
                      ? "border-app bg-app"
                      : "border-tool-accent bg-tool-accent-soft"
                  }`}
                >
                  <div
                    className={`font-mono text-[0.55rem] uppercase tracking-[0.18em] ${
                      f.wildcard ? "text-muted" : "text-tool-accent"
                    }`}
                  >
                    {fieldLabels[i]}
                  </div>
                  <div
                    className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
                      f.wildcard ? "text-secondary" : "text-tool-accent"
                    }`}
                  >
                    {f.raw}
                  </div>
                  <div className="mt-2 font-mono text-[0.6rem] text-muted">
                    {fieldRanges[i]}
                  </div>
                  <div className="mt-2 border-t border-app pt-2 font-mono text-[0.65rem] leading-snug text-secondary">
                    {fieldHuman(fieldLabels[i], f)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-500">
              <span className="opacity-80">! parse_error:</span> {parsed.error}
            </div>
          )}
        </ToolCard>

        {/* =========== BUILDER (segmented per-field editor) =========== */}
        {mode === "builder" && (
          <ToolCard
            title="Builder"
            subtitle="Edit each field directly — accepts *, n, a-b, n,m, */k"
            className="mb-6"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {FIELD_LABELS_5.map((label, i) => (
                <div key={label} className="rounded-xl border border-app bg-app p-3">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    {label}
                  </div>
                  <input
                    value={builderTokens[i] ?? "*"}
                    onChange={(e) => updateBuilderToken(i, e.target.value)}
                    spellCheck={false}
                    className="mt-1 w-full bg-transparent font-mono text-xl font-semibold tabular-nums text-app placeholder:text-faint outline-none"
                  />
                  <div className="mt-1 font-mono text-[0.6rem] text-muted">
                    {FIELD_RANGES_5[i]}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 font-mono text-[0.6rem] text-muted">
              tip: append a 6th field (seconds) by editing the expression directly above.
            </div>
          </ToolCard>
        )}

        {/* =========== ENGLISH + NEXT-FIRES TIMELINE =========== */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.1fr]">
          {/* English */}
          <ToolCard title="In English" subtitle="Plain-language description">
            {parsed.ok ? (
              <>
                <div className="rounded-lg border border-tool-accent bg-tool-accent-soft p-4 text-base leading-relaxed text-app">
                  {parsed.description}
                </div>
                <div className="mt-4 rounded-lg border border-app bg-app p-3 font-mono text-[0.65rem] leading-relaxed text-secondary">
                  <div className="text-tool-accent">// format reference</div>
                  <div className="mt-1">
                    {parsed.withSeconds ? "sec min hr dom mon dow" : "min hr dom mon dow"}
                  </div>
                  <div className="mt-1 text-muted">
                    <span className="text-tool-accent">*</span> any ·{" "}
                    <span className="text-tool-accent">1-5</span> range ·{" "}
                    <span className="text-tool-accent">1,3,5</span> list ·{" "}
                    <span className="text-tool-accent">*/5</span> step
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
                Cannot translate — fix the expression first.
              </div>
            )}
          </ToolCard>

          {/* Next runs timeline */}
          <ToolCard title="Next 5 runs" subtitle={`Timezone · ${tz}`}>
            {runs.length > 0 ? (
              <ol className="relative space-y-2.5 pl-5">
                <span className="pointer-events-none absolute bottom-2 left-[7px] top-2 w-px bg-tool-accent-soft" />
                {runs.map((r, i) => {
                  const minsAway = Math.round((r.getTime() - Date.now()) / 60000);
                  const dist =
                    minsAway < 60
                      ? `${minsAway}m`
                      : minsAway < 60 * 24
                        ? `${Math.round(minsAway / 60)}h`
                        : `${Math.round(minsAway / (60 * 24))}d`;
                  return (
                    <li key={i} className="relative">
                      <span
                        className={`absolute -left-5 top-3 flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
                          i === 0
                            ? "border-tool-accent bg-tool-accent"
                            : "border-tool-accent bg-app-elevated"
                        }`}
                      />
                      <div
                        className={`flex items-center justify-between rounded-lg border px-3 py-2.5 font-mono ${
                          i === 0
                            ? "border-tool-accent bg-tool-accent-soft"
                            : "border-app bg-app-elevated"
                        }`}
                      >
                        <div>
                          <div
                            className={`text-[0.55rem] uppercase tracking-[0.18em] ${
                              i === 0 ? "text-tool-accent" : "text-muted"
                            }`}
                          >
                            fire #{i + 1}
                          </div>
                          <div className="mt-0.5 text-sm tabular-nums text-app">
                            {r.toLocaleString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                            in
                          </div>
                          <div
                            className={`mt-0.5 text-sm font-semibold tabular-nums ${
                              i === 0 ? "text-tool-accent" : "text-secondary"
                            }`}
                          >
                            {dist}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 font-mono text-xs text-amber-500">
                No upcoming runs found — schedule may be impossible (e.g. Feb 30).
              </div>
            )}
          </ToolCard>
        </div>
      </ToolShell>
    </div>
  );
}
