import { NextResponse, type NextRequest } from "next/server";

import { getLockoutState } from "@/lib/security/lockout";
import { log } from "@/lib/log";

/* POST /api/auth/check-lockout
 *
 * Front-door lockout probe for the sign-in dialog. The dialog calls
 * this BEFORE asking Supabase to send a magic link, so a locked
 * account never sends the link, never burns an email-sender quota,
 * and we can route the user to /auth/locked with the `until=` query
 * pre-filled.
 *
 * Why a server endpoint:
 *   - `is_account_locked` is exposed as a security-definer RPC, but we
 *     don't want the client to query Supabase for arbitrary email
 *     addresses (account-existence oracle). Routing through our own
 *     server endpoint lets us rate-limit and shape the response.
 *   - `lib/security/lockout.ts` is `import "server-only"` — there is no
 *     client-callable path otherwise.
 *
 * Body: `{ email: string }`
 * Response: `{ locked: boolean, until: string | null }`. We DO NOT
 * return any signal about whether the account exists — locked-or-not
 * is the entire output surface.
 *
 * NOTE on negative-result behaviour: we deliberately do not call
 * `recordAuthFailure` here. A request to this endpoint is not yet a
 * failed sign-in attempt; we don't want a request-spammer to drive
 * legitimate users into lockout. The failure counter is wired into
 * the post-Supabase-auth failure path (today only relevant when we
 * add server-side password sign-in; Spacefield is magic-link / OAuth
 * only right now).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CheckBody {
  email?: unknown;
}

export async function POST(req: NextRequest) {
  let body: CheckBody;
  try {
    body = (await req.json()) as CheckBody;
  } catch {
    return NextResponse.json(
      { locked: false, until: null, error: "bad_json" },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || !email.includes("@") || email.length > 320) {
    // No probe, no oracle — just say "not locked".
    return NextResponse.json({ locked: false, until: null });
  }

  try {
    const state = await getLockoutState(email);
    return NextResponse.json(state);
  } catch (err) {
    log.warn("auth.check_lockout_failed", { email_len: email.length });
    void err;
    // Fail open — never block a sign-in attempt because of a flaky DB.
    return NextResponse.json({ locked: false, until: null });
  }
}
