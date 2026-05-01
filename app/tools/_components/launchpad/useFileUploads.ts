"use client";

/* useFileUploads — extracted upload pipeline shared by the Files Manager
 * and the Launchpad. Mirrors the original Files Manager protocol exactly
 * so we don't break that surface during the transition:
 *
 *   1) POST /api/files/upload     reserve fileId + presigned R2 URL
 *   2) PUT  <presigned>           direct R2 upload via XHR (progress + abort)
 *   3) POST /api/files/finalize   write the workspace_files row
 *
 * Each call site supplies its own active workspace id and a callback for
 * the optimistic "row inserted" event. The hook owns the per-file `jobs`
 * state plus cancel + remove helpers, and busts the cached file list so
 * any consumer (Launchpad / Files Manager) re-renders with the new row.
 */

import { useCallback, useState } from "react";
import { invalidate } from "@/lib/cache/swr";

export type UploadJobStatus =
  | "queued"
  | "uploading"
  | "finalizing"
  | "done"
  | "error"
  | "cancelled"
  | "skipped";

export interface UploadJob {
  id: string;
  fileId: string | null;
  name: string;
  size: number;
  contentType: string;
  progress: number;
  status: UploadJobStatus;
  error?: string;
  controller?: AbortController;
}

export interface UploadedFile {
  id: string;
  name: string;
  size_bytes: number;
  content_type: string | null;
  created_at: string;
  user_id: string;
  deleted_at?: string | null;
  tags?: Array<{ name: string; color: string }>;
}

interface UseFileUploadsOpts {
  /** Active workspace id. Uploads are no-ops while this is null. */
  workspaceId: string | null;
  /** Block uploads until the workspace is materialized server-side. */
  ensured: boolean;
  /** Cap in bytes from the workspace_storage RPC. 0 = unknown / no cap. */
  cap: number;
  /** Bytes already used. Used for client-side pre-flight against `cap`. */
  used: number;
  /** Called optimistically when finalize succeeds — Files Manager uses
   * this to prepend the row, Launchpad uses it to bust caches. */
  onUploaded?: (file: UploadedFile) => void;
  /** Fires when the server returns `storage_quota_exceeded`. */
  onQuotaExceeded?: () => void;
  /** Fires after each successful upload — caller can refresh cap/used. */
  onAfterUploadDelta?: (sizeBytesAdded: number) => void;
  /** Cache prefix to invalidate after each finalize. */
  invalidatePrefix?: string;
}

interface UseFileUploadsReturn {
  jobs: UploadJob[];
  startUploads: (incoming: File[]) => Promise<void>;
  cancelJob: (jobId: string) => void;
  removeJob: (jobId: string) => void;
  clearDone: () => void;
}

interface ReserveResponse {
  url: string;
  key: string;
  fileId: string;
}

interface FinalizeResponse {
  file: UploadedFile;
}

interface ErrorResponse {
  error?: string;
}

const DONE_AUTOREMOVE_MS = 1500;

