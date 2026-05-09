import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../_lib";
import {
  MODEL_PROVIDERS,
  type AiModelRow,
  type CapabilityTier,
  type ModelProvider,
  type ModelStatus,
} from "../_types";
import ProviderChip from "./_components/ProviderChip";
import StatusChip from "./_components/StatusChip";
import TierChip from "./_components/TierChip";

export const dynamic = "force-dynamic";

const STATUS_FILTERS: { value: ModelStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "beta", label: "Beta" },
  { value: "deprecated", label: "Deprecated" },
];

const TIER_FILTERS: { value: CapabilityTier | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "flagship", label: "Flagship" },
  { value: "balanced", label: "Balanced" },
  { value: "fast", label: "Fast" },
  { value: "reasoning", label: "Reasoning" },
];

type SearchParams = {
  provider?: string;
  status?: string;
  tier?: string;
};

function isProvider(v: string): v is ModelProvider {
  return (MODEL_PROVIDERS as readonly string[]).includes(v);
}

/**
 * Index of every row in `public.ai_models`. Sort: status (live first),
 * sort_order, label. URL filters drive a server-side re-render — no
 * client state, no use-effect.
 */
export default async function AdminModelsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const providerFilter =
    typeof params.provider === "string" && isProvider(params.provider)
      ? (params.provider as ModelProvider)
      : "all";
  const statusFilter =
    params.status === "live" ||
    params.status === "beta" ||
    params.status === "deprecated"
      ? (params.status as ModelStatus)
      : "all";
  const tierFilter =
    params.tier === "flagship" ||
    params.tier === "balanced" ||
    params.tier === "fast" ||
    params.tier === "reasoning"
      ? (params.tier as CapabilityTier)
      : "all";

  const admin = createAdminClient();
  let query = admin
    .from("ai_models")
    .select(
      "id, provider, label, status, capability_tier, context_window, max_output_tokens, cost_input_per_million, cost_output_per_million, sort_order, supports_vision, supports_thinking, supports_tools, updated_at"
    )
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (providerFilter !== "all") query = query.eq("provider", providerFilter);
  if (statusFilter !== "all") query = query.eq("status", statusFilter);
  if (tierFilter !== "all") query = query.eq("capability_tier", tierFilter);

  const { data, error } = await query;

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load models: {error.message}
      </div>
    );
  }

  type Row = Pick<
    AiModelRow,
    | "id"
    | "provider"
    | "label"
    | "status"
    | "capability_tier"
    | "context_window"
    | "max_output_tokens"
    | "cost_input_per_million"
    | "cost_output_per_million"
    | "sort_order"
    | "supports_vision"
    | "supports_thinking"
    | "supports_tools"
    | "updated_at"
  >;
  const rows = (data ?? []) as Row[];

  const counts = {
    total: rows.length,
    live: rows.filter((r) => r.status === "live").length,
    beta: rows.filter((r) => r.status === "beta").length,
    deprecated: rows.filter((r) => r.status === "deprecated").length,
  };

  // Helper to build filter links that preserve the other filters.
  const buildHref = (next: Partial<SearchParams>) => {
    const sp = new URLSearchParams();
    const final: SearchParams = {
      provider: providerFilter === "all" ? undefined : providerFilter,
      status: statusFilter === "all" ? undefined : statusFilter,
      tier: tierFilter === "all" ? undefined : tierFilter,
      ...next,
    };
    Object.entries(final).forEach(([k, v]) => {
      if (typeof v === "string" && v && v !== "all") sp.set(k, v);
    });
    const qs = sp.toString();
    return qs ? `/admin/models?${qs}` : "/admin/models";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Platform
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">AI models</h1>
          <p className="mt-0.5 text-xs text-muted">
            {counts.total} models · {counts.live} live · {counts.beta} beta ·{" "}
            {counts.deprecated} deprecated. Add a row here, then assign it on{" "}
            <Link
              href="/admin/models/runtime"
              className="text-tool-accent underline-offset-2 hover:underline"
            >
              runtime assignments
            </Link>
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/models/runtime"
            className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent"
          >
            Runtime assignments
          </Link>
          <Link
            href="/admin/models/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            + New model
          </Link>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 rounded-xl border border-app bg-app-elevated p-3">
        <div className="flex flex-col gap-1">
          <span className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Provider
          </span>
          <div className="flex flex-wrap gap-1">
            <Link
              href={buildHref({ provider: undefined })}
              className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                providerFilter === "all"
                  ? "bg-tool-accent text-white"
                  : "border border-app bg-app text-secondary hover:border-tool-accent"
              }`}
            >
              All
            </Link>
            {MODEL_PROVIDERS.map((p) => (
              <Link
                key={p}
                href={buildHref({ provider: p })}
                className={`rounded-md px-2 py-1 text-[11px] capitalize transition-colors ${
                  providerFilter === p
                    ? "bg-tool-accent text-white"
                    : "border border-app bg-app text-secondary hover:border-tool-accent"
                }`}
              >
                {p}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Status
          </span>
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((s) => (
              <Link
                key={s.value}
                href={buildHref({
                  status: s.value === "all" ? undefined : s.value,
                })}
                className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                  statusFilter === s.value
                    ? "bg-tool-accent text-white"
                    : "border border-app bg-app text-secondary hover:border-tool-accent"
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Tier
          </span>
          <div className="flex flex-wrap gap-1">
            {TIER_FILTERS.map((t) => (
              <Link
                key={t.value}
                href={buildHref({
                  tier: t.value === "all" ? undefined : t.value,
                })}
                className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                  tierFilter === t.value
                    ? "bg-tool-accent text-white"
                    : "border border-app bg-app text-secondary hover:border-tool-accent"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Model</th>
              <th className="px-3 py-2 text-left font-normal">ID</th>
              <th className="px-3 py-2 text-left font-normal">Provider</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Tier</th>
              <th className="px-3 py-2 text-right font-normal">In $/M</th>
              <th className="px-3 py-2 text-right font-normal">Out $/M</th>
              <th className="px-3 py-2 text-right font-normal">Ctx</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-8 text-center text-faint"
                >
                  No models match these filters.{" "}
                  <Link
                    href="/admin/models/new"
                    className="text-tool-accent hover:underline"
                  >
                    Add one
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-app last:border-b-0 hover:bg-app/40"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/models/${r.id}`}
                      className="text-app hover:text-tool-accent"
                    >
                      <div className="font-medium">{r.label}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-faint">
                        {r.supports_vision && <span>vision</span>}
                        {r.supports_thinking && <span>· thinking</span>}
                        {r.supports_tools && <span>· tools</span>}
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                    {r.id}
                  </td>
                  <td className="px-3 py-2">
                    <ProviderChip provider={r.provider} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusChip status={r.status} />
                  </td>
                  <td className="px-3 py-2">
                    <TierChip tier={r.capability_tier} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                    ${Number(r.cost_input_per_million).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                    ${Number(r.cost_output_per_million).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                    {(r.context_window / 1000).toFixed(0)}k
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                    {formatDateTime(r.updated_at)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/admin/models/${r.id}`}
                      className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
