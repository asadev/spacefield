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
 * Portaled so it always sits above whatever window/modal is active. */

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateWorkspaceDialog({ open, onClose }: Props) {
  const { createWorkspace, workspaces } = useWorkspaces();
  const [name, setName] = useState("");
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset + autofocus on every open
  useEffect(() => {
    if (!open) return;
    const fallback = `Workspace ${workspaces.length + 1}`;
    setName("");
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 80);
    void fallback;
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
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

              <label className="mt-5 block">
                <span className="text-[0.72rem] uppercase tracking-[0.14em] text-muted">
                  Name
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`Workspace ${workspaces.length + 1}`}
                  maxLength={48}
                  className="mt-1 block w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
                />
              </label>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-app bg-app px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-surface hover:text-app"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-tool-accent px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Create
                </button>
              </div>
            </motion.form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
