import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";
import { isKnownProvider, readProviderKey } from "@/lib/providers";

import { formatDateTime } from "../_lib";
import type { AiProviderRow } from "../_types";
import StatusChip from "./_components/StatusChip";
import { testConnection } from "./_actions";

export const dynamic = "force-dynamic";

/**
 * Index of every row in `public.ai_providers`. This is the
 * platform-control plane for API keys: see which providers have a key
 * set in the live environment, see live spend vs. quota, and jump into
 * the per-provider page to discover models / test the connection.
 *
 * The api_key_set column is recomputed against process.env at render
 * time — the DB row is updated by `testConnection` and `updateProvider`,
 * but the page is the source of truth for "is the env var present right
 * now in this server process".
 */
export default async function AdminProvidersPage() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("ai_providers")
    .select("*")
    .order("display_name", { ascending: true });

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load providers: {error.message}
      </div>
    );
  }

  const rows = (data ?? []) as AiProviderRow[];

  // Per-provider model counts from ai_models (so the table has a "models
  // already in catalog" column).
  const modelCountMap = new Map<string, number>();
  if (rows.length > 0) {
    const { data: models } = await admin
      .from("ai_models")
      .select("provider")
      .in(
        "provider",
        Array.from(new Set(rows.map((r) => r.id))).filter(Boolean)
      );
    for (const m of (models ?? []) as { provider: string }[]) {
      modelCountMap.set(m.provider, (modelCountMap.get(m.provider) ?? 0) + 1);
    }
  }

  // Last health check per provider.
  const lastHealthMap = new Map<
    string,
    { status: string; latency_ms: number | null; checked_at: string }
  >();
  if (rows.length > 0) {
    const { data: health } = await admin
      .from("ai_provider_health")
      .select("provider_id, status, latency_ms, checked_at")
      .in(
        "provider_id",
        rows.map((r) => r.id)
      )
      .order("checked_at", { ascending: false })
      .limit(rows.length * 5);
    for (const h of (health ?? []) as {
      provider_id: string;
      status: string;
      latency_ms: number | null;
      checked_at: string;
    }[]) {
      if (!lastHealthMap.has(h.provider_id)) {
        lastHealthMap.set(h.provider_id, {
          status: h.status,
          latency_ms: h.latency_ms,
          checked_at: h.checked_at,
        });
      }
    }
  }

  const totals = {
    total: rows.length,
    live: rows.filter((r) => r.status === "live").length,
    keyed: rows.filter((r) => readProviderKey(r.api_key_env) !== "").length,
    discovery: rows.filter((r) => isKnownProvider(r.id)).length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Platform
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">
            Providers (API keys)
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            {totals.total} providers · {totals.live} live · {totals.keyed} with
            key set · {totals.discovery} support model discovery. Edit a row to
            test the connection or pull the latest model catalog into{" "}
            <Link
              href="/admin/models"
              className="text-tool-accent underline-offset-2 hover:underline"
            >
              ai_models
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Provider</th>
              <th className="px-3 py-2 text-left font-normal">ID</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">API key</th>
              <th className="px-3 py-2 text-left font-normal">Last check</th>
              <th className="px-3 py-2 text-right font-normal">Models</th>
              <th className="px-3 py-2 text-right font-normal">Spend</th>
              <th className="px-3 py-2 text-right font-normal">Quota</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-8 text-center text-faint"
                >
                  No providers seeded.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const keySet = readProviderKey(r.api_key_env) !== "";
                const last = lastHealthMap.get(r.id);
                const modelCount = modelCountMap.get(r.id) ?? 0;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/providers/${r.id}`}
                        className="text-app hover:text-tool-accent"
                      >
                        <div className="font-medium">{r.display_name}</div>
                        {!isKnownProvider(r.id) && (
                          <div className="mt-0.5 text-[10px] text-faint">
                            no built-in client — discovery disabled
                          </div>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {r.id}
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip status={r.status} />
                    </td>
                    <td className="px-3 py-2">
                      {keySet ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500 dark:text-emerald-400">
                          <span aria-hidden>✓</span>
                          {r.api_key_env}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-500">
                          <span aria-hidden>✗</span>
                          {r.api_key_env}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums">
                      {last ? (
                        <span
                          className={
                            last.status === "ok"
                              ? "text-emerald-500 dark:text-emerald-400"
                              : "text-rose-500"
                          }
                        >
                          {last.status}
                          {last.latency_ms != null
                            ? ` · ${last.latency_ms}ms`
                            : ""}
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                      {modelCount}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                      ${Number(r.spent_usd ?? 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                      {Number(r.cost_quota_usd ?? 0) === 0
                        ? "—"
                        : `$${Number(r.cost_quota_usd).toFixed(0)}`}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(r.updated_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <form action={testConnection}>
                          <input type="hidden" name="id" value={r.id} />
                          <input
                            type="hidden"
                            name="redirect_to"
                            value="/admin/providers"
                          />
                          <button
                            type="submit"
                            disabled={!keySet || !isKnownProvider(r.id)}
                            className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app disabled:cursor-not-allowed disabled:opacity-40"
                            title={
                              !keySet
                                ? `set ${r.api_key_env} in the environment first`
                                : !isKnownProvider(r.id)
                                  ? "no built-in client for this provider"
                                  : "ping the provider's models endpoint"
                            }
                          >
                            Test
                          </button>
                        </form>
                        <Link
                          href={`/admin/providers/${r.id}`}
                          className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-dashed border-app bg-app-elevated/40 p-4 text-xs text-muted">
        <strong className="text-app">How adding a model works:</strong> open a
        provider, hit{" "}
        <span className="rounded bg-app px-1.5 py-0.5 font-mono text-[10px]">
          Discover models
        </span>{" "}
        — that calls the provider&apos;s public models-list endpoint with the
        live API key, then lists every model it returns. Click{" "}
        <span className="rounded bg-app px-1.5 py-0.5 font-mono text-[10px]">
          Add to catalog
        </span>{" "}
        to insert it into <code className="font-mono">ai_models</code> with
        sensible defaults; refine cost / context / tier on the model&apos;s
        edit page afterward.
      </div>
    </div>
  );
}
