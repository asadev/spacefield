import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { safeErrorMessage } from "@/lib/safe-error";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/refunds
 *
 * Query params (all optional):
 *   ?status=pending|approved|processed|rejected|failed
 *   ?currency=USD
 *   ?user_id=<uuid>
 *   ?limit=50 (default 50, max 200)
 *
 * Returns the latest refunds ordered by created_at desc. JSON shape:
 *   { ok: true, rows: RefundRow[], count: number }
 */
export async function GET(req: NextRequest) {
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "admin.refunds.list.auth",
          fallback: "forbidden",
        }),
      },
      { status: 403 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const currency = sp.get("currency");
  const user_id = sp.get("user_id");
  const limitRaw = Number(sp.get("limit") ?? 50);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));

  const admin = createAdminClient();
  let query = admin
    .from("refunds")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (currency) query = query.eq("currency", currency.toUpperCase());
  if (user_id) query = query.eq("user_id", user_id);

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json(
      {
        error: safeErrorMessage(error, {
          source: "admin.refunds.list",
          userId: auth.userId,
          fallback: "refunds_list_failed",
        }),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, rows: data ?? [], count: count ?? 0 });
}
