"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * Typeahead — search-as-you-type combo for picking a contact / company
 * via the existing /api/crm/{contacts,companies} endpoints. Debounced,
 * keyboard-accessible, optional "create new" inline entry.
 *
 * Generic over the row type — caller supplies endpoint + label/sublabel
 * extractors. Returns the picked row's id (or null when cleared).
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./ui";

interface Option<T> {
  id: string;
  label: string;
  sublabel?: string;
  raw: T;
}

interface TypeaheadProps<T extends { id: string }> {
  workspaceId: string | null;
  endpoint: "/api/crm/contacts" | "/api/crm/companies";
  /** Currently picked id, or null. */
  value: string | null;
  /** Currently picked display label (so the input shows it on first paint). */
  valueLabel?: string | null;
  onChange: (id: string | null, raw: T | null) => void;
  /** Map an API row to an option. */
  toOption: (row: T) => Option<T>;
  placeholder?: string;
  /** Optional: show "+ create" row at the bottom, returns the created row to onChange. */
  onCreate?: (query: string) => Promise<T | null>;
  disabled?: boolean;
}

export function Typeahead<T extends { id: string }>({
  workspaceId,
  endpoint,
  value,
  valueLabel,
  onChange,
  toOption,
  placeholder,
  onCreate,
  disabled,
}: TypeaheadProps<T>) {
  const [query, setQuery] = useState(valueLabel ?? "");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastFetched = useRef<string>("");

  // Sync external valueLabel changes.
  useEffect(() => {
    setQuery(valueLabel ?? "");
  }, [valueLabel]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Fetch on debounced query.
  useEffect(() => {
    if (!open || !workspaceId) return;
    const handle = window.setTimeout(async () => {
      const url = `${endpoint}?workspace_id=${workspaceId}&search=${encodeURIComponent(query)}&limit=20`;
      if (lastFetched.current === url) return;
      lastFetched.current = url;
      setLoading(true);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch failed");
        const json = (await res.json()) as { items: T[] };
        setRows(json.items ?? []);
        setActive(0);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => window.clearTimeout(handle);
  }, [query, endpoint, workspaceId, open]);

  const options = useMemo<Option<T>[]>(
    () => rows.map(toOption),
    [rows, toOption]
  );

  const handleSelect = useCallback(
    (opt: Option<T>) => {
      onChange(opt.id, opt.raw);
      setQuery(opt.label);
      setOpen(false);
    },
    [onChange]
  );

  const handleCreate = useCallback(async () => {
    if (!onCreate) return;
    const text = query.trim();
    if (!text) return;
    const created = await onCreate(text);
    if (created) {
      const opt = toOption(created);
      onChange(opt.id, opt.raw);
      setQuery(opt.label);
      setOpen(false);
    }
  }, [onCreate, query, onChange, toOption]);

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = options[active];
      if (pick) handleSelect(pick);
      else if (onCreate && query.trim()) handleCreate();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        disabled={disabled}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
          if (value && e.target.value !== valueLabel) {
            onChange(null, null);
          }
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? "Search…"}
        className="w-full rounded-md border border-app bg-app px-2.5 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear"
          onClick={() => {
            onChange(null, null);
            setQuery("");
            inputRef.current?.focus();
          }}
          className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-faint hover:bg-surface hover:text-app"
        >
          <Icon name="close" size={12} />
        </button>
      ) : null}
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-app bg-app-elevated shadow-lg">
          {loading && (
            <div className="px-3 py-2 text-xs text-faint">Searching…</div>
          )}
          {!loading && options.length === 0 && (
            <div className="px-3 py-2 text-xs text-faint">No matches</div>
          )}
          {options.map((opt, i) => (
            <button
              key={opt.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => handleSelect(opt)}
              className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left ${
                i === active ? "bg-surface" : ""
              }`}
            >
              <span className="text-sm text-app">{opt.label}</span>
              {opt.sublabel ? (
                <span className="text-xs text-muted">{opt.sublabel}</span>
              ) : null}
            </button>
          ))}
          {onCreate && query.trim() && (
            <button
              type="button"
              onClick={handleCreate}
              className="flex w-full items-center gap-2 border-t border-app bg-app px-3 py-2 text-left text-sm text-tool-accent hover:bg-tool-accent-soft"
            >
              <Icon name="plus" size={12} />
              Create &quot;{query.trim()}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
