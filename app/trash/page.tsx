"use client";

/**
 * Universal recycle bin. Reads /api/trash for the active workspace and
 * surfaces restore + purge actions. Purge is admin/owner-only; the
 * server enforces this, the UI just hides the button when the caller's
 * role can't use it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useWorkspace } from "@/lib/workspaces/client";

interface TrashItem {
  entity_type: string;
  entity_id: string;
  label: string;
  workspace_id: string;
  deleted_at: string;
  deleted_by: string | null;
}

const ENTITY_LABEL: Record<string, string> = {
  crm_contact: "Contact",
  crm_lead: "Lead",
  crm_deal: "Deal",
  workspace_file: "File",
  comment: "Comment",
  task: "Task",
  project: "Project",
  employee: "Employee",
  employee_document: "Document",
};

export default function TrashPage() {
  const { current, signedIn, loading } = useWorkspace();
  const workspaceId = current.kind === "team" ? current.id : null;
  const role = current.kind === "team" ? current.role : null;
  const isAdmin = role === "admin" || role === "owner";

  const [items, setItems] = useState<TrashItem[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setItems([]);
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      const url = new URL("/api/trash", window.location.origin);
      url.searchParams.set("workspace_id", workspaceId);
      if (filter) url.searchParams.set("entity_type", filter);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `Failed (${res.status})`);
      }
      const json = (await res.json()) as { items?: TrashItem[] };
      setItems(json.items ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [workspaceId, filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const restore = useCallback(
    async (item: TrashItem) => {
      if (!workspaceId) return;
      setBusy(`${item.entity_type}:${item.entity_id}`);
      try {
        const res = await fetch("/api/trash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            entity_type: item.entity_type,
            entity_id: item.entity_id,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || `restore failed (${res.status})`);
        }
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [workspaceId, refresh]
  );

  const purge = useCallback(
    async (item: TrashItem) => {
      if (!workspaceId) return;
      if (
        !confirm(
          `Permanently delete "${item.label}"? This cannot be undone.`
        )
      ) {
        return;
      }
      setBusy(`${item.entity_type}:${item.entity_id}`);
      try {
        const res = await fetch("/api/trash", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            entity_type: item.entity_type,
            entity_id: item.entity_id,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || `purge failed (${res.status})`);
        }
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [workspaceId, refresh]
  );

  const entityTypeOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const i of items) seen.add(i.entity_type);
    return Array.from(seen);
  }, [items]);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10 text-sm text-muted">
        Loading workspace…
      </main>
    );
  }

  if (signedIn === false) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-app">Recycle bin</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in to view items you have deleted.
        </p>
      </main>
    );
  }

  if (!workspaceId) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-app">Recycle bin</h1>
        <p className="mt-2 text-sm text-muted">
          Pick a workspace first — the recycle bin is workspace-scoped.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Workspace
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Recycle bin</h1>
          <p className="mt-0.5 text-xs text-muted">
            Restore deleted records or purge them permanently.
            {!isAdmin && (
              <span className="ml-1 text-faint">(Purge is admin-only.)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-app bg-app-elevated px-2 py-1 text-xs text-app focus:border-app-hover focus:outline-none"
          >
            <option value="">All types</option>
            {entityTypeOptions.map((t) => (
              <option key={t} value={t}>
                {ENTITY_LABEL[t] ?? t}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={refresh}
            className="rounded-md border border-app px-2 py-1 text-xs text-secondary hover:text-app"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-xs">
          <thead className="bg-surface text-[10px] uppercase tracking-[0.15em] text-faint">
            <tr>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Deleted</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {refreshing && items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!refreshing && items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center">
                  <div className="text-sm text-app">Nothing in trash</div>
                  <div className="mt-1 text-xs text-muted">
                    Deleted records will appear here for restore.
                  </div>
                </td>
              </tr>
            )}
            {items.map((i) => {
              const busyKey = `${i.entity_type}:${i.entity_id}`;
              const isBusy = busy === busyKey;
              return (
                <tr key={busyKey} className="border-t border-app">
                  <td className="px-3 py-2 text-app">{i.label}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-secondary">
                      {ENTITY_LABEL[i.entity_type] ?? i.entity_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {new Date(i.deleted_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => restore(i)}
                        disabled={isBusy}
                        className="rounded-md border border-app px-2 py-1 text-[11px] text-secondary hover:text-app disabled:opacity-40"
                      >
                        Restore
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => purge(i)}
                          disabled={isBusy}
                          className="rounded-md border border-rose-500/40 px-2 py-1 text-[11px] text-rose-500 hover:bg-rose-500/10 disabled:opacity-40"
                        >
                          Purge
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
