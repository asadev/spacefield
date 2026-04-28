"use client";

/* LaunchpadTagEditor — small modal for editing the tag chips on a file.
 * Mirrors the Files Manager TagEditorDialog but lives entirely in the
 * Launchpad so we can retire that tool without losing tag editing.
 *
 * Tags are persisted via POST /api/files/tag (the existing endpoint),
 * which validates name length, swatch, and the 12-tag cap server-side.
 * On success we invalidate the file-list prefix so any open Launchpad
 * pane re-fetches.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { invalidate } from "@/lib/cache/swr";

export type TagColor =
  | "rose"
  | "amber"
  | "emerald"
  | "sky"
  | "violet"
  | "slate";

export interface FileTag {
  name: string;
  color: TagColor;
}

const TAG_COLORS: TagColor[] = [
  "rose",
  "amber",
  "emerald",
  "sky",
  "violet",
  "slate",
];

const TAG_PILL_CLASS: Record<TagColor, string> = {
  rose: "bg-rose-500/15 text-rose-500 ring-rose-500/30",
  amber: "bg-amber-500/15 text-amber-500 ring-amber-500/30",
  emerald: "bg-emerald-500/15 text-emerald-500 ring-emerald-500/30",
  sky: "bg-sky-500/15 text-sky-500 ring-sky-500/30",
  violet: "bg-violet-500/15 text-violet-500 ring-violet-500/30",
  slate: "bg-app-elevated text-secondary ring-app",
};

const TAG_SWATCH_CLASS: Record<TagColor, string> = {
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  slate: "bg-slate-500",
};

interface FileSummary {
  id: string;
  name: string;
  tags?: FileTag[];
}

interface Props {
  file: FileSummary | null;
  onClose: () => void;
  /** Fired after the server confirms the new tag set. The parent uses
   * this to refresh / toast. */
  onSaved?: (tags: FileTag[]) => void;
}

export default function LaunchpadTagEditor({ file, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<FileTag[]>(file?.tags ?? []);
  const [name, setName] = useState("");
  const [color, setColor] = useState<TagColor>("sky");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!file) return null;

  const addTag = () => {
    const trimmed = name.trim().slice(0, 32);
    if (!trimmed) return;
    if (draft.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
      setName("");
      return;
    }
    if (draft.length >= 12) return;
    setDraft([...draft, { name: trimmed, color }]);
    setName("");
  };

  const removeTag = (n: string) => {
    setDraft(draft.filter((t) => t.name.toLowerCase() !== n.toLowerCase()));
  };

  const onSave = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/files/tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id, tags: draft }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn’t save tags. Try again.");
        return;
      }
      invalidate({ prefix: "/api/files/list" });
      onSaved?.(draft);
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
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className="w-full max-w-sm rounded-2xl border border-app bg-app-elevated/90 p-5 shadow-2xl backdrop-blur-xl"
      >
        <h3 className="text-base font-bold text-app">Tags</h3>
        <p className="mt-1 truncate text-xs text-muted">{file.name}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {draft.length === 0 && (
            <span className="text-xs text-secondary">No tags yet.</span>
          )}
          {draft.map((t) => (
            <span
              key={t.name}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${TAG_PILL_CLASS[t.color]}`}
            >
              {t.name}
              <button
                type="button"
                onClick={() => removeTag(t.name)}
                aria-label={`Remove ${t.name}`}
                className="opacity-70 hover:opacity-100"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  aria-hidden="true"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </span>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <label className="text-[10px] uppercase tracking-[0.18em] text-muted">
            Add tag
          </label>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              maxLength={32}
              placeholder="e.g. contracts"
              className="flex-1 rounded-lg border border-app bg-app px-3 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
            />
            <button
              type="button"
              onClick={addTag}
              disabled={!name.trim() || draft.length >= 12}
              className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </div>
          <div className="flex items-center gap-2">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                className={`h-5 w-5 rounded-full ${TAG_SWATCH_CLASS[c]} transition ring-offset-2 ring-offset-app-elevated ${
                  color === c ? "ring-2 ring-tool-accent" : "ring-1 ring-app"
                }`}
              />
            ))}
          </div>
        </div>

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
            type="button"
            onClick={() => void onSave()}
            disabled={submitting}
            className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
