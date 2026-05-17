import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  clearLockout,
  getLockoutState,
} from "@/lib/security/lockout";
import { recordLogin } from "@/lib/security/suspicious-login";
import { log } from "@/lib/log";

/* Supabase OAuth + magic-link callback.
 *
 * Google (and any other OAuth provider) redirects back to this route with
 * a `?code=…` PKCE code. We exchange it for a session SERVER-SIDE so the
 * auth cookies are set on the response — this is what lets subsequent
 * route-handler calls (`/api/files/upload` etc.) see the user via
 * `supabase.auth.getUser()`.
 *
 * Magic links go through this same route for the same reason.
 *
 * Lockout / suspicious-login wiring (N3, 2026-05-17):
 *   - After a successful session exchange we know who the user is. We:
 *     1) Defensively re-check `is_account_locked(email)`. OAuth bypasses
 *        the front-door dialog so this is the only point where a locked
 *        Google sign-in can be intercepted. If locked we sign them
 *        straight back out and redirect to /auth/locked.
 *     2) Fire-and-forget `clearLockout(email)`. Verifying email via
 *        either OAuth or magic link is enough proof-of-ownership to
 *        wipe any failure counter sitting against the address.
 *     3) Fire-and-forget `recordLogin({user_id, ip, ua})`. This writes
 *        a `login_events` row and flags it `alerted=true` when the
 *        (ip_hash, ua_hash) combo hasn't been seen in 60 days; the
 *        suspicious-login cron then emits an in-app notification.
 *   - `?unlock=1`: the /auth/locked page's "send me a sign-in link"
 *     button appends this flag to the magic-link return URL. When we
 *     see it on the callback we propagate a `?toast=success:…` to the
 *     redirect target so the user gets visible confirmation that the
 *     lockout was cleared.
 *
 * `?next=` is honored so we can route the user to where they were
 * trying to go (e.g. an invite acceptance link) rather than `/`.
 */
function getIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const errorDescription = url.searchParams.get("error_description");
  const next = url.searchParams.get("next") || "/";
  const unlockRequested = url.searchParams.get("unlock") === "1";

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

    // Session is now established — fetch the user so we can run the
    // post-sign-in hooks. `getUser()` reads from auth.users so the
    // email here is the authoritative one (not whatever was typed in
    // a form).
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (user) {
      const email = user.email ?? "";

      // (1) Defensive lockout re-check. Magic-link flow already gates
      //     on this client-side via /api/auth/check-lockout, but OAuth
      //     skips that step entirely — Google can hand us a session
      //     for a locked address. If we find the account locked, sign
      //     the user back out and route to /auth/locked.
      //     Skip this when ?unlock=1 — that link is the legitimate
      //     escape hatch and we WANT it to succeed even while locked.
      if (email && !unlockRequested) {
        try {
          const state = await getLockoutState(email);
          if (state.locked) {
            // Sign back out so the just-set cookies don't grant access
            // anyway. Fire-and-forget — we redirect either way.
            await supabase.auth.signOut().catch(() => {});
            const locked = new URL("/auth/locked", url.origin);
            locked.searchParams.set("email", email);
            if (state.until) locked.searchParams.set("until", state.until);
            return NextResponse.redirect(locked);
          }
        } catch (err) {
          log.warn("auth.callback_lockout_check_failed", {
            user_id: user.id,
          });
          void err;
        }
      }

      // (2) Clear any pending lockout. Verified email ownership is
      //     proof enough — this covers both "the user just unlocked
      //     via the /auth/locked magic-link button" and the generic
      //     "user signed in successfully, reset the failure counter".
      //     Fire-and-forget; never block the redirect on DB errors.
      if (email) {
        clearLockout(email).catch((err) => {
          log.warn("auth.clear_lockout_failed", { user_id: user.id });
          void err;
        });
      }

      // (3) Record the sign-in for suspicious-login detection. Hashed
      //     IP + UA only; raw values never reach the DB. We pass the
      //     cookie-bound supabase client because `record_login` is a
      //     `security definer` RPC that pins to `auth.uid()`.
      recordLogin({
        user_id: user.id,
        ip: getIp(req),
        ua: req.headers.get("user-agent"),
        supabase,
      }).catch((err) => {
        log.warn("auth.record_login_failed_outer", { user_id: user.id });
        void err;
      });
    }
  }

  // Resolve `next` against the origin so we can never be redirected to
  // an external URL even if the param is tampered with.
  const target = new URL(next.startsWith("/") ? next : "/", url.origin);

  // If this was the post-unlock flow, surface a success toast via the
  // query-param toast bus (see lib/toast.ts). The <Toaster /> mounted
  // in app/layout.tsx picks it up, dispatches, and strips the param.
  if (unlockRequested) {
    target.searchParams.set(
      "toast",
      "success:Account unlocked. Welcome back.",
    );
  }

  return NextResponse.redirect(target);
}
