"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * RecordDetail — slide-over panel for any contact / company / inventory
 * record. Tabs: Overview, Activity, Files, Custom fields, Related.
 *
 * Design rules
 * ────────────
 * - Width ~520px on desktop; full-screen overlay on mobile (<768px) with
 *   swipe-down dismiss.
 * - Inline-edit on every overview field for owner/admin; optimistic.
 * - All mutations through REST endpoints under `/api/crm/...`.
 * - Files tab reads `workspace_files` via the existing files API, scoped by
 *   tag `crm-{kind}-{id}`.
 * ───────────────────────────────────────────────────────────────────── */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  CrmActivity,
  CrmCompany,
  CrmContact,
  CrmCustomField,
  CrmInventoryItem,
  CrmInventoryStatus,
} from "../types";
import { Avatar, InventoryStatusPill } from "./_records/Chips";
import { RecIcon } from "./_records/Icon";
import {
  companyDisplayName,
  contactDisplayName,
  formatCurrency,
  formatNumber,
  inventoryDisplayName,
  readCustom,
  relativeTime,
  renderCustomValue,
} from "./_records/helpers";
import IntegrationButtons from "./IntegrationButtons";

type RecordKind = "contact" | "company" | "inventory";

export type DetailRecord = CrmContact | CrmCompany | CrmInventoryItem;

interface RecordDetailProps {
  kind: RecordKind;
  record: DetailRecord;
  workspaceId: string;
  customFields: CrmCustomField[];
  onClose: () => void;
  onUpdated: (next: DetailRecord) => void;
  onDeleted: (id: string) => void;
  /** Width of host viewport (px) — drives mobile vs desktop layout. */
  hostWidth: number;
  /** Open another record by id — used by the Related tab. */
  openRecord?: (kind: RecordKind, id: string) => void;
  /** Cross-tool launcher — drives the footer "Generate poster / Generate
   * sales offer" buttons for inventory, plus the generic Save to Files /
   * Open in Documents / Share to Chat actions. Threaded down from the
   * CRM tool's NativeAppProps. */
  openApp?: (slug: string, params?: Record<string, unknown>) => void;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "activity", label: "Activity" },
  { key: "files", label: "Files" },
  { key: "custom", label: "Custom fields" },
  { key: "related", label: "Related" },
];

type TabKey = "overview" | "activity" | "files" | "custom" | "related";

const PANEL_WIDTH = 520;
const MOBILE_BREAKPOINT = 768;

