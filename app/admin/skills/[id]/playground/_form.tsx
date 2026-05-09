"use client";

import { useMemo, useState } from "react";

import type { SkillToolDef } from "../../../_types";

/**
 * Skill invocation form. The admin picks a tool from the skill's
 * `tools_json` (or types into a generic JSON textarea if no schema is
 * available), fills inputs derived from the tool's input_schema, and
 * POSTs to /api/admin/playground/skill-invoke. Result panel renders below.
 */

type JsonSchemaProperty = {
  type?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
};

type SimpleSchema = {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
};

interface InvokeResult {
  ok: boolean;
  error?: string | null;
  dispatched?: boolean;
  skill_kind?: string;
  tool?: {
    name: string;
    description: string;
    handler_kind: string;
    handler_target: string;
    read_only: boolean;
    requires_confirmation: boolean;
  } | null;
  dispatch?: unknown;
  result?: unknown;
  duration_ms?: number;
}

export interface SkillPlaygroundFormProps {
  skillId: string;
  skillKind: "code" | "custom";
  tools: SkillToolDef[];
  /** Code-skill tool names (no schemas locally — use generic JSON box). */
  codeToolNames: string[];
}

export default function SkillPlaygroundForm({
  skillId,
  skillKind,
  tools,
  codeToolNames,
}: SkillPlaygroundFormProps) {
  const toolNames =
    skillKind === "code"
      ? codeToolNames
      : tools.map((t) => t.name);

  const [selectedTool, setSelectedTool] = useState<string>(
    toolNames[0] ?? ""
  );
  const [jsonInput, setJsonInput] = useState<string>("{}");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InvokeResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const selectedToolDef = useMemo(
    () =>
      skillKind === "custom"
        ? tools.find((t) => t.name === selectedTool) ?? null
        : null,
    [tools, selectedTool, skillKind]
  );

  const schema = (selectedToolDef?.input_schema ?? null) as SimpleSchema | null;
  const properties = schema?.properties ?? {};
  const required = new Set<string>(schema?.required ?? []);
  const propEntries = Object.entries(properties);

  // Per-field input state — only used for custom skills with a schema.
  const [fields, setFields] = useState<Record<string, string>>({});

  function fieldsToInput(): unknown {
    const out: Record<string, unknown> = {};
    for (const [k, p] of propEntries) {
      const raw = fields[k];
      if (raw === undefined || raw === "") {
        if (p.default !== undefined) out[k] = p.default;
        continue;
      }
      if (p.type === "number" || p.type === "integer") {
        const n = Number(raw);
        if (Number.isFinite(n)) out[k] = n;
      } else if (p.type === "boolean") {
        out[k] = raw === "true";
      } else if (p.type === "array" || p.type === "object") {
        try {
          out[k] = JSON.parse(raw);
        } catch {
          out[k] = raw;
        }
      } else {
        out[k] = raw;
      }
    }
    return out;
  }

  async function submit() {
    setParseError(null);
    setBusy(true);
    setResult(null);
    let input: unknown;
    if (propEntries.length > 0) {
      input = fieldsToInput();
    } else {
      try {
        input = JSON.parse(jsonInput || "{}");
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "invalid JSON");
        setBusy(false);
        return;
      }
    }
    try {
      const res = await fetch("/api/admin/playground/skill-invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill_id: skillId,
          tool_name: selectedTool || null,
          input,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as InvokeResult;
      setResult(data);
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : "request failed",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
      <header>
        <h2 className="text-sm font-semibold text-app">Invoke</h2>
        <p className="mt-0.5 text-xs text-muted">
          Calls{" "}
          <code className="font-mono">
            /api/admin/playground/skill-invoke
          </code>
          . For custom skills with{" "}
          <code className="font-mono">handler_kind=rpc</code> the named
          Postgres RPC is invoked with the input. Code skills and HTTP
          handlers return a description of the dispatch path instead — the
          playground keeps live writes off this surface.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="grid gap-3 rounded-lg border border-app bg-app p-3"
      >
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[11px] uppercase tracking-wider text-muted">
            Tool
          </span>
          {toolNames.length === 0 ? (
            <input
              type="text"
              value={selectedTool}
              onChange={(e) => setSelectedTool(e.target.value)}
              placeholder="snake_case_tool_name"
              className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 font-mono text-sm text-app outline-none transition-colors focus:border-tool-accent"
            />
          ) : (
            <select
              value={selectedTool}
              onChange={(e) => {
                setSelectedTool(e.target.value);
                setFields({});
              }}
              className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent"
            >
              {toolNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
        </label>

        {selectedToolDef && (
          <div className="rounded-md border border-app bg-app-elevated p-3 text-[11px] text-muted">
            <div>
              <span className="text-secondary">{selectedToolDef.description || "—"}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <code className="font-mono text-app">
                {selectedToolDef.handler_kind}={selectedToolDef.handler_target}
              </code>
              {selectedToolDef.read_only && (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-500">
                  read-only
                </span>
              )}
              {(selectedToolDef.requires_confirmation ?? false) && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  confirms
                </span>
              )}
            </div>
          </div>
        )}

        {propEntries.length > 0 ? (
          <div className="grid gap-3">
            {propEntries.map(([name, prop]) => (
              <FieldInput
                key={name}
                name={name}
                prop={prop}
                required={required.has(name)}
                value={fields[name] ?? ""}
                onChange={(v) =>
                  setFields((prev) => ({ ...prev, [name]: v }))
                }
              />
            ))}
          </div>
        ) : (
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[11px] uppercase tracking-wider text-muted">
              Input (JSON object)
            </span>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              rows={6}
              spellCheck={false}
              placeholder='{ "limit": 5 }'
              className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 font-mono text-[11px] leading-relaxed text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint"
            />
            <span className="text-[11px] text-faint">
              Code skills don&apos;t expose a schema here. Paste a JSON
              object the runtime would accept.
            </span>
          </label>
        )}

        {parseError && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
            JSON parse error: {parseError}
          </div>
        )}

        <div className="flex items-center justify-end pt-1">
          <button
            type="submit"
            disabled={busy || (toolNames.length === 0 && !selectedTool)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Running…" : "Invoke"}
          </button>
        </div>
      </form>

      {result && <ResultPanel result={result} />}
    </section>
  );
}

function FieldInput({
  name,
  prop,
  required,
  value,
  onChange,
}: {
  name: string;
  prop: JsonSchemaProperty;
  required: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  const type = prop.type ?? "string";
  const enumVals = Array.isArray(prop.enum)
    ? (prop.enum as unknown[]).map((v) => String(v))
    : null;

  return (
    <label className="flex flex-col gap-1 text-xs">
      <div className="flex items-center gap-2">
        <code className="font-mono text-[11px] text-app">{name}</code>
        <code className="font-mono text-[10px] text-faint">{type}</code>
        {required && (
          <span className="rounded-full bg-tool-accent-soft px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-tool-accent">
            required
          </span>
        )}
      </div>
      {prop.description && (
        <span className="text-[11px] text-muted">{prop.description}</span>
      )}
      {enumVals ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent"
        >
          <option value="">—</option>
          {enumVals.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : type === "boolean" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent"
        >
          <option value="">—</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : type === "array" || type === "object" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          spellCheck={false}
          placeholder={type === "array" ? "[]" : "{}"}
          className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 font-mono text-[11px] text-app outline-none transition-colors focus:border-tool-accent placeholder:text-faint"
        />
      ) : (
        <input
          type={type === "number" || type === "integer" ? "number" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent placeholder:text-faint"
        />
      )}
    </label>
  );
}

function ResultPanel({ result }: { result: InvokeResult }) {
  return (
    <div className="space-y-2 rounded-lg border border-app bg-app p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="text-[11px] uppercase tracking-wider text-muted">
          Result
        </div>
        <div className="flex items-center gap-2 text-[11px] text-faint">
          {typeof result.duration_ms === "number" && (
            <span>{(result.duration_ms / 1000).toFixed(2)}s</span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
              result.ok
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-rose-500/15 text-rose-500"
            }`}
          >
            {result.ok ? "ok" : "error"}
          </span>
        </div>
      </div>
      {result.error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
          {result.error}
        </div>
      )}
      <dl className="space-y-1.5 text-xs">
        <Detail label="dispatched">
          <code className="font-mono text-app">
            {String(result.dispatched ?? false)}
          </code>
        </Detail>
        <Detail label="dispatch">
          <pre className="max-h-48 overflow-auto rounded bg-app-elevated p-2 font-mono text-[11px] text-app">
            {JSON.stringify(result.dispatch ?? null, null, 2)}
          </pre>
        </Detail>
        <Detail label="result">
          <pre className="max-h-72 overflow-auto rounded bg-app-elevated p-2 font-mono text-[11px] text-app">
            {JSON.stringify(result.result ?? null, null, 2)}
          </pre>
        </Detail>
      </dl>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-24 shrink-0 text-[10px] uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}
