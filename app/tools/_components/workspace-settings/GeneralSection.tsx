"use client";

/* GeneralSection — name, description, avatar URL, created date.
 *
 * Owners can edit name / description / avatar via /api/workspaces/update.
 * Admins + members see the read-only view. The form is dirty-aware:
 * Save is disabled until at least one field changes.
 */

import { useEffect, useState } from "react";
import {
  INPUT,
  PILL,
  PRIMARY,
  type WorkspaceFullRow,
  type WorkspaceRole,
} from "./types";

interface Props {
  workspaceId: string;
  role: WorkspaceRole;
  full: WorkspaceFullRow | null;
  memberCount: number;
  onSaved: (next: Partial<WorkspaceFullRow>) => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export default function GeneralSection({
  workspaceId,
  role,
  full,
  memberCount,
  onSaved,
  onError,
  onSuccess,
}: Props) {
  const [name, setName] = useState(full?.name ?? "");
  const [description, setDescription] = useState(full?.description ?? "");
  const [avatarUrl, setAvatarUrl] = useState(full?.avatar_url ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(full?.name ?? "");
    setDescription(full?.description ?? "");
    setAvatarUrl(full?.avatar_url ?? "");
  }, [full?.id, full?.name, full?.description, full?.avatar_url]);

  const canEdit = role === "owner";

  const trimmedName = name.trim();
  const trimmedDesc = description.trim();
  const trimmedUrl = avatarUrl.trim();

  const dirty =
    canEdit &&
    (trimmedName !== (full?.name ?? "") ||
      trimmedDesc !== (full?.description ?? "") ||
      trimmedUrl !== (full?.avatar_url ?? ""));

  const save = async () => {
    if (!dirty) return;
    if (!trimmedName) {
      onError("Name cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      const patch: Record<string, string | null> = {};
      if (trimmedName !== (full?.name ?? "")) patch.name = trimmedName;
      if (trimmedDesc !== (full?.description ?? ""))
        patch.description = trimmedDesc || null;
      if (trimmedUrl !== (full?.avatar_url ?? ""))
        patch.avatar_url = trimmedUrl || null;
      const res = await fetch("/api/workspaces/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, ...patch }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || `Update failed (${res.status})`);
      }
      onSaved(patch);
      onSuccess("Workspace details updated.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-tool-accent text-2xl font-semibold text-white">
          {trimmedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={trimmedUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            (trimmedName || "?").slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-app">
            {trimmedName || "Untitled workspace"}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {memberCount} {memberCount === 1 ? "member" : "members"} ·{" "}
            Created {full?.created_at
              ? new Date(full.created_at).toLocaleDateString()
              : "—"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <label className="block">
          <span className="mb-1 block text-[0.62rem] uppercase tracking-[0.14em] text-muted">
            Name
          </span>
          <input
            type="text"
            value={name}
            disabled={!canEdit}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workspace name"
            className={`${INPUT} w-full disabled:opacity-60`}
            maxLength={80}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[0.62rem] uppercase tracking-[0.14em] text-muted">
            Description
          </span>
          <textarea
            value={description}
            disabled={!canEdit}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this workspace for?"
            rows={3}
            maxLength={500}
            className={`${INPUT} w-full disabled:opacity-60`}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[0.62rem] uppercase tracking-[0.14em] text-muted">
            Avatar URL
          </span>
          <input
            type="url"
            value={avatarUrl}
            disabled={!canEdit}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://example.com/logo.png"
            className={`${INPUT} w-full disabled:opacity-60`}
          />
          <span className="mt-1 block text-[0.7rem] text-muted">
            Paste a public URL. Leave blank to fall back to the initial
            of the workspace name.
          </span>
        </label>
      </div>

      {canEdit && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={PRIMARY}
            disabled={!dirty || saving}
            onClick={save}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            className={PILL}
            disabled={!dirty || saving}
            onClick={() => {
              setName(full?.name ?? "");
              setDescription(full?.description ?? "");
              setAvatarUrl(full?.avatar_url ?? "");
            }}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
