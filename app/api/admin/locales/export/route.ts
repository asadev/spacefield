import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "@/app/admin/_audit";
import { assertAdmin } from "@/app/admin/_lib";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/locales/export?code=<locale_code>
 * Returns all strings for the given locale as a JSON object suitable
 * for `bulkImport`. Audited as `locale_string.export`.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "not authorized" },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  if (!code) {
    return NextResponse.json({ error: "missing code" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify the locale exists so we don't dump empty for a typo.
  const { data: localeRow } = await admin
    .from("locales")
    .select("code")
    .eq("code", code)
    .maybeSingle();
  if (!localeRow) {
    return NextResponse.json({ error: "locale not found" }, { status: 404 });
  }

  // Pull all strings. Page in chunks of 1000 in case there are many.
  const PAGE = 1000;
  const out: Record<string, string> = {};
  let from = 0;
  while (true) {
    const { data, error } = await admin
      .from("locale_strings")
      .select("string_key, value")
      .eq("locale_code", code)
      .order("string_key", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const rows = (data ?? []) as { string_key: string; value: string }[];
    for (const r of rows) out[r.string_key] = r.value;
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  await recordAdminAction({
    action: "locale_string.export",
    targetType: "locale",
    targetId: code,
    metadata: { count: Object.keys(out).length },
  });

  const filename = `locale-${code}.json`;
  return new NextResponse(JSON.stringify(out, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
