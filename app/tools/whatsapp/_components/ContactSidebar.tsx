"use client";

/* WhatsApp inbox v2 — contact sidebar (EPIC-07). Lazy-loaded via next/dynamic
 * from ConversationsTab so its (and the custom-field editor's) JS doesn't load
 * until a conversation is open — keeps the Vercel webpack compile under 8GB.
 *
 * Shows: CRM identity + avatar, labels, lifecycle stage (single-select),
 * custom fields (admin-defined, edited inline), recent activity timeline.
 * Mobile-first: this is a panel the parent shows/hides responsively.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  addConversationLabel,
  aiAssist,
  fetchContactBundle,
  fetchLabels,
  fetchMacros,
  patchConversationAttributes,
  removeConversationLabel,
  runMacro,
  type WaAITask,
  type WaContactBundle,
  type WaCustomFieldDef,
  type WaLabel,
  type WaMacro,
  type WaTranslateTarget,
} from "./api";
import { MiniIcon, formatPhone, formatRelative } from "./ui";

interface Props {
  workspaceId: string;
  conversationId: string;
  onClose?: () => void;
  /** Bump to force a reload (e.g. after a lifecycle change in the header). */
  reloadKey?: number;
  /** When provided, AI "use as draft" pushes the text into the composer. */
  onInsertDraft?: (text: string) => void;
}

const LIFECYCLE_STAGES = [
  "lead",
  "qualified",
  "customer",
  "repeat",
  "wholesale",
  "vip",
  "cold",
];

