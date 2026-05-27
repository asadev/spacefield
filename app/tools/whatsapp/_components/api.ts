/* WhatsApp UI ↔ Spacefield API client.
 *
 * Every call goes through Spacefield's own `/api/whatsapp/*` (Agent A) —
 * never the Evolution gateway directly (would leak the gateway URL +
 * bypass workspace RLS).
 *
 * Each helper returns a discriminated union { ok: true, data } | { ok: false, error }
 * so call-sites can branch without try/catch noise. The HTTP layer treats
 * non-2xx responses as soft errors (returns { ok: false }) — only a network
 * fault throws to the caller.
 */

export type WaInstanceStatus =
  | "pending"
  | "qr_pending"
  | "connected"
  | "disconnected"
  | "banned"
  | "error";

export interface WaInstance {
  status: WaInstanceStatus;
  phone_number?: string | null;
  paired_at?: string | null;
  qr_code?: string | null;
  /** UTC iso timestamp of last activity (sent or received). */
  last_seen_at?: string | null;
  /** Days since the instance was created — used for the warm-up cap UI. */
  warmup_day?: number | null;
  /** Caps the user shouldn't exceed today / this hour. */
  daily_cap?: number | null;
  hourly_cap?: number | null;
  sent_today?: number | null;
  sent_this_hour?: number | null;
  /** Lightweight health hint computed server-side. */
  health?: "good" | "warming" | "warn" | "throttled" | "banned" | null;
}

export interface WaGroup {
  id: string;
  evolution_group_id: string;
  name: string;
  member_count: number;
  /** Optional preview fields populated when the server has them. */
  last_message_at?: string | null;
  last_message_preview?: string | null;
}

export interface WaList {
  id: string;
  name: string;
  contact_ids: string[];
  contact_count?: number | null;
  last_used_at?: string | null;
}

export interface WaJob {
  id: string;
  target_type: "contact" | "group" | "list";
  target_id: string;
  target_name?: string | null;
  status: "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
  message?: string | null;
  sent_count: number;
  total_contacts: number;
  failed_count?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
  estimated_finish_at?: string | null;
  created_at: string;
}

export interface WaJobLogEntry {
  id: string;
  contact_id: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  error_message?: string | null;
  sent_at?: string | null;
}

export interface WaMessage {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  contact_phone: string;
  direction: "inbound" | "outbound";
  body: string | null;
  media_url: string | null;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  created_at: string;
}

export interface WaContactSummary {
  contact_id: string | null;
  phone: string;
  name: string | null;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_direction: "inbound" | "outbound" | null;
}

export interface WaSendPayload {
  target_type: "contact" | "group" | "list";
  target_id: string;
  message: string;
  media_url?: string;
  /** Up to 5 variants for anti-ban variation on bulk sends. */
  template_variants?: string[];
}

export interface WaSendResult {
  job_id?: string;
  message_id?: string;
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; status?: number };

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = <T>(error: string, opts?: { code?: string; status?: number }): Result<T> => ({
  ok: false,
  error,
  ...(opts?.code ? { code: opts.code } : {}),
  ...(opts?.status ? { status: opts.status } : {}),
});

/** Wraps fetch with json + error normalisation.
 *
 * Server responses follow `{ error: "machine_code", message: "Human text" }`.
 * We surface the friendly `message` to users (falling back to `error`) and
 * keep the machine `code` + HTTP `status` separately so call-sites can branch
 * (e.g. render an Upgrade-to-Pro card specifically for 402 / pro_required).
 */
async function jsonFetch<T>(input: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const res = await fetch(input, {
      cache: "no-store",
      ...init,
      headers: {
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 404) return fail("Not found", { code: "not_found", status: 404 });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON response — propagate text snippet as the error
      return fail(text.slice(0, 240) || `http_${res.status}`, { status: res.status });
    }
    if (!res.ok) {
      const obj = (parsed && typeof parsed === "object" ? parsed : {}) as {
        error?: unknown;
        message?: unknown;
      };
      const code = typeof obj.error === "string" ? obj.error : undefined;
      const friendly =
        typeof obj.message === "string"
          ? obj.message
          : code || `http_${res.status}`;
      return fail(friendly, { code, status: res.status });
    }
    return ok((parsed ?? {}) as T);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Network error", {
      code: "network_error",
    });
  }
}

