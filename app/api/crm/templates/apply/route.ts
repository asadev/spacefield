/* ─────────────────────────────────────────────────────────────────────────
 * POST /api/crm/templates/apply
 *
 *   body: { workspace_id: string, template_id: string }
 *
 * Idempotent overlay: for each item in the named template, upsert by a
 * stable natural key. Never deletes user-added rows. Updates the
 * workspace_state row (`crm:template-id`) on success so the picker UI
 * can show "Current" + auto-apply skips already-applied workspaces.
 *
 * Auth gate: caller must be an admin/owner of the workspace. RLS will
 * also reject stage/pipeline/custom-field writes from non-admins, so
 * the gate here is for clean 403 error shapes — the database is the
 * security boundary, not this route.
 *
 * Default-pipeline behavior:
 *   - Set the template's default pipeline as default IFF either:
 *       (a) no pipeline currently has is_default=true, OR
 *       (b) the workspace has zero deals.
 *   - Otherwise leave defaults alone — the user has built up state we
 *     don't want to surprise them by re-pointing.
 * ───────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import { CRM_TEMPLATES } from "@/app/tools/crm/_templates/registry";
import type {
  CrmTemplate,
  TemplateCustomField,
  TemplateFieldType,
  TemplatePipeline,
} from "@/app/tools/crm/_templates/types";
import {
  jsonError,
  readJson,
  requireUser,
  requireWorkspaceMember,
} from "../../_helpers";

interface ApplyBody {
  workspace_id?: string;
  template_id?: string;
}

/* Map the template field-type vocabulary onto the DB enum. */
function mapFieldType(t: TemplateFieldType): {
  type:
    | "text"
    | "number"
    | "select"
    | "multiselect"
    | "date"
    | "currency"
    | "url"
    | "boolean";
} {
  switch (t) {
    case "phone":
    case "email":
    case "textarea":
      return { type: "text" };
    case "checkbox":
      return { type: "boolean" };
    case "currency":
      return { type: "currency" };
    case "select":
      return { type: "select" };
    case "multiselect":
      return { type: "multiselect" };
    case "date":
      return { type: "date" };
    case "url":
      return { type: "url" };
    case "number":
      return { type: "number" };
    case "text":
    default:
      return { type: "text" };
  }
}

