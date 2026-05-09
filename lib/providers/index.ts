import "server-only";

/**
 * Provider client factory. Returns a small surface — `ping` and
 * `listModels` — for each AI provider the platform talks to.
 *
 * Discovery is THE solution to "let me add models from the panel myself
 * without your help": the admin lands on `/admin/providers/[id]`,
 * clicks "Discover models", and gets a one-click insert into
 * `public.ai_models` for any model the provider's API exposes.
 *
 * Every network call:
 *   - uses the live API key from process.env via the `api_key_env`
 *     reference name on the row (we never store secrets in the DB).
 *   - has an AbortController + 10s timeout.
 *   - returns `{ ok: false, error }` instead of throwing — server
 *     actions surface `error` to the UI.
 */

export type ProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "xai"
  | "mistral"
  | "groq";

const KNOWN_PROVIDERS: ReadonlySet<string> = new Set<ProviderId>([
  "anthropic",
  "openai",
  "google",
  "xai",
  "mistral",
  "groq",
]);

export function isKnownProvider(id: string): id is ProviderId {
  return KNOWN_PROVIDERS.has(id);
}

/** Normalised provider model record returned to the admin UI. */
export interface ProviderModel {
  id: string;
  display_name: string;
  supports_vision: boolean;
  supports_thinking: boolean;
  supports_tools: boolean;
  context_window: number | null;
  max_output_tokens: number | null;
  raw: Record<string, unknown>;
}

export interface PingResult {
  ok: boolean;
  status: number | null;
  latency_ms: number;
  error?: string;
}

export interface ListModelsResult {
  ok: boolean;
  models?: ProviderModel[];
  status: number | null;
  latency_ms: number;
  error?: string;
}

/** A small client a provider page uses. */
export interface ProviderClient {
  ping(apiKey: string): Promise<PingResult>;
  listModels(apiKey: string): Promise<ListModelsResult>;
}

/* ──────────────────── shared helpers ──────────────────── */

const DEFAULT_TIMEOUT_MS = 10_000;

async function timedFetch(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{ res: Response | null; ms: number; err?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return { res, ms: Date.now() - started };
  } catch (e) {
    const ms = Date.now() - started;
    if (e instanceof DOMException && e.name === "AbortError") {
      return { res: null, ms, err: "timeout (10s)" };
    }
    return {
      res: null,
      ms,
      err: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(t);
  }
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asBool(v: unknown): boolean {
  return v === true;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Heuristic: try to infer capabilities from a raw provider model row. */
function inferCapabilities(
  raw: Record<string, unknown>,
  fallbackId: string
): {
  supports_vision: boolean;
  supports_thinking: boolean;
  supports_tools: boolean;
  context_window: number | null;
  max_output_tokens: number | null;
} {
  // Direct fields if the provider exposes them.
  const vision =
    asBool((raw as { supports_vision?: unknown }).supports_vision) ||
    asBool((raw as { vision?: unknown }).vision) ||
    asBool(
      (raw as { capabilities?: { vision?: unknown } }).capabilities?.vision
    );
  const thinking =
    asBool((raw as { supports_thinking?: unknown }).supports_thinking) ||
    asBool((raw as { reasoning?: unknown }).reasoning) ||
    asBool(
      (raw as { capabilities?: { thinking?: unknown } }).capabilities?.thinking
    );
  const tools =
    asBool((raw as { supports_tools?: unknown }).supports_tools) ||
    asBool((raw as { tool_use?: unknown }).tool_use) ||
    asBool((raw as { function_calling?: unknown }).function_calling);

  // Name-based fallback heuristics for providers that don't surface
  // capability bits in the models response.
  const id = (
    asString((raw as { id?: unknown }).id) ||
    asString((raw as { name?: unknown }).name) ||
    fallbackId
  ).toLowerCase();

  // Most current flagship/balanced lines have vision + tools by default.
  // Don't promise thinking unless the name strongly suggests it.
  const visionGuess =
    vision ||
    /vision|gpt-4o|gpt-5|claude|gemini|grok|sonnet|opus|haiku|llama-3\.2|pixtral/.test(
      id
    );
  const toolsGuess =
    tools ||
    /gpt-4|gpt-5|claude|gemini|grok|sonnet|opus|haiku|mistral-large|mistral-small|llama-3\.[12]|mixtral/.test(
      id
    );
  const thinkingGuess =
    thinking || /reasoning|thinking|o1|o3|o4|grok-(?:beta|2|3)/.test(id);

  const ctx =
    asNumber((raw as { context_window?: unknown }).context_window) ??
    asNumber((raw as { max_context_length?: unknown }).max_context_length) ??
    asNumber((raw as { context_length?: unknown }).context_length) ??
    asNumber(
      (raw as { input_token_limit?: unknown }).input_token_limit
    ) ??
    null;
  const out =
    asNumber((raw as { max_output_tokens?: unknown }).max_output_tokens) ??
    asNumber(
      (raw as { output_token_limit?: unknown }).output_token_limit
    ) ??
    null;

  return {
    supports_vision: visionGuess,
    supports_thinking: thinkingGuess,
    supports_tools: toolsGuess,
    context_window: ctx,
    max_output_tokens: out,
  };
}

function makeModel(
  raw: Record<string, unknown>,
  idField: string,
  nameField?: string
): ProviderModel {
  const id =
    asString(raw[idField]) ||
    asString((raw as { name?: unknown }).name) ||
    "";
  const display =
    (nameField ? asString(raw[nameField]) : "") ||
    asString((raw as { display_name?: unknown }).display_name) ||
    asString((raw as { name?: unknown }).name) ||
    id;
  const caps = inferCapabilities(raw, id);
  return {
    id,
    display_name: display || id,
    raw,
    ...caps,
  };
}

/* ──────────────────── Anthropic ──────────────────── */

const anthropicClient: ProviderClient = {
  async ping(apiKey) {
    const { res, ms, err } = await timedFetch(
      "https://api.anthropic.com/v1/models?limit=1",
      {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          accept: "application/json",
        },
      }
    );
    if (!res) {
      return { ok: false, status: null, latency_ms: ms, error: err ?? "no response" };
    }
    return {
      ok: res.ok,
      status: res.status,
      latency_ms: ms,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  },
  async listModels(apiKey) {
    const { res, ms, err } = await timedFetch(
      "https://api.anthropic.com/v1/models?limit=100",
      {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          accept: "application/json",
        },
      }
    );
    if (!res) return { ok: false, status: null, latency_ms: ms, error: err };
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        latency_ms: ms,
        error: extractError(json) ?? `HTTP ${res.status}`,
      };
    }
    const data = (json as { data?: unknown[] } | null)?.data ?? [];
    const models = data
      .filter((r): r is Record<string, unknown> => isObj(r))
      .map((r) => makeModel(r, "id", "display_name"));
    return { ok: true, status: res.status, latency_ms: ms, models };
  },
};

