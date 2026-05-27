import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  jsonError,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/history?workspace_id=...
 *   &from=YYYY-MM-DD&to=YYYY-MM-DD&target_type=contact|group|list&status=...
 *
 * Two row sources stream into one history view:
 *   1. whatsapp_send_jobs       — every bulk send (list / group target)
 *   2. whatsapp_send_log        — direct sends with no parent job
 *
 * For (1) we materialise a per-job aggregate by joining the row's
 * sent_count / failed_count counters AND fanning out into the per-contact
 * log for the delivered_count / read_count. For (2) each log row becomes
 * its own history entry with total_contacts=1.
 *
 * Response (UI unwraps `items`):
 *   { items: WaHistoryRow[] }
 *
 * Pagination is not yet exposed because the largest credible workload at
 * this stage (clothing shop ~10 sends/day) keeps the window well under
 * 500 rows; we can wire cursor when /admin/jobs replays larger histories.
 */

const HISTORY_PAGE_LIMIT = 500;

type HistoryRow = {
  id: string;
  created_at: string;
  target_type: "contact" | "group" | "list";
  target_id: string;
  target_name: string | null;
  message_preview: string;
  full_message: string | null;
  status: "queued" | "sent" | "delivered" | "read" | "failed" | "mixed";
  total_contacts: number;
  delivered_count: number;
  failed_count: number;
  read_count: number;
};

