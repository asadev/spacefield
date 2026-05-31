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
  workspace_id: string;
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

/** Convenience around jsonFetch: every server route in /api/whatsapp returns
 * `{ items: T[] }` for list endpoints. This wrapper unwraps that envelope so
 * callers consume a bare array. Tolerates a missing/non-array `items` and
 * returns `[]` so a misbehaving server doesn't blow up the UI. (K-01/K-02:
 * server response shape drift caused `[...jobs].sort()` crashes when the UI
 * stored the envelope as the list.) */
async function jsonFetchItems<T>(input: string, init?: RequestInit): Promise<Result<T[]>> {
  const res = await jsonFetch<{ items?: T[] } | T[]>(input, init);
  if (!res.ok) return res;
  const raw = res.data as unknown;
  if (Array.isArray(raw)) return ok(raw as T[]);
  if (raw && typeof raw === "object" && Array.isArray((raw as { items?: T[] }).items)) {
    return ok((raw as { items: T[] }).items);
  }
  return ok([]);
}

/** Convenience around jsonFetch for create/get-single endpoints. Server returns
 * `{ item: T }`; we unwrap. Falls back to the raw payload as `T` for legacy
 * routes that already return a bare object. */
async function jsonFetchItem<T>(input: string, init?: RequestInit): Promise<Result<T>> {
  const res = await jsonFetch<{ item?: T } | T>(input, init);
  if (!res.ok) return res;
  const raw = res.data as unknown;
  if (raw && typeof raw === "object" && "item" in (raw as Record<string, unknown>)) {
    return ok((raw as { item: T }).item);
  }
  return ok(raw as T);
}

// ── instance ────────────────────────────────────────────────────────────

interface RawInstanceStatusResponse {
  instance_id?: string | null;
  status?: WaInstanceStatus | null;
  phone_number?: string | null;
  paired_at?: string | null;
  qr_code?: string | null;
  last_seen_at?: string | null;
  /** Top-level throttle fields the server now emits directly (AUD-02). We
   * prefer these when present and fall back to the nested `stats` shape for
   * back-compat. */
  warmup_day?: number | null;
  daily_cap?: number | null;
  hourly_cap?: number | null;
  sent_today?: number | null;
  sent_this_hour?: number | null;
  health?: WaInstance["health"];
  /** Server also packs throttle stats under `stats` — we flatten on read so the
   * UI can keep reading the older `instance.warmup_day / daily_cap / sent_today
   * / health` shape it was built against. (K-06) */
  stats?: {
    warmup_age_days?: number | null;
    daily_cap?: number | null;
    sent_last_day?: number | null;
    sent_last_hour?: number | null;
  } | null;
}

export async function fetchInstanceStatus(
  workspaceId: string,
): Promise<Result<WaInstance>> {
  const res = await jsonFetch<RawInstanceStatusResponse>(
    `/api/whatsapp/instance/status?workspace_id=${encodeURIComponent(workspaceId)}`,
  );
  if (!res.ok) return res;
  const raw = res.data;
  const stats = raw.stats ?? null;
  // Prefer the server's top-level fields (AUD-02); fall back to the nested
  // `stats` bundle for back-compat with an older payload shape.
  const warmupDay =
    typeof raw.warmup_day === "number"
      ? raw.warmup_day
      : typeof stats?.warmup_age_days === "number"
        ? stats.warmup_age_days
        : null;
  const dailyCap =
    typeof raw.daily_cap === "number"
      ? raw.daily_cap
      : typeof stats?.daily_cap === "number"
        ? stats.daily_cap
        : null;
  const hourlyCap =
    typeof raw.hourly_cap === "number" ? raw.hourly_cap : null;
  const sentToday =
    typeof raw.sent_today === "number"
      ? raw.sent_today
      : typeof stats?.sent_last_day === "number"
        ? stats.sent_last_day
        : null;
  const sentHour =
    typeof raw.sent_this_hour === "number"
      ? raw.sent_this_hour
      : typeof stats?.sent_last_hour === "number"
        ? stats.sent_last_hour
        : null;

  // Prefer the server-computed health hint; otherwise synthesize one locally so
  // the UI's Connected card always shows something useful. The local path also
  // adds a "warn" state (≥85% of the daily cap) the server doesn't emit.
  let health: WaInstance["health"] = raw.health ?? null;
  if (!health) {
    if (raw.status === "banned") health = "banned";
    else if (raw.status === "connected") {
      if (warmupDay !== null && warmupDay < 14) health = "warming";
      else if (dailyCap !== null && sentToday !== null && sentToday >= dailyCap)
        health = "throttled";
      else if (
        dailyCap !== null &&
        sentToday !== null &&
        sentToday >= Math.floor(dailyCap * 0.85)
      )
        health = "warn";
      else health = "good";
    }
  } else if (
    health === "good" &&
    dailyCap !== null &&
    sentToday !== null &&
    sentToday >= Math.floor(dailyCap * 0.85)
  ) {
    // Server reports "good" but we're near the daily cap — surface the softer
    // "warn" so the "Approaching daily cap" banner still fires.
    health = "warn";
  }

  const flat: WaInstance = {
    status: (raw.status ?? "disconnected") as WaInstanceStatus,
    phone_number: raw.phone_number ?? null,
    paired_at: raw.paired_at ?? null,
    qr_code: raw.qr_code ?? null,
    last_seen_at: raw.last_seen_at ?? null,
    warmup_day: warmupDay,
    daily_cap: dailyCap,
    hourly_cap: hourlyCap,
    sent_today: sentToday,
    sent_this_hour: sentHour,
    health,
  };
  return ok(flat);
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
  return jsonFetchItems<WaJob>(`/api/whatsapp/jobs?${q.toString()}`);
}