/* ──────────────────── OpenAI / xAI / Mistral / Groq (OpenAI-shape) ──────────────────── */

function openAiShapeClient(baseUrl: string): ProviderClient {
  return {
    async ping(apiKey) {
      const { res, ms, err } = await timedFetch(`${baseUrl}/models`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: "application/json",
        },
      });
      if (!res) {
        return { ok: false, status: null, latency_ms: ms, error: err ?? "no response" };
      }
      return {
        ok: res.ok,
        status: res.status,
        latency_ms: ms,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    },
    async listModels(apiKey) {
      const { res, ms, err } = await timedFetch(`${baseUrl}/models`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: "application/json",
        },
      });
      if (!res) return { ok: false, status: null, latency_ms: ms, error: err };
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          latency_ms: ms,
          error: extractError(json) ?? `HTTP ${res.status}`,
        };
      }
      const data = (json as { data?: unknown[] } | null)?.data ?? [];
      const models = data
        .filter((r): r is Record<string, unknown> => isObj(r))
        .map((r) => makeModel(r, "id"));
      return { ok: true, status: res.status, latency_ms: ms, models };
    },
  };
}

/* ──────────────────── Google Gemini ──────────────────── */

const googleClient: ProviderClient = {
  async ping(apiKey) {
    const { res, ms, err } = await timedFetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
        apiKey
      )}`,
      { method: "GET", headers: { accept: "application/json" } }
    );
    if (!res) {
      return { ok: false, status: null, latency_ms: ms, error: err ?? "no response" };
    }
    return {
      ok: res.ok,
      status: res.status,
      latency_ms: ms,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  },
  async listModels(apiKey) {
    const { res, ms, err } = await timedFetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
        apiKey
      )}`,
      { method: "GET", headers: { accept: "application/json" } }
    );
    if (!res) return { ok: false, status: null, latency_ms: ms, error: err };
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        latency_ms: ms,
        error: extractError(json) ?? `HTTP ${res.status}`,
      };
    }
    const list = (json as { models?: unknown[] } | null)?.models ?? [];
    const models = list
      .filter((r): r is Record<string, unknown> => isObj(r))
      .map((r) => {
        // Google ids look like "models/gemini-1.5-pro"; strip prefix.
        const fullName = asString((r as { name?: unknown }).name);
        const stripped = fullName.replace(/^models\//, "");
        const enriched: Record<string, unknown> = { ...r, id: stripped };
        return makeModel(enriched, "id", "displayName");
      });
    return { ok: true, status: res.status, latency_ms: ms, models };
  },
};

/* ──────────────────── registry ──────────────────── */

const REGISTRY: Record<ProviderId, ProviderClient> = {
  anthropic: anthropicClient,
  openai: openAiShapeClient("https://api.openai.com/v1"),
  google: googleClient,
  xai: openAiShapeClient("https://api.x.ai/v1"),
  mistral: openAiShapeClient("https://api.mistral.ai/v1"),
  groq: openAiShapeClient("https://api.groq.com/openai/v1"),
};

/** Returns a client for a known provider id, or null for unknown ones. */
export function getProviderClient(providerId: string): ProviderClient | null {
  if (!isKnownProvider(providerId)) return null;
  return REGISTRY[providerId];
}

/* ──────────────────── small util ──────────────────── */

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extractError(json: unknown): string | null {
  if (!isObj(json)) return null;
  const e = (json as { error?: unknown }).error;
  if (typeof e === "string") return e;
  if (isObj(e)) {
    const msg = (e as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return null;
}

/**
 * Read the live API key for a provider row from process.env. Never logs
 * the value, never returns it to a non-server context. Returns "" if
 * the env var is missing or empty.
 */
export function readProviderKey(envName: string): string {
  if (!envName) return "";
  const v = process.env[envName];
  return typeof v === "string" ? v.trim() : "";
}
