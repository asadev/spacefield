import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AdminFlag = {
  key: string;
  enabled: boolean;
  description: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

/**
 * Get a single flag's boolean value. Returns `defaultValue` on missing/error.
 * Cheap + safe — callers should never throw.
 */
export async function getFlag(
  key: string,
  defaultValue: boolean
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("admin_flags")
      .select("enabled")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return defaultValue;
    return Boolean((data as { enabled?: boolean }).enabled);
  } catch {
    return defaultValue;
  }
}

/**
 * Fetch all flags for the admin UI. Returns an empty array on error so the
 * page can still render and show the error state.
 */
export async function getAllFlags(): Promise<{
  flags: AdminFlag[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("admin_flags")
      .select("key, enabled, description, updated_at, updated_by")
      .order("key", { ascending: true });
    if (error) return { flags: [], error: error.message };
    return { flags: (data ?? []) as AdminFlag[], error: null };
  } catch (e) {
    return {
      flags: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
