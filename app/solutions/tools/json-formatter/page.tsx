"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

type Parsed =
  | { ok: true; value: unknown; pretty: string; minified: string; size: number }
  | { ok: false; error: string; line?: number; column?: number };

type ViewMode = "formatted" | "tree" | "query" | "schema" | "diff";

function parseWithLocation(input: string): Parsed {
  try {
    const value = JSON.parse(input);
    const pretty = JSON.stringify(value, null, 2);
    const minified = JSON.stringify(value);
    return { ok: true, value, pretty, minified, size: new Blob([minified]).size };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const posMatch = msg.match(/position (\d+)/);
    let line: number | undefined;
    let column: number | undefined;
    if (posMatch) {
      const pos = parseInt(posMatch[1]);
      const before = input.slice(0, pos);
      line = before.split("\n").length;
      column = pos - before.lastIndexOf("\n");
    }
    return { ok: false, error: msg, line, column };
  }
}

// ---- JSON Path evaluator (subset: $, ., [n], [*], ..key, [?(@.k==...)]) ----
function evalJsonPath(data: unknown, path: string): unknown[] {
  const p = path.trim();
  if (!p || p === "$") return [data];
  type Step =
    | { kind: "key"; key: string }
    | { kind: "index"; idx: number }
    | { kind: "wildcard" }
    | { kind: "descendant"; key: string };
  const steps: Step[] = [];
  let i = 0;
  if (p[0] === "$") i = 1;
  while (i < p.length) {
    const ch = p[i];
    if (ch === ".") {
      if (p[i + 1] === ".") {
        i += 2;
        let key = "";
        while (i < p.length && /[\w$]/.test(p[i])) key += p[i++];
        steps.push({ kind: "descendant", key });
      } else {
        i++;
        if (p[i] === "*") {
          steps.push({ kind: "wildcard" });
          i++;
        } else {
          let key = "";
          while (i < p.length && /[\w$]/.test(p[i])) key += p[i++];
          if (key) steps.push({ kind: "key", key });
        }
      }
    } else if (ch === "[") {
      const close = p.indexOf("]", i);
      if (close < 0) throw new Error("Unterminated [");
      const inside = p.slice(i + 1, close).trim();
      if (inside === "*") {
        steps.push({ kind: "wildcard" });
      } else if (/^-?\d+$/.test(inside)) {
        steps.push({ kind: "index", idx: parseInt(inside) });
      } else if (inside.startsWith("'") || inside.startsWith('"')) {
        steps.push({ kind: "key", key: inside.slice(1, -1) });
      } else {
        throw new Error(`Unsupported bracket expr: ${inside}`);
      }
      i = close + 1;
    } else {
      i++;
    }
  }

  let current: unknown[] = [data];
  for (const step of steps) {
    const next: unknown[] = [];
    for (const node of current) {
      if (step.kind === "key") {
        if (node && typeof node === "object" && !Array.isArray(node)) {
          if (step.key in (node as any)) next.push((node as any)[step.key]);
        }
      } else if (step.kind === "index") {
        if (Array.isArray(node)) {
          const idx = step.idx < 0 ? node.length + step.idx : step.idx;
          if (idx >= 0 && idx < node.length) next.push(node[idx]);
        }
      } else if (step.kind === "wildcard") {
        if (Array.isArray(node)) next.push(...node);
        else if (node && typeof node === "object") next.push(...Object.values(node as any));
      } else if (step.kind === "descendant") {
        const stack: unknown[] = [node];
        while (stack.length) {
          const cur = stack.pop();
          if (cur && typeof cur === "object") {
            if (Array.isArray(cur)) stack.push(...cur);
            else {
              for (const [k, v] of Object.entries(cur as any)) {
                if (k === step.key) next.push(v);
                if (v && typeof v === "object") stack.push(v);
              }
            }
          }
        }
      }
    }
    current = next;
  }
  return current;
}

// ---- JSON Schema inference ----
function inferSchema(val: unknown): any {
  if (val === null) return { type: "null" };
  if (typeof val === "string") return { type: "string" };
  if (typeof val === "number") return { type: Number.isInteger(val) ? "integer" : "number" };
  if (typeof val === "boolean") return { type: "boolean" };
  if (Array.isArray(val)) {
    if (val.length === 0) return { type: "array", items: {} };
    const itemSchemas = val.map(inferSchema);
    const first = JSON.stringify(itemSchemas[0]);
    const same = itemSchemas.every((s) => JSON.stringify(s) === first);
    return { type: "array", items: same ? itemSchemas[0] : { anyOf: dedupe(itemSchemas) } };
  }
  if (typeof val === "object") {
    const props: Record<string, any> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(val as any)) {
      props[k] = inferSchema(v);
      if (v !== undefined) required.push(k);
    }
    return { type: "object", properties: props, required };
  }
  return {};
}

