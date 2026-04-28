"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * CompaniesView — table of CRM companies with click-through counts.
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CrmCompany,
  CrmContact,
  CrmCustomField,
  CrmDeal,
  CrmTag,
} from "../types";
import { cachedFetch, invalidate } from "@/lib/cache/swr";
import RecordDetail from "./RecordDetail";
import { RecordTable, type RecordColumn } from "./RecordTable";
import { useSectionLabel } from "./useSectionLabel";
import { Avatar, CountPill } from "./_records/Chips";
import {
  companyDisplayName,
  readCustom,
  relativeTime,
  renderCustomValue,
} from "./_records/helpers";
import { RecIcon } from "./_records/Icon";

interface Props {
  workspaceId: string;
  workspaceLabel: string;
  width: number;
  openApp?: (slug: string, params?: Record<string, unknown>) => void;
}

export default function CompaniesView({
  workspaceId,
  workspaceLabel,
  width,
  openApp,
}: Props) {
  // Resolves to "Developers" when the real-estate template is applied,
  // otherwise the default "Companies". Singular/plural derived inline so
  // the count subtitle still reads naturally under the override.
  const sectionLabel = useSectionLabel("companies", "Companies");
  const itemNoun = sectionLabel.toLowerCase() === "developers" ? "developer" : "company";
  const itemNounPlural = sectionLabel.toLowerCase();
  const [rows, setRows] = useState<CrmCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [, setTags] = useState<CrmTag[]>([]);
  const [customFields, setCustomFields] = useState<CrmCustomField[]>([]);
  const [contactCounts, setContactCounts] = useState<Map<string, number>>(
    new Map()
  );
  const [dealCounts, setDealCounts] = useState<Map<string, number>>(new Map());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [qaName, setQaName] = useState("");
  const [qaDomain, setQaDomain] = useState("");
  const [qaBusy, setQaBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("crm_companies_q");
    if (q) setSearch(q);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (debounced) sp.set("crm_companies_q", debounced);
    else sp.delete("crm_companies_q");
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}?${sp.toString()}${window.location.hash}`
    );
  }, [debounced]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/crm/companies", window.location.origin);
      url.searchParams.set("workspace_id", workspaceId);
      if (debounced) url.searchParams.set("search", debounced);
      url.searchParams.set("limit", "200");
      const j = await cachedFetch<{ items?: CrmCompany[]; error?: string }>(
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

  // Tags + custom fields + counts.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [t, cf, contactsAll, dealsAll] = await Promise.all([
          cachedFetch<{ items?: CrmTag[] }>(
            `/api/crm/tags?workspace_id=${workspaceId}`
          ),
          cachedFetch<{ items?: CrmCustomField[] }>(
            `/api/crm/custom-fields?workspace_id=${workspaceId}&record_type=company`
          ),
          cachedFetch<{ items?: CrmContact[] }>(
            `/api/crm/contacts?workspace_id=${workspaceId}&limit=1000`
          ),
          cachedFetch<{ items?: CrmDeal[] }>(
            `/api/crm/deals?workspace_id=${workspaceId}&limit=1000`
          ),
        ]);
        if (cancelled) return;
        setTags(t.items ?? []);
        setCustomFields(cf.items ?? []);
        const cMap = new Map<string, number>();
        (contactsAll.items ?? []).forEach((c) => {
          if (c.company_id) cMap.set(c.company_id, (cMap.get(c.company_id) ?? 0) + 1);
        });
        setContactCounts(cMap);
        const dMap = new Map<string, number>();
        (dealsAll.items ?? []).forEach((d) => {
          if (d.company_id) dMap.set(d.company_id, (dMap.get(d.company_id) ?? 0) + 1);
        });
        setDealCounts(dMap);
      } catch {
        /* tolerate lookup failure */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const columns: RecordColumn<CrmCompany>[] = useMemo(() => {
    const base: RecordColumn<CrmCompany>[] = [
      {
        key: "name",
        label: "Name",
        sortable: true,
        sortAccessor: (r) => r.name.toLowerCase(),
        render: (r) => (
          <span className="inline-flex items-center gap-2">
            <Avatar name={r.name} size={22} />
            <span className="truncate text-app">{companyDisplayName(r)}</span>
          </span>
        ),
        width: 220,
      },
      {
        key: "domain",
        label: "Domain",
        sortable: true,
        sortAccessor: (r) => (r.domain ?? "").toLowerCase(),
        render: (r) =>
          r.domain ? (
            <a
              href={`https://${r.domain.replace(/^https?:\/\//, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 truncate text-tool-accent hover:underline"
            >
              {r.domain}
              <RecIcon name="external" size={10} />
            </a>
          ) : (
            <span className="text-faint">—</span>
          ),
        width: 180,
      },
      {
        key: "industry",
        label: "Industry",
        sortable: true,
        sortAccessor: (r) => (r.industry ?? "").toLowerCase(),
        render: (r) =>
          r.industry ? (
            <span className="text-secondary">{r.industry}</span>
          ) : (
            <span className="text-faint">—</span>
          ),
        width: 140,
        hideOnNarrow: true,
      },
      {
        key: "size",
        label: "Size",
        render: (r) =>
          r.size ? (
            <span className="text-secondary">{r.size}</span>
          ) : (
            <span className="text-faint">—</span>
          ),
        width: 80,
        hideOnNarrow: true,
      },
      {
        key: "city_country",
        label: "Location",
        render: (r) => {
          const loc = [r.city, r.country].filter(Boolean).join(", ");
          return loc ? (
            <span className="text-secondary">{loc}</span>
          ) : (
            <span className="text-faint">—</span>
          );
        },
        width: 140,
        hideOnNarrow: true,
      },
      {
        key: "contacts",
        label: "Contacts",
        render: (r) => (
          <CountPill
            count={contactCounts.get(r.id) ?? 0}
            label="ppl"
            onClick={() => setActiveId(r.id)}
          />
        ),
        width: 90,
      },
      {
        key: "deals",
        label: "Deals",
        render: (r) => (
          <CountPill
            count={dealCounts.get(r.id) ?? 0}
            label="deals"
            onClick={() => setActiveId(r.id)}
          />
        ),
        width: 90,
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
    ];

    const customCols: RecordColumn<CrmCompany>[] = customFields.map((f) => ({
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
  }, [contactCounts, dealCounts, customFields]);

  const handleQuickAdd = async () => {
    if (!qaName.trim()) return;
    setQaBusy(true);
    try {
      const res = await fetch("/api/crm/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          name: qaName.trim(),
          domain: qaDomain.trim() || null,
        }),
      });
      const j = (await res.json()) as { item?: CrmCompany; error?: string };
      if (!res.ok || !j.item) throw new Error(j.error ?? "Create failed");
      setRows((prev) => [j.item as CrmCompany, ...prev]);
      invalidate({ prefix: `/api/crm/companies?workspace_id=${workspaceId}` });
      setQaName("");
      setQaDomain("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setQaBusy(false);
    }
  };

  const handleBulk = async (key: string, ids: string[]) => {
    if (key === "delete") {
      if (!confirm(`Delete ${ids.length} compan${ids.length === 1 ? "y" : "ies"}?`))
        return;
      try {
        await Promise.all(
          ids.map((id) =>
            fetch(`/api/crm/companies/${id}`, { method: "DELETE" })
          )
        );
        setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
        invalidate({ prefix: `/api/crm/companies?workspace_id=${workspaceId}` });
        setSelectedIds([]);
      } catch (e) {
        setError((e as Error).message);
      }
    }
  };

  const active = activeId ? rows.find((r) => r.id === activeId) ?? null : null;

  return (
    <>
      <RecordTable<CrmCompany>
        rows={rows}
        columns={columns}
        loading={loading}
        workspaceLabel={workspaceLabel}
        title={sectionLabel}
        subtitle={`${rows.length} ${rows.length === 1 ? itemNoun : itemNounPlural}`}
        newLabel="New company"
        onNew={() => setQaName("New company")}
        search={search}
        onSearchChange={setSearch}
        onRowClick={(r) => setActiveId(r.id)}
        rowActions={(r) => [
          { key: "open", label: "Open", onClick: () => setActiveId(r.id) },
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
              if (!confirm("Delete this company?")) return;
              await fetch(`/api/crm/companies/${r.id}`, { method: "DELETE" });
              setRows((prev) => prev.filter((x) => x.id !== r.id));
              invalidate({ prefix: `/api/crm/companies?workspace_id=${workspaceId}` });
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
          <EmptyCompanies error={error} onRetry={() => void load()} />
        }
        width={width}
        quickAdd={
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-3 py-2">
            <input
              value={qaName}
              onChange={(e) => setQaName(e.target.value)}
              placeholder="Company name"
              className="h-8 flex-[2] min-w-[160px] rounded-md border border-app bg-app-elevated px-2 text-xs text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
            />
            <input
              value={qaDomain}
              onChange={(e) => setQaDomain(e.target.value)}
              placeholder="domain.com"
              className="h-8 flex-1 min-w-[140px] rounded-md border border-app bg-app-elevated px-2 text-xs text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
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
          kind="company"
          record={active}
          workspaceId={workspaceId}
          customFields={customFields}
          hostWidth={width}
          openApp={openApp}
          onClose={() => setActiveId(null)}
          onUpdated={(next) => {
            setRows((prev) =>
              prev.map((r) =>
                r.id === next.id ? (next as CrmCompany) : r
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

function EmptyCompanies({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-red-500/40 bg-red-500/5 p-6 text-center">
        <h3 className="text-sm font-semibold text-red-500">
          Could not load companies
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
      <h3 className="text-sm font-semibold text-app">No companies yet</h3>
      <p className="mt-1 text-xs text-secondary">
        Quick-add a company name above. Domains and contacts can come later.
      </p>
    </div>
  );
}
