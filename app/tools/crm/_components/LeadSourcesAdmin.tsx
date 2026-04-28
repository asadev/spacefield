"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * LeadSourcesAdmin — settings tab for plugging external lead sources
 * directly into the CRM.
 *
 * v1 ships three universal connectors (Webhook / Form / CSV); the rest
 * are stubbed as "Coming soon" cards backed by the same `kind` enum so
 * they can be enabled later without a migration.
 *
 * Layout
 *   [Header: name + Add source]
 *   [Empty-state OR table of existing sources w/ ... menu]
 *   [Right pane: events for the selected source, when one is selected]
 *
 * All mutations go through fetch() and call invalidateLeadSourcesCache()
 * to bust the SWR cache so the table re-fetches without manual reload.
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/lib/workspaces/client";
import {
  invalidateLeadSourcesCache,
  useLeadSourceEvents,
  useLeadSources,
} from "./useLeadSources";
import type {
  CrmLeadSource,
  LeadSourceConfig,
  LeadSourceFormField,
  LeadSourceKind,
} from "@/lib/crm/lead-sources/types";
import { RecIcon } from "./_records/Icon";

interface ConnectorMeta {
  kind: LeadSourceKind;
  label: string;
  available: boolean;
  description: string;
}

const CONNECTORS: ConnectorMeta[] = [
  {
    kind: "webhook",
    label: "Webhook",
    available: true,
    description: "Generic JSON POST. Works with Zapier, Make, n8n, custom.",
  },
  {
    kind: "form",
    label: "Public form",
    available: true,
    description: "Hosted form at /f/<slug>. Pick fields, share the link.",
  },
  {
    kind: "csv",
    label: "CSV import",
    available: true,
    description: "Drag a CSV, map columns, bulk-create leads.",
  },
  {
    kind: "meta",
    label: "Meta Lead Ads",
    available: false,
    description: "Facebook + Instagram lead forms.",
  },
  {
    kind: "google",
    label: "Google Lead Forms",
    available: false,
    description: "Google Ads lead-form extension submissions.",
  },
  {
    kind: "mailchimp",
    label: "Mailchimp",
    available: false,
    description: "New audience subscribers as leads.",
  },
  {
    kind: "calendly",
    label: "Calendly",
    available: false,
    description: "Bookings as qualified leads.",
  },
  {
    kind: "typeform",
    label: "Typeform",
    available: false,
    description: "Typeform responses as leads.",
  },
  {
    kind: "tally",
    label: "Tally",
    available: false,
    description: "Tally.so submissions as leads.",
  },
];

const DEFAULT_FORM_FIELDS: LeadSourceFormField[] = [
  { key: "name", mapping: "name", label: "Name", type: "text", required: true },
  {
    key: "email",
    mapping: "email",
    label: "Email",
    type: "email",
    required: true,
  },
  { key: "phone", mapping: "phone", label: "Phone", type: "tel", required: false },
  {
    key: "message",
    mapping: "notes",
    label: "Message",
    type: "textarea",
    required: false,
  },
];

const KIND_LABELS: Record<LeadSourceKind, string> = {
  webhook: "Webhook",
  form: "Form",
  csv: "CSV",
  meta: "Meta",
  google: "Google",
  mailchimp: "Mailchimp",
  calendly: "Calendly",
  typeform: "Typeform",
  tally: "Tally",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  intercom: "Intercom",
};

// ── public URL helpers (used in modals + table) ─────────────────────────

function publicWebhookUrl(slug: string): string {
  return `${getOrigin()}/api/inbound/webhook/${slug}`;
}
function publicFormUrl(slug: string): string {
  return `${getOrigin()}/f/${slug}`;
}
function getOrigin(): string {
  if (typeof window === "undefined") return "https://spacefield.co";
  return window.location.origin;
}

// ── main component ──────────────────────────────────────────────────────

