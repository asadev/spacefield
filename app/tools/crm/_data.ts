/* ─────────────────────────────────────────────────────────────────────────
 * CRM — server-side data helpers (server-only).
 * Backed by the user-scoped Supabase client (`@/lib/supabase/server`), so
 * every query is RLS-gated to the caller. Phase 2 surfaces import these
 * directly from server components / route handlers.
 * ───────────────────────────────────────────────────────────────────── */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  CrmActivity,
  CrmActivityListOpts,
  CrmCompany,
  CrmContact,
  CrmCustomField,
  CrmDeal,
  CrmDealListOpts,
  CrmInventoryItem,
  CrmInventoryListOpts,
  CrmLead,
  CrmLeadListOpts,
  CrmListOpts,
  CrmPipeline,
  CrmPipelineStage,
  CrmPipelineWithStages,
  CrmRecordType,
  CrmSavedView,
  CrmSavedViewRecordType,
  CrmTag,
} from "./types";

// ─── pipelines + stages ─────────────────────────────────────────────────

/**
 * Returns the workspace's default pipeline (or first one ordered by
 * `position`) hydrated with its stages, ordered. Returns null if no
 * pipeline exists yet — caller must handle (workspace-create trigger
 * normally seeds one, but workspaces created before this migration may
 * have been backfilled).
 */
export async function getDefaultPipeline(
  workspaceId: string
): Promise<CrmPipelineWithStages | null> {
  const supabase = await createClient();

  const { data: pipelines, error: pErr } = await supabase
    .from("crm_pipelines")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("is_default", { ascending: false })
    .order("position", { ascending: true })
    .limit(1);

  if (pErr || !pipelines || pipelines.length === 0) return null;
  const pipeline = pipelines[0] as CrmPipeline;

  const { data: stages, error: sErr } = await supabase
    .from("crm_pipeline_stages")
    .select("*")
    .eq("pipeline_id", pipeline.id)
    .order("position", { ascending: true });

  if (sErr) return { ...pipeline, stages: [] };
  return { ...pipeline, stages: (stages as CrmPipelineStage[]) ?? [] };
}

export async function listPipelines(
  workspaceId: string
): Promise<CrmPipelineWithStages[]> {
  const supabase = await createClient();
  const { data: pipelines } = await supabase
    .from("crm_pipelines")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true });

  if (!pipelines || pipelines.length === 0) return [];

  const ids = (pipelines as CrmPipeline[]).map((p) => p.id);
  const { data: stages } = await supabase
    .from("crm_pipeline_stages")
    .select("*")
    .in("pipeline_id", ids)
    .order("position", { ascending: true });

  const byPipeline = new Map<string, CrmPipelineStage[]>();
  ((stages as CrmPipelineStage[]) ?? []).forEach((s) => {
    const arr = byPipeline.get(s.pipeline_id) ?? [];
    arr.push(s);
    byPipeline.set(s.pipeline_id, arr);
  });

  return (pipelines as CrmPipeline[]).map((p) => ({
    ...p,
    stages: byPipeline.get(p.id) ?? [],
  }));
}

// ─── deals ──────────────────────────────────────────────────────────────

export async function listDeals(
  workspaceId: string,
  opts: CrmDealListOpts = {}
): Promise<CrmDeal[]> {
  const supabase = await createClient();
  let q = supabase
    .from("crm_deals")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (opts.pipelineId) q = q.eq("pipeline_id", opts.pipelineId);
  if (opts.stageId) q = q.eq("stage_id", opts.stageId);
  if (opts.ownerId) q = q.eq("owner_id", opts.ownerId);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.search) q = q.ilike("name", `%${opts.search}%`);

  q = q.order("position", { ascending: true }).order("created_at", {
    ascending: false,
  });

  if (opts.limit) q = q.limit(opts.limit);
  if (opts.cursor) q = q.lt("created_at", opts.cursor);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as CrmDeal[]) ?? [];
}

export interface CrmDealHydrated extends CrmDeal {
  company: CrmCompany | null;
  primary_contact: CrmContact | null;
  stage: CrmPipelineStage | null;
  tags: CrmTag[];
}

/**
 * Reads a deal joined with its company, primary contact, current stage,
 * and the tag rows attached to it. Returns null on RLS-block / not-found.
 */
export async function getDealById(id: string): Promise<CrmDealHydrated | null> {
  const supabase = await createClient();
  const { data: deal } = await supabase
    .from("crm_deals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!deal) return null;
  const d = deal as CrmDeal;

  const [companyRes, contactRes, stageRes, tagsRes] = await Promise.all([
    d.company_id
      ? supabase
          .from("crm_companies")
          .select("*")
          .eq("id", d.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    d.primary_contact_id
      ? supabase
          .from("crm_contacts")
          .select("*")
          .eq("id", d.primary_contact_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("crm_pipeline_stages")
      .select("*")
      .eq("id", d.stage_id)
      .maybeSingle(),
    supabase
      .from("crm_record_tags")
      .select("tag:crm_tags(*)")
      .eq("record_type", "deal")
      .eq("record_id", d.id),
  ]);

  type TagRow = { tag: CrmTag | null };
  const tags = ((tagsRes.data as TagRow[] | null) ?? [])
    .map((row) => row.tag)
    .filter((t): t is CrmTag => t !== null);

  return {
    ...d,
    company: (companyRes.data as CrmCompany | null) ?? null,
    primary_contact: (contactRes.data as CrmContact | null) ?? null,
    stage: (stageRes.data as CrmPipelineStage | null) ?? null,
    tags,
  };
}

// ─── contacts ───────────────────────────────────────────────────────────

export async function listContacts(
  workspaceId: string,
  opts: CrmListOpts = {}
): Promise<CrmContact[]> {
  const supabase = await createClient();
  let q = supabase
    .from("crm_contacts")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (opts.ownerId) q = q.eq("owner_id", opts.ownerId);
  if (opts.search) {
    const s = `%${opts.search}%`;
    q = q.or(
      `first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},phone.ilike.${s}`
    );
  }

  q = q.order("created_at", { ascending: false });
  if (opts.limit) q = q.limit(opts.limit);
  if (opts.cursor) q = q.lt("created_at", opts.cursor);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as CrmContact[]) ?? [];
}

export async function getContactById(id: string): Promise<CrmContact | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as CrmContact | null) ?? null;
}

