"use client";

import { useState, useTransition } from "react";

/**
 * "Run now" client island for the workflow detail page. POSTs to
 * `/api/admin/workflows/[id]/run`, then renders the result inline:
 *
 *   - success → green chip + collapsible step_results JSON.
 *   - failure → red chip + the error message.
 *
 * Stays minimal. The recent-runs panel rendered by the server page is
 * the canonical history view — this is just for immediate feedback.
 */

interface StepResult {
  index: number;
  kind: string;
  ok: boolean;
  output?: unknown;
  error?: string;
  duration_ms: number;
  skill_id?: string;
  tool_name?: string;
  prompt_id?: string;
  condition?: string;
  output_var?: string;
  skipped?: boolean;
}

interface RunResult {
  ok: boolean;
  run_id: string;
  results: StepResult[];
  duration_ms: number;
  error?: string;
}

export default function RunButton({ workflowId }: { workflowId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RunResult | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  function trigger() {
    setResult(null);
    setShowDetail(false);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/workflows/${encodeURIComponent(workflowId)}/run`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
            cache: "no-store",
          }
        );
        const text = await res.text();
        let parsed: RunResult | null = null;
        try {
          parsed = JSON.parse(text) as RunResult;
        } catch {
          setResult({
            ok: false,
            run_id: "",
            results: [],
            duration_ms: 0,
            error: text.slice(0, 300) || `HTTP ${res.status}`,
          });
          return;
        }
        setResult(parsed);
      } catch (e) {
        setResult({
          ok: false,
          run_id: "",
          results: [],
          duration_ms: 0,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={trigger}
        disabled={pending}
        className="rounded-md border border-tool-accent bg-tool-accent/10 px-3 py-1.5 text-xs font-medium text-tool-accent transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {pending ? "Running…" : "Run now"}
      </button>

      {result && (
        <div
          className={`rounded-md border px-3 py-2 text-[11px] ${
            result.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
              : "border-rose-500/30 bg-rose-500/10 text-rose-500"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">
              {result.ok ? "Run completed" : "Run failed"}
            </span>
            <span className="text-faint">
              {result.duration_ms.toLocaleString()}ms
            </span>
          </div>
          {result.error && (
            <div className="mt-1 break-words font-mono text-[10px]">
              {result.error}
            </div>
          )}
          {result.run_id && (
            <div className="mt-1 font-mono text-[10px] text-muted">
              run {result.run_id.slice(0, 8)} · {result.results.length} step
              {result.results.length === 1 ? "" : "s"}
            </div>
          )}
          {result.results.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              className="mt-1 text-[10px] underline opacity-80 hover:opacity-100"
            >
              {showDetail ? "Hide step results" : "Show step results"}
            </button>
          )}
          {showDetail && result.results.length > 0 && (
            <pre className="mt-2 max-h-72 overflow-auto rounded border border-app bg-app p-2 font-mono text-[10px] text-secondary">
              {JSON.stringify(result.results, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
