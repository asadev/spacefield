import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { safeErrorMessage } from "@/lib/safe-error";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/invoices
 *
 * Query params (all optional):
 *   ?status=draft|sent|paid|overdue|void|refunded
 *   ?user_id=<uuid>
 *   ?overdue=true       — due_date < today AND status NOT IN paid/void/refunded
 *   ?limit=50 (default 50, max 200)
 */
export async function GET(req: NextRequest) {
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "admin.invoices.list.auth",
          fallback: "forbidden",
        }),
      },
      { status: 403 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const user_id = sp.get("user_id");
  const overdue = sp.get("overdue") === "true";
  const limitRaw = Number(sp.get("limit") ?? 50);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));

  const admin = createAdminClient();
  let query = admin
    .from("invoices")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (user_id) query = query.eq("user_id", user_id);
  if (overdue) {
    const todayISO = new Date().toISOString().slice(0, 10);
    query = query
      .lt("due_date", todayISO)
      .not("status", "in", "(paid,void,refunded)");
  }

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json(
      {
        error: safeErrorMessage(error, {
          source: "admin.invoices.list",
          userId: auth.userId,
          fallback: "invoices_list_failed",
        }),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, rows: data ?? [], count: count ?? 0 });
}
