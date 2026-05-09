import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../_lib";
import type { MaintenanceStateRow } from "../_types";
import {
  MaintenanceForm,
  QuickToggleButtons,
} from "./_MaintenanceForm";

export const dynamic = "force-dynamic";

function isCurrentlyActive(state: MaintenanceStateRow): boolean {
  if (!state.enabled) return false;
  const now = Date.now();
  if (state.starts_at && now < new Date(state.starts_at).getTime()) {
    return false;
  }
  if (state.ends_at && now > new Date(state.ends_at).getTime()) {
    return false;
  }
  return true;
}

export default async function AdminMaintenancePage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("maintenance_state")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const state = (data as MaintenanceStateRow | null) ?? null;

  if (!state) {
    return (
      <div className="space-y-5">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Customization
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Maintenance mode</h1>
        </div>
        <div className="rounded-xl border border-app bg-app-elevated p-4 text-sm text-rose-500">
          maintenance_state singleton missing.{" "}
          {error?.message ?? "Migration may not be applied."}
        </div>
      </div>
    );
  }

  const active = isCurrentlyActive(state);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Customization
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">Maintenance mode</h1>
        <p className="mt-0.5 text-xs text-muted">
          Site-wide kill switch. Allowlisted user UUIDs bypass the lockout.
        </p>
      </div>

      {active ? (
        <div className="rounded-xl border-l-4 border-l-rose-500 border-app bg-rose-500/5 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-rose-500">
                Maintenance LIVE
              </div>
              <div className="mt-1 text-sm font-medium text-app">
                {state.message || "(no message set)"}
              </div>
              {state.read_only && (
                <div className="mt-1 text-xs text-muted">
                  Read-only mode is on — users can view but not write.
                </div>
              )}
              <div className="mt-2 font-mono text-[11px] tabular-nums text-secondary">
                {formatDateTime(state.starts_at)} →{" "}
                {formatDateTime(state.ends_at)}
              </div>
              {state.allowlist_user_ids.length > 0 && (
                <div className="mt-1 text-[11px] text-muted">
                  {state.allowlist_user_ids.length} user
                  {state.allowlist_user_ids.length === 1 ? "" : "s"} on
                  allowlist (can bypass)
                </div>
              )}
            </div>
            <QuickToggleButtons enabled />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border-l-4 border-l-emerald-500 border-app bg-emerald-500/5 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-500 dark:text-emerald-400">
                Site is open
              </div>
              <div className="mt-1 text-sm text-app">
                Maintenance mode is{" "}
                {state.enabled
                  ? "enabled but outside the active window"
                  : "off"}
                .
              </div>
            </div>
            <QuickToggleButtons enabled={false} />
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-app">
          Configure maintenance
        </h2>
        <p className="mb-3 text-[11px] text-muted">
          Last updated {formatDateTime(state.updated_at)}.
        </p>
        <MaintenanceForm state={state} />
      </div>
    </div>
  );
}
