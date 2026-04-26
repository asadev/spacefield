import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tiny in-memory per-IP throttle (1 req/sec). Process-local — that's fine for
// a best-effort beacon log.
const lastHit = new Map<string, number>();
const THROTTLE_MS = 1000;

function getIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "0.0.0.0";
}

function hashIp(ip: string): string {
  const secret = process.env.IP_HASH_SECRET || "spacefield-pageview-salt";
  return createHash("sha256").update(ip + ":" + secret).digest("hex").slice(0, 32);
}

export async function POST(req: NextRequest) {
  try {
    const ip = getIp(req);
    const now = Date.now();
    const last = lastHit.get(ip) ?? 0;
    if (now - last < THROTTLE_MS) {
      return NextResponse.json({ ok: true, throttled: true });
    }
    lastHit.set(ip, now);
    // Light cleanup so the map doesn't grow unbounded.
    if (lastHit.size > 5000) {
      const cutoff = now - 60_000;
      for (const [k, t] of lastHit) {
        if (t < cutoff) lastHit.delete(k);
      }
    }

    const body = (await req.json().catch(() => ({}))) as {
      path?: string;
      referrer?: string | null;
      region?: string | null;
    };

    const path = String(body.path || "").slice(0, 500);
    if (!path) return NextResponse.json({ ok: false, error: "path required" }, { status: 400 });

    const referrer = body.referrer ? String(body.referrer).slice(0, 500) : null;
    const region = body.region ? String(body.region).slice(0, 64) : null;
    const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;

    // Best-effort user resolve via SSR cookies.
    let userId: string | null = null;
    try {
      const sb = await createServerClient();
      const { data } = await sb.auth.getUser();
      userId = data?.user?.id ?? null;
    } catch {
      // ignore — anonymous
    }

    const admin = createAdminClient();
    const { error } = await admin.from("page_views").insert({
      user_id: userId,
      path,
      referrer,
      user_agent: ua,
      ip_hash: hashIp(ip),
      region,
    });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
