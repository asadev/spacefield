import { NextResponse } from "next/server";

import { checkIsAdmin } from "@/app/admin/_lib";
import { loadAllTools } from "@/app/admin/tools-catalog/_data";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/tools-catalog/list
 *
 * Optional helper that returns the same merged list the catalog page
 * renders. Useful for client-side refreshes (e.g. an auto-poll panel)
 * or future admin-side scripting. Admin-gated.
 *
 * Query params:
 *   q         — search substring (matches name/description/source)
 *   source    — app-registry | skill-code | skill-custom
 *   category  — exact category match
 */
export async function GET(req: Request): Promise<Response> {
  const auth = await checkIsAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason === "no-user" ? "not signed in" : "not authorized" },
      { status: auth.reason === "no-user" ? 401 : 403 }
    );
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const source = (url.searchParams.get("source") ?? "").trim();
  const category = (url.searchParams.get("category") ?? "").trim();

  const { rows, categories, counts } = await loadAllTools();

  const filtered = rows.filter((r) => {
    if (source && r.source !== source) return false;
    if (category && r.category !== category) return false;
    if (q) {
      const hay =
        `${r.name} ${r.display_name} ${r.description} ${r.source_id}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return NextResponse.json({
    rows: filtered,
    categories,
    counts,
  });
}
