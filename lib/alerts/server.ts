// Alerts / saved-searches server helpers
//
// A "saved search" is a user-defined filter across a section (market, blog,
// community, listings). When new content matches, we write a notification row.
//
// Listings don't exist yet — stay graceful. Events are fan-in from other
// systems via evaluateSavedSearches(event).

import { createClient } from "@/lib/supabase/server";

export type AlertSection = "market" | "blog" | "community" | "listings";

export interface SavedSearch {
  id: string;
  user_id: string;
  label: string;
  region: string;
  city: string | null;
  section: AlertSection;
  params: Record<string, unknown>;
  notify_email: boolean;
  notify_web: boolean;
  created_at: string;
  last_notified_at: string | null;
}

export interface AlertEvent {
  kind: "blog_post" | "community_post" | "admin_announcement" | "listing";
  region: string;
  city?: string | null;
  title: string;
  href: string;
  /** optional categorical tags — category, post_type, price band, etc. */
  tags?: string[];
  /** optional free-form extras used by future sections */
  meta?: Record<string, unknown>;
}

/**
 * Evaluate a new event against all saved searches. For matching rows we insert
 * a notification and stamp last_notified_at. Safe no-op if the tables don't
 * exist or there are no matches.
 *
 * Matching is intentionally simple for MVP:
 *   - region must equal
 *   - city, if set on the saved search, must equal
 *   - section is mapped from event.kind
 *   - tags: if params.tags is a non-empty array, at least one must be present
 *     in the event's tags.
 */
export async function evaluateSavedSearches(event: AlertEvent): Promise<number> {
  const supabase = await createClient();

  const section = sectionForEventKind(event.kind);
  if (!section) return 0;

  // Fetch candidate saved searches scoped to region + section.
  const { data: searches, error } = await supabase
    .from("saved_searches")
    .select("*")
    .eq("region", event.region)
    .eq("section", section);

  if (error || !searches || searches.length === 0) return 0;

  const matches: SavedSearch[] = [];
  for (const s of searches as SavedSearch[]) {
    if (s.city && event.city && s.city !== event.city) continue;
    if (s.city && !event.city) continue;

    const params = (s.params || {}) as Record<string, unknown>;
    const wantedTags = Array.isArray(params.tags) ? (params.tags as string[]) : [];
    if (wantedTags.length > 0) {
      const eventTags = event.tags || [];
      const hit = wantedTags.some((t) => eventTags.includes(t));
      if (!hit) continue;
    }
    matches.push(s);
  }

  if (matches.length === 0) return 0;

  const nowIso = new Date().toISOString();
  const notifRows = matches
    .filter((m) => m.notify_web)
    .map((m) => ({
      user_id: m.user_id,
      kind: `alert_${event.kind}`,
      title: `New ${friendlyKind(event.kind)} in ${event.region.toUpperCase()}`,
      body: `${m.label}: ${event.title}`,
      href: event.href,
    }));

  if (notifRows.length > 0) {
    await supabase.from("notifications").insert(notifRows);
  }

  // Stamp last_notified_at for every match (email + web).
  await supabase
    .from("saved_searches")
    .update({ last_notified_at: nowIso })
    .in(
      "id",
      matches.map((m) => m.id)
    );

  // TODO: wire email dispatcher. For now email intent is recorded via
  // notify_email flag on the saved search; the weekly digest / future
  // Resend integration can read these.

  return matches.length;
}

function sectionForEventKind(kind: AlertEvent["kind"]): AlertSection | null {
  switch (kind) {
    case "blog_post":
      return "blog";
    case "community_post":
      return "community";
    case "admin_announcement":
      // announcements fan into all sections; we map to market as primary
      return "market";
    case "listing":
      return "listings";
    default:
      return null;
  }
}

function friendlyKind(kind: AlertEvent["kind"]): string {
  switch (kind) {
    case "blog_post":
      return "market article";
    case "community_post":
      return "community post";
    case "admin_announcement":
      return "announcement";
    case "listing":
      return "listing";
  }
}

// ─── CRUD helpers ──────────────────────────────────────────────────────────

export async function listSavedSearches(userId: string): Promise<SavedSearch[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_searches")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data as SavedSearch[]) || [];
}
