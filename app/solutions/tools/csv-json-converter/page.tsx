"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard from "../../_components/ToolCard";

type Mode = "csv-to-json" | "json-to-csv";
type Delim = "," | ";" | "\t" | "|" | "custom";

type Result =
  | { ok: true; output: string; rows: number; cols: number }
  | { ok: false; error: string; line?: number };

// RFC 4180-ish CSV parser with support for quoted fields, escaped quotes,
// and embedded newlines. Returns rows or an error with the offending line.
function parseCsv(text: string, delim: string, quote: string = '"'): string[][] | { error: string; line: number } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === quote) {
        if (text[i + 1] === quote) {
          field += quote;
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
    } else {
      if (ch === quote) {
        if (field.length > 0) {
          return { error: "Unexpected quote in unquoted field", line };
        }
        inQuotes = true;
      } else if (ch === delim) {
        row.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        line++;
      } else {
        field += ch;
      }
    }
  }
  if (inQuotes) return { error: "Unterminated quoted field", line };
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Remove trailing empty row
  if (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
    rows.pop();
  }
  return rows;
}

function escapeCsv(value: unknown, delim: string, quote: string = '"'): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  const needsQuoting =
    s.includes(quote) || s.includes(delim) || s.includes("\n") || s.includes("\r");
  if (needsQuoting) return `${quote}${s.replaceAll(quote, quote + quote)}${quote}`;
  return s;
}

function coerceStr(v: string): string | number | boolean | null {
  if (v === "") return "";
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return v;
}

function csvToJson(text: string, delim: string, header: boolean, typeInfer: boolean, quote: string): Result {
  const parsed = parseCsv(text, delim, quote);
  if ("error" in parsed) return { ok: false, error: parsed.error, line: parsed.line };
  if (parsed.length === 0) return { ok: false, error: "No rows found" };
  const cols = parsed[0].length;
  const coerce = typeInfer ? coerceStr : ((v: string) => v);
  let output: string;
  let rowCount: number;
  if (header) {
    const keys = parsed[0];
    const data = parsed.slice(1).map((row) => {
      const obj: Record<string, unknown> = {};
      keys.forEach((k, i) => {
        obj[k] = coerce(row[i] ?? "");
      });
      return obj;
    });
    output = JSON.stringify(data, null, 2);
    rowCount = data.length;
  } else {
    const data = parsed.map((row) => row.map(coerce));
    output = JSON.stringify(data, null, 2);
    rowCount = data.length;
  }
  return { ok: true, output, rows: rowCount, cols };
}

function jsonToCsv(text: string, delim: string, quote: string = '"'): Result {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Top-level JSON must be an array." };
  }
  if (parsed.length === 0) {
    return { ok: false, error: "Array is empty." };
  }
  // Array of objects → header from union of keys
  if (typeof parsed[0] === "object" && parsed[0] !== null && !Array.isArray(parsed[0])) {
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const row of parsed) {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        for (const k of Object.keys(row)) {
          if (!seen.has(k)) {
            seen.add(k);
            keys.push(k);
          }
        }
      }
    }
    const lines: string[] = [keys.map((k) => escapeCsv(k, delim, quote)).join(delim)];
    for (const row of parsed) {
      const obj = row as Record<string, unknown>;
      lines.push(keys.map((k) => escapeCsv(obj?.[k], delim, quote)).join(delim));
    }
    return { ok: true, output: lines.join("\n"), rows: parsed.length, cols: keys.length };
  }
  // Array of arrays
  if (Array.isArray(parsed[0])) {
    const lines = parsed.map((row) =>
      (row as unknown[]).map((v) => escapeCsv(v, delim, quote)).join(delim)
    );
    return {
      ok: true,
      output: lines.join("\n"),
      rows: parsed.length,
      cols: (parsed[0] as unknown[]).length,
    };
  }
  // Array of primitives
  const lines = parsed.map((v) => escapeCsv(v, delim, quote));
  return { ok: true, output: lines.join("\n"), rows: parsed.length, cols: 1 };
}

const LS_KEY = "solutions:csv-json:v1";

