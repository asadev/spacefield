import "server-only";

import type {
  EvolutionConnectResponse,
  EvolutionGroup,
  EvolutionInstance,
  EvolutionSendResult,
} from "./types";

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

    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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

  /** Send a plain text message. */
  async sendText(
    instanceName: string,
    to: string,
    body: string,
  ): Promise<{ messageId: string }> {
    const res = await this.request<EvolutionSendResult>(
      `/message/sendText/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: { number: to, text: body },
      },
    );
    const id = res.key?.id ?? res.messageId ?? "";
    return { messageId: id };
  }

  /** Send media (image/video/document) with optional caption. */
  async sendMedia(
    instanceName: string,
    to: string,
    mediaUrl: string,
    caption?: string,
    mediaType: "image" | "video" | "audio" | "document" = "image",
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
        },
      },
    );
    const id = res.key?.id ?? res.messageId ?? "";
    return { messageId: id };
  }

  /** List all WhatsApp groups visible to this instance. */
  async fetchGroups(instanceName: string): Promise<EvolutionGroup[]> {
    const res = await this.request<unknown>(
      `/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`,
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
