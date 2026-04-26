import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-IP throttle, 1 error/sec.
const lastHit = new Map<string, number>();
const THROTTLE_MS = 1000;

function getIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "0.0.0.0";
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
    if (lastHit.size > 5000) {
      const cutoff = now - 60_000;
      for (const [k, t] of lastHit) if (t < cutoff) lastHit.delete(k);
    }

    const body = (await req.json().catch(() => ({}))) as {
      path?: string;
      message?: string;
      stack?: string;
    };
    const message = String(body.message || "").slice(0, 2000);
    if (!message) {
      return NextResponse.json({ ok: false, error: "message required" }, { status: 400 });
    }
    const path = String(body.path || "").slice(0, 500);
    const stack = body.stack ? String(body.stack).slice(0, 8000) : null;
    const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;

    let userId: string | null = null;
    try {
      const sb = await createServerClient();
      const { data } = await sb.auth.getUser();
      userId = data?.user?.id ?? null;
    } catch {
      // anonymous
    }

    const admin = createAdminClient();
    const { error } = await admin.from("client_errors").insert({
      user_id: userId,
      path,
      message,
      stack,
      user_agent: ua,
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
