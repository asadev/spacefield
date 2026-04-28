"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * CustomFieldEditor — generic editor for a record's `custom` jsonb.
 *
 * RecordDetail (Phase 2B) renders custom values read-only via
 * renderCustomValue(); this component lets the user actually EDIT those
 * values. It loads the field definitions for `recordType`, renders the
 * right input for each type, and emits debounced `onChange(nextCustom)`.
 *
 * No persistence happens here — the parent decides when to flush via
 * /api/crm/<entity>/[id] PATCH. We only debounce the onChange callback to
 * avoid one update per keystroke.
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CrmCustomField,
  CrmCustomValues,
  CrmRecordType,
} from "../types";

export interface CustomFieldEditorProps {
  recordType: CrmRecordType;
  workspaceId: string;
  values: CrmCustomValues | null | undefined;
  onChange: (next: CrmCustomValues) => void;
  /** Override fields if the parent already loaded them (skip the fetch). */
  fields?: CrmCustomField[];
  /** Debounce delay (ms) before onChange fires. Default 400ms. */
  debounceMs?: number;
}

export default function CustomFieldEditor({
  recordType,
  workspaceId,
  values,
  onChange,
  fields: fieldsProp,
  debounceMs = 400,
}: CustomFieldEditorProps) {
  const [fields, setFields] = useState<CrmCustomField[]>(fieldsProp ?? []);
  const [loading, setLoading] = useState(!fieldsProp);
  const [draft, setDraft] = useState<CrmCustomValues>(values ?? {});

  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Sync external values updates (e.g. after a save round-trip) into draft.
  const valuesKey = useMemo(
    () => JSON.stringify(values ?? {}),
    [values]
  );
  useEffect(() => {
    setDraft((values ?? {}) as CrmCustomValues);
  }, [valuesKey]);

  // Load field definitions if the parent didn't pass them.
  useEffect(() => {
    if (fieldsProp) {
      setFields(fieldsProp);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/crm/custom-fields/?workspace_id=${encodeURIComponent(
            workspaceId
          )}&record_type=${encodeURIComponent(recordType)}`
        );
        if (!res.ok) return;
        const json = (await res.json()) as { items: CrmCustomField[] };
        if (cancelled) return;
        setFields(json.items ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recordType, workspaceId, fieldsProp]);

  const scheduleFlush = useCallback(
    (next: CrmCustomValues) => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(() => {
        onChangeRef.current(next);
      }, debounceMs);
    },
    [debounceMs]
  );

  useEffect(
    () => () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    },
    []
  );

  const setField = useCallback(
    (key: string, value: unknown) => {
      setDraft((prev) => {
        const next = { ...(prev ?? {}) };
        if (value === null || value === undefined || value === "") {
          delete (next as Record<string, unknown>)[key];
        } else {
          (next as Record<string, unknown>)[key] = value;
        }
        scheduleFlush(next);
        return next;
      });
    },
    [scheduleFlush]
  );

  if (loading) {
    return (
      <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
        Loading custom fields…
      </div>
    );
  }
  if (fields.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-app bg-app p-3 text-xs text-muted">
        No custom fields yet for this record type. Add one in Settings →
        Custom fields.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {fields.map((f) => (
        <FieldRow
          key={f.id}
          field={f}
          value={(draft as Record<string, unknown>)[f.key]}
          onSet={(v) => setField(f.key, v)}
        />
      ))}
    </div>
  );
}

// ── per-field input renderer ───────────────────────────────────────────

function FieldRow({
  field,
  value,
  onSet,
}: {
  field: CrmCustomField;
  value: unknown;
  onSet: (v: unknown) => void;
}) {
  return (
    <label className="grid gap-1 sm:grid-cols-[140px_1fr] sm:items-center sm:gap-3">
      <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
        {field.label}
        {field.required ? " *" : ""}
      </span>
      <FieldInput field={field} value={value} onSet={onSet} />
    </label>
  );
}

function FieldInput({
  field,
  value,
  onSet,
}: {
  field: CrmCustomField;
  value: unknown;
  onSet: (v: unknown) => void;
}) {
  const inputClass =
    "w-full rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none";

  switch (field.type) {
    case "text":
    case "url":
      return (
        <input
          type={field.type === "url" ? "url" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onSet(e.target.value)}
          className={inputClass}
        />
      );
    case "number":
    case "currency":
      return (
        <input
          type="number"
          step="any"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") onSet(null);
            else {
              const n = Number(v);
              onSet(Number.isNaN(n) ? null : n);
            }
          }}
          className={inputClass}
        />
      );
    case "date":
      return (
        <input
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onSet(e.target.value || null)}
          className={inputClass}
        />
      );
    case "boolean":
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onSet(e.target.checked)}
          className="h-4 w-4 accent-[var(--tool-accent)]"
        />
      );
    case "select":
      return (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onSet(e.target.value || null)}
          className={inputClass}
        >
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "multiselect": {
      const arr = Array.isArray(value)
        ? (value as string[]).filter((v) => typeof v === "string")
        : [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {field.options.map((o) => {
            const on = arr.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  const next = on
                    ? arr.filter((v) => v !== o.value)
                    : [...arr, o.value];
                  onSet(next);
                }}
                className={`rounded-full border px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] transition-colors ${
                  on
                    ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                    : "border-app text-secondary hover:text-app"
                }`}
                style={
                  on && o.color ? { borderColor: o.color, color: o.color } : undefined
                }
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    case "user":
      return (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onSet(e.target.value || null)}
          placeholder="user id"
          className={inputClass}
        />
      );
    case "file":
      return (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onSet(e.target.value || null)}
          placeholder="file id"
          className={inputClass}
        />
      );
    default: {
      const _exhaustive: never = field;
      void _exhaustive;
      return null;
    }
  }
}
