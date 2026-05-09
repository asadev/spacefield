"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { SkillToolDef } from "../../_types";
import SampleInputCatalog from "./SampleInputCatalog";
import { readSchemaFields, type FieldType } from "./SchemaBuilder";
import { buttonClass, buttonGhostClass, inputClass } from "./_styles";

/**
 * Modal-style tester for a single SkillToolDef. Renders a form keyed off
 * the tool's input_schema (using SchemaBuilder's reader so the shape is
 * always in lockstep), plus a "raw JSON" textarea for power users.
 *
 * Run → POSTs to /api/admin/skills/[skillId]/test-tool with
 *   { tool_name, input }
 * and renders the response. Any failure or non-200 surfaces as a red
 * error block with the message.
 */

export type ToolTesterProps = {
  open: boolean;
  onClose: () => void;
  skillId: string;
  tool: SkillToolDef | null;
};

type InvokeResult = {
  ok: boolean;
  result?: unknown;
  error?: string | null;
  duration_ms?: number;
  http_status?: number | null;
  dispatched?: boolean;
  handler_kind?: string;
  handler_target?: string;
};

function emptyForType(type: FieldType): unknown {
  if (type === "string") return "";
  if (type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "array") return [];
  return {};
}

function buildInitialForm(
  tool: SkillToolDef | null
): Record<string, unknown> {
  if (!tool) return {};
  const fields = readSchemaFields(tool.input_schema as Record<string, unknown>);
  const obj: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.defaultValue !== undefined) {
      obj[f.name] = f.defaultValue;
    } else if (f.required) {
      obj[f.name] = emptyForType(f.type);
    }
  }
  return obj;
}

