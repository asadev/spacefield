import { NextRequest, NextResponse } from "next/server";

import { checkIsAdmin } from "@/app/admin/_lib";
import { escapeCsvCell } from "@/lib/escape-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /admin/waitlist/export?q=
 *
 * Streams a CSV of waitlist_signups (optionally email-filtered). Admin
 * gated. Uses the service-role client to bypass RLS (the table has
 * RLS enabled with no policies — service role is the only reader).
 */
export async function GET(req: NextRequest) {
  const auth = await checkIsAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  const admin = createAdminClient();
  let query = admin
    .from("waitlist_signups")
    .select(
      "email_lower, role, source, created_at, ip_hash, user_agent"
    )
    .order("created_at", { ascending: false })
    .limit(50_000);

  if (q) {
    const needle = q.toLowerCase().replace(/[%,]/g, "");
    query = query.ilike("email_lower", `%${needle}%`);
  }

  const { data } = await query;
  const rows = (data ?? []) as Array<Record<string, unknown>>;

  const header = [
    "email_lower",
    "role",
    "source",
    "created_at",
    "ip_hash",
    "user_agent",
  ];

  const lines = [
    header.join(","),
    ...rows.map((r) => header.map((h) => escapeCsvCell(r[h])).join(",")),
  ];

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="waitlist-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
