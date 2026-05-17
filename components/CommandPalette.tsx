"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { labelForEntity, type SearchResponse } from "@/lib/search/types";
import { listRecent, recordView } from "@/lib/recents";

/* Cmd-K command palette UI.
 *
 * Driven by CommandPaletteProvider — the provider owns `open` and
 * `query` state and forwards them via props. The palette renders:
 *
 *   1. an input that focuses on open
 *   2. a "Jump to" section (static navigation actions)
 *   3. a "Create new" section (static create actions)
 *   4. a "Recent" section (from localStorage)
 *   5. a "Search results" section (fetched from /api/search?q=)
 *
 * Sections are rendered only when they have items matching the query.
 * Within the visible list, ↑/↓ moves the highlight, Enter activates,
 * Esc closes.
 *
 * Fetching is debounced and aborts in-flight requests on new keystrokes.
 */

const RECENT_KEY = "spacefield.commandPalette.recent.v1";
const RECENT_LIMIT = 6;

interface PaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (q: string) => void;
}

interface BaseItem {
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
  icon?: string | null;
  /** Tag shown on the right edge of the row. */
  trailing?: string;
}

interface Section {
  key: string;
  label: string;
  items: BaseItem[];
}

const JUMP_TO: BaseItem[] = [
  { id: "jump:dashboard",  title: "Dashboard",   subtitle: "Workspace home",     href: "/dashboard",         icon: "🏠" },
  { id: "jump:tasks",       title: "Tasks",       subtitle: "All tasks",           href: "/tasks",             icon: "✅" },
  { id: "jump:people",      title: "People",      subtitle: "Team & employees",    href: "/people",            icon: "👥" },
  { id: "jump:crm",         title: "CRM",         subtitle: "Contacts, deals",     href: "/apps/crm",          icon: "📇" },
  { id: "jump:files",       title: "Files",       subtitle: "Workspace files",     href: "/files",             icon: "📁" },
  { id: "jump:shares",      title: "Shared links", subtitle: "toShare links",       href: "/settings/shares",   icon: "🔗" },
  { id: "jump:admin",       title: "Admin",       subtitle: "Platform admin",      href: "/admin",             icon: "⚙️" },
];

const CREATE_NEW: BaseItem[] = [
  { id: "create:task",     title: "New task",            subtitle: "Open the task composer",     href: "/tasks/new",     icon: "＋" },
  { id: "create:contact",  title: "New contact",         subtitle: "Add a CRM contact",          href: "/apps/crm/contacts/new", icon: "＋" },
  { id: "create:employee", title: "New employee",        subtitle: "Add a person to the team",   href: "/people/new",    icon: "＋" },
  { id: "create:timeoff",  title: "New time-off request",subtitle: "Submit PTO / sick day",      href: "/timeoff/new",   icon: "＋" },
  { id: "create:project",  title: "New project",         subtitle: "Spin up a project",          href: "/projects/new",  icon: "＋" },
];