export default function ToolTester({
  open,
  onClose,
  skillId,
  tool,
}: ToolTesterProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [mode, setMode] = useState<"form" | "raw">("form");
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [rawText, setRawText] = useState("{}");
  const [rawError, setRawError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<InvokeResult | null>(null);
  const [transportError, setTransportError] = useState<string | null>(null);

  const fields = useMemo(
    () =>
      tool
        ? readSchemaFields(tool.input_schema as Record<string, unknown>)
        : [],
    [tool]
  );

  // Sync open/close to native <dialog>.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      try {
        dlg.showModal();
      } catch {
        /* fallback: jsdom etc. */
      }
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  // Reset state when the tool/open changes.
  useEffect(() => {
    if (!open) return;
    const initial = buildInitialForm(tool);
    setForm(initial);
    setRawText(JSON.stringify(initial, null, 2));
    setRawError(null);
    setResult(null);
    setTransportError(null);
    setMode("form");
  }, [open, tool]);

  const updateField = (name: string, value: unknown) => {
    setForm((cur) => ({ ...cur, [name]: value }));
  };

  const onPickSample = (payload: Record<string, unknown>) => {
    setForm(payload);
    setRawText(JSON.stringify(payload, null, 2));
    setRawError(null);
  };

  const collectInput = (): { ok: true; input: Record<string, unknown> } | { ok: false; reason: string } => {
    if (mode === "raw") {
      try {
        const parsed = JSON.parse(rawText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return { ok: false, reason: "Raw input must be a JSON object" };
        }
        return { ok: true, input: parsed as Record<string, unknown> };
      } catch (e) {
        return {
          ok: false,
          reason: `Invalid JSON: ${(e as Error).message.slice(0, 80)}`,
        };
      }
    }
    return { ok: true, input: form };
  };

  const switchMode = (next: "form" | "raw") => {
    if (next === mode) return;
    if (next === "raw") {
      setRawText(JSON.stringify(form, null, 2));
      setRawError(null);
    } else {
      // form mode — try to parse raw back into form.
      try {
        const parsed = JSON.parse(rawText);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setForm(parsed as Record<string, unknown>);
        }
        setRawError(null);
      } catch (e) {
        setRawError(
          `Cannot switch to form view — raw JSON is invalid (${(e as Error).message.slice(0, 60)}). Fix and retry, or stay in raw mode.`
        );
        return;
      }
    }
    setMode(next);
  };

  const handleRun = async () => {
    if (!tool) return;
    const collected = collectInput();
    if (!collected.ok) {
      setRawError(collected.reason);
      return;
    }
    setRunning(true);
    setResult(null);
    setTransportError(null);
    try {
      const res = await fetch(
        `/api/admin/skills/${encodeURIComponent(skillId)}/test-tool`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool_name: tool.name,
            input: collected.input,
          }),
        }
      );
      let body: InvokeResult | null = null;
      try {
        body = (await res.json()) as InvokeResult;
      } catch {
        body = null;
      }
      if (body) {
        setResult(body);
      } else {
        setTransportError(
          `Request returned ${res.status} but no JSON body could be parsed.`
        );
      }
    } catch (e) {
      setTransportError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const renderFieldInput = (f: ReturnType<typeof readSchemaFields>[number]) => {
    const current = form[f.name];
    if (f.type === "boolean") {
      return (
        <input
          type="checkbox"
          checked={current === true}
          onChange={(e) => updateField(f.name, e.target.checked)}
          className="h-4 w-4 accent-[var(--tool-accent,#7c3aed)]"
        />
      );
    }
    if (f.type === "number") {
      return (
        <input
          type="number"
          value={typeof current === "number" || typeof current === "string" ? String(current) : ""}
          onChange={(e) => {
            const v = e.target.value;
            const n = Number(v);
            updateField(f.name, v === "" ? "" : Number.isFinite(n) ? n : v);
          }}
          className={`${inputClass} font-mono text-xs`}
        />
      );
    }
    if (f.type === "string") {
      return (
        <input
          type="text"
          value={typeof current === "string" ? current : ""}
          onChange={(e) => updateField(f.name, e.target.value)}
          className={inputClass}
        />
      );
    }
    // array / object — JSON textarea
    const text =
      typeof current === "string"
        ? current
        : current === undefined
        ? ""
        : (() => {
            try {
              return JSON.stringify(current, null, 2);
            } catch {
              return "";
            }
          })();
    return (
      <textarea
        rows={4}
        spellCheck={false}
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          try {
            updateField(f.name, v === "" ? undefined : JSON.parse(v));
          } catch {
            // Store raw string while user is mid-edit; collectInput will
            // surface the parse error if they hit Run.
            updateField(f.name, v);
          }
        }}
        className={`${inputClass} font-mono text-[11px] leading-relaxed`}
      />
    );
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="w-[min(720px,95vw)] rounded-xl border border-app bg-app p-0 text-app shadow-xl backdrop:bg-black/40"
    >
      <div className="flex items-start justify-between gap-3 border-b border-app px-5 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-app">
            Test invoke{" "}
            {tool && (
              <code className="ml-1 rounded bg-app-elevated px-1.5 py-0.5 font-mono text-xs text-app">
                {tool.name}
              </code>
            )}
          </h3>
          {tool && (
            <p className="mt-0.5 text-xs text-muted">
              {tool.handler_kind === "rpc"
                ? `Postgres RPC → ${tool.handler_target}`
                : `HTTP POST → ${tool.handler_target}`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className={buttonGhostClass}
          aria-label="Close tester"
        >
          Close
        </button>
      </div>

      <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
        <SampleInputCatalog onPick={onPickSample} />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => switchMode("form")}
            className={
              mode === "form" ? buttonClass : buttonGhostClass
            }
          >
            Form
          </button>
          <button
            type="button"
            onClick={() => switchMode("raw")}
            className={mode === "raw" ? buttonClass : buttonGhostClass}
          >
            Raw JSON
          </button>
        </div>

        {mode === "form" ? (
          <div className="space-y-3 rounded-lg border border-app bg-app-elevated p-3">
            {fields.length === 0 ? (
              <p className="text-xs text-faint">
                This tool&apos;s input_schema declares no fields. The
                runner will POST <code className="font-mono">{`{}`}</code>{" "}
                — switch to <em>Raw JSON</em> if you need a custom payload.
              </p>
            ) : (
              fields.map((f) => (
                <div key={f.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex flex-col gap-0.5 text-xs">
                      <span className="font-mono text-xs text-app">
                        {f.name}
                        {f.required && (
                          <span className="ml-1 text-rose-500">*</span>
                        )}
                      </span>
                      {f.description && (
                        <span className="text-[11px] text-faint">
                          {f.description}
                        </span>
                      )}
                    </label>
                    <span className="rounded-full bg-app-elevated px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-secondary">
                      {f.type}
                    </span>
                  </div>
                  {renderFieldInput(f)}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-1.5 rounded-lg border border-app bg-app-elevated p-3">
            <textarea
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                setRawError(null);
              }}
              rows={10}
              spellCheck={false}
              className={`${inputClass} font-mono text-[11px] leading-relaxed`}
            />
            <p className="text-[11px] text-faint">
              Send any JSON object — useful when you want to test edge
              cases the form view can&apos;t express.
            </p>
          </div>
        )}

        {rawError && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-500">
            {rawError}
          </div>
        )}

        {transportError && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-500">
            Transport error: {transportError}
          </div>
        )}

        {result && (
          <div className="space-y-2 rounded-lg border border-app bg-app-elevated p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={
                  result.ok
                    ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-500"
                    : "rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-500"
                }
              >
                {result.ok ? "ok" : "error"}
              </span>
              {typeof result.duration_ms === "number" && (
                <span className="text-[11px] text-faint">
                  {result.duration_ms} ms
                </span>
              )}
              {typeof result.http_status === "number" && (
                <span className="text-[11px] text-faint">
                  HTTP {result.http_status}
                </span>
              )}
              {result.dispatched !== undefined && (
                <span className="text-[11px] text-faint">
                  dispatched: {String(result.dispatched)}
                </span>
              )}
            </div>
            {result.error && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-500">
                {result.error}
              </div>
            )}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted">
                Result
              </div>
              <pre className="mt-1 max-h-64 overflow-auto rounded bg-app p-2 font-mono text-[11px] text-app">
                {JSON.stringify(result.result ?? null, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-app px-5 py-3">
        <button type="button" onClick={onClose} className={buttonGhostClass}>
          Close
        </button>
        <button
          type="button"
          onClick={handleRun}
          disabled={running || !tool}
          className={buttonClass}
        >
          {running ? "Running…" : "Run"}
        </button>
      </div>
    </dialog>
  );
}
