"use client";

import { useState } from "react";

import type { SkillToolDef } from "../../_types";
import SchemaBuilder from "./SchemaBuilder";
import ToolTester from "./ToolTester";
import { buttonClass, buttonGhostClass, inputClass } from "./_styles";

/**
 * Inline tool editor for a custom skill's `tools_json`. The parent owns
 * the list — we hand back updates via onChange. Empty add-form shows at
 * the bottom of the list; opens collapsed and expands on the +Add tool
 * button.
 *
 * Edit-mode features:
 *   - Drag-reorder rows (HTML5 native drag & drop, no libs).
 *   - Visual SchemaBuilder for input_schema, with a "raw JSON" toggle.
 *   - Per-tool "Test invoke" button → ToolTester modal.
 *
 * For code-defined skills the editor renders read-only (no edit/delete
 * controls; input_schema and handler shown for context). The
 * `ToolEditorProps` contract (tools / onChange / readOnly) is preserved
 * exactly — the parent doesn't need a code change to pick this up.
 */

const TOOL_NAME_RE = /^[a-z][a-z0-9_]*$/;

const EMPTY_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

const EMPTY_TOOL: SkillToolDef = {
  name: "",
  description: "",
  input_schema: EMPTY_INPUT_SCHEMA,
  read_only: false,
  handler_kind: "rpc",
  handler_target: "",
};

export type ToolEditorProps = {
  tools: SkillToolDef[];
  onChange: (next: SkillToolDef[]) => void;
  readOnly?: boolean;
  /** Skill id for the "Test invoke" route. When omitted, the test
   *  button is hidden (e.g. on the create-new page where no id exists). */
  skillId?: string;
};

export default function ToolEditor({
  tools,
  onChange,
  readOnly,
  skillId,
}: ToolEditorProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropOverIdx, setDropOverIdx] = useState<number | null>(null);
  const [testerToolIdx, setTesterToolIdx] = useState<number | null>(null);

  if (readOnly) {
    if (tools.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-faint">
          No tools defined in source. (Editor reads tool list from the TS
          module at runtime, not the DB row.)
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {tools.map((t, i) => (
          <div
            key={`${t.name}-${i}`}
            className="rounded-lg border border-app bg-app p-3"
          >
            <ToolReadOnly tool={t} />
          </div>
        ))}
      </div>
    );
  }

  const handleSave = (next: SkillToolDef, idx: number | null) => {
    if (idx === null) {
      onChange([...tools, next]);
      setAdding(false);
    } else {
      onChange(tools.map((t, i) => (i === idx ? next : t)));
      setEditingIdx(null);
    }
  };

  const handleRemove = (idx: number) => {
    onChange(tools.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  };

  const handleDrop = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    if (from >= tools.length || to >= tools.length) return;
    const next = tools.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
    setEditingIdx((cur) => {
      if (cur === null) return cur;
      if (cur === from) return to;
      if (from < cur && to >= cur) return cur - 1;
      if (from > cur && to <= cur) return cur + 1;
      return cur;
    });
  };

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= tools.length) return;
    handleDrop(idx, target);
  };

  return (
    <div className="space-y-2">
      {tools.length === 0 ? (
        <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-faint">
          No tools yet. Click <span className="text-app">+ Add tool</span>{" "}
          to create the first one.
        </div>
      ) : (
        tools.map((t, i) => (
          <div
            key={i}
            draggable={editingIdx !== i}
            onDragStart={(e) => {
              if (editingIdx === i) return;
              setDragIdx(i);
              try {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(i));
              } catch {
                /* some browsers throw on programmatic dataTransfer */
              }
            }}
            onDragOver={(e) => {
              if (dragIdx === null) return;
              e.preventDefault();
              try {
                e.dataTransfer.dropEffect = "move";
              } catch {
                /* noop */
              }
              if (dropOverIdx !== i) setDropOverIdx(i);
            }}
            onDragLeave={() => {
              if (dropOverIdx === i) setDropOverIdx(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIdx === null) return;
              handleDrop(dragIdx, i);
              setDragIdx(null);
              setDropOverIdx(null);
            }}
            onDragEnd={() => {
              setDragIdx(null);
              setDropOverIdx(null);
            }}
            className={[
              "rounded-lg border bg-app transition-colors",
              dropOverIdx === i && dragIdx !== null && dragIdx !== i
                ? "border-tool-accent"
                : "border-app",
              dragIdx === i ? "opacity-50" : "",
            ].join(" ")}
          >
            {editingIdx === i ? (
              <ToolEditRow
                initial={t}
                onCancel={() => setEditingIdx(null)}
                onSave={(next) => handleSave(next, i)}
              />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3 p-3">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <span
                    className="select-none pt-0.5 text-base leading-none text-faint"
                    title="Drag to reorder"
                    aria-hidden
                  >
                    ⋮⋮
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-app-elevated px-1.5 py-0.5 font-mono text-xs text-app">
                        {t.name || "(unnamed)"}
                      </code>
                      {t.read_only && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-500">
                          read-only
                        </span>
                      )}
                      {t.requires_confirmation && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                          confirms
                        </span>
                      )}
                      <span className="rounded-full bg-app-elevated px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-secondary">
                        {t.handler_kind}
                      </span>
                    </div>
                    {t.description && (
                      <p className="mt-1 text-xs text-secondary">
                        {t.description}
                      </p>
                    )}
                    {t.handler_target && (
                      <p className="mt-1 truncate font-mono text-[11px] text-muted">
                        → {t.handler_target}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      title="Move up"
                      aria-label="Move tool up"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-app bg-app-elevated text-xs text-app transition-colors hover:border-tool-accent disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === tools.length - 1}
                      title="Move down"
                      aria-label="Move tool down"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-app bg-app-elevated text-xs text-app transition-colors hover:border-tool-accent disabled:opacity-40"
                    >
                      ↓
                    </button>
                  </div>
                  {skillId && (
                    <button
                      type="button"
                      onClick={() => setTesterToolIdx(i)}
                      disabled={!t.name || !t.handler_target}
                      title={
                        !t.name
                          ? "Save the tool first (name required)"
                          : !t.handler_target
                          ? "Save the tool first (handler_target required)"
                          : "Open tester"
                      }
                      className={buttonGhostClass}
                    >
                      Test invoke
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingIdx(i);
                      setAdding(false);
                    }}
                    className={buttonGhostClass}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(i)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-opacity hover:opacity-80"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}

      {adding ? (
        <div className="rounded-lg border border-tool-accent bg-app">
          <ToolEditRow
            initial={EMPTY_TOOL}
            onCancel={() => setAdding(false)}
            onSave={(next) => handleSave(next, null)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setEditingIdx(null);
          }}
          className={buttonGhostClass}
        >
          + Add tool
        </button>
      )}

      {skillId && testerToolIdx !== null && tools[testerToolIdx] && (
        <ToolTester
          open
          onClose={() => setTesterToolIdx(null)}
          skillId={skillId}
          tool={tools[testerToolIdx]}
        />
      )}
    </div>
  );
}

/* ────────────────── individual tool row editors ────────────────── */

function ToolReadOnly({ tool }: { tool: SkillToolDef }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-app-elevated px-1.5 py-0.5 font-mono text-xs text-app">
          {tool.name}
        </code>
        {tool.read_only && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-500">
            read-only
          </span>
        )}
      </div>
      {tool.description && (
        <p className="text-xs text-secondary">{tool.description}</p>
      )}
    </div>
  );
}

