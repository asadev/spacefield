import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { isKnownProvider, readProviderKey } from "@/lib/providers";

import { formatDateTime } from "../../_lib";
import type { AiProviderRow } from "../../_types";
import {
  addDiscoveredModel,
  discoverModels,
  testConnection,
  updateProvider,
} from "../_actions";
import HealthSparkline, {
  type HealthPoint,
} from "../_components/HealthSparkline";
import ProviderForm from "../_components/ProviderForm";
import StatusChip from "../_components/StatusChip";

export const dynamic = "force-dynamic";

type SearchParams = {
  test_status?: string;
  test_latency?: string;
  test_error?: string;
  discover_status?: string;
  discover_count?: string;
  discover_error?: string;
  add_status?: string;
  add_message?: string;
};

type DiscoveryMeta = {
  ran_at?: string;
  status?: string;
  latency_ms?: number | null;
  error?: string | null;
  count?: number;
  models?: Array<{
    id: string;
    display_name: string;
    supports_vision: boolean;
    supports_thinking: boolean;
    supports_tools: boolean;
    context_window: number | null;
    max_output_tokens: number | null;
  }>;
};

function readDiscovery(meta: Record<string, unknown> | null): DiscoveryMeta | null {
  if (!meta || typeof meta !== "object") return null;
  const d = (meta as { discovery?: unknown }).discovery;
  if (!d || typeof d !== "object") return null;
  return d as DiscoveryMeta;
}

/**
 * Per-provider editor + discovery surface.
 *
 * - Top: header + status, last 10 health checks, sparkline.
 * - Form: edit display_name / base_url / api_key_env / cost_quota_usd /
 *   status / metadata. Submit calls `updateProvider`.
 * - Right column: "Test connection" form + "Discover models" form,
 *   discovered models table + per-row "Add to catalog" form.
 *
 * Action results come back via search params — the redirect-with-qs
 * pattern keeps the surface a pure server component.
 */
