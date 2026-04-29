"use client";

/* WorkspacesPane — Settings → Workspaces section.
 *
 * Outer shell for the rebuilt workspace settings experience. Each row
 * (owned + joined + pending invites) is collapsible. Expanding a row
 * mounts WorkspaceSettingsView which handles everything else through
 * its own tabs:
 *
 *   General | Storage | Members | Permissions | Activity | Danger
 *
 * Pending invites still get their accept/decline shortcut at the top
 * since those don't need a settings view.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import { useWorkspaces } from "./useWorkspaces";
import {
  formatStorageBytes,
} from "@/app/_data/storage-addons";
import WorkspaceSettingsView from "./workspace-settings/WorkspaceSettingsView";
import type {
  SectionId,
  WorkspaceFullRow,
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

interface WorkspacesPaneProps {
  /** Auto-expand this workspace row on first render. Used by the mobile
   *  Settings deep-link to drop the user straight into a workspace's
   *  settings without an extra tap. */
  initialExpandedId?: string;
  /** Inside the auto-expanded row, jump to this section first. Currently
   *  used by the mobile Settings "AI Assistant" entry to land on the
   *  AI tab. */
  initialSection?: SectionId;
}

export default function WorkspacesPane({
  initialExpandedId,
  initialSection,
}: WorkspacesPaneProps = {}) {
  const { user, supabase, enabled } = useAuth();
  const {
    workspaces: localWs,
    switchWorkspace,
    deleteWorkspace: deleteLocalWorkspace,
  } = useWorkspaces();

  const [rows, setRows] = useState<WorkspaceSummary[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);
  const [expandedId, setExpandedId] = useState<string | null>(
    initialExpandedId ?? null
  );

  // If the deep-linked workspace appears later (loaded after first
  // render) re-apply expansion. Skip if user already toggled something.
  const userToggledRef = useMemo(() => ({ current: false }), []);
  useEffect(() => {
    if (userToggledRef.current) return;
    if (!initialExpandedId) return;
    if (rows.some((r) => r.id === initialExpandedId)) {
      setExpandedId(initialExpandedId);
    }
  }, [initialExpandedId, rows, userToggledRef]);

  // Tier base + name from /api/me. Used by StorageSection.
  const [tierBaseMb, setTierBaseMb] = useState<number | null>(null);
  const [tierName, setTierName] = useState<string>("Free");

  // Lightweight storage summary (cap + used) shown in the row header so
  // the user can see usage without expanding. Backed by the same RPC the
  // detailed view uses.
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

      // Tier base.
      try {
        const meRes = await fetch("/api/me", { cache: "no-store" });
        if (meRes.ok) {
          const meBody = (await meRes.json()) as {
            tier_config?: {
              name?: string | null;
              max_storage_per_workspace_mb?: number | null;
            } | null;
          };
          setTierBaseMb(
            meBody.tier_config?.max_storage_per_workspace_mb ?? null
          );
          setTierName(meBody.tier_config?.name ?? "Free");
        }
      } catch {
        // ignore — fall back to RPC-only cap rendering
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

  const onWorkspaceDeleted = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setPending((prev) => prev.filter((p) => p.workspace_id !== id));
    deleteLocalWorkspace(id);
    setExpandedId(null);
  };

  const onWorkspaceChanged = (
    id: string,
    patch: Partial<WorkspaceFullRow>
  ) => {
    if (typeof patch.name === "string") {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, name: patch.name as string } : r))
      );
    }
  };

  const onError = useCallback(
    (text: string) => setMsg({ type: "error", text }),
    []
  );
  const onSuccess = useCallback(
    (text: string) => setMsg({ type: "success", text }),
    []
  );

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
        <ul className="mt-3 space-y-3">
          {ownedRows.map((w) => (
            <WorkspaceRow
              key={w.id}
              workspace={w}
              storage={rowStorage[w.id]}
              expanded={expandedId === w.id}
              onToggle={() => {
                userToggledRef.current = true;
                setExpandedId((cur) => (cur === w.id ? null : w.id));
              }}
              initialSection={
                expandedId === w.id ? initialSection : undefined
              }
              onSwitch={() => switchWorkspace(w.id)}
              tierBaseMb={tierBaseMb}
              tierName={tierName}
              onError={onError}
              onSuccess={onSuccess}
              onWorkspaceDeleted={onWorkspaceDeleted}
              onWorkspaceChanged={onWorkspaceChanged}
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
        <ul className="mt-3 space-y-3">
          {joinedRows.map((w) => (
            <WorkspaceRow
              key={w.id}
              workspace={w}
              storage={rowStorage[w.id]}
              expanded={expandedId === w.id}
              onToggle={() => {
                userToggledRef.current = true;
                setExpandedId((cur) => (cur === w.id ? null : w.id));
              }}
              initialSection={
                expandedId === w.id ? initialSection : undefined
              }
              onSwitch={() => switchWorkspace(w.id)}
              tierBaseMb={tierBaseMb}
              tierName={tierName}
              onError={onError}
              onSuccess={onSuccess}
              onWorkspaceDeleted={onWorkspaceDeleted}
              onWorkspaceChanged={onWorkspaceChanged}
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
  expanded,
  onToggle,
  onSwitch,
  tierBaseMb,
  tierName,
  onError,
  onSuccess,
  onWorkspaceDeleted,
  onWorkspaceChanged,
  onLeave,
  busy,
  initialSection,
}: {
  workspace: WorkspaceSummary;
  storage: { capBytes: number; usedBytes: number } | undefined;
  expanded: boolean;
  onToggle: () => void;
  onSwitch: () => void;
  tierBaseMb: number | null;
  tierName: string;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
  onWorkspaceDeleted: (id: string) => void;
  onWorkspaceChanged: (id: string, patch: Partial<WorkspaceFullRow>) => void;
  onLeave?: () => void;
  busy?: boolean;
  initialSection?: SectionId;
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
    <li className="rounded-xl border border-app bg-app">
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onSwitch}
            className="block text-left text-sm font-medium text-app transition-colors hover:text-tool-accent"
            title="Open this workspace"
          >
            {workspace.name}
          </button>
          <div className="mt-0.5 text-xs text-muted">
            <span className="capitalize text-secondary">{workspace.role}</span>{" "}
            · {workspace.member_count}{" "}
            {workspace.member_count === 1 ? "member" : "members"} · {usageLabel}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {workspace.role !== "owner" && onLeave && (
            <button
              type="button"
              className={`${PILL} border-rose-400/30 bg-rose-400/10 text-rose-400 hover:bg-rose-400/20`}
              disabled={busy}
              onClick={onLeave}
            >
              Leave
            </button>
          )}
          <button
            type="button"
            className={PILL}
            onClick={onToggle}
            aria-expanded={expanded}
          >
            {expanded ? "Close settings" : "Settings"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-app p-3">
          <WorkspaceSettingsView
            workspace={workspace}
            tierBaseMb={tierBaseMb}
            tierName={tierName}
            onError={onError}
            onSuccess={onSuccess}
            onWorkspaceDeleted={onWorkspaceDeleted}
            onWorkspaceChanged={onWorkspaceChanged}
            initialSection={initialSection}
          />
        </div>
      )}
    </li>
  );
}
