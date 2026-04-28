"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * ContactsView — table of CRM contacts.
 *
 * Loads:
 * - /api/crm/contacts?workspace_id=… (rows)
 * - /api/crm/companies?workspace_id=… (lookup for company column)
 * - /api/crm/tags?workspace_id=… (chip rendering)
 * - /api/crm/custom-fields?workspace_id=&record_type=contact (extra cols)
 *
 * Owns: search, filter URL params, sort, bulk-select, quick-add inline form,
 * and the RecordDetail open/close state.
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CrmCompany,
  CrmContact,
  CrmCustomField,
  CrmTag,
} from "../types";
import RecordDetail, { type DetailRecord } from "./RecordDetail";
import { RecordTable, type RecordColumn } from "./RecordTable";
import { Avatar } from "./_records/Chips";
import {
  contactDisplayName,
  readCustom,
  relativeTime,
  renderCustomValue,
} from "./_records/helpers";

interface Props {
  workspaceId: string;
  workspaceLabel: string;
  width: number;
  openApp?: (slug: string, params?: Record<string, unknown>) => void;
}

export default function ContactsView({
  workspaceId,
  workspaceLabel,
  width,
  openApp,
}: Props) {
  const [rows, setRows] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [companies, setCompanies] = useState<Map<string, CrmCompany>>(new Map());
  const [, setTags] = useState<CrmTag[]>([]);
  const [customFields, setCustomFields] = useState<CrmCustomField[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [qaFirst, setQaFirst] = useState("");
  const [qaLast, setQaLast] = useState("");
  const [qaEmail, setQaEmail] = useState("");
  const [qaBusy, setQaBusy] = useState(false);

  // Debounce search 250ms.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // URL query-param sync (bare-bones — only `q`).
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("crm_contacts_q");
    if (q) setSearch(q);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (debounced) sp.set("crm_contacts_q", debounced);
    else sp.delete("crm_contacts_q");
    const next = `${window.location.pathname}?${sp.toString()}${window.location.hash}`;
    window.history.replaceState({}, "", next);
  }, [debounced]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/crm/contacts", window.location.origin);
      url.searchParams.set("workspace_id", workspaceId);
      if (debounced) url.searchParams.set("search", debounced);
      url.searchParams.set("limit", "200");
      const res = await fetch(url.toString());
      const j = (await res.json()) as { items?: CrmContact[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Load failed");
      setRows(j.items ?? []);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  // Lookups (best-effort — failure shouldn't block the table).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const [c, t, cf] = await Promise.all([
          fetch(`/api/crm/companies?workspace_id=${workspaceId}&limit=500`).then(
            (r) => r.json() as Promise<{ items?: CrmCompany[] }>
          ),
          fetch(`/api/crm/tags?workspace_id=${workspaceId}`).then(
            (r) => r.json() as Promise<{ items?: CrmTag[] }>
          ),
          fetch(
            `/api/crm/custom-fields?workspace_id=${workspaceId}&record_type=contact`
          ).then((r) => r.json() as Promise<{ items?: CrmCustomField[] }>),
        ]);
        if (cancelled) return;
        const map = new Map<string, CrmCompany>();
        (c.items ?? []).forEach((co) => map.set(co.id, co));
        setCompanies(map);
        setTags(t.items ?? []);
        setCustomFields(cf.items ?? []);
      } catch {
        /* lookup failures are tolerated */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const columns: RecordColumn<CrmContact>[] = useMemo(() => {
    const base: RecordColumn<CrmContact>[] = [
      {
        key: "name",
        label: "Name",
        sortable: true,
        sortAccessor: (r) => contactDisplayName(r).toLowerCase(),
        render: (r) => (
          <span className="inline-flex items-center gap-2">
            <Avatar name={contactDisplayName(r)} email={r.email} size={22} />
            <span className="truncate text-app">{contactDisplayName(r)}</span>
          </span>
        ),
        width: 220,
      },
      {
        key: "email",
        label: "Email",
        sortable: true,
        sortAccessor: (r) => (r.email ?? "").toLowerCase(),
        render: (r) =>
          r.email ? (
            <span className="truncate text-secondary">{r.email}</span>
          ) : (
            <span className="text-faint">—</span>
          ),
        width: 220,
      },
      {
        key: "phone",
        label: "Phone",
        render: (r) =>
          r.phone ? (
            <span className="text-secondary">{r.phone}</span>
          ) : (
            <span className="text-faint">—</span>
          ),
        width: 140,
        hideOnNarrow: true,
      },
      {
        key: "job_title",
        label: "Job title",
        sortable: true,
        sortAccessor: (r) => (r.job_title ?? "").toLowerCase(),
        render: (r) =>
          r.job_title ? (
            <span className="text-secondary">{r.job_title}</span>
          ) : (
            <span className="text-faint">—</span>
          ),
        width: 160,
        hideOnNarrow: true,
      },
      {
        key: "company",
        label: "Company",
        render: (r) => {
          const co = r.company_id ? companies.get(r.company_id) : null;
          if (!co) return <span className="text-faint">—</span>;
          return (
            <span
              className="inline-flex items-center gap-1.5 text-secondary hover:text-tool-accent"
              title={co.name}
            >
              {co.name}
            </span>
          );
        },
        width: 160,
      },
      {
        key: "updated_at",
        label: "Last activity",
        sortable: true,
        sortAccessor: (r) => r.updated_at,
        render: (r) => (
          <span className="font-mono text-[0.65rem] text-secondary">
            {relativeTime(r.updated_at)}
          </span>
        ),
        width: 110,
        hideOnNarrow: true,
      },
      {
        key: "created_at",
        label: "Created",
        sortable: true,
        sortAccessor: (r) => r.created_at,
        render: (r) => (
          <span className="font-mono text-[0.65rem] text-faint">
            {relativeTime(r.created_at)}
          </span>
        ),
        width: 100,
        hideOnNarrow: true,
      },
    ];

    const customCols: RecordColumn<CrmContact>[] = customFields.map((f) => ({
      key: `cf_${f.key}`,
      label: f.label,
      render: (r) => (
        <span className="truncate text-secondary">
          {renderCustomValue(f, readCustom(r.custom, f.key))}
        </span>
      ),
      hideOnNarrow: true,
      width: 140,
    }));

    return [...base, ...customCols];
  }, [companies, customFields]);

  const handleQuickAdd = async () => {
    if (!qaFirst.trim() && !qaLast.trim() && !qaEmail.trim()) return;
    setQaBusy(true);
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          first_name: qaFirst.trim() || null,
          last_name: qaLast.trim() || null,
          email: qaEmail.trim() || null,
        }),
      });
      const j = (await res.json()) as { item?: CrmContact; error?: string };
      if (!res.ok || !j.item) throw new Error(j.error ?? "Create failed");
      setRows((prev) => [j.item as CrmContact, ...prev]);
      setQaFirst("");
      setQaLast("");
      setQaEmail("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setQaBusy(false);
    }
  };

  const handleNew = () => {
    setQaFirst("New");
  };

  const handleBulk = async (key: string, ids: string[]) => {
    if (key === "delete") {
      if (!confirm(`Delete ${ids.length} contact(s)?`)) return;
      try {
        await Promise.all(
          ids.map((id) =>
            fetch(`/api/crm/contacts/${id}`, { method: "DELETE" })
          )
        );
        setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
        setSelectedIds([]);
      } catch (e) {
        setError((e as Error).message);
      }
    }
  };

  const active = activeId ? rows.find((r) => r.id === activeId) ?? null : null;

  return (
    <>
      <RecordTable<CrmContact>
        rows={rows}
        columns={columns}
        loading={loading}
        workspaceLabel={workspaceLabel}
        title="Contacts"
        subtitle={`${rows.length} ${rows.length === 1 ? "contact" : "contacts"}`}
        newLabel="New contact"
        onNew={handleNew}
        search={search}
        onSearchChange={setSearch}
        onRowClick={(r) => setActiveId(r.id)}
        rowActions={(r) => [
          {
            key: "open",
            label: "Open",
            onClick: () => setActiveId(r.id),
          },
          {
            key: "copy",
            label: "Copy id",
            onClick: () => {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                void navigator.clipboard.writeText(r.id);
              }
            },
          },
          {
            key: "delete",
            label: "Delete",
            destructive: true,
            onClick: async () => {
              if (!confirm("Delete this contact?")) return;
              await fetch(`/api/crm/contacts/${r.id}`, { method: "DELETE" });
              setRows((prev) => prev.filter((x) => x.id !== r.id));
            },
          },
        ]}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        bulkActions={[
          { key: "delete", label: "Delete selected", destructive: true },
        ]}
        onBulkAction={handleBulk}
        empty={
          <EmptyContacts
            error={error}
            onRetry={() => void load()}
            onSeed={() => setQaFirst("First")}
          />
        }
        width={width}
        quickAdd={
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-3 py-2">
            <input
              value={qaFirst}
              onChange={(e) => setQaFirst(e.target.value)}
              placeholder="First name"
              className="h-8 flex-1 min-w-[110px] rounded-md border border-app bg-app-elevated px-2 text-xs text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
            />
            <input
              value={qaLast}
              onChange={(e) => setQaLast(e.target.value)}
              placeholder="Last name"
              className="h-8 flex-1 min-w-[110px] rounded-md border border-app bg-app-elevated px-2 text-xs text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
            />
            <input
              value={qaEmail}
              onChange={(e) => setQaEmail(e.target.value)}
              type="email"
              placeholder="email@example.com"
              className="h-8 flex-[2] min-w-[160px] rounded-md border border-app bg-app-elevated px-2 text-xs text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={handleQuickAdd}
              disabled={qaBusy}
              className="h-8 rounded-md bg-tool-accent px-3 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.16em] disabled:opacity-50"
              style={{ color: "var(--bg)" }}
            >
              {qaBusy ? "Adding…" : "Quick add"}
            </button>
          </div>
        }
      />
      {active && (
        <RecordDetail
          kind="contact"
          record={active}
          workspaceId={workspaceId}
          customFields={customFields}
          hostWidth={width}
          openApp={openApp}
          onClose={() => setActiveId(null)}
          onUpdated={(next) => {
            setRows((prev) =>
              prev.map((r) =>
                r.id === next.id ? (next as CrmContact) : r
              )
            );
          }}
          onDeleted={(id) => {
            setRows((prev) => prev.filter((r) => r.id !== id));
            if (activeId === id) setActiveId(null);
          }}
        />
      )}
    </>
  );
}

// silence DetailRecord-only export warning
void ({} as DetailRecord);

function EmptyContacts({
  error,
  onRetry,
  onSeed,
}: {
  error: string | null;
  onRetry: () => void;
  onSeed: () => void;
}) {
  if (error) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-red-500/40 bg-red-500/5 p-6 text-center">
        <h3 className="text-sm font-semibold text-red-500">
          Could not load contacts
        </h3>
        <p className="mt-1 text-xs text-secondary">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex h-8 items-center rounded-md bg-tool-accent px-3 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "var(--bg)" }}
        >
          Retry
        </button>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md rounded-xl border border-dashed border-app p-6 text-center">
      <h3 className="text-sm font-semibold text-app">No contacts yet</h3>
      <p className="mt-1 text-xs text-secondary">
        Drop a name + email into the quick-add bar above, or click the button to
        get started.
      </p>
      <button
        type="button"
        onClick={onSeed}
        className="mt-3 inline-flex h-8 items-center rounded-md bg-tool-accent px-3 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.16em]"
        style={{ color: "var(--bg)" }}
      >
        Add your first contact
      </button>
    </div>
  );
}
