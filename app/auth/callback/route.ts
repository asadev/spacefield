import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* Supabase OAuth callback.
 *
 * Google (and any other OAuth provider) redirects back to this route with
 * a `?code=…` PKCE code. We exchange it for a session SERVER-SIDE so the
 * auth cookies are set on the response — this is what lets subsequent
 * route-handler calls (`/api/files/upload` etc.) see the user via
 * `supabase.auth.getUser()`.
 *
 * Without this route the browser-side client picks the code up from the
 * URL and sets cookies via `document.cookie`, which works for the
 * SAME-PAGE session but means the very first server-side render after
 * sign-in often misses the cookies. Doing the exchange here makes it
 * deterministic.
 *
 * `?next=` is honored so we can route the user to where they were
 * trying to go (e.g. an invite acceptance link) rather than `/`.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const errorDescription = url.searchParams.get("error_description");
  const next = url.searchParams.get("next") || "/";

  // OAuth provider returned an error — bounce back to home with a flag
  // so the UI can surface it.
  if (errorDescription) {
    const target = new URL("/", url.origin);
    target.searchParams.set("auth_error", errorDescription);
    return NextResponse.redirect(target);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const target = new URL("/", url.origin);
      target.searchParams.set("auth_error", error.message);
      return NextResponse.redirect(target);
    }
  }

  // Resolve `next` against the origin so we can never be redirected to
  // an external URL even if the param is tampered with.
  const target = new URL(next.startsWith("/") ? next : "/", url.origin);
  return NextResponse.redirect(target);
}
