"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Pro panels for the Documents app
   ───────────────────────────────────────────────────────────────────────────
   Lazy-loaded UI bits — slash menu popover, find/replace bar, document
   outline, comments overlay, and the keyboard shortcut sheet. All panels
   take an Editor handle and operate on it via TipTap commands.
═══════════════════════════════════════════════════════════════════════════ */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Editor } from "@tiptap/react";
import type { SlashItem } from "./_pro_extensions";
import type { CommentRecord } from "./_pro_extensions";
import type { SuggestionProps } from "@tiptap/suggestion";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

// ---------------------------------------------------------------------------
// Slash menu popover — driven by props streamed from the Suggestion plugin.
// ---------------------------------------------------------------------------

export function SlashMenu({
  props,
  selected,
  onPickIndex,
}: {
  props: SuggestionProps<SlashItem> | null;
  selected: number;
  onPickIndex: (i: number) => void;
}) {
  if (!props) return null;
  const items = props.items;
  if (items.length === 0) {
    return (
      <SlashFloater clientRect={props.clientRect}>
        <div className="px-3 py-2 text-xs text-secondary">No matches</div>
      </SlashFloater>
    );
  }
  // Group items
  const groups = new Map<string, SlashItem[]>();
  items.forEach((it) => {
    const list = groups.get(it.group) ?? [];
    list.push(it);
    groups.set(it.group, list);
  });
  let runningIndex = 0;
  return (
    <SlashFloater clientRect={props.clientRect}>
      <div className="max-h-[320px] w-64 overflow-y-auto rounded-2xl border border-app bg-app-elevated shadow-2xl">
        {Array.from(groups.entries()).map(([group, list]) => (
          <div key={group} className="py-1">
            <div className="px-3 pb-1 pt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              {group}
            </div>
            {list.map((it) => {
              const myIndex = runningIndex++;
              const isActive = myIndex === selected;
              return (
                <button
                  key={it.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickIndex(myIndex)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition ${
                    isActive
                      ? "bg-tool-accent text-white"
                      : "text-app hover:bg-tool-accent-soft"
                  }`}
                >
                  <span className="font-semibold">{it.label}</span>
                  <span
                    className={`font-mono text-[10px] ${
                      isActive ? "text-white/70" : "text-muted"
                    }`}
                  >
                    {it.hint}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </SlashFloater>
  );
}

function SlashFloater({
  clientRect,
  children,
}: {
  clientRect: SuggestionProps<SlashItem>["clientRect"];
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!clientRect) return;
    const r = clientRect();
    if (!r) return;
    setPos({ top: r.bottom + 6, left: r.left });
  }, [clientRect]);
  if (!pos) return null;
  return (
    <div
      className="pointer-events-auto fixed z-50"
      style={{ top: pos.top, left: pos.left }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Find & replace bar
// ---------------------------------------------------------------------------

export function FindReplaceBar({
  editor,
  onClose,
}: {
  editor: Editor;
  onClose: () => void;
}) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [matches, setMatches] = useState<{ from: number; to: number }[]>([]);
  const [current, setCurrent] = useState(0);
  const findInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    findInputRef.current?.focus();
  }, []);

  const recompute = useCallback(
    (q: string) => {
      if (!q) {
        setMatches([]);
        setCurrent(0);
        return;
      }
      const out: { from: number; to: number }[] = [];
      const lower = q.toLowerCase();
      editor.state.doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return;
        const text = node.text.toLowerCase();
        let i = 0;
        while (i < text.length) {
          const idx = text.indexOf(lower, i);
          if (idx === -1) break;
          out.push({ from: pos + idx, to: pos + idx + q.length });
          i = idx + q.length;
        }
      });
      setMatches(out);
      setCurrent(out.length > 0 ? 0 : 0);
    },
    [editor]
  );

  useEffect(() => {
    recompute(find);
  }, [find, recompute]);

  const goToMatch = useCallback(
    (i: number) => {
      const m = matches[i];
      if (!m) return;
      editor.chain().setTextSelection({ from: m.from, to: m.to }).focus().run();
      // Scroll into view
      const view = editor.view;
      try {
        const coords = view.coordsAtPos(m.from);
        const dom = view.dom as HTMLElement;
        const scrollHost = dom.closest("[data-doc-scroll]") as HTMLElement | null;
        if (scrollHost) {
          const hostRect = scrollHost.getBoundingClientRect();
          if (coords.top < hostRect.top || coords.bottom > hostRect.bottom) {
            scrollHost.scrollTop +=
              coords.top - hostRect.top - hostRect.height / 3;
          }
        }
      } catch {
        // ignore
      }
    },
    [matches, editor]
  );

  const next = useCallback(() => {
    if (matches.length === 0) return;
    const i = (current + 1) % matches.length;
    setCurrent(i);
    goToMatch(i);
  }, [matches, current, goToMatch]);

  const prev = useCallback(() => {
    if (matches.length === 0) return;
    const i = (current - 1 + matches.length) % matches.length;
    setCurrent(i);
    goToMatch(i);
  }, [matches, current, goToMatch]);

  const replaceOne = useCallback(() => {
    const m = matches[current];
    if (!m) return;
    editor
      .chain()
      .setTextSelection({ from: m.from, to: m.to })
      .insertContent(replace)
      .run();
    // Recompute for fresh positions
    setTimeout(() => recompute(find), 0);
  }, [editor, matches, current, replace, find, recompute]);

  const replaceAll = useCallback(() => {
    if (matches.length === 0) return;
    // Apply from end → start so positions stay valid.
    const sorted = [...matches].sort((a, b) => b.from - a.from);
    const tr = editor.state.tr;
    sorted.forEach((m) => {
      tr.insertText(replace, m.from, m.to);
    });
    editor.view.dispatch(tr);
    setTimeout(() => recompute(find), 0);
  }, [editor, matches, replace, find, recompute]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const isCmd = ev.metaKey || ev.ctrlKey;
      if (isCmd && ev.key.toLowerCase() === "g") {
        ev.preventDefault();
        if (ev.shiftKey) prev();
        else next();
      } else if (ev.key === "Escape") {
        onClose();
      } else if (ev.key === "Enter" && document.activeElement === findInputRef.current) {
        ev.preventDefault();
        if (ev.shiftKey) prev();
        else next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.15, ease }}
      className="flex flex-wrap items-center gap-2 border-b border-app bg-app-elevated px-3 py-2"
    >
      <input
        ref={findInputRef}
        type="text"
        value={find}
        onChange={(e) => setFind(e.target.value)}
        placeholder="Find"
        className="min-w-[160px] flex-1 rounded-md border border-app bg-app px-2 py-1 text-xs text-app outline-none focus:border-tool-accent"
      />
      <input
        type="text"
        value={replace}
        onChange={(e) => setReplace(e.target.value)}
        placeholder="Replace"
        className="min-w-[160px] flex-1 rounded-md border border-app bg-app px-2 py-1 text-xs text-app outline-none focus:border-tool-accent"
      />
      <span className="font-mono text-[10px] tabular-nums text-muted">
        {matches.length === 0
          ? "0 matches"
          : `${current + 1} / ${matches.length}`}
      </span>
      <button
        type="button"
        onClick={prev}
        disabled={matches.length === 0}
        className="rounded-md border border-app px-2 py-1 text-[11px] font-semibold text-secondary hover:border-tool-accent/40 hover:text-tool-accent disabled:opacity-40"
      >
        Prev
      </button>
      <button
        type="button"
        onClick={next}
        disabled={matches.length === 0}
        className="rounded-md border border-app px-2 py-1 text-[11px] font-semibold text-secondary hover:border-tool-accent/40 hover:text-tool-accent disabled:opacity-40"
      >
        Next
      </button>
      <button
        type="button"
        onClick={replaceOne}
        disabled={matches.length === 0}
        className="rounded-md border border-app px-2 py-1 text-[11px] font-semibold text-secondary hover:border-tool-accent/40 hover:text-tool-accent disabled:opacity-40"
      >
        Replace
      </button>
      <button
        type="button"
        onClick={replaceAll}
        disabled={matches.length === 0}
        className="rounded-md bg-tool-accent px-2 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
      >
        Replace All
      </button>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md border border-app px-2 py-1 text-[11px] text-secondary hover:text-app"
        aria-label="Close find"
      >
        Close
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Document outline (right panel)
// ---------------------------------------------------------------------------

export interface OutlineNode {
  level: number;
  text: string;
  pos: number;
}

export function DocumentOutline({
  editor,
  onClose,
}: {
  editor: Editor;
  onClose: () => void;
}) {
  const [nodes, setNodes] = useState<OutlineNode[]>([]);

  const refresh = useCallback(() => {
    const out: OutlineNode[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading") {
        const level = (node.attrs.level as number) ?? 1;
        out.push({ level, text: node.textContent || "Untitled", pos });
      }
      return true;
    });
    setNodes(out);
  }, [editor]);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    editor.on("update", handler);
    editor.on("selectionUpdate", handler);
    return () => {
      editor.off("update", handler);
      editor.off("selectionUpdate", handler);
    };
  }, [editor, refresh]);

  const jump = (pos: number) => {
    editor.chain().setTextSelection(pos + 1).focus().run();
    try {
      const coords = editor.view.coordsAtPos(pos + 1);
      const dom = editor.view.dom as HTMLElement;
      const scrollHost = dom.closest("[data-doc-scroll]") as HTMLElement | null;
      if (scrollHost) {
        const hostRect = scrollHost.getBoundingClientRect();
        scrollHost.scrollTop +=
          coords.top - hostRect.top - 80;
      }
    } catch {
      // ignore
    }
  };

  return (
    <aside className="flex h-full w-[200px] flex-col border-l border-app bg-app-elevated">
      <header className="flex items-center justify-between border-b border-app px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          Outline
        </span>
        <button
          onClick={onClose}
          className="text-secondary hover:text-app"
          aria-label="Close outline"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {nodes.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted">
            No headings yet. Use H1-H6 to build your outline.
          </p>
        ) : (
          <ul className="flex flex-col">
            {nodes.map((n, i) => (
              <li key={`${n.pos}-${i}`}>
                <button
                  onClick={() => jump(n.pos)}
                  style={{ paddingLeft: `${(n.level - 1) * 10 + 8}px` }}
                  className="block w-full truncate rounded px-2 py-1 text-left text-xs text-secondary hover:bg-tool-accent-soft hover:text-tool-accent"
                  title={n.text}
                >
                  {n.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Comments overlay (floating margin bubbles)
// ---------------------------------------------------------------------------

export function CommentsOverlay({
  editor,
  comments,
  onResolve,
}: {
  editor: Editor;
  comments: CommentRecord[];
  onResolve: (id: string) => void;
}) {
  const [positions, setPositions] = useState<
    { id: string; top: number; record: CommentRecord }[]
  >([]);

  const compute = useCallback(() => {
    const out: { id: string; top: number; record: CommentRecord }[] = [];
    const dom = editor.view.dom as HTMLElement;
    const scroller = dom.closest("[data-doc-scroll]") as HTMLElement | null;
    const baseTop = scroller
      ? scroller.getBoundingClientRect().top - scroller.scrollTop
      : 0;
    editor.state.doc.descendants((node, pos) => {
      if (!node.marks || node.marks.length === 0) return;
      node.marks.forEach((mark) => {
        if (mark.type.name !== "comment") return;
        const id = mark.attrs.commentId as string | null;
        if (!id) return;
        const record = comments.find((c) => c.id === id);
        if (!record) return;
        if (out.find((o) => o.id === id)) return;
        try {
          const coords = editor.view.coordsAtPos(pos);
          const top = coords.top - baseTop;
          out.push({ id, top, record });
        } catch {
          // ignore
        }
      });
    });
    setPositions(out);
  }, [editor, comments]);

  useEffect(() => {
    compute();
    const handler = () => compute();
    editor.on("update", handler);
    editor.on("selectionUpdate", handler);
    const dom = editor.view.dom as HTMLElement;
    const scroller = dom.closest("[data-doc-scroll]") as HTMLElement | null;
    scroller?.addEventListener("scroll", handler);
    window.addEventListener("resize", handler);
    return () => {
      editor.off("update", handler);
      editor.off("selectionUpdate", handler);
      scroller?.removeEventListener("scroll", handler);
      window.removeEventListener("resize", handler);
    };
  }, [editor, compute]);

  if (positions.length === 0) return null;
  return (
    <div className="pointer-events-none absolute right-2 top-0 z-10 w-[180px]">
      {positions.map((p) => (
        <motion.div
          key={p.id}
          initial={{ opacity: 0, x: 4 }}
          animate={{ opacity: 1, x: 0, top: p.top }}
          transition={{ duration: 0.18, ease }}
          className="pointer-events-auto absolute left-0 right-0 rounded-md border border-app bg-app-elevated p-2 text-[11px] shadow-md"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold text-app">
              {p.record.author}
            </span>
            <button
              onClick={() => onResolve(p.id)}
              className="text-[10px] text-secondary hover:text-tool-accent"
              title="Resolve comment"
            >
              Resolve
            </button>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-secondary">
            {p.record.text}
          </p>
          <p className="mt-1 font-mono text-[9px] text-muted">
            {new Date(p.record.createdAt).toLocaleString()}
          </p>
        </motion.div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comment composer popover
// ---------------------------------------------------------------------------

export function CommentComposer({
  initialText,
  onSubmit,
  onCancel,
  position,
}: {
  initialText: string;
  position: { top: number; left: number } | null;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  if (!position) return null;
  return (
    <div
      className="fixed z-50 w-64 rounded-2xl border border-app bg-app-elevated p-3 shadow-2xl"
      style={{ top: position.top, left: position.left }}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        New comment
      </p>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="mt-2 w-full resize-none rounded-md border border-app bg-app px-2 py-1 text-xs text-app outline-none focus:border-tool-accent"
        placeholder="Add a note…"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-app px-2 py-1 text-[11px] text-secondary hover:text-app"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            const trimmed = text.trim();
            if (!trimmed) return;
            onSubmit(trimmed);
          }}
          className="rounded-md bg-tool-accent px-2 py-1 text-[11px] font-semibold text-white hover:opacity-90"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Keyboard shortcut sheet (Cmd+/)
// ---------------------------------------------------------------------------

export interface ShortcutEntry {
  keys: string;
  label: string;
}
export interface ShortcutGroup {
  title: string;
  entries: ShortcutEntry[];
}

export function ShortcutSheet({
  groups,
  onClose,
}: {
  groups: ShortcutGroup[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.18, ease }}
        className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-app bg-app-elevated shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-app px-4 py-3">
          <h3 className="text-sm font-bold text-app">Keyboard Shortcuts</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-app text-secondary hover:text-app"
            aria-label="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-6 sm:grid-cols-2">
            {groups.map((g) => (
              <div key={g.title}>
                <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                  {g.title}
                </h4>
                <ul className="flex flex-col gap-1">
                  {g.entries.map((e) => (
                    <li
                      key={e.label}
                      className="flex items-center justify-between gap-3 rounded-md border border-app bg-app px-2 py-1.5"
                    >
                      <span className="text-xs text-secondary">{e.label}</span>
                      <span className="font-mono text-[10px] text-app">
                        {e.keys}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton (loading shimmer for the editor body)
// ---------------------------------------------------------------------------

export function EditorSkeleton() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse px-6 py-8">
      <div className="mb-4 h-7 w-2/3 rounded bg-app-elevated" />
      <div className="mb-2 h-4 w-full rounded bg-app-elevated" />
      <div className="mb-2 h-4 w-11/12 rounded bg-app-elevated" />
      <div className="mb-6 h-4 w-3/4 rounded bg-app-elevated" />
      <div className="mb-2 h-4 w-full rounded bg-app-elevated" />
      <div className="mb-2 h-4 w-10/12 rounded bg-app-elevated" />
      <div className="mb-2 h-4 w-9/12 rounded bg-app-elevated" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Color / highlight palette popover
// ---------------------------------------------------------------------------

export function PalettePopover({
  swatches,
  onPick,
  onClear,
  customLabel,
  onCustom,
  onClose,
  position,
  title,
}: {
  swatches: { name: string; value: string }[];
  onPick: (value: string) => void;
  onClear: () => void;
  customLabel?: string;
  onCustom?: (value: string) => void;
  onClose: () => void;
  position: { top: number; left: number };
  title: string;
}) {
  const [hex, setHex] = useState("");
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed z-50 w-56 rounded-2xl border border-app bg-app-elevated p-3 shadow-2xl"
      style={{ top: position.top, left: position.left }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          {title}
        </span>
        <button
          onClick={onClose}
          className="text-secondary hover:text-app"
          aria-label="Close palette"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-8 gap-1">
        {swatches.map((s) => (
          <button
            key={s.value}
            type="button"
            title={s.name}
            onClick={() => onPick(s.value)}
            className="h-5 w-5 rounded border border-app transition hover:scale-110"
            style={{ backgroundColor: s.value }}
          />
        ))}
      </div>
      {onCustom ? (
        <div className="mt-2 flex items-center gap-1">
          <input
            type="text"
            placeholder="#hex"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            className="w-full rounded-md border border-app bg-app px-2 py-1 text-xs text-app outline-none focus:border-tool-accent"
          />
          <button
            type="button"
            onClick={() => {
              if (/^#[0-9a-fA-F]{3,8}$/.test(hex)) onCustom(hex);
            }}
            className="rounded-md bg-tool-accent px-2 py-1 text-[10px] font-semibold text-white"
            title={customLabel ?? "Apply"}
          >
            Apply
          </button>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onClear}
        className="mt-2 w-full rounded-md border border-app px-2 py-1 text-[11px] text-secondary hover:text-app"
      >
        Clear
      </button>
    </div>
  );
}
