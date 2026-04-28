"use client";

/**
 * Universal Spotlight (⌘Space / Ctrl+Space).
 *
 * Centered modal with a search input + ranked, categorized results across:
 *   1. Tools (from tools-list.ts) — slug/title/description match
 *   2. Files (workspace_files in the active workspace) — debounced query
 *   3. Settings actions (manual list)
 *   4. Recents — placeholder; the useRecents hook is owned by another agent
 *      and not yet present, so we no-op safely until it lands.
 *
 * Activating a result either calls openApp() from DesktopShellContext (tools,
 * files), or invokes a callback (settings actions). ESC dismisses. Up/Down
 * navigate. Enter activates. The modal renders into a document-level portal
 * via fixed positioning + z-[85] so it sits above windows but below the
 * notification z-[80] is — actually z-[85] is safe.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { TOOLS, toolBySlug, type ToolItem } from "../_data/tools-list";
import { useDesktopShell } from "./DesktopShellContext";
import { useRecents } from "./useRecents";

/** Inline copy of the editorSlugFor helper that used to live in
 * files-manager/_app.tsx. The standalone Files Manager tool was retired
 * (Round D — fully replaced by the Launchpad), so the helper now lives
 * here as the canonical source. Behavior is unchanged. */
function editorSlugFor(
  name: string,
  contentType: string | null,
): "documents" | "sheets" | null {
  const n = name.toLowerCase();
  const ct = (contentType ?? "").toLowerCase();
  if (/\.(md|markdown|txt|html|htm|docx|doc|rtf)$/.test(n)) return "documents";
  if (/\.(xlsx|xls|csv|ods)$/.test(n)) return "sheets";
  if (
    ct === "text/markdown" ||
    ct === "text/plain" ||
    ct === "text/html" ||
    ct === "application/rtf" ||
    ct === "application/msword" ||
    ct ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "documents";
  }
  if (
    ct === "text/csv" ||
    ct === "application/vnd.ms-excel" ||
    ct ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    ct === "application/vnd.oasis.opendocument.spreadsheet"
  ) {
    return "sheets";
  }
  return null;
}

interface FileRow {
  id: string;
  name: string;
  size_bytes: number;
  content_type: string | null;
  created_at: string;
}

type ResultKind = "tool" | "file" | "action" | "recent";

interface BaseResult {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle?: string;
  score: number;
  activate: () => void;
  iconPath: string;
}

const ACTIVE_WORKSPACE_KEY = "workspaces:active:v1";

/* Pre-index tool corpus once at module-load time so search is instant. */
interface ToolIndex {
  tool: ToolItem;
  haystack: string;
}
const TOOL_INDEX: ToolIndex[] = TOOLS.map((t) => ({
  tool: t,
  haystack: `${t.slug} ${t.title} ${t.description} ${t.category}`.toLowerCase(),
}));

/* Fuzzy score: substring match scored by where it hits + how much of the
 * target it covers. 0 = no match. Higher = better. */
function score(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const idx = t.indexOf(q);
  if (idx === -1) {
    // Looser fallback: every character must appear in order.
    let ti = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const found = t.indexOf(q[qi], ti);
      if (found === -1) return 0;
      ti = found + 1;
    }
    return 1; // weak match
  }
  // Earlier match + better coverage = higher score.
  const positionBonus = Math.max(0, 50 - idx);
  const coverage = Math.round((q.length / Math.max(1, t.length)) * 50);
  return 100 + positionBonus + coverage;
}

const ICON_TOOL =
  "M3 7l9-4 9 4-9 4-9-4zm0 6l9 4 9-4M3 17l9 4 9-4";
const ICON_FILE =
  "M6 2h9l5 5v15a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm7 1.5V8h4.5L13 3.5z";
const ICON_ACTION =
  "M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2M12 8a4 4 0 100 8 4 4 0 000-8z";
