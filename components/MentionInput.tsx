"use client";

/* MentionInput — textarea with `@` autocomplete.
 *
 * Tracks mentions in two places:
 *   1. The body text — `@username` (display) and an invisible UUID
 *      token kept in `mentionMap` keyed on `@username#<short-uuid>` so
 *      we can resolve display ↔ id without parsing the body.
 *   2. The `mentions` state array — deduped list of user ids the user
 *      has explicitly inserted via the autocomplete dropdown.
 *
 * The component exposes both via the onChange callback so the consumer
 * can send `{ body, mentions }` to the API. Parser-based fallback for
 * mentions also runs server-side in `lib/collab/comments.ts`.
 *
 * The autocomplete data source is one of:
 *   - the `members` prop (caller-supplied placeholder)
 *   - GET /api/people?workspace_id=...  (preferred when present)
 *   - GET /api/auth/workspace-members?workspace_id=... (fallback)
 * If neither endpoint exists the placeholder list wins.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface MentionMember {
  id: string;
  display: string;
  avatarUrl?: string | null;
}

interface Props {
  value: string;
  mentions: string[];
  onChange: (next: { value: string; mentions: string[] }) => void;
  workspaceId: string;
  /** Caller-supplied placeholder member list, used when the workspace
   *  member endpoints are missing or fail. */
  members?: MentionMember[];
  placeholder?: string;
  rows?: number;
  /** Disabled state. Useful while submitting. */
  disabled?: boolean;
  /** Triggered when Cmd/Ctrl+Enter is pressed in the textarea. */
  onSubmit?: () => void;
  className?: string;
}

interface Suggestion {
  id: string;
  display: string;
  avatarUrl?: string | null;
}

const MENTION_TRIGGER_RE = /(^|\s)@([\w.-]{0,40})$/;

export default function MentionInput({
  value,
  mentions,
  onChange,
  workspaceId,
  members,
  placeholder = "Write a comment… use @ to mention",
  rows = 3,
  disabled,
  onSubmit,
  className,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [fetched, setFetched] = useState<MentionMember[] | null>(null);

  // Fetch members from the workspace endpoints once; gracefully fall back
  // to the prop-provided list. The two endpoints (people + auth) are
  // probed in order — the first 200 wins.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!workspaceId) return;
      const urls = [
        `/api/people?workspace_id=${encodeURIComponent(workspaceId)}`,
        `/api/auth/workspace-members?workspace_id=${encodeURIComponent(workspaceId)}`,
      ];
      for (const url of urls) {
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) continue;
          const json = (await res.json()) as {
            items?: Array<{
              id?: string;
              user_id?: string;
              display?: string;
              full_name?: string | null;
              name?: string | null;
              email?: string | null;
              avatar_url?: string | null;
            }>;
          };
          const items = json.items ?? [];
          const normalized: MentionMember[] = items
            .map((m) => ({
              id: String(m.id ?? m.user_id ?? ""),
              display:
                m.display ||
                m.full_name ||
                m.name ||
                m.email ||
                "(member)",
              avatarUrl: m.avatar_url ?? null,
            }))
            .filter((m) => m.id);
          if (!cancelled && normalized.length > 0) {
            setFetched(normalized);
            return;
          }
        } catch {
          // try the next URL
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const allMembers = useMemo(
    () => fetched ?? members ?? [],
    [fetched, members]
  );

  const suggestions = useMemo<Suggestion[]>(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    const seen = new Set<string>();
    const out: Suggestion[] = [];
    for (const m of allMembers) {
      if (seen.has(m.id)) continue;
      if (q && !m.display.toLowerCase().includes(q)) continue;
      seen.add(m.id);
      out.push(m);
      if (out.length >= 8) break;
    }
    return out;
  }, [allMembers, query]);

  const updateValue = useCallback(
    (next: string, nextMentions: string[]) => {
      onChange({ value: next, mentions: Array.from(new Set(nextMentions)) });
    },
    [onChange]
  );

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    const pos = e.target.selectionStart ?? next.length;
    updateValue(next, mentions);

    // Detect an in-progress @mention immediately before the cursor.
    const before = next.slice(0, pos);
    const match = MENTION_TRIGGER_RE.exec(before);
    if (match) {
      setQuery(match[2] ?? "");
      setCursor(pos);
      setHighlight(0);
    } else {
      setQuery(null);
    }
  }

  function insertMention(member: Suggestion) {
    const ta = textareaRef.current;
    if (!ta) return;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    const matched = MENTION_TRIGGER_RE.exec(before);
    if (!matched) return;
    const start = before.length - matched[0].length + (matched[1] ? 1 : 0);
    const lead = value.slice(0, start);
    // Insert display token; we keep the canonical `@<uuid>` in the
    // hidden mentions array, and the visible token in the textarea is
    // human-readable. Parser fallback in lib/collab/comments.ts will
    // also pick up `@<uuid>` directly if anyone embeds it.
    const token = `@${member.display.replace(/\s+/g, "_")}`;
    const next = `${lead}${token} ${after}`;
    const nextMentions = [...mentions, member.id];
    updateValue(next, nextMentions);
    setQuery(null);
    // Restore focus + caret right after the inserted token.
    requestAnimationFrame(() => {
      ta.focus();
      const caret = lead.length + token.length + 1;
      ta.setSelectionRange(caret, caret);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query !== null && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(suggestions[highlight]);
        return;
      }
      if (e.key === "Escape") {
        setQuery(null);
        return;
      }
    }
    if (onSubmit && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="w-full resize-y rounded-md border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none placeholder:text-faint focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft"
      />
      {query !== null && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-auto rounded-md border border-app bg-app-elevated shadow-lg">
          {suggestions.map((s, i) => (
            <button
              type="button"
              key={s.id}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                i === highlight
                  ? "bg-tool-accent-soft text-tool-accent"
                  : "text-app"
              }`}
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full border border-app bg-app text-[9px] font-semibold uppercase text-secondary"
                aria-hidden
              >
                {s.display.trim().slice(0, 1)}
              </span>
              <span className="truncate">{s.display}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
