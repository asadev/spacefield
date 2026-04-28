"use client";

/* LaunchpadUploadToast — bottom-right per-file progress toast for the
 * Launchpad's upload flow. Mirrors the UI Files Manager has — list of
 * job rows with name, progress bar, cancel/dismiss action — but pinned
 * to the corner of the Launchpad window so it never blocks the file
 * pane.
 *
 * The job state itself is owned by `useFileUploads`; this component is
 * pure render + a couple of callbacks the parent supplies.
 */

import { motion, AnimatePresence } from "framer-motion";
import type { UploadJob } from "./useFileUploads";

interface Props {
  jobs: UploadJob[];
  onCancel: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
  onClearDone?: () => void;
}

function fmtBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export default function LaunchpadUploadToast({
  jobs,
  onCancel,
  onDismiss,
  onClearDone,
}: Props) {
  if (jobs.length === 0) return null;

  const inFlight = jobs.filter(
    (j) =>
      j.status === "queued" ||
      j.status === "uploading" ||
      j.status === "finalizing"
  );
  const done = jobs.filter((j) => j.status === "done");
  const errored = jobs.filter(
    (j) =>
      j.status === "error" || j.status === "skipped" || j.status === "cancelled"
  );

  return (
    <AnimatePresence>
      <motion.div
        key="launchpad-upload-toast"
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 16, opacity: 0 }}
        // Sits inside the Launchpad window (positioned absolute), above
        // the status bar.
        className="absolute bottom-10 right-4 z-[80] w-72 overflow-hidden rounded-xl border border-app/50 bg-app-elevated/85 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center justify-between border-b border-app/40 px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted">
          <span>
            {inFlight.length > 0
              ? `Uploading ${inFlight.length}…`
              : `${done.length} uploaded${
                  errored.length > 0 ? ` · ${errored.length} issue${errored.length === 1 ? "" : "s"}` : ""
                }`}
          </span>
          {inFlight.length === 0 && onClearDone && (
            <button
              type="button"
              onClick={onClearDone}
              className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-secondary hover:text-app"
            >
              Clear
            </button>
          )}
        </div>
        <ul className="max-h-72 overflow-y-auto">
          {jobs.map((j) => (
            <li
              key={j.id}
              className="flex flex-col gap-1 border-b border-app/30 px-3 py-2 last:border-b-0"
            >
              <div className="flex items-center gap-2 text-[12px]">
                <span className="truncate flex-1 text-app" title={j.name}>
                  {j.name}
                </span>
                <span className="shrink-0 text-[10px] text-muted">
                  {fmtBytes(j.size)}
                </span>
              </div>
              {(j.status === "uploading" || j.status === "finalizing") && (
                <div className="relative h-1 overflow-hidden rounded-full bg-app">
                  <div
                    className="absolute inset-y-0 left-0 bg-tool-accent transition-[width]"
                    style={{ width: `${j.progress}%` }}
                  />
                </div>
              )}
              <div className="flex items-center justify-between text-[10px] text-muted">
                <span>{statusLabel(j)}</span>
                <span className="flex items-center gap-1">
                  {(j.status === "uploading" ||
                    j.status === "finalizing" ||
                    j.status === "queued") && (
                    <button
                      type="button"
                      onClick={() => onCancel(j.id)}
                      className="rounded border border-app/60 px-1.5 py-0.5 text-[10px] text-secondary hover:bg-surface hover:text-app"
                    >
                      Cancel
                    </button>
                  )}
                  {(j.status === "error" ||
                    j.status === "skipped" ||
                    j.status === "cancelled" ||
                    j.status === "done") && (
                    <button
                      type="button"
                      onClick={() => onDismiss(j.id)}
                      className="rounded border border-app/60 px-1.5 py-0.5 text-[10px] text-secondary hover:bg-surface hover:text-app"
                    >
                      Dismiss
                    </button>
                  )}
                </span>
              </div>
              {j.error && (
                <div className="text-[10px] text-rose-500">{j.error}</div>
              )}
            </li>
          ))}
        </ul>
      </motion.div>
    </AnimatePresence>
  );
}

function statusLabel(j: UploadJob): string {
  switch (j.status) {
    case "queued":
      return "Queued…";
    case "uploading":
      return `Uploading… ${j.progress}%`;
    case "finalizing":
      return "Finalizing…";
    case "done":
      return "Uploaded";
    case "error":
      return "Error";
    case "skipped":
      return "Skipped";
    case "cancelled":
      return "Cancelled";
  }
}
