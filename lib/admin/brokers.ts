import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

export type BrokerStatus = "pending" | "verified" | "rejected" | "suspended";

export type BrokerRow = {
  id: string;
  user_id: string | null;
  full_name: string;
  firm: string | null;
  photo_url: string | null;
  bio: string | null;
  primary_region: string | null;
  regions: string[];
  specialties: string[];
  languages: string[];
  years_experience: number | null;
  public_email: string | null;
  public_phone: string | null;
  website: string | null;
  linkedin: string | null;
  cross_border_expertise: string[];
  status: BrokerStatus;
  verified_at: string | null;
  featured: boolean;
  created_at: string;
  updated_at: string;
};

const BROKER_COLUMNS =
  "id, user_id, full_name, firm, photo_url, bio, primary_region, regions, specialties, languages, years_experience, public_email, public_phone, website, linkedin, cross_border_expertise, status, verified_at, featured, created_at, updated_at";

/**
 * Admin: list all brokers regardless of status. Optional status filter.
 * Returns newest-first by created_at. Uses the service-role admin client
 * so pending/rejected/suspended rows are visible (the public RLS policy
 * only exposes verified). Gated by requireAdmin() at the top of every
 * function so a non-admin call short-circuits before any DB access.
 */
export async function listBrokersAdmin(
  statusFilter?: BrokerStatus | "all"
): Promise<{ rows: BrokerRow[]; error: string | null }> {
  await requireAdmin();
  try {
    const supabase = createAdminClient();
    let q = supabase
      .from("brokers")
      .select(BROKER_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(500);
    if (statusFilter && statusFilter !== "all") {
      q = q.eq("status", statusFilter);
    }
    const { data, error } = await q;
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []) as BrokerRow[], error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getBrokerAdmin(
  id: string
): Promise<{ row: BrokerRow | null; error: string | null }> {
  await requireAdmin();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("brokers")
      .select(BROKER_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) return { row: null, error: error.message };
    return { row: (data as BrokerRow | null) ?? null, error: null };
  } catch (e) {
    return { row: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setBrokerStatus(id: string, status: BrokerStatus) {
  await requireAdmin();
  const supabase = createAdminClient();
  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "verified") patch.verified_at = new Date().toISOString();
  const { error } = await supabase.from("brokers").update(patch).eq("id", id);
  if (error) throw new Error(`Failed to set broker status: ${error.message}`);
}

export async function setBrokerFeatured(id: string, featured: boolean) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("brokers")
    .update({ featured, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Failed to set featured: ${error.message}`);
}

export async function deleteBroker(id: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase.from("brokers").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete broker: ${error.message}`);
}

/** Admin reads of inquiries for a given broker. */
export async function listInquiriesForBroker(brokerId: string): Promise<{
  rows: Array<{
    id: string;
    from_name: string;
    from_email: string;
    from_region: string | null;
    destination_region: string | null;
    message: string;
    created_at: string;
  }>;
  error: string | null;
}> {
  await requireAdmin();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("broker_inquiries")
      .select(
        "id, from_name, from_email, from_region, destination_region, message, created_at"
      )
      .eq("broker_id", brokerId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []) as never, error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) };
  }
}
