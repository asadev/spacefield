"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * SavedViewsManager — per-user saved views grouped by record_type.
 *
 * Pin / rename / delete. When the user picks one, we emit a
 * `crm:saved-view-changed` window event the list views (Phase 2A/2B) read
 * to apply the view's `config` jsonb. Reverse direction: when the list
 * view saves a new view via /api/crm/saved-views/, this manager listens to
 * `crm:saved-view-saved` and refreshes its list.
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspaces/client";
import type {
  CrmSavedView,
  CrmSavedViewConfig,
  CrmSavedViewRecordType,
} from "../types";
import { RECORD_TYPE_VALUES_WITH_ACTIVITY } from "../types";
import { RecIcon } from "./_records/Icon";

const RT_LABELS: Record<CrmSavedViewRecordType, string> = {
  contact: "Contacts",
  company: "Companies",
  deal: "Deals",
  lead: "Leads",
  inventory: "Inventory",
  activity: "Activities",
};

export interface SavedViewChangedDetail {
  recordType: CrmSavedViewRecordType;
  viewId: string | null;
  config: CrmSavedViewConfig | null;
}

export interface SavedViewSavedDetail {
  view: CrmSavedView;
}

export const SAVED_VIEW_CHANGED_EVENT = "crm:saved-view-changed";
export const SAVED_VIEW_SAVED_EVENT = "crm:saved-view-saved";

export function emitSavedViewChanged(detail: SavedViewChangedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SavedViewChangedDetail>(SAVED_VIEW_CHANGED_EVENT, {
      detail,
    })
  );
}

export function emitSavedViewSaved(detail: SavedViewSavedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SavedViewSavedDetail>(SAVED_VIEW_SAVED_EVENT, { detail })
  );
}

export default function SavedViewsManager() {
  const { current, signedIn } = useWorkspace();
  const workspaceId = current.kind === "team" ? current.id : null;

  const [views, setViews] = useState<CrmSavedView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/crm/saved-views/?workspace_id=${encodeURIComponent(workspaceId)}`
      );
      if (!res.ok) throw new Error("load failed");
      const json = (await res.json()) as { items: CrmSavedView[] };
      setViews(json.items ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Listen for new views saved by other surfaces.
  useEffect(() => {
    const handler = () => {
      void reload();
    };
    window.addEventListener(SAVED_VIEW_SAVED_EVENT, handler);
    return () => window.removeEventListener(SAVED_VIEW_SAVED_EVENT, handler);
  }, [reload]);

  const grouped = useMemo(() => {
    const map = new Map<CrmSavedViewRecordType, CrmSavedView[]>();
    for (const rt of RECORD_TYPE_VALUES_WITH_ACTIVITY) {
      map.set(rt, []);
    }
    for (const v of views) {
      map.get(v.record_type)?.push(v);
    }
    for (const [rt, list] of map) {
      list.sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      map.set(rt, list);
    }
    return map;
  }, [views]);

  const onPick = useCallback((v: CrmSavedView) => {
    emitSavedViewChanged({
      recordType: v.record_type,
      viewId: v.id,
      config: (v.config ?? null) as CrmSavedViewConfig | null,
    });
  }, []);

  const onPin = useCallback(
    async (v: CrmSavedView) => {
      try {
        const res = await fetch(`/api/crm/saved-views/${v.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_pinned: !v.is_pinned }),
        });
        if (!res.ok) throw new Error("update failed");
        const json = (await res.json()) as { item: CrmSavedView };
        setViews((prev) => prev.map((x) => (x.id === json.item.id ? json.item : x)));
      } catch (e) {
        setError((e as Error).message);
      }
    },
    []
  );

  const onDelete = useCallback(async (v: CrmSavedView) => {
    if (!window.confirm(`Delete saved view "${v.name}"?`)) return;
    try {
      const res = await fetch(`/api/crm/saved-views/${v.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
      setViews((prev) => prev.filter((x) => x.id !== v.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  if (!signedIn || !workspaceId) {
    return (
      <div className="flex h-full items-center justify-center bg-app p-6">
        <div className="rounded-md border border-app bg-app-elevated p-4 text-sm text-secondary">
          Sign in and pick a team workspace to manage saved views.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-app">
      <header className="shrink-0 border-b border-app bg-app-elevated px-3 py-2">
        <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
          crm.settings.saved-views
        </div>
        <h2 className="text-sm font-semibold text-app">Saved views</h2>
      </header>
      <div className="flex-1 overflow-auto p-3">
        {error && (
          <div className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
            {error}
          </div>
        )}
        {loading ? (
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
            Loading…
          </div>
        ) : views.length === 0 ? (
          <div className="rounded-md border border-dashed border-app bg-app-elevated p-6 text-center text-sm text-muted">
            No saved views yet. Save a view from any list (Pipeline / Deals /
            Contacts / …) to start.
          </div>
        ) : (
          <div className="space-y-3">
            {RECORD_TYPE_VALUES_WITH_ACTIVITY.map((rt) => {
              const list = grouped.get(rt) ?? [];
              if (list.length === 0) return null;
              return (
                <section key={rt}>
                  <div className="mb-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                    {RT_LABELS[rt]}
                  </div>
                  <ul className="space-y-1">
                    {list.map((v) => {
                      const layout =
                        (v.config as CrmSavedViewConfig | null)?.layout ?? "table";
                      return (
                        <li
                          key={v.id}
                          className="flex items-center gap-2 rounded-md border border-app bg-app-elevated px-2 py-1.5"
                        >
                          <button
                            type="button"
                            onClick={() => onPin(v)}
                            className={`text-faint ${
                              v.is_pinned ? "text-tool-accent" : "hover:text-app"
                            }`}
                            title={v.is_pinned ? "Unpin" : "Pin"}
                            aria-label={v.is_pinned ? "Unpin" : "Pin"}
                          >
                            <RecIcon name="tag" size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onPick(v)}
                            className="flex-1 truncate text-left text-sm text-app hover:text-tool-accent"
                          >
                            {v.name}
                          </button>
                          <span className="rounded-md border border-app px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-secondary">
                            {layout}
                          </span>
                          <button
                            type="button"
                            onClick={() => onDelete(v)}
                            className="rounded-md border border-transparent px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary hover:border-red-500/40 hover:text-red-500"
                          >
                            Delete
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
