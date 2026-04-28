"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * PermissionsAdmin — workspace-level CRM permission defaults.
 *
 * Stored as a single jsonb blob in `workspace_state` keyed `crm:permissions`
 * (so we don't need a new migration). Shape:
 *   {
 *     defaults: { contact: 'team', company: 'team', deal: 'owner', ... },
 *     creatable: { contact: true, ... }
 *   }
 *
 * Owner-only. Non-owners see a read-only banner.
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/lib/workspaces/client";
import { createClient } from "@/lib/supabase/client";
import type { CrmRecordType, CrmVisibility } from "../types";
import { RECORD_TYPE_VALUES, VISIBILITY_VALUES } from "../types";

export interface CrmPermissionsState {
  defaults: Partial<Record<CrmRecordType, CrmVisibility>>;
  creatable: Partial<Record<CrmRecordType, boolean>>;
}

export const CRM_PERMISSIONS_STATE_KEY = "crm:permissions";

const DEFAULT_STATE: CrmPermissionsState = {
  defaults: {
    contact: "team",
    company: "team",
    deal: "team",
    lead: "team",
    inventory: "team",
  },
  creatable: {
    contact: true,
    company: true,
    deal: true,
    lead: true,
    inventory: true,
  },
};

const TYPE_LABELS: Record<CrmRecordType, string> = {
  contact: "Contacts",
  company: "Companies",
  deal: "Deals",
  lead: "Leads",
  inventory: "Inventory",
};

/**
 * Lightweight client-side reader. Other surfaces (Phase 2A/2B "create"
 * flows) can call this to learn the workspace's default visibility for
 * a given record type. Returns `team` if no override is set.
 */
export async function readCrmPermissions(
  workspaceId: string
): Promise<CrmPermissionsState> {
  try {
    const sb = createClient();
    const { data } = await sb
      .from("workspace_state")
      .select("value")
      .eq("workspace_id", workspaceId)
      .eq("key", CRM_PERMISSIONS_STATE_KEY)
      .maybeSingle();
    const value = (data?.value ?? null) as CrmPermissionsState | null;
    return mergeWithDefaults(value);
  } catch {
    return DEFAULT_STATE;
  }
}

function mergeWithDefaults(
  partial: CrmPermissionsState | null
): CrmPermissionsState {
  return {
    defaults: { ...DEFAULT_STATE.defaults, ...(partial?.defaults ?? {}) },
    creatable: { ...DEFAULT_STATE.creatable, ...(partial?.creatable ?? {}) },
  };
}

export default function PermissionsAdmin() {
  const { current, signedIn } = useWorkspace();
  const workspaceId = current.kind === "team" ? current.id : null;
  const role = current.kind === "team" ? current.role : null;
  const isOwner = role === "owner";

  const [state, setState] = useState<CrmPermissionsState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const next = await readCrmPermissions(workspaceId);
        if (!cancelled) setState(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const save = useCallback(
    async (next: CrmPermissionsState) => {
      if (!workspaceId) return;
      setSaving(true);
      setError(null);
      try {
        const sb = createClient();
        const { error: upErr } = await sb
          .from("workspace_state")
          .upsert(
            {
              workspace_id: workspaceId,
              key: CRM_PERMISSIONS_STATE_KEY,
              value: next,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "workspace_id,key" }
          );
        if (upErr) throw new Error(upErr.message);
        setSavedAt(Date.now());
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [workspaceId]
  );

  const setDefault = useCallback(
    (rt: CrmRecordType, vis: CrmVisibility) => {
      const next: CrmPermissionsState = {
        ...state,
        defaults: { ...state.defaults, [rt]: vis },
      };
      setState(next);
      void save(next);
    },
    [state, save]
  );

  const setCreatable = useCallback(
    (rt: CrmRecordType, value: boolean) => {
      const next: CrmPermissionsState = {
        ...state,
        creatable: { ...state.creatable, [rt]: value },
      };
      setState(next);
      void save(next);
    },
    [state, save]
  );

  if (!signedIn || !workspaceId) {
    return (
      <div className="flex h-full items-center justify-center bg-app p-6">
        <div className="rounded-md border border-app bg-app-elevated p-4 text-sm text-secondary">
          Sign in and pick a team workspace to manage CRM permissions.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-app">
      <header className="flex shrink-0 items-center justify-between border-b border-app bg-app-elevated px-3 py-2">
        <div>
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
            crm.settings.permissions
          </div>
          <h2 className="text-sm font-semibold text-app">Default permissions</h2>
        </div>
        <span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
          {saving ? "Saving…" : savedAt ? "Saved" : "—"}
        </span>
      </header>
      {!isOwner && (
        <div className="border-b border-app bg-app px-3 py-2 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
          Owner role required to change permissions. Read-only mode.
        </div>
      )}
      <div className="flex-1 overflow-auto p-3">
        {error && (
          <div className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
            {error}
          </div>
        )}
        {loading ? (
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
            Loading…
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-y-1.5 text-sm">
            <thead>
              <tr className="text-left font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                <th className="py-1 pl-1">Record type</th>
                <th className="py-1">Default visibility</th>
                <th className="py-1 text-right pr-1">Members can create</th>
              </tr>
            </thead>
            <tbody>
              {RECORD_TYPE_VALUES.map((rt) => {
                const vis = state.defaults[rt] ?? "team";
                const canCreate = state.creatable[rt] ?? true;
                return (
                  <tr key={rt} className="bg-app-elevated">
                    <td className="rounded-l-md border-y border-l border-app px-2 py-1.5 text-app">
                      {TYPE_LABELS[rt]}
                    </td>
                    <td className="border-y border-app px-2 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {VISIBILITY_VALUES.map((v) => {
                          const active = v === vis;
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => isOwner && setDefault(rt, v)}
                              disabled={!isOwner}
                              className={`rounded-md border px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em] ${
                                active
                                  ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                                  : "border-app text-secondary hover:text-app"
                              } disabled:opacity-50`}
                            >
                              {v}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="rounded-r-md border-y border-r border-app px-2 py-1.5 text-right">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={canCreate}
                          disabled={!isOwner}
                          onChange={(e) => setCreatable(rt, e.target.checked)}
                          className="h-4 w-4 accent-[var(--tool-accent)]"
                        />
                        <span className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-secondary">
                          {canCreate ? "Yes" : "No"}
                        </span>
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="mt-3 max-w-prose font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
          Defaults apply when a member creates a new record. Owners + admins
          always see everything regardless of visibility.
        </p>
      </div>
    </div>
  );
}
