"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * DealsListView — sortable table of deals across all pipelines.
 *
 * Top toolbar
 *   - Search input (?search=)
 *   - Pipeline filter (all / specific)
 *   - Status filter (open / won / lost)
 *   - Layout toggle (Table ↔ Kanban — flipping to Kanban hands off to
 *     PipelineView via a parent setSection signal; v1 just toggles a
 *     local message so the user knows where to go.)
 *   - + New deal
 *
 * Columns: name, stage, amount, close date, owner, assignees, last
 * activity (relative). Bulk-select drives bulk: assign / move stage /
 * delete (delete is the most useful for v1).
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspaces/client";
import type {
  CrmCompany,
  CrmContact,
  CrmDeal,
  CrmDealStatus,
  CrmPipelineStage,
  CrmPipelineWithStages,
} from "../types";
import { DEAL_STATUS_VALUES } from "../types";
import DealDetail from "./DealDetail";
import DealDialog from "./_kanban/DealDialog";
import {
  formatCloseDate,
  formatDealAmount,
} from "./_kanban/helpers";
import {
  Avatar,
  Button,
  Icon,
  Select,
  StagePill,
  TextInput,
  ToastHost,
  useToast,
} from "./_kanban/ui";
import { relativeTime } from "./_records/helpers";

interface Props {
  width: number;
  search: string;
  onSearchChange: (v: string) => void;
  goToPipeline: () => void;
}

type SortKey = "name" | "amount" | "close_date" | "updated_at";

export default function DealsListView(props: Props) {
  return (
    <ToastHost>
      <DealsListViewInner {...props} />
    </ToastHost>
  );
}

