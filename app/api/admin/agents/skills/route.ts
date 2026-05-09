import { NextResponse } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { loadSkillIds } from "@/app/admin/agents/_data";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/agents/skills
 *
 * Returns the live skill registry as a flat list of ids. Backs the
 * skills picker for any clients that prefer to fetch lazily instead of
 * receiving the list as a prop.
 */
export async function GET() {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "forbidden" },
      { status: 403 }
    );
  }

  const ids = await loadSkillIds();
  return NextResponse.json({ ok: true, skills: ids });
}
