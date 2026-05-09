"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getProviderClient,
  isKnownProvider,
  readProviderKey,
  type ProviderModel,
} from "@/lib/providers";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import {
  MODEL_PROVIDERS,
  type AiProviderRow,
  type CapabilityTier,
  type ModelProvider,
  type ModelStatus,
} from "../_types";

/**
 * Server actions for `/admin/providers`. Audit verbs:
 *
 *   provider.update             — display_name, base_url, api_key_env,
 *                                 cost_quota_usd, status, metadata
 *   provider.test_connection    — pings the provider, writes
 *                                 ai_provider_health, returns the result
 *                                 in the redirect query string
 *   provider.discover_models    — calls the provider's models-list
 *                                 endpoint (no DB write — the page
 *                                 re-renders by reading the DB + the
 *                                 just-fetched JSON)
 *   model.add_from_provider     — inserts a discovered model into
 *                                 public.ai_models with sensible defaults
 *
 * EVERY action: assertAdmin + recordAdminAction. Errors are caught and
 * surfaced via redirect query strings so the UI never sees a thrown
 * promise rejection.
 */

const PROVIDER_STATUS_SET = new Set(["live", "paused", "disabled"] as const);
const MODEL_PROVIDER_SET: ReadonlySet<ModelProvider> = new Set(MODEL_PROVIDERS);

const MODEL_ID_RE =
  /^[a-z0-9][a-z0-9._\-]{0,127}[a-z0-9]$|^[a-z0-9]$/;

function pickProviderStatus(raw: unknown): "live" | "paused" | "disabled" {
  const v = String(raw ?? "live");
  return (PROVIDER_STATUS_SET as Set<string>).has(v)
    ? (v as "live" | "paused" | "disabled")
    : "live";
}

function pickModelProvider(raw: unknown): ModelProvider {
  const v = String(raw ?? "custom");
  return MODEL_PROVIDER_SET.has(v as ModelProvider)
    ? (v as ModelProvider)
    : "custom";
}

function pickStr(raw: unknown, fallback = ""): string {
  return typeof raw === "string" ? raw : String(raw ?? fallback);
}