function dedupe(arr: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const a of arr) {
    const k = JSON.stringify(a);
    if (!seen.has(k)) { seen.add(k); out.push(a); }
  }
  return out;
}

// ---- Simple flat diff: deep compare, return change list ----
function diff(a: unknown, b: unknown, path = "$"): { path: string; kind: "added" | "removed" | "changed"; a?: unknown; b?: unknown }[] {
  const out: { path: string; kind: "added" | "removed" | "changed"; a?: unknown; b?: unknown }[] = [];
  if (typeof a !== typeof b || (a === null) !== (b === null)) {
    out.push({ path, kind: "changed", a, b });
    return out;
  }
  if (a && b && typeof a === "object") {
    if (Array.isArray(a) && Array.isArray(b)) {
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) {
        if (i >= a.length) out.push({ path: `${path}[${i}]`, kind: "added", b: b[i] });
        else if (i >= b.length) out.push({ path: `${path}[${i}]`, kind: "removed", a: a[i] });
        else out.push(...diff(a[i], b[i], `${path}[${i}]`));
      }
      return out;
    }
    const keys = new Set([...Object.keys(a as any), ...Object.keys(b as any)]);
    for (const k of keys) {
      const av = (a as any)[k];
      const bv = (b as any)[k];
      if (!(k in (a as any))) out.push({ path: `${path}.${k}`, kind: "added", b: bv });
      else if (!(k in (b as any))) out.push({ path: `${path}.${k}`, kind: "removed", a: av });
      else out.push(...diff(av, bv, `${path}.${k}`));
    }
    return out;
  }
  if (a !== b) out.push({ path, kind: "changed", a, b });
  return out;
}

