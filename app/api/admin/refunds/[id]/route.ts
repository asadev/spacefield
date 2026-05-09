import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/refunds/[id]
 *
 * Returns the refund row, the resolved user email, and any related
 * invoice (matched on external_payment_id).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "forbidden" },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("refunds")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const refund = data as { external_payment_id: string | null };
  const relatedInvoiceRes = refund.external_payment_id
    ? await admin
        .from("invoices")
        .select("id, number, status, total_cents, currency")
        .eq("external_invoice_id", refund.external_payment_id)
        .maybeSingle()
    : { data: null };

  return NextResponse.json({
    ok: true,
    refund: data,
    related_invoice: relatedInvoiceRes.data ?? null,
  });
}
