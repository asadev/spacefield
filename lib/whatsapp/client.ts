import "server-only";

import type {
  EvolutionConnectResponse,
  EvolutionGroup,
  EvolutionInstance,
  EvolutionMediaBase64,
  EvolutionSendResult,
} from "./types";

/** Minimal Baileys message-key shape used by chat/media/reaction endpoints. */
export interface EvolutionMessageKey {
  id: string;
  remoteJid?: string;
  fromMe?: boolean;
  participant?: string;
}

/**
 * EvolutionClient — typed wrapper around the self-hosted Evolution
 * API (https://doc.evolution-api.com). Pointed at the gateway at
 * EVOLUTION_BASE_URL with API key EVOLUTION_API_KEY (header `apikey`).
 *
 * Hardening:
 *   - 3-attempt exponential backoff (1s / 2s / 4s) on network errors
 *     and 5xx responses. 4xx aborts immediately — those won't get
 *     better on retry.
 *   - 30-second per-request timeout via AbortController.
 *   - All final failures log to console.error with a stable prefix
 *     so they surface in Vercel logs cleanly.
 *
 * Methods only model the endpoints Spacefield actually calls. Anything
 * else can be added as needed.
 */

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
const TIMEOUT_MS = 30_000;
const LOG_PREFIX = "[evolution-client]";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${LOG_PREFIX} missing env ${name}`);
  return v;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RequestOpts {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Skip the JSON body parse — useful for endpoints that 204. */
  raw?: boolean;
  /** Per-attempt abort budget (ms). Defaults to the module TIMEOUT_MS. Used by
   *  the groups-sync route to keep fetchAllGroups under its function maxDuration. */
  timeoutMs?: number;
}

export class EvolutionClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(opts?: { baseUrl?: string; apiKey?: string }) {
    this.baseUrl = (opts?.baseUrl ?? envOrThrow("EVOLUTION_BASE_URL")).replace(
      /\/$/,
      "",
    );
    this.apiKey = opts?.apiKey ?? envOrThrow("EVOLUTION_API_KEY");
  }

  /** Internal HTTP helper. Retries on network + 5xx, gives up on 4xx. */
  private async request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const method = opts.method ?? "GET";
    let lastError: unknown = null;

    const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method,
          headers: {
            apikey: this.apiKey,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: controller.signal,
          // Evolution responses change on retry-after, never cache.
          cache: "no-store",
        });

        clearTimeout(timer);

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          // 4xx — caller error. Don't retry.
          if (res.status >= 400 && res.status < 500) {
            throw new Error(
              `${LOG_PREFIX} ${method} ${path} failed: ${res.status} ${text.slice(0, 200)}`,
            );
          }
          // 5xx — retry.
          lastError = new Error(
            `${LOG_PREFIX} ${method} ${path} ${res.status} ${text.slice(0, 200)}`,
          );
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }

        if (opts.raw) {
          // Return the raw response shell for callers that need headers.
          return res as unknown as T;
        }

        // 204 / empty body — return {} as T.
        const len = res.headers.get("content-length");
        if (len === "0" || res.status === 204) {
          return {} as T;
        }
        const data = (await res.json().catch(() => ({}))) as T;
        return data;
      } catch (e) {
        clearTimeout(timer);
        lastError = e;
        // AbortError or network — retry.
        if (attempt === RETRY_DELAYS_MS.length - 1) break;
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }

    // eslint-disable-next-line no-console
    console.error(LOG_PREFIX, `final failure ${method} ${path}`, lastError);
    throw lastError instanceof Error
      ? lastError
      : new Error(`${LOG_PREFIX} ${method} ${path} unknown failure`);
  }

  /** Create a fresh Evolution instance and request a QR code. */
  async createInstance(
    instanceName: string,
  ): Promise<{ qr: string | null; status: string }> {
    const res = await this.request<{
      instance?: { instanceName: string; status: string };
      qrcode?: { base64?: string; code?: string };
      hash?: { apikey?: string };
    }>("/instance/create", {
      method: "POST",
      body: {
        instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      },
    });

    const qr =
      res.qrcode?.base64 ??
      res.qrcode?.code ??
      null;

    return {
      qr,
      status: res.instance?.status ?? "pending",
    };
  }

  /** List every instance the server knows about. */
  async fetchInstances(): Promise<EvolutionInstance[]> {
    const res = await this.request<unknown>("/instance/fetchInstances");
    if (!Array.isArray(res)) return [];
    return res
      .map((row): EvolutionInstance | null => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        // Evolution v2 nests under `instance`, older flat shape too.
        const inst =
          (r.instance && typeof r.instance === "object"
            ? (r.instance as Record<string, unknown>)
            : r) ?? {};
        const name = inst.instanceName ?? inst.name;
        if (typeof name !== "string") return null;
        return {
          instanceName: name,
          status:
            typeof inst.status === "string"
              ? inst.status
              : typeof inst.state === "string"
                ? inst.state
                : "unknown",
          serverUrl:
            typeof inst.serverUrl === "string" ? inst.serverUrl : undefined,
          apikey: typeof inst.apikey === "string" ? inst.apikey : undefined,
          ownerJid:
            typeof inst.owner === "string"
              ? inst.owner
              : typeof inst.ownerJid === "string"
                ? inst.ownerJid
                : null,
          profileName:
            typeof inst.profileName === "string" ? inst.profileName : null,
          profilePictureUrl:
            typeof inst.profilePictureUrl === "string"
              ? inst.profilePictureUrl
              : null,
        };
      })
      .filter((v): v is EvolutionInstance => v !== null);
  }

  /** Get the connection state ('open', 'connecting', 'close', ...). */
  async getInstanceStatus(instanceName: string): Promise<string> {
    const res = await this.request<{
      instance?: { state?: string; status?: string };
      state?: string;
    }>(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
    return (
      res.instance?.state ?? res.instance?.status ?? res.state ?? "unknown"
    );
  }

  /**
   * Fetch the QR/pairing code for an instance. Returns null when the
   * instance is already paired (state = open).
   */
  async getQR(instanceName: string): Promise<string | null> {
    const res = await this.request<EvolutionConnectResponse>(
      `/instance/connect/${encodeURIComponent(instanceName)}`,
    );
    const qr =
      res.qrcode?.base64 ??
      res.qrcode?.code ??
      res.qrcode?.pairingCode ??
      res.base64 ??
      res.code ??
      res.pairingCode ??
      null;
    return qr;
  }

  /** Delete an Evolution instance on the server. */
  async deleteInstance(instanceName: string): Promise<void> {
    await this.request<unknown>(
      `/instance/delete/${encodeURIComponent(instanceName)}`,
      { method: "DELETE" },
    );
  }

  /** Send a plain text message. Pass `opts.quotedId` to reply to a message. */
  async sendText(
    instanceName: string,
    to: string,
    body: string,
    opts?: { quotedId?: string },
  ): Promise<{ messageId: string }> {
    const res = await this.request<EvolutionSendResult>(
      `/message/sendText/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: {
          number: to,
          text: body,
          ...(opts?.quotedId ? { quoted: { key: { id: opts.quotedId } } } : {}),
        },
      },
    );
    const id = res.key?.id ?? res.messageId ?? "";
    return { messageId: id };
  }

  /** Send media (image/video/document) with optional caption. `media` may be
   *  a URL or a base64 string. Pass `opts.quotedId` to reply to a message,
   *  `opts.fileName` (shown to the recipient for documents) and `opts.mimetype`
   *  (so Evolution doesn't have to sniff a base64 payload). */
  async sendMedia(
    instanceName: string,
    to: string,
    mediaUrl: string,
    caption?: string,
    mediaType: "image" | "video" | "audio" | "document" = "image",
    opts?: { quotedId?: string; fileName?: string; mimetype?: string },
  ): Promise<{ messageId: string }> {
    const res = await this.request<EvolutionSendResult>(
      `/message/sendMedia/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: {
          number: to,
          mediatype: mediaType,
          media: mediaUrl,
          caption: caption ?? "",
          ...(opts?.fileName ? { fileName: opts.fileName } : {}),
          ...(opts?.mimetype ? { mimetype: opts.mimetype } : {}),
          ...(opts?.quotedId ? { quoted: { key: { id: opts.quotedId } } } : {}),
        },
      },
    );
    const id = res.key?.id ?? res.messageId ?? "";
    return { messageId: id };
  }

  /**
   * Fetch the decrypted media bytes for an inbound message as base64.
   * Evolution downloads + decrypts the WhatsApp media for us; the raw
   * `media_url` on the webhook is an undecryptable `.enc` blob, so this is
   * the only way to re-host attachments. Returns null on any error or when
   * the response has no base64 payload (best-effort — callers tolerate null).
   */
  async getBase64FromMedia(
    instanceName: string,
    key: EvolutionMessageKey,
    opts?: { convertToMp4?: boolean; timeoutMs?: number },
  ): Promise<EvolutionMediaBase64 | null> {
    try {
      const res = await this.request<{
        base64?: string;
        mimetype?: string;
        fileName?: string;
        media?: { base64?: string; mimetype?: string; fileName?: string };
      }>(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        body: { message: { key }, convertToMp4: opts?.convertToMp4 ?? false },
        timeoutMs: opts?.timeoutMs ?? 20_000,
      });
      const base64 = res.base64 ?? res.media?.base64 ?? null;
      if (!base64) return null;
      return {
        base64,
        mimetype: res.mimetype ?? res.media?.mimetype ?? "application/octet-stream",
        fileName: res.fileName ?? res.media?.fileName ?? null,
      };
    } catch {
      return null;
    }
  }

  /** Send a PTT/voice note. `audio` is a URL or base64 string. */
  async sendWhatsAppAudio(
    instanceName: string,
    to: string,
    audio: string,
    opts?: { quotedId?: string },
  ): Promise<{ messageId: string }> {
    const res = await this.request<EvolutionSendResult>(
      `/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: {
          number: to,
          audio,
          ...(opts?.quotedId ? { quoted: { key: { id: opts.quotedId } } } : {}),
        },
      },
    );
    const id = res.key?.id ?? res.messageId ?? "";
    return { messageId: id };
  }

  /** React to a message with an emoji (empty string removes the reaction). */
  async sendReaction(
    instanceName: string,
    key: EvolutionMessageKey,
    reaction: string,
  ): Promise<void> {
    await this.request<unknown>(
      `/message/sendReaction/${encodeURIComponent(instanceName)}`,
      { method: "POST", body: { key, reaction } },
    );
  }

  /** Mark inbound messages as read (blue ticks) on WhatsApp. No-op on empty. */
  async markMessageAsRead(
    instanceName: string,
    readMessages: EvolutionMessageKey[],
  ): Promise<void> {
    if (readMessages.length === 0) return;
    await this.request<unknown>(
      `/chat/markMessageAsRead/${encodeURIComponent(instanceName)}`,
      { method: "POST", body: { readMessages } },
    );
  }

  /** Fetch a contact/group profile-picture URL. Returns null on any error. */
  async fetchProfilePictureUrl(
    instanceName: string,
    numberOrJid: string,
  ): Promise<string | null> {
    try {
      const res = await this.request<{ profilePictureUrl?: string | null }>(
        `/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`,
        { method: "POST", body: { number: numberOrJid }, timeoutMs: 8_000 },
      );
      return res.profilePictureUrl ?? null;
    } catch {
      return null;
    }
  }

  /** List all WhatsApp groups visible to this instance.
   *  `timeoutMs` bounds each HTTP attempt (request() honours opts.timeoutMs) so
   *  the groups-sync route can keep this heavy call under its maxDuration. */
  async fetchGroups(
    instanceName: string,
    timeoutMs?: number,
  ): Promise<EvolutionGroup[]> {
    const res = await this.request<unknown>(
      `/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`,
      timeoutMs ? { timeoutMs } : {},
    );
    if (!Array.isArray(res)) return [];
    return res
      .map((row): EvolutionGroup | null => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const id = r.id;
        if (typeof id !== "string") return null;
        return {
          id,
          subject: typeof r.subject === "string" ? r.subject : "",
          size:
            typeof r.size === "number"
              ? r.size
              : typeof r.participantsCount === "number"
                ? r.participantsCount
                : 0,
          creation:
            typeof r.creation === "number" ? r.creation : undefined,
          owner: typeof r.owner === "string" ? r.owner : undefined,
        };
      })
      .filter((v): v is EvolutionGroup => v !== null);
  }

  /** Create a new WhatsApp group with the given participants (E164). */
  async createGroup(
    instanceName: string,
    groupName: string,
    participants: string[],
  ): Promise<EvolutionGroup> {
    const res = await this.request<{
      groupId?: string;
      id?: string;
      subject?: string;
    }>(`/group/create/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: { subject: groupName, participants },
    });
    const id = res.groupId ?? res.id ?? "";
    return {
      id,
      subject: res.subject ?? groupName,
      size: participants.length,
    };
  }

  /** Send text to a group's JID. */
  async sendToGroup(
    instanceName: string,
    groupId: string,
    body: string,
  ): Promise<{ messageId: string }> {
    // Evolution treats groups as "number = <groupId>".
    return this.sendText(instanceName, groupId, body);
  }

  // ── Group management (EPIC-10) ──────────────────────────────────────────
  // Evolution exposes these under /group/*?instance=...&groupJid=... . Action
  // bodies are { action, participants } for membership and dedicated keys for
  // subject/description/setting. We surface only what the UI drives. Each is
  // best-effort-typed; callers handle the "invite-only" / "not-admin" failures
  // by inspecting the thrown error text.

  /** Add participants (E164 digits) to a group. */
  async addGroupParticipants(
    instanceName: string,
    groupJid: string,
    participants: string[],
  ): Promise<void> {
    await this.request<unknown>(
      `/group/updateParticipant/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
      { method: "POST", body: { action: "add", participants } },
    );
  }

  /** Remove participants from a group. */
  async removeGroupParticipants(
    instanceName: string,
    groupJid: string,
    participants: string[],
  ): Promise<void> {
    await this.request<unknown>(
      `/group/updateParticipant/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
      { method: "POST", body: { action: "remove", participants } },
    );
  }

  /** Promote participants to admin. */
  async promoteGroupParticipants(
    instanceName: string,
    groupJid: string,
    participants: string[],
  ): Promise<void> {
    await this.request<unknown>(
      `/group/updateParticipant/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
      { method: "POST", body: { action: "promote", participants } },
    );
  }

  /** Demote admins back to members. */
  async demoteGroupParticipants(
    instanceName: string,
    groupJid: string,
    participants: string[],
  ): Promise<void> {
    await this.request<unknown>(
      `/group/updateParticipant/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
      { method: "POST", body: { action: "demote", participants } },
    );
  }

  /** Update the group subject (name). */
  async updateGroupSubject(
    instanceName: string,
    groupJid: string,
    subject: string,
  ): Promise<void> {
    await this.request<unknown>(
      `/group/updateGroupSubject/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
      { method: "POST", body: { subject } },
    );
  }

  /** Update the group description. */
  async updateGroupDescription(
    instanceName: string,
    groupJid: string,
    description: string,
  ): Promise<void> {
    await this.request<unknown>(
      `/group/updateGroupDescription/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
      { method: "POST", body: { description } },
    );
  }

  /** Update the group picture from a URL/base64 image. */
  async updateGroupPicture(
    instanceName: string,
    groupJid: string,
    image: string,
  ): Promise<void> {
    await this.request<unknown>(
      `/group/updateGroupPicture/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
      { method: "POST", body: { image } },
    );
  }

  /**
   * Toggle group settings. setting:
   *   'announcement'    — only admins can send (announce-only)
   *   'not_announcement'— everyone can send
   *   'locked'          — only admins can edit group info
   *   'unlocked'        — everyone can edit group info
   */
  async updateGroupSetting(
    instanceName: string,
    groupJid: string,
    setting: "announcement" | "not_announcement" | "locked" | "unlocked",
  ): Promise<void> {
    await this.request<unknown>(
      `/group/updateSetting/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
      { method: "POST", body: { action: setting } },
    );
  }

  /** Leave a group. */
  async leaveGroup(instanceName: string, groupJid: string): Promise<void> {
    await this.request<unknown>(
      `/group/leaveGroup/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
      { method: "DELETE" },
    );
  }

  /** Fetch the group's current invite code (last path segment of the link). */
  async fetchGroupInviteCode(
    instanceName: string,
    groupJid: string,
  ): Promise<string | null> {
    try {
      const res = await this.request<{ inviteUrl?: string; inviteCode?: string }>(
        `/group/inviteCode/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
        { method: "GET" },
      );
      if (res.inviteCode) return res.inviteCode;
      if (res.inviteUrl) return res.inviteUrl.split("/").pop() ?? null;
      return null;
    } catch {
      return null;
    }
  }

  /** Revoke + reissue the group invite code; returns the new code. */
  async revokeGroupInviteCode(
    instanceName: string,
    groupJid: string,
  ): Promise<string | null> {
    try {
      const res = await this.request<{ inviteUrl?: string; inviteCode?: string }>(
        `/group/revokeInviteCode/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
        { method: "POST", body: {} },
      );
      if (res.inviteCode) return res.inviteCode;
      if (res.inviteUrl) return res.inviteUrl.split("/").pop() ?? null;
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Full group metadata incl. participants + admin flags. Evolution's
   * findGroupInfos returns participants when getParticipants is requested;
   * we normalize into { jid, isAdmin }. Returns null on any error.
   */
  async fetchGroupParticipants(
    instanceName: string,
    groupJid: string,
  ): Promise<{
    subject: string | null;
    description: string | null;
    pictureUrl: string | null;
    owner: string | null;
    isAnnounce: boolean | null;
    isLocked: boolean | null;
    participants: Array<{ jid: string; isAdmin: boolean }>;
  } | null> {
    try {
      const res = await this.request<unknown>(
        `/group/findGroupInfos/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}&getParticipants=true`,
        { method: "GET" },
      );
      if (!res || typeof res !== "object") return null;
      const r = res as Record<string, unknown>;
      const rawParts = Array.isArray(r.participants) ? r.participants : [];
      const participants = rawParts
        .map((p): { jid: string; isAdmin: boolean } | null => {
          if (!p || typeof p !== "object") return null;
          const pr = p as Record<string, unknown>;
          const jid =
            typeof pr.id === "string"
              ? pr.id
              : typeof pr.jid === "string"
                ? pr.jid
                : null;
          if (!jid) return null;
          const admin =
            pr.admin === "admin" ||
            pr.admin === "superadmin" ||
            pr.isAdmin === true ||
            pr.isSuperAdmin === true;
          return { jid, isAdmin: admin };
        })
        .filter((x): x is { jid: string; isAdmin: boolean } => x !== null);
      return {
        subject: typeof r.subject === "string" ? r.subject.trim() : null,
        description: typeof r.desc === "string" ? r.desc : null,
        pictureUrl: typeof r.pictureUrl === "string" ? r.pictureUrl : null,
        owner: typeof r.owner === "string" ? r.owner : null,
        isAnnounce: typeof r.announce === "boolean" ? r.announce : null,
        isLocked: typeof r.restrict === "boolean" ? r.restrict : null,
        participants,
      };
    } catch {
      return null;
    }
  }

  /**
   * Configure the per-instance webhook. `events` is the subset of
   * Evolution event names the gateway should fan out (e.g.
   * ['MESSAGES_UPSERT','MESSAGES_UPDATE','CONNECTION_UPDATE','QRCODE_UPDATED']).
   */
  /** Fetch the Baileys contact list for an instance. Returns one entry
   * per known JID — individuals AND groups. The `remoteJid` field is the
   * full WhatsApp JID (`<digits>@s.whatsapp.net` for individuals,
   * `<digits>@g.us` for groups); `pushName` is the human-readable name
   * (saved-contact name for individuals, group subject for groups);
   * `isGroup` discriminates. Used by the conversations endpoint to
   * resolve names instead of showing raw phone numbers / group JIDs. */
  async findContacts(
    instanceName: string,
  ): Promise<
    Array<{
      remoteJid: string;
      pushName: string | null;
      isGroup: boolean;
      profilePicUrl?: string | null;
    }>
  > {
    const res = await this.request<unknown>(
      `/chat/findContacts/${encodeURIComponent(instanceName)}`,
      { method: "POST", body: { where: {} } },
    );
    if (!Array.isArray(res)) return [];
    return res
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const remoteJid =
          typeof r.remoteJid === "string"
            ? r.remoteJid
            : typeof r.id === "string"
              ? r.id
              : null;
        if (!remoteJid) return null;
        const pushName =
          typeof r.pushName === "string" && r.pushName
            ? r.pushName
            : typeof r.name === "string" && r.name
              ? r.name
              : null;
        const isGroup =
          r.isGroup === true ||
          r.type === "group" ||
          remoteJid.endsWith("@g.us");
        const profilePicUrl =
          typeof r.profilePicUrl === "string" ? r.profilePicUrl : null;
        return { remoteJid, pushName, isGroup, profilePicUrl };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  /** Fetch one group's metadata (subject, description, member count) from
   * Baileys. Evolution's /chat/findContacts returns the latest sender's
   * pushName for group JIDs (a known data-model quirk), so we MUST hit
   * this dedicated endpoint to get the real group subject. Returns null
   * on any error so callers can fall back gracefully. */
  async findGroupInfo(
    instanceName: string,
    groupJid: string,
  ): Promise<{
    subject: string | null;
    description: string | null;
    pictureUrl: string | null;
    size: number | null;
  } | null> {
    try {
      const res = await this.request<unknown>(
        `/group/findGroupInfos/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
        { method: "GET" },
      );
      if (!res || typeof res !== "object") return null;
      const r = res as Record<string, unknown>;
      return {
        subject: typeof r.subject === "string" ? r.subject.trim() : null,
        description: typeof r.desc === "string" ? r.desc : null,
        pictureUrl:
          typeof r.pictureUrl === "string" ? r.pictureUrl : null,
        size: typeof r.size === "number" ? r.size : null,
      };
    } catch {
      return null;
    }
  }

  async setWebhook(
    instanceName: string,
    url: string,
    events: string[],
  ): Promise<void> {
    // Evolution v2.3.x expects the webhook config NESTED under `webhook`
    // with camelCase keys. The flat snake_case body we used before 400'd
    // silently → webhook never bound → Spacefield received zero events
    // → pairing appeared to hang from the UI even when Evolution had
    // the phone paired. Caught 2026-05-27. Verified live shape via
    // /webhook/set then /webhook/find round-trip.
    await this.request<unknown>(
      `/webhook/set/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: {
          webhook: {
            enabled: true,
            url,
            webhookByEvents: false,
            webhookBase64: false,
            events,
          },
        },
      },
    );
  }
}

/** Convenience singleton — created lazily on first access. */
let cached: EvolutionClient | null = null;
export function getEvolutionClient(): EvolutionClient {
  if (cached) return cached;
  cached = new EvolutionClient();
  return cached;
}
