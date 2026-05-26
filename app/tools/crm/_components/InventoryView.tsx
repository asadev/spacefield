"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * InventoryView — table + card-grid for CRM inventory items.
 * Bulk ops: change status, change category, set tags (delete also).
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CrmCustomField,
  CrmInventoryItem,
  CrmInventoryStatus,
  CrmTag,
} from "../types";
import { cachedFetch, invalidate } from "@/lib/cache/swr";
import RecordDetail from "./RecordDetail";
import { RecordTable, type RecordColumn } from "./RecordTable";
import { useSectionLabel } from "./useSectionLabel";
import { InventoryStatusPill } from "./_records/Chips";
import SendViaWhatsAppButton from "@/components/inventory/SendViaWhatsAppButton";
import InventoryWhatsAppComposer, {
  type ComposerItem,
} from "@/components/inventory/InventoryWhatsAppComposer";
import {
  formatCurrency,
  formatNumber,
  inventoryDisplayName,
  readCustom,
  relativeTime,
  renderCustomValue,
} from "./_records/helpers";
import { RecIcon } from "./_records/Icon";

/**
 * Convert a CRM inventory row into the shape the WhatsApp composer
 * wants. Strips internal fields the composer doesn't need and resolves
 * the optional image URL (image_id → /api/files/.../download, when
 * present). The composer is fine with a null image — it shows a
 * placeholder.
 */
function toComposerItem(r: CrmInventoryItem) {
  const customRecord =
    r.custom && typeof r.custom === "object"
      ? (r.custom as Record<string, unknown>)
      : null;
  return {
    id: r.id,
    sku: r.sku,
    name: r.name,
    category: r.category,
    description: r.description,
    price: r.price,
    currency: r.currency,
    quantity: r.quantity,
    unit: r.unit,
    image_url: r.image_id
      ? `/api/files/download?id=${encodeURIComponent(r.image_id)}`
      : null,
    image_id: r.image_id,
    custom: customRecord,
  };
}

interface Props {
  workspaceId: string;
  workspaceLabel: string;
  width: number;
  openApp?: (slug: string, params?: Record<string, unknown>) => void;
}

