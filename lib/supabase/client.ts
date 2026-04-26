import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/* In spacefield the workspace works fully without auth — Supabase is
 * opt-in for cross-device sync. We always return a SupabaseClient (so
 * existing call sites don't need null-checks); when env vars are
 * missing the client simply can't perform real operations and any
 * attempt is a no-op against an unreachable API. The auth-aware code
 * paths in the workspace check for `enabled` before calling so users
 * never see errors. */
function makeClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Fall back to placeholder values if env is missing. Calls will fail
  // at runtime (e.g. fetch to "https://missing/..."), but TypeScript
  // stays clean and the workspace UI doesn't crash on import.
  return createBrowserClient(
    url ?? "https://missing.supabase.co",
    key ?? "missing-anon-key"
  );
}

export function createClient(): SupabaseClient {
  return makeClient();
}

/* Stable singleton — useful so multiple hooks on the same page share
 * the same auth session listener and underlying socket. */
let cachedClient: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (!cachedClient) cachedClient = makeClient();
  return cachedClient;
}

/** True if real Supabase env vars are set. Use this to gate features
 *  that depend on a working backend (auth, sync, etc.). */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