export function useFileUploads(opts: UseFileUploadsOpts): UseFileUploadsReturn {
  const {
    workspaceId,
    ensured,
    cap,
    used,
    onUploaded,
    onQuotaExceeded,
    onAfterUploadDelta,
    invalidatePrefix,
  } = opts;

  const [jobs, setJobs] = useState<UploadJob[]>([]);

  const updateJob = useCallback(
    (jobId: string, patch: Partial<UploadJob>) => {
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, ...patch } : j))
      );
    },
    []
  );

  const removeJob = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  const cancelJob = useCallback((jobId: string) => {
    setJobs((prev) => {
      const j = prev.find((x) => x.id === jobId);
      j?.controller?.abort();
      return prev;
    });
  }, []);

  const clearDone = useCallback(() => {
    setJobs((prev) =>
      prev.filter(
        (j) =>
          j.status !== "done" &&
          j.status !== "cancelled" &&
          j.status !== "skipped"
      )
    );
  }, []);

  const startUploads = useCallback(
    async (incoming: File[]) => {
      if (!workspaceId) return;
      if (!ensured) return;
      if (incoming.length === 0) return;

      // Pre-flight: project remaining cap against in-flight + new sizes.
      let projected = used;
      for (const j of jobs) {
        if (
          j.status === "uploading" ||
          j.status === "queued" ||
          j.status === "finalizing"
        ) {
          projected += j.size;
        }
      }

      const newJobs: UploadJob[] = [];
      for (const f of incoming) {
        const id = crypto.randomUUID();
        if (cap > 0 && projected + f.size > cap) {
          newJobs.push({
            id,
            fileId: null,
            name: f.name,
            size: f.size,
            contentType: f.type || "application/octet-stream",
            progress: 0,
            status: "skipped",
            error: "Would exceed your storage quota",
          });
          continue;
        }
        projected += f.size;
        newJobs.push({
          id,
          fileId: null,
          name: f.name,
          size: f.size,
          contentType: f.type || "application/octet-stream",
          progress: 0,
          status: "queued",
        });
      }

      setJobs((prev) => [...newJobs, ...prev]);

      await Promise.all(
        newJobs.map(async (job, idx) => {
          if (job.status !== "queued") return;
          const file = incoming[idx];
          try {
            updateJob(job.id, { status: "uploading", progress: 0 });

            // 1) Reserve fileId + presigned URL
            const reserveRes = await fetch("/api/files/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workspaceId,
                name: job.name,
                contentType: job.contentType,
                sizeBytes: job.size,
              }),
            });
            if (!reserveRes.ok) {
              const errBody = (await reserveRes
                .json()
                .catch(() => ({}))) as ErrorResponse;
              if (errBody?.error === "storage_quota_exceeded") {
                onQuotaExceeded?.();
              }
              updateJob(job.id, {
                status: "error",
                error:
                  errBody?.error ??
                  `Upload reserve failed (${reserveRes.status})`,
              });
              return;
            }
            const { url, key, fileId } =
              (await reserveRes.json()) as ReserveResponse;
            updateJob(job.id, { fileId });

            // 2) PUT to R2 with XHR (progress + abort)
            const controller = new AbortController();
            updateJob(job.id, { controller });
            await new Promise<void>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open("PUT", url);
              xhr.setRequestHeader("Content-Type", job.contentType);
              xhr.upload.onprogress = (ev) => {
                if (ev.lengthComputable) {
                  const p = Math.round((ev.loaded / ev.total) * 100);
                  updateJob(job.id, { progress: p });
                }
              };
              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve();
                else reject(new Error(`PUT failed (${xhr.status})`));
              };
              xhr.onerror = () => reject(new Error("Network error"));
              xhr.onabort = () => reject(new Error("aborted"));
              controller.signal.addEventListener("abort", () => xhr.abort());
              xhr.send(file);
            });

            updateJob(job.id, { status: "finalizing", progress: 100 });

            // 3) Finalize → DB row
            const finRes = await fetch("/api/files/finalize", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workspaceId,
                fileId,
                key,
                name: job.name,
                contentType: job.contentType,
                sizeBytes: job.size,
              }),
            });
            if (!finRes.ok) {
              const errBody = (await finRes
                .json()
                .catch(() => ({}))) as ErrorResponse;
              updateJob(job.id, {
                status: "error",
                error:
                  errBody?.error ?? `Finalize failed (${finRes.status})`,
              });
              return;
            }
            const { file: row } = (await finRes.json()) as FinalizeResponse;

            onUploaded?.(row);
            onAfterUploadDelta?.(job.size);

            if (invalidatePrefix) {
              invalidate({ prefix: invalidatePrefix });
            }
            invalidate({ prefix: "/api/workspaces/storage-stats" });

            updateJob(job.id, { status: "done" });
            // Auto-dismiss successful job after a short window so the
            // toast cleanly empties out.
            setTimeout(() => removeJob(job.id), DONE_AUTOREMOVE_MS);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            if (msg === "aborted") {
              updateJob(job.id, { status: "cancelled", error: "Cancelled" });
            } else {
              updateJob(job.id, { status: "error", error: msg });
            }
          }
        })
      );
    },
    [
      workspaceId,
      ensured,
      used,
      cap,
      jobs,
      updateJob,
      removeJob,
      onUploaded,
      onQuotaExceeded,
      onAfterUploadDelta,
      invalidatePrefix,
    ]
  );

  return { jobs, startUploads, cancelJob, removeJob, clearDone };
}
