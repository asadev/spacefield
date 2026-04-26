import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuditEntry = {
  admin_email: string;
  action: string;
  target_id?: string | null;
  target_type?: string | null;
  payload?: Record<string, unknown>;
};

export type AuditLogRow = {
  id: number;
  admin_email: string;
  action: string;
  target_id: string | null;
  target_type: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

/**
 * Append an audit entry. Best-effort — if the table is missing or the insert
 * fails we log to stderr but never throw (audit failure should never block a
 * primary admin action).
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("admin_audit_log").insert({
      admin_email: entry.admin_email,
      action: entry.action,
      target_id: entry.target_id ?? null,
      target_type: entry.target_type ?? null,
      payload: entry.payload ?? {},
    });
    if (error) {
      console.error("[audit] insert failed:", error.message);
    }
  } catch (e) {
    console.error("[audit] exception:", e instanceof Error ? e.message : e);
  }
}

export type AuditFilters = {
  admin?: string;
  action?: string;
  since?: string; // ISO
  until?: string; // ISO
  limit?: number;
  offset?: number;
};

export async function listAudit(
  filters: AuditFilters = {}
): Promise<{ rows: AuditLogRow[]; total: number; error: string | null }> {
  try {
    const admin = createAdminClient();
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);

    let q = admin
      .from("admin_audit_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.admin) q = q.ilike("admin_email", `%${filters.admin}%`);
    if (filters.action) q = q.ilike("action", `%${filters.action}%`);
    if (filters.since) q = q.gte("created_at", filters.since);
    if (filters.until) q = q.lte("created_at", filters.until);

    const { data, error, count } = await q;
    if (error) return { rows: [], total: 0, error: error.message };
    return {
      rows: (data ?? []) as AuditLogRow[],
      total: count ?? 0,
      error: null,
    };
  } catch (e) {
    return {
      rows: [],
      total: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