function DealsListViewInner({
  width,
  search,
  onSearchChange,
  goToPipeline,
}: Props) {
  const { current, signedIn } = useWorkspace();
  const workspaceId = current.kind === "team" ? current.id : null;
  const role = current.kind === "team" ? current.role : null;
  const isAdmin = role === "owner" || role === "admin";
  const toast = useToast();

  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [pipelines, setPipelines] = useState<CrmPipelineWithStages[]>([]);
  const [contactsById, setContactsById] = useState<Map<string, CrmContact>>(new Map());
  const [companiesById, setCompaniesById] = useState<Map<string, CrmCompany>>(new Map());
  const [pipelineFilter, setPipelineFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<CrmDealStatus | "">("");
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const compact = width < 720;

  // Load pipelines.
  useEffect(() => {
    if (!workspaceId) {
      setPipelines([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/crm/pipelines?workspace_id=${workspaceId}`);
        if (!res.ok) return;
        const json = (await res.json()) as { items: CrmPipelineWithStages[] };
        if (!cancelled) setPipelines(json.items);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const stagesById = useMemo(() => {
    const m = new Map<string, CrmPipelineStage>();
    for (const p of pipelines) for (const s of p.stages) m.set(s.id, s);
    return m;
  }, [pipelines]);

  // Load deals.
  const load = useCallback(async () => {
    if (!workspaceId) {
      setDeals([]);
      return;
    }
    setLoading(true);
    try {
      const url = new URL("/api/crm/deals", window.location.origin);
      url.searchParams.set("workspace_id", workspaceId);
      if (pipelineFilter) url.searchParams.set("pipeline_id", pipelineFilter);
      if (statusFilter) url.searchParams.set("status", statusFilter);
      if (search.trim()) url.searchParams.set("search", search.trim());
      url.searchParams.set("limit", "500");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("failed to load deals");
      const json = (await res.json()) as { items: CrmDeal[] };
      setDeals(json.items);

      // Hydrate referenced contacts/companies.
      const contactIds = new Set<string>();
      const companyIds = new Set<string>();
      for (const d of json.items) {
        if (d.primary_contact_id) contactIds.add(d.primary_contact_id);
        if (d.company_id) companyIds.add(d.company_id);
      }
      const [cMap, coMap] = await Promise.all([
        contactIds.size > 0
          ? fetch(`/api/crm/contacts?workspace_id=${workspaceId}&limit=500`)
              .then((r) => r.json() as Promise<{ items: CrmContact[] }>)
              .then((j) => {
                const m = new Map<string, CrmContact>();
                for (const c of j.items) if (contactIds.has(c.id)) m.set(c.id, c);
                return m;
              })
              .catch(() => new Map<string, CrmContact>())
          : Promise.resolve(new Map<string, CrmContact>()),
        companyIds.size > 0
          ? fetch(`/api/crm/companies?workspace_id=${workspaceId}&limit=500`)
              .then((r) => r.json() as Promise<{ items: CrmCompany[] }>)
              .then((j) => {
                const m = new Map<string, CrmCompany>();
                for (const c of j.items) if (companyIds.has(c.id)) m.set(c.id, c);
                return m;
              })
              .catch(() => new Map<string, CrmCompany>())
          : Promise.resolve(new Map<string, CrmCompany>()),
      ]);
      setContactsById(cMap);
      setCompaniesById(coMap);
    } catch (err) {
      toast.push("error", (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, pipelineFilter, statusFilter, search, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSelect = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    if (checked) setSelected(new Set(deals.map((d) => d.id)));
    else setSelected(new Set());
  };

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "updated_at" || key === "amount" ? "desc" : "asc");
    }
  };

  const sortedDeals = useMemo(() => {
    const list = [...deals];
    list.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
    return list;
  }, [deals, sortKey, sortDir]);

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete ${selected.size} deal(s)? This can't be undone.`)
    ) {
      return;
    }
    const ids = Array.from(selected);
    const prev = deals;
    setDeals((cur) => cur.filter((d) => !selected.has(d.id)));
    setSelected(new Set());
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/crm/deals/${id}`, { method: "DELETE" }).then((r) => r.ok)
        )
      );
      const failed = results.filter((ok) => !ok).length;
      if (failed > 0) {
        toast.push("error", `${failed} delete(s) failed — reloading`);
        setDeals(prev);
        void load();
      } else {
        toast.push("success", `Deleted ${ids.length} deal(s)`);
      }
    } catch (err) {
      setDeals(prev);
      toast.push("error", (err as Error).message);
    }
  };

  const handleCreated = (deal: CrmDeal) => {
    setDeals((cur) => [deal, ...cur]);
    setActiveDealId(deal.id);
  };

  if (!signedIn || !workspaceId) {
    return (
      <EmptyPane
        title={signedIn ? "Pick a team workspace" : "Sign in"}
        body={
          signedIn
            ? "Personal workspaces don't sync to the CRM."
            : "Sign in to load deals."
        }
      />
    );
  }

  const defaultPipeline =
    pipelines.find((p) => p.is_default) ?? pipelines[0] ?? null;

  return (
    <div className="flex h-full flex-col bg-app text-app">
      {/* top bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-app bg-app px-3 py-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint">
            <Icon name="search" size={12} />
          </span>
          <TextInput
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search deals…"
            className="pl-7"
            style={{ width: 220 }}
          />
        </div>

        <Select
          value={pipelineFilter}
          onChange={(e) => setPipelineFilter(e.target.value)}
          className="min-w-[140px]"
        >
          <option value="">All pipelines</option>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>

        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CrmDealStatus | "")}
          className="min-w-[120px]"
        >
          <option value="">All status</option>
          {DEAL_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={goToPipeline}
            className="inline-flex items-center gap-1.5 rounded-md border border-app bg-app-elevated px-2 py-1 text-xs text-secondary hover:bg-surface hover:text-app"
            title="Switch to kanban view"
          >
            <Icon name="kanban" size={12} />
            Kanban
          </button>
          <Button
            variant="primary"
            onClick={() => setDialogOpen(true)}
            disabled={!defaultPipeline}
          >
            <Icon name="plus" size={12} />
            New deal
          </Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between border-b border-app bg-tool-accent-soft px-3 py-2 text-xs text-tool-accent">
          <span>{selected.size} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={handleBulkDelete}
              disabled={!isAdmin}
            >
              <Icon name="trash" size={12} />
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* table */}
      <div className="flex-1 overflow-auto">
        {loading && deals.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted">
            Loading…
          </div>
        ) : sortedDeals.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted">
            No deals match your filters.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-app bg-app text-left">
              <tr className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={
                      selected.size > 0 && selected.size === deals.length
                    }
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Select all"
                  />
                </th>
                <SortHeader
                  k="name"
                  label="Name"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <th className="px-3 py-2">Stage</th>
                <SortHeader
                  k="amount"
                  label="Amount"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  align="right"
                />
                <SortHeader
                  k="close_date"
                  label="Close"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                {!compact && <th className="px-3 py-2">Owner</th>}
                {!compact && <th className="px-3 py-2">Assignees</th>}
                <SortHeader
                  k="updated_at"
                  label="Updated"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
              </tr>
            </thead>
            <tbody>
              {sortedDeals.map((deal) => {
                const stage = stagesById.get(deal.stage_id);
                const company = deal.company_id
                  ? companiesById.get(deal.company_id) ?? null
                  : null;
                const contact = deal.primary_contact_id
                  ? contactsById.get(deal.primary_contact_id) ?? null
                  : null;
                const closePhrase = formatCloseDate(deal.close_date);
                const closeColor =
                  deal.close_date && closePhrase.includes("overdue")
                    ? "text-red-400"
                    : "text-secondary";
                return (
                  <tr
                    key={deal.id}
                    onClick={() => setActiveDealId(deal.id)}
                    className="cursor-pointer border-b border-app hover:bg-surface"
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(deal.id)}
                        onChange={() => toggleSelect(deal.id)}
                        aria-label={`Select ${deal.name}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span className="text-app">{deal.name}</span>
                        {(contact || company) && (
                          <span className="text-[0.7rem] text-muted">
                            {contact
                              ? [contact.first_name, contact.last_name]
                                  .filter(Boolean)
                                  .join(" ")
                                  .trim() || contact.email
                              : ""}
                            {contact && company ? " · " : ""}
                            {company?.name ?? ""}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {stage ? (
                        <StagePill
                          name={stage.name}
                          color={stage.color}
                          kind={stage.kind}
                        />
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-tool-accent">
                      {formatDealAmount(deal.amount, deal.currency)}
                    </td>
                    <td className={`px-3 py-2 text-xs ${closeColor}`}>
                      {closePhrase}
                    </td>
                    {!compact && (
                      <td className="px-3 py-2 font-mono text-[0.7rem] text-secondary">
                        {deal.owner_id ? deal.owner_id.slice(0, 8) : "—"}
                      </td>
                    )}
                    {!compact && (
                      <td className="px-3 py-2">
                        {deal.assignee_ids.length > 0 ? (
                          <div className="flex -space-x-1">
                            {deal.assignee_ids.slice(0, 3).map((id) => (
                              <Avatar key={id} label={id.slice(0, 2)} size={18} />
                            ))}
                            {deal.assignee_ids.length > 3 && (
                              <span className="inline-flex h-[18px] items-center justify-center rounded-full border border-app bg-app px-1.5 font-mono text-[0.55rem] text-faint">
                                +{deal.assignee_ids.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 font-mono text-[0.7rem] text-faint">
                      {relativeTime(deal.updated_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {dialogOpen && defaultPipeline && (
        <DealDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          workspaceId={workspaceId}
          pipelineId={defaultPipeline.id}
          stages={defaultPipeline.stages}
          onCreated={handleCreated}
        />
      )}
      {activeDealId && (
        <DealDetail
          dealId={activeDealId}
          workspaceId={workspaceId}
          pipelines={pipelines}
          isAdmin={isAdmin}
          width={width}
          onClose={() => setActiveDealId(null)}
          onChanged={(d) => setDeals((cur) => cur.map((x) => (x.id === d.id ? d : x)))}
          onDeleted={(id) => {
            setDeals((cur) => cur.filter((d) => d.id !== id));
            setActiveDealId(null);
          }}
        />
      )}
    </div>
  );
}

function SortHeader({
  k,
  label,
  sortKey,
  sortDir,
  onSort,
  align = "left",
}: {
  k: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
  return (
    <th className="px-3 py-2">
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 ${
          align === "right" ? "ml-auto" : ""
        } ${active ? "text-tool-accent" : "text-faint hover:text-app"}`}
      >
        {label}
        {active && (
          <Icon
            name={sortDir === "asc" ? "chevronUp" : "chevronDown"}
            size={10}
          />
        )}
      </button>
    </th>
  );
}

function EmptyPane({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-app p-6">
      <div className="w-full max-w-md rounded-xl border border-app bg-app-elevated p-6">
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
          crm.deals
        </div>
        <h2 className="mt-2 text-lg font-semibold text-app">{title}</h2>
        <p className="mt-2 text-sm text-secondary">{body}</p>
      </div>
    </div>
  );
}
