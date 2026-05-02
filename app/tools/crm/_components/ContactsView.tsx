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
import { cachedFetch, invalidate } from "@/lib/cache/swr";
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

// RFC 4180-ish CSV parser used by the import flow. Handles quoted fields
// with embedded commas / newlines / escaped double-quotes.
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        out.push(row);
        row = [];
      } else field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    out.push(row);
  }
  return out.filter((r) => r.some((c) => c.trim() !== ""));
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
  const [tags, setTags] = useState<CrmTag[]>([]);
  const [recordTags, setRecordTags] = useState<Map<string, string[]>>(
    new Map()
  );
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [customFields, setCustomFields] = useState<CrmCustomField[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [qaFirst, setQaFirst] = useState("");
  const [qaLast, setQaLast] = useState("");
  const [qaEmail, setQaEmail] = useState("");
  const [qaBusy, setQaBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [mergeReport, setMergeReport] = useState<string | null>(null);

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
      const j = await cachedFetch<{ items?: CrmContact[]; error?: string }>(
        url.toString()
      );
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
        const [c, t, cf, rt] = await Promise.all([
          cachedFetch<{ items?: CrmCompany[] }>(
            `/api/crm/companies?workspace_id=${workspaceId}&limit=500`
          ),
          cachedFetch<{ items?: CrmTag[] }>(
            `/api/crm/tags?workspace_id=${workspaceId}`
          ),
          cachedFetch<{ items?: CrmCustomField[] }>(
            `/api/crm/custom-fields?workspace_id=${workspaceId}&record_type=contact`
          ),
          cachedFetch<{
            items?: { record_id: string; tag_id: string }[];
          }>(
            `/api/crm/record-tags?workspace_id=${workspaceId}&record_type=contact`
          ).catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;
        const map = new Map<string, CrmCompany>();
        (c.items ?? []).forEach((co) => map.set(co.id, co));
        setCompanies(map);
        setTags(t.items ?? []);
        setCustomFields(cf.items ?? []);
        const rtMap = new Map<string, string[]>();
        (rt.items ?? []).forEach((row) => {
          const arr = rtMap.get(row.record_id) || [];
          arr.push(row.tag_id);
          rtMap.set(row.record_id, arr);
        });
        setRecordTags(rtMap);
      } catch {
        /* lookup failures are tolerated */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Apply tag filter on top of server-side rows.
  const visibleRows = useMemo(() => {
    if (tagFilter === "all") return rows;
    return rows.filter((r) => {
      const ids = recordTags.get(r.id) || [];
      return ids.includes(tagFilter);
    });
  }, [rows, recordTags, tagFilter]);

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
      invalidate({ prefix: `/api/crm/contacts?workspace_id=${workspaceId}` });
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

  // ── CSV export ────────────────────────────────────────────────────────
  const exportCsv = () => {
    const headers = [
      "first_name",
      "last_name",
      "email",
      "phone",
      "job_title",
      "company",
      "notes",
    ];
    const escape = (v: string) =>
      v.includes(",") || v.includes('"') || v.includes("\n")
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    const lines = [headers.join(",")];
    rows.forEach((r) => {
      const co = r.company_id ? companies.get(r.company_id) : null;
      lines.push(
        [
          r.first_name ?? "",
          r.last_name ?? "",
          r.email ?? "",
          r.phone ?? "",
          r.job_title ?? "",
          co?.name ?? "",
          r.notes ?? "",
        ]
          .map(escape)
          .join(",")
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── CSV import (RFC 4180-ish) ─────────────────────────────────────────
  const importCsv = async (file: File) => {
    setImportBusy(true);
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length < 2) {
        throw new Error("CSV must have a header and at least one row.");
      }
      const headers = parsed[0].map((h) => h.trim().toLowerCase());
      const idx = (k: string) => headers.indexOf(k);
      const created: CrmContact[] = [];
      for (const row of parsed.slice(1)) {
        const body: Record<string, string | null> = {
          workspace_id: workspaceId,
          first_name: idx("first_name") >= 0 ? row[idx("first_name")] || null : null,
          last_name: idx("last_name") >= 0 ? row[idx("last_name")] || null : null,
          email: idx("email") >= 0 ? row[idx("email")] || null : null,
          phone: idx("phone") >= 0 ? row[idx("phone")] || null : null,
          job_title:
            idx("job_title") >= 0
              ? row[idx("job_title")] || null
              : idx("title") >= 0
              ? row[idx("title")] || null
              : null,
          notes: idx("notes") >= 0 ? row[idx("notes")] || null : null,
        };
        // skip blank rows
        if (
          !body.first_name &&
          !body.last_name &&
          !body.email &&
          !body.phone
        ) {
          continue;
        }
        try {
          const res = await fetch("/api/crm/contacts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const j = (await res.json()) as { item?: CrmContact };
          if (res.ok && j.item) created.push(j.item);
        } catch {
          /* skip row, continue */
        }
      }
      setRows((prev) => [...created, ...prev]);
      invalidate({ prefix: `/api/crm/contacts?workspace_id=${workspaceId}` });
      if (typeof window !== "undefined") {
        window.alert(`Imported ${created.length} contact(s).`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImportBusy(false);
    }
  };

  // ── Merge exact duplicates (same email) ──────────────────────────────
  const mergeDuplicates = async () => {
    const byEmail = new Map<string, CrmContact[]>();
    rows.forEach((r) => {
      const key = (r.email || "").trim().toLowerCase();
      if (!key) return;
      const arr = byEmail.get(key) || [];
      arr.push(r);
      byEmail.set(key, arr);
    });
    const groups = Array.from(byEmail.values()).filter((g) => g.length > 1);
    if (groups.length === 0) {
      setMergeReport("No exact-email duplicates found.");
      return;
    }
    const total = groups.reduce((sum, g) => sum + g.length - 1, 0);
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Found ${groups.length} duplicate group(s) (${total} extra records). Merge into the oldest contact in each group?`
      )
    ) {
      return;
    }
    let mergedCount = 0;
    for (const group of groups) {
      // Keep the oldest (lowest created_at) as the canonical record; absorb
      // notes/job_title/phone from extras when blank, then delete extras.
      const sorted = [...group].sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      );
      const keeper = sorted[0];
      const extras = sorted.slice(1);
      const patch: Record<string, string | null> = {};
      for (const ex of extras) {
        if (!keeper.first_name && ex.first_name)
          patch.first_name = ex.first_name;
        if (!keeper.last_name && ex.last_name) patch.last_name = ex.last_name;
        if (!keeper.phone && ex.phone) patch.phone = ex.phone;
        if (!keeper.job_title && ex.job_title) patch.job_title = ex.job_title;
        if (ex.notes) {
          patch.notes = [keeper.notes, ex.notes]
            .filter(Boolean)
            .join("\n---\n");
        }
      }
      try {
        if (Object.keys(patch).length > 0) {
          await fetch(`/api/crm/contacts/${keeper.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
        }
        for (const ex of extras) {
          await fetch(`/api/crm/contacts/${ex.id}`, { method: "DELETE" });
          mergedCount++;
        }
      } catch {
        /* skip on error */
      }
    }
    invalidate({ prefix: `/api/crm/contacts?workspace_id=${workspaceId}` });
    void load();
    setMergeReport(
      `Merged ${mergedCount} duplicate(s) across ${groups.length} group(s).`
    );
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
        invalidate({ prefix: `/api/crm/contacts?workspace_id=${workspaceId}` });
      } catch (e) {
        setError((e as Error).message);
      }
    }
  };

  const active = activeId ? rows.find((r) => r.id === activeId) ?? null : null;

  return (
    <>
      <RecordTable<CrmContact>
        rows={visibleRows}
        columns={columns}
        loading={loading}
        workspaceLabel={workspaceLabel}
        title="Contacts"
        subtitle={`${visibleRows.length} of ${rows.length} ${rows.length === 1 ? "contact" : "contacts"}`}
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
              invalidate({ prefix: `/api/crm/contacts?workspace_id=${workspaceId}` });
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
          <>
            <div className="flex flex-wrap items-center gap-1.5 border-b border-app bg-app-elevated px-3 py-1.5">
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="h-7 rounded-md border border-app bg-app px-2 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary focus:border-tool-accent focus:outline-none"
              >
                <option value="all">All tags</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
                {tags.length} tag{tags.length === 1 ? "" : "s"}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <label className="cursor-pointer rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent">
                  {importBusy ? "Importing…" : "Import CSV"}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    disabled={importBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void importCsv(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={exportCsv}
                  className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => void mergeDuplicates()}
                  className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                >
                  Merge dupes
                </button>
              </div>
            </div>
            {mergeReport && (
              <div className="flex items-center gap-2 border-b border-app bg-tool-accent-soft px-3 py-1.5">
                <span className="font-mono text-[0.6rem] text-tool-accent">
                  {mergeReport}
                </span>
                <button
                  type="button"
                  onClick={() => setMergeReport(null)}
                  className="ml-auto text-[0.7rem] text-tool-accent hover:opacity-70"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            )}
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
          </>
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
