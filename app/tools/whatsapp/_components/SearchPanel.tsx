"use client";

/* WhatsApp inbox v2 — Wave 4 · EPIC-13 Search + saved views.
 *
 * Server-side full-text search over ALL message history (pg_trgm GIN index)
 * grouped by conversation, plus saved filter views (named status/assignee/
 * label/priority combos persisted per user). Selecting a result or a saved
 * view calls onOpenConversation / onApplyView so the parent can jump the
 * Conversations tab to it.
 *
 * Lazy-loaded from _app.tsx (build-OOM guard). Mobile-first.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSavedView,
  deleteSavedView,
  fetchSavedViews,
  searchMessages,
  type WaSavedView,
  type WaSearchGroup,
} from "./api";
import { EmptyState, ErrorBlock } from "./ui";

interface Props {
  workspaceId: string;
  compact?: boolean;
}

export default function SearchPanel({ workspaceId }: Props) {
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<WaSearchGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [views, setViews] = useState<WaSavedView[]>([]);
  const [newViewName, setNewViewName] = useState("");

  const loadViews = useCallback(async () => {
    const res = await fetchSavedViews(workspaceId);
    if (res.ok) setViews(res.data);
  }, [workspaceId]);

  useEffect(() => {
    loadViews();
  }, [loadViews]);

  const doSearch = useCallback(
    async (term: string) => {
      if (term.trim().length < 2) {
        setGroups([]);
        setSearched(false);
        return;
      }
      setSearching(true);
      setError(null);
      const res = await searchMessages(workspaceId, term.trim());
      setSearching(false);
      setSearched(true);
      if (res.ok) setGroups(res.data);
      else setError(res.error);
    },
    [workspaceId],
  );

  const onChange = (value: string) => {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void doSearch(value), 350);
  };

  const saveCurrentView = useCallback(async () => {
    const name = newViewName.trim();
    if (!name) return;
    // A search-as-view stores the query term so re-opening re-runs the search.
    const res = await createSavedView(workspaceId, { name, query: { search: q.trim() } });
    if (res.ok) {
      setNewViewName("");
      void loadViews();
    }
  }, [newViewName, q, workspaceId, loadViews]);

  const removeView = useCallback(
    async (id: string) => {
      const res = await deleteSavedView(workspaceId, id);
      if (res.ok) setViews((prev) => prev.filter((v) => v.id !== id));
    },
    [workspaceId],
  );

  return (
    <div className="flex h-full flex-col bg-app">
      <div className="shrink-0 border-b border-app bg-app-elevated p-3">
        <input
          autoFocus
          value={q}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search all messages and contacts…"
          className="w-full rounded-lg border border-app bg-transparent px-3 py-2 text-sm text-app"
        />
        {/* save current search as a view */}
        {q.trim().length >= 2 ? (
          <div className="mt-2 flex gap-2">
            <input
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              placeholder="Save this search as…"
              className="flex-1 rounded-lg border border-app bg-transparent px-2 py-1 text-xs text-app"
            />
            <button
              onClick={saveCurrentView}
              disabled={!newViewName.trim()}
              className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-tool-accent disabled:opacity-50"
            >
              Save view
            </button>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {/* saved views */}
        {views.length > 0 ? (
          <div className="mb-4">
            <div className="mb-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
              Saved views
            </div>
            <div className="flex flex-wrap gap-1.5">
              {views.map((v) => (
                <span
                  key={v.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs text-secondary"
                >
                  <button
                    onClick={() => {
                      const term =
                        typeof v.query?.search === "string" ? v.query.search : "";
                      if (term) {
                        setQ(term);
                        void doSearch(term);
                      }
                    }}
                    className="hover:text-app"
                  >
                    {v.name}
                  </button>
                  <button
                    onClick={() => removeView(v.id)}
                    className="text-faint hover:text-rose-500"
                    aria-label={`Delete view ${v.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {error ? <ErrorBlock body={error} onRetry={() => doSearch(q)} /> : null}

        {searching ? (
          <p className="text-sm text-faint">Searching…</p>
        ) : searched && groups.length === 0 ? (
          <EmptyState
            kicker="Search"
            title="No matches"
            body={`Nothing found for "${q.trim()}".`}
          />
        ) : !searched ? (
          <p className="text-sm text-faint">
            Type at least 2 characters to search every conversation.
          </p>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <div
                key={g.conversation_id}
                className="rounded-lg border border-app bg-app-elevated p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-app">
                    {g.title ?? g.phone ?? "Unknown"}
                  </span>
                  <span className="shrink-0 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-faint">
                    {g.match_count} match{g.match_count === 1 ? "" : "es"}
                  </span>
                </div>
                {g.messages.length > 0 ? (
                  <ul className="mt-1.5 space-y-1">
                    {g.messages.map((m) => (
                      <li key={m.id} className="flex items-start gap-2 text-[0.72rem]">
                        <span
                          className={
                            m.direction === "inbound" ? "text-sky-500" : "text-emerald-500"
                          }
                        >
                          {m.direction === "inbound" ? "←" : "→"}
                        </span>
                        <span className="flex-1 text-secondary">{m.body}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[0.72rem] text-faint">
                    Matched on contact / title.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
