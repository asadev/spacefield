import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { safeErrorMessage } from "@/lib/safe-error";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/invoices/[id]
 *
 * Returns the invoice + any refunds attached to the same user.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "admin.invoices.get.auth",
          fallback: "forbidden",
        }),
      },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      {
        error: safeErrorMessage(error, {
          source: "admin.invoices.get",
          userId: auth.userId,
          fallback: "invoice_get_failed",
        }),
      },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const invoice = data as { user_id: string | null };
  const relatedRefundsRes = invoice.user_id
    ? await admin
        .from("refunds")
        .select("id, amount_cents, currency, status, created_at, processed_at")
        .eq("user_id", invoice.user_id)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };

  return NextResponse.json({
    ok: true,
    invoice: data,
    related_refunds: relatedRefundsRes.data ?? [],
  });
}
