"use client";

/* MembersSection — list members with role management + invite UI.
 *
 * Mirrors the previous flat layout. Role-management buttons follow the
 * existing matrix:
 *   - Owners: can promote/demote anyone except themselves.
 *   - Admins: can remove members but not other admins.
 *   - Members: read-only view.
 *
 * The Invite controls live inline at the top so the user doesn't have
 * to push another sub-screen on mobile.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../useAuth";
import {
  DANGER,
  INPUT,
  PILL,
  PRIMARY,
  type MemberRow,
  type WorkspaceRole,
} from "./types";

interface Props {
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
  whoCanInvite: "admins" | "members";
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
  onChanged: () => void;
}

export default function MembersSection({
  workspaceId,
  workspaceName,
  role,
  whoCanInvite,
  onError,
  onSuccess,
  onChanged,
}: Props) {
  const { user, supabase } = useAuth();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [inviteIdentifier, setInviteIdentifier] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteSending, setInviteSending] = useState(false);
  const [tierCap, setTierCap] = useState<number | null>(null);
  const [tierName, setTierName] = useState<string | null>(null);

  useEffect(() => {
    /* Read the owner's tier cap so we can pre-block invites that the
     * server-side workspace_member_quota trigger would reject anyway.
     * Without this, the user types an email, hits Send, and gets a
     * generic "Invite failed" — much better to surface the limit in
     * the UI BEFORE they bother. */
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as {
          tier?: string;
          tier_config?: { max_members_per_workspace?: number };
        };
        if (cancelled) return;
        setTierCap(j.tier_config?.max_members_per_workspace ?? null);
        setTierName(j.tier ?? null);
      } catch {
        /* swallow — fall back to letting the server enforce */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data: mems } = await supabase
        .from("workspace_members")
        .select("user_id, role, joined_at")
        .eq("workspace_id", workspaceId);
      const userIds = ((mems as Array<{ user_id: string }>) ?? []).map(
        (m) => m.user_id
      );
      const { data: profList } =
        userIds.length > 0
          ? await supabase
              .from("profiles")
              .select("user_id, username, full_name, avatar_url")
              .in("user_id", userIds)
          : { data: [] as Array<{
              user_id: string;
              username: string | null;
              full_name: string | null;
              avatar_url: string | null;
            }> };
      const profMap = new Map(
        (profList ?? []).map((p) => [p.user_id, p])
      );
      setMembers(
        ((mems as Array<{
          user_id: string;
          role: WorkspaceRole;
          joined_at: string;
        }>) ?? []).map((m) => {
          const p = profMap.get(m.user_id);
          return {
            user_id: m.user_id,
            role: m.role,
            joined_at: m.joined_at,
            username: p?.username ?? null,
            full_name: p?.full_name ?? null,
            email: m.user_id === user?.id ? user?.email ?? null : null,
            avatar_url: p?.avatar_url ?? null,
          };
        })
      );
    } finally {
      setLoading(false);
    }
  }, [supabase, workspaceId, user?.id, user?.email]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const canInvite =
    role === "owner" ||
    (role === "admin") ||
    (role === "member" && whoCanInvite === "members");

  const sendInvite = async () => {
    const trimmed = inviteIdentifier.trim();
    if (!trimmed) return;
    setInviteSending(true);
    try {
      const res = await fetch("/api/workspaces/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          identifier: trimmed,
          role: inviteRole,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        email_sent?: boolean;
        reason?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || `Invite failed (${res.status})`);
      }
      // Log the activity row from the client (the invite RPC doesn't
      // log on its own, and we don't want to edit that RPC). Best-effort.
      void supabase.rpc("log_workspace_activity", {
        ws_id: workspaceId,
        k: "invited",
        body: { identifier: trimmed, role: inviteRole },
      });
      const sentNote =
        body.email_sent === false
          ? body.reason === "no_recipient_email"
            ? " (couldn't email — recipient has no address on file yet)"
            : " (the email failed to send, but the invite is saved)"
          : "";
      onSuccess(`Invite sent to ${trimmed}.${sentNote}`);
      setInviteIdentifier("");
      setInviteRole("member");
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviteSending(false);
    }
  };

  const setRole = async (
    targetId: string,
    newRole: WorkspaceRole
  ) => {
    setBusy(`role:${targetId}`);
    try {
      const target = members.find((m) => m.user_id === targetId);
      const { error } = await supabase.rpc("set_member_role", {
        ws_id: workspaceId,
        target_id: targetId,
        new_role: newRole,
      });
      if (error) throw error;
      void supabase.rpc("log_workspace_activity", {
        ws_id: workspaceId,
        k: "role_changed",
        body: {
          target_id: targetId,
          target_name: target?.full_name ?? target?.username ?? null,
          new_role: newRole,
        },
      });
      await refresh();
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Role change failed");
    } finally {
      setBusy(null);
    }
  };

  const removeMember = async (targetId: string) => {
    if (!confirm("Remove this member from the workspace?")) return;
    setBusy(`remove:${targetId}`);
    try {
      const { error } = await supabase.rpc("remove_workspace_member", {
        ws_id: workspaceId,
        target_id: targetId,
      });
      if (error) throw error;
      await refresh();
      onChanged();
      onSuccess("Member removed.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(null);
    }
  };

  /* Cap-aware invite gate. The DB trigger workspace_member_quota
   * rejects oversize invites server-side; the UI just surfaces the
   * limit ahead of time so users know why the form is locked. Free /
   * Pro = 1-user workspaces (no invites at all); Team = 5 included
   * with seats purchasable. */
  const atCap =
    tierCap !== null && !loading && members.length >= tierCap;
  const isSoloTier =
    tierCap !== null && tierCap <= 1 && (tierName === "free" || tierName === "pro");

  return (
    <div className="space-y-5">
      {canInvite && atCap && (
        <div className="rounded-xl border border-tool-accent-soft bg-tool-accent-soft/30 p-4">
          <h4 className="mb-2 text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
            {isSoloTier ? "Solo workspace" : "Seat limit reached"}
          </h4>
          <p className="text-sm text-app">
            {isSoloTier
              ? `${tierName === "pro" ? "Pro" : "Free"} workspaces are single-user. Upgrade to Team to invite up to 5 members (extra seats $5/mo each).`
              : `You've used all ${tierCap} seats on this workspace. Buy more seats at $5/mo each to keep adding members.`}
          </p>
          <div className="mt-3 flex gap-2">
            <a
              href="/pricing"
              className="inline-flex items-center gap-1.5 rounded-md bg-tool-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              {isSoloTier ? "Upgrade to Team" : "Add more seats"}
            </a>
          </div>
        </div>
      )}
      {canInvite && !atCap && (
        <div className="rounded-xl border border-app bg-app p-4">
          <h4 className="mb-3 text-[0.6rem] uppercase tracking-[0.2em] text-muted">
            Invite to {workspaceName}
            {tierCap !== null && (
              <span className="ml-2 text-faint">
                · {members.length} / {tierCap} seats used
              </span>
            )}
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input
              type="text"
              value={inviteIdentifier}
              onChange={(e) => setInviteIdentifier(e.target.value)}
              placeholder="email@domain.com  or  username"
              className={INPUT}
              autoCapitalize="none"
              autoCorrect="off"
            />
            <select
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(e.target.value as "admin" | "member")
              }
              className={INPUT}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="button"
              onClick={sendInvite}
              disabled={inviteSending || !inviteIdentifier.trim()}
              className={PRIMARY}
            >
              {inviteSending ? "Sending…" : "Send invite"}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            <strong className="text-secondary">Member</strong> can use
            installed tools.{" "}
            <strong className="text-secondary">Admin</strong> can also
            invite others and install new apps.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-app bg-app p-4">
        <h4 className="mb-3 text-[0.6rem] uppercase tracking-[0.2em] text-muted">
          Members ({loading ? "…" : members.length})
        </h4>
        {loading ? (
          <div className="h-20 animate-pulse rounded-lg bg-surface" />
        ) : (
          <ul className="divide-y divide-app">
            {members.map((m) => {
              const canManage =
                role === "owner" ||
                (role === "admin" && m.role === "member");
              const isMe = m.user_id === user?.id;
              return (
                <li
                  key={m.user_id}
                  className="flex items-center gap-3 py-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tool-accent text-sm font-semibold text-white">
                    {m.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.avatar_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      (
                        m.full_name?.[0] ||
                        m.username?.[0] ||
                        "?"
                      ).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-app">
                      {m.full_name ||
                        m.username ||
                        m.user_id.slice(0, 8)}
                      {isMe && (
                        <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-muted">
                          you
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {m.username ? `@${m.username}` : m.email || ""} ·{" "}
                      <span className="capitalize">{m.role}</span>
                    </div>
                  </div>
                  {canManage && !isMe && m.role !== "owner" && (
                    <div className="flex items-center gap-2">
                      {m.role !== "admin" && role === "owner" && (
                        <button
                          type="button"
                          className={PILL}
                          disabled={busy === `role:${m.user_id}`}
                          onClick={() => setRole(m.user_id, "admin")}
                        >
                          Make admin
                        </button>
                      )}
                      {m.role === "admin" && role === "owner" && (
                        <button
                          type="button"
                          className={PILL}
                          disabled={busy === `role:${m.user_id}`}
                          onClick={() => setRole(m.user_id, "member")}
                        >
                          Demote
                        </button>
                      )}
                      <button
                        type="button"
                        className={DANGER}
                        disabled={busy === `remove:${m.user_id}`}
                        onClick={() => removeMember(m.user_id)}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
