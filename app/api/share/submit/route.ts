/* Form submission endpoint — called from the public form viewer.
 *
 * Records the submission against the link, fires optional webhook + email.
 * Anti-abuse: rate-limit per IP via existing `rate_limit_check` RPC.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordSubmit } from "@/lib/share/server";
import { hashClientFingerprint } from "@/lib/share/fingerprint";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.linkId !== "string" || typeof body.values !== "object") {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const ua = req.headers.get("user-agent") ?? "";
    const ipHash = await hashClientFingerprint(ip);
    const uaHash = await hashClientFingerprint(ua);

    // rate limit: 30 submits / 10 min / ip
    try {
      const supabase = await createClient();
      const { data: rl } = await supabase.rpc("rate_limit_check", {
        p_bucket: "share_submit",
        p_key: ipHash || "anon",
        p_limit: 30,
        p_window_seconds: 600,
      });
      if (rl === false) {
        return NextResponse.json({ error: "Too many submissions, slow down." }, { status: 429 });
      }
    } catch {
      // if RPC missing, proceed — better to accept than to drop on error
    }

    const result = await recordSubmit({
      linkId: body.linkId,
      payload: { values: body.values },
      ipHash,
      uaHash,
    });

    if (!result.ok) {
      return NextResponse.json({ error: "submit failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