function ToolEditRow({
  initial,
  onCancel,
  onSave,
}: {
  initial: SkillToolDef;
  onCancel: () => void;
  onSave: (next: SkillToolDef) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [readOnly, setReadOnly] = useState<boolean>(initial.read_only);
  const [requiresConfirmation, setRequiresConfirmation] = useState<boolean>(
    initial.requires_confirmation ?? false
  );
  const [handlerKind, setHandlerKind] = useState<"rpc" | "http">(
    initial.handler_kind
  );
  const [handlerTarget, setHandlerTarget] = useState(initial.handler_target);

  // Schema editor — visual by default, raw-JSON for power users. Keep
  // both sides in lockstep so toggling never silently drops fields.
  const initialSchema =
    (initial.input_schema as Record<string, unknown>) ?? EMPTY_INPUT_SCHEMA;
  const [schema, setSchema] = useState<Record<string, unknown>>(initialSchema);
  const [schemaMode, setSchemaMode] = useState<"visual" | "raw">("visual");
  const [rawText, setRawText] = useState(() =>
    JSON.stringify(initialSchema, null, 2)
  );
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const [nameError, setNameError] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);

  const switchSchemaMode = (next: "visual" | "raw") => {
    if (next === schemaMode) return;
    if (next === "raw") {
      setRawText(JSON.stringify(schema, null, 2));
      setSchemaError(null);
      setSchemaMode("raw");
      return;
    }
    // raw → visual: parse rawText into schema state.
    try {
      const parsed = JSON.parse(rawText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setSchemaError("input_schema must be a JSON object");
        return;
      }
      setSchema(parsed as Record<string, unknown>);
      setSchemaError(null);
      setSchemaMode("visual");
    } catch (e) {
      setSchemaError(
        `Invalid JSON: ${(e as Error).message.slice(0, 80)}. Fix raw JSON before switching.`
      );
    }
  };

  const handleSchemaVisualChange = (next: Record<string, unknown>) => {
    setSchema(next);
    setSchemaError(null);
    // Keep rawText in sync for fast toggling.
    setRawText(JSON.stringify(next, null, 2));
  };

  const handleRawBlur = () => {
    try {
      const parsed = JSON.parse(rawText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setSchemaError("input_schema must be a JSON object");
        return;
      }
      setSchema(parsed as Record<string, unknown>);
      setSchemaError(null);
    } catch (e) {
      setSchemaError(`Invalid JSON: ${(e as Error).message.slice(0, 80)}`);
    }
  };

  const handleSubmit = () => {
    let ok = true;
    const trimmedName = name.trim();
    if (!TOOL_NAME_RE.test(trimmedName)) {
      setNameError(
        "name must be snake_case: lowercase letters/digits/underscore, start with a letter"
      );
      ok = false;
    } else {
      setNameError(null);
    }

    const trimmedTarget = handlerTarget.trim();
    if (!trimmedTarget) {
      setTargetError("handler_target is required");
      ok = false;
    } else if (handlerKind === "http") {
      if (!/^https?:\/\//i.test(trimmedTarget)) {
        setTargetError("HTTP handler must be an http(s) URL");
        ok = false;
      } else {
        setTargetError(null);
      }
    } else {
      // RPC name — Postgres function name shape is loose; just non-empty.
      setTargetError(null);
    }

    // If user is in raw mode and hasn't blurred, reparse here.
    let finalSchema = schema;
    if (schemaMode === "raw") {
      try {
        const parsed = JSON.parse(rawText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setSchemaError("input_schema must be a JSON object");
          ok = false;
        } else {
          finalSchema = parsed as Record<string, unknown>;
          setSchemaError(null);
        }
      } catch (e) {
        setSchemaError(`Invalid JSON: ${(e as Error).message.slice(0, 80)}`);
        ok = false;
      }
    }

    if (!ok) return;

    onSave({
      name: trimmedName,
      description: description.trim(),
      input_schema: finalSchema,
      read_only: readOnly,
      handler_kind: handlerKind,
      handler_target: trimmedTarget,
      requires_confirmation: requiresConfirmation || undefined,
    });
  };

  return (
    <div className="space-y-3 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            placeholder="snake_case_name"
            className={`${inputClass} font-mono text-xs`}
          />
          {nameError && (
            <span className="text-[11px] text-rose-500">{nameError}</span>
          )}
        </Field>
        <Field label="Handler kind">
          <select
            value={handlerKind}
            onChange={(e) =>
              setHandlerKind(e.target.value as "rpc" | "http")
            }
            className={inputClass}
          >
            <option value="rpc">Postgres RPC</option>
            <option value="http">HTTP URL</option>
          </select>
        </Field>
      </div>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Plain-English description for the LLM."
          className={inputClass}
        />
      </Field>

      <Field
        label={
          handlerKind === "rpc"
            ? "Handler target — RPC name"
            : "Handler target — HTTPS URL"
        }
        required
      >
        <input
          value={handlerTarget}
          onChange={(e) => setHandlerTarget(e.target.value)}
          placeholder={
            handlerKind === "rpc"
              ? "my_rpc_function"
              : "https://hooks.example.com/skill"
          }
          className={`${inputClass} font-mono text-xs`}
        />
        {targetError && (
          <span className="text-[11px] text-rose-500">{targetError}</span>
        )}
        <Hint>
          {handlerKind === "rpc"
            ? "Postgres function name (must accept a JSONB arg). Runtime invokes it with the validated tool input."
            : "Runtime POSTs the validated input to this URL with an HMAC signature header."}
        </Hint>
      </Field>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted">
            Input schema
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => switchSchemaMode("visual")}
              className={
                schemaMode === "visual"
                  ? "inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-2.5 py-1 text-[11px] font-medium text-white"
                  : "inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-2.5 py-1 text-[11px] font-medium text-app transition-colors hover:border-tool-accent"
              }
            >
              Visual
            </button>
            <button
              type="button"
              onClick={() => switchSchemaMode("raw")}
              className={
                schemaMode === "raw"
                  ? "inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-2.5 py-1 text-[11px] font-medium text-white"
                  : "inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-2.5 py-1 text-[11px] font-medium text-app transition-colors hover:border-tool-accent"
              }
            >
              Raw JSON
            </button>
          </div>
        </div>

        {schemaMode === "visual" ? (
          <SchemaBuilder
            value={schema}
            onChange={handleSchemaVisualChange}
            idPrefix={`field-${initial.name || "new"}`}
          />
        ) : (
          <textarea
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              setSchemaError(null);
            }}
            onBlur={handleRawBlur}
            rows={10}
            spellCheck={false}
            className={`${inputClass} font-mono text-[11px] leading-relaxed`}
          />
        )}

        {schemaError ? (
          <span className="text-[11px] text-rose-500">{schemaError}</span>
        ) : (
          <Hint>
            {schemaMode === "visual"
              ? "Visual builder writes a JSON-Schema object the runtime understands. Toggle to Raw JSON for power users."
              : "Valid JSON Schema object. Use type: \"object\" with properties + required. Toggle to Visual for guided editing."}
          </Hint>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-app">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(e) => setReadOnly(e.target.checked)}
            className="accent-[var(--tool-accent,#7c3aed)]"
          />
          Read-only (free-tier safe)
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={requiresConfirmation}
            onChange={(e) => setRequiresConfirmation(e.target.checked)}
            className="accent-[var(--tool-accent,#7c3aed)]"
          />
          Require user confirmation before run
        </label>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-app pt-3">
        <button
          type="button"
          onClick={onCancel}
          className={buttonGhostClass}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className={buttonClass}
        >
          Save tool
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-[11px] uppercase tracking-wider text-muted">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] text-faint">{children}</span>;
}
