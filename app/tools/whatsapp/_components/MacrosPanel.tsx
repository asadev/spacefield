"use client";

/* WhatsApp inbox v2 — Wave 4 · EPIC-14 Macros + click-to-WA links/QR.
 *
 * Two sections:
 *   1. Macros — saved one-tap multi-action sequences (send + label + status +
 *      snooze etc.) that REUSE the shared action executor (lib/whatsapp/
 *      actions.ts via /api/whatsapp/conversations/[id]/macros). This panel is
 *      the CRUD surface; running happens from the chat sidebar action menu.
 *   2. Click-to-WA — a pure wa.me link + QR generator (number + prefilled text
 *      + optional source ref that auto-tags inbound). Uses the already-bundled
 *      `qrcode` dep to render a data-URL — NO new dependency.
 *
 * Lazy-loaded from _app.tsx (Vercel 8GB build-OOM guard). Mobile-first.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  buildWaMeLink,
  createMacro,
  deleteMacro,
  fetchLabels,
  fetchMacros,
  updateMacro,
  type WaLabel,
  type WaMacro,
} from "./api";
import {
  DangerButton,
  EmptyState,
  ErrorBlock,
  PrimaryButton,
  SecondaryButton,
} from "./ui";

interface Props {
  workspaceId: string;
  compact?: boolean;
}

type StepType =
  | "send_text"
  | "send_canned"
  | "add_label"
  | "set_status"
  | "set_priority"
  | "snooze_note";

interface DraftStep {
  type: StepType;
  // one of the following depending on type
  text?: string;
  short_code?: string;
  label_id?: string;
  status?: number;
  priority?: number;
}

const STATUS_LABEL: Record<number, string> = {
  0: "Open",
  1: "Resolved",
  2: "Pending",
  3: "Snoozed",
};
const PRIORITY_LABEL: Record<number, string> = {
  0: "None",
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

function stepToAction(s: DraftStep): { type: string; params: Record<string, unknown> } {
  switch (s.type) {
    case "send_text":
      return { type: "send_text", params: { text: s.text ?? "" } };
    case "send_canned":
      return { type: "send_canned", params: { short_code: s.short_code ?? "" } };
    case "add_label":
      return { type: "add_label", params: { label_id: s.label_id ?? "" } };
    case "set_status":
      return { type: "set_status", params: { status: s.status ?? 0 } };
    case "set_priority":
      return { type: "set_priority", params: { priority: s.priority ?? 0 } };
    case "snooze_note":
      // snooze isn't a send/label/status executor action; represent a 3-day
      // "pending" + a note via two real actions is overkill — we map it to
      // set_status pending which IS in the executor vocabulary.
      return { type: "set_status", params: { status: 2 } };
    default:
      return { type: "send_text", params: { text: "" } };
  }
}

function actionLabel(
  a: { type: string; params?: Record<string, unknown> },
  labelById: Map<string, WaLabel>,
): string {
  const p = a.params ?? {};
  switch (a.type) {
    case "send_text":
      return `Send: "${String(p.text ?? "").slice(0, 40)}"`;
    case "send_canned":
      return `Quick reply: /${String(p.short_code ?? "")}`;
    case "send_media":
      return `Send media`;
    case "send_menu":
      return `Send menu`;
    case "add_label": {
      const l = labelById.get(String(p.label_id ?? ""));
      return `Add label: ${l?.title ?? "?"}`;
    }
    case "set_status":
      return `Set status: ${STATUS_LABEL[Number(p.status)] ?? p.status}`;
    case "set_priority":
      return `Set priority: ${PRIORITY_LABEL[Number(p.priority)] ?? p.priority}`;
    case "assign":
      return `Assign`;
    default:
      return a.type;
  }
}

export default function MacrosPanel({ workspaceId }: Props) {
  const [tab, setTab] = useState<"macros" | "link">("macros");

  return (
    <div className="flex h-full flex-col bg-app">
      <div className="flex shrink-0 gap-1 border-b border-app bg-app-elevated px-3 py-2">
        {(["macros", "link"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md border px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
              tab === t
                ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                : "border-transparent text-secondary hover:bg-surface"
            }`}
          >
            {t === "macros" ? "Macros" : "Click-to-WA"}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "macros" ? (
          <MacrosSection workspaceId={workspaceId} />
        ) : (
          <ClickToWaSection />
        )}
      </div>
    </div>
  );
}

function MacrosSection({ workspaceId }: { workspaceId: string }) {
  const [macros, setMacros] = useState<WaMacro[]>([]);
  const [labels, setLabels] = useState<WaLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WaMacro | "new" | null>(null);

  const labelById = useMemo(() => {
    const m = new Map<string, WaLabel>();
    for (const l of labels) m.set(l.id, l);
    return m;
  }, [labels]);

  const load = useCallback(async () => {
    setLoading(true);
    const [mRes, lRes] = await Promise.all([
      fetchMacros(workspaceId),
      fetchLabels(workspaceId),
    ]);
    if (mRes.ok) setMacros(mRes.data);
    else setError(mRes.error);
    if (lRes.ok) setLabels(lRes.data);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const onDelete = useCallback(
    async (id: string) => {
      const res = await deleteMacro(workspaceId, id);
      if (res.ok) setMacros((prev) => prev.filter((m) => m.id !== id));
      else setError(res.error);
    },
    [workspaceId],
  );

  if (editing) {
    return (
      <MacroEditor
        workspaceId={workspaceId}
        macro={editing === "new" ? null : editing}
        labels={labels}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-secondary">
          One-tap action sequences. Run a macro from a chat&apos;s sidebar.
        </p>
        <PrimaryButton onClick={() => setEditing("new")}>+ New macro</PrimaryButton>
      </div>

      {error ? <ErrorBlock body={error} onRetry={load} /> : null}

      {loading ? (
        <p className="text-sm text-faint">Loading…</p>
      ) : macros.length === 0 ? (
        <EmptyState
          kicker="Macros"
          title="No macros yet"
          body='Create one like "Order confirmed" = send a confirmation + add the "paid" label + set pending.'
        />
      ) : (
        <div className="space-y-2">
          {macros.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-app bg-app-elevated p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-app">{m.name}</span>
                    <span className="rounded-full bg-surface px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-faint">
                      {m.visibility}
                    </span>
                  </div>
                  {m.description ? (
                    <p className="mt-0.5 text-xs text-secondary">{m.description}</p>
                  ) : null}
                  <ul className="mt-1.5 space-y-0.5">
                    {m.actions.map((a, i) => (
                      <li key={i} className="text-[0.7rem] text-secondary">
                        {i + 1}. {actionLabel(a, labelById)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <SecondaryButton onClick={() => setEditing(m)}>Edit</SecondaryButton>
                  <DangerButton onClick={() => onDelete(m.id)}>Delete</DangerButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MacroEditor({
  workspaceId,
  macro,
  labels,
  onCancel,
  onSaved,
}: {
  workspaceId: string;
  macro: WaMacro | null;
  labels: WaLabel[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(macro?.name ?? "");
  const [description, setDescription] = useState(macro?.description ?? "");
  const [visibility, setVisibility] = useState<"global" | "personal">(
    macro?.visibility ?? "global",
  );
  const [steps, setSteps] = useState<DraftStep[]>(() => {
    if (!macro) return [{ type: "send_text", text: "" }];
    return macro.actions.map((a): DraftStep => {
      const p = a.params ?? {};
      switch (a.type) {
        case "send_canned":
          return { type: "send_canned", short_code: String(p.short_code ?? "") };
        case "add_label":
          return { type: "add_label", label_id: String(p.label_id ?? "") };
        case "set_status":
          return { type: "set_status", status: Number(p.status ?? 0) };
        case "set_priority":
          return { type: "set_priority", priority: Number(p.priority ?? 0) };
        default:
          return { type: "send_text", text: String(p.text ?? "") };
      }
    });
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateStep = (i: number, patch: Partial<DraftStep>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const save = useCallback(async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    const actions = steps.map(stepToAction).filter((a) => {
      if (a.type === "send_text") return String(a.params.text ?? "").trim();
      if (a.type === "send_canned") return String(a.params.short_code ?? "").trim();
      if (a.type === "add_label") return String(a.params.label_id ?? "").trim();
      return true;
    });
    if (actions.length === 0) {
      setError("Add at least one valid action");
      return;
    }
    setSaving(true);
    setError(null);
    const body = { name: name.trim(), description: description.trim(), actions, visibility };
    const res = macro
      ? await updateMacro(workspaceId, macro.id, body)
      : await createMacro(workspaceId, body);
    setSaving(false);
    if (res.ok) onSaved();
    else setError(res.error);
  }, [name, description, steps, visibility, macro, workspaceId, onSaved]);

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-app">
        {macro ? "Edit macro" : "New macro"}
      </h3>
      {error ? <ErrorBlock body={error} /> : null}

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Macro name (e.g. Order confirmed)"
        className="w-full rounded-lg border border-app bg-transparent px-3 py-2 text-sm text-app"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full rounded-lg border border-app bg-transparent px-3 py-2 text-sm text-app"
      />
      <div className="flex items-center gap-2 text-xs text-secondary">
        <span>Visibility:</span>
        {(["global", "personal"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setVisibility(v)}
            className={`rounded-full px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.14em] ${
              visibility === v ? "bg-tool-accent text-white" : "bg-surface text-secondary"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
          Actions (run in order)
        </div>
        {steps.map((s, i) => (
          <div key={i} className="rounded-lg border border-app bg-app-elevated p-2">
            <div className="flex items-center gap-2">
              <select
                value={s.type}
                onChange={(e) => updateStep(i, { type: e.target.value as StepType })}
                className="rounded border border-app bg-transparent px-2 py-1 text-xs text-app"
              >
                <option value="send_text">Send text</option>
                <option value="send_canned">Quick reply</option>
                <option value="add_label">Add label</option>
                <option value="set_status">Set status</option>
                <option value="set_priority">Set priority</option>
              </select>
              <button
                onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                className="ml-auto text-xs text-faint hover:text-rose-500"
              >
                Remove
              </button>
            </div>
            <div className="mt-2">
              {s.type === "send_text" ? (
                <textarea
                  value={s.text ?? ""}
                  onChange={(e) => updateStep(i, { text: e.target.value })}
                  placeholder="Message text — supports {{contact.firstName}}"
                  rows={2}
                  className="w-full rounded border border-app bg-transparent px-2 py-1 text-sm text-app"
                />
              ) : s.type === "send_canned" ? (
                <input
                  value={s.short_code ?? ""}
                  onChange={(e) => updateStep(i, { short_code: e.target.value })}
                  placeholder="Quick-reply short code (e.g. price)"
                  className="w-full rounded border border-app bg-transparent px-2 py-1 text-sm text-app"
                />
              ) : s.type === "add_label" ? (
                <select
                  value={s.label_id ?? ""}
                  onChange={(e) => updateStep(i, { label_id: e.target.value })}
                  className="w-full rounded border border-app bg-transparent px-2 py-1 text-sm text-app"
                >
                  <option value="">Select a label…</option>
                  {labels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </select>
              ) : s.type === "set_status" ? (
                <select
                  value={s.status ?? 0}
                  onChange={(e) => updateStep(i, { status: Number(e.target.value) })}
                  className="w-full rounded border border-app bg-transparent px-2 py-1 text-sm text-app"
                >
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={s.priority ?? 0}
                  onChange={(e) => updateStep(i, { priority: Number(e.target.value) })}
                  className="w-full rounded border border-app bg-transparent px-2 py-1 text-sm text-app"
                >
                  {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        ))}
        <SecondaryButton
          onClick={() => setSteps((prev) => [...prev, { type: "send_text", text: "" }])}
        >
          + Add action
        </SecondaryButton>
      </div>

      <div className="flex gap-2 pt-2">
        <PrimaryButton onClick={save} loading={saving}>
          {macro ? "Save changes" : "Create macro"}
        </PrimaryButton>
        <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
      </div>
    </div>
  );
}

function ClickToWaSection() {
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [ref, setRef] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const link = useMemo(
    () => (phone.replace(/\D/g, "") ? buildWaMeLink(phone, text, ref) : ""),
    [phone, text, ref],
  );

  useEffect(() => {
    let active = true;
    if (!link) {
      setQr(null);
      return;
    }
    QRCode.toDataURL(link, { width: 220, margin: 1 })
      .then((url) => {
        if (active) setQr(url);
      })
      .catch(() => {
        if (active) setQr(null);
      });
    return () => {
      active = false;
    };
  }, [link]);

  const copy = useCallback(() => {
    if (!link) return;
    void navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [link]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-secondary">
        Generate a wa.me link + QR for posters, packaging, or your IG bio. An
        inbound from this link starts the safest kind of chat. Add a source ref
        to tag where leads came from.
      </p>
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="WhatsApp number (with country code, e.g. 9715xxxxxxx)"
        className="w-full rounded-lg border border-app bg-transparent px-3 py-2 text-sm text-app"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Prefilled message (optional)"
        rows={2}
        className="w-full rounded-lg border border-app bg-transparent px-3 py-2 text-sm text-app"
      />
      <input
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        placeholder="Source ref (optional, e.g. instagram, poster-eid)"
        className="w-full rounded-lg border border-app bg-transparent px-3 py-2 text-sm text-app"
      />

      {link ? (
        <div className="space-y-3 rounded-lg border border-app bg-app-elevated p-3">
          <div className="break-all font-mono text-xs text-tool-accent">{link}</div>
          <div className="flex gap-2">
            <SecondaryButton onClick={copy}>
              {copied ? "Copied!" : "Copy link"}
            </SecondaryButton>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-app bg-surface px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary hover:bg-app-elevated"
            >
              Open
            </a>
          </div>
          {qr ? (
            <div className="flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="WhatsApp QR code" width={220} height={220} />
              <a
                href={qr}
                download="whatsapp-qr.png"
                className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-tool-accent hover:underline"
              >
                Download QR
              </a>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-faint">Enter a number to generate the link + QR.</p>
      )}
    </div>
  );
}