export default function RecordDetail({
  kind,
  record,
  workspaceId,
  customFields,
  onClose,
  onUpdated,
  onDeleted,
  hostWidth,
  openRecord,
  openApp,
}: RecordDetailProps) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [working, setWorking] = useState<DetailRecord>(record);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    // Re-sync when the parent swaps to a different record while the panel
    // is open. Cheap state copy — fine to run on every record change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorking(record);
  }, [record]);

  // Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mobile = hostWidth < MOBILE_BREAKPOINT;
  const recordCustomFields = useMemo(
    () =>
      customFields
        .filter((f) => f.record_type === kind)
        .sort((a, b) => a.position - b.position),
    [customFields, kind]
  );

  const updatePath: Record<RecordKind, string> = {
    contact: "/api/crm/contacts",
    company: "/api/crm/companies",
    inventory: "/api/crm/inventory",
  };

  const headerName =
    kind === "contact"
      ? contactDisplayName(working as CrmContact)
      : kind === "company"
      ? companyDisplayName(working as CrmCompany)
      : inventoryDisplayName(working as CrmInventoryItem);

  const headerSubtitle =
    kind === "contact"
      ? (working as CrmContact).email ??
        (working as CrmContact).job_title ??
        ""
      : kind === "company"
      ? (working as CrmCompany).domain ??
        (working as CrmCompany).industry ??
        ""
      : (working as CrmInventoryItem).sku ?? "";

  const patch = useCallback(
    async (delta: Partial<DetailRecord>) => {
      const next = { ...working, ...delta } as DetailRecord;
      setWorking(next);
      onUpdated(next);
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`${updatePath[kind]}/${record.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(delta),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `Save failed (${res.status})`);
        }
        const j = (await res.json()) as { item: DetailRecord };
        setWorking(j.item);
        onUpdated(j.item);
      } catch (e) {
        setError((e as Error).message);
        // Roll back.
        setWorking(record);
        onUpdated(record);
      } finally {
        setSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [working, record, kind]
  );

  const handleDelete = async () => {
    if (!confirm(`Delete this ${kind}? This cannot be undone.`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${updatePath[kind]}/${record.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Delete failed (${res.status})`);
      }
      onDeleted(record.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (!mobile) return;
    dragStart.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStart.current === null) return;
    const delta = e.touches[0].clientY - dragStart.current;
    if (delta > 0) setDragOffset(delta);
  };
  const onTouchEnd = () => {
    if (dragOffset > 120) {
      onClose();
    }
    setDragOffset(0);
    dragStart.current = null;
  };

  const panelStyle: React.CSSProperties = mobile
    ? {
        width: "100%",
        height: "100%",
        transform: `translateY(${dragOffset}px)`,
        transition: dragOffset === 0 ? "transform 0.2s" : "none",
      }
    : { width: PANEL_WIDTH };

  return (
    <>
      <button
        type="button"
        aria-label="Close detail"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-black/40"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${kind} detail`}
        className="fixed right-0 top-0 z-50 flex h-full flex-col border-l border-app bg-app shadow-2xl"
        style={panelStyle}
      >
        {/* drag-handle (mobile only) */}
        {mobile && (
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            className="flex shrink-0 justify-center py-2"
          >
            <span className="h-1 w-12 rounded-full bg-faint/60" />
          </div>
        )}

        {/* header */}
        <header className="flex shrink-0 items-start gap-3 border-b border-app px-4 py-3">
          <span className="mt-0.5">
            {kind === "inventory" ? (
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-app bg-app-elevated text-tool-accent"
                aria-hidden="true"
              >
                <RecIcon name="layers" size={18} />
              </span>
            ) : (
              <Avatar
                name={
                  kind === "contact"
                    ? contactDisplayName(working as CrmContact)
                    : (working as CrmCompany).name
                }
                size={40}
              />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <InlineText
              value={headerName}
              onSave={(next) => {
                if (kind === "contact") {
                  // Not wired — name comes from first/last; skip.
                } else if (kind === "company") {
                  void patch({ name: next } as Partial<CrmCompany>);
                } else {
                  void patch({ name: next } as Partial<CrmInventoryItem>);
                }
              }}
              readOnly={kind === "contact"}
              className="text-base font-semibold text-app"
            />
            {headerSubtitle && (
              <div className="truncate text-xs text-secondary">
                {headerSubtitle}
              </div>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md border border-app bg-app-elevated px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-secondary">
                {working.visibility}
              </span>
              {kind === "inventory" && (
                <InventoryStatusPill
                  status={(working as CrmInventoryItem).status}
                />
              )}
              {saving && (
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-tool-accent">
                  saving…
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-app text-secondary hover:text-app"
          >
            <RecIcon name="close" size={14} />
          </button>
        </header>

        {/* tabs */}
        <nav
          aria-label="Record tabs"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-app bg-app-elevated px-2 py-1"
        >
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-md px-3 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  active
                    ? "bg-tool-accent-soft text-tool-accent"
                    : "text-secondary hover:text-app"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* error banner */}
        {error && (
          <div className="shrink-0 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-500">
            {error}
          </div>
        )}

        {/* tab body */}
        <div className="flex-1 overflow-auto">
          {tab === "overview" && (
            <OverviewPanel
              kind={kind}
              record={working}
              recordCustomFields={recordCustomFields}
              onPatch={patch}
            />
          )}
          {tab === "activity" && (
            <ActivityPanel
              kind={kind}
              recordId={record.id}
              workspaceId={workspaceId}
            />
          )}
          {tab === "files" && (
            <FilesPanel kind={kind} recordId={record.id} />
          )}
          {tab === "custom" && (
            <CustomFieldsPanel
              record={working}
              recordCustomFields={recordCustomFields}
            />
          )}
          {tab === "related" && (
            <RelatedPanel
              kind={kind}
              record={working}
              workspaceId={workspaceId}
              openRecord={openRecord}
            />
          )}
        </div>

        {/* footer */}
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-app bg-app-elevated px-3 py-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-red-500 hover:bg-red-500/20 disabled:opacity-50"
          >
            <RecIcon name="trash" size={11} />
            Delete
          </button>
          <div className="flex items-center gap-1">
            {kind === "inventory" && openApp ? (
              <InventoryHandoffButtons
                record={working as CrmInventoryItem}
                openApp={openApp}
              />
            ) : null}
            <IntegrationButtons
              recordType={kind}
              recordId={working.id}
              recordName={recordTitle(kind, working) || "(untitled)"}
              recordSnapshot={working as unknown as Record<string, unknown>}
              openApp={openApp}
              compact
            />
          </div>
        </footer>
      </aside>
    </>
  );
}

// ─── Overview ──────────────────────────────────────────────────────────

function OverviewPanel({
  kind,
  record,
  recordCustomFields,
  onPatch,
}: {
  kind: RecordKind;
  record: DetailRecord;
  recordCustomFields: CrmCustomField[];
  onPatch: (delta: Partial<DetailRecord>) => void;
}) {
  return (
    <div className="space-y-1 p-4">
      {kind === "contact" && (
        <ContactOverview
          contact={record as CrmContact}
          onPatch={onPatch as (d: Partial<CrmContact>) => void}
        />
      )}
      {kind === "company" && (
        <CompanyOverview
          company={record as CrmCompany}
          onPatch={onPatch as (d: Partial<CrmCompany>) => void}
        />
      )}
      {kind === "inventory" && (
        <InventoryOverview
          item={record as CrmInventoryItem}
          onPatch={onPatch as (d: Partial<CrmInventoryItem>) => void}
        />
      )}

      {recordCustomFields.length > 0 && (
        <>
          <div className="my-3 flex items-center gap-2 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
            <span className="h-px flex-1 bg-app" />
            Custom fields
            <span className="h-px flex-1 bg-app" />
          </div>
          {recordCustomFields.map((f) => (
            <FieldRow key={f.id} label={f.label}>
              <span className="text-secondary">
                {renderCustomValue(f, readCustom(record.custom, f.key))}
              </span>
            </FieldRow>
          ))}
        </>
      )}
    </div>
  );
}

function ContactOverview({
  contact,
  onPatch,
}: {
  contact: CrmContact;
  onPatch: (delta: Partial<CrmContact>) => void;
}) {
  return (
    <>
      <FieldRow label="First name">
        <InlineText
          value={contact.first_name ?? ""}
          onSave={(v) => onPatch({ first_name: v || null })}
        />
      </FieldRow>
      <FieldRow label="Last name">
        <InlineText
          value={contact.last_name ?? ""}
          onSave={(v) => onPatch({ last_name: v || null })}
        />
      </FieldRow>
      <FieldRow label="Email">
        <InlineText
          value={contact.email ?? ""}
          placeholder="name@example.com"
          onSave={(v) => onPatch({ email: v || null })}
        />
      </FieldRow>
      <FieldRow label="Phone">
        <InlineText
          value={contact.phone ?? ""}
          onSave={(v) => onPatch({ phone: v || null })}
        />
      </FieldRow>
      <FieldRow label="Job title">
        <InlineText
          value={contact.job_title ?? ""}
          onSave={(v) => onPatch({ job_title: v || null })}
        />
      </FieldRow>
      <FieldRow label="Visibility">
        <span className="text-secondary">{contact.visibility}</span>
      </FieldRow>
      <FieldRow label="Notes">
        <InlineText
          value={contact.notes ?? ""}
          multiline
          onSave={(v) => onPatch({ notes: v || null })}
        />
      </FieldRow>
      <FieldRow label="Created">
        <span className="text-secondary">{relativeTime(contact.created_at)}</span>
      </FieldRow>
      <FieldRow label="Updated">
        <span className="text-secondary">{relativeTime(contact.updated_at)}</span>
      </FieldRow>
    </>
  );
}

function CompanyOverview({
  company,
  onPatch,
}: {
  company: CrmCompany;
  onPatch: (delta: Partial<CrmCompany>) => void;
}) {
  return (
    <>
      <FieldRow label="Name">
        <InlineText
          value={company.name}
          onSave={(v) => onPatch({ name: v || company.name })}
        />
      </FieldRow>
      <FieldRow label="Domain">
        <InlineText
          value={company.domain ?? ""}
          onSave={(v) => onPatch({ domain: v || null })}
        />
      </FieldRow>
      <FieldRow label="Website">
        <InlineText
          value={company.website ?? ""}
          onSave={(v) => onPatch({ website: v || null })}
        />
      </FieldRow>
      <FieldRow label="Industry">
        <InlineText
          value={company.industry ?? ""}
          onSave={(v) => onPatch({ industry: v || null })}
        />
      </FieldRow>
      <FieldRow label="Size">
        <InlineText
          value={company.size ?? ""}
          onSave={(v) => onPatch({ size: v || null })}
        />
      </FieldRow>
      <FieldRow label="Phone">
        <InlineText
          value={company.phone ?? ""}
          onSave={(v) => onPatch({ phone: v || null })}
        />
      </FieldRow>
      <FieldRow label="Address">
        <InlineText
          value={company.address ?? ""}
          multiline
          onSave={(v) => onPatch({ address: v || null })}
        />
      </FieldRow>
      <FieldRow label="City">
        <InlineText
          value={company.city ?? ""}
          onSave={(v) => onPatch({ city: v || null })}
        />
      </FieldRow>
      <FieldRow label="Country">
        <InlineText
          value={company.country ?? ""}
          onSave={(v) => onPatch({ country: v || null })}
        />
      </FieldRow>
      <FieldRow label="Notes">
        <InlineText
          value={company.notes ?? ""}
          multiline
          onSave={(v) => onPatch({ notes: v || null })}
        />
      </FieldRow>
      <FieldRow label="Created">
        <span className="text-secondary">{relativeTime(company.created_at)}</span>
      </FieldRow>
    </>
  );
}

function InventoryOverview({
  item,
  onPatch,
}: {
  item: CrmInventoryItem;
  onPatch: (delta: Partial<CrmInventoryItem>) => void;
}) {
  return (
    <>
      <FieldRow label="Name">
        <InlineText
          value={item.name}
          onSave={(v) => onPatch({ name: v || item.name })}
        />
      </FieldRow>
      <FieldRow label="SKU">
        <InlineText
          value={item.sku ?? ""}
          onSave={(v) => onPatch({ sku: v || null })}
        />
      </FieldRow>
      <FieldRow label="Category">
        <InlineText
          value={item.category ?? ""}
          onSave={(v) => onPatch({ category: v || null })}
        />
      </FieldRow>
      <FieldRow label="Status">
        <select
          value={item.status}
          onChange={(e) =>
            onPatch({ status: e.target.value as CrmInventoryStatus })
          }
          className="rounded-md border border-app bg-app px-2 py-1 text-xs text-app"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>
      </FieldRow>
      <FieldRow label="Price">
        <InlineText
          value={item.price === null ? "" : String(item.price)}
          onSave={(v) => {
            const num = v === "" ? null : Number(v);
            onPatch({ price: Number.isNaN(num) ? null : num });
          }}
          placeholder="0.00"
        />
      </FieldRow>
      <FieldRow label="Currency">
        <InlineText
          value={item.currency}
          onSave={(v) => onPatch({ currency: v || "USD" })}
        />
      </FieldRow>
      <FieldRow label="Cost">
        <InlineText
          value={item.cost === null ? "" : String(item.cost)}
          onSave={(v) => {
            const num = v === "" ? null : Number(v);
            onPatch({ cost: Number.isNaN(num) ? null : num });
          }}
          placeholder="0.00"
        />
      </FieldRow>
      <FieldRow label="Quantity">
        <InlineText
          value={item.quantity === null ? "" : String(item.quantity)}
          onSave={(v) => {
            const num = v === "" ? null : Number(v);
            onPatch({ quantity: Number.isNaN(num) ? null : num });
          }}
        />
      </FieldRow>
      <FieldRow label="Unit">
        <InlineText
          value={item.unit ?? ""}
          onSave={(v) => onPatch({ unit: v || null })}
        />
      </FieldRow>
      <FieldRow label="Description">
        <InlineText
          value={item.description ?? ""}
          multiline
          onSave={(v) => onPatch({ description: v || null })}
        />
      </FieldRow>
      <FieldRow label="Updated">
        <span className="text-secondary">{relativeTime(item.updated_at)}</span>
      </FieldRow>
    </>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-dashed border-app/60 py-2">
      <span className="w-32 shrink-0 pt-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-faint">
        {label}
      </span>
      <div className="min-w-0 flex-1 text-sm text-app">{children}</div>
    </div>
  );
}

function InlineText({
  value,
  onSave,
  placeholder,
  multiline,
  readOnly,
  className,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  readOnly?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    // External value changed (e.g. parent committed an optimistic patch).
    // Mirror it into the draft so the field reflects the latest server state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(value);
  }, [value]);

  if (readOnly || !editing) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!readOnly) setEditing(true);
        }}
        className={`block w-full text-left ${
          readOnly ? "cursor-default" : "cursor-text hover:text-tool-accent"
        } ${className ?? ""}`}
        title={readOnly ? undefined : "Click to edit"}
      >
        {value || (
          <span className="text-faint">{placeholder ?? "Click to edit"}</span>
        )}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  if (multiline) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        rows={3}
        placeholder={placeholder}
        className="block w-full rounded-md border border-tool-accent bg-app px-2 py-1 text-sm text-app focus:outline-none"
      />
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      placeholder={placeholder}
      className="block w-full rounded-md border border-tool-accent bg-app px-2 py-1 text-sm text-app focus:outline-none"
    />
  );
}

