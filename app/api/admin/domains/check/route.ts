import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { dnsCname, dnsTxt } from "@/lib/domains/verify";

export const dynamic = "force-dynamic";

/* GET /api/admin/domains/check?domain=example.com
 *
 * Live DNS debugging endpoint. Resolves both
 *   _spacefield-verify.<domain> TXT
 *   <domain> CNAME
 * and reports whether either matches what we have on file. Useful when
 * a customer claims their records are correct but the verify button
 * keeps coming up empty — this returns the raw resolver output.
 *
 * Admin-only. We don't write anything; this is purely a probe.
 */

export async function GET(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "forbidden" },
      { status: 403 }
    );
  }

  const domain = (req.nextUrl.searchParams.get("domain") ?? "").trim();
  if (!domain) {
    return NextResponse.json({ error: "missing domain" }, { status: 400 });
  }

  // Optional row lookup so we can include the on-file txt token + cname
  // target in the response — that's what we'll match against when the
  // admin clicks Verify.
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("workspace_custom_domains")
    .select("id, domain, txt_token, cname_target")
    .eq("domain", domain.toLowerCase())
    .maybeSingle();

  const [txt_records, cname_records] = await Promise.all([
    dnsTxt(domain),
    dnsCname(domain),
  ]);

  const expectedToken =
    typeof row?.txt_token === "string" ? row.txt_token : null;
  const expectedCname = (
    typeof row?.cname_target === "string" && row.cname_target.length > 0
      ? row.cname_target
      : "cname.vercel-dns.com"
  ).toLowerCase();

  const txt_match = expectedToken
    ? txt_records.some((r) => r.trim() === expectedToken)
    : false;
  const cname_match = cname_records.some((r) => stripDot(r) === stripDot(expectedCname));

  return NextResponse.json({
    domain: domain.toLowerCase(),
    on_file: row
      ? {
          id: row.id,
          txt_token: expectedToken,
          cname_target: expectedCname,
        }
      : null,
    txt_records,
    cname_records,
    txt_match,
    cname_match,
  });
}

function stripDot(s: string): string {
  const t = s.trim().toLowerCase();
  return t.endsWith(".") ? t.slice(0, -1) : t;
}
