"use client";

/* DangerSection — owner-only.
 *
 *   - Transfer ownership (search workspace members).
 *   - Archive / unarchive (preserves data, hides from active list).
 *   - Delete (cascade — irreversible).
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../useAuth";
import {
  DANGER,
  PILL,
  PRIMARY,
  type WorkspaceFullRow,
  type WorkspaceRole,
} from "./types";

interface MemberRow {
  user_id: string;
  role: WorkspaceRole;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface Props {
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
  archivedAt: string | null;
  onWorkspaceChanged: (next: Partial<WorkspaceFullRow>) => void;
  onWorkspaceDeleted: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export default function DangerSection({
  workspaceId,
  workspaceName,
  role,
  archivedAt,
  onWorkspaceChanged,
  onWorkspaceDeleted,
  onError,
  onSuccess,
}: Props) {
  const { user, supabase } = useAuth();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [search, setSearch] = useState("");
  const [pickedTarget, setPickedTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refreshMembers = useCallback(async () => {
    const { data: mems } = await supabase
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", workspaceId);
    const userIds = ((mems as Array<{ user_id: string }>) ?? [])
      .map((m) => m.user_id)
      .filter((id) => id !== user?.id);
    if (userIds.length === 0) {
      setMembers([]);
      return;
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, full_name, username, avatar_url")
      .in("user_id", userIds);
    const profMap = new Map(
      ((profs ?? []) as Array<{
        user_id: string;
        full_name: string | null;
        username: string | null;
        avatar_url: string | null;
      }>).map((p) => [p.user_id, p])
    );
    setMembers(
      ((mems as Array<{ user_id: string; role: WorkspaceRole }>) ?? [])
        .filter((m) => m.user_id !== user?.id)
        .map((m) => {
          const p = profMap.get(m.user_id);
          return {
            user_id: m.user_id,
            role: m.role,
            full_name: p?.full_name ?? null,
            username: p?.username ?? null,
            avatar_url: p?.avatar_url ?? null,
          };
        })
    );
  }, [supabase, workspaceId, user?.id]);

  useEffect(() => {
    if (role === "owner") void refreshMembers();
  }, [role, refreshMembers]);

  if (role !== "owner") {
    return (
      <div className="rounded-xl border border-app bg-app p-4 text-sm text-secondary">
        Only the workspace owner can perform danger-zone actions.
      </div>
    );
  }

  const filtered = search.trim()
    ? members.filter((m) => {
        const hay = (m.full_name ?? m.username ?? m.user_id).toLowerCase();
        return hay.includes(search.trim().toLowerCase());
      })
    : members;

  const transfer = async () => {
    if (!pickedTarget) return;
    const target = members.find((m) => m.user_id === pickedTarget);
    const targetName =
      target?.full_name || target?.username || pickedTarget.slice(0, 8);
    if (
      !confirm(
        `Transfer ownership of "${workspaceName}" to ${targetName}? You will be demoted to admin.`
      )
    )
      return;
    setBusy("transfer");
    try {
      const res = await fetch("/api/workspaces/transfer-ownership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          newOwnerUserId: pickedTarget,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error || `Transfer failed (${res.status})`);
      }
      onSuccess(`Ownership transferred to ${targetName}.`);
      onWorkspaceChanged({});
      setPickedTarget(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setBusy(null);
    }
  };

  const archive = async (next: boolean) => {
    if (
      next &&
      !confirm(
        `Archive "${workspaceName}"? It will be hidden from your active list. Data is preserved and you can restore it.`
      )
    ) {
      return;
    }
    setBusy("archive");
    try {
      const res = await fetch("/api/workspaces/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, archived: next }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error || `Archive failed (${res.status})`);
      }
      onSuccess(next ? "Workspace archived." : "Workspace restored.");
      onWorkspaceChanged({
        archived_at: next ? new Date().toISOString() : null,
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (
      !confirm(
        `Delete workspace "${workspaceName}"? This deletes all its state and removes everyone. Cannot be undone.`
      )
    )
      return;
    setBusy("delete");
    try {
      const { error } = await supabase
        .from("workspaces")
        .delete()
        .eq("id", workspaceId);
      if (error) throw error;
      onSuccess("Workspace deleted.");
      onWorkspaceDeleted();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Transfer ownership */}
      <div className="rounded-xl border border-app bg-app p-4">
        <div className="text-sm font-medium text-app">Transfer ownership</div>
        <div className="mt-0.5 text-xs text-muted">
          Pick a member to become the new owner. You will be demoted to admin.
        </div>
        {members.length === 0 ? (
          <div className="mt-3 text-xs text-muted">
            Invite teammates first — there is no one to transfer to.
          </div>
        ) : (
          <>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members"
              className="mt-3 w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
            />
            <ul className="mt-3 max-h-48 divide-y divide-app overflow-y-auto rounded-lg border border-app">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted">No matches.</li>
              ) : (
                filtered.map((m) => {
                  const name =
                    m.full_name || m.username || m.user_id.slice(0, 8);
                  const picked = pickedTarget === m.user_id;
                  return (
                    <li key={m.user_id}>
                      <button
                        type="button"
                        onClick={() => setPickedTarget(m.user_id)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                          picked
                            ? "bg-tool-accent-soft text-app"
                            : "text-secondary hover:bg-surface"
                        }`}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tool-accent text-[0.7rem] font-semibold text-white">
                          {m.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.avatar_url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            name.slice(0, 1).toUpperCase()
                          )}
                        </div>
                        <span className="min-w-0 flex-1 truncate">{name}</span>
                        <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-muted">
                          {m.role}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className={PRIMARY}
                disabled={!pickedTarget || busy === "transfer"}
                onClick={transfer}
              >
                {busy === "transfer" ? "Transferring…" : "Transfer"}
              </button>
              {pickedTarget && (
                <button
                  type="button"
                  className={PILL}
                  onClick={() => setPickedTarget(null)}
                >
                  Clear
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Archive */}
      <div className="rounded-xl border border-app bg-app p-4">
        <div className="text-sm font-medium text-app">
          {archivedAt ? "Restore from archive" : "Archive workspace"}
        </div>
        <div className="mt-0.5 text-xs text-muted">
          {archivedAt
            ? "Bring this workspace back to your active list."
            : "Hide this workspace from your active list. Data is kept."}
        </div>
        <div className="mt-3">
          <button
            type="button"
            className={archivedAt ? PRIMARY : PILL}
            disabled={busy === "archive"}
            onClick={() => archive(!archivedAt)}
          >
            {busy === "archive"
              ? "Working…"
              : archivedAt
                ? "Restore workspace"
                : "Archive workspace"}
          </button>
        </div>
      </div>

      {/* Delete */}
      <div className="rounded-xl border border-rose-400/30 bg-rose-400/5 p-4">
        <div className="text-sm font-medium text-rose-400">
          Delete workspace
        </div>
        <div className="mt-0.5 text-xs text-secondary">
          Removes everyone and all state. Cannot be undone.
        </div>
        <div className="mt-3">
          <button
            type="button"
            className={DANGER}
            disabled={busy === "delete"}
            onClick={remove}
          >
            {busy === "delete" ? "Deleting…" : "Delete this workspace"}
          </button>
        </div>
      </div>
    </div>
  );
}