// ---- Tree node renderer ----
function TreeNode({ k, v, depth = 0 }: { k?: string; v: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const indent = { paddingLeft: depth * 12 };
  if (v === null)
    return (
      <div style={indent} className="text-secondary">
        <span className="text-tool-accent">{k}</span>
        {k !== undefined && ": "}
        <span className="text-rose-400">null</span>
      </div>
    );
  if (typeof v !== "object") {
    const colorCls =
      typeof v === "string"
        ? "text-emerald-400"
        : typeof v === "number"
        ? "text-amber-400"
        : typeof v === "boolean"
        ? "text-sky-400"
        : "text-app";
    return (
      <div style={indent} className="text-secondary">
        <span className="text-tool-accent">{k}</span>
        {k !== undefined && ": "}
        <span className={colorCls}>{JSON.stringify(v)}</span>
      </div>
    );
  }
  const isArr = Array.isArray(v);
  const entries = isArr
    ? (v as unknown[]).map((x, i) => [String(i), x] as const)
    : Object.entries(v as any);
  return (
    <div style={indent}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-left text-secondary hover:text-tool-accent"
      >
        <span className="text-tool-accent">{k}</span>
        {k !== undefined && ": "}
        <span className="text-muted">
          {open
            ? isArr
              ? "["
              : "{"
            : isArr
            ? `[${entries.length}]`
            : `{${entries.length}}`}
        </span>
      </button>
      {open && (
        <>
          {entries.map(([ek, ev]) => (
            <TreeNode key={ek} k={ek} v={ev} depth={depth + 1} />
          ))}
          <div style={indent} className="text-muted">
            {isArr ? "]" : "}"}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Code editor block with line numbers (input or output) ----
function LineNumbers({ text, max = 999 }: { text: string; max?: number }) {
  const lines = text.split("\n").length;
  const count = Math.min(lines, max);
  return (
    <div
      aria-hidden
      className="select-none border-r border-app bg-app py-3 pl-3 pr-2 text-right font-mono text-[0.7rem] leading-[1.5] text-muted"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>{i + 1}</div>
      ))}
    </div>
  );
}

export default function JsonFormatterPage() {
  const [input, setInput] = useState('{\n  "hello": "world",\n  "items": [1, 2, 3]\n}');
  const [inputB, setInputB] = useState('{\n  "hello": "world!",\n  "items": [1, 2, 4]\n}');
  const [view, setView] = useState<ViewMode>("formatted");
  const [query, setQuery] = useState("$.items");
  const parsed = useMemo(() => parseWithLocation(input), [input]);
  const parsedB = useMemo(() => parseWithLocation(inputB), [inputB]);

  const copy = (text: string) => navigator.clipboard?.writeText(text);

  const paste = async (setter: (v: string) => void) => {
    try {
      const t = await navigator.clipboard?.readText();
      if (t) setter(t);
    } catch {
      /* clipboard read may be blocked — silent no-op */
    }
  };

  const queryResult = useMemo(() => {
    if (!parsed.ok) return null;
    try {
      const r = evalJsonPath(parsed.value, query);
      return { ok: true as const, r };
    } catch (e) {
      return { ok: false as const, err: e instanceof Error ? e.message : String(e) };
    }
  }, [parsed, query]);

  const schema = useMemo(() => {
    if (!parsed.ok) return null;
    return { $schema: "http://json-schema.org/draft-07/schema#", ...inferSchema(parsed.value) };
  }, [parsed]);

  const diffs = useMemo(() => {
    if (!parsed.ok || !parsedB.ok) return null;
    return diff(parsed.value, parsedB.value);
  }, [parsed, parsedB]);

  const accentBtn =
    "rounded-md border border-tool-accent/40 bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent transition hover:bg-tool-accent/30 hover:text-app";
  const ghostBtn =
    "rounded-md border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-secondary transition hover:border-tool-accent/40 hover:text-tool-accent";
  const tabBtn = (active: boolean) =>
    `rounded-md border px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] transition ${
      active
        ? "border-tool-accent/50 bg-tool-accent-soft text-tool-accent"
        : "border-app bg-app-elevated text-muted hover:text-secondary"
    }`;

  const inputLines = input.split("\n").length;

  return (
    <ToolShell
      category="Data & Developer"
      title="JSON Formatter & Validator"
      description="Pretty-print, validate, query (JSONPath), infer schema, and diff JSON. All client-side."
    >
      <div data-tool-theme="data" data-tool="json-formatter" className="space-y-5">
        {/* In-tool header strip */}
        <div className="tool-hero flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app bg-tool-surface px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-tool-accent-soft font-mono text-sm font-bold text-tool-accent">
              {"{ }"}
            </div>
            <div>
              <div className="font-mono text-[0.65rem] uppercase tracking-[0.22em] text-tool-accent">
                data.json.formatter
              </div>
              <div className="text-sm font-semibold text-app">JSON Formatter</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[0.65rem]">
            {parsed.ok ? (
              <>
                <span className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-emerald-400">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" />
                  valid
                </span>
                <span className="rounded-md border border-tool-accent/30 bg-tool-accent-soft px-2 py-1 text-tool-accent">
                  {parsed.size.toLocaleString()} B
                </span>
                <span className="rounded-md border border-tool-accent/30 bg-tool-accent-soft px-2 py-1 text-tool-accent">
                  {inputLines} lines
                </span>
              </>
            ) : (
              <span className="rounded-md border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-rose-400">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-400 align-middle" />
                invalid
                {parsed.line !== undefined && parsed.column !== undefined && (
                  <span className="ml-1 opacity-70">
                    @ {parsed.line}:{parsed.column}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* View tabs */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              { k: "formatted", label: "Format" },
              { k: "tree", label: "Tree" },
              { k: "query", label: "JSONPath" },
              { k: "schema", label: "Infer schema" },
              { k: "diff", label: "Diff" },
            ] as { k: ViewMode; label: string }[]
          ).map(({ k, label }) => (
            <button key={k} onClick={() => setView(k)} className={tabBtn(view === k)}>
              {label}
            </button>
          ))}
        </div>

        {/* Editor split: input left / output right */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* INPUT (left) */}
          <div className="overflow-hidden rounded-xl border border-app bg-app-elevated backdrop-blur">
            {/* Editor pane header — decorative traffic-light dots only */}
            <div className="flex items-center justify-between border-b border-app bg-app px-3 py-2">
              <div className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted">
                <span aria-hidden className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-rose-400/60" />
                  <span className="h-2 w-2 rounded-full bg-amber-400/60" />
                  <span className="h-2 w-2 rounded-full bg-emerald-400/60" />
                </span>
                <span>{view === "diff" ? "input.a.json" : "input.json"}</span>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    if (parsed.ok) setInput(parsed.pretty);
                  }}
                  disabled={!parsed.ok}
                  className={accentBtn + " disabled:opacity-40 disabled:hover:bg-tool-accent-soft"}
                >
                  Format
                </button>
                <button
                  onClick={() => {
                    if (parsed.ok) setInput(parsed.minified);
                  }}
                  disabled={!parsed.ok}
                  className={ghostBtn + " disabled:opacity-40"}
                >
                  Minify
                </button>
                <button onClick={() => paste(setInput)} className={ghostBtn}>
                  Paste
                </button>
                <button onClick={() => copy(input)} className={ghostBtn}>
                  Copy
                </button>
              </div>
            </div>
            <div
              className="grid"
              style={{
                gridTemplateColumns: "auto 1fr",
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
              }}
            >
              <LineNumbers text={input} />
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
                className="w-full resize-y border-0 bg-transparent p-3 font-mono text-xs leading-[1.5] text-app outline-none placeholder:text-muted focus:ring-1 focus:ring-tool-accent"
                style={{ minHeight: 360, tabSize: 2 }}
                placeholder="Paste JSON here..."
              />
            </div>
            {!parsed.ok && (
              <div className="border-t border-rose-400/25 bg-rose-500/10 px-3 py-2 font-mono text-[0.7rem] text-rose-400">
                <span className="mr-2 rounded border border-rose-400/40 bg-rose-500/20 px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.18em]">
                  parse error
                </span>
                {parsed.error}
                {parsed.line !== undefined && parsed.column !== undefined && (
                  <span className="ml-2 opacity-70">
                    [line {parsed.line}, col {parsed.column}]
                  </span>
                )}
              </div>
            )}

            {view === "diff" && (
              <>
                <div className="flex items-center justify-between border-y border-app bg-app px-3 py-2">
                  <div className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted">
                    <span aria-hidden className="flex gap-1">
                      <span className="h-2 w-2 rounded-full bg-rose-400/60" />
                      <span className="h-2 w-2 rounded-full bg-amber-400/60" />
                      <span className="h-2 w-2 rounded-full bg-emerald-400/60" />
                    </span>
                    <span>input.b.json</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => paste(setInputB)} className={ghostBtn}>
                      Paste
                    </button>
                    <button onClick={() => copy(inputB)} className={ghostBtn}>
                      Copy
                    </button>
                  </div>
                </div>
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: "auto 1fr",
                    fontFamily:
                      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                  }}
                >
                  <LineNumbers text={inputB} />
                  <textarea
                    value={inputB}
                    onChange={(e) => setInputB(e.target.value)}
                    spellCheck={false}
                    className="w-full resize-y border-0 bg-transparent p-3 font-mono text-xs leading-[1.5] text-app outline-none placeholder:text-muted focus:ring-1 focus:ring-tool-accent"
                    style={{ minHeight: 200, tabSize: 2 }}
                  />
                </div>
              </>
            )}

            {view === "query" && (
              <div className="border-t border-app bg-app p-3">
                <div className="mb-1.5 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                  jsonpath query <span className="text-muted">·</span>{" "}
                  <span className="text-muted">$, ., [n], [*], ..key</span>
                </div>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="$.foo.bar"
                  className="w-full rounded-md border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-xs text-app outline-none focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {["$", "$.items", "$.items[0]", "$..name", "$.*"].map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuery(q)}
                      className="rounded border border-tool-accent/30 bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] text-tool-accent hover:bg-tool-accent/30"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* OUTPUT (right) */}
          <div className="overflow-hidden rounded-xl border border-app bg-app-elevated backdrop-blur">
            <div className="flex items-center justify-between border-b border-app bg-app px-3 py-2">
              <div className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted">
                <span aria-hidden className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-rose-400/60" />
                  <span className="h-2 w-2 rounded-full bg-amber-400/60" />
                  <span className="h-2 w-2 rounded-full bg-emerald-400/60" />
                </span>
                <span>output.{view}.json</span>
              </div>
              {parsed.ok && view === "formatted" && (
                <button onClick={() => copy(parsed.pretty)} className={accentBtn}>
                  Copy pretty
                </button>
              )}
              {parsed.ok && view === "schema" && schema && (
                <button
                  onClick={() => copy(JSON.stringify(schema, null, 2))}
                  className={accentBtn}
                >
                  Copy schema
                </button>
              )}
              {parsed.ok && view === "query" && queryResult?.ok && (
                <button
                  onClick={() => copy(JSON.stringify(queryResult.r, null, 2))}
                  className={accentBtn}
                >
                  Copy result
                </button>
              )}
            </div>

            {!parsed.ok ? (
              <div className="p-6 font-mono text-xs text-muted">
                <div className="mb-2 inline-flex items-center gap-2 rounded border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-rose-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                  awaiting valid JSON
                </div>
                <div className="text-muted">
                  // fix the input on the left to render output.
                </div>
              </div>
            ) : view === "formatted" ? (
              <div
                className="grid"
                style={{
                  gridTemplateColumns: "auto 1fr",
                  fontFamily:
                    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                }}
              >
                <LineNumbers text={parsed.pretty} />
                <pre className="m-0 overflow-auto p-3 font-mono text-xs leading-[1.5] text-secondary">
                  {parsed.pretty}
                </pre>
              </div>
            ) : view === "tree" ? (
              <div className="max-h-[480px] overflow-auto p-3 font-mono text-[0.72rem]">
                <TreeNode v={parsed.value} />
              </div>
            ) : view === "query" ? (
              queryResult?.ok ? (
                <div>
                  <div className="border-b border-app bg-app px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                    {queryResult.r.length} match
                    {queryResult.r.length === 1 ? "" : "es"}
                  </div>
                  <pre className="m-0 max-h-[420px] overflow-auto p-3 font-mono text-xs leading-[1.5] text-secondary">
                    {JSON.stringify(queryResult.r, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="m-3 rounded border border-rose-400/25 bg-rose-500/10 p-3 font-mono text-xs text-rose-400">
                  {queryResult?.err}
                </div>
              )
            ) : view === "schema" && schema ? (
              <>
                <pre className="m-0 max-h-[460px] overflow-auto p-3 font-mono text-xs leading-[1.5] text-secondary">
                  {JSON.stringify(schema, null, 2)}
                </pre>
                <div className="border-t border-app bg-app px-3 py-2 font-mono text-[0.6rem] text-muted">
                  // draft-07 inferred from sample — required lists every key present; refine for optionals.
                </div>
              </>
            ) : view === "diff" ? (
              parsedB.ok ? (
                diffs && diffs.length === 0 ? (
                  <div className="m-3 rounded border border-emerald-400/25 bg-emerald-500/10 p-3 font-mono text-xs text-emerald-400">
                    {"// identical"}
                  </div>
                ) : (
                  <ul className="max-h-[460px] space-y-1.5 overflow-auto p-3 font-mono text-xs">
                    {diffs?.map((d, i) => (
                      <li
                        key={i}
                        className={`rounded border px-3 py-2 ${
                          d.kind === "added"
                            ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-400"
                            : d.kind === "removed"
                            ? "border-rose-400/25 bg-rose-500/10 text-rose-400"
                            : "border-amber-400/25 bg-amber-500/10 text-amber-400"
                        }`}
                      >
                        <span className="text-[0.55rem] uppercase tracking-[0.18em] opacity-70">
                          {d.kind}
                        </span>{" "}
                        <span className="text-secondary">{d.path}</span>
                        {d.kind === "changed" && (
                          <div className="mt-1 text-[0.65rem] text-muted">
                            A: {JSON.stringify(d.a)} → B: {JSON.stringify(d.b)}
                          </div>
                        )}
                        {d.kind === "added" && (
                          <div className="mt-1 text-[0.65rem] text-muted">
                            {JSON.stringify(d.b)}
                          </div>
                        )}
                        {d.kind === "removed" && (
                          <div className="mt-1 text-[0.65rem] text-muted">
                            {JSON.stringify(d.a)}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <div className="m-3 rounded border border-rose-400/25 bg-rose-500/10 p-3 font-mono text-xs text-rose-400">
                  JSON B invalid: {parsedB.error}
                </div>
              )
            ) : null}
          </div>
        </div>

        {/* Minified strip (only on Format view) */}
        {parsed.ok && view === "formatted" && (
          <div className="overflow-hidden rounded-xl border border-app bg-app-elevated backdrop-blur">
            <div className="flex items-center justify-between border-b border-app bg-app px-3 py-2">
              <div className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted">
                minified · {parsed.size.toLocaleString()} bytes
              </div>
              <button onClick={() => copy(parsed.minified)} className={accentBtn}>
                Copy minified
              </button>
            </div>
            <pre className="m-0 max-h-[140px] overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-xs leading-[1.5] text-secondary">
              {parsed.minified}
            </pre>
          </div>
        )}
      </div>
    </ToolShell>
  );
}
