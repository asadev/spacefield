import "server-only";
import { createClient as createSbClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS. Only use from server-side admin
 * code after a requireAdmin() check. If SUPABASE_SERVICE_ROLE_KEY is not set,
 * we fall back to the anon key — caller must assume reads may be limited.
 */
let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin client: missing URL or key");
  }
  cached = createSbClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
