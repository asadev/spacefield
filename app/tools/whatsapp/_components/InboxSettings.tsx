"use client";

/* WhatsApp inbox v2 — settings panel (EPIC-04/05/07 management). Lazy-loaded
 * via next/dynamic so its JS only loads when the operator opens settings —
 * keeps the Vercel webpack compile memory under 8GB.
 *
 * Three sections: Quick replies (canned responses), Labels, Custom fields.
 * Mobile-first; rendered in a modal overlay by the parent.
 */

import { useCallback, useEffect, useState } from "react";

import {
  createCanned,
  createCustomFieldDef,
  createLabel,
  deleteCanned,
  deleteCustomFieldDef,
  deleteLabel,
  fetchCanned,
  fetchCustomFieldDefs,
  fetchLabels,
  updateCanned,
  updateLabel,
  type WaCanned,
  type WaCustomFieldDef,
  type WaLabel,
} from "./api";
import {
  DangerButton,
  MiniIcon,
  PrimaryButton,
  SecondaryButton,
} from "./ui";

type Tab = "canned" | "labels" | "fields";

const LABEL_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];

export default function InboxSettings({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("canned");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-app bg-app-elevated shadow-xl">
        <div className="flex items-center justify-between border-b border-app px-4 py-2.5">
          <h2 className="text-sm font-semibold text-app">Inbox settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-faint hover:bg-surface hover:text-app"
            aria-label="Close settings"
          >
            <MiniIcon name="close" size={16} />
          </button>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-app px-3 py-2">
          {(
            [
              ["canned", "Quick replies"],
              ["labels", "Labels"],
              ["fields", "Custom fields"],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] ${
                tab === key
                  ? "bg-tool-accent-soft text-tool-accent"
                  : "text-secondary hover:bg-surface hover:text-app"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "canned" ? <CannedSection workspaceId={workspaceId} /> : null}
          {tab === "labels" ? <LabelsSection workspaceId={workspaceId} /> : null}
          {tab === "fields" ? <FieldsSection workspaceId={workspaceId} /> : null}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Quick replies ─────────────────────────── */

function CannedSection({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<WaCanned[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [content, setContent] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchCanned(workspaceId);
    if (res.ok) setItems(res.data);
    setLoading(false);
  }, [workspaceId]);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!code.trim() || !content.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await createCanned(workspaceId, {
      short_code: code,
      content,
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setCode("");
    setContent("");
    void load();
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-secondary">
        Type <code className="rounded bg-surface px-1">/</code> + a short code in
        the composer to insert a reply. Use{" "}
        <code className="rounded bg-surface px-1">{"{{firstName}}"}</code>,{" "}
        <code className="rounded bg-surface px-1">{"{{city}}"}</code> etc. — they
        fill from the linked CRM contact (with <code className="rounded bg-surface px-1">{"{{city|there}}"}</code> fallbacks).
      </p>

      <div className="rounded-lg border border-app bg-surface p-3">
        <div className="flex flex-col gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="short code (e.g. price)"
            className="rounded border border-app bg-app-elevated px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Reply text — supports {{firstName}}, {{city}}…"
            rows={3}
            className="resize-y rounded border border-app bg-app-elevated px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
          />
          {err ? <p className="text-xs text-rose-600 dark:text-rose-300">{err}</p> : null}
          <div>
            <PrimaryButton onClick={() => void add()} loading={busy} disabled={!code.trim() || !content.trim()}>
              <MiniIcon name="plus" /> Add quick reply
            </PrimaryButton>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-faint">loading…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-faint">No quick replies yet.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((c) => (
            <CannedRow
              key={c.id}
              canned={c}
              workspaceId={workspaceId}
              onChanged={load}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CannedRow({
  canned,
  workspaceId,
  onChanged,
}: {
  canned: WaCanned;
  workspaceId: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState(canned.short_code);
  const [content, setContent] = useState(canned.content);

  const save = async () => {
    setEditing(false);
    await updateCanned(workspaceId, canned.id, { short_code: code, content });
    onChanged();
  };
  const remove = async () => {
    await deleteCanned(workspaceId, canned.id);
    onChanged();
  };

  return (
    <li className="rounded-lg border border-app bg-surface p-2.5">
      {editing ? (
        <div className="flex flex-col gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="rounded border border-app bg-app-elevated px-2 py-1 text-sm text-app outline-none focus:border-tool-accent"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={2}
            className="resize-y rounded border border-app bg-app-elevated px-2 py-1 text-sm text-app outline-none focus:border-tool-accent"
          />
          <div className="flex gap-2">
            <PrimaryButton onClick={() => void save()}>Save</PrimaryButton>
            <SecondaryButton onClick={() => setEditing(false)}>Cancel</SecondaryButton>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <code className="rounded bg-tool-accent-soft px-1.5 py-0.5 text-xs font-medium text-tool-accent">
              /{canned.short_code}
            </code>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-secondary">
              {canned.content}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded p-1 text-faint hover:bg-app-elevated hover:text-app"
              aria-label="Edit"
            >
              <MiniIcon name="reply" size={14} />
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              className="rounded p-1 text-faint hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300"
              aria-label="Delete"
            >
              <MiniIcon name="trash" size={14} />
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/* ─────────────────────────── Labels ─────────────────────────── */

function LabelsSection({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<WaLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(LABEL_COLORS[5]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchLabels(workspaceId);
    if (res.ok) setItems(res.data);
    setLoading(false);
  }, [workspaceId]);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await createLabel(workspaceId, { title, color });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setTitle("");
    void load();
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-secondary">
        Labels are your lightweight CRM — tag conversations (Wholesale, Paid,
        VIP) for filtering and, later, segmented broadcasts.
      </p>

      <div className="rounded-lg border border-app bg-surface p-3">
        <div className="flex flex-col gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Label name"
            className="rounded border border-app bg-app-elevated px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {LABEL_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full border-2 ${
                  color === c ? "border-app" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          {err ? <p className="text-xs text-rose-600 dark:text-rose-300">{err}</p> : null}
          <div>
            <PrimaryButton onClick={() => void add()} loading={busy} disabled={!title.trim()}>
              <MiniIcon name="plus" /> Add label
            </PrimaryButton>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-faint">loading…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-faint">No labels yet.</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((l) => (
            <LabelRow key={l.id} label={l} workspaceId={workspaceId} onChanged={load} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LabelRow({
  label,
  workspaceId,
  onChanged,
}: {
  label: WaLabel;
  workspaceId: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(label.title);
  const [color, setColor] = useState(label.color);

  const save = async () => {
    setEditing(false);
    await updateLabel(workspaceId, label.id, { title, color });
    onChanged();
  };
  const remove = async () => {
    await deleteLabel(workspaceId, label.id);
    onChanged();
  };

  return (
    <li className="flex items-center gap-2 rounded-lg border border-app bg-surface px-2.5 py-2">
      {editing ? (
        <>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-w-0 flex-1 rounded border border-app bg-app-elevated px-2 py-1 text-sm text-app outline-none focus:border-tool-accent"
          />
          <div className="flex flex-wrap gap-1">
            {LABEL_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-5 w-5 rounded-full border-2 ${color === c ? "border-app" : "border-transparent"}`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          <PrimaryButton onClick={() => void save()}>Save</PrimaryButton>
        </>
      ) : (
        <>
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
          <span className="min-w-0 flex-1 truncate text-sm text-app">{label.title}</span>
          {typeof label.conversation_count === "number" ? (
            <span className="shrink-0 text-[0.65rem] text-faint">
              {label.conversation_count}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded p-1 text-faint hover:bg-app-elevated hover:text-app"
            aria-label="Edit"
          >
            <MiniIcon name="reply" size={13} />
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            className="rounded p-1 text-faint hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300"
            aria-label="Delete"
          >
            <MiniIcon name="trash" size={13} />
          </button>
        </>
      )}
    </li>
  );
}

/* ─────────────────────────── Custom fields ─────────────────────────── */

const FIELD_TYPES = ["text", "number", "currency", "date", "list", "checkbox"] as const;

function FieldsSection({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<WaCustomFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof FIELD_TYPES)[number]>("text");
  const [optionsRaw, setOptionsRaw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchCustomFieldDefs(workspaceId, "conversation");
    if (res.ok) setItems(res.data);
    setLoading(false);
  }, [workspaceId]);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await createCustomFieldDef(workspaceId, {
      display_name: name,
      attribute_type: type,
      attribute_model: "conversation",
      attribute_values:
        type === "list"
          ? optionsRaw.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setName("");
    setOptionsRaw("");
    void load();
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-secondary">
        Custom fields (size, fabric, city, COD-ok) turn the inbox into a
        shop-tailored CRM. They appear in the contact sidebar of every chat.
      </p>

      <div className="rounded-lg border border-app bg-surface p-3">
        <div className="flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Field name (e.g. Fabric)"
            className="rounded border border-app bg-app-elevated px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as (typeof FIELD_TYPES)[number])}
            className="rounded border border-app bg-app-elevated px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {type === "list" ? (
            <input
              value={optionsRaw}
              onChange={(e) => setOptionsRaw(e.target.value)}
              placeholder="Options, comma-separated (S, M, L, XL)"
              className="rounded border border-app bg-app-elevated px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
            />
          ) : null}
          {err ? <p className="text-xs text-rose-600 dark:text-rose-300">{err}</p> : null}
          <div>
            <PrimaryButton onClick={() => void add()} loading={busy} disabled={!name.trim()}>
              <MiniIcon name="plus" /> Add field
            </PrimaryButton>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-faint">loading…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-faint">No custom fields yet.</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 rounded-lg border border-app bg-surface px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <span className="text-sm text-app">{f.display_name}</span>
                <span className="ml-2 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-faint">
                  {f.attribute_type}
                </span>
                {f.attribute_type === "list" && f.attribute_values.length > 0 ? (
                  <div className="mt-0.5 truncate text-[0.65rem] text-faint">
                    {f.attribute_values.join(", ")}
                  </div>
                ) : null}
              </div>
              <DangerButton onClick={() => void deleteCustomFieldDef(workspaceId, f.id).then(load)}>
                Delete
              </DangerButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