export async function patchJob(
  jobId: string,
  patch: { action: "pause" | "resume" | "cancel" }
): Promise<Result<WaJob>> {
  // Server returns `{ item }` for the patched row — unwrap so the caller can
  // splice it back into a WaJob[] without an extra `.item` hop.
  return jsonFetchItem<WaJob>(`/api/whatsapp/jobs/${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function fetchJobLog(
  workspaceId: string,
  jobId: string
): Promise<Result<WaJobLogEntry[]>> {
  const q = new URLSearchParams({ workspace_id: workspaceId });
  return jsonFetchItems<WaJobLogEntry>(
    `/api/whatsapp/jobs/${encodeURIComponent(jobId)}/log?${q.toString()}`
  );
}

// ── groups + lists ──────────────────────────────────────────────────────

export function fetchGroups(workspaceId: string, refresh?: boolean): Promise<Result<WaGroup[]>> {
  const q = new URLSearchParams({ workspace_id: workspaceId });
  if (refresh) q.set("refresh", "1");
  return jsonFetchItems<WaGroup>(`/api/whatsapp/groups?${q.toString()}`);
}

export function createGroup(
  workspaceId: string,
  name: string,
  contactIds: string[]
): Promise<Result<WaGroup>> {
  // K-07: server returns `{ item }`; we unwrap to a bare WaGroup so the caller
  // doesn't have to remember whether the envelope was `.group` or `.item`.
  return jsonFetchItem<WaGroup>("/api/whatsapp/groups", {
    method: "POST",
    body: JSON.stringify({ workspace_id: workspaceId, name, contact_ids: contactIds }),
  });
}

export function fetchLists(workspaceId: string): Promise<Result<WaList[]>> {
  return jsonFetchItems<WaList>(
    `/api/whatsapp/lists?workspace_id=${encodeURIComponent(workspaceId)}`
  );
}

export function createList(
  workspaceId: string,
  name: string,
  contactIds: string[]
): Promise<Result<WaList>> {
  // K-08: same as createGroup — unwrap `{ item }` to bare WaList.
  return jsonFetchItem<WaList>("/api/whatsapp/lists", {
    method: "POST",
    body: JSON.stringify({ workspace_id: workspaceId, name, contact_ids: contactIds }),
  });
}

export function updateList(
  workspaceId: string,
  list: WaList
): Promise<Result<WaList>> {
  return jsonFetchItem<WaList>("/api/whatsapp/lists", {
    method: "PUT",
    body: JSON.stringify({ workspace_id: workspaceId, ...list }),
  });
}

export function deleteList(
  workspaceId: string,
  listId: string
): Promise<Result<{ ok: true }>> {
  // K-09: server reads id/workspace_id from query string. DELETE bodies are
  // non-standard and many runtimes drop them silently — mirror the pattern
  // already used by instance/delete + groups/delete.
  const q = new URLSearchParams({
    workspace_id: workspaceId,
    id: listId,
  });
  return jsonFetch(`/api/whatsapp/lists?${q.toString()}`, {
    method: "DELETE",
  });
}

// ── messages + conversations ────────────────────────────────────────────

export function fetchContactSummaries(
  workspaceId: string
): Promise<Result<WaContactSummary[]>> {
  return jsonFetchItems<WaContactSummary>(
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
  return jsonFetchItems<WaMessage>(`/api/whatsapp/messages?${q.toString()}`);
}

/* ════════════════════════════════════════════════════════════════════════
   Inbox v2 — conversation-centric API (Wave 1)
   ────────────────────────────────────────────────────────────────────────
   Consumes the new backend contracts:
     GET  /api/whatsapp/conversations?workspace_id=&cursor=&limit=
     GET  /api/whatsapp/messages?workspace_id=&conversation_id=&before=&limit=
     POST /api/whatsapp/conversations/[id]/read
     POST /api/whatsapp/send            (text, now persists a message row)
     POST /api/whatsapp/send/media      (media + voice + quote)
     POST /api/whatsapp/messages/[id]/react
     GET  /api/whatsapp/media/[id]?workspace_id=   (302 → signed URL)
   ════════════════════════════════════════════════════════════════════════ */

export type WaChatType = "contact" | "group";
export type WaMediaKind = "image" | "video" | "document" | "audio";

export interface WaReaction {
  emoji: string;
  fromMe?: boolean;
  actor?: string;
}

/** A row from the conversations list (inbox source of truth). */
export interface WaConversation {
  id: string;
  contact_id: string | null;
  source_id: string | null;
  phone: string | null;
  name: string | null;
  chat_type: WaChatType | null;
  is_group: boolean;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_direction: "inbound" | "outbound" | null;
  status: string | null;
  assignee_id: string | null;
}

/** A message row in a conversation thread (v2 shape). */
export interface WaThreadMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  created_at: string;
  media_type: WaMediaKind | string | null;
  media_mime: string | null;
  media_storage_path: string | null;
  reactions: WaReaction[] | null;
  reply_to_message_id: string | null;
  sender_name: string | null;
  is_private: boolean | null;
  evolution_message_id: string | null;
  /** Optimistic-only client fields (not from server). */
  _optimistic?: boolean;
}

export interface WaConversationsPage {
  items: WaConversation[];
  next_cursor: string | null;
}

export interface WaMessagesPage {
  items: WaThreadMessage[];
  next_cursor: string | null;
  has_more: boolean;
}

/** Fetch one page of conversations (newest activity first). */
export async function fetchConversations(
  workspaceId: string,
  opts?: { cursor?: string | null; limit?: number }
): Promise<Result<WaConversationsPage>> {
  const q = new URLSearchParams({ workspace_id: workspaceId });
  if (opts?.cursor) q.set("cursor", opts.cursor);
  if (opts?.limit) q.set("limit", String(opts.limit));
  const res = await jsonFetch<{ items?: WaConversation[]; next_cursor?: string | null }>(
    `/api/whatsapp/conversations?${q.toString()}`
  );
  if (!res.ok) return res;
  return ok({
    items: Array.isArray(res.data.items) ? res.data.items : [],
    next_cursor: res.data.next_cursor ?? null,
  });
}

/** Fetch one NEWEST-FIRST page of messages for a conversation. */
export async function fetchThreadMessages(
  workspaceId: string,
  conversationId: string,
  opts?: { before?: string | null; limit?: number }
): Promise<Result<WaMessagesPage>> {
  const q = new URLSearchParams({
    workspace_id: workspaceId,
    conversation_id: conversationId,
  });
  if (opts?.before) q.set("before", opts.before);
  if (opts?.limit) q.set("limit", String(opts.limit));
  const res = await jsonFetch<{
    items?: WaThreadMessage[];
    next_cursor?: string | null;
    has_more?: boolean;
  }>(`/api/whatsapp/messages?${q.toString()}`);
  if (!res.ok) return res;
  return ok({
    items: Array.isArray(res.data.items) ? res.data.items : [],
    next_cursor: res.data.next_cursor ?? null,
    has_more: !!res.data.has_more,
  });
}

/** Clear unread + send blue ticks for a conversation. */
export function markConversationRead(
  workspaceId: string,
  conversationId: string
): Promise<Result<{ ok: true }>> {
  return jsonFetch(
    `/api/whatsapp/conversations/${encodeURIComponent(conversationId)}/read`,
    {
      method: "POST",
      body: JSON.stringify({ workspace_id: workspaceId }),
    }
  );
}

/** Send a text message into a conversation (persists a row + optional quote). */
export function sendConversationText(payload: {
  workspace_id: string;
  conversation_id?: string;
  phone?: string;
  message: string;
  quoted_message_id?: string;
}): Promise<Result<{ ok: true; id?: string | null; message_id?: string | null }>> {
  // The send route resolves by recipient; for a contact thread we pass the
  // phone as target_id (it accepts a raw phone). Group threads pass the jid.
  const target_type =
    payload.phone && payload.phone.includes("@g.us") ? "group" : "contact";
  return jsonFetch("/api/whatsapp/send", {
    method: "POST",
    body: JSON.stringify({
      workspace_id: payload.workspace_id,
      target_type,
      target_id: payload.phone ?? payload.conversation_id ?? "",
      message: payload.message,
      ...(payload.quoted_message_id
        ? { quoted_message_id: payload.quoted_message_id }
        : {}),
    }),
  });
}

/** Send media (image/video/document) or a voice note (kind: "audio"). */
export function sendConversationMedia(payload: {
  workspace_id: string;
  conversation_id?: string;
  to?: string;
  phone?: string;
  media: { base64: string; mime: string; fileName?: string; kind: WaMediaKind };
  caption?: string;
  quoted_message_id?: string;
}): Promise<
  Result<{ ok: true; id?: string | null; message_id?: string | null; conversation_id?: string }>
> {
  return jsonFetch("/api/whatsapp/send/media", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Add (or, with an empty emoji, remove) our reaction to a message. */
export function reactToMessage(
  workspaceId: string,
  messageId: string,
  emoji: string
): Promise<Result<{ ok: true; reactions: WaReaction[] }>> {
  return jsonFetch(
    `/api/whatsapp/messages/${encodeURIComponent(messageId)}/react`,
    {
      method: "POST",
      body: JSON.stringify({ workspace_id: workspaceId, emoji }),
    }
  );
}

/** Build the media src/href for a message (302-redirects to a signed URL). */
export function mediaUrl(workspaceId: string, messageId: string): string {
  return `/api/whatsapp/media/${encodeURIComponent(
    messageId
  )}?workspace_id=${encodeURIComponent(workspaceId)}`;
}
