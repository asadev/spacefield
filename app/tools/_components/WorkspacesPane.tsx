"use client";

/* WorkspacesPane — Settings → All workspaces.
 *
 * List view only. Switch active workspace, accept invites, leave.
 * Workspace settings (Members, AI, Storage, Permissions, etc.) are now
 * separate top-level entries in SettingsPanel that operate on the
 * active workspace via WorkspaceScopedSection — no more inline tabs
 * here.
 *
 * Pending invites still get their accept/decline shortcut at the top.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import { useWorkspaces } from "./useWorkspaces";
import {
  formatStorageBytes,
} from "@/app/_data/storage-addons";
import type {
  WorkspaceRole,
  WorkspaceSummary,
} from "./workspace-settings/types";
import { PILL, PRIMARY } from "./workspace-settings/types";

interface PendingInvite {
  id: string;
  workspace_id: string;
  invited_by: string;
  role: WorkspaceRole;
  created_at: string;
  workspace_name?: string;
  inviter_name?: string;
}

export default function WorkspacesPane() {
  const { user, supabase, enabled } = useAuth();
  const {
    workspaces: localWs,
    activeId,
    switchWorkspace,
  } = useWorkspaces();

  const [rows, setRows] = useState<WorkspaceSummary[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);

  // Lightweight storage summary (cap + used) shown in each row so the
  // user can see usage at a glance.
  const [rowStorage, setRowStorage] = useState<
    Record<string, { capBytes: number; usedBytes: number }>
  >({});

  const refresh = useCallback(async () => {
    if (!enabled || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: ws, error: wErr } = await supabase.rpc("my_workspaces");
      if (wErr) throw wErr;
      const wsRows = ((ws as WorkspaceSummary[]) ?? []).map((w) => ({ ...w }));
      setRows(wsRows);

      const { data: invs, error: iErr } = await supabase
        .from("workspace_invites")
        .select("id, workspace_id, invited_by, role, created_at")
        .eq("status", "pending")
        .or(
          `invitee_user_id.eq.${user.id},invitee_email.eq.${user.email?.toLowerCase()}`
        );
      if (iErr) throw iErr;
      const pendingRows = (invs as PendingInvite[]) ?? [];

      if (pendingRows.length > 0) {
        const wsIds = Array.from(
          new Set(pendingRows.map((r) => r.workspace_id))
        );
        const inviterIds = Array.from(
          new Set(pendingRows.map((r) => r.invited_by))
        );
        const [{ data: wsList }, { data: profList }] = await Promise.all([
          supabase.from("workspaces").select("id, name").in("id", wsIds),
          supabase
            .from("profiles")
            .select("user_id, full_name, username")
            .in("user_id", inviterIds),
        ]);
        const wsName = new Map<string, string>();
        for (const w of (wsList as { id: string; name: string }[] | null) ?? [])
          wsName.set(w.id, w.name);
        const profMap = new Map<
          string,
          { full_name: string | null; username: string | null }
        >();
        for (const p of (profList as Array<{
          user_id: string;
          full_name: string | null;
          username: string | null;
        }> | null) ?? [])
          profMap.set(p.user_id, p);
        setPending(
          pendingRows.map((r) => ({
            ...r,
            workspace_name: wsName.get(r.workspace_id),
            inviter_name:
              profMap.get(r.invited_by)?.full_name ||
              profMap.get(r.invited_by)?.username ||
              undefined,
          }))
        );
      } else {
        setPending([]);
      }

      // Per-row storage summary for ALL workspaces (members can see
      // usage too — RLS gates the RPC).
      const summaries = await Promise.all(
        wsRows.map(async (w) => {
          const { data } = await supabase.rpc("workspace_storage", {
            ws_id: w.id,
          });
          const row = Array.isArray(data) ? data[0] : null;
          return {
            id: w.id,
            capBytes: Number(
              (row as { cap_bytes?: number } | null)?.cap_bytes ?? 0
            ),
            usedBytes: Number(
              (row as { used_bytes?: number } | null)?.used_bytes ?? 0
            ),
          };
        })
      );
      const next: Record<string, { capBytes: number; usedBytes: number }> = {};
      for (const s of summaries) {
        next[s.id] = { capBytes: s.capBytes, usedBytes: s.usedBytes };
      }
      setRowStorage(next);
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to load",
      });
    } finally {
      setLoading(false);
    }
  }, [enabled, user, supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /* ───────── Pending invite mutations ───────── */

  const handleAccept = async (inviteId: string) => {
    setBusy(inviteId);
    setMsg(null);
    try {
      const accepted = pending.find((p) => p.id === inviteId);
      const { error } = await supabase.rpc("accept_workspace_invite", {
        invite_id: inviteId,
      });
      if (error) throw error;
      // Log activity from the client — we don't own the RPC.
      if (accepted?.workspace_id) {
        void supabase.rpc("log_workspace_activity", {
          ws_id: accepted.workspace_id,
          k: "member_joined",
          body: { invite_id: inviteId },
        });
      }
      setMsg({ type: "success", text: "Invite accepted." });
      await refresh();
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Accept failed",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleDecline = async (inviteId: string) => {
    setBusy(inviteId);
    try {
      const { error } = await supabase.rpc("decline_workspace_invite", {
        invite_id: inviteId,
      });
      if (error) throw error;
      await refresh();
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Decline failed",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleLeave = async (workspaceId: string) => {
    if (!confirm("Leave this workspace? You can be re-invited later.")) return;
    setBusy(workspaceId);
    try {
      const { error } = await supabase.rpc("leave_workspace", {
        ws_id: workspaceId,
      });
      if (error) throw error;
      void supabase.rpc("log_workspace_activity", {
        ws_id: workspaceId,
        k: "member_left",
        body: {},
      });
      await refresh();
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Leave failed",
      });
    } finally {
      setBusy(null);
    }
  };

  /* ───────── Render ───────── */

  if (!enabled) {
    return (
      <div className="text-sm text-secondary">
        Sign-in isn&apos;t configured for this build.
      </div>
    );
  }
  if (!user) {
    return (
      <div className="rounded-xl border border-app bg-app-elevated p-5 text-sm text-secondary">
        Sign in to manage your workspaces and invites.
      </div>
    );
  }
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-32 animate-pulse rounded-xl bg-surface" />
        <div className="h-32 animate-pulse rounded-xl bg-surface" />
      </div>
    );
  }

  const ownedRows = rows.filter((r) => r.role === "owner");
  const joinedRows = rows.filter((r) => r.role !== "owner");

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            msg.type === "success"
              ? "border-tool-accent-soft bg-tool-accent-soft text-app"
              : "border-rose-400/25 bg-rose-400/10 text-rose-400"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Pending invites */}
      {pending.length > 0 && (
        <div className="rounded-xl border border-tool-accent-soft bg-tool-accent-soft/40 p-5">
          <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-app">
            Invitations
          </h3>
          <div className="mt-3 space-y-3">
            {pending.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col gap-3 rounded-lg border border-app bg-app-elevated p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-app">
                    {inv.inviter_name || "Someone"} invited you to{" "}
                    <strong>{inv.workspace_name || "a workspace"}</strong>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    Role: {inv.role}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={PRIMARY}
                    disabled={busy === inv.id}
                    onClick={() => handleAccept(inv.id)}
                  >
                    {busy === inv.id ? "Joining…" : "Accept"}
                  </button>
                  <button
                    type="button"
                    className={PILL}
                    disabled={busy === inv.id}
                    onClick={() => handleDecline(inv.id)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hint pointing to per-workspace settings sections in the rail */}
      <p className="text-xs text-muted">
        Switch to a workspace by clicking its name. Workspace settings —
        Members, AI Assistant, Storage, Permissions, Activity, Danger zone —
        each have their own entry in the sidebar and operate on whichever
        workspace is currently active.
      </p>

      {/* Owned workspaces */}
      <Section
        title="My workspaces"
        empty={
          ownedRows.length === 0 ? (
            <p className="mt-3 text-sm text-secondary">
              You haven&apos;t created a workspace yet. Use File → New Workspace.
            </p>
          ) : null
        }
      >
        <ul className="mt-3 space-y-2">
          {ownedRows.map((w) => (
            <WorkspaceRow
              key={w.id}
              workspace={w}
              storage={rowStorage[w.id]}
              isActive={w.id === activeId}
              onSwitch={() => switchWorkspace(w.id)}
            />
          ))}
        </ul>
      </Section>

      {/* Joined workspaces */}
      <Section
        title="Joined workspaces"
        empty={
          joinedRows.length === 0 ? (
            <p className="mt-3 text-sm text-secondary">
              No shared workspaces yet. When someone invites you, accept above
              and it&apos;ll appear here.
            </p>
          ) : null
        }
      >
        <ul className="mt-3 space-y-2">
          {joinedRows.map((w) => (
            <WorkspaceRow
              key={w.id}
              workspace={w}
              storage={rowStorage[w.id]}
              isActive={w.id === activeId}
              onSwitch={() => switchWorkspace(w.id)}
              onLeave={() => handleLeave(w.id)}
              busy={busy === w.id}
            />
          ))}
        </ul>
      </Section>

      {localWs.length > rows.length && (
        <p className="text-xs text-muted">
          {localWs.length - rows.length} local workspace
          {localWs.length - rows.length === 1 ? "" : "s"} aren&apos;t synced
          yet. They&apos;ll appear here automatically.
        </p>
      )}
    </div>
  );
}

/* ─────────── Helpers ─────────── */

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-5">
      <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
        {title}
      </h3>
      {empty ?? children}
    </div>
  );
}

