/**
 * What's-new entries.
 *
 * Source of truth for the in-app "What's new" modal (see
 * `components/WhatsNew.tsx`). Newest first — the modal shows every
 * entry whose `version` is strictly greater than the user's last-seen
 * cookie value.
 *
 * `version` is a date-style string `YYYY.MM.DD` so plain string
 * comparison gives a correct chronological order. Keep it lowercase
 * `version`-only — no patch suffix needed; we ship at-most a few entries
 * per day and a same-day re-ship would just append to the existing
 * entry's `items` array.
 *
 * This file is intentionally a plain static export (no DB, no fetch) so
 * the modal renders instantly without spinners. When we eventually
 * migrate to an admin-edited table, this file becomes the seed.
 */

export interface ChangelogEntry {
  /** YYYY.MM.DD — ordering key, also displayed as a chip. */
  version: string;
  /** Human-readable date for the modal heading. */
  date: string;
  /** Short headline for the release. */
  title: string;
  /** Bullet points — keep each one a single sentence. */
  items: string[];
}

export const ENTRIES: ChangelogEntry[] = [
  {
    version: "2026.05.17",
    date: "May 17, 2026",
    title: "Universal CSV import + lifecycle flows",
    items: [
      "Bulk-import contacts, leads, employees, tasks from CSV.",
      "Account deletion, email change, workspace deletion flows.",
      "Cmd-K opens the command palette from anywhere.",
      "PWA — install Spacefield on your home screen.",
    ],
  },
  {
    version: "2026.05.14",
    date: "May 14, 2026",
    title: "Tasks, People, and the new Inbox",
    items: [
      "Tasks + Projects module with list + kanban views.",
      "People (HR) module with org chart + time-off + UAE doc-expiry tracker.",
      "Comments + @mentions on every record. Inbox aggregates them.",
    ],
  },
];

/**
 * The newest version that exists. Components use this as the
 * "last-seen" value when the user dismisses the modal.
 */
export const LATEST_VERSION: string = ENTRIES[0]?.version ?? "0";

/**
 * Filter entries to those strictly newer than `lastSeen`. If
 * `lastSeen` is `null`/empty, returns the most recent entry only — a
 * brand-new user shouldn't get the full historical changelog dumped on
 * them.
 */
export function entriesSince(lastSeen: string | null): ChangelogEntry[] {
  if (!lastSeen) {
    return ENTRIES.slice(0, 1);
  }
  return ENTRIES.filter((e) => e.version > lastSeen);
}