const ICON_RECENT =
  "M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default function Spotlight() {
  const { openApp } = useDesktopShell();
  const { recents } = useRecents();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [files, setFiles] = useState<FileRow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => (isSupabaseConfigured() ? getSupabase() : null), []);

  /* Hotkey: ⌘Space / Ctrl+Space toggles. We only fire when the desktop has
   * focus (active element is body or a non-input element). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.code === "Space") {
        const tgt = document.activeElement as HTMLElement | null;
        const editable =
          tgt instanceof HTMLElement &&
          (tgt.tagName === "INPUT" ||
            tgt.tagName === "TEXTAREA" ||
            tgt.tagName === "SELECT" ||
            tgt.isContentEditable);
        // Allow toggling closed even when focus is in our own input.
        if (editable && !open) return;
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /* Reset state on each open + autofocus. */
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  /* Debounced file query. 150 ms after the user stops typing we hit
   * Supabase. Skip when query is empty (we'll still show recents/tools). */
  useEffect(() => {
    if (!open) return;
    if (!supabase) {
      setFiles([]);
      return;
    }
    if (!query.trim()) {
      setFiles([]);
      return;
    }
    const workspaceId =
      typeof window !== "undefined"
        ? localStorage.getItem(ACTIVE_WORKSPACE_KEY)
        : null;
    if (!workspaceId) {
      setFiles([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      try {
        const { data } = await supabase
          .from("workspace_files")
          .select("id, name, size_bytes, content_type, created_at")
          .eq("workspace_id", workspaceId)
          .ilike("name", `%${query.trim()}%`)
          .order("created_at", { ascending: false })
          .limit(15);
        setFiles((data as FileRow[] | null) ?? []);
      } catch {
        setFiles([]);
      }
    }, 150);
    return () => window.clearTimeout(handle);
  }, [open, query, supabase]);

  /* Settings actions — manual list with callbacks. We dispatch synthetic
   * events that Desktop.tsx (or other agents' overlays) listen for, so
   * Spotlight stays decoupled from the parent's setState callbacks. */
  const settingActions = useMemo(
    () => [
      {
        id: "open-settings",
        title: "Open Settings",
        subtitle: "Appearance, dock, sounds",
        run: () => {
          window.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: ",",
              metaKey: true,
              bubbles: true,
            }),
          );
        },
      },
      {
        id: "open-profile",
        title: "Open Profile",
        subtitle: "Account and avatar",
        run: () => {
          window.dispatchEvent(new CustomEvent("spotlight:open-profile"));
        },
      },
      {
        id: "create-workspace",
        title: "Create Workspace",
        subtitle: "Spin up a new desktop",
        run: () => {
          window.dispatchEvent(new CustomEvent("spotlight:create-workspace"));
        },
      },
      {
        id: "theme-light",
        title: "Theme: Light",
        subtitle: "Switch to light mode",
        run: () => {
          try {
            localStorage.setItem("theme", "light");
            document.documentElement.setAttribute("data-theme", "light");
            window.dispatchEvent(
              new StorageEvent("storage", {
                key: "theme",
                newValue: "light",
              }),
            );
          } catch {}
        },
      },
      {
        id: "theme-dark",
        title: "Theme: Dark",
        subtitle: "Switch to dark mode",
        run: () => {
          try {
            localStorage.setItem("theme", "dark");
            document.documentElement.setAttribute("data-theme", "dark");
            window.dispatchEvent(
              new StorageEvent("storage", {
                key: "theme",
                newValue: "dark",
              }),
            );
          } catch {}
        },
      },
      {
        id: "theme-system",
        title: "Theme: System",
        subtitle: "Follow OS preference",
        run: () => {
          try {
            localStorage.setItem("theme", "system");
            const resolved = window.matchMedia("(prefers-color-scheme: light)")
              .matches
              ? "light"
              : "dark";
            document.documentElement.setAttribute("data-theme", resolved);
            window.dispatchEvent(
              new StorageEvent("storage", {
                key: "theme",
                newValue: "system",
              }),
            );
          } catch {}
        },
      },
      {
        id: "sign-out",
        title: "Sign out",
        subtitle: "End the current session",
        run: () => {
          window.dispatchEvent(new CustomEvent("spotlight:sign-out"));
        },
      },
    ],
    [],
  );

  /* Compose ranked results. With an empty query we surface a curated set of
   * recents + top tools so the panel isn't empty. */
  const results = useMemo<BaseResult[]>(() => {
    const out: BaseResult[] = [];
    const q = query.trim();

    if (!q) {
      // Empty query: real recents from useRecents (newest first), padded
      // with top-rated tools when the recents list is short.
      for (const r of recents.slice(0, 8)) {
        if (r.kind === "tool") {
          const tool = toolBySlug(r.slug);
          if (!tool) continue;
          out.push({
            id: `recent:tool:${tool.slug}`,
            kind: "recent",
            title: tool.title,
            subtitle: tool.category,
            score: 1,
            iconPath: ICON_RECENT,
            activate: () => {
              openApp(tool.slug);
              setOpen(false);
            },
          });
        } else {
          out.push({
            id: `recent:file:${r.id}`,
            kind: "recent",
            title: r.name,
            subtitle: "Recent file",
            score: 1,
            iconPath: ICON_RECENT,
            activate: () => {
              const slug = editorSlugFor(r.name, null);
              if (slug) openApp(slug, { fileId: r.id });
              // Files Manager retirement: fall back to the Launchpad on
              // Home with the file focused.
              else openApp("launchpad", { fileId: r.id });
              setOpen(false);
            },
          });
        }
      }
      if (out.length < 8) {
        for (const idx of TOOL_INDEX) {
          if (out.length >= 8) break;
          if (!idx.tool.topRated) continue;
          if (out.some((o) => o.id === `recent:tool:${idx.tool.slug}`)) continue;
          out.push({
            id: `tool:${idx.tool.slug}`,
            kind: "recent",
            title: idx.tool.title,
            subtitle: idx.tool.category,
            score: 1,
            iconPath: ICON_RECENT,
            activate: () => {
              openApp(idx.tool.slug);
              setOpen(false);
            },
          });
        }
      }
      return out.slice(0, 8);
    }

    // Tools
    for (const idx of TOOL_INDEX) {
      const s = score(q, idx.haystack);
      if (s > 0) {
        out.push({
          id: `tool:${idx.tool.slug}`,
          kind: "tool",
          title: idx.tool.title,
          subtitle: idx.tool.category,
          score: s + (idx.tool.topRated ? 5 : 0),
          iconPath: ICON_TOOL,
          activate: () => {
            openApp(idx.tool.slug);
            setOpen(false);
          },
        });
      }
    }

    // Files
    for (const f of files) {
      const s = score(q, `${f.name} ${f.content_type ?? ""}`);
      if (s > 0) {
        out.push({
          id: `file:${f.id}`,
          kind: "file",
          title: f.name,
          subtitle: `${formatBytes(f.size_bytes)} · ${formatDate(f.created_at)}`,
          score: s,
          iconPath: ICON_FILE,
          activate: () => {
            const slug = editorSlugFor(f.name, f.content_type);
            if (slug) {
              openApp(slug, { fileId: f.id });
            } else {
              // Files Manager retirement: open the Launchpad on Home and
              // focus the file. Historical fallback was the standalone
              // Files Manager tool.
              openApp("launchpad", { fileId: f.id });
            }
            setOpen(false);
          },
        });
      }
    }

    // Settings actions
    for (const a of settingActions) {
      const s = score(q, `${a.title} ${a.subtitle}`);
      if (s > 0) {
        out.push({
          id: `action:${a.id}`,
          kind: "action",
          title: a.title,
          subtitle: a.subtitle,
          score: s,
          iconPath: ICON_ACTION,
          activate: () => {
            a.run();
            setOpen(false);
          },
        });
      }
    }

    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 30);
  }, [query, files, openApp, settingActions, recents]);

  /* Group + flat-index map for keyboard nav. */
  const grouped = useMemo(() => {
    const groups: { label: string; items: BaseResult[] }[] = [];
    const order: ResultKind[] = ["recent", "tool", "file", "action"];
    const labels: Record<ResultKind, string> = {
      recent: "Recents",
      tool: "Tools",
      file: "Files",
      action: "Actions",
    };
    for (const kind of order) {
      const items = results.filter((r) => r.kind === kind);
      if (items.length) groups.push({ label: labels[kind], items });
    }
    return groups;
  }, [results]);

  const flatItems = useMemo(
    () => grouped.flatMap((g) => g.items),
    [grouped],
  );

  useEffect(() => {
    if (activeIndex >= flatItems.length) setActiveIndex(0);
  }, [flatItems.length, activeIndex]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(flatItems.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const it = flatItems[activeIndex];
        if (it) it.activate();
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    },
    [flatItems, activeIndex],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="spotlight"
          className="fixed inset-0 z-[85] flex items-start justify-center bg-app/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            className="mt-[12vh] w-[min(640px,92vw)] overflow-hidden rounded-2xl border border-app bg-app-elevated shadow-2xl"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-app px-4 py-3">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="text-muted"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search tools, files, actions"
                className="flex-1 bg-transparent text-base text-app placeholder:text-muted focus:outline-none"
                spellCheck={false}
                autoComplete="off"
              />
              <kbd className="rounded border border-app bg-surface px-1.5 py-0.5 text-[0.65rem] text-muted">
                ESC
              </kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto py-1">
              {grouped.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-secondary">
                  {query ? "No results" : "Start typing to search"}
                </div>
              )}
              {grouped.map((group) => {
                let runningIdx = 0;
                for (const g of grouped) {
                  if (g.label === group.label) break;
                  runningIdx += g.items.length;
                }
                return (
                  <div key={group.label} className="py-1">
                    <div className="px-4 py-1 text-[0.6rem] uppercase tracking-[0.14em] text-muted">
                      {group.label}
                    </div>
                    {group.items.map((item, i) => {
                      const flat = runningIdx + i;
                      const active = flat === activeIndex;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onMouseEnter={() => setActiveIndex(flat)}
                          onClick={() => item.activate()}
                          className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                            active ? "bg-tool-accent-soft" : "hover:bg-surface"
                          }`}
                        >
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-md ${
                              active
                                ? "bg-tool-accent text-white"
                                : "bg-surface text-tool-accent"
                            }`}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d={item.iconPath} />
                            </svg>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-app">
                              {item.title}
                            </span>
                            {item.subtitle && (
                              <span className="block truncate text-[0.7rem] text-muted">
                                {item.subtitle}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