export default function InventoryView({
  workspaceId,
  workspaceLabel,
  width,
  openApp,
}: Props) {
  // Resolves to "Properties" when the real-estate template is applied;
  // otherwise the default "Inventory". Plural form derived from the same
  // override so the count subtitle reads naturally.
  const sectionLabel = useSectionLabel("inventory", "Inventory");
  const itemNoun = sectionLabel.toLowerCase() === "properties" ? "property" : "item";
  const itemNounPlural = sectionLabel.toLowerCase() === "properties" ? "properties" : "items";
  const [rows, setRows] = useState<CrmInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [, setTags] = useState<CrmTag[]>([]);
  const [customFields, setCustomFields] = useState<CrmCustomField[]>([]);
  const [statusFilter, setStatusFilter] = useState<CrmInventoryStatus | "">("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // WhatsApp composer state — pop the modal for the picked item id when
  // the row-action menu's "Send via WhatsApp" entry fires. We don't
  // mount the SendViaWhatsAppButton in the action menu directly (the
  // menu only supports onClick handlers, not arbitrary nodes).
  const [waItemId, setWaItemId] = useState<string | null>(null);

  const [qaName, setQaName] = useState("");
  const [qaSku, setQaSku] = useState("");
  const [qaPrice, setQaPrice] = useState("");
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
    const q = sp.get("crm_inventory_q");
    if (q) setSearch(q);
    const s = sp.get("crm_inventory_status");
    if (s === "active" || s === "inactive" || s === "archived") {
      setStatusFilter(s);
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (debounced) sp.set("crm_inventory_q", debounced);
    else sp.delete("crm_inventory_q");
    if (statusFilter) sp.set("crm_inventory_status", statusFilter);
    else sp.delete("crm_inventory_status");
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}?${sp.toString()}${window.location.hash}`
    );
  }, [debounced, statusFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/crm/inventory", window.location.origin);
      url.searchParams.set("workspace_id", workspaceId);
      if (debounced) url.searchParams.set("search", debounced);
      if (statusFilter) url.searchParams.set("status", statusFilter);
      url.searchParams.set("limit", "200");
      const j = await cachedFetch<{
        items?: CrmInventoryItem[];
        error?: string;
      }>(url.toString());
      setRows(j.items ?? []);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, debounced, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [t, cf] = await Promise.all([
          cachedFetch<{ items?: CrmTag[] }>(
            `/api/crm/tags?workspace_id=${workspaceId}`
          ),
          cachedFetch<{ items?: CrmCustomField[] }>(
            `/api/crm/custom-fields?workspace_id=${workspaceId}&record_type=inventory`
          ),
        ]);
        if (cancelled) return;
        setTags(t.items ?? []);
        setCustomFields(cf.items ?? []);
      } catch {
        /* tolerate */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const columns: RecordColumn<CrmInventoryItem>[] = useMemo(() => {
    const base: RecordColumn<CrmInventoryItem>[] = [
      {
        key: "image",
        label: "",
        render: () => (
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-app bg-app-elevated text-tool-accent"
            aria-hidden="true"
          >
            <RecIcon name="layers" size={14} />
          </span>
        ),
        width: 48,
      },
      {
        key: "sku",
        label: "SKU",
        sortable: true,
        sortAccessor: (r) => (r.sku ?? "").toLowerCase(),
        render: (r) =>
          r.sku ? (
            <span className="font-mono text-[0.7rem] text-secondary">
              {r.sku}
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
        width: 110,
      },
      {
        key: "name",
        label: "Name",
        sortable: true,
        sortAccessor: (r) => r.name.toLowerCase(),
        render: (r) => (
          <span className="truncate text-app">{inventoryDisplayName(r)}</span>
        ),
        width: 220,
      },
      {
        key: "category",
        label: "Category",
        sortable: true,
        sortAccessor: (r) => (r.category ?? "").toLowerCase(),
        render: (r) =>
          r.category ? (
            <span className="text-secondary">{r.category}</span>
          ) : (
            <span className="text-faint">—</span>
          ),
        width: 140,
        hideOnNarrow: true,
      },
      {
        key: "price",
        label: "Price",
        sortable: true,
        sortAccessor: (r) => r.price ?? -Infinity,
        align: "right",
        render: (r) => (
          <span className="font-mono tabular-nums text-app">
            {formatCurrency(r.price, r.currency)}
          </span>
        ),
        width: 110,
      },
      {
        key: "quantity",
        label: "Qty",
        sortable: true,
        sortAccessor: (r) => r.quantity ?? -Infinity,
        align: "right",
        render: (r) => (
          <span className="font-mono tabular-nums text-secondary">
            {formatNumber(r.quantity)}
            {r.unit ? <span className="ml-1 text-faint">{r.unit}</span> : null}
          </span>
        ),
        width: 90,
        hideOnNarrow: true,
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        sortAccessor: (r) => r.status,
        render: (r) => <InventoryStatusPill status={r.status} />,
        width: 100,
      },
      {
        key: "updated_at",
        label: "Updated",
        sortable: true,
        sortAccessor: (r) => r.updated_at,
        render: (r) => (
          <span className="font-mono text-[0.65rem] text-secondary">
            {relativeTime(r.updated_at)}
          </span>
        ),
        width: 100,
        hideOnNarrow: true,
      },
    ];
    const customCols: RecordColumn<CrmInventoryItem>[] = customFields.map(
      (f) => ({
        key: `cf_${f.key}`,
        label: f.label,
        render: (r) => (
          <span className="truncate text-secondary">
            {renderCustomValue(f, readCustom(r.custom, f.key))}
          </span>
        ),
        hideOnNarrow: true,
        width: 140,
      })
    );
    return [...base, ...customCols];
  }, [customFields]);

  const handleQuickAdd = async () => {
    if (!qaName.trim()) return;
    setQaBusy(true);
    try {
      const priceNum = qaPrice ? Number(qaPrice) : null;
      const res = await fetch("/api/crm/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          name: qaName.trim(),
          sku: qaSku.trim() || null,
          price: priceNum !== null && Number.isNaN(priceNum) ? null : priceNum,
        }),
      });
      const j = (await res.json()) as {
        item?: CrmInventoryItem;
        error?: string;
      };
      if (!res.ok || !j.item) throw new Error(j.error ?? "Create failed");
      setRows((prev) => [j.item as CrmInventoryItem, ...prev]);
      invalidate({ prefix: `/api/crm/inventory?workspace_id=${workspaceId}` });
      setQaName("");
      setQaSku("");
      setQaPrice("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setQaBusy(false);
    }
  };

  const handleBulk = async (key: string, ids: string[]) => {
    if (key.startsWith("status:")) {
      const next = key.split(":")[1] as CrmInventoryStatus;
      try {
        await Promise.all(
          ids.map((id) =>
            fetch(`/api/crm/inventory/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: next }),
            })
          )
        );
        setRows((prev) =>
          prev.map((r) =>
            ids.includes(r.id) ? { ...r, status: next } : r
          )
        );
        setSelectedIds([]);
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    if (key === "category") {
      const cat = prompt("Set category for selected items:");
      if (cat === null) return;
      try {
        await Promise.all(
          ids.map((id) =>
            fetch(`/api/crm/inventory/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ category: cat || null }),
            })
          )
        );
        setRows((prev) =>
          prev.map((r) =>
            ids.includes(r.id) ? { ...r, category: cat || null } : r
          )
        );
        setSelectedIds([]);
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    if (key === "delete") {
      if (!confirm(`Delete ${ids.length} item(s)?`)) return;
      try {
        await Promise.all(
          ids.map((id) =>
            fetch(`/api/crm/inventory/${id}`, { method: "DELETE" })
          )
        );
        setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
        setSelectedIds([]);
        invalidate({ prefix: `/api/crm/inventory?workspace_id=${workspaceId}` });
      } catch (e) {
        setError((e as Error).message);
      }
    }
  };

  const active = activeId ? rows.find((r) => r.id === activeId) ?? null : null;
  const waItem = waItemId ? rows.find((r) => r.id === waItemId) ?? null : null;

  return (
    <>
      <RecordTable<CrmInventoryItem>
        rows={rows}
        columns={columns}
        loading={loading}
        workspaceLabel={workspaceLabel}
        title={sectionLabel}
        subtitle={`${rows.length} ${rows.length === 1 ? itemNoun : itemNounPlural}`}
        newLabel="New item"
        onNew={() => setQaName("New item")}
        search={search}
        onSearchChange={setSearch}
        onRowClick={(r) => setActiveId(r.id)}
        rowActions={(r) => [
          { key: "open", label: "Open", onClick: () => setActiveId(r.id) },
          {
            key: "whatsapp",
            label: "Send via WhatsApp",
            onClick: () => setWaItemId(r.id),
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
              if (!confirm("Delete this item?")) return;
              await fetch(`/api/crm/inventory/${r.id}`, { method: "DELETE" });
              setRows((prev) => prev.filter((x) => x.id !== r.id));
              invalidate({ prefix: `/api/crm/inventory?workspace_id=${workspaceId}` });
            },
          },
        ]}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        bulkActions={[
          { key: "status:active", label: "Mark active" },
          { key: "status:inactive", label: "Mark inactive" },
          { key: "status:archived", label: "Archive" },
          { key: "category", label: "Set category…" },
          { key: "delete", label: "Delete selected", destructive: true },
        ]}
        onBulkAction={handleBulk}
        allowCards
        renderCard={(r) => (
          <div className="flex h-full flex-col">
            <div
              className="flex aspect-[4/3] items-center justify-center bg-surface text-faint"
              aria-hidden="true"
            >
              <RecIcon name="layers" size={32} />
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-faint">
                  {r.sku ?? "no-sku"}
                </span>
                <InventoryStatusPill status={r.status} />
              </div>
              <div className="truncate text-sm font-semibold text-app">
                {inventoryDisplayName(r)}
              </div>
              {r.category && (
                <div className="text-xs text-secondary">{r.category}</div>
              )}
              <div className="mt-auto flex items-end justify-between pt-2">
                <span className="font-mono text-base font-semibold tabular-nums text-app">
                  {formatCurrency(r.price, r.currency)}
                </span>
                {r.quantity !== null && (
                  <span className="font-mono text-[0.65rem] text-faint">
                    {formatNumber(r.quantity)} {r.unit ?? ""}
                  </span>
                )}
              </div>
              <div
                className="mt-2"
                onClick={(e) => e.stopPropagation()}
              >
                <SendViaWhatsAppButton
                  itemId={r.id}
                  workspaceId={workspaceId}
                  item={toComposerItem(r) as ComposerItem}
                  variant="compact"
                />
              </div>
            </div>
          </div>
        )}
        empty={<EmptyInventory error={error} onRetry={() => void load()} />}
        width={width}
        quickAdd={
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-3 py-2">
            <input
              value={qaName}
              onChange={(e) => setQaName(e.target.value)}
              placeholder="Item name"
              className="h-8 flex-[2] min-w-[160px] rounded-md border border-app bg-app-elevated px-2 text-xs text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
            />
            <input
              value={qaSku}
              onChange={(e) => setQaSku(e.target.value)}
              placeholder="SKU"
              className="h-8 flex-1 min-w-[100px] rounded-md border border-app bg-app-elevated px-2 text-xs text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
            />
            <input
              value={qaPrice}
              onChange={(e) => setQaPrice(e.target.value)}
              placeholder="Price"
              type="number"
              className="h-8 w-[100px] rounded-md border border-app bg-app-elevated px-2 text-xs text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
            />
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as CrmInventoryStatus | "")
              }
              className="h-8 rounded-md border border-app bg-app-elevated px-2 text-xs text-secondary"
              aria-label="Filter by status"
            >
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
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
          kind="inventory"
          record={active}
          workspaceId={workspaceId}
          customFields={customFields}
          hostWidth={width}
          openApp={openApp}
          onClose={() => setActiveId(null)}
          onUpdated={(next) => {
            setRows((prev) =>
              prev.map((r) =>
                r.id === next.id ? (next as CrmInventoryItem) : r
              )
            );
          }}
          onDeleted={(id) => {
            setRows((prev) => prev.filter((r) => r.id !== id));
            if (activeId === id) setActiveId(null);
          }}
        />
      )}
      {waItem && (
        <InventoryWhatsAppComposer
          itemId={waItem.id}
          workspaceId={workspaceId}
          item={toComposerItem(waItem) as ComposerItem}
          onClose={() => setWaItemId(null)}
        />
      )}
    </>
  );
}

function EmptyInventory({
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
          Could not load inventory
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
      <h3 className="text-sm font-semibold text-app">No inventory yet</h3>
      <p className="mt-1 text-xs text-secondary">
        Quick-add a name + SKU + price above to start cataloguing.
      </p>
    </div>
  );
}