function pickNumber(raw: unknown, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pickInt(raw: unknown, fallback: number, min: number, max: number) {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pickBool(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  const v = String(raw ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function diffBefore(row: AiProviderRow | null) {
  if (!row) return null;
  const { created_at: _c, updated_at: _u, updated_by: _b, ...rest } = row;
  void _c;
  void _u;
  void _b;
  return rest;
}

/**
 * Map a registry provider id → the `ModelProvider` enum used by
 * `ai_models.provider`. Groq is not in the enum (foundation file is
 * locked) so we map it to "custom".
 */
function providerEnumFor(providerId: string): ModelProvider {
  if (MODEL_PROVIDER_SET.has(providerId as ModelProvider)) {
    return providerId as ModelProvider;
  }
  return "custom";
}

/* ──────────────────── updateProvider ──────────────────── */

export async function updateProvider(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = pickStr(formData.get("id")).trim();
  if (!id) throw new Error("missing provider id");

  const display_name = pickStr(formData.get("display_name")).trim();
  if (!display_name) throw new Error("missing display_name");

  const base_url_raw = pickStr(formData.get("base_url")).trim();
  const base_url = base_url_raw === "" ? null : base_url_raw;

  const api_key_env = pickStr(formData.get("api_key_env")).trim().toUpperCase();
  if (!api_key_env) throw new Error("missing api_key_env");
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(api_key_env)) {
    throw new Error(
      "api_key_env must be uppercase letters/digits/underscore (3–64 chars)"
    );
  }

  const cost_quota_usd = pickNumber(
    formData.get("cost_quota_usd"),
    0,
    0,
    1_000_000
  );
  const status = pickProviderStatus(formData.get("status"));
  const metadata = parseMetadata(formData.get("metadata"));

  const admin = createAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("ai_providers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) throw new Error(`provider "${id}" not found`);

  // Recompute api_key_set from the live env (so swapping env-var name
  // updates the chip immediately).
  const api_key_set = readProviderKey(api_key_env) !== "";

  const updates = {
    display_name,
    base_url,
    api_key_env,
    api_key_set,
    cost_quota_usd,
    status,
    metadata,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { data: after, error: updErr } = await admin
    .from("ai_providers")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updErr) throw new Error(updErr.message);

  await recordAdminAction({
    action: "provider.update",
    targetType: "ai_provider",
    targetId: id,
    before: diffBefore(existing as AiProviderRow),
    after: diffBefore(after as AiProviderRow | null) ?? updates,
  });

  revalidatePath("/admin/providers");
  revalidatePath(`/admin/providers/${id}`);
}

/* ──────────────────── testConnection ──────────────────── */

export async function testConnection(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = pickStr(formData.get("id")).trim();
  const redirectTo = pickStr(formData.get("redirect_to")).trim() || null;
  if (!id) throw new Error("missing provider id");

  const admin = createAdminClient();
  const { data: row, error: readErr } = await admin
    .from("ai_providers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!row) throw new Error(`provider "${id}" not found`);

  const provider = row as AiProviderRow;

  let status: "ok" | "error" = "error";
  let latency_ms: number | null = null;
  let errMsg: string | null = null;

  const apiKey = readProviderKey(provider.api_key_env);
  if (!apiKey) {
    errMsg = `env var ${provider.api_key_env} is not set`;
  } else if (!isKnownProvider(provider.id)) {
    errMsg = "no client registered for this provider id";
  } else {
    const client = getProviderClient(provider.id);
    if (!client) {
      errMsg = "no client registered for this provider id";
    } else {
      try {
        const r = await client.ping(apiKey);
        latency_ms = r.latency_ms;
        if (r.ok) {
          status = "ok";
        } else {
          status = "error";
          errMsg = r.error ?? `HTTP ${r.status ?? "?"}`;
        }
      } catch (e) {
        errMsg = e instanceof Error ? e.message : String(e);
      }
    }
  }

  // Always record a health row so the timeline has data, even on
  // misconfig. Truncate long error strings — DB column is text but the
  // UI shows a chip.
  await admin.from("ai_provider_health").insert({
    provider_id: id,
    checked_at: new Date().toISOString(),
    status,
    latency_ms,
    error: errMsg ? errMsg.slice(0, 500) : null,
  });

  // Reflect api_key_set if it changed.
  const expectedSet = apiKey !== "";
  if (expectedSet !== provider.api_key_set) {
    await admin
      .from("ai_providers")
      .update({ api_key_set: expectedSet })
      .eq("id", id);
  }

  await recordAdminAction({
    action: "provider.test_connection",
    targetType: "ai_provider",
    targetId: id,
    metadata: {
      status,
      latency_ms,
      error: errMsg,
    },
  });

  revalidatePath("/admin/providers");
  revalidatePath(`/admin/providers/${id}`);

  // Redirect back to the page with a result query string so the UI can
  // surface the outcome. Default: provider detail page.
  const target = redirectTo ?? `/admin/providers/${id}`;
  const sep = target.includes("?") ? "&" : "?";
  const qs = new URLSearchParams({
    test_status: status,
    ...(latency_ms != null ? { test_latency: String(latency_ms) } : {}),
    ...(errMsg ? { test_error: errMsg.slice(0, 240) } : {}),
  }).toString();
  redirect(`${target}${sep}${qs}`);
}

/* ──────────────────── discoverModels ──────────────────── */

export async function discoverModels(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = pickStr(formData.get("id")).trim();
  if (!id) throw new Error("missing provider id");

  const admin = createAdminClient();
  const { data: row, error: readErr } = await admin
    .from("ai_providers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!row) throw new Error(`provider "${id}" not found`);
  const provider = row as AiProviderRow;

  let status: "ok" | "error" = "error";
  let count = 0;
  let errMsg: string | null = null;
  let latency: number | null = null;
  let discovered: ProviderModel[] = [];

  const apiKey = readProviderKey(provider.api_key_env);
  if (!apiKey) {
    errMsg = `env var ${provider.api_key_env} is not set`;
  } else if (!isKnownProvider(provider.id)) {
    errMsg = "discovery not supported for this provider";
  } else {
    const client = getProviderClient(provider.id);
    if (!client) {
      errMsg = "no client registered for this provider id";
    } else {
      try {
        const r = await client.listModels(apiKey);
        latency = r.latency_ms;
        if (r.ok && r.models) {
          status = "ok";
          discovered = r.models;
          count = r.models.length;
        } else {
          errMsg = r.error ?? `HTTP ${r.status ?? "?"}`;
        }
      } catch (e) {
        errMsg = e instanceof Error ? e.message : String(e);
      }
    }
  }

  // Persist the latest discovery in the metadata so the page can render
  // it without a separate API call. Trim raw payloads to keep the row
  // small (we keep the id/display + capability bits, which is what the
  // UI needs anyway).
  const slim = discovered.map((m) => ({
    id: m.id,
    display_name: m.display_name,
    supports_vision: m.supports_vision,
    supports_thinking: m.supports_thinking,
    supports_tools: m.supports_tools,
    context_window: m.context_window,
    max_output_tokens: m.max_output_tokens,
  }));
  const newMetadata = {
    ...(provider.metadata ?? {}),
    discovery: {
      ran_at: new Date().toISOString(),
      status,
      latency_ms: latency,
      error: errMsg,
      count,
      models: slim,
    },
  };

  await admin
    .from("ai_providers")
    .update({ metadata: newMetadata })
    .eq("id", id);

  await admin.from("ai_provider_health").insert({
    provider_id: id,
    checked_at: new Date().toISOString(),
    status,
    latency_ms: latency,
    error: errMsg ? errMsg.slice(0, 500) : null,
  });

  await recordAdminAction({
    action: "provider.discover_models",
    targetType: "ai_provider",
    targetId: id,
    metadata: {
      status,
      latency_ms: latency,
      error: errMsg,
      count,
    },
  });

  revalidatePath("/admin/providers");
  revalidatePath(`/admin/providers/${id}`);

  const sep = "?";
  const qs = new URLSearchParams({
    discover_status: status,
    ...(typeof count === "number" ? { discover_count: String(count) } : {}),
    ...(errMsg ? { discover_error: errMsg.slice(0, 240) } : {}),
  }).toString();
  redirect(`/admin/providers/${id}${sep}${qs}`);
}

/* ──────────────────── addDiscoveredModel ──────────────────── */

export async function addDiscoveredModel(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const providerId = pickStr(formData.get("provider_id")).trim();
  const modelId = pickStr(formData.get("model_id")).trim().toLowerCase();
  const label =
    pickStr(formData.get("label")).trim() || modelId;
  const supports_vision = pickBool(formData.get("supports_vision"));
  const supports_thinking = pickBool(formData.get("supports_thinking"));
  const supports_tools = pickBool(formData.get("supports_tools"));
  const context_window = pickInt(
    formData.get("context_window"),
    200_000,
    1024,
    10_000_000
  );
  const max_output_tokens = pickInt(
    formData.get("max_output_tokens"),
    4096,
    1,
    1_000_000
  );

  if (!providerId) throw new Error("missing provider_id");
  if (!modelId) throw new Error("missing model_id");
  if (!MODEL_ID_RE.test(modelId)) {
    throw new Error(
      "model id must be lowercase letters/digits/dots/hyphens/underscore (1–128 chars)"
    );
  }

  const admin = createAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("ai_models")
    .select("id")
    .eq("id", modelId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (existing) {
    // Already in the catalog — surface a friendly error via redirect.
    const qs = new URLSearchParams({
      add_status: "skipped",
      add_message: `model "${modelId}" already in catalog`,
    }).toString();
    redirect(`/admin/providers/${providerId}?${qs}`);
  }

  const insertRow: Record<string, unknown> = {
    id: modelId,
    provider: providerEnumFor(providerId),
    label,
    context_window,
    max_output_tokens,
    supports_vision,
    supports_thinking,
    supports_tools,
    cost_input_per_million: 0,
    cost_output_per_million: 0,
    status: "live" satisfies ModelStatus,
    capability_tier: "balanced" satisfies CapabilityTier,
    sort_order: 0,
    metadata: { added_via: "provider_discovery", source_provider: providerId },
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { error: insertErr } = await admin
    .from("ai_models")
    .insert(insertRow);
  if (insertErr) {
    const qs = new URLSearchParams({
      add_status: "error",
      add_message: insertErr.message.slice(0, 240),
    }).toString();
    redirect(`/admin/providers/${providerId}?${qs}`);
  }

  await recordAdminAction({
    action: "model.add_from_provider",
    targetType: "ai_model",
    targetId: modelId,
    after: insertRow,
    metadata: { provider_id: providerId },
  });

  revalidatePath("/admin/providers");
  revalidatePath(`/admin/providers/${providerId}`);
  revalidatePath("/admin/models");

  const qs = new URLSearchParams({
    add_status: "ok",
    add_message: `added "${modelId}" to ai_models`,
  }).toString();
  redirect(`/admin/providers/${providerId}?${qs}`);
}
