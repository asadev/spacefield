import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { safeErrorMessage } from "@/lib/safe-error";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/api-tokens?user_id=...&workspace_id=...&status=active|revoked|expired
 *
 * Admin-only JSON read of `api_tokens`. Mirrors the filters the index
 * page exposes. Returns a flat list — no pagination — capped at 200
 * rows so it stays cheap. The raw token is never returned by this
 * endpoint; only the prefix.
 */
export async function GET(req: NextRequest) {
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "admin.api_tokens.list.auth",
          fallback: "forbidden",
        }),
      },
      { status: 401 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const userId = sp.get("user_id")?.trim() ?? "";
  const workspaceId = sp.get("workspace_id")?.trim() ?? "";
  const status = (sp.get("status") ?? "all").toLowerCase();

  const admin = createAdminClient();
  let query = admin
    .from("api_tokens")
    .select(
      "id, user_id, workspace_id, name, prefix, scopes, expires_at, last_used_at, last_used_ip, created_at, revoked_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (userId) query = query.eq("user_id", userId);
  if (workspaceId) {
    if (workspaceId === "_global") query = query.is("workspace_id", null);
    else query = query.eq("workspace_id", workspaceId);
  }
  if (status === "active") query = query.is("revoked_at", null);
  else if (status === "revoked") query = query.not("revoked_at", "is", null);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      {
        error: safeErrorMessage(error, {
          source: "admin.api_tokens.list",
          userId: auth.userId,
          fallback: "api_tokens_list_failed",
        }),
      },
      { status: 500 }
    );
  }

  let rows = data ?? [];
  if (status === "expired") {
    const now = Date.now();
    rows = rows.filter(
      (r) =>
        !r.revoked_at &&
        r.expires_at &&
        new Date(r.expires_at).getTime() <= now
    );
  }

  return NextResponse.json({ rows });
}
