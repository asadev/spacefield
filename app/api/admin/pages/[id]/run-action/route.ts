import { NextResponse, type NextRequest } from "next/server";

import { runBlockAction } from "@/app/admin/pages/_actions";
import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";

import type { AdminPageBlockRow } from "@/app/admin/_types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/pages/[id]/run-action
 *
 * Body shapes accepted (FormData OR JSON):
 *   { block_id: string, ...payload }
 *
 * Behaviour:
 *   - JSON request → returns JSON: { ok, error?, result?, duration_ms }
 *   - FormData → 303 redirect back to the public viewer at
 *                /admin/custom/[id]?ran=<block_id> so the admin sees
 *                the page reload after running the action. The audit
 *                log holds the canonical record of inputs+outputs.
 *
 * Audit: written by `runBlockAction` server action (admin_page_block.run_action).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "forbidden" },
      { status: 403 }
    );
  }

  const { id: pageId } = await ctx.params;
  const contentType = req.headers.get("content-type") ?? "";

  let blockId = "";
  let payload: Record<string, unknown> = {};
  let isForm = false;

  if (contentType.includes("application/json")) {
    let parsed: unknown = null;
    try {
      parsed = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "invalid_json" },
        { status: 400 }
      );
    }
    const obj =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    blockId = String(obj.block_id ?? "").trim();
    const rest = { ...obj };
    delete rest.block_id;
    if (rest.payload && typeof rest.payload === "object" && !Array.isArray(rest.payload)) {
      payload = rest.payload as Record<string, unknown>;
    } else {
      payload = rest;
    }
  } else {
    isForm = true;
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { ok: false, error: "invalid_form" },
        { status: 400 }
      );
    }
    blockId = String(form.get("block_id") ?? "").trim();
    for (const [k, v] of form.entries()) {
      if (k === "block_id") continue;
      payload[k] = typeof v === "string" ? v : v.name;
    }
  }

  if (!blockId) {
    return NextResponse.json(
      { ok: false, error: "block_id_required" },
      { status: 400 }
    );
  }

  // Sanity-check that the referenced block belongs to this page (so we
  // don't accept cross-page block IDs through a tampered URL).
  const sb = createAdminClient();
  const { data: blockRow } = await sb
    .from("admin_page_blocks")
    .select("id, page_id")
    .eq("id", blockId)
    .maybeSingle();
  const block = blockRow as Pick<AdminPageBlockRow, "id" | "page_id"> | null;
  if (!block) {
    return NextResponse.json(
      { ok: false, error: "block_not_found" },
      { status: 404 }
    );
  }
  if (block.page_id !== pageId) {
    return NextResponse.json(
      { ok: false, error: "block_belongs_to_other_page" },
      { status: 400 }
    );
  }

  const out = await runBlockAction({ blockId, payload });

  if (isForm) {
    // For form submissions from the rendered viewer we redirect back so
    // the page re-runs with the latest data. We avoid leaking error
    // bodies into the URL — admins can read the audit log for details.
    const url = new URL(req.url);
    const redirectTo = `/admin/custom/${encodeURIComponent(pageId)}?ran=${encodeURIComponent(
      blockId
    )}&ok=${out.ok ? 1 : 0}`;
    return NextResponse.redirect(new URL(redirectTo, url.origin), { status: 303 });
  }

  return NextResponse.json(out, { status: out.ok ? 200 : 500 });
}
