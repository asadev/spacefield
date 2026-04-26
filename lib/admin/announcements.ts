import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AdminAnnouncement = {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
};

export async function getAllAnnouncements(): Promise<{
  rows: AdminAnnouncement[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("admin_announcements")
      .select(
        "id, title, body, severity, active, starts_at, ends_at, created_by, created_at"
      )
      .order("created_at", { ascending: false });
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []) as AdminAnnouncement[], error: null };
  } catch (e) {
    return {
      rows: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Active announcements for public rendering — only `active=true` AND either
 * no window or current time is inside [starts_at, ends_at].
 * Newest first. Safe on failure (returns []).
 */
export async function getActiveAnnouncements(): Promise<AdminAnnouncement[]> {
  try {
    const supabase = await createClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("admin_announcements")
      .select(
        "id, title, body, severity, active, starts_at, ends_at, created_by, created_at"
      )
      .eq("active", true)
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
      .order("created_at", { ascending: false })
      .limit(3);
    if (error || !data) return [];
    return data as AdminAnnouncement[];
  } catch {
    return [];
  }
}

export async function getAnnouncement(
  id: string
): Promise<{ row: AdminAnnouncement | null; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("admin_announcements")
      .select(
        "id, title, body, severity, active, starts_at, ends_at, created_by, created_at"
      )
      .eq("id", id)
      .maybeSingle();
    if (error) return { row: null, error: error.message };
    return { row: (data as AdminAnnouncement | null) ?? null, error: null };
  } catch (e) {
    return { row: null, error: e instanceof Error ? e.message : String(e) };
  }
}