export default function ContactSidebar({
  workspaceId,
  conversationId,
  onClose,
  reloadKey = 0,
  onInsertDraft,
}: Props) {
  const [bundle, setBundle] = useState<WaContactBundle | null>(null);
  const [labels, setLabels] = useState<WaLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showLabelMenu, setShowLabelMenu] = useState(false);

  const load = useCallback(async () => {
    const [b, l] = await Promise.all([
      fetchContactBundle(workspaceId, conversationId),
      fetchLabels(workspaceId),
    ]);
    if (!b.ok) {
      setErr(b.error);
      setLoading(false);
      return;
    }
    setBundle(b.data);
    if (l.ok) setLabels(l.data);
    setErr(null);
    setLoading(false);
  }, [workspaceId, conversationId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, reloadKey]);

  const appliedLabelIds = useMemo(
    () => new Set((bundle?.labels ?? []).map((l) => l.id)),
    [bundle],
  );

  const toggleLabel = useCallback(
    async (label: WaLabel) => {
      if (!bundle) return;
      const has = appliedLabelIds.has(label.id);
      // optimistic
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              labels: has
                ? prev.labels.filter((l) => l.id !== label.id)
                : [...prev.labels, { id: label.id, title: label.title, color: label.color }],
            }
          : prev,
      );
      if (has) await removeConversationLabel(workspaceId, conversationId, label.id);
      else await addConversationLabel(workspaceId, conversationId, label.id);
    },
    [bundle, appliedLabelIds, workspaceId, conversationId],
  );

  const setLifecycle = useCallback(
    async (stage: string) => {
      if (!bundle) return;
      const next = bundle.conversation.lifecycle_stage === stage ? null : stage;
      setBundle((prev) =>
        prev
          ? { ...prev, conversation: { ...prev.conversation, lifecycle_stage: next } }
          : prev,
      );
      await patchConversationAttributes(workspaceId, conversationId, {}, next);
    },
    [bundle, workspaceId, conversationId],
  );

  const saveCustomValue = useCallback(
    async (key: string, value: unknown) => {
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              conversation: {
                ...prev.conversation,
                custom_attributes: { ...prev.conversation.custom_attributes, [key]: value },
              },
            }
          : prev,
      );
      await patchConversationAttributes(workspaceId, conversationId, { [key]: value });
    },
    [workspaceId, conversationId],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-faint">
        loading contact…
      </div>
    );
  }
  if (err || !bundle) {
    return (
      <div className="p-3 text-xs text-rose-600 dark:text-rose-300">
        {err ?? "Failed to load contact"}
      </div>
    );
  }

  const { conversation: conv, contact, participants, custom_field_defs } = bundle;
  const displayName = conv.title?.trim() || formatPhone(conv.phone);
  const initial = displayName.replace(/^\+/, "").charAt(0).toUpperCase() || "?";

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-app-elevated">
      <div className="flex items-center justify-between border-b border-app px-3 py-2">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
          contact
        </span>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-faint hover:bg-surface hover:text-app"
            aria-label="Close contact panel"
          >
            <MiniIcon name="close" size={14} />
          </button>
        ) : null}
      </div>

      {/* identity */}
      <div className="flex flex-col items-center gap-2 border-b border-app px-3 py-4 text-center">
        {conv.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={conv.avatar_url}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-tool-accent-soft text-2xl font-semibold text-tool-accent">
            {initial}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-app">{displayName}</div>
          <div className="font-mono text-[0.65rem] text-faint">{formatPhone(conv.phone)}</div>
        </div>
        {contact?.email ? (
          <div className="truncate text-xs text-secondary">{contact.email}</div>
        ) : null}
        {contact?.company_name ? (
          <div className="text-xs text-secondary">{contact.company_name}</div>
        ) : null}
        {!contact ? (
          <div className="text-[0.65rem] text-faint">No linked CRM contact</div>
        ) : null}
      </div>

      {/* AI assist (EPIC-11) + macros (EPIC-14) */}
      <Section title="AI assist">
        <AiAssistBlock
          workspaceId={workspaceId}
          conversationId={conversationId}
          onInsertDraft={onInsertDraft}
        />
      </Section>
      <MacrosBlock
        workspaceId={workspaceId}
        conversationId={conversationId}
        onRan={() => void load()}
      />

      {/* labels */}
      <Section title="Labels">
        <div className="flex flex-wrap gap-1">
          {bundle.labels.map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-medium"
              style={{ backgroundColor: `${l.color}22`, color: l.color }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: l.color }}
              />
              {l.title}
              <button
                type="button"
                onClick={() =>
                  void toggleLabel({
                    ...l,
                    workspace_id: workspaceId,
                    show_on_sidebar: true,
                    created_at: "",
                  })
                }
                className="ml-0.5 opacity-70 hover:opacity-100"
                aria-label={`Remove ${l.title}`}
              >
                <MiniIcon name="close" size={10} />
              </button>
            </span>
          ))}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowLabelMenu((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-app px-2 py-0.5 text-[0.65rem] text-secondary hover:bg-surface"
            >
              <MiniIcon name="plus" size={10} /> Label
            </button>
            {showLabelMenu ? (
              <div className="absolute z-20 mt-1 max-h-56 w-44 overflow-y-auto rounded-md border border-app bg-app-elevated p-1 shadow-lg">
                {labels.length === 0 ? (
                  <div className="px-2 py-1.5 text-[0.65rem] text-faint">
                    No labels yet. Create them in Settings.
                  </div>
                ) : (
                  labels.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => {
                        void toggleLabel(l);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-surface"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: l.color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-app">{l.title}</span>
                      {appliedLabelIds.has(l.id) ? (
                        <span className="text-tool-accent">
                          <MiniIcon name="check" size={12} />
                        </span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>
      </Section>

      {/* lifecycle stage */}
      <Section title="Lifecycle stage">
        <div className="flex flex-wrap gap-1">
          {LIFECYCLE_STAGES.map((s) => {
            const active = conv.lifecycle_stage === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => void setLifecycle(s)}
                className={`rounded-full border px-2 py-0.5 text-[0.65rem] capitalize ${
                  active
                    ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                    : "border-app bg-surface text-secondary hover:text-app"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </Section>

      {/* custom fields */}
      {custom_field_defs.length > 0 ? (
        <Section title="Details">
          <div className="flex flex-col gap-2">
            {custom_field_defs.map((def) => (
              <CustomFieldRow
                key={def.id}
                def={def}
                value={conv.custom_attributes[def.attribute_key]}
                onSave={(v) => void saveCustomValue(def.attribute_key, v)}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {/* CRM notes */}
      {contact?.notes ? (
        <Section title="CRM notes">
          <p className="whitespace-pre-wrap break-words text-xs text-secondary">
            {contact.notes}
          </p>
        </Section>
      ) : null}

      {/* participants */}
      {participants.length > 0 ? (
        <Section title="Watchers">
          <div className="flex flex-wrap gap-1">
            {participants.map((p) => (
              <span
                key={p.id}
                className="rounded-full border border-app bg-surface px-2 py-0.5 text-[0.65rem] text-secondary"
              >
                {p.name}
              </span>
            ))}
          </div>
        </Section>
      ) : null}

      {/* recent activity */}
      <Section title="Recent activity">
        {bundle.activity.length === 0 ? (
          <div className="text-[0.65rem] text-faint">No activity yet.</div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {bundle.activity.map((a) => (
              <li key={a.id} className="flex items-start gap-2 text-xs">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                    a.is_private
                      ? "bg-amber-500"
                      : a.direction === "outbound"
                        ? "bg-tool-accent"
                        : "bg-secondary"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-secondary">
                    {a.is_private ? "📝 " : a.direction === "outbound" ? "You: " : ""}
                    {a.preview || "—"}
                  </div>
                  <div className="text-[0.6rem] text-faint">
                    {formatRelative(a.created_at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-app px-3 py-3">
      <div className="mb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
        {title}
      </div>
      {children}
    </div>
  );
}

/** AI assist (EPIC-11): draft / summarize / translate. Server-side; degrades
 *  to a clear "AI not configured" notice when no provider key is set. */
function AiAssistBlock({
  workspaceId,
  conversationId,
  onInsertDraft,
}: {
  workspaceId: string;
  conversationId: string;
  onInsertDraft?: (text: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastTask, setLastTask] = useState<WaAITask | null>(null);
  const [copied, setCopied] = useState(false);

  const run = useCallback(
    async (task: WaAITask) => {
      setBusy(task);
      setResult(null);
      setNotice(null);
      setLastTask(task);
      const res = await aiAssist(workspaceId, { task, conversation_id: conversationId });
      setBusy(null);
      if (!res.ok) {
        setNotice(res.error);
        return;
      }
      if (!res.data.ai_configured) {
        setNotice("AI is not configured for this workspace yet.");
        return;
      }
      if (res.data.error) {
        setNotice(res.data.error.replace(/_/g, " "));
        return;
      }
      setResult(res.data.result ?? "");
    },
    [workspaceId, conversationId],
  );

  const translateResult = useCallback(
    async (target: WaTranslateTarget) => {
      if (!result) return;
      setBusy("translate" + target);
      const res = await aiAssist(workspaceId, { task: "translate", text: result, target });
      setBusy(null);
      if (res.ok && res.data.ai_configured && res.data.result) {
        setResult(res.data.result);
        setLastTask("translate");
      } else if (res.ok && !res.data.ai_configured) {
        setNotice("AI is not configured for this workspace yet.");
      }
    },
    [result, workspaceId],
  );

  const copy = useCallback(() => {
    if (!result) return;
    void navigator.clipboard?.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [result]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <AiButton busy={busy === "draft"} onClick={() => run("draft")}>
          ✦ Suggest reply
        </AiButton>
        <AiButton busy={busy === "summarize"} onClick={() => run("summarize")}>
          ❑ Summarize
        </AiButton>
      </div>
      {notice ? (
        <p className="text-[0.7rem] text-amber-600 dark:text-amber-400">{notice}</p>
      ) : null}
      {result ? (
        <div className="space-y-1.5">
          <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-app bg-app p-2 text-[0.78rem] text-app">
            {result}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <MiniBtn onClick={copy}>{copied ? "Copied" : "Copy"}</MiniBtn>
            {lastTask === "draft" && onInsertDraft ? (
              <MiniBtn onClick={() => onInsertDraft(result)}>Use as draft</MiniBtn>
            ) : null}
            <MiniBtn busy={busy === "translateenglish"} onClick={() => translateResult("english")}>
              → EN
            </MiniBtn>
            <MiniBtn busy={busy === "translateurdu"} onClick={() => translateResult("urdu")}>
              → اردو
            </MiniBtn>
            <MiniBtn
              busy={busy === "translateroman_urdu"}
              onClick={() => translateResult("roman_urdu")}
            >
              → Roman
            </MiniBtn>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AiButton({
  busy,
  onClick,
  children,
}: {
  busy: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-tool-accent transition-colors enabled:hover:bg-tool-accent enabled:hover:text-app-elevated disabled:opacity-60"
    >
      {busy ? "…" : children}
    </button>
  );
}

function MiniBtn({
  busy,
  onClick,
  children,
}: {
  busy?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="rounded border border-app bg-surface px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-secondary hover:bg-app-elevated disabled:opacity-60"
    >
      {busy ? "…" : children}
    </button>
  );
}

/** Macros (EPIC-14): run a saved one-tap action sequence against this chat. */
function MacrosBlock({
  workspaceId,
  conversationId,
  onRan,
}: {
  workspaceId: string;
  conversationId: string;
  onRan: () => void;
}) {
  const [macros, setMacros] = useState<WaMacro[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchMacros(workspaceId).then((res) => {
      if (active && res.ok) setMacros(res.data);
    });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const onRun = useCallback(
    async (m: WaMacro) => {
      setRunning(m.id);
      setFeedback(null);
      const res = await runMacro(workspaceId, conversationId, m.id);
      setRunning(null);
      if (res.ok) {
        const skipped = res.data.results.filter((r) => r.skipped || !r.ok);
        setFeedback(
          skipped.length === 0
            ? `Ran "${m.name}"`
            : `Ran "${m.name}" — ${skipped.length} skipped`,
        );
        onRan();
      } else {
        setFeedback(res.error);
      }
      setTimeout(() => setFeedback(null), 3000);
    },
    [workspaceId, conversationId, onRan],
  );

  if (macros.length === 0) return null;

  return (
    <Section title="Macros">
      <div className="space-y-1">
        {macros.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => void onRun(m)}
            disabled={running === m.id}
            className="block w-full truncate rounded border border-app bg-surface px-2 py-1.5 text-left text-xs text-app hover:bg-app-elevated disabled:opacity-60"
            title={m.description ?? m.name}
          >
            {running === m.id ? "Running…" : `▸ ${m.name}`}
          </button>
        ))}
      </div>
      {feedback ? (
        <p className="mt-1 text-[0.7rem] text-emerald-600 dark:text-emerald-400">{feedback}</p>
      ) : null}
    </Section>
  );
}

function CustomFieldRow({
  def,
  value,
  onSave,
}: {
  def: WaCustomFieldDef;
  value: unknown;
  onSave: (v: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === undefined || value === null ? "" : String(value));

  useEffect(() => {
    setDraft(value === undefined || value === null ? "" : String(value));
  }, [value]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (def.attribute_type === "number" || def.attribute_type === "currency") {
      const n = Number(trimmed);
      onSave(trimmed === "" ? null : Number.isFinite(n) ? n : trimmed);
    } else {
      onSave(trimmed === "" ? null : trimmed);
    }
  };

  if (def.attribute_type === "checkbox") {
    const checked = value === true || value === "true";
    return (
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-secondary">{def.display_name}</span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onSave(e.target.checked)}
          className="accent-[var(--tool-accent,#0ea5e9)]"
        />
      </label>
    );
  }

  if (def.attribute_type === "list") {
    return (
      <label className="flex flex-col gap-0.5 text-xs">
        <span className="text-secondary">{def.display_name}</span>
        <select
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onSave(e.target.value || null)}
          className="rounded border border-app bg-surface px-1.5 py-1 text-app outline-none focus:border-tool-accent"
        >
          <option value="">—</option>
          {def.attribute_values.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="text-secondary">{def.display_name}</span>
      {editing ? (
        <input
          autoFocus
          type={def.attribute_type === "date" ? "date" : def.attribute_type === "number" || def.attribute_type === "currency" ? "number" : "text"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="rounded border border-app bg-surface px-1.5 py-1 text-app outline-none focus:border-tool-accent"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded border border-transparent px-1.5 py-1 text-left text-app hover:border-app hover:bg-surface"
        >
          {value === undefined || value === null || value === "" ? (
            <span className="text-faint">Add {def.display_name.toLowerCase()}…</span>
          ) : (
            String(value)
          )}
        </button>
      )}
    </div>
  );
}
