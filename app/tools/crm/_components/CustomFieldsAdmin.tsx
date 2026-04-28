"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * CustomFieldsAdmin — define custom fields per record_type.
 *
 * Tabs across the top (Contacts/Companies/Deals/Leads/Inventory). Each tab
 * lists existing fields with reorder + edit + delete. "+ Add field" opens
 * a modal that writes through /api/crm/custom-fields/.
 *
 * RLS already enforces admin/owner-only on insert; this component shows a
 * banner when the caller isn't admin/owner, so the failure mode is clear.
 * ───────────────────────────────────────────────────────────────────── */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWorkspace } from "@/lib/workspaces/client";
import type {
  CrmCustomField,
  CrmCustomFieldOption,
  CrmCustomFieldType,
  CrmRecordType,
} from "../types";
import {
  CUSTOM_FIELD_TYPE_VALUES,
  RECORD_TYPE_VALUES,
} from "../types";
import { RecIcon } from "./_records/Icon";

const TAB_LABELS: Record<CrmRecordType, string> = {
  contact: "Contacts",
  company: "Companies",
  deal: "Deals",
  lead: "Leads",
  inventory: "Inventory",
};

export default function CustomFieldsAdmin() {
  const { current, signedIn } = useWorkspace();
  const workspaceId = current.kind === "team" ? current.id : null;
  const role = current.kind === "team" ? current.role : null;
  const isAdmin = role === "owner" || role === "admin";

  const [tab, setTab] = useState<CrmRecordType>("contact");
  const [fields, setFields] = useState<CrmCustomField[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CrmCustomField | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/crm/custom-fields/?workspace_id=${encodeURIComponent(
          workspaceId
        )}&record_type=${encodeURIComponent(tab)}`
      );
      if (!res.ok) throw new Error("load failed");
      const json = (await res.json()) as { items: CrmCustomField[] };
      setFields(json.items ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, tab]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onMove = useCallback(
    async (id: string, dir: -1 | 1) => {
      const idx = fields.findIndex((f) => f.id === id);
      if (idx < 0) return;
      const swap = idx + dir;
      if (swap < 0 || swap >= fields.length) return;
      const next = [...fields];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      // Re-position based on new order.
      const withPos = next.map((f, i) => ({ ...f, position: i }));
      setFields(withPos);
      // Persist the two changed positions.
      try {
        await Promise.all(
          [withPos[idx], withPos[swap]].map((f) =>
            fetch(`/api/crm/custom-fields/${f.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ position: f.position }),
            })
          )
        );
      } catch {
        /* swallow — re-render on next reload */
      }
    },
    [fields]
  );

  const onDelete = useCallback(
    async (id: string) => {
      if (
        !window.confirm(
          "Delete this custom field? Existing values stay in jsonb but stop being displayed."
        )
      ) {
        return;
      }
      try {
        const res = await fetch(`/api/crm/custom-fields/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("delete failed");
        setFields((prev) => prev.filter((f) => f.id !== id));
      } catch (e) {
        setError((e as Error).message);
      }
    },
    []
  );

  if (!signedIn || !workspaceId) {
    return (
      <div className="flex h-full items-center justify-center bg-app p-6">
        <div className="rounded-md border border-app bg-app-elevated p-4 text-sm text-secondary">
          Sign in and pick a team workspace to manage custom fields.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-app">
      <header className="flex shrink-0 flex-col gap-2 border-b border-app bg-app-elevated px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
            crm.settings.custom-fields
          </div>
          <h2 className="text-sm font-semibold text-app">Custom fields</h2>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={!isAdmin}
          className="inline-flex items-center gap-1.5 rounded-md bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ color: "var(--bg)" }}
        >
          <RecIcon name="plus" size={12} />
          Add field
        </button>
      </header>

      {!isAdmin && (
        <div className="border-b border-app bg-app px-3 py-2 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
          Admin or owner role required to write fields. Read-only mode.
        </div>
      )}

      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-app bg-app px-2 py-1.5">
        {RECORD_TYPE_VALUES.map((rt) => {
          const active = rt === tab;
          return (
            <button
              key={rt}
              type="button"
              onClick={() => setTab(rt)}
              className={`rounded-md border px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                active
                  ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                  : "border-transparent text-secondary hover:bg-surface hover:text-app"
              }`}
            >
              {TAB_LABELS[rt]}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto p-3">
        {error && (
          <div className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
            {error}
          </div>
        )}
        {loading ? (
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
            Loading…
          </div>
        ) : fields.length === 0 ? (
          <div className="rounded-md border border-dashed border-app bg-app-elevated p-6 text-center text-sm text-muted">
            No custom fields for {TAB_LABELS[tab]} yet. Click Add field to
            create your first.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {fields.map((f, i) => (
              <li
                key={f.id}
                className="flex items-center gap-2 rounded-md border border-app bg-app-elevated px-2.5 py-1.5"
              >
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => onMove(f.id, -1)}
                    disabled={!isAdmin || i === 0}
                    className="text-faint hover:text-app disabled:opacity-30"
                    title="Move up"
                  >
                    <RecIcon name="arrow_up" size={10} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(f.id, 1)}
                    disabled={!isAdmin || i === fields.length - 1}
                    className="text-faint hover:text-app disabled:opacity-30"
                    title="Move down"
                  >
                    <RecIcon name="arrow_down" size={10} />
                  </button>
                </div>
                <span className="flex-1 truncate text-sm text-app">{f.label}</span>
                <code className="font-mono text-[0.6rem] text-secondary">{f.key}</code>
                <span className="rounded-md border border-app px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-secondary">
                  {f.type}
                </span>
                {f.required && (
                  <span className="rounded-md bg-tool-accent-soft px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-tool-accent">
                    required
                  </span>
                )}
                {(f.type === "select" || f.type === "multiselect") && (
                  <span className="font-mono text-[0.55rem] text-faint">
                    {f.options.length} opt
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setEditing(f)}
                  disabled={!isAdmin}
                  className="rounded-md border border-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-secondary hover:text-app disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(f.id)}
                  disabled={!isAdmin}
                  className="rounded-md border border-transparent px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-secondary hover:border-red-500/40 hover:text-red-500 disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && workspaceId && (
        <FieldModal
          mode="create"
          recordType={tab}
          workspaceId={workspaceId}
          existing={null}
          existingKeys={fields.map((f) => f.key)}
          onClose={() => setCreating(false)}
          onSaved={(f) => {
            setFields((prev) => [...prev, f]);
            setCreating(false);
          }}
        />
      )}
      {editing && workspaceId && (
        <FieldModal
          mode="edit"
          recordType={editing.record_type}
          workspaceId={workspaceId}
          existing={editing}
          existingKeys={fields.map((f) => f.key).filter((k) => k !== editing.key)}
          onClose={() => setEditing(null)}
          onSaved={(f) => {
            setFields((prev) => prev.map((x) => (x.id === f.id ? f : x)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ── modal ──────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9]/, (m) => `_${m}`);
}

function FieldModal({
  mode,
  recordType,
  workspaceId,
  existing,
  existingKeys,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  recordType: CrmRecordType;
  workspaceId: string;
  existing: CrmCustomField | null;
  existingKeys: string[];
  onClose: () => void;
  onSaved: (field: CrmCustomField) => void;
}) {
  const [label, setLabel] = useState(existing?.label ?? "");
  const [key, setKey] = useState(existing?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(Boolean(existing));
  const [type, setType] = useState<CrmCustomFieldType>(
    (existing?.type as CrmCustomFieldType) ?? "text"
  );
  const [required, setRequired] = useState(existing?.required ?? false);
  const [defaultRaw, setDefaultRaw] = useState<string>(
    existing?.default_value === null || existing?.default_value === undefined
      ? ""
      : typeof existing.default_value === "string"
      ? existing.default_value
      : JSON.stringify(existing.default_value)
  );
  const [options, setOptions] = useState<CrmCustomFieldOption[]>(
    existing?.options && Array.isArray(existing.options)
      ? (existing.options as CrmCustomFieldOption[])
      : []
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-derive key from label until the user manually edits the key.
  useEffect(() => {
    if (keyTouched) return;
    setKey(slugify(label));
  }, [label, keyTouched]);

  const labelRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    window.setTimeout(() => labelRef.current?.focus(), 30);
  }, []);

  const isOptionType = type === "select" || type === "multiselect";

  const submit = useCallback(async () => {
    setError(null);
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      setError("Key must be lower-case snake_case (a-z, 0-9, _).");
      return;
    }
    if (mode === "create" && existingKeys.includes(key)) {
      setError("Key already used in this record type.");
      return;
    }
    if (isOptionType && options.length === 0) {
      setError("Add at least one option.");
      return;
    }

    let parsedDefault: unknown = null;
    if (defaultRaw !== "") {
      if (type === "number" || type === "currency") {
        const n = Number(defaultRaw);
        if (Number.isNaN(n)) {
          setError("Default must be a number.");
          return;
        }
        parsedDefault = n;
      } else if (type === "boolean") {
        parsedDefault = defaultRaw === "true";
      } else if (type === "multiselect") {
        parsedDefault = defaultRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        parsedDefault = defaultRaw;
      }
    }

    setSubmitting(true);
    try {
      let saved: CrmCustomField;
      if (mode === "create") {
        const res = await fetch("/api/crm/custom-fields/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            record_type: recordType,
            key,
            label: label.trim(),
            type,
            options: isOptionType ? options : [],
            required,
            default_value: parsedDefault,
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? "create failed");
        }
        const json = (await res.json()) as { item: CrmCustomField };
        saved = json.item;
      } else {
        if (!existing) throw new Error("missing existing");
        const res = await fetch(`/api/crm/custom-fields/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: label.trim(),
            type,
            options: isOptionType ? options : [],
            required,
            default_value: parsedDefault,
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? "update failed");
        }
        const json = (await res.json()) as { item: CrmCustomField };
        saved = json.item;
      }
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [
    mode,
    label,
    key,
    type,
    required,
    defaultRaw,
    options,
    isOptionType,
    workspaceId,
    recordType,
    existing,
    existingKeys,
    onSaved,
  ]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-xl border border-app bg-app-elevated shadow-2xl sm:rounded-xl">
        <header className="flex items-center justify-between border-b border-app px-3 py-2">
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
            {mode === "create" ? "crm.field.new" : "crm.field.edit"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-transparent px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary hover:border-app hover:text-app"
          >
            Close
          </button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          <label className="block">
            <span className="mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
              Label
            </span>
            <input
              ref={labelRef}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
              placeholder="Lifetime value"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
              Key
            </span>
            <input
              type="text"
              value={key}
              disabled={mode === "edit"}
              onChange={(e) => {
                setKey(e.target.value);
                setKeyTouched(true);
              }}
              className="w-full rounded-md border border-app bg-app px-2 py-1.5 font-mono text-xs text-app focus:border-tool-accent focus:outline-none disabled:opacity-60"
              placeholder="lifetime_value"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                Type
              </span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CrmCustomFieldType)}
                className="w-full rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app focus:border-tool-accent focus:outline-none"
              >
                {CUSTOM_FIELD_TYPE_VALUES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-end gap-2 pb-1.5">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="h-4 w-4 accent-[var(--tool-accent)]"
              />
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                Required
              </span>
            </label>
          </div>

          {!isOptionType && (
            <label className="block">
              <span className="mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                Default value
              </span>
              {type === "boolean" ? (
                <select
                  value={defaultRaw}
                  onChange={(e) => setDefaultRaw(e.target.value)}
                  className="w-full rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app focus:border-tool-accent focus:outline-none"
                >
                  <option value="">—</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  type={
                    type === "number" || type === "currency" ? "number" : "text"
                  }
                  value={defaultRaw}
                  onChange={(e) => setDefaultRaw(e.target.value)}
                  className="w-full rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app focus:border-tool-accent focus:outline-none"
                  placeholder="optional"
                />
              )}
            </label>
          )}

          {isOptionType && (
            <OptionsEditor options={options} onChange={setOptions} />
          )}

          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
              {error}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-app bg-app px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-app px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary hover:text-app"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="rounded-md bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ color: "var(--bg)" }}
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: CrmCustomFieldOption[];
  onChange: (next: CrmCustomFieldOption[]) => void;
}) {
  const update = (i: number, patch: Partial<CrmCustomFieldOption>) => {
    const next = [...options];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
        <span>Options</span>
        <button
          type="button"
          onClick={() => onChange([...options, { label: "", value: "" }])}
          className="rounded-md border border-app px-2 py-0.5 text-secondary hover:text-app"
        >
          + Add option
        </button>
      </div>
      <div className="space-y-1.5">
        {options.map((o, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-1.5 rounded-md border border-app bg-app px-1.5 py-1"
          >
            <input
              type="text"
              value={o.label}
              onChange={(e) => {
                const lbl = e.target.value;
                update(i, {
                  label: lbl,
                  value: o.value || slugify(lbl),
                });
              }}
              placeholder="Label"
              className="rounded-md border border-app bg-app px-1.5 py-1 text-xs text-app focus:border-tool-accent focus:outline-none"
            />
            <input
              type="text"
              value={o.value}
              onChange={(e) => update(i, { value: e.target.value })}
              placeholder="value"
              className="rounded-md border border-app bg-app px-1.5 py-1 font-mono text-[0.65rem] text-app focus:border-tool-accent focus:outline-none"
            />
            <input
              type="color"
              value={o.color ?? "#888888"}
              onChange={(e) => update(i, { color: e.target.value })}
              className="h-6 w-8 cursor-pointer rounded border border-app bg-transparent"
            />
            <button
              type="button"
              onClick={() => onChange(options.filter((_, j) => j !== i))}
              className="rounded-md border border-transparent px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary hover:border-red-500/40 hover:text-red-500"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
