"use client";

/* LaunchpadRenameDialog — small popover-style modal that takes a new
 * name for a file and posts it to /api/files/rename. After success we
 * invalidate the file-list prefix so any visible Launchpad pane
 * re-fetches with the new label.
 */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { invalidate } from "@/lib/cache/swr";

interface FileSummary {
  id: string;
  name: string;
}

interface Props {
  file: FileSummary | null;
  onClose: () => void;
  onRenamed?: (newName: string) => void;
}

export default function LaunchpadRenameDialog({
  file,
  onClose,
  onRenamed,
}: Props) {
  const [name, setName] = useState(file?.name ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setName(file?.name ?? "");
    setError(null);
  }, [file?.id, file?.name]);

  useEffect(() => {
    if (file) {
      const t = setTimeout(() => {
        inputRef.current?.focus();
        // Select the basename portion (before the last dot) so the
        // extension stays put while the user types over the leaf.
        const value = inputRef.current?.value ?? "";
        const dot = value.lastIndexOf(".");
        if (dot > 0) inputRef.current?.setSelectionRange(0, dot);
        else inputRef.current?.select();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [file]);

  if (!file) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed === file.name) {
      onClose();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/files/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id, name: trimmed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn’t rename the file.");
        return;
      }
      invalidate({ prefix: "/api/files/list" });
      onRenamed?.(trimmed);
      onClose();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
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
        className="w-full max-w-sm rounded-2xl border border-app bg-app-elevated/90 p-5 shadow-2xl backdrop-blur-xl"
      >
        <h3 className="text-base font-bold text-app">Rename</h3>
        <p className="mt-1 truncate text-xs text-muted">{file.name}</p>

        <label className="mt-4 block">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
            New name
          </span>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            maxLength={255}
            className="mt-1 block w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
          />
        </label>

        {error && (
          <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-500">
            {error}
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
            disabled={submitting || !name.trim()}
            className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Renaming…" : "Rename"}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}
