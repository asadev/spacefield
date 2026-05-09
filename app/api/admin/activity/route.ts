import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

import { checkIsAdmin } from "@/app/admin/_lib";
import type { ActivityFeedRow } from "@/app/admin/_types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/activity
 *   Returns activity_feed rows newest-first.
 *
 *   Query params:
 *     kind        — exact match
 *     actor       — uuid
 *     workspace   — uuid
 *     since       — ISO date or YYYY-MM-DD
 *     until       — ISO date or YYYY-MM-DD
 *     limit       — default 200, max 1000
 *
 * Returns: { rows: ActivityFeedRow[] }
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isoBoundary(value: string | null, edge: "start" | "end"): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const iso =
      edge === "end" ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function GET(request: Request): Promise<Response> {
  const auth = await checkIsAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason === "no-user" ? "not signed in" : "not authorized" },
      { status: auth.reason === "no-user" ? 401 : 403 }
    );
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const actor = url.searchParams.get("actor");
  const workspace = url.searchParams.get("workspace");
  const since = isoBoundary(url.searchParams.get("since"), "start");
  const until = isoBoundary(url.searchParams.get("until"), "end");
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "200", 10);
  const limit = Math.max(1, Math.min(1000, Number.isFinite(limitRaw) ? limitRaw : 200));

  const admin = createAdminClient();
  let q = admin
    .from("activity_feed")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (kind) q = q.eq("kind", kind);
  if (actor && UUID_REGEX.test(actor)) q = q.eq("actor_id", actor);
  if (workspace && UUID_REGEX.test(workspace))
    q = q.eq("workspace_id", workspace);
  if (since) q = q.gte("created_at", since);
  if (until) q = q.lte("created_at", until);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: (data ?? []) as ActivityFeedRow[] });
}