function buildFieldOptions(field: TemplateCustomField): { value: string; label: string }[] {
  if (!field.options || field.options.length === 0) return [];
  return field.options.map((label) => ({ value: label, label }));
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const parsed = await readJson<ApplyBody>(req);
  if (!parsed.ok) return parsed.response;
  const { workspace_id, template_id } = parsed.body;
  if (!workspace_id || typeof workspace_id !== "string") {
    return jsonError("workspace_id required");
  }
  if (!template_id || typeof template_id !== "string") {
    return jsonError("template_id required");
  }

  const template: CrmTemplate | undefined = CRM_TEMPLATES[template_id];
  if (!template) return jsonError(`unknown template_id: ${template_id}`, 404);

  const member = await requireWorkspaceMember(auth.supabase, workspace_id);
  if (!member.ok) return member.response;

  // Admin/owner gate via the same RPC RLS uses internally.
  const { data: roleData, error: roleErr } = await auth.supabase.rpc(
    "workspace_role_of",
    { ws_id: workspace_id }
  );
  if (roleErr) return jsonError(roleErr.message, 500);
  const role = typeof roleData === "string" ? roleData : null;
  if (role !== "owner" && role !== "admin") {
    return jsonError("forbidden: admin or owner required", 403);
  }

  const supabase = auth.supabase;

  /* ── pipelines + stages ────────────────────────────────────────────── */
  // Read current pipelines to decide is_default behavior.
  const { data: existingPipelines, error: pipReadErr } = await supabase
    .from("crm_pipelines")
    .select("id, name, is_default")
    .eq("workspace_id", workspace_id);
  if (pipReadErr) return jsonError(pipReadErr.message, 500);

  const { count: dealCount, error: dealCountErr } = await supabase
    .from("crm_deals")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace_id);
  if (dealCountErr) return jsonError(dealCountErr.message, 500);

  const hasExistingDefault = (existingPipelines ?? []).some(
    (p) => p.is_default
  );
  const safeToFlipDefault = !hasExistingDefault || (dealCount ?? 0) === 0;

  for (let i = 0; i < template.pipelines.length; i++) {
    const tp: TemplatePipeline = template.pipelines[i];
    const matched = (existingPipelines ?? []).find((p) => p.name === tp.name);
    let pipelineId: string;
    if (matched) {
      pipelineId = matched.id;
    } else {
      const wantDefault = tp.is_default && safeToFlipDefault;
      // If we're inserting a default pipeline and another default exists,
      // demote the others first to maintain a single-default invariant.
      if (wantDefault && hasExistingDefault) {
        await supabase
          .from("crm_pipelines")
          .update({ is_default: false })
          .eq("workspace_id", workspace_id)
          .eq("is_default", true);
      }
      const { data: inserted, error: insErr } = await supabase
        .from("crm_pipelines")
        .insert({
          workspace_id,
          name: tp.name,
          is_default: wantDefault,
          position: i,
        })
        .select("id")
        .single();
      if (insErr || !inserted) return jsonError(insErr?.message ?? "pipeline insert failed", 500);
      pipelineId = inserted.id;
    }

    // Upsert each stage by (pipeline_id, name).
    for (let s = 0; s < tp.stages.length; s++) {
      const stage = tp.stages[s];
      const { data: existingStage } = await supabase
        .from("crm_pipeline_stages")
        .select("id")
        .eq("pipeline_id", pipelineId)
        .eq("name", stage.name)
        .maybeSingle();
      const row = {
        pipeline_id: pipelineId,
        name: stage.name,
        kind: stage.kind,
        position: s,
        probability: stage.probability,
        rot_days: stage.rot_days || null,
        color: stage.color,
      };
      if (existingStage) {
        const { error: upErr } = await supabase
          .from("crm_pipeline_stages")
          .update(row)
          .eq("id", existingStage.id);
        if (upErr) return jsonError(upErr.message, 500);
      } else {
        const { error: insStageErr } = await supabase
          .from("crm_pipeline_stages")
          .insert(row);
        if (insStageErr) return jsonError(insStageErr.message, 500);
      }
    }
  }

  /* ── custom fields ─────────────────────────────────────────────────── */
  for (const f of template.customFields) {
    const mapped = mapFieldType(f.field_type);
    const row = {
      workspace_id,
      record_type: f.record_type,
      key: f.field_key,
      label: f.label,
      type: mapped.type,
      options: buildFieldOptions(f),
      required: f.required ?? false,
      position: f.sort_order ?? 0,
    };
    const { data: existing } = await supabase
      .from("crm_custom_fields")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("record_type", f.record_type)
      .eq("key", f.field_key)
      .maybeSingle();
    if (existing) {
      const { error: upErr } = await supabase
        .from("crm_custom_fields")
        .update(row)
        .eq("id", existing.id);
      if (upErr) return jsonError(upErr.message, 500);
    } else {
      const { error: insErr } = await supabase
        .from("crm_custom_fields")
        .insert(row);
      if (insErr) return jsonError(insErr.message, 500);
    }
  }

  /* ── tags ──────────────────────────────────────────────────────────── */
  for (const t of template.tags) {
    const { data: existing } = await supabase
      .from("crm_tags")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("name", t.name)
      .maybeSingle();
    if (existing) {
      const { error: upErr } = await supabase
        .from("crm_tags")
        .update({ color: t.color })
        .eq("id", existing.id);
      if (upErr) return jsonError(upErr.message, 500);
    } else {
      const { error: insErr } = await supabase
        .from("crm_tags")
        .insert({ workspace_id, name: t.name, color: t.color });
      if (insErr) return jsonError(insErr.message, 500);
    }
  }

  /* ── workspace_state record ────────────────────────────────────────── */
  const stateValue = {
    template_id: template.id,
    applied_at: new Date().toISOString(),
  };
  const { error: stateErr } = await supabase
    .from("workspace_state")
    .upsert(
      {
        workspace_id,
        key: "crm:template-id",
        value: stateValue,
      },
      { onConflict: "workspace_id,key" }
    );
  if (stateErr) return jsonError(stateErr.message, 500);

  return NextResponse.json({
    ok: true,
    template_id: template.id,
    applied_at: stateValue.applied_at,
  });
}
