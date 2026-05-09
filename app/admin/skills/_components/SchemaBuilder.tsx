"use client";

import { useMemo } from "react";

import { inputClass } from "./_styles";

/**
 * Visual builder for a JSON-Schema `object` describing a tool's input.
 *
 * Each field card holds: name, type (string/number/boolean/array/object),
 * required, description, default. We round-trip through the canonical
 * shape:
 *
 * {
 *   "type": "object",
 *   "properties": {
 *     "<field>": { "type": "<t>", "description": "...", "default": ... }
 *   },
 *   "required": ["<field>", ...],
 *   "additionalProperties": false
 * }
 *
 * Anything we don't recognize on `value` is preserved on emit (extra
 * top-level keys + extra per-field keys are passed through). That keeps
 * power users free to drop into raw-JSON mode without losing shape.
 */

export type FieldType = "string" | "number" | "boolean" | "array" | "object";

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "string", label: "string" },
  { value: "number", label: "number" },
  { value: "boolean", label: "boolean" },
  { value: "array", label: "array" },
  { value: "object", label: "object" },
];

export type SchemaBuilderProps = {
  value: Record<string, unknown> | null | undefined;
  onChange: (next: Record<string, unknown>) => void;
  /** Optional id prefix for input names, helps when multiple builders coexist. */
  idPrefix?: string;
  /** When true, render compact single-column rows — used inside ToolTester. */
  compact?: boolean;
};

type FieldShape = {
  name: string;
  type: FieldType;
  required: boolean;
  description: string;
  defaultText: string;
  /** Other JSON-Schema keys we don't surface but want to preserve. */
  extra: Record<string, unknown>;
};

function coerceFieldType(raw: unknown): FieldType {
  if (raw === "number" || raw === "integer") return "number";
  if (raw === "boolean") return "boolean";
  if (raw === "array") return "array";
  if (raw === "object") return "object";
  return "string";
}

function defaultValueAsText(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function parseDefault(text: string, type: FieldType): { ok: true; value: unknown } | { ok: false } {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false };
  if (type === "string") return { ok: true, value: trimmed };
  if (type === "number") {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return { ok: true, value: n };
    return { ok: false };
  }
  if (type === "boolean") {
    if (trimmed === "true") return { ok: true, value: true };
    if (trimmed === "false") return { ok: true, value: false };
    return { ok: false };
  }
  // array / object — try JSON
  try {
    const parsed = JSON.parse(trimmed);
    return { ok: true, value: parsed };
  } catch {
    return { ok: false };
  }
}

function readFields(value: Record<string, unknown> | null | undefined): {
  fields: FieldShape[];
  extraTopLevel: Record<string, unknown>;
} {
  if (!value || typeof value !== "object") {
    return { fields: [], extraTopLevel: {} };
  }
  const properties =
    value.properties && typeof value.properties === "object" && !Array.isArray(value.properties)
      ? (value.properties as Record<string, unknown>)
      : {};
  const requiredArr = Array.isArray(value.required)
    ? (value.required as unknown[]).filter((n): n is string => typeof n === "string")
    : [];
  const requiredSet = new Set(requiredArr);

  const fields: FieldShape[] = Object.entries(properties).map(([name, raw]) => {
    const obj =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const { type, description, default: defVal, ...extra } = obj;
    return {
      name,
      type: coerceFieldType(type),
      required: requiredSet.has(name),
      description: typeof description === "string" ? description : "",
      defaultText: defaultValueAsText(defVal),
      extra,
    };
  });

  // Capture top-level keys we don't author so emit preserves them.
  const { type, properties: _p, required: _r, additionalProperties, ...rest } = value;
  void type;
  void _p;
  void _r;
  void additionalProperties;
  return { fields, extraTopLevel: rest };
}

function buildSchema(
  fields: FieldShape[],
  extraTopLevel: Record<string, unknown>,
  prevAdditionalProperties: unknown
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const f of fields) {
    if (!f.name.trim()) continue;
    const out: Record<string, unknown> = { ...f.extra, type: f.type };
    if (f.description.trim()) out.description = f.description.trim();
    const parsed = parseDefault(f.defaultText, f.type);
    if (parsed.ok) out.default = parsed.value;
    properties[f.name.trim()] = out;
    if (f.required) required.push(f.name.trim());
  }
  const out: Record<string, unknown> = {
    ...extraTopLevel,
    type: "object",
    properties,
  };
  if (required.length > 0) out.required = required;
  out.additionalProperties =
    prevAdditionalProperties === undefined ? false : prevAdditionalProperties;
  return out;
}

