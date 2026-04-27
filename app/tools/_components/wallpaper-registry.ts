/* Paired wallpaper registry — light + dark variants per id.
 *
 * The legacy catalog (`./wallpapers.ts`) stores raw CSS background
 * strings + interactive ids. That works well but doesn't carry a mode
 * preference per entry, so when the user flips theme, the wallpaper
 * stays whatever they last picked — and most of those happen to be
 * dark, which makes light mode unreadable.
 *
 * This registry is the new home: every entry has a stable `id` and
 * may declare a `light` and/or `dark` asset URL. The picker shows
 * ONE thumbnail per id; the renderer picks the variant matching the
 * resolved theme at runtime. Custom (admin-uploaded) wallpapers from
 * `public.wallpapers` fit the same shape — `light_url` / `dark_url`
 * pour straight in.
 */

export type WallpaperCategory = "abstract" | "scenic" | "minimal" | "custom";
export type WallpaperMode = "light" | "dark" | "auto";

export interface Wallpaper {
  /** Stable slug, e.g. "aurora". URL-safe; never user-typed. */
  id: string;
  /** Display name shown in the picker tile. */
  name: string;
  category: WallpaperCategory;
  /** Mode preference: which variant the system picks when theme is
   *  ambiguous (e.g. only one variant defined, or auto follows theme). */
  mode: WallpaperMode;
  /** Asset URL (or CSS background string for builtin gradients) used
   *  when the resolved theme is light. */
  light?: string;
  /** Asset URL (or CSS background string) used when resolved is dark. */
  dark?: string;
  /** Cheap CSS background for the picker thumbnail — never an
   *  external URL, so the grid renders instantly. We default to the
   *  matching mode preview but the picker can override per theme. */
  previewLight?: string;
  previewDark?: string;
}

/* Six paired SVG wallpapers — light variant + dark variant. The picker
 * shows ONE tile per id; the renderer resolves to whichever asset
 * matches the active theme. */
export const PAIRED_WALLPAPERS: Wallpaper[] = [
  {
    id: "aurora",
    name: "Aurora",
    category: "scenic",
    mode: "auto",
    light: "url('/wallpapers/light-dawn-aurora.svg') center/cover no-repeat",
    dark: "url('/wallpapers/dark-dusk-aurora.svg') center/cover no-repeat",
    previewLight:
      "linear-gradient(135deg, #fefaf6 0%, #fce7f3 50%, #fed7aa 100%)",
    previewDark:
      "linear-gradient(135deg, #0a0717 0%, #16102b 50%, #a855f7 100%)",
  },
  {
    id: "ridge",
    name: "Mountain Ridge",
    category: "scenic",
    mode: "auto",
    light: "url('/wallpapers/light-mist-ridge.svg') center/cover no-repeat",
    dark: "url('/wallpapers/dark-night-ridge.svg') center/cover no-repeat",
    previewLight:
      "linear-gradient(135deg, #fdfbf5 0%, #cbd5e1 55%, #475569 100%)",
    previewDark:
      "linear-gradient(135deg, #070a18 0%, #1a2244 55%, #050a1a 100%)",
  },
  {
    id: "paper-grain",
    name: "Paper",
    category: "minimal",
    mode: "auto",
    light: "url('/wallpapers/light-paper-grain.svg') center/cover no-repeat",
    dark: "url('/wallpapers/dark-paper-grain.svg') center/cover no-repeat",
    previewLight: "linear-gradient(135deg, #fdf9f1 0%, #f5ede0 100%)",
    previewDark: "linear-gradient(135deg, #15161b 0%, #0a0b10 100%)",
  },
  {
    id: "ocean",
    name: "Ocean",
    category: "scenic",
    mode: "auto",
    light: "url('/wallpapers/light-ocean-haze.svg') center/cover no-repeat",
    dark: "url('/wallpapers/dark-ocean-deep.svg') center/cover no-repeat",
    previewLight:
      "linear-gradient(180deg, #f4faf9 0%, #c4e3df 55%, #7ab9b1 100%)",
    previewDark:
      "linear-gradient(180deg, #020617 0%, #0e2a4a 55%, #021327 100%)",
  },
  {
    id: "meadow",
    name: "Meadow",
    category: "scenic",
    mode: "auto",
    light: "url('/wallpapers/light-meadow-bokeh.svg') center/cover no-repeat",
    dark: "url('/wallpapers/dark-meadow-night.svg') center/cover no-repeat",
    previewLight:
      "linear-gradient(135deg, #e8efe2 0%, #c0d2b3 100%)",
    previewDark:
      "linear-gradient(135deg, #0c1410 0%, #163a26 100%)",
  },
  {
    id: "dunes",
    name: "Dunes",
    category: "minimal",
    mode: "auto",
    light: "url('/wallpapers/light-sand-curves.svg') center/cover no-repeat",
    dark: "url('/wallpapers/dark-dune-curves.svg') center/cover no-repeat",
    previewLight:
      "linear-gradient(135deg, #fef6ee 0%, #fbe9d4 55%, #cf9358 100%)",
    previewDark:
      "linear-gradient(135deg, #1a0f08 0%, #321d10 55%, #5a3418 100%)",
  },
];

/** Default fallback for when a wallpaper id is missing the variant
 *  matching the current theme (e.g. light-only or dark-only entries).
 *  We use the paper-grain pair because it's neutral and reads well
 *  for any chrome. */
export const FALLBACK_LIGHT =
  "url('/wallpapers/light-paper-grain.svg') center/cover no-repeat";
export const FALLBACK_DARK =
  "url('/wallpapers/dark-paper-grain.svg') center/cover no-repeat";

/** Resolve which variant string to apply for a given resolved theme.
 *  Honors the mode preference: 'light'/'dark' force that variant
 *  regardless of theme; 'auto' (default) follows the theme. */
export function resolveWallpaperBackground(
  w: Wallpaper,
  resolvedTheme: "light" | "dark"
): string {
  let preferred: "light" | "dark";
  if (w.mode === "light") preferred = "light";
  else if (w.mode === "dark") preferred = "dark";
  else preferred = resolvedTheme;

  if (preferred === "light") {
    return w.light ?? w.dark ?? FALLBACK_LIGHT;
  }
  return w.dark ?? w.light ?? FALLBACK_DARK;
}

/** Pick the right preview swatch for a tile. */
export function resolveWallpaperPreview(
  w: Wallpaper,
  resolvedTheme: "light" | "dark"
): string {
  if (resolvedTheme === "light") {
    return w.previewLight ?? w.light ?? w.previewDark ?? w.dark ?? "#f4f4f5";
  }
  return w.previewDark ?? w.dark ?? w.previewLight ?? w.light ?? "#0a0a0a";
}
