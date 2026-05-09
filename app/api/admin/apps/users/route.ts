import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin, listAuthUsers } from "@/app/admin/_lib";

/* GET /api/admin/apps/users?email=X
 *   Substring email search across auth.users. Returns up to 25 matches,
 *   shape { users: [{ id, email, created_at }] }.
 *
 *   Powers the "add user override" picker on /admin/apps/[slug] when an
 *   admin wants to script it; the RSC version is server-rendered.
 */

export const dynamic = "force-dynamic";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 25;

export async function GET(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "forbidden" },
      { status: 403 }
    );
  }

  const email = req.nextUrl.searchParams.get("email")?.trim() ?? "";
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, MAX_LIMIT)
    : DEFAULT_LIMIT;

  if (!email) {
    return NextResponse.json({ users: [] });
  }

  const { rows } = await listAuthUsers({
    page: 1,
    perPage: limit,
    emailLike: email,
  });

  return NextResponse.json({
    users: rows.map((r) => ({
      id: r.id,
      email: r.email,
      created_at: r.created_at,
    })),
  });
}
