import { NextResponse, type NextRequest } from "next/server";
import { getDefaultPipeline } from "@/app/tools/crm/_data";
import { jsonError, readJson, requireUser } from "../../_helpers";
import { leadConvert } from "../../_schemas";

/* POST /api/crm/leads/convert
 *   body: { id, dealName, dealAmount?, dealCurrency?, closeDate? }
 *   1. Reads the lead.
 *   2. Creates a contact from the lead's first/last/email/phone.
 *   3. Creates a deal in the workspace's default pipeline (first stage).
 *   4. Flips lead.status='converted' and links converted_contact_id +
 *      converted_deal_id so history is preserved.
 *
 * Done as 4 sequential writes, RLS-checked at each. We don't wrap in a
 * transaction — Supabase's user-scoped client doesn't expose `BEGIN`. If a
 * write fails midway, the lead row is unchanged and the orphan rows will
 * be rare; Phase 2 can add a cleanup endpoint if needed.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body.ok) return body.response;

  const parsed = leadConvert.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  // 1. Read the lead.
  const { data: lead, error: leadErr } = await auth.supabase
    .from("crm_leads")
    .select("*")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (leadErr) return jsonError(leadErr.message, 500);
  if (!lead) return jsonError("lead_not_found", 404);
  if (lead.status === "converted") {
    return jsonError("already_converted", 409);
  }

  // 2. Create a contact.
  const { data: contact, error: cErr } = await auth.supabase
    .from("crm_contacts")
    .insert({
      workspace_id: lead.workspace_id,
      first_name: lead.first_name,
      last_name: lead.last_name,
      email: lead.email,
      phone: lead.phone,
      visibility: lead.visibility,
      owner_id: lead.owner_id,
      created_by: auth.user.id,
    })
    .select("*")
    .single();
  if (cErr) return jsonError(cErr.message, 500);

  // 3. Create a deal in the default pipeline.
  const def = await getDefaultPipeline(lead.workspace_id);
  if (!def || def.stages.length === 0) {
    return jsonError("no pipeline configured", 409);
  }
  const { data: deal, error: dErr } = await auth.supabase
    .from("crm_deals")
    .insert({
      workspace_id: lead.workspace_id,
      pipeline_id: def.id,
      stage_id: def.stages[0].id,
      name: parsed.data.dealName,
      amount: parsed.data.dealAmount ?? null,
      currency: parsed.data.dealCurrency ?? "USD",
      close_date: parsed.data.closeDate ?? null,
      primary_contact_id: contact.id,
      visibility: lead.visibility,
      owner_id: lead.owner_id,
      assignee_ids: lead.owner_id ? [lead.owner_id] : [],
      created_by: auth.user.id,
    })
    .select("*")
    .single();
  if (dErr) return jsonError(dErr.message, 500);

  // 4. Flip lead.status + link.
  const { data: updatedLead, error: uErr } = await auth.supabase
    .from("crm_leads")
    .update({
      status: "converted",
      converted_contact_id: contact.id,
      converted_deal_id: deal.id,
    })
    .eq("id", lead.id)
    .select("*")
    .single();
  if (uErr) return jsonError(uErr.message, 500);

  return NextResponse.json({
    lead: updatedLead,
    contact,
    deal,
  });
}
