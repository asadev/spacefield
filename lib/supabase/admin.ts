import "server-only";
import { createClient as createSbClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS. Only use from server-side
 * admin code after a `requireAdmin()` check.
 *
 * SC-001 — Historically this fell back to the anon key when the service
 * role secret was missing. That meant a misconfigured deploy would
 * silently downgrade to RLS-gated reads (and writes that look like they
 * worked but actually no-op'd). We now hard-fail loudly so the deploy
 * goes red instead of mysteriously losing rows.
 *
 * If you're hitting this in dev, set `SUPABASE_SERVICE_ROLE_KEY`
 * (preferred) or `SUPABASE_SERVICE_ROLE` in `.env.local`. NEVER fall
 * back to the anon key — RLS will silently drop admin reads.
 */
let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;
  if (!url) {
    throw new Error(
      "Supabase admin client: NEXT_PUBLIC_SUPABASE_URL is not set",
    );
  }
  if (!key) {
    throw new Error(
      "Supabase admin client: SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE) is not set — refusing to fall back to anon key",
    );
  }
  cached = createSbClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
