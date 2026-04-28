/* Shared helpers for the Launchpad's Downloads / Documents / Shared file
 * panes. Centralizes the file shape, the kind classifier, and the
 * cachedFetch URL builder so each pane component stays small.
 *
 * The endpoint at /api/files/list is the source of truth. If it ever
 * 404s (or returns an error), every consumer treats that as "no files"
 * — Launchpad never surfaces network errors in its sidebar panes.
 */

import { cachedFetch } from "@/lib/cache/swr";

export interface LaunchpadFile {
  id: string;
  name: string;
  size_bytes: number;
  content_type: string | null;
  created_at: string;
}

export type LaunchpadFileKind =
  | "document"
  | "sheet"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "other";

export function fileKind(file: LaunchpadFile): LaunchpadFileKind {
  const ct = (file.content_type ?? "").toLowerCase();
  const name = file.name.toLowerCase();
  if (
    ct.startsWith("text/") ||
    ct.includes("markdown") ||
    ct.includes("msword") ||
    ct.includes("officedocument.wordprocessing") ||
    /\.(md|markdown|txt|doc|docx|rtf|odt)$/.test(name)
  ) {
    return "document";
  }
  if (
    ct.includes("spreadsheet") ||
    ct.includes("excel") ||
    ct === "text/csv" ||
    /\.(csv|tsv|xls|xlsx|ods|numbers)$/.test(name)
  ) {
    return "sheet";
  }
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  if (ct.startsWith("audio/")) return "audio";
  if (
    ct.includes("zip") ||
    ct.includes("tar") ||
    ct.includes("compressed") ||
    /\.(zip|tar|gz|7z|rar)$/.test(name)
  ) {
    return "archive";
  }
  return "other";
}

export function kindLabel(kind: LaunchpadFileKind): string {
  switch (kind) {
    case "document":
      return "Document";
    case "sheet":
      return "Spreadsheet";
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "audio":
      return "Audio";
    case "archive":
      return "Archive";
    default:
      return "File";
  }
}

/* Pick the best editor app for a given file kind. Falls back to
 * the Files Manager so every file row stays clickable. */
export function appForFile(file: LaunchpadFile): string {
  const k = fileKind(file);
  if (k === "document") return "documents";
  if (k === "sheet") return "sheets";
  return "files-manager";
}

export function fmtSize(bytes: number): string {
  if (bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(v >= 100 || u === 0 ? 0 : 1)} ${units[u]}`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

interface ListResponse {
  items?: LaunchpadFile[];
  files?: LaunchpadFile[];
}

/* Fetch a file list for a workspace. Tolerates either `{items: []}` or
 * `{files: []}` so a future schema tweak doesn't break the pane. Errors
 * (including 404 when /api/files/list isn't deployed yet) resolve to
 * an empty list — the panes render a friendly empty state instead of
 * a stack trace. */
export async function fetchLaunchpadFiles(opts: {
  workspaceId: string;
  limit?: number;
  shared?: boolean;
  kinds?: string;
}): Promise<LaunchpadFile[]> {
  const params = new URLSearchParams();
  params.set("workspace_id", opts.workspaceId);
  if (opts.limit) params.set("limit", String(opts.limit));
  params.set("sort", "created_at:desc");
  if (opts.shared) params.set("shared", "true");
  if (opts.kinds) params.set("kinds", opts.kinds);
  const url = `/api/files/list?${params.toString()}`;
  try {
    const j = await cachedFetch<ListResponse>(url);
    const items = j.items ?? j.files ?? [];
    return items;
  } catch {
    return [];
  }
}

export const FILE_LIST_PREFIX = "/api/files/list";
