"use client";

/* Reusable multi-select CRM contact picker — used by Groups, Lists,
 * and the reusable WhatsAppMessageComposer.
 *
 * Filters contacts to those that have a phone number (the only ones
 * sendable on WhatsApp). Debounces the search so we don't hammer the
 * CRM API on every keystroke. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchSendableContacts, type WaCrmContact } from "./api";
import { ErrorBlock, MiniIcon, formatPhone } from "./ui";

interface Props {
  workspaceId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Limit total selection. Useful for group create (WA caps at 256). */
  maxSelected?: number;
  placeholder?: string;
}

export default function ContactPicker({
  workspaceId,
  selectedIds,
  onChange,
  maxSelected,
  placeholder,
}: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<WaCrmContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(id);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchSendableContacts(workspaceId, debounced);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      setResults([]);
      return;
    }
    setResults(res.data);
  }, [workspaceId, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggle = useCallback(
    (id: string) => {
      if (selectedSet.has(id)) {
        onChange(selectedIds.filter((s) => s !== id));
      } else {
        if (maxSelected !== undefined && selectedIds.length >= maxSelected) return;
        onChange([...selectedIds, id]);
      }
    },
    [maxSelected, onChange, selectedIds, selectedSet]
  );

  const selectedRows = useMemo(
    () => results.filter((r) => selectedSet.has(r.id)),
    [results, selectedSet]
  );

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 rounded-md border border-app bg-surface px-2 py-1.5">
        <MiniIcon name="search" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder ?? "Search CRM contacts"}
          className="w-full bg-transparent text-sm text-app outline-none placeholder:text-faint"
          aria-label="Search contacts"
        />
      </label>

      {selectedRows.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedRows.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className="inline-flex items-center gap-1 rounded-full border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
              aria-label={`Remove ${contactLabel(c)}`}
            >
              {contactLabel(c)}
              <MiniIcon name="close" size={10} />
            </button>
          ))}
        </div>
      ) : null}

      {error ? <ErrorBlock body={error} onRetry={load} /> : null}

      <div className="max-h-60 overflow-y-auto rounded-md border border-app bg-app-elevated">
        {loading ? (
          <div className="p-3 text-xs text-faint">loading…</div>
        ) : results.length === 0 ? (
          <div className="p-3 text-xs text-faint">
            {debounced
              ? "No contacts match. Try a different name or phone."
              : "No CRM contacts have a phone yet."}
          </div>
        ) : (
          <ul role="list" className="divide-y divide-app">
            {results.map((c) => {
              const sel = selectedSet.has(c.id);
              const disabled = !sel && maxSelected !== undefined && selectedIds.length >= maxSelected;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => toggle(c.id)}
                    disabled={disabled}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                      sel ? "bg-tool-accent-soft" : "hover:bg-surface"
                    } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-app">
                        {contactLabel(c)}
                      </div>
                      <div className="truncate font-mono text-[0.65rem] text-faint">
                        {formatPhone(c.phone)}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[0.6rem] uppercase ${
                        sel
                          ? "border-tool-accent bg-tool-accent text-app-elevated"
                          : "border-app text-secondary"
                      }`}
                    >
                      {sel ? "selected" : "add"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="text-[0.6rem] text-faint">
        {selectedIds.length} selected
        {maxSelected !== undefined ? ` · max ${maxSelected}` : ""}
      </div>
    </div>
  );
}

function contactLabel(c: WaCrmContact): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return name || formatPhone(c.phone) || "Unnamed";
}
