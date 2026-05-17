"use client";

/* ShareDialog — modal opened from Files Manager's row Share button.
 *
 * Lets a member of the source workspace push a workspace_file_shares
 * row to another workspace they're already a member of. Also surfaces
 * any existing outgoing shares for the same file with a Revoke link.
 *
 * Wires:
 *   POST   /api/files/shares
 *   GET    /api/files/shares/outgoing?workspace_id=&file_id=
 *   DELETE /api/files/shares/:id
 *
 * Cache invalidation: every successful mutation calls
 *   invalidate({ prefix: '/api/files/shares' })
 * so the Launchpad's Shared sidebar location refreshes on next visit.
 *
 * Uses the same Tailwind v4 foundation tokens (bg-app, text-app, etc.)
 * the rest of Files Manager already uses for its modals.
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { invalidate } from "@/lib/cache/swr";

interface FileSummary {
  id: string;
  name: string;
}

interface WorkspaceLite {
  id: string;
  name: string;
}

interface OutgoingShare {
  id: string;
  target_workspace_id: string;
  target_workspace_name: string | null;
  shared_by_email: string | null;
  shared_by_name: string | null;
  permission: "view" | "edit";
  message: string | null;
  created_at: string;
}

interface OutgoingResponse {
  items?: OutgoingShare[];
}

interface PostResponse {
  share?: { id: string };
  error?: string;
}

interface Props {
  file: FileSummary | null;
  /** Source workspace — the one that owns the file. */
  sourceWorkspaceId: string;
  /** All workspaces the user belongs to (for the target dropdown).
   *  Filtered to exclude the source. */
  candidateWorkspaces: WorkspaceLite[];
  onClose: () => void;
}

const MESSAGE_MAX = 200;

export default function ShareDialog({
  file,
  sourceWorkspaceId,
  candidateWorkspaces,
  onClose,
}: Props) {
  // Default the dropdown to the first candidate workspace once we have
  // them — avoids forcing the user to pick when there's only one.
  const defaultTargetId = useMemo(
    () => candidateWorkspaces[0]?.id ?? "",
    [candidateWorkspaces]
  );
  const [targetId, setTargetId] = useState<string>(defaultTargetId);
  const [permission, setPermission] = useState<"view" | "edit">("view");
  const [message, setMessage] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<OutgoingShare[] | null>(
    file ? null : []
  );
  const [reloadTick, setReloadTick] = useState(0);

  // Load existing outgoing shares for this file.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    void (async () => {
      try {
        const url =
          "/api/files/shares/outgoing?" +
          new URLSearchParams({
            workspace_id: sourceWorkspaceId,
            file_id: file.id,
          }).toString();
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) {
          if (!cancelled) setExisting([]);
          return;
        }
        const j = (await r.json()) as OutgoingResponse;
        if (!cancelled) setExisting(j.items ?? []);
      } catch {
        if (!cancelled) setExisting([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, sourceWorkspaceId, reloadTick]);

  if (!file) return null;

  const noCandidates = candidateWorkspaces.length === 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId) {
      setError("Pick a workspace.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/files/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: file.id,
          source_workspace_id: sourceWorkspaceId,
          target_workspace_id: targetId,
          permission,
          message: message.trim() || null,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as PostResponse;
      if (!r.ok || !j.share) {
        setError(j.error ?? "Couldn’t share — try again.");
        setSubmitting(false);
        return;
      }
      invalidate({ prefix: "/api/files/shares" });
      setMessage("");
      setReloadTick((n) => n + 1);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const onRevoke = async (shareId: string) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Revoke this share? Recipients will lose access.")
    ) {
      return;
    }
    try {
      await fetch(`/api/files/shares/${encodeURIComponent(shareId)}`, {
        method: "DELETE",
      });
    } catch {
      /* swallow — best-effort */
    }
    invalidate({ prefix: "/api/files/shares" });
    setReloadTick((n) => n + 1);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.form
        onSubmit={onSubmit}
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className="sf-glass-window w-full max-w-md rounded-2xl p-5"
      >
        <h3 className="text-base font-bold text-app">
          Share &lsquo;{file.name}&rsquo; with another workspace
        </h3>
        <p className="mt-1 text-xs text-secondary">
          The file stays in this workspace. The other workspace&apos;s members
          will see it in their Launchpad&apos;s Shared section.
        </p>

        {noCandidates ? (
          <div className="mt-4 rounded-lg border border-app bg-app p-3 text-xs text-secondary">
            You aren&apos;t a member of any other workspace yet. Create or join
            one first, then come back here.
          </div>
        ) : (
          <>
            {/* Workspace picker */}
            <label className="mt-4 block">
              <span className="text-[0.62rem] uppercase tracking-[0.18em] text-muted">
                Workspace
              </span>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
              >
                {candidateWorkspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>

            {/* Permission radios */}
            <fieldset className="mt-4">
              <legend className="text-[0.62rem] uppercase tracking-[0.18em] text-muted">
                Permission
              </legend>
              <div className="mt-2 flex flex-col gap-2">
                <label className="flex items-start gap-2 text-sm text-app">
                  <input
                    type="radio"
                    name="share-permission"
                    value="view"
                    checked={permission === "view"}
                    onChange={() => setPermission("view")}
                    className="mt-0.5 accent-tool-accent"
                  />
                  <span className="flex flex-col">
                    <span>View only</span>
                    <span className="text-[11px] text-muted">
                      Members can open and download the file.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-app">
                  <input
                    type="radio"
                    name="share-permission"
                    value="edit"
                    checked={permission === "edit"}
                    onChange={() => setPermission("edit")}
                    className="mt-0.5 accent-tool-accent"
                  />
                  <span className="flex flex-col">
                    <span>Can edit</span>
                    <span className="text-[11px] text-muted">
                      Stored for now; edit access will roll out in a later
                      sprint.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            {/* Optional message */}
            <label className="mt-4 block">
              <span className="text-[0.62rem] uppercase tracking-[0.18em] text-muted">
                Message <span className="text-faint">(optional)</span>
              </span>
              <textarea
                value={message}
                onChange={(e) =>
                  setMessage(e.target.value.slice(0, MESSAGE_MAX))
                }
                rows={2}
                placeholder="Quick note for the other workspace…"
                className="mt-1 block w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
              />
              <span className="mt-1 block text-[10px] text-muted">
                {message.length} / {MESSAGE_MAX}
              </span>
            </label>

            {error && (
              <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-500">
                {error}
              </div>
            )}
          </>
        )}

        {/* Existing shares */}
        {existing && existing.length > 0 && (
          <div className="mt-5 border-t border-app pt-4">
            <div className="text-[0.62rem] uppercase tracking-[0.18em] text-muted">
              Already shared
            </div>
            <ul className="mt-2 flex flex-col gap-2">
              {existing.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-app bg-app p-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-app">
                      {s.target_workspace_name ?? "(unknown workspace)"}
                    </div>
                    <div className="truncate text-[11px] text-muted">
                      {s.shared_by_name ??
                        s.shared_by_email ??
                        "Someone"}{" "}
                      · {s.permission} ·{" "}
                      {new Date(s.created_at).toLocaleDateString()}
                    </div>
                    {s.message && (
                      <div className="mt-0.5 truncate text-[11px] text-secondary">
                        &ldquo;{s.message}&rdquo;
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void onRevoke(s.id)}
                    className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-rose-500 hover:bg-rose-500/10"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-app px-3 py-1.5 text-xs font-semibold text-secondary hover:text-app"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || noCandidates || !targetId}
            className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Sharing…" : "Share"}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}
