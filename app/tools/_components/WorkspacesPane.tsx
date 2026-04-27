"use client";

/* WorkspacesPane — Settings → Workspaces section.
 *
 * Two lists: workspaces I own + workspaces I've joined.
 *
 * Per workspace:
 *   - Owner row: invite, manage members, rename, delete
 *   - Admin row: invite, manage members (non-admins), leave
 *   - Member row: leave only
 *
 * Pending invites addressed to me appear at the top with Accept / Decline.
 *
 * Reads my_workspaces() RPC for the lists. Mutations call the RPCs:
 *   send_workspace_invite, accept_workspace_invite, decline_workspace_invite,
 *   leave_workspace, set_member_role, remove_workspace_member.
 *
 * Workspace deletion uses a regular DELETE on public.workspaces — RLS
 * policy "owner deletes workspace" enforces.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import { useWorkspaces } from "./useWorkspaces";
import {
  STORAGE_ADDON_OPTIONS,
  formatStorageBytes,
  formatStorageMb,
  formatStorageGb,
  isValidAddonGb,
} from "@/app/_data/storage-addons";

type Role = "owner" | "admin" | "member";

interface MyWorkspace {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  role: Role;
  member_count: number;
}

interface PendingInvite {
  id: string;
  workspace_id: string;
  invited_by: string;
  role: Role;
  created_at: string;
  workspace_name?: string;
  inviter_name?: string;
}

interface Member {
  user_id: string;
  role: Role;
  joined_at: string;
  username: string | null;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

const PILL =
  "rounded-md border border-app bg-app px-2 py-1 text-[0.62rem] uppercase tracking-[0.14em] font-medium text-app transition-colors hover:bg-surface disabled:opacity-50";

const PRIMARY =
  "rounded-md bg-tool-accent px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.14em] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";

const DANGER =
  "rounded-md border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-[0.62rem] uppercase tracking-[0.14em] font-medium text-rose-400 transition-colors hover:bg-rose-400/20";

export default function WorkspacesPane() {
  const { user, supabase, enabled } = useAuth();
  const {
    workspaces: localWs,
    switchWorkspace,
    deleteWorkspace: deleteLocalWorkspace,
  } = useWorkspaces();

  const [rows, setRows] = useState<MyWorkspace[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Invite dialog state
  const [inviteOpenFor, setInviteOpenFor] = useState<string | null>(null);
  const [inviteIdentifier, setInviteIdentifier] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [inviteSending, setInviteSending] = useState(false);

  // Members dialog
  const [membersOpenFor, setMembersOpenFor] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Storage state — per-workspace cap + used bytes (from workspace_storage
  // RPC) and the currently-selected add-on row (from workspace_storage_addons).
  // Both keyed by workspace id; only owners can mutate.
  const [storage, setStorage] = useState<
    Record<string, { capBytes: number; usedBytes: number }>
  >({});
  const [addonSel, setAddonSel] = useState<Record<string, number>>({});
  // Local pending selection (the dropdown value before the user confirms)
  const [addonDraft, setAddonDraft] = useState<Record<string, number>>({});
  // Tier base (MB) — same for every workspace the user owns; pulled from
  // /api/me. Used to render the "Base X + Add-on Y = Z" breakdown.
  const [tierBaseMb, setTierBaseMb] = useState<number | null>(null);
  const [tierName, setTierName] = useState<string>("Free");

  const refresh = useCallback(async () => {
    if (!enabled || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: ws, error: wErr } = await supabase.rpc("my_workspaces");
      if (wErr) throw wErr;
      setRows((ws as MyWorkspace[]) ?? []);

      const { data: invs, error: iErr } = await supabase
        .from("workspace_invites")
        .select("id, workspace_id, invited_by, role, created_at")
        .eq("status", "pending")
        .or(
          `invitee_user_id.eq.${user.id},invitee_email.eq.${user.email?.toLowerCase()}`
        );
      if (iErr) throw iErr;
      const pendingRows = (invs as PendingInvite[]) ?? [];

      // Fetch workspace names + inviter profiles in batches.
      if (pendingRows.length > 0) {
        const wsIds = Array.from(new Set(pendingRows.map((r) => r.workspace_id)));
        const inviterIds = Array.from(new Set(pendingRows.map((r) => r.invited_by)));
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
        const profMap = new Map<string, { full_name: string | null; username: string | null }>();
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

      // Load storage cap + add-on for every owned workspace, plus the
      // user's tier base from /api/me. RPC + per-row select are RLS-
      // gated; failures are non-fatal — we just leave the storage row
      // out of the map.
      const ownedRowsForStorage = ((ws as MyWorkspace[]) ?? []).filter(
        (w) => w.role === "owner"
      );
      try {
        const meRes = await fetch("/api/me", { cache: "no-store" });
        if (meRes.ok) {
          const meBody = (await meRes.json()) as {
            tier_config?: {
              name?: string | null;
              max_storage_per_workspace_mb?: number | null;
            } | null;
          };
          const baseMb =
            meBody.tier_config?.max_storage_per_workspace_mb ?? null;
          setTierBaseMb(baseMb);
          setTierName(meBody.tier_config?.name ?? "Free");
        }
      } catch {
        // ignore — fall back to RPC-only cap rendering
      }

      if (ownedRowsForStorage.length > 0) {
        const ownedIds = ownedRowsForStorage.map((w) => w.id);
        const [storageResults, { data: addonRows }] = await Promise.all([
          Promise.all(
            ownedIds.map(async (id) => {
              const { data } = await supabase.rpc("workspace_storage", {
                ws_id: id,
              });
              const row = Array.isArray(data) ? data[0] : null;
              return {
                id,
                capBytes: Number(
                  (row as { cap_bytes?: number } | null)?.cap_bytes ?? 0
                ),
                usedBytes: Number(
                  (row as { used_bytes?: number } | null)?.used_bytes ?? 0
                ),
              };
            })
          ),
          supabase
            .from("workspace_storage_addons")
            .select("workspace_id, addon_gb")
            .in("workspace_id", ownedIds),
        ]);
        const nextStorage: Record<
          string,
          { capBytes: number; usedBytes: number }
        > = {};
        for (const s of storageResults) {
          nextStorage[s.id] = {
            capBytes: s.capBytes,
            usedBytes: s.usedBytes,
          };
        }
        setStorage(nextStorage);

        const nextAddons: Record<string, number> = {};
        for (const a of (addonRows as Array<{
          workspace_id: string;
          addon_gb: number;
        }> | null) ?? []) {
          nextAddons[a.workspace_id] = a.addon_gb;
        }
        setAddonSel(nextAddons);
        setAddonDraft((prev) => {
          const merged: Record<string, number> = { ...prev };
          for (const id of ownedIds) {
            // Sync draft to server value when the user has no pending edit.
            if (merged[id] === undefined) {
              merged[id] = nextAddons[id] ?? 0;
            }
          }
          return merged;
        });
      } else {
        setStorage({});
        setAddonSel({});
      }
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

  /* ───────── Storage add-on mutation ───────── */

  const handleSaveAddon = async (workspaceId: string) => {
    const next = addonDraft[workspaceId] ?? 0;
    if (!isValidAddonGb(next)) {
      setMsg({ type: "error", text: "Invalid storage add-on selection." });
      return;
    }
    if ((addonSel[workspaceId] ?? 0) === next) {
      setMsg({ type: "success", text: "No change to apply." });
      return;
    }
    setBusy(`addon:${workspaceId}`);
    setMsg(null);
    try {
      const res = await fetch("/api/workspaces/storage-addon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, addonGb: next }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        capBytes?: number | null;
        usedBytes?: number | null;
      };
      if (!res.ok) {
        throw new Error(body.error || `Update failed (${res.status})`);
      }
      setAddonSel((prev) => ({ ...prev, [workspaceId]: next }));
      if (
        typeof body.capBytes === "number" &&
        typeof body.usedBytes === "number"
      ) {
        setStorage((prev) => ({
          ...prev,
          [workspaceId]: {
            capBytes: body.capBytes ?? 0,
            usedBytes: body.usedBytes ?? 0,
          },
        }));
      }
      setMsg({
        type: "success",
        text:
          next === 0
            ? "Storage add-on removed."
            : `Storage add-on applied (mock — payment coming soon).`,
      });
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Update failed",
      });
    } finally {
      setBusy(null);
    }
  };

  /* ───────── Mutations ───────── */

  const handleSendInvite = async (workspaceId: string) => {
    if (!inviteIdentifier.trim()) return;
    setInviteSending(true);
    setMsg(null);
    try {
      // POST /api/workspaces/invite wraps the RPC and ALSO fires the
      // branded email via Resend. Calling the RPC directly from the
      // client only created the row; recipients didn't actually get
      // notified.
      const res = await fetch("/api/workspaces/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          identifier: inviteIdentifier.trim(),
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
      const sentNote =
        body.email_sent === false
          ? body.reason === "no_recipient_email"
            ? " (couldn't email — recipient has no address on file yet)"
            : " (the email failed to send, but the invite is saved)"
          : "";
      setMsg({
        type: "success",
        text: `Invite sent to ${inviteIdentifier}.${sentNote}`,
      });
      setInviteIdentifier("");
      setInviteRole("member");
      setInviteOpenFor(null);
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Invite failed",
      });
    } finally {
      setInviteSending(false);
    }
  };

  const handleAccept = async (inviteId: string) => {
    setBusy(inviteId);
    setMsg(null);
    try {
      const { error } = await supabase.rpc("accept_workspace_invite", { invite_id: inviteId });
      if (error) throw error;
      setMsg({ type: "success", text: "Invite accepted." });
      await refresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Accept failed" });
    } finally {
      setBusy(null);
    }
  };

  const handleDecline = async (inviteId: string) => {
    setBusy(inviteId);
    try {
      const { error } = await supabase.rpc("decline_workspace_invite", { invite_id: inviteId });
      if (error) throw error;
      await refresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Decline failed" });
    } finally {
      setBusy(null);
    }
  };

  const handleLeave = async (workspaceId: string) => {
    if (!confirm("Leave this workspace? You can be re-invited later.")) return;
    setBusy(workspaceId);
    try {
      const { error } = await supabase.rpc("leave_workspace", { ws_id: workspaceId });
      if (error) throw error;
      await refresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Leave failed" });
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (workspaceId: string, name: string) => {
    if (
      !confirm(
        `Delete workspace "${name}"? This deletes all its state and removes everyone. Cannot be undone.`
      )
    )
      return;

    // Optimistic UI: drop the row + local copy immediately so the user
    // sees the delete take effect in the same frame. Stash the snapshot
    // so we can restore on failure.
    const snapshotRows = rows;
    const snapshotPending = pending;
    setRows((prev) => prev.filter((r) => r.id !== workspaceId));
    setPending((prev) => prev.filter((p) => p.workspace_id !== workspaceId));
    deleteLocalWorkspace(workspaceId);
    setMsg({ type: "success", text: "Workspace deleted." });

    // Cloud delete in the background. We don't await refresh() here —
    // the optimistic update is already in place. If the delete fails
    // we restore from the snapshot.
    setBusy(workspaceId);
    void (async () => {
      try {
        const { error } = await supabase
          .from("workspaces")
          .delete()
          .eq("id", workspaceId);
        if (error) throw error;
      } catch (err) {
        setRows(snapshotRows);
        setPending(snapshotPending);
        setMsg({
          type: "error",
          text: err instanceof Error ? err.message : "Delete failed",
        });
      } finally {
        setBusy((b) => (b === workspaceId ? null : b));
      }
    })();
  };

  const openMembers = async (workspaceId: string) => {
    setMembersOpenFor(workspaceId);
    setMembersLoading(true);
    try {
      const { data: mems } = await supabase
        .from("workspace_members")
        .select("user_id, role, joined_at")
        .eq("workspace_id", workspaceId);
      const userIds = ((mems as Array<{ user_id: string }>) ?? []).map((m) => m.user_id);
      const [{ data: profList }, { data: emails }] = await Promise.all([
        userIds.length > 0
          ? supabase
              .from("profiles")
              .select("user_id, username, full_name, avatar_url")
              .in("user_id", userIds)
          : Promise.resolve({ data: [] as Array<{ user_id: string; username: string | null; full_name: string | null; avatar_url: string | null }> }),
        // Emails would require a service-role lookup on auth.users; we
        // skip showing emails for non-current-user members for now and
        // rely on username/full_name.
        Promise.resolve({ data: [] as never[] }),
      ]);
      void emails;
      const profMap = new Map(
        ((profList as Array<{
          user_id: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
        }>) ?? []).map((p) => [p.user_id, p])
      );
      setMembers(
        ((mems as Array<{ user_id: string; role: Role; joined_at: string }>) ?? []).map(
          (m) => {
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
          }
        )
      );
    } finally {
      setMembersLoading(false);
    }
  };

  const handleSetRole = async (workspaceId: string, targetId: string, newRole: Role) => {
    setBusy(`${workspaceId}:${targetId}`);
    try {
      const { error } = await supabase.rpc("set_member_role", {
        ws_id: workspaceId,
        target_id: targetId,
        new_role: newRole,
      });
      if (error) throw error;
      await openMembers(workspaceId);
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Update failed" });
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveMember = async (workspaceId: string, targetId: string) => {
    if (!confirm("Remove this member from the workspace?")) return;
    setBusy(`${workspaceId}:${targetId}`);
    try {
      const { error } = await supabase.rpc("remove_workspace_member", {
        ws_id: workspaceId,
        target_id: targetId,
      });
      if (error) throw error;
      await openMembers(workspaceId);
      await refresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Remove failed" });
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

      {/* Workspaces I own */}
      <div className="rounded-xl border border-app bg-app-elevated p-5">
        <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
          My workspaces
        </h3>
        {ownedRows.length === 0 ? (
          <p className="mt-3 text-sm text-secondary">
            You haven&apos;t created a workspace yet. Use File → New Workspace.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-app">
            {ownedRows.map((w) => (
              <li key={w.id} className="py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => switchWorkspace(w.id)}
                    className="block text-left text-sm font-medium text-app transition-colors hover:text-tool-accent"
                  >
                    {w.name}
                  </button>
                  <div className="mt-0.5 text-xs text-muted">
                    {w.member_count} {w.member_count === 1 ? "member" : "members"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={PILL}
                    onClick={() => {
                      setInviteOpenFor(w.id);
                      setInviteIdentifier("");
                      setInviteRole("member");
                    }}
                  >
                    Invite
                  </button>
                  <button
                    type="button"
                    className={PILL}
                    onClick={() => openMembers(w.id)}
                  >
                    Members ({w.member_count})
                  </button>
                  <button
                    type="button"
                    className={DANGER}
                    disabled={busy === w.id}
                    onClick={() => handleDelete(w.id, w.name)}
                  >
                    Delete
                  </button>
                </div>
                </div>
                {/* Storage section — base + add-on dropdown */}
                {(() => {
                  const s = storage[w.id];
                  const currentAddon = addonSel[w.id] ?? 0;
                  const draftAddon = addonDraft[w.id] ?? currentAddon;
                  const cap = s?.capBytes ?? 0;
                  const used = s?.usedBytes ?? 0;
                  const pct =
                    cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
                  const baseLabel =
                    tierBaseMb !== null ? formatStorageMb(tierBaseMb) : "Base";
                  const addonLabel = formatStorageGb(currentAddon);
                  const totalLabel = formatStorageBytes(cap);
                  const isDirty = draftAddon !== currentAddon;
                  return (
                    <div className="mt-3 rounded-lg border border-app bg-app p-3">
                      <div className="flex items-center justify-between text-xs text-secondary">
                        <span>
                          {formatStorageBytes(used)} of {totalLabel} used
                        </span>
                        <span className="text-muted tabular-nums">
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                        <div
                          className="h-full bg-tool-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-2 text-[0.7rem] text-muted">
                        {currentAddon > 0
                          ? `Base ${baseLabel} + Add-on ${addonLabel} = ${totalLabel}`
                          : `Base ${baseLabel} included with ${tierName}.`}
                      </div>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="flex-1 text-[0.6rem] uppercase tracking-[0.14em] text-muted">
                          Storage add-on
                          <select
                            value={draftAddon}
                            onChange={(e) =>
                              setAddonDraft((prev) => ({
                                ...prev,
                                [w.id]: Number(e.target.value),
                              }))
                            }
                            className="mt-1 w-full rounded-md border border-app bg-app-elevated px-2.5 py-1.5 text-xs font-medium text-app focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
                          >
                            {STORAGE_ADDON_OPTIONS.map((opt) => (
                              <option key={opt.gb} value={opt.gb}>
                                {opt.label} — {opt.price}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className={PRIMARY}
                          disabled={!isDirty || busy === `addon:${w.id}`}
                          onClick={() => handleSaveAddon(w.id)}
                          title="Payment integration ships next; this stores your selection."
                        >
                          {busy === `addon:${w.id}`
                            ? "Saving…"
                            : isDirty
                              ? draftAddon === 0
                                ? "Remove add-on"
                                : "Upgrade (mock — payment coming soon)"
                              : "Update"}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Workspaces I joined */}
      <div className="rounded-xl border border-app bg-app-elevated p-5">
        <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
          Joined workspaces
        </h3>
        {joinedRows.length === 0 ? (
          <p className="mt-3 text-sm text-secondary">
            No shared workspaces yet. When someone invites you, accept above
            and it&apos;ll appear here.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-app">
            {joinedRows.map((w) => (
              <li
                key={w.id}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => switchWorkspace(w.id)}
                    className="block text-left text-sm font-medium text-app transition-colors hover:text-tool-accent"
                  >
                    {w.name}
                  </button>
                  <div className="mt-0.5 text-xs text-muted">
                    Role: <span className="capitalize text-app">{w.role}</span>{" "}
                    · {w.member_count} {w.member_count === 1 ? "member" : "members"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {w.role === "admin" && (
                    <button
                      type="button"
                      className={PILL}
                      onClick={() => {
                        setInviteOpenFor(w.id);
                        setInviteIdentifier("");
                        setInviteRole("member");
                      }}
                    >
                      Invite
                    </button>
                  )}
                  {w.role === "admin" && (
                    <button type="button" className={PILL} onClick={() => openMembers(w.id)}>
                      Members
                    </button>
                  )}
                  <button
                    type="button"
                    className={DANGER}
                    disabled={busy === w.id}
                    onClick={() => handleLeave(w.id)}
                  >
                    Leave
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Local-only workspaces hint (those not yet synced because user
          signed in only after creating them locally). Shown only if the
          user has more local than DB workspaces. */}
      {localWs.length > rows.length && (
        <p className="text-xs text-muted">
          {localWs.length - rows.length} local workspace
          {localWs.length - rows.length === 1 ? "" : "s"} aren&apos;t synced
          yet. They&apos;ll appear here automatically.
        </p>
      )}

      {/* ─────── Invite dialog (inline) ─────── */}
      {inviteOpenFor && (
        <div className="rounded-xl border border-app bg-app-elevated p-5">
          <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
            Invite to&nbsp;
            <span className="text-app">
              {rows.find((r) => r.id === inviteOpenFor)?.name}
            </span>
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <input
              type="text"
              value={inviteIdentifier}
              onChange={(e) => setInviteIdentifier(e.target.value)}
              placeholder="email@domain.com  or  username"
              className="rounded-lg border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
              autoCapitalize="none"
              autoCorrect="off"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="rounded-lg border border-app bg-app px-3 py-2 text-sm text-app focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <p className="mt-2 text-xs text-muted">
            <strong className="text-secondary">Member</strong> can use installed
            tools.{" "}
            <strong className="text-secondary">Admin</strong> can also invite
            others and install new apps.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSendInvite(inviteOpenFor)}
              disabled={inviteSending || !inviteIdentifier.trim()}
              className={PRIMARY}
            >
              {inviteSending ? "Sending…" : "Send invite"}
            </button>
            <button
              type="button"
              onClick={() => setInviteOpenFor(null)}
              className={PILL}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ─────── Members dialog (inline) ─────── */}
      {membersOpenFor && (
        <div className="rounded-xl border border-app bg-app-elevated p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              Members of&nbsp;
              <span className="text-app">
                {rows.find((r) => r.id === membersOpenFor)?.name}
              </span>
            </h3>
            <button
              type="button"
              onClick={() => setMembersOpenFor(null)}
              className="text-[0.62rem] uppercase tracking-[0.14em] text-muted transition-colors hover:text-app"
            >
              Close
            </button>
          </div>

          {membersLoading ? (
            <div className="mt-3 h-20 animate-pulse rounded-lg bg-surface" />
          ) : (
            <ul className="mt-3 divide-y divide-app">
              {members.map((m) => {
                const myWs = rows.find((r) => r.id === membersOpenFor);
                const myRole = myWs?.role;
                const canManage =
                  myRole === "owner" ||
                  (myRole === "admin" && m.role === "member");
                const isMe = m.user_id === user.id;
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
                        {m.full_name || m.username || m.user_id.slice(0, 8)}
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
                        {m.role !== "admin" && myRole === "owner" && (
                          <button
                            type="button"
                            className={PILL}
                            disabled={busy === `${membersOpenFor}:${m.user_id}`}
                            onClick={() =>
                              handleSetRole(membersOpenFor, m.user_id, "admin")
                            }
                          >
                            Make admin
                          </button>
                        )}
                        {m.role === "admin" && myRole === "owner" && (
                          <button
                            type="button"
                            className={PILL}
                            disabled={busy === `${membersOpenFor}:${m.user_id}`}
                            onClick={() =>
                              handleSetRole(membersOpenFor, m.user_id, "member")
                            }
                          >
                            Demote
                          </button>
                        )}
                        <button
                          type="button"
                          className={DANGER}
                          disabled={busy === `${membersOpenFor}:${m.user_id}`}
                          onClick={() =>
                            handleRemoveMember(membersOpenFor, m.user_id)
                          }
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
      )}
    </div>
  );
}
