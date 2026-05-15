import { NextResponse, type NextRequest } from "next/server";

import { withApiHandler } from "@/lib/api-wrap";
import { runGlobalSearch } from "@/lib/search/query";

/* GET /api/search?q=<query>&limit=<n>
 *
 * Returns grouped search results:
 *
 *   {
 *     query: "buy",
 *     total: 12,
 *     groups: [
 *       { kind: "task", label: "Tasks", items: [...] },
 *       { kind: "crm_contact", label: "Contacts", items: [...] },
 *       ...
 *     ]
 *   }
 *
 * Visibility is enforced by the global_search RPC + RLS on
 * search_documents — there is no explicit workspace_id parameter.
 *
 * Rate-limited per-user to keep the command palette's typeahead from
 * hammering Postgres if someone holds down a key.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handler(req: NextRequest) {
  const url = req.nextUrl;
  const q = (url.searchParams.get("q") ?? "").trim();
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 30;

  if (!q) {
    return NextResponse.json({ query: "", total: 0, groups: [] });
  }

  const response = await runGlobalSearch(q, {
    limit: Number.isFinite(limit) ? limit : 30,
  });
  return NextResponse.json(response);
}

export const GET = withApiHandler(handler, {
  source: "search.global",
  rateLimit: { count: 120, window_sec: 60 },
});