// ── instance ────────────────────────────────────────────────────────────

export function fetchInstanceStatus(workspaceId: string): Promise<Result<WaInstance>> {
  return jsonFetch<WaInstance>(
    `/api/whatsapp/instance/status?workspace_id=${encodeURIComponent(workspaceId)}`
  );
}

export function createInstance(
  workspaceId: string
): Promise<Result<{ instance_id: string; qr_code?: string | null }>> {
  return jsonFetch("/api/whatsapp/instance/create", {
    method: "POST",
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
}

export function connectInstance(
  workspaceId: string
): Promise<Result<{ qr_code: string | null; status: WaInstanceStatus }>> {
  return jsonFetch(
    `/api/whatsapp/instance/connect?workspace_id=${encodeURIComponent(workspaceId)}`
  );
}

export function deleteInstance(workspaceId: string): Promise<Result<{ deleted: boolean }>> {
  // Backend reads workspace_id from the query string (not body — DELETE bodies
  // are non-standard and many runtimes drop them silently).
  return jsonFetch(
    `/api/whatsapp/instance/delete?workspace_id=${encodeURIComponent(workspaceId)}`,
    { method: "DELETE" },
  );
}

// ── send + jobs ─────────────────────────────────────────────────────────

export function sendMessage(payload: WaSendPayload): Promise<Result<WaSendResult>> {
  return jsonFetch("/api/whatsapp/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchJobs(
  workspaceId: string,
  status?: string
): Promise<Result<WaJob[]>> {
  const q = new URLSearchParams({ workspace_id: workspaceId });
  if (status) q.set("status", status);
  return jsonFetch<WaJob[]>(`/api/whatsapp/jobs?${q.toString()}`);
}

export function patchJob(
  jobId: string,
  patch: { action: "pause" | "resume" | "cancel" }
): Promise<Result<WaJob>> {
  return jsonFetch(`/api/whatsapp/jobs/${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function fetchJobLog(
  workspaceId: string,
  jobId: string
): Promise<Result<WaJobLogEntry[]>> {
  const q = new URLSearchParams({ workspace_id: workspaceId });
  return jsonFetch<WaJobLogEntry[]>(
    `/api/whatsapp/jobs/${encodeURIComponent(jobId)}/log?${q.toString()}`
  );
}

// ── groups + lists ──────────────────────────────────────────────────────

export function fetchGroups(workspaceId: string, refresh?: boolean): Promise<Result<WaGroup[]>> {
  const q = new URLSearchParams({ workspace_id: workspaceId });
  if (refresh) q.set("refresh", "1");
  return jsonFetch<WaGroup[]>(`/api/whatsapp/groups?${q.toString()}`);
}

export function createGroup(
  workspaceId: string,
  name: string,
  contactIds: string[]
): Promise<Result<{ group: WaGroup }>> {
  return jsonFetch("/api/whatsapp/groups", {
    method: "POST",
    body: JSON.stringify({ workspace_id: workspaceId, name, contact_ids: contactIds }),
  });
}

export function fetchLists(workspaceId: string): Promise<Result<WaList[]>> {
  return jsonFetch<WaList[]>(
    `/api/whatsapp/lists?workspace_id=${encodeURIComponent(workspaceId)}`
  );
}

export function createList(
  workspaceId: string,
  name: string,
  contactIds: string[]
): Promise<Result<{ list: WaList }>> {
  return jsonFetch("/api/whatsapp/lists", {
    method: "POST",
    body: JSON.stringify({ workspace_id: workspaceId, name, contact_ids: contactIds }),
  });
}

export function updateList(
  workspaceId: string,
  list: WaList
): Promise<Result<{ list: WaList }>> {
  return jsonFetch("/api/whatsapp/lists", {
    method: "PUT",
    body: JSON.stringify({ workspace_id: workspaceId, ...list }),
  });
}

export function deleteList(
  workspaceId: string,
  listId: string
): Promise<Result<{ deleted: boolean }>> {
  return jsonFetch("/api/whatsapp/lists", {
    method: "DELETE",
    body: JSON.stringify({ workspace_id: workspaceId, id: listId }),
  });
}

// ── messages + conversations ────────────────────────────────────────────

export function fetchContactSummaries(
  workspaceId: string
): Promise<Result<WaContactSummary[]>> {
  return jsonFetch<WaContactSummary[]>(
    `/api/whatsapp/conversations?workspace_id=${encodeURIComponent(workspaceId)}`
  );
}

export function fetchMessages(
  workspaceId: string,
  contactId: string | null,
  phone?: string,
  before?: string
): Promise<Result<WaMessage[]>> {
  const q = new URLSearchParams({ workspace_id: workspaceId });
  if (contactId) q.set("contact_id", contactId);
  if (phone) q.set("phone", phone);
  if (before) q.set("before", before);
  return jsonFetch<WaMessage[]>(`/api/whatsapp/messages?${q.toString()}`);
}

// ── history ─────────────────────────────────────────────────────────────

export interface WaHistoryRow {
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
}

export function fetchHistory(
  workspaceId: string,
  opts?: { from?: string; to?: string; target_type?: string; status?: string }
): Promise<Result<WaHistoryRow[]>> {
  const q = new URLSearchParams({ workspace_id: workspaceId });
  if (opts?.from) q.set("from", opts.from);
  if (opts?.to) q.set("to", opts.to);
  if (opts?.target_type) q.set("target_type", opts.target_type);
  if (opts?.status) q.set("status", opts.status);
  return jsonFetch<WaHistoryRow[]>(`/api/whatsapp/history?${q.toString()}`);
}

export function fetchHistoryDetail(
  workspaceId: string,
  rowId: string
): Promise<Result<WaJobLogEntry[]>> {
  const q = new URLSearchParams({ workspace_id: workspaceId });
  return jsonFetch<WaJobLogEntry[]>(
    `/api/whatsapp/history/${encodeURIComponent(rowId)}?${q.toString()}`
  );
}

// ── contacts (fallback to CRM contacts when picker UI needed) ────────────

export interface WaCrmContact {
  id: string;
  workspace_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

/** Lists CRM contacts that have a phone number — these are the only ones
 * pickable for WhatsApp send. Server endpoint is provided by CRM lib (Agent
 * A surfaces a thin adapter at /api/whatsapp/contacts). When that endpoint
 * isn't present yet, we fall through to /api/crm/contacts which has long
 * existed. */
export async function fetchSendableContacts(
  workspaceId: string,
  query?: string
): Promise<Result<WaCrmContact[]>> {
  const q = new URLSearchParams({ workspace_id: workspaceId });
  if (query) q.set("q", query);
  q.set("has_phone", "1");

  const primary = await jsonFetch<WaCrmContact[]>(`/api/whatsapp/contacts?${q.toString()}`);
  if (primary.ok) return primary;
  if (primary.error !== "not_found") return primary;

  // Fallback to CRM endpoint. Its shape is `{ items: CrmContact[] }`, not a bare array —
  // so we use a wider type here and unwrap.
  const crmQ = new URLSearchParams({ workspace_id: workspaceId });
  if (query) crmQ.set("search", query);
  crmQ.set("limit", "200");
  const crm = await jsonFetch<{ items?: WaCrmContact[] }>(
    `/api/crm/contacts?${crmQ.toString()}`
  );
  if (!crm.ok) return crm;
  const list = (crm.data.items ?? []).filter((c) => !!(c.phone && c.phone.trim()));
  return ok(list);
}
