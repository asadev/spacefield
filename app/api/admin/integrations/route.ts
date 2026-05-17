import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { safeErrorMessage } from "@/lib/safe-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondWithEtag } from "@/lib/etag";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/integrations?category=&status=&enabled=on|off
 *
 * Admin-only JSON read of `integrations`. Same filters as the UI.
 */
export async function GET(req: NextRequest) {
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "admin.integrations.list.auth",
          fallback: "forbidden",
        }),
      },
      { status: 401 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const admin = createAdminClient();
  let query = admin
    .from("integrations")
    .select("*", { count: "exact" })
    .order("category", { ascending: true })
    .order("display_name", { ascending: true });

  const category = sp.get("category");
  if (category) query = query.eq("category", category);
  const status = sp.get("status");
  if (status) query = query.eq("status", status);
  const enabled = sp.get("enabled");
  if (enabled === "on") query = query.eq("enabled", true);
  else if (enabled === "off") query = query.eq("enabled", false);

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json(
      {
        error: safeErrorMessage(error, {
          source: "admin.integrations.list",
          userId: auth.userId,
          fallback: "integrations_list_failed",
        }),
      },
      { status: 500 }
    );
  }
  // Weak ETag + 304: integrations changes infrequently and the admin
  // page polls it on tab focus. 304s here are nearly free.
  return respondWithEtag(req, { rows: data ?? [], count: count ?? 0 });
}
