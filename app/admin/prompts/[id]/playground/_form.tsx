"use client";

import { useState } from "react";

import { AGENT_MODELS, type AgentModelId } from "../../../_types";

/**
 * Prompt playground form. Renders a text input for each detected variable
 * (`{{var}}`), a "run model?" checkbox + model picker, and a submit
 * button. POSTs to /api/admin/playground/prompt-test and renders the
 * resolved prompt + (optional) model response below.
 */

interface TestResult {
  ok: boolean;
  resolved_prompt?: string;
  detected_variables?: string[];
  missing_vars?: string[];
  response?: string | null;
  model?: string | null;
  model_error?: string | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  duration_ms?: number | null;
  version?: number;
  error?: string;
}

export interface PromptPlaygroundFormProps {
  promptId: string;
  detectedVariables: string[];
  defaultModel: AgentModelId;
}

export default function PromptPlaygroundForm({
  promptId,
  detectedVariables,
  defaultModel,
}: PromptPlaygroundFormProps) {
  const [vars, setVars] = useState<Record<string, string>>({});
  const [runModel, setRunModel] = useState(false);
  const [model, setModel] = useState<AgentModelId>(defaultModel);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function submit() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/playground/prompt-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt_id: promptId,
          variables: vars,
          run_model: runModel,
          model,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as TestResult;
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
        <h2 className="text-sm font-semibold text-app">Render</h2>
        <p className="mt-0.5 text-xs text-muted">
          Calls{" "}
          <code className="font-mono">
            /api/admin/playground/prompt-test
          </code>
          . Variables auto-detected from{" "}
          <code className="font-mono">{`{{var}}`}</code> patterns in the
          current version body. Missing values stay as-is in the rendered
          output.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="grid gap-3 rounded-lg border border-app bg-app p-3"
      >
        {detectedVariables.length === 0 ? (
          <div className="rounded-md border border-dashed border-app bg-app/40 px-3 py-4 text-center text-[11px] text-faint">
            No variables detected in this prompt. Run anyway to see the
            rendered output (and optionally hit the model).
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {detectedVariables.map((v) => (
              <label key={v} className="flex flex-col gap-1 text-xs">
                <code className="font-mono text-[11px] text-app">
                  {`{{${v}}}`}
                </code>
                <input
                  type="text"
                  value={vars[v] ?? ""}
                  onChange={(e) =>
                    setVars((prev) => ({ ...prev, [v]: e.target.value }))
                  }
                  placeholder={`value for ${v}`}
                  className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent placeholder:text-faint"
                />
              </label>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-app pt-3">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={runModel}
              onChange={(e) => setRunModel(e.target.checked)}
              className="h-3.5 w-3.5 accent-tool-accent"
            />
            <span className="text-secondary">Also call the model</span>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <span className="text-[11px] uppercase tracking-wider text-muted">
              Model
            </span>
            <select
              value={model}
              disabled={!runModel}
              onChange={(e) => setModel(e.target.value as AgentModelId)}
              className="rounded-lg border border-app bg-app-elevated px-2 py-1.5 text-xs text-app outline-none transition-colors focus:border-tool-accent disabled:opacity-50"
            >
              {AGENT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <div className="ml-auto">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Rendering…" : "Render"}
            </button>
          </div>
        </div>
      </form>

      {result && <ResultPanel result={result} />}
    </section>
  );
}

function ResultPanel({ result }: { result: TestResult }) {
  return (
    <div className="space-y-3 rounded-lg border border-app bg-app p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="text-[11px] uppercase tracking-wider text-muted">
          Result {result.version ? `· v${result.version}` : ""}
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

      {Array.isArray(result.missing_vars) && result.missing_vars.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Missing values for: {result.missing_vars.join(", ")}. They will
          render as <code className="font-mono">{`{{name}}`}</code> in the
          output.
        </div>
      )}

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">
          Resolved prompt
        </div>
        <pre className="max-h-72 overflow-auto rounded-md border border-app bg-app-elevated p-3 font-mono text-[11px] leading-relaxed text-app whitespace-pre-wrap">
          {result.resolved_prompt ?? ""}
        </pre>
      </div>

      {result.model_error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
          model error: {result.model_error === "no_api_key"
            ? "ANTHROPIC_API_KEY is not configured on this server."
            : result.model_error}
        </div>
      )}

      {result.response !== null && result.response !== undefined && (
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <div className="text-[10px] uppercase tracking-wider text-muted">
              Model response
            </div>
            {result.model && (
              <code className="font-mono text-[10px] text-faint">
                {result.model}
              </code>
            )}
            {(result.tokens_in || result.tokens_out) && (
              <span className="text-[10px] text-faint">
                {result.tokens_in ?? 0} in · {result.tokens_out ?? 0} out
              </span>
            )}
          </div>
          <div className="whitespace-pre-wrap rounded-md border border-app bg-app-elevated p-3 text-sm text-app">
            {result.response || (
              <span className="italic text-faint">(empty response)</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