export default function LeadSourcesAdmin() {
  const { current, signedIn } = useWorkspace();
  const workspaceId = current.kind === "team" ? current.id : null;
  const role = current.kind === "team" ? current.role : null;
  const isAdmin = role === "owner" || role === "admin";

  const { sources, loading, error, reload } = useLeadSources(workspaceId);

  const [picker, setPicker] = useState(false);
  const [openConnector, setOpenConnector] = useState<{
    mode: "create" | "edit";
    kind: LeadSourceKind;
    existing?: CrmLeadSource;
  } | null>(null);
  const [eventsFor, setEventsFor] = useState<CrmLeadSource | null>(null);

  const onPickConnector = useCallback(
    (kind: LeadSourceKind) => {
      setPicker(false);
      setOpenConnector({ mode: "create", kind });
    },
    []
  );

  if (!signedIn || !workspaceId) {
    return (
      <div className="flex h-full items-center justify-center bg-app p-6">
        <div className="rounded-md border border-app bg-app-elevated p-4 text-sm text-secondary">
          Sign in and pick a team workspace to manage lead sources.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-app">
      <header className="flex shrink-0 flex-col gap-2 border-b border-app bg-app-elevated px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
            crm.settings.lead-sources
          </div>
          <h2 className="text-sm font-semibold text-app">Lead sources</h2>
        </div>
        <button
          type="button"
          onClick={() => setPicker(true)}
          disabled={!isAdmin}
          className="inline-flex items-center gap-1.5 rounded-md bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <RecIcon name="plus" size={12} />
          Add source
        </button>
      </header>

      {!isAdmin && (
        <div className="border-b border-app bg-app px-3 py-2 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
          Admin or owner role required to add or edit sources. Read-only mode.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-auto p-3">
          {error && (
            <div className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
              {error}
            </div>
          )}
          {loading && sources.length === 0 ? (
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
              Loading…
            </div>
          ) : sources.length === 0 ? (
            <div className="rounded-md border border-dashed border-app bg-app-elevated p-6 text-center text-sm text-muted">
              No lead sources yet. Click Add source to plug in a webhook,
              hosted form, or CSV import.
            </div>
          ) : (
            <SourcesTable
              sources={sources}
              onView={(s) => setEventsFor(s)}
              onEdit={(s) =>
                setOpenConnector({ mode: "edit", kind: s.kind, existing: s })
              }
              isAdmin={isAdmin}
              onChanged={() => {
                invalidateLeadSourcesCache();
                void reload();
              }}
            />
          )}
        </div>
        {eventsFor && (
          <EventsPane
            source={eventsFor}
            isAdmin={isAdmin}
            onClose={() => setEventsFor(null)}
          />
        )}
      </div>

      {picker && (
        <ConnectorPicker
          onPick={onPickConnector}
          onClose={() => setPicker(false)}
        />
      )}
      {openConnector && workspaceId && (
        <ConnectorModal
          workspaceId={workspaceId}
          mode={openConnector.mode}
          kind={openConnector.kind}
          existing={openConnector.existing ?? null}
          onClose={() => setOpenConnector(null)}
          onSaved={() => {
            invalidateLeadSourcesCache();
            void reload();
            setOpenConnector(null);
          }}
        />
      )}
    </div>
  );
}

// ── table of existing sources ───────────────────────────────────────────

function SourcesTable({
  sources,
  onView,
  onEdit,
  isAdmin,
  onChanged,
}: {
  sources: CrmLeadSource[];
  onView: (s: CrmLeadSource) => void;
  onEdit: (s: CrmLeadSource) => void;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  return (
    <ul className="space-y-1.5">
      {sources.map((s) => (
        <SourceRow
          key={s.id}
          source={s}
          onView={() => onView(s)}
          onEdit={() => onEdit(s)}
          isAdmin={isAdmin}
          onChanged={onChanged}
        />
      ))}
    </ul>
  );
}

function SourceRow({
  source,
  onView,
  onEdit,
  isAdmin,
  onChanged,
}: {
  source: CrmLeadSource;
  onView: () => void;
  onEdit: () => void;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

  const ingestUrl =
    source.kind === "webhook"
      ? publicWebhookUrl(source.slug)
      : source.kind === "form"
      ? publicFormUrl(source.slug)
      : "";

  const copyUrl = useCallback(async () => {
    if (!ingestUrl) return;
    try {
      await navigator.clipboard.writeText(ingestUrl);
    } catch {
      /* swallow */
    }
    setMenu(false);
  }, [ingestUrl]);

  const onRegenerate = useCallback(async () => {
    if (
      !window.confirm(
        "Rotate the signing secret? Existing senders using the old secret will start getting 400 bad_signature."
      )
    )
      return;
    setMenu(false);
    try {
      const res = await fetch(
        `/api/crm/lead-sources/${source.id}/regenerate-secret`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("rotate failed");
      onChanged();
    } catch {
      /* swallow — onChanged() refetch will surface state */
    }
  }, [source.id, onChanged]);

  const onDelete = useCallback(async () => {
    setMenu(false);
    const isActive = source.active;
    const ok = window.confirm(
      isActive
        ? "Deactivate this source? It will stop accepting incoming leads. You can re-enable it from the edit modal."
        : "Permanently delete this source? Its event log will be removed too."
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/crm/lead-sources/${source.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
      onChanged();
    } catch {
      /* swallow */
    }
  }, [source.id, source.active, onChanged]);

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-app bg-app-elevated px-2.5 py-1.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm text-app">{source.name}</span>
          <span className="rounded-md border border-app px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-secondary">
            {KIND_LABELS[source.kind]}
          </span>
          {!source.active && (
            <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-amber-500">
              Inactive
            </span>
          )}
        </div>
        {ingestUrl ? (
          <code className="truncate font-mono text-[0.6rem] text-faint">
            {ingestUrl}
          </code>
        ) : (
          <span className="font-mono text-[0.6rem] text-faint">
            {source.kind === "csv"
              ? "CSV import — upload from edit modal"
              : "—"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-faint">
        <span>
          {source.event_count.toLocaleString()} event
          {source.event_count === 1 ? "" : "s"}
        </span>
        <span>
          {source.last_event_at
            ? new Date(source.last_event_at).toLocaleString()
            : "never"}
        </span>
      </div>
      <button
        type="button"
        onClick={onView}
        className="rounded-md border border-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-secondary hover:text-app"
      >
        Events
      </button>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          className="rounded-md border border-app px-2 py-0.5 text-secondary hover:text-app"
        >
          <RecIcon name="more" size={12} />
        </button>
        {menu && (
          <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-md border border-app bg-app-elevated shadow-lg">
            {ingestUrl && (
              <button
                type="button"
                onClick={copyUrl}
                className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[0.6rem] uppercase tracking-[0.14em] text-secondary hover:bg-surface hover:text-app"
              >
                <RecIcon name="copy" size={10} /> Copy URL
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                onEdit();
              }}
              disabled={!isAdmin}
              className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[0.6rem] uppercase tracking-[0.14em] text-secondary hover:bg-surface hover:text-app disabled:opacity-50"
            >
              <RecIcon name="edit" size={10} /> Edit
            </button>
            {source.kind === "webhook" && (
              <button
                type="button"
                onClick={onRegenerate}
                disabled={!isAdmin}
                className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[0.6rem] uppercase tracking-[0.14em] text-secondary hover:bg-surface hover:text-app disabled:opacity-50"
              >
                <RecIcon name="refresh" size={10} /> Rotate secret
              </button>
            )}
            <button
              type="button"
              onClick={onDelete}
              disabled={!isAdmin}
              className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[0.6rem] uppercase tracking-[0.14em] text-red-500 hover:bg-red-500/10 disabled:opacity-50"
            >
              <RecIcon name="trash" size={10} />
              {source.active ? "Deactivate" : "Delete"}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

// ── connector picker grid ───────────────────────────────────────────────

function ConnectorPicker({
  onPick,
  onClose,
}: {
  onPick: (kind: LeadSourceKind) => void;
  onClose: () => void;
}) {
  return (
    <ModalShell title="Add a lead source" onClose={onClose}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CONNECTORS.map((c) => (
          <button
            key={c.kind}
            type="button"
            disabled={!c.available}
            onClick={() => onPick(c.kind)}
            className="flex flex-col items-start gap-1 rounded-md border border-app bg-app-elevated p-3 text-left transition-colors hover:border-tool-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-app"
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-sm font-medium text-app">{c.label}</span>
              {c.available ? (
                <span className="rounded-md bg-tool-accent-soft px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-tool-accent">
                  Available
                </span>
              ) : (
                <span className="rounded-md border border-app px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-faint">
                  Phase 5
                </span>
              )}
            </div>
            <p className="text-xs text-secondary">{c.description}</p>
          </button>
        ))}
      </div>
    </ModalShell>
  );
}

// ── connector modal — dispatches by kind ────────────────────────────────

function ConnectorModal(props: {
  workspaceId: string;
  mode: "create" | "edit";
  kind: LeadSourceKind;
  existing: CrmLeadSource | null;
  onClose: () => void;
  onSaved: (s: CrmLeadSource) => void;
}) {
  if (props.kind === "webhook")
    return <WebhookModal {...props} kind="webhook" />;
  if (props.kind === "form") return <FormModal {...props} kind="form" />;
  if (props.kind === "csv") return <CsvModal {...props} kind="csv" />;
  return (
    <ModalShell title="Coming soon" onClose={props.onClose}>
      <p className="text-sm text-secondary">
        This connector ships in Phase 5. Use Webhook for now — most
        provider APIs can POST to a generic endpoint.
      </p>
    </ModalShell>
  );
}

// ── webhook modal ──────────────────────────────────────────────────────

function WebhookModal({
  workspaceId,
  mode,
  existing,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  mode: "create" | "edit";
  kind: "webhook";
  existing: CrmLeadSource | null;
  onClose: () => void;
  onSaved: (s: CrmLeadSource) => void;
}) {
  const [name, setName] = useState(existing?.name ?? "Webhook");
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CrmLeadSource | null>(existing);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        const res = await fetch(`/api/crm/lead-sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            kind: "webhook",
            name,
            config: { sourceLabel: name },
          }),
        });
        const json = (await res.json()) as { item?: CrmLeadSource; error?: string };
        if (!res.ok || !json.item) throw new Error(json.error ?? "save failed");
        setCreated(json.item);
        onSaved(json.item);
      } else if (existing) {
        const res = await fetch(`/api/crm/lead-sources/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, active }),
        });
        const json = (await res.json()) as { item?: CrmLeadSource; error?: string };
        if (!res.ok || !json.item) throw new Error(json.error ?? "save failed");
        setCreated(json.item);
        onSaved(json.item);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }, [mode, existing, workspaceId, name, active, onSaved]);

  const runTest = useCallback(async () => {
    if (!created) return;
    setTestResult("Testing…");
    try {
      const res = await fetch(
        `/api/crm/lead-sources/${created.id}/test`,
        { method: "POST" }
      );
      const json = (await res.json()) as {
        result?: { status: string; leadId: string | null; reason?: string };
        error?: string;
      };
      if (!res.ok || !json.result) throw new Error(json.error ?? "test failed");
      setTestResult(
        json.result.status === "accepted"
          ? `OK — created lead ${json.result.leadId}`
          : `${json.result.status}${json.result.reason ? ": " + json.result.reason : ""}`
      );
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : "test failed");
    }
  }, [created]);

  const url = created ? publicWebhookUrl(created.slug) : "";
  const curlExample =
    created &&
    `BODY='{"first_name":"Jane","last_name":"Doe","email":"jane@example.com"}'\n` +
      `SIG=$(printf "%s" "$BODY" | openssl dgst -sha256 -hmac "${created.secret}" | awk '{print $2}')\n` +
      `curl -X POST "${url}" \\\n` +
      `  -H "content-type: application/json" \\\n` +
      `  -H "x-spacefield-signature: $SIG" \\\n` +
      `  -d "$BODY"`;

  return (
    <ModalShell
      title={mode === "create" ? "Webhook source" : "Edit webhook source"}
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>
        {mode === "edit" && (
          <Field label="Active">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
          </Field>
        )}
        {error && <ErrorText text={error} />}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Close
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className={btnPrimary}
          >
            {busy ? "Saving…" : mode === "create" ? "Create" : "Save"}
          </button>
        </div>

        {created && (
          <div className="space-y-3 rounded-md border border-app bg-app p-3">
            <Field label="Ingest URL">
              <code className="block break-all rounded-md border border-app bg-app-elevated px-2 py-1.5 font-mono text-[0.65rem] text-app">
                {url}
              </code>
            </Field>
            <Field label="Signing secret">
              <code className="block break-all rounded-md border border-app bg-app-elevated px-2 py-1.5 font-mono text-[0.65rem] text-app">
                {created.secret}
              </code>
              <p className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-faint">
                Header: x-spacefield-signature = hex(hmac-sha256(body, secret))
              </p>
              <p className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-faint">
                Or fallback: ?token={created.secret} appended to the URL.
              </p>
            </Field>
            {curlExample && (
              <Field label="Sample request">
                <pre className="overflow-auto rounded-md border border-app bg-app-elevated p-2 font-mono text-[0.6rem] text-secondary">
                  {curlExample}
                </pre>
              </Field>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={runTest}
                className={btnSecondary}
              >
                Test it
              </button>
              {testResult && (
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-secondary">
                  {testResult}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ── form modal ─────────────────────────────────────────────────────────

function FormModal({
  workspaceId,
  mode,
  existing,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  mode: "create" | "edit";
  kind: "form";
  existing: CrmLeadSource | null;
  onClose: () => void;
  onSaved: (s: CrmLeadSource) => void;
}) {
  const [name, setName] = useState(existing?.name ?? "Contact form");
  const [active, setActive] = useState(existing?.active ?? true);
  const [heading, setHeading] = useState(existing?.config.formHeading ?? "");
  const [subheading, setSubheading] = useState(
    existing?.config.formSubheading ?? ""
  );
  const [thankYou, setThankYou] = useState(
    existing?.config.formThankYou ?? ""
  );
  const [fields, setFields] = useState<LeadSourceFormField[]>(
    existing?.config.fields ?? DEFAULT_FORM_FIELDS
  );
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CrmLeadSource | null>(existing);
  const [error, setError] = useState<string | null>(null);

  const updateField = (idx: number, patch: Partial<LeadSourceFormField>) => {
    setFields((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, ...patch } : f))
    );
  };
  const removeField = (idx: number) =>
    setFields((prev) => prev.filter((_, i) => i !== idx));
  const addField = () =>
    setFields((prev) => [
      ...prev,
      {
        key: `field_${prev.length + 1}`,
        mapping: { custom: `field_${prev.length + 1}` },
        label: "New field",
        type: "text",
        required: false,
      },
    ]);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const config: LeadSourceConfig = {
        fields,
        formHeading: heading || undefined,
        formSubheading: subheading || undefined,
        formThankYou: thankYou || undefined,
        sourceLabel: name,
      };
      if (mode === "create") {
        const res = await fetch(`/api/crm/lead-sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            kind: "form",
            name,
            config,
          }),
        });
        const json = (await res.json()) as { item?: CrmLeadSource; error?: string };
        if (!res.ok || !json.item) throw new Error(json.error ?? "save failed");
        setCreated(json.item);
        onSaved(json.item);
      } else if (existing) {
        const res = await fetch(`/api/crm/lead-sources/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, active, config }),
        });
        const json = (await res.json()) as { item?: CrmLeadSource; error?: string };
        if (!res.ok || !json.item) throw new Error(json.error ?? "save failed");
        setCreated(json.item);
        onSaved(json.item);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }, [
    mode,
    existing,
    workspaceId,
    name,
    active,
    heading,
    subheading,
    thankYou,
    fields,
    onSaved,
  ]);

  const formUrl = created ? publicFormUrl(created.slug) : "";
  const embed = created
    ? `<iframe src="${formUrl}" width="100%" height="640" style="border:0" loading="lazy"></iframe>`
    : "";

  return (
    <ModalShell
      title={mode === "create" ? "Public form" : "Edit form"}
      onClose={onClose}
      wide
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name (internal)">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </Field>
          {mode === "edit" && (
            <Field label="Active">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
            </Field>
          )}
          <Field label="Form heading">
            <input
              type="text"
              value={heading}
              placeholder="Get in touch"
              onChange={(e) => setHeading(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Form subheading">
            <input
              type="text"
              value={subheading}
              placeholder="We reply within 24h."
              onChange={(e) => setSubheading(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Thank-you message">
            <input
              type="text"
              value={thankYou}
              placeholder="Thanks — we'll be in touch."
              onChange={(e) => setThankYou(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="rounded-md border border-app bg-app p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              Fields
            </span>
            <button
              type="button"
              onClick={addField}
              className={btnSecondary}
            >
              <RecIcon name="plus" size={10} /> Add field
            </button>
          </div>
          <ul className="space-y-2">
            {fields.map((f, i) => (
              <FormFieldEditor
                key={i}
                field={f}
                onChange={(patch) => updateField(i, patch)}
                onRemove={() => removeField(i)}
              />
            ))}
          </ul>
        </div>

        {error && <ErrorText text={error} />}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Close
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className={btnPrimary}
          >
            {busy ? "Saving…" : mode === "create" ? "Create" : "Save"}
          </button>
        </div>

        {created && (
          <div className="space-y-3 rounded-md border border-app bg-app p-3">
            <Field label="Public URL">
              <code className="block break-all rounded-md border border-app bg-app-elevated px-2 py-1.5 font-mono text-[0.65rem] text-app">
                {formUrl}
              </code>
            </Field>
            <Field label="Embed snippet">
              <pre className="overflow-auto rounded-md border border-app bg-app-elevated p-2 font-mono text-[0.6rem] text-secondary">
                {embed}
              </pre>
            </Field>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function FormFieldEditor({
  field,
  onChange,
  onRemove,
}: {
  field: LeadSourceFormField;
  onChange: (patch: Partial<LeadSourceFormField>) => void;
  onRemove: () => void;
}) {
  const mappingValue =
    typeof field.mapping === "object"
      ? `custom:${field.mapping.custom}`
      : field.mapping;

  const setMapping = (raw: string) => {
    if (raw.startsWith("custom:")) {
      onChange({ mapping: { custom: raw.slice("custom:".length) || field.key } });
    } else if (
      raw === "first_name" ||
      raw === "last_name" ||
      raw === "name" ||
      raw === "email" ||
      raw === "phone" ||
      raw === "notes"
    ) {
      onChange({ mapping: raw });
    }
  };

  return (
    <li className="grid grid-cols-1 gap-2 rounded-md border border-app bg-app-elevated p-2 sm:grid-cols-6">
      <input
        className={inputClass + " sm:col-span-1"}
        placeholder="key"
        value={field.key}
        onChange={(e) => onChange({ key: e.target.value })}
      />
      <input
        className={inputClass + " sm:col-span-2"}
        placeholder="Label"
        value={field.label}
        onChange={(e) => onChange({ label: e.target.value })}
      />
      <select
        className={inputClass}
        value={field.type}
        onChange={(e) =>
          onChange({ type: e.target.value as LeadSourceFormField["type"] })
        }
      >
        <option value="text">text</option>
        <option value="email">email</option>
        <option value="tel">tel</option>
        <option value="textarea">textarea</option>
        <option value="select">select</option>
      </select>
      <select
        className={inputClass}
        value={mappingValue}
        onChange={(e) => setMapping(e.target.value)}
      >
        <option value="first_name">first_name</option>
        <option value="last_name">last_name</option>
        <option value="name">name (split)</option>
        <option value="email">email</option>
        <option value="phone">phone</option>
        <option value="notes">notes</option>
        <option value={`custom:${field.key}`}>
          custom.{typeof field.mapping === "object" ? field.mapping.custom : field.key}
        </option>
      </select>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1 text-xs text-secondary">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          required
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="text-secondary hover:text-red-500"
          title="Remove"
        >
          <RecIcon name="trash" size={12} />
        </button>
      </div>
    </li>
  );
}

// ── csv modal ──────────────────────────────────────────────────────────

const CSV_TARGETS: { value: string; label: string }[] = [
  { value: "", label: "— skip —" },
  { value: "first_name", label: "first_name" },
  { value: "last_name", label: "last_name" },
  { value: "name", label: "name (split)" },
  { value: "email", label: "email" },
  { value: "phone", label: "phone" },
  { value: "notes", label: "notes" },
];

function CsvModal({
  workspaceId,
  mode,
  existing,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  mode: "create" | "edit";
  kind: "csv";
  existing: CrmLeadSource | null;
  onClose: () => void;
  onSaved: (s: CrmLeadSource) => void;
}) {
  const [name, setName] = useState(existing?.name ?? "CSV import");
  const [active, setActive] = useState(existing?.active ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  // mapping is keyed by lead-target → CSV header; "" means skip.
  const [mapping, setMapping] = useState<Record<string, string>>(
    () => existing?.config.csvMapping?.columns ?? {}
  );
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CrmLeadSource | null>(existing);
  const [importResult, setImportResult] = useState<{
    counts: Record<string, number>;
    truncated: boolean;
    processed: number;
    totalRows: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onPickFile = useCallback(async (f: File) => {
    setFile(f);
    setError(null);
    try {
      const text = await f.text();
      // Quick header sniff: first line, comma-split. The server-side
      // parser is the source of truth — this is just for the UI.
      const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
      const cols = parseHeaderRow(firstLine);
      setHeaders(cols);
      // Auto-map by exact case-insensitive match.
      const guess: Record<string, string> = {};
      for (const c of cols) {
        const lc = c.toLowerCase().replace(/[\s-]+/g, "_");
        if (
          ["first_name", "last_name", "email", "phone", "notes", "name"].includes(
            lc
          )
        ) {
          guess[lc] = c;
        }
      }
      setMapping((prev) => ({ ...guess, ...prev }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not read file");
    }
  }, []);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const config: LeadSourceConfig = {
        csvMapping: { columns: mapping },
        sourceLabel: name,
      };
      if (mode === "create") {
        const res = await fetch(`/api/crm/lead-sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            kind: "csv",
            name,
            config,
          }),
        });
        const json = (await res.json()) as { item?: CrmLeadSource; error?: string };
        if (!res.ok || !json.item) throw new Error(json.error ?? "save failed");
        setCreated(json.item);
        onSaved(json.item);
      } else if (existing) {
        const res = await fetch(`/api/crm/lead-sources/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, active, config }),
        });
        const json = (await res.json()) as { item?: CrmLeadSource; error?: string };
        if (!res.ok || !json.item) throw new Error(json.error ?? "save failed");
        setCreated(json.item);
        onSaved(json.item);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }, [mode, existing, workspaceId, name, active, mapping, onSaved]);

  const runImport = useCallback(async () => {
    if (!created || !file) return;
    setBusy(true);
    setError(null);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/crm/lead-sources/${created.id}/csv-import`,
        { method: "POST", body: fd }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        counts?: Record<string, number>;
        truncated?: boolean;
        processed?: number;
        totalRows?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "import failed");
      setImportResult({
        counts: json.counts ?? {},
        truncated: !!json.truncated,
        processed: json.processed ?? 0,
        totalRows: json.totalRows ?? 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "import failed");
    } finally {
      setBusy(false);
    }
  }, [created, file]);

  return (
    <ModalShell
      title={mode === "create" ? "CSV import" : "Edit CSV import"}
      onClose={onClose}
      wide
    >
      <div className="space-y-4">
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>
        {mode === "edit" && (
          <Field label="Active">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
          </Field>
        )}
        <Field label="CSV file">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickFile(f);
            }}
            className="text-xs text-secondary"
          />
        </Field>

        {headers.length > 0 && (
          <div className="rounded-md border border-app bg-app p-3">
            <div className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              Map columns ({headers.length} found)
            </div>
            <ul className="space-y-1.5">
              {CSV_TARGETS.filter((t) => t.value !== "").map((t) => (
                <li
                  key={t.value}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="w-28 font-mono text-secondary">
                    {t.label}
                  </span>
                  <select
                    className={inputClass + " flex-1"}
                    value={mapping[t.value] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [t.value]: e.target.value }))
                    }
                  >
                    <option value="">— skip —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <ErrorText text={error} />}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Close
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || headers.length === 0}
            className={btnPrimary}
          >
            {busy
              ? "Saving…"
              : created
              ? "Update mapping"
              : "Save mapping"}
          </button>
          {created && file && (
            <button
              type="button"
              onClick={runImport}
              disabled={busy}
              className={btnPrimary}
            >
              {busy ? "Importing…" : "Run import"}
            </button>
          )}
        </div>

        {importResult && (
          <div className="space-y-1 rounded-md border border-app bg-app p-3 text-xs text-secondary">
            <div>
              Rows in file: <strong>{importResult.totalRows}</strong> (processed{" "}
              {importResult.processed}
              {importResult.truncated ? "; truncated to 5000" : ""})
            </div>
            <div>
              Accepted: <strong>{importResult.counts.accepted ?? 0}</strong>
            </div>
            <div>
              Duplicates: <strong>{importResult.counts.duplicate ?? 0}</strong>
            </div>
            <div>
              Rejected: <strong>{importResult.counts.rejected ?? 0}</strong>
            </div>
            <div>
              Errors: <strong>{importResult.counts.error ?? 0}</strong>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function parseHeaderRow(line: string): string[] {
  // Server uses the full RFC-4180 parser; this is a pragmatic split for
  // the UI preview only — handles simple commas and double-quoted fields.
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      if (c === '"') {
        inQ = false;
        continue;
      }
      cur += c;
      continue;
    }
    if (c === '"') {
      inQ = true;
      continue;
    }
    if (c === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

// ── events pane ────────────────────────────────────────────────────────

function EventsPane({
  source,
  isAdmin,
  onClose,
}: {
  source: CrmLeadSource;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const { events, loading, error, reload } = useLeadSourceEvents(source.id);
  const [openPayload, setOpenPayload] = useState<string | null>(null);

  return (
    <aside className="flex w-[28rem] shrink-0 flex-col border-l border-app bg-app-elevated">
      <header className="flex items-center justify-between border-b border-app px-3 py-2">
        <div>
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
            crm.lead-sources.events
          </div>
          <h3 className="text-sm font-semibold text-app">{source.name}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            className="text-secondary hover:text-app"
            title="Refresh"
          >
            <RecIcon name="refresh" size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-secondary hover:text-app"
          >
            <RecIcon name="close" size={14} />
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-auto p-2">
        {loading && events.length === 0 ? (
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
            Loading…
          </div>
        ) : error ? (
          <ErrorText text={error} />
        ) : events.length === 0 ? (
          <p className="text-xs text-faint">No events yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {events.map((e) => (
              <li
                key={e.id}
                className="rounded-md border border-app bg-app p-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <StatusPill status={e.status} />
                  <span className="font-mono text-[0.6rem] text-faint">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                  {e.ip && (
                    <span className="font-mono text-[0.6rem] text-faint">
                      {e.ip}
                    </span>
                  )}
                </div>
                {e.reason && (
                  <p className="mt-1 text-xs text-secondary">{e.reason}</p>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() =>
                      setOpenPayload((cur) => (cur === e.id ? null : e.id))
                    }
                    className="mt-1 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-tool-accent"
                  >
                    {openPayload === e.id ? "Hide payload" : "View payload"}
                  </button>
                )}
                {openPayload === e.id && (
                  <pre className="mt-1 max-h-48 overflow-auto rounded-md border border-app bg-app-elevated p-2 font-mono text-[0.55rem] text-secondary">
                    {JSON.stringify(e.payload, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "accepted"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
      : status === "duplicate"
      ? "border-sky-500/40 bg-sky-500/10 text-sky-500"
      : status === "rejected"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
      : "border-rose-500/40 bg-rose-500/10 text-rose-500";
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] ${cls}`}
    >
      {status}
    </span>
  );
}

// ── shared building blocks ─────────────────────────────────────────────

const inputClass =
  "w-full rounded-md border border-app bg-app-elevated px-2.5 py-1.5 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint";

const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-md bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90 disabled:opacity-50";

const btnSecondary =
  "inline-flex items-center gap-1.5 rounded-md border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-secondary hover:text-app";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}

function ErrorText({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
      {text}
    </p>
  );
}

function ModalShell({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-lg border border-app bg-app shadow-xl ${
          wide ? "max-w-3xl" : "max-w-lg"
        }`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-app bg-app-elevated px-4 py-2">
          <h3 className="text-sm font-semibold text-app">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-secondary hover:text-app"
          >
            <RecIcon name="close" size={14} />
          </button>
        </header>
        <div className="flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

