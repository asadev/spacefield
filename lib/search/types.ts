/* Shared types for the global search system.
 *
 * Used by:
 *   - lib/search/query.ts   — the server-side query runner
 *   - app/api/search/route.ts — JSON wrapper
 *   - app/search/page.tsx   — server component rendering grouped results
 *   - components/CommandPalette.tsx — client UI consuming /api/search
 *   - lib/ai-tools/search.ts — wraps global_search for the AI assistant
 */

/** A single row returned by the `global_search(text)` RPC. */
export interface SearchHit {
  entity_type: string;
  entity_id: string;
  title: string;
  subtitle: string | null;
  href: string;
  icon: string | null;
  rank: number;
}

/** Hits grouped by entity_type — the shape `/api/search` returns. */
export interface SearchGroup {
  kind: string;
  /** Human label, e.g. "Tasks", "Contacts". */
  label: string;
  items: SearchHit[];
}

export interface SearchResponse {
  query: string;
  total: number;
  groups: SearchGroup[];
}

/** Human-readable labels for entity_type values.
 *  The set is open-ended; unknown types fall back to a Title-Cased
 *  version of the snake_case key. */
export const ENTITY_LABELS: Record<string, string> = {
  crm_contact: "Contacts",
  crm_company: "Companies",
  crm_deal: "Deals",
  crm_lead: "Leads",
  crm_activity: "CRM activity",
  task: "Tasks",
  project: "Projects",
  employee: "People",
  person: "People",
  file: "Files",
  folder: "Folders",
  share: "Shared links",
  toshare: "Shared links",
  workspace: "Workspaces",
  app: "Apps",
  doc: "Documents",
  board: "Boards",
  note: "Notes",
};

export function labelForEntity(kind: string): string {
  if (ENTITY_LABELS[kind]) return ENTITY_LABELS[kind];
  return kind
    .split("_")
    .map((s) => (s.length ? s[0].toUpperCase() + s.slice(1) : s))
    .join(" ");
}