function WorkspaceRow({
  workspace,
  storage,
  isActive,
  onSwitch,
  onLeave,
  busy,
}: {
  workspace: WorkspaceSummary;
  storage: { capBytes: number; usedBytes: number } | undefined;
  isActive: boolean;
  onSwitch: () => void;
  onLeave?: () => void;
  busy?: boolean;
}) {
  const cap = storage?.capBytes ?? 0;
  const used = storage?.usedBytes ?? 0;
  const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;

  const usageLabel = useMemo(
    () =>
      cap > 0
        ? `${formatStorageBytes(used)} / ${formatStorageBytes(cap)} (${pct.toFixed(0)}%)`
        : "Storage usage —",
    [cap, used, pct]
  );

  return (
    <li
      className={`flex flex-col gap-3 rounded-xl border bg-app p-3 transition-colors sm:flex-row sm:items-center sm:justify-between ${
        isActive
          ? "border-tool-accent bg-tool-accent-soft/20"
          : "border-app hover:bg-surface/40"
      }`}
    >
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onSwitch}
          disabled={isActive}
          className={`block text-left text-sm font-medium transition-colors ${
            isActive
              ? "text-tool-accent"
              : "text-app hover:text-tool-accent"
          }`}
          title={isActive ? "Currently active workspace" : "Switch to this workspace"}
        >
          {workspace.name}
          {isActive && (
            <span className="ml-2 rounded-md border border-tool-accent bg-tool-accent-soft px-1.5 py-0.5 text-[0.55rem] uppercase tracking-[0.14em] text-tool-accent">
              Active
            </span>
          )}
        </button>
        <div className="mt-0.5 text-xs text-muted">
          <span className="capitalize text-secondary">{workspace.role}</span>{" "}
          · {workspace.member_count}{" "}
          {workspace.member_count === 1 ? "member" : "members"} · {usageLabel}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!isActive && (
          <button
            type="button"
            className={PILL}
            onClick={onSwitch}
          >
            Switch
          </button>
        )}
        {workspace.role !== "owner" && onLeave && (
          <button
            type="button"
            className={`${PILL} border-rose-400/30 bg-rose-400/10 text-rose-400 hover:bg-rose-400/20`}
            disabled={busy}
            onClick={onLeave}
          >
            {busy ? "Leaving…" : "Leave"}
          </button>
        )}
      </div>
    </li>
  );
}
