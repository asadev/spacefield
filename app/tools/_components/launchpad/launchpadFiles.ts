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

/* Pick the best editor app for a given file kind. Returns null for
 * kinds that have no dedicated tool — callers fall back to the
 * Launchpad's built-in preview overlay.
 *
 * Historical: this used to return "files-manager" as a catch-all, but
 * the standalone Files Manager was retired (Round D — covered by the
 * Launchpad). Anything that isn't a document/spreadsheet now previews
 * in-place. See Launchpad.tsx#handleOpenFile and Spotlight.tsx for the
 * caller flows. */
export function appForFile(file: LaunchpadFile): string | null {
  const k = fileKind(file);
  if (k === "document") return "documents";
  if (k === "sheet") return "sheets";
  return null;
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
export const STORAGE_STATS_PREFIX = "/api/workspaces/storage-stats";

/* Path-tree helpers for the Home view. v1 derives the folder structure
 * from the file's `name` — if the name contains a slash, everything
 * before the first slash is treated as the folder. Loose files (no
 * slash in the name) are bucketed under a synthetic "Loose files"
 * folder so the tree is never empty when there are files. */

export const LOOSE_FOLDER = "Loose files";

export interface FolderGroup {
  name: string;
  files: LaunchpadFile[];
}

/** Folder placeholders are 0-byte rows the agent inserts via
 *  `create_folder` so an empty folder appears in the tree. The
 *  placeholder itself shouldn't show up as a "file" in the right pane. */
function isFolderPlaceholder(f: LaunchpadFile): boolean {
  return (
    f.size_bytes === 0 &&
    f.content_type === "application/x-folder-placeholder"
  );
}

export function groupFilesByFolder(files: LaunchpadFile[]): FolderGroup[] {
  const map = new Map<string, LaunchpadFile[]>();
  for (const f of files) {
    const slash = f.name.indexOf("/");
    const folder = slash > 0 ? f.name.slice(0, slash) : LOOSE_FOLDER;
    const list = map.get(folder) ?? [];
    // Keep the placeholder out of the right-pane list, but still let
    // its presence register the folder as known (the map.set below
    // handles that).
    if (!isFolderPlaceholder(f)) list.push(f);
    map.set(folder, list);
  }
  const groups: FolderGroup[] = [];
  for (const [name, fs] of map.entries()) {
    groups.push({ name, files: fs });
  }
  // Loose files goes last; everything else alphabetical.
  groups.sort((a, b) => {
    if (a.name === LOOSE_FOLDER) return 1;
    if (b.name === LOOSE_FOLDER) return -1;
    return a.name.localeCompare(b.name);
  });
  return groups;
}

/* Strip the folder prefix off a file name so the right pane shows the
 * leaf name only (e.g. "docs/spec.md" → "spec.md"). Loose files keep
 * their full name. */
export function leafName(file: LaunchpadFile): string {
  const slash = file.name.indexOf("/");
  if (slash <= 0) return file.name;
  return file.name.slice(slash + 1) || file.name;
}
