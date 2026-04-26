"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWorkspaces } from "./useWorkspaces";

/* Modal dialog for creating a new workspace.
 *
 * The user types a name (defaults to "New Workspace" if blank) and confirms.
 * On create, the new workspace becomes active immediately — Desktop is
 * keyed on activeId so it remounts and every hook reads from the new
 * empty namespace. The user lands on a fresh workspace.
 *
 * Tier gating: every open hits /api/me to fetch the user's tier and
 * owned-workspace count. If they're at the cap (free tier = 1 owned
 * workspace), the form is replaced by an "upgrade or delete" message
 * with a link to /pricing. Without this, the user can keep creating
 * workspaces locally that the DB then refuses to materialize, which
 * cascades into "0 B of 0 B" + "not a member" in Files Manager.
 *
 * Portaled so it always sits above whatever window/modal is active. */

interface MeResponse {
  tier: string;
  tier_config: { name?: string } | null;
  owned_workspaces: number;
  max_owned_workspaces: number;
  can_create_workspace: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateWorkspaceDialog({ open, onClose }: Props) {
  const { createWorkspace, workspaces } = useWorkspaces();
  const [name, setName] = useState("");
  const [mounted, setMounted] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [meError, setMeError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch tier + counts each time the dialog opens. We don't cache —
  // the user might have just deleted a workspace, so freshness matters.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMeLoading(true);
    setMeError(null);
    setMe(null);
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) {
          // Not signed in — fall back to letting them create locally.
          // (Free tier client-only mode doesn't enforce caps.)
          setMe({
            tier: "free",
            tier_config: { name: "Free" },
            owned_workspaces: 0,
            max_owned_workspaces: 1,
            can_create_workspace: true,
          });
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setMeError(body?.error ?? `Failed to load (${res.status})`);
          return;
        }
        const data = (await res.json()) as MeResponse;
        if (!cancelled) setMe(data);
      } catch {
        if (!cancelled) setMeError("network error");
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset + autofocus on every open
  useEffect(() => {
    if (!open) return;
    setName("");
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 80);
    return () => window.clearTimeout(t);
  }, [open, workspaces.length]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Local count is the source of truth for the cap check, NOT
  // me.owned_workspaces. The server count lags — it only updates after
  // /api/workspaces/ensure runs, which doesn't happen until Files
  // Manager opens. Without this, a fast double-click creates two
  // workspaces locally, only the first of which actually materializes
  // in the cloud (the second hits the workspace_owner_quota trigger
  // and silently fails to ensure).
  const cap = me?.max_owned_workspaces ?? 1;
  const owned = Math.max(workspaces.length, me?.owned_workspaces ?? 0);
  const canCreate = me !== null && owned < cap;
  const atCap = me !== null && owned >= cap;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    const trimmed = name.trim() || `Workspace ${workspaces.length + 1}`;
    createWorkspace(trimmed);
    onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[80]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-workspace-title"
        >
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="relative flex h-full w-full items-center justify-center p-4">
            <motion.form
              initial={{ scale: 0.96, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 8 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              onSubmit={submit}
              className="w-full max-w-md rounded-2xl border border-app bg-app-elevated p-6 shadow-2xl"
            >
              <h2
                id="create-workspace-title"
                className="text-lg font-semibold text-app"
              >
                New Workspace
              </h2>
              <p className="mt-1 text-sm text-secondary">
                Workspaces let you split contexts — one for real estate,
                another for marketing, another for personal. Each has its
                own dock, widgets, wallpaper, and open windows.
              </p>

              {meError && (
                <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                  Couldn&apos;t check your plan: {meError}
                </p>
              )}

              {atCap && me && (
                <div className="mt-5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-3 text-sm">
                  <div className="font-medium text-amber-300">
                    You&apos;ve reached your workspace limit
                  </div>
                  <div className="mt-1 text-xs text-amber-200/80">
                    Your{" "}
                    <span className="font-medium">
                      {me.tier_config?.name ?? me.tier}
                    </span>{" "}
                    plan includes {cap}{" "}
                    {cap === 1 ? "workspace" : "workspaces"}, and you already
                    have {owned}. Delete one, or upgrade to add more.
                  </div>
                  <div className="mt-3 flex gap-2">
                    <a
                      href="/pricing"
                      className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                    >
                      View plans
                    </a>
                  </div>
                </div>
              )}

              {!atCap && (
                <label className="mt-5 block">
                  <span className="text-[0.72rem] uppercase tracking-[0.14em] text-muted">
                    Name
                    {me && (
                      <span className="ml-2 normal-case tracking-normal text-faint">
                        ({owned}/{cap} on {me.tier_config?.name ?? me.tier})
                      </span>
                    )}
                  </span>
                  <input
                    ref={inputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={`Workspace ${workspaces.length + 1}`}
                    maxLength={48}
                    disabled={meLoading}
                    className="mt-1 block w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft disabled:opacity-50"
                  />
                </label>
              )}

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-app bg-app px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-surface hover:text-app"
                >
                  {atCap ? "Close" : "Cancel"}
                </button>
                {!atCap && (
                  <button
                    type="submit"
                    disabled={!canCreate || meLoading}
                    className="rounded-lg bg-tool-accent px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {meLoading ? "Checking…" : "Create"}
                  </button>
                )}
              </div>
            </motion.form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