export default function CsvJsonConverterPage() {
  const [mode, setMode] = useState<Mode>("csv-to-json");
  const [delim, setDelim] = useState<Delim>(",");
  const [customDelim, setCustomDelim] = useState(":");
  const [quote, setQuote] = useState<'"' | "'">('"');
  const [typeInfer, setTypeInfer] = useState(true);
  const [header, setHeader] = useState(true);
  const [input, setInput] = useState(
    "name,role,salary\nAlex Thompson,Engineer,145000\nJordan Lee,Designer,110000\nSam Patel,PM,130000"
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.mode) setMode(parsed.mode);
        if (parsed.delim) setDelim(parsed.delim);
        if (parsed.customDelim) setCustomDelim(parsed.customDelim);
        if (parsed.quote) setQuote(parsed.quote);
        if (typeof parsed.typeInfer === "boolean") setTypeInfer(parsed.typeInfer);
        if (typeof parsed.header === "boolean") setHeader(parsed.header);
        if (typeof parsed.input === "string") setInput(parsed.input);
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ mode, delim, customDelim, quote, typeInfer, header, input })
      );
    } catch {}
  }, [mode, delim, customDelim, quote, typeInfer, header, input, hydrated]);

  const effectiveDelim = delim === "custom" ? (customDelim[0] || ",") : delim;

  const result = useMemo<Result>(() => {
    if (!input.trim()) return { ok: false, error: "Paste some data to begin." };
    return mode === "csv-to-json"
      ? csvToJson(input, effectiveDelim, header, typeInfer, quote)
      : jsonToCsv(input, effectiveDelim, quote);
  }, [input, mode, effectiveDelim, header, typeInfer, quote]);

  const copy = () => {
    if (result.ok) navigator.clipboard?.writeText(result.output);
  };

  const swap = () => {
    if (result.ok) {
      setInput(result.output);
      setMode((m) => (m === "csv-to-json" ? "json-to-csv" : "csv-to-json"));
    }
  };

  const download = () => {
    if (!result.ok) return;
    const ext = mode === "csv-to-json" ? "json" : "csv";
    const mime = mode === "csv-to-json" ? "application/json" : "text/csv";
    const blob = new Blob([result.output], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `converted.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const delimLabel: Record<Delim, string> = {
    ",": "Comma",
    ";": "Semicolon",
    "\t": "Tab",
    "|": "Pipe",
    "custom": `Custom (${customDelim[0] || "?"})`,
  };

  const inputLang = mode === "csv-to-json" ? "csv" : "json";
  const outputLang = mode === "csv-to-json" ? "json" : "csv";
  const inputLineCount = input.split("\n").length;
  const outputLineCount = result.ok ? result.output.split("\n").length : 0;
  const inputLineNumbers = useMemo(
    () => Array.from({ length: inputLineCount }, (_, i) => i + 1).join("\n"),
    [inputLineCount]
  );
  const outputLineNumbers = useMemo(
    () => Array.from({ length: outputLineCount }, (_, i) => i + 1).join("\n"),
    [outputLineCount]
  );

  // status chip tone for hero
  const statusTone = result.ok
    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
    : "border-rose-500/40 bg-rose-500/15 text-rose-500";

  // preview rows for the small table preview (csv-to-json shows parsed rows)
  const previewRows = useMemo<{ keys: string[]; rows: string[][] } | null>(() => {
    if (!result.ok) return null;
    if (mode === "csv-to-json") {
      const parsed = parseCsv(input, effectiveDelim, quote);
      if ("error" in parsed) return null;
      if (parsed.length === 0) return null;
      const keys = header ? parsed[0] : parsed[0].map((_, i) => `col_${i + 1}`);
      const dataRows = (header ? parsed.slice(1) : parsed).slice(0, 5);
      return { keys, rows: dataRows };
    }
    // json-to-csv: split the produced csv into preview cells
    try {
      const parsed = JSON.parse(input);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      const first = parsed[0];
      if (typeof first === "object" && first !== null && !Array.isArray(first)) {
        const keys: string[] = [];
        const seen = new Set<string>();
        for (const row of parsed) {
          if (row && typeof row === "object" && !Array.isArray(row)) {
            for (const k of Object.keys(row)) {
              if (!seen.has(k)) {
                seen.add(k);
                keys.push(k);
              }
            }
          }
        }
        const dataRows = parsed.slice(0, 5).map((row) => {
          const obj = row as Record<string, unknown>;
          return keys.map((k) => {
            const v = obj?.[k];
            if (v === null || v === undefined) return "";
            return typeof v === "object" ? JSON.stringify(v) : String(v);
          });
        });
        return { keys, rows: dataRows };
      }
      if (Array.isArray(first)) {
        const keys = (first as unknown[]).map((_, i) => `col_${i + 1}`);
        const dataRows = parsed.slice(0, 5).map((row) =>
          (row as unknown[]).map((v) => (v == null ? "" : String(v)))
        );
        return { keys, rows: dataRows };
      }
      return { keys: ["value"], rows: parsed.slice(0, 5).map((v) => [String(v)]) };
    } catch {
      return null;
    }
  }, [result, mode, input, effectiveDelim, header, quote]);

  return (
    <div data-tool-theme="data" data-tool="csv-json-converter">
      <ToolShell
        category="Data & Developer"
        title="CSV ↔ JSON Converter"
        description="Paste CSV or JSON and convert to the other. Handles escaping, quoted fields, embedded newlines, and common delimiters."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — status + format chips */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${statusTone}`}
            >
              {result.ok ? "valid" : "invalid"}
            </span>
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              {inputLang} → {outputLang}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              tabular.transcoder
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {inputLang}.to.{outputLang}
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              {hydrated ? "◉ autosaved" : ""}
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Tabular Transcoder · CSV ↔ JSON
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {result.ok ? `${result.rows} rows` : "0 rows"}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {result.ok ? `${result.cols} cols` : "—"}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    client-only
                  </span>
                </div>

                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                  CSV ↔ JSON Converter
                </h2>
              </div>
            </div>
          </div>

          {/* sub-tab strip — direction toggle + actions */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "csv-to-json", label: "CSV → JSON" },
                  { k: "json-to-csv", label: "JSON → CSV" },
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

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={swap}
                disabled={!result.ok}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                ⇄ Swap
              </button>
              <button
                onClick={copy}
                disabled={!result.ok}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                Copy
              </button>
              <button
                onClick={download}
                disabled={!result.ok}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ color: "var(--bg)" }}
              >
                Download .{outputLang}
              </button>
            </div>
          </div>
        </section>

        {/* ============================== OPTIONS ============================== */}
        <ToolCard
          title="Parser options"
          subtitle="Delimiter, quote, header, and type inference"
          className="mb-6"
        >
          <div className="flex flex-wrap items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-secondary">
            <label className="flex items-center gap-1.5">
              <span className="text-muted">delim</span>
              <select
                value={delim}
                onChange={(e) => setDelim(e.target.value as Delim)}
                className="rounded-lg border border-app bg-app-elevated px-2 py-1 text-[0.65rem] text-app outline-none transition-colors hover:border-tool-accent focus:border-tool-accent"
              >
                <option value=",">,</option>
                <option value=";">;</option>
                <option value={"\t"}>\t</option>
                <option value="|">|</option>
                <option value="custom">…</option>
              </select>
            </label>
            {delim === "custom" && (
              <input
                value={customDelim}
                onChange={(e) => setCustomDelim(e.target.value)}
                maxLength={1}
                className="w-10 rounded-lg border border-app bg-app-elevated px-2 py-1 text-center font-mono text-[0.65rem] text-app outline-none transition-colors hover:border-tool-accent focus:border-tool-accent"
              />
            )}
            <label className="flex items-center gap-1.5">
              <span className="text-muted">quote</span>
              <select
                value={quote}
                onChange={(e) => setQuote(e.target.value as '"' | "'")}
                className="rounded-lg border border-app bg-app-elevated px-2 py-1 text-[0.65rem] text-app outline-none transition-colors hover:border-tool-accent focus:border-tool-accent"
              >
                <option value='"'>&quot;</option>
                <option value="'">&apos;</option>
              </select>
            </label>
            {mode === "csv-to-json" && (
              <>
                <label className="flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-2.5 py-1">
                  <input
                    type="checkbox"
                    checked={header}
                    onChange={(e) => setHeader(e.target.checked)}
                    className="accent-[var(--tool-accent)]"
                  />
                  <span>header</span>
                </label>
                <label className="flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-2.5 py-1">
                  <input
                    type="checkbox"
                    checked={typeInfer}
                    onChange={(e) => setTypeInfer(e.target.checked)}
                    className="accent-[var(--tool-accent)]"
                  />
                  <span>infer types</span>
                </label>
              </>
            )}
            <span className="ml-auto rounded-md border border-app bg-app px-2 py-1 text-muted">
              delim · {delimLabel[delim]}
            </span>
            <span className="rounded-md border border-app bg-app px-2 py-1 text-muted">
              quote · {quote === '"' ? "double" : "single"}
            </span>
          </div>
        </ToolCard>

        {/* ============================== EDITOR PANES ============================== */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Input pane */}
          <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
            <div className="flex items-center justify-between border-b border-app bg-app px-3 py-2">
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                ▸ input.{inputLang}
              </span>
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                {input.length.toLocaleString()} chars · {inputLineCount} ln
              </span>
            </div>
            <div className="relative flex bg-app-elevated">
              <pre
                aria-hidden="true"
                className="select-none border-r border-app bg-app px-3 py-3 text-right font-mono text-xs leading-5 text-faint"
              >
                {inputLineNumbers}
              </pre>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
                className="min-h-[380px] w-full resize-y bg-transparent px-3 py-3 font-mono text-xs leading-5 text-app outline-none placeholder:text-faint"
                placeholder={mode === "csv-to-json" ? "paste csv..." : "paste json..."}
              />
            </div>
          </div>

          {/* Output pane */}
          <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
            <div className="flex items-center justify-between border-b border-app bg-app px-3 py-2">
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                ▸ output.{outputLang}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                  {result.ok
                    ? `${result.output.length.toLocaleString()} chars · ${outputLineCount} ln`
                    : "error"}
                </span>
                {result.ok && (
                  <button
                    onClick={copy}
                    className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent transition-colors hover:bg-tool-accent"
                    style={result.ok ? { color: undefined } : undefined}
                  >
                    copy
                  </button>
                )}
              </div>
            </div>
            {result.ok ? (
              <div className="relative flex bg-app-elevated">
                <pre
                  aria-hidden="true"
                  className="select-none border-r border-app bg-app px-3 py-3 text-right font-mono text-xs leading-5 text-faint"
                >
                  {outputLineNumbers}
                </pre>
                <pre className="min-h-[380px] w-full overflow-auto whitespace-pre px-3 py-3 font-mono text-xs leading-5 text-app">
                  {result.output}
                </pre>
              </div>
            ) : (
              <div className="flex min-h-[380px] flex-col items-start justify-start gap-2 bg-app-elevated p-4">
                <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 font-mono text-[0.7rem] text-rose-500">
                  {result.error}
                </div>
                {result.line !== undefined && (
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-rose-500/80">
                    at line {result.line}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ============================== TABLE PREVIEW ============================== */}
        {previewRows && previewRows.rows.length > 0 && (
          <ToolCard
            title="Row preview"
            subtitle={`First ${previewRows.rows.length} of ${result.ok ? result.rows : 0} rows`}
            className="mt-6"
          >
            <div className="overflow-x-auto rounded-lg border border-app bg-app-elevated">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-app bg-app">
                  <tr>
                    {previewRows.keys.map((k, i) => (
                      <th
                        key={i}
                        className="px-3 py-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent"
                      >
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.rows.map((row, ri) => (
                    <tr
                      key={ri}
                      className="border-b border-app last:border-0"
                    >
                      {previewRows.keys.map((_, ci) => (
                        <td
                          key={ci}
                          className="px-3 py-2 font-mono text-app"
                        >
                          {row[ci] ?? <span className="text-faint">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ToolCard>
        )}
      </ToolShell>
    </div>
  );
}
