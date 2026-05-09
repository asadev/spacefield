import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../../_lib";
import type { AiModelRow, RuntimeModelAssignmentRow } from "../../_types";
import { deleteModel, updateModel } from "../_actions";
import ModelForm from "../_components/ModelForm";
import ProviderChip from "../_components/ProviderChip";
import StatusChip from "../_components/StatusChip";
import TierChip from "../_components/TierChip";

export const dynamic = "force-dynamic";

/**
 * Per-model editor. Loads the row, its references in
 * runtime_model_assignments + ai_agents, and renders ModelForm.
 *
 * The reference panel is informational — `deleteModel` enforces the same
 * "no references" rule on the server, so the panel is never load-bearing
 * for safety; it just helps the admin understand why a delete might be
 * blocked.
 */
export default async function AdminModelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const [modelRes, rmaRes, agentsRes] = await Promise.all([
    admin.from("ai_models").select("*").eq("id", id).maybeSingle(),
    admin
      .from("runtime_model_assignments")
      .select("call_kind, model_id, fallback_model_id")
      .or(`model_id.eq.${id},fallback_model_id.eq.${id}`),
    admin
      .from("ai_agents")
      .select("id, display_name, model, fast_model")
      .or(`model.eq.${id},fast_model.eq.${id}`),
  ]);

  if (modelRes.error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load model: {modelRes.error.message}
      </div>
    );
  }
  const model = modelRes.data as AiModelRow | null;
  if (!model) notFound();

  type RmaRef = Pick<
    RuntimeModelAssignmentRow,
    "call_kind" | "model_id" | "fallback_model_id"
  >;
  const rmaRows = (rmaRes.data ?? []) as RmaRef[];

  type AgentRef = { id: string; display_name: string; model: string; fast_model: string };
  const agentRows = (agentsRes.data ?? []) as AgentRef[];

  const blocked = rmaRows.length > 0 || agentRows.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/models"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← AI models
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-app">{model.label}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <code className="rounded-md border border-app bg-app px-2 py-1 font-mono">
                {model.id}
              </code>
              <ProviderChip provider={model.provider} />
              <StatusChip status={model.status} />
              <TierChip tier={model.capability_tier} />
              <span className="text-faint">·</span>
              <span>updated {formatDateTime(model.updated_at)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <ModelForm mode="edit" action={updateModel} model={model} />

          {/* Danger zone */}
          <section className="space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
            <header>
              <h2 className="text-sm font-semibold text-rose-500">
                Danger zone
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Hard delete only works when no agent (model or fast_model)
                or runtime assignment references this id.
                {blocked
                  ? " Currently referenced — clear the references in the panel on the right first."
                  : ""}
              </p>
            </header>
            <form action={deleteModel}>
              <input type="hidden" name="id" value={model.id} />
              <button
                type="submit"
                disabled={blocked}
                className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete model
              </button>
            </form>
          </section>
        </div>

        {/* References panel */}
        <aside className="min-w-0 space-y-4">
          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <header className="mb-3">
              <h2 className="text-sm font-semibold text-app">References</h2>
              <p className="mt-0.5 text-xs text-muted">
                Where this model is currently in use across the platform.
              </p>
            </header>
            <div className="space-y-3 text-xs">
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-faint">
                  Runtime assignments ({rmaRows.length})
                </div>
                {rmaRows.length === 0 ? (
                  <div className="text-secondary">— none</div>
                ) : (
                  <ul className="space-y-1">
                    {rmaRows.map((r) => (
                      <li
                        key={r.call_kind}
                        className="flex items-center justify-between rounded-md border border-app bg-app px-2 py-1"
                      >
                        <span className="font-medium text-app">
                          {r.call_kind}
                        </span>
                        <span className="font-mono text-[10px] text-secondary">
                          {r.model_id === model.id
                            ? "primary"
                            : "fallback"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2">
                  <Link
                    href="/admin/models/runtime"
                    className="text-[11px] text-tool-accent hover:underline"
                  >
                    Edit runtime assignments →
                  </Link>
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-faint">
                  Agents using this model ({agentRows.length})
                </div>
                {agentRows.length === 0 ? (
                  <div className="text-secondary">— none</div>
                ) : (
                  <ul className="space-y-1">
                    {agentRows.slice(0, 12).map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between rounded-md border border-app bg-app px-2 py-1"
                      >
                        <Link
                          href={`/admin/agents/${a.id}`}
                          className="truncate font-medium text-app hover:text-tool-accent"
                        >
                          {a.display_name}
                        </Link>
                        <span className="font-mono text-[10px] text-secondary">
                          {a.model === model.id ? "model" : ""}
                          {a.model === model.id && a.fast_model === model.id
                            ? " + "
                            : ""}
                          {a.fast_model === model.id ? "fast" : ""}
                        </span>
                      </li>
                    ))}
                    {agentRows.length > 12 && (
                      <li className="text-[10px] text-faint">
                        + {agentRows.length - 12} more
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