// ─── Activity ─────────────────────────────────────────────────────────

function ActivityPanel({
  kind,
  recordId,
  workspaceId,
}: {
  kind: RecordKind;
  recordId: string;
  workspaceId: string;
}) {
  const [items, setItems] = useState<CrmActivity[] | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const queryParam =
    kind === "contact"
      ? "contact_id"
      : kind === "company"
      ? "company_id"
      : null;

  useEffect(() => {
    if (!queryParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setItems(null);
      try {
        const url = `/api/crm/activities?workspace_id=${workspaceId}&${queryParam}=${recordId}&limit=50`;
        const res = await fetch(url);
        const j = (await res.json()) as { items?: CrmActivity[]; error?: string };
        if (cancelled) return;
        if (!res.ok) throw new Error(j.error ?? "Load failed");
        setItems(j.items ?? []);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setItems([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recordId, workspaceId, queryParam]);

  const submitNote = async () => {
    if (!note.trim() || !queryParam) return;
    setPosting(true);
    setError(null);
    try {
      const body = {
        workspace_id: workspaceId,
        kind: "note",
        body: note.trim(),
        [queryParam]: recordId,
      };
      const res = await fetch(`/api/crm/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { item?: CrmActivity; error?: string };
      if (!res.ok || !j.item) throw new Error(j.error ?? "Post failed");
      setItems((prev) => (prev ? [j.item as CrmActivity, ...prev] : [j.item as CrmActivity]));
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPosting(false);
    }
  };

  if (kind === "inventory") {
    return (
      <div className="p-4 text-xs text-faint">
        Activities aren&apos;t scoped to inventory items yet. Tie an item to a
        deal and the deal&apos;s activities will surface here.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {queryParam && (
        <div className="border-b border-app bg-app-elevated p-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note…"
            rows={2}
            className="block w-full rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              disabled={posting || !note.trim()}
              onClick={submitNote}
              className="inline-flex h-7 items-center rounded-md bg-tool-accent px-3 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.16em] disabled:opacity-50"
              style={{ color: "var(--bg)" }}
            >
              {posting ? "Posting…" : "Log note"}
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto p-3">
        {error && <div className="mb-2 text-xs text-red-500">{error}</div>}
        {items === null ? (
          <SkeletonList />
        ) : items.length === 0 ? (
          <div className="rounded-md border border-dashed border-app p-4 text-center text-xs text-faint">
            No activity yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((a) => (
              <li
                key={a.id}
                className="rounded-md border border-app bg-app-elevated p-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-tool-accent">
                    {a.kind}
                  </span>
                  <span className="font-mono text-[0.55rem] text-faint">
                    {relativeTime(a.created_at)}
                  </span>
                </div>
                {a.subject && (
                  <div className="mt-1 text-sm font-medium text-app">
                    {a.subject}
                  </div>
                )}
                {a.body && (
                  <div className="mt-1 whitespace-pre-wrap text-xs text-secondary">
                    {a.body}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Files ────────────────────────────────────────────────────────────

interface WorkspaceFile {
  id: string;
  name: string;
  size?: number;
  created_at?: string;
}

function FilesPanel({
  kind,
  recordId,
}: {
  kind: RecordKind;
  recordId: string;
}) {
  const tag = `crm-${kind}-${recordId}`;
  const [files, setFiles] = useState<WorkspaceFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setFiles(null);
      try {
        // Best-effort fetch — files API tag listing varies by deployment;
        // if there's no `?tag=` endpoint we degrade gracefully.
        const res = await fetch(
          `/api/files/upload?tag=${encodeURIComponent(tag)}`
        );
        if (!res.ok) {
          setFiles([]);
          return;
        }
        const j = (await res.json()) as { files?: WorkspaceFile[] };
        if (!cancelled) setFiles(j.files ?? []);
      } catch {
        if (!cancelled) setFiles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tag]);

  const onPick = () => inputRef.current?.click();
  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    setError(null);
    try {
      const text = await f.text();
      const res = await fetch(`/api/files/save-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.name,
          content: text,
          tag,
        }),
      });
      const j = (await res.json()) as { file?: WorkspaceFile; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Upload failed");
      if (j.file) setFiles((prev) => [j.file as WorkspaceFile, ...(prev ?? [])]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
          Tag · {tag}
        </span>
        <button
          type="button"
          onClick={onPick}
          disabled={uploading}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-app bg-app-elevated px-2 text-xs text-secondary hover:text-app hover:border-tool-accent disabled:opacity-50"
        >
          <RecIcon name="paperclip" size={12} />
          {uploading ? "Uploading…" : "Attach"}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={onChange}
        />
      </div>
      {error && <div className="mb-2 text-xs text-red-500">{error}</div>}
      {files === null ? (
        <SkeletonList />
      ) : files.length === 0 ? (
        <div className="rounded-md border border-dashed border-app p-4 text-center text-xs text-faint">
          No files attached. Drop one in.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between rounded-md border border-app bg-app-elevated px-2.5 py-1.5"
            >
              <span className="truncate text-xs text-app">{f.name}</span>
              <span className="font-mono text-[0.55rem] text-faint">
                {f.created_at ? relativeTime(f.created_at) : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Custom fields ────────────────────────────────────────────────────

function CustomFieldsPanel({
  record,
  recordCustomFields,
}: {
  record: DetailRecord;
  recordCustomFields: CrmCustomField[];
}) {
  if (recordCustomFields.length === 0) {
    return (
      <div className="p-4 text-xs text-faint">
        No custom fields defined for this record type. The Phase 2C admin will
        let you add some.
      </div>
    );
  }
  return (
    <div className="p-4">
      {recordCustomFields.map((f) => (
        <FieldRow key={f.id} label={f.label}>
          <span className="text-secondary">
            {renderCustomValue(f, readCustom(record.custom, f.key))}
          </span>
        </FieldRow>
      ))}
    </div>
  );
}

// ─── Related ──────────────────────────────────────────────────────────

interface RelatedDeal {
  id: string;
  name: string;
  amount: number | null;
  currency: string;
}
interface RelatedContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}
interface RelatedInventory {
  id: string;
  name: string;
  sku: string | null;
}

function RelatedPanel({
  kind,
  record,
  workspaceId,
  openRecord,
}: {
  kind: RecordKind;
  record: DetailRecord;
  workspaceId: string;
  openRecord?: (kind: RecordKind, id: string) => void;
}) {
  const [deals, setDeals] = useState<RelatedDeal[] | null>(null);
  const [contacts, setContacts] = useState<RelatedContact[] | null>(null);
  const [inventory, setInventory] = useState<RelatedInventory[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (kind === "contact") {
          const res = await fetch(
            `/api/crm/deals?workspace_id=${workspaceId}&primary_contact_id=${record.id}&limit=50`
          );
          const j = (await res.json()) as { items?: RelatedDeal[] };
          if (!cancelled) setDeals(j.items ?? []);
        } else if (kind === "company") {
          const [dealRes, contactRes, invRes] = await Promise.all([
            fetch(
              `/api/crm/deals?workspace_id=${workspaceId}&company_id=${record.id}&limit=50`
            ),
            fetch(
              `/api/crm/contacts?workspace_id=${workspaceId}&company_id=${record.id}&limit=50`
            ),
            fetch(
              `/api/crm/inventory?workspace_id=${workspaceId}&company_id=${record.id}&limit=50`
            ),
          ]);
          const [dj, cj, ij] = await Promise.all([
            dealRes.json() as Promise<{ items?: RelatedDeal[] }>,
            contactRes.json() as Promise<{ items?: RelatedContact[] }>,
            invRes.json() as Promise<{ items?: RelatedInventory[] }>,
          ]);
          if (!cancelled) {
            setDeals(dj.items ?? []);
            setContacts(cj.items ?? []);
            setInventory(ij.items ?? []);
          }
        } else {
          const res = await fetch(
            `/api/crm/deals?workspace_id=${workspaceId}&inventory_id=${record.id}&limit=50`
          );
          const j = (await res.json()) as { items?: RelatedDeal[] };
          if (!cancelled) setDeals(j.items ?? []);
        }
      } catch {
        if (!cancelled) {
          setDeals([]);
          setContacts([]);
          setInventory([]);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [kind, record.id, workspaceId]);

  return (
    <div className="space-y-4 p-3">
      {(kind === "contact" || kind === "company" || kind === "inventory") && (
        <RelatedSection
          title="Deals"
          items={deals}
          renderItem={(d) => (
            <span>
              <span className="font-medium text-app">{d.name}</span>
              <span className="ml-2 font-mono text-[0.6rem] text-secondary">
                {formatCurrency(d.amount, d.currency)}
              </span>
            </span>
          )}
        />
      )}
      {kind === "company" && (
        <RelatedSection
          title="Contacts"
          items={contacts}
          renderItem={(c) => (
            <button
              type="button"
              onClick={() => openRecord?.("contact", c.id)}
              className="text-left hover:text-tool-accent"
            >
              <span className="font-medium text-app">
                {[c.first_name, c.last_name].filter(Boolean).join(" ") ||
                  c.email ||
                  "Unnamed"}
              </span>
              {c.email && (
                <span className="ml-2 text-secondary">{c.email}</span>
              )}
            </button>
          )}
        />
      )}
      {kind === "company" && (
        <RelatedSection
          title="Inventory"
          items={inventory}
          renderItem={(i) => (
            <button
              type="button"
              onClick={() => openRecord?.("inventory", i.id)}
              className="text-left hover:text-tool-accent"
            >
              <span className="font-medium text-app">{i.name}</span>
              {i.sku && (
                <span className="ml-2 font-mono text-[0.6rem] text-secondary">
                  {i.sku}
                </span>
              )}
            </button>
          )}
        />
      )}
    </div>
  );
}

function RelatedSection<T extends { id: string }>({
  title,
  items,
  renderItem,
}: {
  title: string;
  items: T[] | null;
  renderItem: (i: T) => ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
        {title}
      </h3>
      {items === null ? (
        <SkeletonList rows={3} />
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-app p-3 text-xs text-faint">
          None linked.
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((i) => (
            <li
              key={i.id}
              className="rounded-md border border-app bg-app-elevated px-2.5 py-1.5 text-xs"
            >
              {renderItem(i)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── shared ───────────────────────────────────────────────────────────

function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 animate-pulse rounded-md border border-app bg-app-elevated"
        />
      ))}
    </div>
  );
}

function recordTitle(kind: RecordKind, record: DetailRecord): string {
  if (kind === "contact") return contactDisplayName(record as CrmContact);
  if (kind === "company") return companyDisplayName(record as CrmCompany);
  return inventoryDisplayName(record as CrmInventoryItem);
}

/* Inventory-only handoff buttons: send the current record to
 * Property Poster Creator or Sales Offer Generator with prefilled fields.
 * Both target tools accept the prefill via NativeAppProps.initialParams.
 *
 * Field mapping is best-effort — CRM inventory has a fixed schema (name,
 * price, currency, category, sku, description) plus a free-form `custom`
 * jsonb where users can stash bedrooms / bathrooms / area_sqft / address /
 * agent name etc. We try common keys first, then fall through silently. */
function InventoryHandoffButtons({
  record,
  openApp,
}: {
  record: CrmInventoryItem;
  openApp: (slug: string, params?: Record<string, unknown>) => void;
}) {
  // Read a custom field by trying several casings — CRM users vary.
  const cf = (...keys: string[]): string => {
    const c = (record.custom ?? {}) as Record<string, unknown>;
    for (const k of keys) {
      const v = c[k];
      if (v == null) continue;
      const s = typeof v === "string" ? v : String(v);
      if (s.trim()) return s;
    }
    return "";
  };
  const priceStr =
    typeof record.price === "number" && record.price > 0
      ? String(record.price)
      : "";

  const goPoster = () => {
    openApp("poster-creator", {
      propertyTitle: record.name,
      price: priceStr,
      bedrooms: cf("bedrooms", "beds", "bed"),
      bathrooms: cf("bathrooms", "baths", "bath"),
      area: cf("area_sqft", "area", "sqft", "size"),
      location: cf("location", "address", "city", "neighborhood") || record.category || "",
      propertyType: record.category ?? "",
      features: cf("features", "amenities"),
      statusLabel: record.status === "active" ? "For Sale" : "",
      agentName: cf("agent_name", "agent", "broker"),
      agentPhone: cf("agent_phone", "phone"),
      agentEmail: cf("agent_email", "email"),
      companyName: cf("company", "company_name", "developer"),
    });
  };

  const goSalesOffer = () => {
    openApp("sales-offer-generator", {
      propertyName: record.name,
      price: priceStr,
      bedrooms: cf("bedrooms", "beds", "bed"),
      size: cf("area_sqft", "area", "sqft", "size"),
      location: cf("location", "address", "city", "neighborhood") || record.category || "",
      unitType: cf("unit_type", "type") || record.category || "",
      developerName: cf("developer", "developer_name", "company"),
      floor: cf("floor"),
      paymentPlan: cf("payment_plan", "plan"),
      serviceCharge: cf("service_charge"),
      handoverDate: cf("handover_date", "handover"),
      agentName: cf("agent_name", "agent", "broker"),
      agentPhone: cf("agent_phone", "phone"),
      companyName: cf("company", "company_name"),
      clientName: "",
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={goPoster}
        title="Generate poster from this inventory item"
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-app bg-app px-2 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-secondary hover:bg-surface-hover hover:text-app"
      >
        <RecIcon name="external" size={11} />
        Poster
      </button>
      <button
        type="button"
        onClick={goSalesOffer}
        title="Generate sales offer from this inventory item"
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-app bg-app px-2 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-secondary hover:bg-surface-hover hover:text-app"
      >
        <RecIcon name="external" size={11} />
        Sales offer
      </button>
      <span aria-hidden="true" className="mx-1 h-4 w-px bg-app" />
    </>
  );
}

// silence unused warning when only a subset of overview fns use formatNumber
void formatNumber;
