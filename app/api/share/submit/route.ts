/* Form submission endpoint — called from the public form viewer.
 *
 * 1. Rate-limit by IP (30 / 10min)
 * 2. Record the submission against the link
 * 3. Fan out to webhook + email if the form's payload has them set
 *    (fire-and-forget; failures don't block the user response)
 *
 * Anti-abuse: rate-limit per IP via existing `rate_limit_check` RPC and
 * an honeypot field check (`_hp_company` should always be empty).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordSubmit, getLinkById } from "@/lib/share/server";
import { hashClientFingerprint } from "@/lib/share/fingerprint";
import { notifyOnSubmit } from "@/lib/share/notify";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.linkId !== "string" || typeof body.values !== "object" || body.values == null) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }

    // Honeypot: if a bot filled the hidden _hp_company field, silently 200
    const values = body.values as Record<string, unknown>;
    if (typeof values._hp_company === "string" && values._hp_company.length > 0) {
      return NextResponse.json({ ok: true });
    }
    delete values._hp_company;

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

    // Look up the link so we can fan-out to its webhook/email
    const link = await getLinkById(body.linkId);
    if (!link || link.status !== "active" || link.type !== "form") {
      return NextResponse.json({ error: "form not found" }, { status: 404 });
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: "form expired" }, { status: 410 });
    }

    const result = await recordSubmit({
      linkId: link.id,
      payload: { values },
      ipHash,
      uaHash,
    });

    if (!result.ok) {
      return NextResponse.json({ error: "submit failed" }, { status: 500 });
    }

    // Fan-out (don't await; user gets a fast response)
    notifyOnSubmit({ link, values, ipHash }).catch((err) => {
      console.warn("[share] notifyOnSubmit threw:", err);
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
