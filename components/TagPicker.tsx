"use client";

/* TagPicker — multi-select dropdown over the workspace's tag library.
 * Drives the chip-tray on every entity detail pane (contacts, deals,
 * files, comments…). Lets the user create a new tag inline so they
 * don't have to bounce out to /tags to add a missing one. */

import { useCallback, useEffect, useMemo, useState } from "react";
import TagChip from "./TagChip";

interface TagShape {
  id: string;
  name: string;
  color?: string | null;
  slug: string;
}

interface Props {
  workspaceId: string;
  currentTagIds: string[];
  onChange: (newIds: string[]) => void;
}

const DEFAULT_COLORS = [
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#14b8a6",
  "#ec4899",
  "#64748b",
];

export default function TagPicker({ workspaceId, currentTagIds, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<TagShape[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0]);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/tags?workspace_id=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const json = (await res.json()) as { tags?: TagShape[] };
        setTags(json.tags ?? []);
      }
    } catch {
      /* network blip — keep stale tag list */
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selected = useMemo(() => {
    const set = new Set(currentTagIds);
    return tags.filter((t) => set.has(t.id));
  }, [tags, currentTagIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, search]);

  function toggleTag(tagId: string) {
    const set = new Set(currentTagIds);
    if (set.has(tagId)) set.delete(tagId);
    else set.add(tagId);
    onChange(Array.from(set));
  }

  async function createTag() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          name,
          color: newColor,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { tag?: TagShape };
        if (json.tag) {
          // Optimistically add to local list + select it. Then resync
          // in the background so counts stay accurate.
          setTags((prev) => {
            if (prev.some((t) => t.id === json.tag!.id)) return prev;
            return [...prev, json.tag!].sort((a, b) =>
              a.name.localeCompare(b.name)
            );
          });
          onChange([...currentTagIds, json.tag.id]);
        }
        setNewName("");
        refresh();
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map((t) => (
          <TagChip
            key={t.id}
            tag={t}
            onRemove={() => toggleTag(t.id)}
          />
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-app bg-app-elevated px-2 py-0.5 text-[11px] text-secondary hover:border-app-hover hover:text-app"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {selected.length === 0 ? "Add tag" : "Edit tags"}
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-72 rounded-xl border border-app bg-app-elevated shadow-xl">
          <div className="border-b border-app p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tags…"
              className="w-full rounded-lg border border-app bg-surface px-2 py-1 text-xs text-app placeholder:text-faint focus:border-app-hover focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {loading && (
              <div className="px-2 py-1.5 text-[11px] text-muted">Loading…</div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="px-2 py-1.5 text-[11px] text-muted">
                No tags yet. Create one below.
              </div>
            )}
            {filtered.map((t) => {
              const checked = currentTagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-surface"
                >
                  <span
                    className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border ${
                      checked
                        ? "border-tool-accent bg-tool-accent text-white"
                        : "border-app"
                    }`}
                  >
                    {checked && (
                      <svg
                        width="9"
                        height="9"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.5"
                      >
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    )}
                  </span>
                  <span
                    className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: t.color || "#64748b" }}
                  />
                  <span className="flex-1 truncate text-app">{t.name}</span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-app p-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-faint">
              + Create new tag
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createTag();
                  }
                }}
                placeholder="Tag name"
                className="flex-1 rounded-md border border-app bg-surface px-2 py-1 text-xs text-app placeholder:text-faint focus:border-app-hover focus:outline-none"
              />
              <button
                type="button"
                onClick={createTag}
                disabled={creating || !newName.trim()}
                className="rounded-md bg-tool-accent px-2 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Add
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-1">
              {DEFAULT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  aria-label={`Pick ${c}`}
                  className={`h-4 w-4 rounded-full ${
                    newColor === c ? "ring-2 ring-offset-1 ring-tool-accent" : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