function previewOf(body: string | null | undefined): string {
  return (body ?? "").slice(0, 140);
}

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  const from = sp.get("from");
  const to = sp.get("to");
  const targetTypeFilter = sp.get("target_type");
  const statusFilter = sp.get("status");
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  const fromIso = from ? new Date(`${from}T00:00:00Z`).toISOString() : null;
  // `to` is inclusive day → push to next-midnight UTC.
  const toIso = to
    ? new Date(new Date(`${to}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000).toISOString()
    : null;

  // 1. ── jobs ────────────────────────────────────────────────────────────
  let jobsQuery = admin
    .from("whatsapp_send_jobs")
    .select(
      "id, target_type, target_id, status, message_template, total_contacts, sent_count, failed_count, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_PAGE_LIMIT);
  if (fromIso) jobsQuery = jobsQuery.gte("created_at", fromIso);
  if (toIso) jobsQuery = jobsQuery.lt("created_at", toIso);
  if (targetTypeFilter && targetTypeFilter !== "contact") {
    jobsQuery = jobsQuery.eq("target_type", targetTypeFilter);
  }

  // 2. ── one-off send_log rows that have no parent job ───────────────────
  let directQuery = admin
    .from("whatsapp_send_log")
    .select(
      "id, contact_id, to_number, body, status, sent_at, job_id",
    )
    .eq("workspace_id", workspaceId)
    .is("job_id", null)
    .order("sent_at", { ascending: false })
    .limit(HISTORY_PAGE_LIMIT);
  if (fromIso) directQuery = directQuery.gte("sent_at", fromIso);
  if (toIso) directQuery = directQuery.lt("sent_at", toIso);

  const [jobsRes, directRes] = await Promise.all([jobsQuery, directQuery]);
  if (jobsRes.error) return jsonError(jobsRes.error.message, 500);
  if (directRes.error) return jsonError(directRes.error.message, 500);

  type JobRow = {
    id: string;
    target_type: "contact" | "group" | "list";
    target_id: string;
    status: "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
    message_template: string;
    total_contacts: number;
    sent_count: number;
    failed_count: number;
    created_at: string;
  };
  type DirectRow = {
    id: string;
    contact_id: string | null;
    to_number: string | null;
    body: string | null;
    status: string;
    sent_at: string;
    job_id: string | null;
  };

  const jobs = (jobsRes.data ?? []) as JobRow[];
  const direct = (directRes.data ?? []) as DirectRow[];

  // Best-effort hydration for target labels — pull list/group/contact names
  // in one round-trip per kind.
  const listIds = jobs
    .filter((j) => j.target_type === "list")
    .map((j) => j.target_id);
  const groupIds = jobs
    .filter((j) => j.target_type === "group")
    .map((j) => j.target_id);
  const contactIds = [
    ...jobs.filter((j) => j.target_type === "contact").map((j) => j.target_id),
    ...direct.map((d) => d.contact_id).filter((id): id is string => !!id),
  ];

  const [listsRes, groupsRes, contactsRes] = await Promise.all([
    listIds.length > 0
      ? admin
          .from("whatsapp_lists")
          .select("id, name")
          .in("id", listIds)
      : Promise.resolve({ data: [], error: null }),
    groupIds.length > 0
      ? admin
          .from("whatsapp_groups")
          .select("id, name, evolution_group_id")
          .in("id", groupIds)
      : Promise.resolve({ data: [], error: null }),
    contactIds.length > 0
      ? admin
          .from("crm_contacts")
          .select("id, first_name, last_name, phone")
          .in("id", contactIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const listsById = new Map(
    (listsRes.data ?? []).map((l) => [
      (l as { id: string }).id,
      (l as { id: string; name: string | null }).name,
    ]),
  );
  const groupsById = new Map(
    (groupsRes.data ?? []).map((g) => [
      (g as { id: string }).id,
      (g as { id: string; name: string | null }).name,
    ]),
  );
  const contactsById = new Map(
    (contactsRes.data ?? []).map((c) => {
      const r = c as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        phone: string | null;
      };
      const name =
        [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.phone;
      return [r.id, name];
    }),
  );

  // For each job, aggregate read/delivered counts from send_log.
  let jobLogStats = new Map<
    string,
    { delivered: number; read: number; failed: number; total: number }
  >();
  if (jobs.length > 0) {
    const jobIds = jobs.map((j) => j.id);
    const { data: logRowsRaw } = await admin
      .from("whatsapp_send_log")
      .select("job_id, status")
      .in("job_id", jobIds);
    type LogRow = { job_id: string; status: string };
    const logRows = (logRowsRaw ?? []) as LogRow[];
    jobLogStats = new Map();
    for (const j of jobs) {
      jobLogStats.set(j.id, {
        delivered: 0,
        read: 0,
        failed: 0,
        total: j.total_contacts,
      });
    }
    for (const r of logRows) {
      const s = jobLogStats.get(r.job_id);
      if (!s) continue;
      if (r.status === "read") {
        s.read += 1;
        s.delivered += 1;
      } else if (r.status === "delivered") {
        s.delivered += 1;
      } else if (r.status === "failed") {
        s.failed += 1;
      }
    }
  }

  function jobAggregateStatus(j: JobRow): HistoryRow["status"] {
    if (j.status === "failed") return "failed";
    if (j.status === "queued" || j.status === "running") return "queued";
    if (j.status === "paused" || j.status === "cancelled") return "queued";
    const s = jobLogStats.get(j.id);
    if (!s) return "sent";
    if (s.failed > 0 && s.delivered === 0) return "failed";
    if (s.failed > 0 && s.delivered > 0) return "mixed";
    if (s.read >= s.total && s.total > 0) return "read";
    if (s.delivered >= s.total && s.total > 0) return "delivered";
    return "sent";
  }

  const jobRows: HistoryRow[] = jobs.map((j) => {
    const label =
      j.target_type === "list"
        ? listsById.get(j.target_id) ?? null
        : j.target_type === "group"
          ? groupsById.get(j.target_id) ?? null
          : contactsById.get(j.target_id) ?? null;
    const s = jobLogStats.get(j.id);
    return {
      id: `job:${j.id}`,
      created_at: j.created_at,
      target_type: j.target_type,
      target_id: j.target_id,
      target_name: label,
      message_preview: previewOf(j.message_template),
      full_message: j.message_template,
      status: jobAggregateStatus(j),
      total_contacts: j.total_contacts,
      delivered_count: s?.delivered ?? j.sent_count,
      failed_count: s?.failed ?? j.failed_count,
      read_count: s?.read ?? 0,
    };
  });

  const directRows: HistoryRow[] = direct.map((d) => {
    const name =
      (d.contact_id && contactsById.get(d.contact_id)) || d.to_number || "—";
    const status: HistoryRow["status"] =
      d.status === "delivered" || d.status === "read"
        ? (d.status as "delivered" | "read")
        : d.status === "failed"
          ? "failed"
          : d.status === "queued"
            ? "queued"
            : "sent";
    return {
      id: `log:${d.id}`,
      created_at: d.sent_at,
      target_type: "contact",
      target_id: d.contact_id ?? d.to_number ?? "",
      target_name: name,
      message_preview: previewOf(d.body),
      full_message: d.body,
      status,
      total_contacts: 1,
      delivered_count: status === "delivered" || status === "read" ? 1 : 0,
      failed_count: status === "failed" ? 1 : 0,
      read_count: status === "read" ? 1 : 0,
    };
  });

  let combined = [...jobRows, ...directRows];
  if (statusFilter) {
    combined = combined.filter((r) => r.status === statusFilter);
  }
  if (targetTypeFilter === "contact") {
    combined = combined.filter((r) => r.target_type === "contact");
  }
  combined.sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );

  return NextResponse.json({ items: combined.slice(0, HISTORY_PAGE_LIMIT) });
}
