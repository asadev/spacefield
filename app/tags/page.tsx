"use client";

/**
 * Workspace tag manager — list, create, rename, recolor, delete tags
 * for the user's active workspace. Resolves workspace from the same
 * localStorage store the rest of the app uses (lib/workspaces/client),
 * so opening this page when the user has no workspace selected falls
 * back to a friendly empty state instead of erroring.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useWorkspace } from "@/lib/workspaces/client";
import TagChip from "@/components/TagChip";

interface TagRow {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  color: string | null;
  tagged_count?: number;
  created_at: string;
}

const COLORS = [
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#14b8a6",
  "#ec4899",
  "#64748b",
];

export default function TagsPage() {
  const { current, signedIn, loading } = useWorkspace();
  const workspaceId = current.kind === "team" ? current.id : null;

  const [tags, setTags] = useState<TagRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setTags([]);
      return;
    }
    setRefreshing(true);
    try {
      const [tagsRes, linksRes] = await Promise.all([
        fetch(`/api/tags?workspace_id=${encodeURIComponent(workspaceId)}`, {
          cache: "no-store",
        }),
        fetch(
          `/api/tags?workspace_id=${encodeURIComponent(workspaceId)}&_with_counts=1`,
          { cache: "no-store" }
        ),
      ]);
      void linksRes; // reserved — counts surface via lib helper server-side
      if (tagsRes.ok) {
        const json = (await tagsRes.json()) as { tags?: TagRow[] };
        setTags(json.tags ?? []);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createTag = useCallback(async () => {
    const name = newName.trim();
    if (!name || !workspaceId) return;
    setCreating(true);
    setError(null);
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
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `create failed (${res.status})`);
      }
      setNewName("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }, [newName, newColor, workspaceId, refresh]);

  const saveEdit = useCallback(
    async (tagId: string) => {
      const name = editName.trim();
      if (!name) return;
      try {
        const res = await fetch("/api/tags", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: tagId, name, color: editColor || null }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || `update failed (${res.status})`);
        }
        setEditingId(null);
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [editName, editColor, refresh]
  );

  const deleteTag = useCallback(
    async (tagId: string) => {
      if (!confirm("Delete this tag? Existing tagged entities lose the tag.")) {
        return;
      }
      try {
        const res = await fetch(
          `/api/tags?id=${encodeURIComponent(tagId)}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || `delete failed (${res.status})`);
        }
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [refresh]
  );

  const sorted = useMemo(
    () => [...tags].sort((a, b) => a.name.localeCompare(b.name)),
    [tags]
  );

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10 text-sm text-muted">
        Loading workspace…
      </main>
    );
  }

  if (signedIn === false) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-app">Tags</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in to manage your workspace tags.
        </p>
      </main>
    );
  }

  if (!workspaceId) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-app">Tags</h1>
        <p className="mt-2 text-sm text-muted">
          Pick a workspace first — tags are workspace-scoped.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Workspace
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Tags</h1>
          <p className="mt-0.5 text-xs text-muted">
            Label any record. Tags are shared across contacts, deals, files,
            and everything else in this workspace.
          </p>
        </div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-faint">
          {tags.length} tag{tags.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-app bg-app-elevated p-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-faint">
          + New tag
        </div>
        <div className="mt-2 flex items-center gap-2">
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
            placeholder="Tag name (e.g. VIP, Q4 pipeline)"
            className="flex-1 rounded-md border border-app bg-surface px-2 py-1.5 text-xs text-app placeholder:text-faint focus:border-app-hover focus:outline-none"
          />
          <button
            type="button"
            onClick={createTag}
            disabled={creating || !newName.trim()}
            className="rounded-md bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Add
          </button>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setNewColor(c)}
              aria-label={`Pick ${c}`}
              className={`h-5 w-5 rounded-full ${
                newColor === c ? "ring-2 ring-offset-1 ring-tool-accent" : ""
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
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
              <th className="px-3 py-2 text-left">Tag</th>
              <th className="px-3 py-2 text-left">Slug</th>
              <th className="px-3 py-2 text-right">Tagged</th>
              <th className="px-3 py-2 text-right">Created</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {refreshing && tags.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!refreshing && sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  No tags yet. Add your first one above.
                </td>
              </tr>
            )}
            {sorted.map((t) => {
              const editing = editingId === t.id;
              return (
                <tr key={t.id} className="border-t border-app">
                  <td className="px-3 py-2">
                    {editing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-40 rounded-md border border-app bg-surface px-2 py-1 text-xs text-app focus:border-app-hover focus:outline-none"
                        />
                        <div className="flex items-center gap-1">
                          {COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setEditColor(c)}
                              aria-label={`Pick ${c}`}
                              className={`h-3.5 w-3.5 rounded-full ${
                                editColor === c
                                  ? "ring-2 ring-offset-1 ring-tool-accent"
                                  : ""
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <TagChip tag={t} />
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted">
                    {t.slug}
                  </td>
                  <td className="px-3 py-2 text-right text-muted">
                    {t.tagged_count ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-faint">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editing ? (
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => saveEdit(t.id)}
                          className="rounded-md bg-tool-accent px-2 py-1 text-[11px] font-medium text-white hover:opacity-90"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-md border border-app px-2 py-1 text-[11px] text-secondary hover:text-app"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(t.id);
                            setEditName(t.name);
                            setEditColor(t.color ?? "");
                          }}
                          className="rounded-md border border-app px-2 py-1 text-[11px] text-secondary hover:text-app"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTag(t.id)}
                          className="rounded-md border border-rose-500/40 px-2 py-1 text-[11px] text-rose-500 hover:bg-rose-500/10"
                        >
                          Delete
                        </button>
                      </div>
                    )}
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
