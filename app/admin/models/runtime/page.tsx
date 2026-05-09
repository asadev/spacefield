import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../../_lib";
import {
  CALL_KINDS,
  type AiModelRow,
  type CallKind,
  type RuntimeModelAssignmentRow,
} from "../../_types";
import { setRuntimeAssignment } from "../_actions";

export const dynamic = "force-dynamic";

const CALL_KIND_BLURB: Record<CallKind, string> = {
  classifier:
    "Cheap pre-pass on every inbound message. Decides which skills to expose and whether the request is simple/complex.",
  executor:
    "Single-tool path for simple intents. Bound to one skill; returns in 1–2 turns. Heaviest call by volume.",
  orchestrator:
    "Multi-tool planner for complex intents. Coordinates across skills; up to 10 turns of headroom.",
  formatter:
    "Cheap final-pass that rewrites raw output for the chat channel (WhatsApp/Telegram/in-app).",
};

/**
 * Runtime model assignments matrix. One <form> per call_kind so an admin
 * can change one row without disturbing the others. Each form posts to
 * `setRuntimeAssignment` with `call_kind` as a hidden field.
 */
export default async function AdminRuntimeAssignmentsPage() {
  const admin = createAdminClient();

  const [modelsRes, rmaRes] = await Promise.all([
    admin
      .from("ai_models")
      .select("id, label, provider, status, capability_tier, sort_order")
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }),
    admin
      .from("runtime_model_assignments")
      .select("*")
      .in("call_kind", CALL_KINDS as readonly string[]),
  ]);

  if (modelsRes.error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load models: {modelsRes.error.message}
      </div>
    );
  }
  if (rmaRes.error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load runtime assignments: {rmaRes.error.message}
      </div>
    );
  }

  type ModelOption = Pick<
    AiModelRow,
    "id" | "label" | "provider" | "status" | "capability_tier" | "sort_order"
  >;
  const models = (modelsRes.data ?? []) as ModelOption[];
  const assignmentsByKind = new Map<CallKind, RuntimeModelAssignmentRow>();
  for (const r of (rmaRes.data ?? []) as RuntimeModelAssignmentRow[]) {
    assignmentsByKind.set(r.call_kind, r);
  }

  // Hide deprecated models from the primary picker — but still keep them
  // in the fallback dropdown in case someone deliberately wants to point
  // a fallback at an older revision.
  const primaryModels = models.filter((m) => m.status !== "deprecated");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/models"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← AI models
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">
          Runtime model assignments
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-secondary">
          Pick which model the runtime dispatches with for each call
          kind. Changes take effect on the next user message — within 5
          minutes on every node, immediately on this one.
        </p>
      </div>

      <div className="space-y-4">
        {CALL_KINDS.map((kind) => {
          const current = assignmentsByKind.get(kind);
          const currentModel = current
            ? models.find((m) => m.id === current.model_id)
            : null;
          const fallbackModel = current?.fallback_model_id
            ? models.find((m) => m.id === current.fallback_model_id) ?? null
            : null;

          return (
            <section
              key={kind}
              className="rounded-xl border border-app bg-app-elevated p-5"
            >
              <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold capitalize text-app">
                      {kind}
                    </h2>
                    {currentModel ? (
                      <span className="rounded-full border border-app bg-app px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary">
                        {currentModel.provider}
                      </span>
                    ) : (
                      <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-500">
                        unassigned
                      </span>
                    )}
                  </div>
                  <p className="mt-1 max-w-xl text-xs text-muted">
                    {CALL_KIND_BLURB[kind]}
                  </p>
                  {currentModel && (
                    <div className="mt-1 text-[11px] text-faint">
                      Currently:{" "}
                      <span className="font-mono text-secondary">
                        {currentModel.id}
                      </span>{" "}
                      ({currentModel.label})
                      {fallbackModel && (
                        <>
                          {" · fallback "}
                          <span className="font-mono text-secondary">
                            {fallbackModel.id}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {current?.updated_at && (
                  <div className="text-[10px] text-faint">
                    last updated {formatDateTime(current.updated_at)}
                  </div>
                )}
              </header>

              <form
                action={setRuntimeAssignment}
                className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_2fr_1fr_1fr_auto]"
              >
                <input type="hidden" name="call_kind" value={kind} />

                <label className="block text-xs">
                  <span className="mb-1 block font-medium text-secondary">
                    Primary model
                  </span>
                  <select
                    name="model_id"
                    defaultValue={current?.model_id ?? ""}
                    required
                    className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft"
                  >
                    <option value="" disabled>
                      Pick a model…
                    </option>
                    {primaryModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} · {m.id}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs">
                  <span className="mb-1 block font-medium text-secondary">
                    Fallback (optional)
                  </span>
                  <select
                    name="fallback_model_id"
                    defaultValue={current?.fallback_model_id ?? ""}
                    className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft"
                  >
                    <option value="">— none —</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} · {m.id}
                        {m.status === "deprecated" ? " (deprecated)" : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs">
                  <span className="mb-1 block font-medium text-secondary">
                    Temperature
                  </span>
                  <input
                    type="number"
                    name="temperature"
                    min={0}
                    max={2}
                    step={0.1}
                    defaultValue={
                      current?.temperature !== undefined
                        ? Number(current.temperature)
                        : 1.0
                    }
                    className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft"
                  />
                </label>

                <label className="block text-xs">
                  <span className="mb-1 block font-medium text-secondary">
                    Max tokens
                  </span>
                  <input
                    type="number"
                    name="max_tokens"
                    min={1}
                    max={200000}
                    step={64}
                    defaultValue={current?.max_tokens ?? 4096}
                    className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft"
                  />
                </label>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
                  >
                    Save
                  </button>
                </div>
              </form>
            </section>
          );
        })}
      </div>
    </div>
  );
}
