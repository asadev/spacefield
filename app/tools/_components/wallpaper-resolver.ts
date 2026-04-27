/* Unified wallpaper resolver — bridges legacy gradient/photo entries
 * (./wallpapers.ts) with the new paired light/dark registry
 * (./wallpaper-registry.ts) and DB-backed custom wallpapers.
 *
 * Storage keys remain unchanged (WALLPAPER_STORAGE_SUFFIX), so the
 * user's existing selection persists across the upgrade. The
 * `resolveActiveBackground()` function takes (id, theme, custom?)
 * and returns the CSS `background` string to paint.
 */

import {
  WALLPAPERS as LEGACY_WALLPAPERS,
  wallpaperBackground,
  type Wallpaper as LegacyWallpaper,
} from "./wallpapers";
import {
  PAIRED_WALLPAPERS,
  resolveWallpaperBackground,
  resolveWallpaperPreview,
  type Wallpaper as PairedWallpaper,
  type WallpaperMode,
} from "./wallpaper-registry";

export type {
  PairedWallpaper as RegisteredWallpaper,
  WallpaperMode,
};

/** A custom (admin-uploaded) wallpaper as the picker sees it after
 *  fetching from the DB. Stored shape matches `public.wallpapers`. */
export interface CustomWallpaper {
  id: string;
  slug: string;
  name: string;
  light_url: string | null;
  dark_url: string | null;
  mode_preference: WallpaperMode;
  created_at: string;
}

/** Section the picker renders. Each entry yields ONE thumbnail tile;
 *  the resolver swaps the asset based on theme at render time. */
export interface UnifiedWallpaperEntry {
  id: string;
  name: string;
  /** Section heading: legacy gradient/photo/interactive map to single
   *  buckets; paired registry adds Light, Dark and Pairs; custom is
   *  Custom. */
  section: "gradients" | "photos" | "interactive" | "pairs" | "custom";
  /** Resolve the CSS `background` value for the active theme. */
  getBackground: (resolved: "light" | "dark") => string;
  /** Resolve the picker thumbnail CSS background. */
  getPreview: (resolved: "light" | "dark") => string;
  /** Optional badge label (e.g. "Pair", "Light", "Dark"). */
  badge?: string;
}

/** Convert a paired registry entry into the unified form. */
function fromPaired(p: PairedWallpaper): UnifiedWallpaperEntry {
  return {
    id: pairedId(p.id),
    name: p.name,
    section: "pairs",
    getBackground: (resolved) => resolveWallpaperBackground(p, resolved),
    getPreview: (resolved) => resolveWallpaperPreview(p, resolved),
    badge: p.mode === "auto" ? "Pair" : p.mode === "light" ? "Light" : "Dark",
  };
}

/** Convert a legacy gradient/photo/interactive entry. */
function fromLegacy(l: LegacyWallpaper): UnifiedWallpaperEntry {
  const css = wallpaperBackground(l);
  return {
    id: l.id,
    name: l.name,
    section:
      l.type === "gradient"
        ? "gradients"
        : l.type === "photo"
          ? "photos"
          : "interactive",
    getBackground: () => css,
    getPreview: () => l.preview,
  };
}

/** Convert a DB row into the unified form. */
function fromCustom(c: CustomWallpaper): UnifiedWallpaperEntry {
  const lightCss = c.light_url
    ? `url('${c.light_url}') center/cover no-repeat`
    : null;
  const darkCss = c.dark_url
    ? `url('${c.dark_url}') center/cover no-repeat`
    : null;
  const pref = c.mode_preference;
  return {
    id: customId(c.id),
    name: c.name,
    section: "custom",
    getBackground: (resolved) => {
      let want: "light" | "dark";
      if (pref === "light") want = "light";
      else if (pref === "dark") want = "dark";
      else want = resolved;
      if (want === "light") return lightCss ?? darkCss ?? "#f4f4f5";
      return darkCss ?? lightCss ?? "#0a0a0a";
    },
    getPreview: (resolved) => {
      if (resolved === "light") return lightCss ?? darkCss ?? "#f4f4f5";
      return darkCss ?? lightCss ?? "#0a0a0a";
    },
    badge:
      pref === "auto" && lightCss && darkCss
        ? "Pair"
        : pref === "light"
          ? "Light"
          : pref === "dark"
            ? "Dark"
            : undefined,
  };
}

/** Namespace ids so paired/custom never collide with legacy ids. */
export function pairedId(slug: string): string {
  return `pair:${slug}`;
}
export function customId(uuid: string): string {
  return `custom:${uuid}`;
}

export function isPairedId(id: string): boolean {
  return id.startsWith("pair:");
}
export function isCustomId(id: string): boolean {
  return id.startsWith("custom:");
}

/** Build the entire unified list. Custom rows are passed in by the
 *  caller — fetched once at picker mount via the supabase client. */
export function buildUnified(
  customs: CustomWallpaper[] = []
): UnifiedWallpaperEntry[] {
  const out: UnifiedWallpaperEntry[] = [];
  for (const p of PAIRED_WALLPAPERS) out.push(fromPaired(p));
  for (const l of LEGACY_WALLPAPERS) out.push(fromLegacy(l));
  for (const c of customs) out.push(fromCustom(c));
  return out;
}

/** Resolve a single entry by id from the unified list. Falls back to
 *  the first paired entry (Aurora) if not found. */
export function findEntry(
  id: string | null | undefined,
  entries: UnifiedWallpaperEntry[]
): UnifiedWallpaperEntry {
  if (id) {
    const e = entries.find((x) => x.id === id);
    if (e) return e;
  }
  return entries[0] ?? {
    id: pairedId("aurora"),
    name: "Aurora",
    section: "pairs",
    getBackground: (resolved) =>
      resolveWallpaperBackground(PAIRED_WALLPAPERS[0], resolved),
    getPreview: (resolved) =>
      resolveWallpaperPreview(PAIRED_WALLPAPERS[0], resolved),
  };
}