// ─── companies ──────────────────────────────────────────────────────────

export async function listCompanies(
  workspaceId: string,
  opts: CrmListOpts = {}
): Promise<CrmCompany[]> {
  const supabase = await createClient();
  let q = supabase
    .from("crm_companies")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (opts.ownerId) q = q.eq("owner_id", opts.ownerId);
  if (opts.search) q = q.ilike("name", `%${opts.search}%`);

  q = q.order("created_at", { ascending: false });
  if (opts.limit) q = q.limit(opts.limit);
  if (opts.cursor) q = q.lt("created_at", opts.cursor);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as CrmCompany[]) ?? [];
}

export async function getCompanyById(id: string): Promise<CrmCompany | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_companies")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as CrmCompany | null) ?? null;
}

// ─── leads ──────────────────────────────────────────────────────────────

export async function listLeads(
  workspaceId: string,
  opts: CrmLeadListOpts = {}
): Promise<CrmLead[]> {
  const supabase = await createClient();
  let q = supabase
    .from("crm_leads")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (opts.ownerId) q = q.eq("owner_id", opts.ownerId);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.search) {
    const s = `%${opts.search}%`;
    q = q.or(
      `first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},source.ilike.${s}`
    );
  }

  q = q.order("created_at", { ascending: false });
  if (opts.limit) q = q.limit(opts.limit);
  if (opts.cursor) q = q.lt("created_at", opts.cursor);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as CrmLead[]) ?? [];
}

export async function getLeadById(id: string): Promise<CrmLead | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as CrmLead | null) ?? null;
}

// ─── inventory ──────────────────────────────────────────────────────────

export async function listInventory(
  workspaceId: string,
  opts: CrmInventoryListOpts = {}
): Promise<CrmInventoryItem[]> {
  const supabase = await createClient();
  let q = supabase
    .from("crm_inventory_items")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (opts.ownerId) q = q.eq("owner_id", opts.ownerId);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.category) q = q.eq("category", opts.category);
  if (opts.search) {
    const s = `%${opts.search}%`;
    q = q.or(`name.ilike.${s},sku.ilike.${s},description.ilike.${s}`);
  }

  q = q.order("created_at", { ascending: false });
  if (opts.limit) q = q.limit(opts.limit);
  if (opts.cursor) q = q.lt("created_at", opts.cursor);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as CrmInventoryItem[]) ?? [];
}

export async function getInventoryById(
  id: string
): Promise<CrmInventoryItem | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_inventory_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as CrmInventoryItem | null) ?? null;
}

// ─── activities ─────────────────────────────────────────────────────────

export async function listActivities(
  workspaceId: string,
  opts: CrmActivityListOpts = {}
): Promise<CrmActivity[]> {
  const supabase = await createClient();
  let q = supabase
    .from("crm_activities")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (opts.contactId) q = q.eq("contact_id", opts.contactId);
  if (opts.companyId) q = q.eq("company_id", opts.companyId);
  if (opts.dealId) q = q.eq("deal_id", opts.dealId);
  if (opts.leadId) q = q.eq("lead_id", opts.leadId);
  if (opts.kind) q = q.eq("kind", opts.kind);
  if (opts.completed === true) q = q.not("completed_at", "is", null);
  if (opts.completed === false) q = q.is("completed_at", null);

  q = q.order("created_at", { ascending: false });
  if (opts.limit) q = q.limit(opts.limit);
  if (opts.cursor) q = q.lt("created_at", opts.cursor);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as CrmActivity[]) ?? [];
}

export async function getActivityById(
  id: string
): Promise<CrmActivity | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_activities")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as CrmActivity | null) ?? null;
}

// ─── tags ───────────────────────────────────────────────────────────────

export async function listTags(workspaceId: string): Promise<CrmTag[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_tags")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as CrmTag[]) ?? [];
}

// ─── custom fields ──────────────────────────────────────────────────────

export async function listCustomFields(
  workspaceId: string,
  recordType?: CrmRecordType
): Promise<CrmCustomField[]> {
  const supabase = await createClient();
  let q = supabase
    .from("crm_custom_fields")
    .select("*")
    .eq("workspace_id", workspaceId);
  if (recordType) q = q.eq("record_type", recordType);
  q = q
    .order("record_type", { ascending: true })
    .order("position", { ascending: true });

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as CrmCustomField[]) ?? [];
}

// ─── saved views ────────────────────────────────────────────────────────

export async function listSavedViews(
  workspaceId: string,
  recordType?: CrmSavedViewRecordType
): Promise<CrmSavedView[]> {
  const supabase = await createClient();
  let q = supabase
    .from("crm_saved_views")
    .select("*")
    .eq("workspace_id", workspaceId);
  if (recordType) q = q.eq("record_type", recordType);
  q = q
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as CrmSavedView[]) ?? [];
}
