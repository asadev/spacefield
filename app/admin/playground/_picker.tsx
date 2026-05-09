"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

/**
 * Generic searchable picker used on the playground hub. Renders a search
 * input and a list of items; each item links to its corresponding
 * playground sub-route.
 */

export interface PickerItem {
  id: string;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  href: string;
}

export interface PlaygroundPickerProps {
  items: PickerItem[];
  emptyLabel: string;
  searchPlaceholder: string;
}

export default function PlaygroundPicker({
  items,
  emptyLabel,
  searchPlaceholder,
}: PlaygroundPickerProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const blob = `${it.id} ${it.title} ${it.subtitle ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [items, query]);

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
        className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint"
      />
      <div className="max-h-[420px] space-y-1 overflow-y-auto rounded-md border border-app bg-app p-1">
        {filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-app bg-app/40 px-3 py-6 text-center text-[11px] text-faint">
            {items.length === 0 ? emptyLabel : "No matches."}
          </div>
        ) : (
          filtered.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-transparent bg-app-elevated px-3 py-2 text-xs transition-colors hover:border-tool-accent"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-app">
                  {item.title}
                </div>
                {item.subtitle && (
                  <div className="truncate text-[11px] text-muted">
                    {item.subtitle}
                  </div>
                )}
              </div>
              {item.status && (
                <span className="rounded-full border border-app bg-app px-2 py-0.5 text-[10px] uppercase tracking-wide text-secondary">
                  {item.status}
                </span>
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
