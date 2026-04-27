import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/app/admin/_lib";

/**
 * POST /api/tools/disable
 *   body: { slug: string, disabled: boolean }
 *
 * Admin-only. Upserts a tool_settings row toggling the global kill
 * switch. When disabled=true, no workspace can install the tool — even
 * if a tier or per-workspace override allowed it.
 */
export async function POST(req: NextRequest) {
  const auth = await checkIsAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  let body: { slug?: string; disabled?: boolean };
  try {
    body = (await req.json()) as { slug?: string; disabled?: boolean };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const disabled = body.disabled === true;
  if (!slug) {
    return NextResponse.json({ error: "missing slug" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("tool_settings")
    .upsert(
      {
        slug,
        disabled,
        updated_by: auth.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" }
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
