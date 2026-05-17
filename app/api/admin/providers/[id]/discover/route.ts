import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { recordAdminAction } from "@/app/admin/_audit";
import { safeErrorMessage } from "@/lib/safe-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getProviderClient,
  isKnownProvider,
  readProviderKey,
} from "@/lib/providers";
import type { AiProviderRow } from "@/app/admin/_types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/providers/:id/discover
 *
 * Calls the provider's models-list endpoint with the live API key and
 * returns the normalised model list as JSON. Used by the per-provider
 * page when the admin wants to refresh the discovered set without a
 * full page navigation, and by the orchestrator when verifying that
 * discovery wiring works against a live API key.
 *
 * Auditing: writes one `provider.discover_models` row per call. Same
 * verb the server-action records, so the audit log shows exactly how
 * the discovery was triggered.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: safeErrorMessage(e, {
          source: "admin.providers.discover.auth",
          fallback: "forbidden",
        }),
      },
      { status: 403 }
    );
  }

  void req;
  const { id } = await context.params;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_providers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: safeErrorMessage(error, {
          source: "admin.providers.discover.read",
          userId: auth.userId,
          fallback: "provider_read_failed",
        }),
      },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: `provider "${id}" not found` },
      { status: 404 }
    );
  }
  const provider = data as AiProviderRow;

  if (!isKnownProvider(provider.id)) {
    return NextResponse.json(
      {
        ok: false,
        error: "discovery not supported for this provider",
        provider: provider.id,
      },
      { status: 400 }
    );
  }

  const apiKey = readProviderKey(provider.api_key_env);
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: `env var ${provider.api_key_env} is not set`,
        provider: provider.id,
      },
      { status: 400 }
    );
  }

  const client = getProviderClient(provider.id);
  if (!client) {
    return NextResponse.json(
      {
        ok: false,
        error: "no client registered for this provider id",
        provider: provider.id,
      },
      { status: 500 }
    );
  }

  const result = await client.listModels(apiKey);

  // Record the call in ai_provider_health so the timeline reflects API
  // hits too.
  await admin.from("ai_provider_health").insert({
    provider_id: id,
    checked_at: new Date().toISOString(),
    status: result.ok ? "ok" : "error",
    latency_ms: result.latency_ms,
    error: result.error ? result.error.slice(0, 500) : null,
  });

  await recordAdminAction({
    action: "provider.discover_models",
    targetType: "ai_provider",
    targetId: id,
    metadata: {
      via: "api_route",
      status: result.ok ? "ok" : "error",
      latency_ms: result.latency_ms,
      error: result.error ?? null,
      count: result.models?.length ?? 0,
    },
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error ?? "unknown error",
        latency_ms: result.latency_ms,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    provider: provider.id,
    latency_ms: result.latency_ms,
    count: result.models?.length ?? 0,
    models: result.models ?? [],
  });
}