export default async function AdminProviderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const admin = createAdminClient();

  const [providerRes, healthRes] = await Promise.all([
    admin.from("ai_providers").select("*").eq("id", id).maybeSingle(),
    admin
      .from("ai_provider_health")
      .select("provider_id, checked_at, status, latency_ms, error")
      .eq("provider_id", id)
      .order("checked_at", { ascending: false })
      .limit(60),
  ]);

  if (providerRes.error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load provider: {providerRes.error.message}
      </div>
    );
  }
  const provider = providerRes.data as AiProviderRow | null;
  if (!provider) notFound();

  const allHealth = (healthRes.data ?? []) as HealthPoint[];
  const recentHealth = allHealth.slice(0, 10);

  // 24h subset for the sparkline.
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const day = allHealth.filter(
    (h) => new Date(h.checked_at).getTime() >= cutoff
  );

  const keySetLive = readProviderKey(provider.api_key_env) !== "";
  const known = isKnownProvider(provider.id);

  const discovery = readDiscovery(provider.metadata);

  // Existing models for this provider — used to grey out "Add" buttons
  // that would create a duplicate.
  const existingModelsRes = await admin
    .from("ai_models")
    .select("id");
  const existingIds = new Set(
    ((existingModelsRes.data ?? []) as { id: string }[]).map((r) => r.id)
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/providers"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Providers
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-app">
              {provider.display_name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <code className="rounded-md border border-app bg-app px-2 py-1 font-mono">
                {provider.id}
              </code>
              <StatusChip status={provider.status} />
              {keySetLive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500 dark:text-emerald-400">
                  ✓ {provider.api_key_env}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-500">
                  ✗ {provider.api_key_env}
                </span>
              )}
              {!known && (
                <span className="inline-flex items-center rounded-full bg-app-elevated px-2 py-0.5 text-[10px] font-medium text-secondary">
                  no built-in client
                </span>
              )}
              <span className="text-faint">·</span>
              <span>updated {formatDateTime(provider.updated_at)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action result banners — redirect query strings */}
      {sp.test_status && (
        <ResultBanner
          ok={sp.test_status === "ok"}
          title={
            sp.test_status === "ok"
              ? `Connection ok${sp.test_latency ? ` · ${sp.test_latency}ms` : ""}`
              : "Connection failed"
          }
          message={sp.test_error}
        />
      )}
      {sp.discover_status && (
        <ResultBanner
          ok={sp.discover_status === "ok"}
          title={
            sp.discover_status === "ok"
              ? `Discovered ${sp.discover_count ?? "?"} models`
              : "Discovery failed"
          }
          message={sp.discover_error}
        />
      )}
      {sp.add_status && (
        <ResultBanner
          ok={sp.add_status === "ok"}
          title={
            sp.add_status === "ok"
              ? "Added to catalog"
              : sp.add_status === "skipped"
                ? "Skipped"
                : "Add failed"
          }
          message={sp.add_message}
        />
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <ProviderForm provider={provider} action={updateProvider} />

          {/* Discovery section */}
          <section className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-app">
                  Discover models
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  Calls the provider&apos;s models endpoint with the live API
                  key and lists what comes back. Click{" "}
                  <span className="font-mono text-[11px]">Add to catalog</span>{" "}
                  to insert into <code className="font-mono">ai_models</code>.
                </p>
              </div>
              <form action={discoverModels}>
                <input type="hidden" name="id" value={provider.id} />
                <button
                  type="submit"
                  disabled={!keySetLive || !known}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    !keySetLive
                      ? `env var ${provider.api_key_env} not set`
                      : !known
                        ? "no built-in client for this provider"
                        : "fetch models from the provider"
                  }
                >
                  {discovery ? "Re-discover" : "Discover models"}
                </button>
              </form>
            </header>

            {!known ? (
              <div className="rounded-md border border-dashed border-app bg-app/40 p-3 text-xs text-muted">
                Discovery is supported for: anthropic, openai, google, xai,
                mistral, groq. Custom providers can&apos;t be discovered
                automatically — add models on{" "}
                <Link
                  href="/admin/models/new"
                  className="text-tool-accent hover:underline"
                >
                  /admin/models/new
                </Link>{" "}
                instead.
              </div>
            ) : discovery ? (
              <DiscoveryTable
                providerId={provider.id}
                discovery={discovery}
                existingIds={existingIds}
              />
            ) : (
              <div className="rounded-md border border-dashed border-app bg-app/40 p-3 text-xs text-muted">
                Hit <span className="font-mono">Discover models</span> to pull
                the live catalog from{" "}
                <code className="font-mono">{provider.base_url ?? provider.id}</code>
                .
              </div>
            )}
          </section>
        </div>

        {/* Right column: Test connection + health timeline */}
        <aside className="min-w-0 space-y-4">
          <section className="space-y-3 rounded-xl border border-app bg-app-elevated p-5">
            <header>
              <h2 className="text-sm font-semibold text-app">
                Test connection
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                One-shot ping of the provider&apos;s models endpoint.
                Records into <code className="font-mono">ai_provider_health</code>.
              </p>
            </header>
            <form action={testConnection}>
              <input type="hidden" name="id" value={provider.id} />
              <button
                type="submit"
                disabled={!keySetLive || !known}
                className="w-full rounded-lg bg-tool-accent px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  !keySetLive
                    ? `env var ${provider.api_key_env} not set`
                    : !known
                      ? "no built-in client for this provider"
                      : "ping the provider"
                }
              >
                Run test now
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <header className="mb-3">
              <h2 className="text-sm font-semibold text-app">
                Health · last 24h
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {day.length} ping{day.length === 1 ? "" : "s"} recorded.
              </p>
            </header>
            <HealthSparkline points={day} />
            <div className="mt-4">
              <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-faint">
                Last 10 checks
              </div>
              {recentHealth.length === 0 ? (
                <div className="text-xs text-secondary">— none yet</div>
              ) : (
                <ul className="space-y-1">
                  {recentHealth.map((h, idx) => (
                    <li
                      key={`${h.checked_at}-${idx}`}
                      className="flex items-center justify-between rounded-md border border-app bg-app px-2 py-1 text-[11px]"
                    >
                      <span
                        className={
                          h.status === "ok"
                            ? "font-medium text-emerald-500 dark:text-emerald-400"
                            : "font-medium text-rose-500"
                        }
                      >
                        {h.status}
                        {h.latency_ms != null ? ` · ${h.latency_ms}ms` : ""}
                      </span>
                      <span
                        className="ml-2 truncate font-mono text-[10px] text-secondary"
                        title={h.error ?? ""}
                      >
                        {formatDateTime(h.checked_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ResultBanner({
  ok,
  title,
  message,
}: {
  ok: boolean;
  title: string;
  message?: string;
}) {
  return (
    <div
      className={
        ok
          ? "rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400"
          : "rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-500"
      }
    >
      <div className="font-medium">{title}</div>
      {message ? (
        <div className="mt-0.5 break-words text-xs opacity-80">{message}</div>
      ) : null}
    </div>
  );
}

function DiscoveryTable({
  providerId,
  discovery,
  existingIds,
}: {
  providerId: string;
  discovery: DiscoveryMeta;
  existingIds: Set<string>;
}) {
  const models = discovery.models ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span>
          {discovery.count ?? models.length} model
          {(discovery.count ?? models.length) === 1 ? "" : "s"}
        </span>
        <span className="text-faint">·</span>
        <span>
          ran {discovery.ran_at ? formatDateTime(discovery.ran_at) : "—"}
        </span>
        {typeof discovery.latency_ms === "number" && discovery.latency_ms != null ? (
          <>
            <span className="text-faint">·</span>
            <span>{discovery.latency_ms}ms</span>
          </>
        ) : null}
        {discovery.error ? (
          <>
            <span className="text-faint">·</span>
            <span className="text-rose-500">{discovery.error}</span>
          </>
        ) : null}
      </div>

      {models.length === 0 ? (
        <div className="rounded-md border border-dashed border-app bg-app/40 p-3 text-xs text-muted">
          Provider returned an empty model list.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-app">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Model</th>
                <th className="px-3 py-2 text-left font-normal">ID</th>
                <th className="px-3 py-2 text-left font-normal">Capabilities</th>
                <th className="px-3 py-2 text-right font-normal">Ctx</th>
                <th className="px-3 py-2 text-right font-normal">Out</th>
                <th className="px-3 py-2 text-right font-normal">Action</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => {
                const inCatalog = existingIds.has(m.id);
                return (
                  <tr
                    key={m.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2 font-medium text-app">
                      {m.display_name}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {m.id}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-secondary">
                      <div className="flex flex-wrap gap-1">
                        {m.supports_vision && (
                          <span className="rounded bg-app px-1.5 py-0.5 text-[10px]">
                            vision
                          </span>
                        )}
                        {m.supports_thinking && (
                          <span className="rounded bg-app px-1.5 py-0.5 text-[10px]">
                            thinking
                          </span>
                        )}
                        {m.supports_tools && (
                          <span className="rounded bg-app px-1.5 py-0.5 text-[10px]">
                            tools
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                      {m.context_window
                        ? `${(m.context_window / 1000).toFixed(0)}k`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                      {m.max_output_tokens
                        ? m.max_output_tokens.toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {inCatalog ? (
                        <Link
                          href={`/admin/models/${m.id}`}
                          className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                        >
                          In catalog → edit
                        </Link>
                      ) : (
                        <form action={addDiscoveredModel}>
                          <input
                            type="hidden"
                            name="provider_id"
                            value={providerId}
                          />
                          <input type="hidden" name="model_id" value={m.id} />
                          <input
                            type="hidden"
                            name="label"
                            value={m.display_name}
                          />
                          <input
                            type="hidden"
                            name="supports_vision"
                            value={m.supports_vision ? "1" : "0"}
                          />
                          <input
                            type="hidden"
                            name="supports_thinking"
                            value={m.supports_thinking ? "1" : "0"}
                          />
                          <input
                            type="hidden"
                            name="supports_tools"
                            value={m.supports_tools ? "1" : "0"}
                          />
                          <input
                            type="hidden"
                            name="context_window"
                            value={String(m.context_window ?? 200000)}
                          />
                          <input
                            type="hidden"
                            name="max_output_tokens"
                            value={String(m.max_output_tokens ?? 4096)}
                          />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1.5 rounded-md bg-tool-accent px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
                          >
                            + Add to catalog
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
