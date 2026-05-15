"use client";

import { useEffect, useRef, useState } from "react";

import type { SavedView } from "@/lib/saved-views/types";

/* SavedViewsDropdown — drop in at the top of any list page.
 *
 * Props:
 *   - targetEntityType: e.g. "task", "crm_contact"
 *   - currentFilter: the page's current filter object — used as a
 *       baseline when the user clicks "Save current view…"
 *   - onSelect(view): the page applies the chosen view
 *   - onSaveCurrent(name): the page persists `currentFilter` as a new
 *       view with the given name (the page already has the user/
 *       workspace context, so the dropdown stays pure presentation)
 *
 * The dropdown fetches its own list of views from `/api/saved-views`.
 * That route is NOT part of this build (other agents may add it), so
 * we degrade gracefully: a 404 just renders an empty list. The parent
 * can also pass `initialViews` to avoid the fetch entirely.
 */

interface Props {
  targetEntityType: string;
  currentFilter: Record<string, unknown>;
  onSelect: (view: SavedView) => void;
  onSaveCurrent: (name: string) => Promise<void> | void;
  /** Optional pre-fetched list so the dropdown can render synchronously. */
  initialViews?: SavedView[];
  /** Optional fetch URL override (defaults to /api/saved-views). */
  fetchUrl?: string;
  /** Label for the trigger button when no view is active. */
  defaultLabel?: string;
}

export default function SavedViewsDropdown({
  targetEntityType,
  currentFilter,
  onSelect,
  onSaveCurrent,
  initialViews,
  fetchUrl,
  defaultLabel = "All",
}: Props) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>(initialViews ?? []);
  const [loading, setLoading] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [pendingName, setPendingName] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Refetch when the menu opens, unless the parent supplied a list.
  useEffect(() => {
    if (!open) return;
    if (initialViews && initialViews.length > 0) return;
    let aborted = false;
    setLoading(true);
    const url = `${fetchUrl ?? "/api/saved-views"}?target_entity_type=${encodeURIComponent(targetEntityType)}`;
    fetch(url, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { views: [] }))
      .then((data) => {
        if (aborted) return;
        const list = Array.isArray(data?.views) ? (data.views as SavedView[]) : [];
        setViews(list);
      })
      .catch(() => {
        if (!aborted) setViews([]);
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [open, initialViews, targetEntityType, fetchUrl]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSavingMode(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const personal = views.filter((v) => v.scope === "personal");
  const workspace = views.filter((v) => v.scope === "workspace");
  const active = activeId ? views.find((v) => v.id === activeId) ?? null : null;

  async function handleSave() {
    const name = pendingName.trim();
    if (!name) return;
    try {
      await onSaveCurrent(name);
      setPendingName("");
      setSavingMode(false);
      setOpen(false);
    } catch {
      // surface nothing — parent owns toast/error UX
    }
  }

  return (
    <div ref={wrapperRef} className="relative inline-block text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--chrome-border,#0001)] bg-[var(--chrome-solid-bg,#fff)] px-3 py-1.5 hover:bg-[var(--chrome-hover,#0000000a)]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-xs opacity-60">View:</span>
        <span className="font-medium truncate max-w-[10rem]">
          {active ? active.name : defaultLabel}
        </span>
        <span aria-hidden className="opacity-50">▾</span>
      </button>
      {open ? (
        <div className="absolute left-0 mt-1 w-64 rounded-md border border-[var(--chrome-border,#0001)] bg-[var(--chrome-solid-bg,#fff)] shadow-lg z-30 py-1">
          {loading ? (
            <div className="px-3 py-2 text-xs opacity-60">Loading…</div>
          ) : (
            <>
              {personal.length === 0 && workspace.length === 0 ? (
                <div className="px-3 py-2 text-xs opacity-60">
                  No saved views yet.
                </div>
              ) : null}

              {personal.length > 0 ? (
                <ViewGroup
                  label="Your views"
                  views={personal}
                  activeId={activeId}
                  onPick={(v) => {
                    setActiveId(v.id);
                    onSelect(v);
                    setOpen(false);
                  }}
                />
              ) : null}

              {workspace.length > 0 ? (
                <ViewGroup
                  label="Workspace views"
                  views={workspace}
                  activeId={activeId}
                  onPick={(v) => {
                    setActiveId(v.id);
                    onSelect(v);
                    setOpen(false);
                  }}
                />
              ) : null}

              <div className="border-t border-[var(--chrome-border,#0001)] my-1" />

              {savingMode ? (
                <div className="px-2 py-1">
                  <input
                    autoFocus
                    type="text"
                    placeholder="View name…"
                    value={pendingName}
                    onChange={(e) => setPendingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleSave();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setSavingMode(false);
                        setPendingName("");
                      }
                    }}
                    className="w-full rounded border border-[var(--chrome-border,#0002)] px-2 py-1 text-sm outline-none"
                  />
                  <div className="flex justify-end gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSavingMode(false);
                        setPendingName("");
                      }}
                      className="text-xs px-2 py-1 opacity-70 hover:opacity-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={!pendingName.trim()}
                      className="text-xs px-2 py-1 rounded bg-[var(--chrome-active,#2563eb)] text-white disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSavingMode(true)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--chrome-hover,#0000000a)]"
                >
                  <span className="opacity-60">＋</span>{" "}
                  <span>Save current view…</span>
                  {summariseFilter(currentFilter) ? (
                    <span className="block text-[11px] opacity-50 truncate">
                      {summariseFilter(currentFilter)}
                    </span>
                  ) : null}
                </button>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ViewGroup({
  label,
  views,
  activeId,
  onPick,
}: {
  label: string;
  views: SavedView[];
  activeId: string | null;
  onPick: (v: SavedView) => void;
}) {
  return (
    <div className="py-0.5">
      <div className="px-3 py-0.5 text-[10px] uppercase tracking-wider opacity-50">
        {label}
      </div>
      <ul>
        {views.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => onPick(v)}
              className={
                "w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 " +
                (v.id === activeId
                  ? "bg-[var(--chrome-active,#2563eb22)]"
                  : "hover:bg-[var(--chrome-hover,#0000000a)]")
              }
            >
              <span className="flex-1 truncate">{v.name}</span>
              {v.is_default ? (
                <span className="text-[10px] opacity-50">default</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function summariseFilter(filter: Record<string, unknown>): string {
  const keys = Object.keys(filter ?? {}).filter((k) => {
    const v = filter[k];
    if (v === null || v === undefined || v === "") return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  });
  if (keys.length === 0) return "";
  return `${keys.length} filter${keys.length === 1 ? "" : "s"} active`;
}
