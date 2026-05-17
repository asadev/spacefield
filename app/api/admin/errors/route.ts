import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { withApiHandler } from "@/lib/api-wrap";
import { respondWithEtag } from "@/lib/etag";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/errors?level=&source=&fingerprint=&user=&resolved=yes|no
 *
 * Admin-only JSON read of `error_events`. Same filters as the UI.
 * Defaults to 200 most recent rows ordered occurred_at desc.
 *
 * Wrapped with `withApiHandler` so admin auth, ad-hoc rate-limiting,
 * and error logging all run uniformly.
 */
export const GET = withApiHandler(
  async (req: NextRequest) => {
    const sp = req.nextUrl.searchParams;
    const limit = Math.min(500, Math.max(1, Number(sp.get("limit") ?? 200)));
    const admin = createAdminClient();
    let query = admin
      .from("error_events")
      .select("*", { count: "exact" })
      .order("occurred_at", { ascending: false })
      .limit(limit);

    const level = sp.get("level");
    if (level) query = query.eq("level", level);
    const source = sp.get("source");
    if (source) query = query.eq("source", source);
    const fingerprint = sp.get("fingerprint");
    if (fingerprint) query = query.ilike("fingerprint", `%${fingerprint}%`);
    const user = sp.get("user");
    if (user) query = query.eq("user_id", user);
    const resolved = sp.get("resolved");
    if (resolved === "yes") query = query.not("resolved_at", "is", null);
    else if (resolved === "no") query = query.is("resolved_at", null);

    const { data, count, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // Weak ETag + 304 short-circuit: error_events is heavy and admins
    // re-poll the same filters frequently. A 304 saves the JSON
    // round-trip and the React re-render downstream.
    return respondWithEtag(req, { rows: data ?? [], count: count ?? 0 });
  },
  {
    requireAdmin: true,
    source: "admin.api.errors.list",
    rateLimit: { count: 120, window_sec: 60 },
  }
);