export default function CommandPalette({
  open,
  onOpenChange,
  query,
  onQueryChange,
}: PaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();
  const [highlight, setHighlight] = useState(0);
  const [recent, setRecent] = useState<BaseItem[]>([]);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Hydrate recent from localStorage on first open (fast, available
  // offline), then fan out to a server-side listRecent() call. If the
  // server returns rows, they replace the local cache — they're the
  // source of truth across devices. If the server is unavailable or
  // the migration hasn't landed yet, we keep the localStorage view.
  useEffect(() => {
    if (!open) return;
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as BaseItem[];
        if (Array.isArray(parsed)) setRecent(parsed.slice(0, RECENT_LIMIT));
      }
    } catch {
      // ignore — recents are best-effort
    }
    let cancelled = false;
    void (async () => {
      const rows = await listRecent(RECENT_LIMIT * 2);
      if (cancelled || !rows || rows.length === 0) return;
      const mapped = rows
        .map((r) => recentRowToBase(r))
        .filter((x): x is BaseItem => x != null)
        .slice(0, RECENT_LIMIT);
      if (mapped.length > 0) {
        setRecent(mapped);
        try {
          window.localStorage.setItem(RECENT_KEY, JSON.stringify(mapped));
        } catch {
          // ignore
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Focus input when opening, reset highlight to 0.
  useEffect(() => {
    if (open) {
      setHighlight(0);
      // Defer focus a tick so the input is mounted.
      const handle = window.setTimeout(() => inputRef.current?.focus(), 10);
      return () => window.clearTimeout(handle);
    }
  }, [open]);

  // Debounced search fetch.
  useEffect(() => {
    if (!open) {
      setResults(null);
      return;
    }
    const q = query.trim();
    if (!q) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&limit=20`,
          {
            signal: controller.signal,
            cache: "no-store",
          }
        );
        if (!res.ok) {
          setResults({ query: q, total: 0, groups: [] });
        } else {
          const data = (await res.json()) as SearchResponse;
          setResults(data);
        }
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          setResults({ query: q, total: 0, groups: [] });
        }
      } finally {
        setLoading(false);
      }
    }, 140);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [open, query]);

  // Filter static items by query, fuzzy-by-substring (case-insensitive).
  const filteredJump = useMemo(() => filterItems(JUMP_TO, query), [query]);
  const filteredCreate = useMemo(() => filterItems(CREATE_NEW, query), [query]);
  const filteredRecent = useMemo(
    () => filterItems(recent, query),
    [recent, query]
  );

  const searchSections = useMemo<Section[]>(() => {
    if (!results) return [];
    return results.groups.map((g) => ({
      key: `search:${g.kind}`,
      label: g.label,
      items: g.items.map((it) => ({
        id: `${g.kind}:${it.entity_id}`,
        title: it.title,
        subtitle: it.subtitle,
        href: it.href,
        icon: it.icon,
        trailing: labelForEntity(it.entity_type),
      })),
    }));
  }, [results]);

  const sections: Section[] = useMemo(() => {
    const out: Section[] = [];
    if (filteredJump.length)
      out.push({ key: "jump", label: "Jump to", items: filteredJump });
    if (filteredCreate.length)
      out.push({ key: "create", label: "Create new", items: filteredCreate });
    if (searchSections.length) out.push(...searchSections);
    if (filteredRecent.length && !query.trim())
      out.push({ key: "recent", label: "Recent", items: filteredRecent });
    return out;
  }, [filteredJump, filteredCreate, filteredRecent, searchSections, query]);

  // Flatten for ↑/↓ navigation. Recompute when sections change.
  const flatItems = useMemo(
    () => sections.flatMap((s) => s.items),
    [sections]
  );

  // Clamp highlight when the flat list shrinks beneath the cursor.
  useEffect(() => {
    if (highlight >= flatItems.length) {
      setHighlight(flatItems.length === 0 ? 0 : flatItems.length - 1);
    }
  }, [flatItems.length, highlight]);

  const activate = useCallback(
    (item: BaseItem) => {
      pushRecent(item);
      // Best-effort server-side recording. Item id encodes either a
      // "kind:uuid" search result or a static jump action; we only call
      // record_view for the search-results case (where we have an
      // entity_type + uuid).
      void recordEntityViewFromItem(item);
      onOpenChange(false);
      router.push(item.href);
    },
    [onOpenChange, router]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) =>
          flatItems.length === 0 ? 0 : (h + 1) % flatItems.length
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) =>
          flatItems.length === 0
            ? 0
            : (h - 1 + flatItems.length) % flatItems.length
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flatItems[highlight];
        if (item) activate(item);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    },
    [flatItems, highlight, activate, onOpenChange]
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
      onKeyDown={onKeyDown}
    >
      <button
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative w-full max-w-2xl rounded-xl border border-[var(--chrome-border,#0001)] bg-[var(--chrome-solid-bg,#ffffff)] shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--chrome-border,#0001)]">
          <span aria-hidden className="opacity-50 text-base">⌘</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search anything or type a command…"
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setHighlight(0);
            }}
            aria-controls={listboxId}
            aria-autocomplete="list"
            className="flex-1 bg-transparent text-base outline-none placeholder:opacity-50"
          />
          {loading ? (
            <span aria-hidden className="text-xs opacity-50">…</span>
          ) : null}
          <kbd className="text-[10px] uppercase tracking-wider opacity-50 border border-[var(--chrome-border,#0002)] rounded px-1.5 py-0.5">
            esc
          </kbd>
        </div>

        <div
          id={listboxId}
          role="listbox"
          className="max-h-[60vh] overflow-y-auto py-2"
        >
          {sections.length === 0 ? (
            <EmptyState query={query} loading={loading} />
          ) : (
            sections.map((section) => {
              const offset = sectionOffset(sections, section.key);
              return (
                <Section
                  key={section.key}
                  section={section}
                  offset={offset}
                  highlight={highlight}
                  onHover={setHighlight}
                  onActivate={activate}
                />
              );
            })
          )}
        </div>

        <Footer
          query={query}
          hasResults={(results?.total ?? 0) > 0}
          onOpenSearchPage={() => {
            const q = query.trim();
            onOpenChange(false);
            if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
          }}
        />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────

function Section({
  section,
  offset,
  highlight,
  onHover,
  onActivate,
}: {
  section: Section;
  offset: number;
  highlight: number;
  onHover: (i: number) => void;
  onActivate: (item: BaseItem) => void;
}) {
  return (
    <div className="pb-1">
      <div className="px-4 py-1 text-[10px] uppercase tracking-wider opacity-50 font-medium">
        {section.label}
      </div>
      <ul className="px-2">
        {section.items.map((item, i) => {
          const idx = offset + i;
          const active = idx === highlight;
          return (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                onMouseEnter={() => onHover(idx)}
                onClick={() => onActivate(item)}
                className={
                  "w-full text-left flex items-center gap-3 rounded-md px-2 py-1.5 transition " +
                  (active
                    ? "bg-[var(--chrome-active,#2563eb22)]"
                    : "hover:bg-[var(--chrome-hover,#0000000a)]")
                }
              >
                <span aria-hidden className="text-base opacity-70 w-5 text-center shrink-0">
                  {renderIcon(item.icon)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate">{item.title}</span>
                  {item.subtitle ? (
                    <span className="block text-xs opacity-60 truncate">
                      {item.subtitle}
                    </span>
                  ) : null}
                </span>
                {item.trailing ? (
                  <span className="text-[10px] uppercase tracking-wider opacity-50 shrink-0">
                    {item.trailing}
                  </span>
                ) : null}
                <span aria-hidden className="opacity-30 text-sm">›</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EmptyState({
  query,
  loading,
}: {
  query: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="px-4 py-8 text-center text-sm opacity-50">Searching…</div>
    );
  }
  if (!query.trim()) {
    return (
      <div className="px-4 py-8 text-center text-sm opacity-50">
        Type to search, or pick a quick action.
      </div>
    );
  }
  return (
    <div className="px-4 py-8 text-center text-sm opacity-50">
      No matches for <span className="font-medium">&ldquo;{query}&rdquo;</span>.
    </div>
  );
}

function Footer({
  query,
  hasResults,
  onOpenSearchPage,
}: {
  query: string;
  hasResults: boolean;
  onOpenSearchPage: () => void;
}) {
  const q = query.trim();
  return (
    <div className="border-t border-[var(--chrome-border,#0001)] px-3 py-2 flex items-center justify-between text-[11px] opacity-60">
      <div className="flex items-center gap-3">
        <span><kbd className="font-mono">↑↓</kbd> navigate</span>
        <span><kbd className="font-mono">↵</kbd> open</span>
        <span><kbd className="font-mono">esc</kbd> close</span>
      </div>
      {q && hasResults ? (
        <button
          type="button"
          onClick={onOpenSearchPage}
          className="underline-offset-2 hover:underline"
        >
          See all results →
        </button>
      ) : null}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Helpers

function filterItems(items: BaseItem[], query: string): BaseItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => {
    const hay = `${it.title} ${it.subtitle ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}

function sectionOffset(sections: Section[], key: string): number {
  let offset = 0;
  for (const s of sections) {
    if (s.key === key) return offset;
    offset += s.items.length;
  }
  return offset;
}

function renderIcon(icon: string | null | undefined): string {
  if (!icon) return "·";
  if (icon.length <= 2) return icon;
  return "·";
}

function pushRecent(item: BaseItem) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const prev = raw ? (JSON.parse(raw) as BaseItem[]) : [];
    const filtered = Array.isArray(prev)
      ? prev.filter((p) => p.id !== item.id)
      : [];
    filtered.unshift(item);
    window.localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(filtered.slice(0, RECENT_LIMIT))
    );
  } catch {
    // ignore — best-effort
  }
}

/* The Cmd-K palette encodes search-result items as `${kind}:${uuid}`
 * (see searchSections above). When the user activates one we mirror the
 * view into the server-side recent_items table so it shows up on other
 * devices. Static "jump:" / "create:" items don't have entity IDs, so
 * they stay localStorage-only.
 */
async function recordEntityViewFromItem(item: BaseItem) {
  const idx = item.id.indexOf(":");
  if (idx <= 0) return;
  const kind = item.id.slice(0, idx);
  const rest = item.id.slice(idx + 1);
  if (kind === "jump" || kind === "create" || kind === "recent") return;
  if (!isUuid(rest)) return;
  await recordView(kind, rest);
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s
  );
}

/* Rehydrate a recent_items row back into a palette BaseItem. We don't
 * have the original title/subtitle/href here (those came from the
 * search index), so we fabricate a sensible label + route. The href
 * pattern matches what /api/search emits for the same entity types.
 */
function recentRowToBase(row: {
  entity_type: string;
  entity_id: string;
  viewed_at: string;
}): BaseItem | null {
  const href = hrefForEntity(row.entity_type, row.entity_id);
  if (!href) return null;
  return {
    id: `${row.entity_type}:${row.entity_id}`,
    title: labelForEntity(row.entity_type),
    subtitle: row.entity_id.slice(0, 8),
    href,
    trailing: labelForEntity(row.entity_type),
  };
}

function hrefForEntity(kind: string, id: string): string | null {
  switch (kind) {
    case "task":
      return `/tasks/${id}`;
    case "crm_contact":
      return `/apps/crm/contacts/${id}`;
    case "crm_company":
      return `/apps/crm/companies/${id}`;
    case "crm_deal":
      return `/apps/crm/deals/${id}`;
    case "crm_lead":
      return `/apps/crm/leads/${id}`;
    case "employee":
      return `/people/${id}`;
    case "comment":
      // Comments don't have their own canonical URL — resolve to the
      // host entity once we know it. Skip for now.
      return null;
    case "workspace_file":
      return `/tools?file=${encodeURIComponent(id)}`;
    default:
      return null;
  }
}
