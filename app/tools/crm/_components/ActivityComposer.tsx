"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * ActivityComposer — shared modal for creating any activity kind.
 *
 * Used by: ActivitiesView, DealDetail (Phase 2A), RecordDetail (Phase 2B),
 *          and the workspace dock notification bell.
 *
 * Flow:
 *   1. Caller passes `open`, `initialKind`, optional `relatedRecord`
 *      pre-binding (one of contact/company/deal/lead).
 *   2. User picks a kind tab, fills the form, hits Save (⌘↵).
 *   3. Composer POSTs to /api/crm/activities/, calls `onCreated(activity)`.
 *
 * No emojis, no rich-text framework — a plain textarea handles the body.
 * Markdown survives untouched; whatever renders activities can format it.
 * ───────────────────────────────────────────────────────────────────── */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWorkspace } from "@/lib/workspaces/client";
import { createClient } from "@/lib/supabase/client";
import type {
  CrmActivity,
  CrmActivityKind,
  CrmCompany,
  CrmContact,
  CrmDeal,
  CrmLead,
} from "../types";
import { ACTIVITY_KIND_VALUES } from "../types";

type RelatedKind = "contact" | "company" | "deal" | "lead";

export interface ActivityComposerRelated {
  kind: RelatedKind;
  id: string;
  label?: string;
}

export interface ActivityComposerProps {
  open: boolean;
  onClose: () => void;
  onCreated: (activity: CrmActivity) => void;
  initialKind?: CrmActivityKind;
  /** Pre-bind one related record (typeahead is hidden when this is set). */
  relatedRecord?: ActivityComposerRelated | null;
  /** Pre-fill subject (e.g. "Follow up with X"). */
  initialSubject?: string;
}

const KIND_TABS: { kind: CrmActivityKind; label: string }[] = [
  { kind: "task", label: "Task" },
  { kind: "call", label: "Call" },
  { kind: "meeting", label: "Meeting" },
  { kind: "email", label: "Email" },
  { kind: "note", label: "Note" },
  { kind: "sms", label: "SMS" },
];

interface RelatedRow {
  kind: RelatedKind;
  id: string;
  label: string;
}

function formatLocalDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function localToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function ActivityComposer({
  open,
  onClose,
  onCreated,
  initialKind = "note",
  relatedRecord = null,
  initialSubject = "",
}: ActivityComposerProps) {
  const { current } = useWorkspace();
  const workspaceId = current.kind === "team" ? current.id : null;

  const [kind, setKind] = useState<CrmActivityKind>(initialKind);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState("");
  const [related, setRelated] = useState<ActivityComposerRelated | null>(
    relatedRecord
  );
  const [emailFrom, setEmailFrom] = useState("");
  const [emailToInput, setEmailToInput] = useState("");
  const [dueAtLocal, setDueAtLocal] = useState("");
  const [completed, setCompleted] = useState(false);
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [endsAtLocal, setEndsAtLocal] = useState("");
  const [callDurationMin, setCallDurationMin] = useState(15);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Typeahead state (only shown when relatedRecord prop isn't pinned).
  const [typeaheadKind, setTypeaheadKind] = useState<RelatedKind>("contact");
  const [typeaheadQuery, setTypeaheadQuery] = useState("");
  const [typeaheadResults, setTypeaheadResults] = useState<RelatedRow[]>([]);
  const [typeaheadOpen, setTypeaheadOpen] = useState(false);

  const subjectRef = useRef<HTMLInputElement | null>(null);

  // Reset on open.
  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setSubject(initialSubject);
    setBody("");
    setRelated(relatedRecord);
    setEmailFrom("");
    setEmailToInput("");
    setDueAtLocal(formatLocalDateTimeInput(new Date(Date.now() + 24 * 3600 * 1000)));
    setCompleted(false);
    const now = new Date();
    setStartsAtLocal(formatLocalDateTimeInput(now));
    setEndsAtLocal(
      formatLocalDateTimeInput(new Date(now.getTime() + 30 * 60 * 1000))
    );
    setCallDurationMin(15);
    setSubmitting(false);
    setError(null);
    setTypeaheadKind(relatedRecord?.kind ?? "contact");
    setTypeaheadQuery("");
    setTypeaheadResults([]);
    setTypeaheadOpen(false);
    // Focus subject on next tick.
    window.setTimeout(() => subjectRef.current?.focus(), 30);
  }, [open, initialKind, initialSubject, relatedRecord]);

  // Auto-default email_from to user.email.
  useEffect(() => {
    if (!open || kind !== "email" || emailFrom) return;
    let cancelled = false;
    (async () => {
      try {
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        if (cancelled) return;
        if (data.user?.email) setEmailFrom(data.user.email);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, kind, emailFrom]);

  // Typeahead query.
  useEffect(() => {
    if (!open || !workspaceId || related) return;
    if (typeaheadQuery.trim().length < 2) {
      setTypeaheadResults([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const sb = createClient();
        const search = `%${typeaheadQuery.trim()}%`;
        let rows: RelatedRow[] = [];
        if (typeaheadKind === "contact") {
          const { data } = await sb
            .from("crm_contacts")
            .select("id, first_name, last_name, email")
            .eq("workspace_id", workspaceId)
            .or(
              `first_name.ilike.${search},last_name.ilike.${search},email.ilike.${search}`
            )
            .limit(8);
          rows = ((data as Pick<CrmContact, "id" | "first_name" | "last_name" | "email">[]) ?? []).map(
            (r) => ({
              kind: "contact" as const,
              id: r.id,
              label:
                [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
                r.email ||
                "Contact",
            })
          );
        } else if (typeaheadKind === "company") {
          const { data } = await sb
            .from("crm_companies")
            .select("id, name")
            .eq("workspace_id", workspaceId)
            .ilike("name", search)
            .limit(8);
          rows = ((data as Pick<CrmCompany, "id" | "name">[]) ?? []).map((r) => ({
            kind: "company" as const,
            id: r.id,
            label: r.name,
          }));
        } else if (typeaheadKind === "deal") {
          const { data } = await sb
            .from("crm_deals")
            .select("id, name")
            .eq("workspace_id", workspaceId)
            .ilike("name", search)
            .limit(8);
          rows = ((data as Pick<CrmDeal, "id" | "name">[]) ?? []).map((r) => ({
            kind: "deal" as const,
            id: r.id,
            label: r.name,
          }));
        } else if (typeaheadKind === "lead") {
          const { data } = await sb
            .from("crm_leads")
            .select("id, first_name, last_name, email")
            .eq("workspace_id", workspaceId)
            .or(
              `first_name.ilike.${search},last_name.ilike.${search},email.ilike.${search}`
            )
            .limit(8);
          rows = ((data as Pick<CrmLead, "id" | "first_name" | "last_name" | "email">[]) ?? []).map(
            (r) => ({
              kind: "lead" as const,
              id: r.id,
              label:
                [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
                r.email ||
                "Lead",
            })
          );
        }
        if (!cancelled) {
          setTypeaheadResults(rows);
          setTypeaheadOpen(true);
        }
      } catch {
        /* ignore */
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, workspaceId, related, typeaheadKind, typeaheadQuery]);

  // Recompute call ends_at when duration or starts changes.
  useEffect(() => {
    if (kind !== "call") return;
    const startIso = localToIso(startsAtLocal);
    if (!startIso) return;
    const end = new Date(new Date(startIso).getTime() + callDurationMin * 60 * 1000);
    setEndsAtLocal(formatLocalDateTimeInput(end));
  }, [kind, callDurationMin, startsAtLocal]);

  const submit = useCallback(async () => {
    if (!workspaceId) {
      setError("No team workspace selected.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        workspace_id: workspaceId,
        kind,
        subject: subject.trim() || null,
        body: body.trim() || null,
      };
      if (related) {
        payload[`${related.kind}_id`] = related.id;
      }
      if (kind === "task") {
        payload.due_at = localToIso(dueAtLocal);
        payload.completed_at = completed ? new Date().toISOString() : null;
      } else if (kind === "call") {
        payload.starts_at = localToIso(startsAtLocal);
        payload.ends_at = localToIso(endsAtLocal);
      } else if (kind === "meeting") {
        payload.starts_at = localToIso(startsAtLocal);
        payload.ends_at = localToIso(endsAtLocal);
      } else if (kind === "email") {
        payload.email_from = emailFrom.trim() || null;
        const tos = emailToInput
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        payload.email_to = tos.length ? tos : null;
      }

      const res = await fetch("/api/crm/activities/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "create failed");
      }
      const json = (await res.json()) as { item: CrmActivity };
      onCreated(json.item);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [
    workspaceId,
    kind,
    subject,
    body,
    related,
    dueAtLocal,
    completed,
    startsAtLocal,
    endsAtLocal,
    emailFrom,
    emailToInput,
    onCreated,
    onClose,
  ]);

  // ⌘↵ submit, Esc close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (
        e.key === "Enter" &&
        (e.metaKey || e.ctrlKey) &&
        !submitting
      ) {
        e.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submit, submitting]);

  const validKinds = useMemo(
    () => ACTIVITY_KIND_VALUES,
    []
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Compose activity"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-xl border border-app bg-app-elevated shadow-2xl sm:rounded-xl">
        <header className="flex items-center justify-between border-b border-app px-3 py-2">
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
            crm.activity.new
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-transparent px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary hover:border-app hover:text-app"
          >
            Close
          </button>
        </header>

        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-app bg-app px-2 py-1.5">
          {validKinds.map((k) => {
            const tab = KIND_TABS.find((x) => x.kind === k);
            if (!tab) return null;
            const active = k === kind;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-md border px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  active
                    ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                    : "border-transparent text-secondary hover:bg-surface hover:text-app"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          <label className="block">
            <span className="mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
              Subject
            </span>
            <input
              ref={subjectRef}
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={kind === "note" ? "Optional" : "Subject"}
              className="w-full rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
            />
          </label>

          {!relatedRecord && (
            <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
              <label className="block">
                <span className="mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  Related to
                </span>
                <select
                  value={typeaheadKind}
                  onChange={(e) =>
                    setTypeaheadKind(e.target.value as RelatedKind)
                  }
                  className="w-full rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app focus:border-tool-accent focus:outline-none"
                >
                  <option value="contact">Contact</option>
                  <option value="company">Company</option>
                  <option value="deal">Deal</option>
                  <option value="lead">Lead</option>
                </select>
              </label>
              <label className="relative block">
                <span className="mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  Pick record
                </span>
                {related ? (
                  <div className="flex items-center gap-2 rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-1.5 text-sm text-tool-accent">
                    <span className="truncate">
                      {related.kind} · {related.label ?? related.id.slice(0, 8)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRelated(null)}
                      className="ml-auto font-mono text-[0.55rem] uppercase tracking-[0.16em]"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={typeaheadQuery}
                    onChange={(e) => setTypeaheadQuery(e.target.value)}
                    onFocus={() => setTypeaheadOpen(true)}
                    placeholder="Type to search…"
                    className="w-full rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
                  />
                )}
                {!related &&
                  typeaheadOpen &&
                  typeaheadResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-auto rounded-md border border-app bg-app-elevated shadow-lg">
                      {typeaheadResults.map((r) => (
                        <button
                          key={`${r.kind}-${r.id}`}
                          type="button"
                          onClick={() => {
                            setRelated({
                              kind: r.kind,
                              id: r.id,
                              label: r.label,
                            });
                            setTypeaheadOpen(false);
                          }}
                          className="block w-full px-3 py-1.5 text-left text-sm text-secondary hover:bg-surface hover:text-app"
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}
              </label>
            </div>
          )}

          {kind === "task" && (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  Due
                </span>
                <input
                  type="datetime-local"
                  value={dueAtLocal}
                  onChange={(e) => setDueAtLocal(e.target.value)}
                  className="w-full rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app focus:border-tool-accent focus:outline-none"
                />
              </label>
              <label className="flex items-end gap-2 pb-1.5">
                <input
                  type="checkbox"
                  checked={completed}
                  onChange={(e) => setCompleted(e.target.checked)}
                  className="h-4 w-4 accent-[var(--tool-accent)]"
                />
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                  Completed
                </span>
              </label>
            </div>
          )}

          {kind === "call" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  Starts
                </span>
                <input
                  type="datetime-local"
                  value={startsAtLocal}
                  onChange={(e) => setStartsAtLocal(e.target.value)}
                  className="w-full rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app focus:border-tool-accent focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  Duration (min)
                </span>
                <input
                  type="number"
                  min={1}
                  value={callDurationMin}
                  onChange={(e) =>
                    setCallDurationMin(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="w-full rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app focus:border-tool-accent focus:outline-none"
                />
              </label>
            </div>
          )}

          {kind === "meeting" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  Starts
                </span>
                <input
                  type="datetime-local"
                  value={startsAtLocal}
                  onChange={(e) => setStartsAtLocal(e.target.value)}
                  className="w-full rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app focus:border-tool-accent focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  Ends
                </span>
                <input
                  type="datetime-local"
                  value={endsAtLocal}
                  onChange={(e) => setEndsAtLocal(e.target.value)}
                  className="w-full rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app focus:border-tool-accent focus:outline-none"
                />
              </label>
            </div>
          )}

          {kind === "email" && (
            <div className="grid gap-2">
              <label className="block">
                <span className="mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  From
                </span>
                <input
                  type="email"
                  value={emailFrom}
                  onChange={(e) => setEmailFrom(e.target.value)}
                  className="w-full rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app focus:border-tool-accent focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                  To (comma-separated)
                </span>
                <input
                  type="text"
                  value={emailToInput}
                  onChange={(e) => setEmailToInput(e.target.value)}
                  placeholder="alice@example.com, bob@example.com"
                  className="w-full rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
                />
              </label>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
              Body
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={kind === "note" || kind === "email" ? 8 : 5}
              className="w-full resize-y rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
              placeholder="Markdown is fine — keep it short."
            />
          </label>

          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-app bg-app px-3 py-2">
          <span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
            ⌘↵ to save · Esc to close
          </span>
          <div className="flex items-center gap-2">
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
          </div>
        </footer>
      </div>
    </div>
  );
}