export default function SchemaBuilder({
  value,
  onChange,
  idPrefix = "schema",
  compact = false,
}: SchemaBuilderProps) {
  const { fields, extraTopLevel } = useMemo(() => readFields(value), [value]);
  const prevAdditional =
    value && typeof value === "object" && "additionalProperties" in value
      ? (value as Record<string, unknown>).additionalProperties
      : undefined;

  const emit = (nextFields: FieldShape[]) => {
    onChange(buildSchema(nextFields, extraTopLevel, prevAdditional));
  };

  const updateField = (idx: number, patch: Partial<FieldShape>) => {
    const next = fields.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    emit(next);
  };

  const removeField = (idx: number) => {
    emit(fields.filter((_, i) => i !== idx));
  };

  const addField = () => {
    let base = "field";
    let idx = fields.length + 1;
    let name = `${base}_${idx}`;
    const taken = new Set(fields.map((f) => f.name));
    while (taken.has(name)) {
      idx += 1;
      name = `${base}_${idx}`;
    }
    emit([
      ...fields,
      {
        name,
        type: "string",
        required: false,
        description: "",
        defaultText: "",
        extra: {},
      },
    ]);
  };

  if (fields.length === 0) {
    return (
      <div className="space-y-2">
        <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-faint">
          No fields yet. Click <span className="text-app">+ Add field</span>{" "}
          to define what input this tool expects.
        </div>
        <button
          type="button"
          onClick={addField}
          className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent"
        >
          + Add field
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {fields.map((f, idx) => (
        <div
          key={`${idPrefix}-${idx}`}
          className="space-y-2 rounded-lg border border-app bg-app p-3"
        >
          <div className={compact ? "grid gap-2 md:grid-cols-2" : "grid gap-2 md:grid-cols-3"}>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[10px] uppercase tracking-wider text-muted">
                Field name
              </span>
              <input
                value={f.name}
                onChange={(e) => updateField(idx, { name: e.target.value })}
                placeholder="snake_case_name"
                className={`${inputClass} font-mono text-xs`}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[10px] uppercase tracking-wider text-muted">
                Type
              </span>
              <select
                value={f.type}
                onChange={(e) =>
                  updateField(idx, { type: e.target.value as FieldType })
                }
                className={inputClass}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {!compact && (
              <label className="flex items-center gap-2 self-end pb-2 text-xs text-app">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) =>
                    updateField(idx, { required: e.target.checked })
                  }
                  className="accent-[var(--tool-accent,#7c3aed)]"
                />
                Required
              </label>
            )}
          </div>

          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[10px] uppercase tracking-wider text-muted">
              Description
            </span>
            <input
              value={f.description}
              onChange={(e) => updateField(idx, { description: e.target.value })}
              placeholder="What this field is for (LLM reads this)"
              className={inputClass}
            />
          </label>

          <div className="grid gap-2 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[10px] uppercase tracking-wider text-muted">
                Default
              </span>
              <input
                value={f.defaultText}
                onChange={(e) =>
                  updateField(idx, { defaultText: e.target.value })
                }
                placeholder={
                  f.type === "string"
                    ? "(plain text)"
                    : f.type === "number"
                    ? "0"
                    : f.type === "boolean"
                    ? "true / false"
                    : f.type === "array"
                    ? "[]"
                    : "{}"
                }
                className={`${inputClass} font-mono text-xs`}
              />
            </label>
            {compact && (
              <label className="flex items-center gap-2 self-end pb-2 text-xs text-app">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) =>
                    updateField(idx, { required: e.target.checked })
                  }
                  className="accent-[var(--tool-accent,#7c3aed)]"
                />
                Required
              </label>
            )}
          </div>

          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={() => removeField(idx)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-[11px] font-medium text-rose-500 transition-opacity hover:opacity-80"
            >
              Remove field
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addField}
        className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent"
      >
        + Add field
      </button>
    </div>
  );
}

/* ─────────────────────── helpers reused by ToolTester ─────────────────────── */

/** Read the field cards (used when ToolTester needs to render inputs). */
export function readSchemaFields(
  value: Record<string, unknown> | null | undefined
): {
  name: string;
  type: FieldType;
  required: boolean;
  description: string;
  defaultValue: unknown;
}[] {
  const { fields } = readFields(value);
  return fields.map((f) => {
    const parsed = parseDefault(f.defaultText, f.type);
    return {
      name: f.name,
      type: f.type,
      required: f.required,
      description: f.description,
      defaultValue: parsed.ok ? parsed.value : undefined,
    };
  });
}
