import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revealDocNumber } from "@/lib/people/encryption";
import { logAudit } from "@/lib/admin/audit";

/**
 * POST /api/people/documents/[id]/reveal
 *
 * SC-005 — surfaces the decrypted Emirates ID / visa / passport
 * number. Gated to HR (workspace owner or admin) OR the underlying
 * employee themself. Every call is appended to admin_audit_log.
 *
 * Body: none. The doc id is the route param.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Look up the doc → employee → workspace so we can do authz before
  // calling the decrypt RPC. Service-role client because the new RLS
  // policy denies SELECT to non-HR/non-self by design — we run the
  // authorisation logic in app code with full visibility.
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("employee_documents")
    .select("id, employee_id")
    .eq("id", id)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { data: emp } = await admin
    .from("employees")
    .select("id, workspace_id, user_id")
    .eq("id", doc.employee_id)
    .maybeSingle();
  if (!emp) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const isSelf = emp.user_id === u.user.id;
  let isHr = false;
  if (!isSelf) {
    const { data: mem } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", emp.workspace_id)
      .eq("user_id", u.user.id)
      .maybeSingle();
    isHr = mem?.role === "owner" || mem?.role === "admin";
  }
  if (!isSelf && !isHr) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let number: string | null;
  try {
    number = await revealDocNumber(id);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? "decrypt_failed" },
      { status: 500 },
    );
  }

  // Audit every reveal — PDPL access log. Best-effort (logAudit
  // swallows errors so the primary action still completes).
  await logAudit({
    admin_email: u.user.email ?? u.user.id,
    action: "employee_document.reveal",
    target_id: id,
    target_type: "employee_document",
    payload: {
      doc_id: id,
      actor_id: u.user.id,
      employee_id: emp.id,
      workspace_id: emp.workspace_id,
      via: isSelf ? "self" : "hr",
    },
  });

  return NextResponse.json({ number });
}
