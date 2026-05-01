/* Wallpaper catalog for the /tools desktop.
 *
 * Each entry has a `value` (a CSS background-image string for gradients
 * and photos, or an interactive id for canvas placeholders) and a
 * `preview` string used to render the thumbnail in WallpaperPicker —
 * usually the same as `value` but for `interactive` we fall back to a
 * static gradient so the picker grid stays cheap to render.
 *
 * No real photo assets exist yet, so the "photo" entries use Unsplash
 * stock URLs as placeholders. Keep that in mind before wiring CDN. */
export type WallpaperType = "gradient" | "photo" | "interactive";

export interface Wallpaper {
  id: string;
  name: string;
  type: WallpaperType;
  /* For gradient/photo: a full CSS `background-image` value applied
   * inline. For interactive: an opaque key the renderer maps to a
   * canvas component (currently fallback gradients). */
  value: string;
  /* Cheap CSS background used for the picker thumbnail. Always a
   * gradient string — never an external URL — so the grid renders
   * instantly even on slow connections. */
  preview: string;
}

export const WALLPAPERS: Wallpaper[] = [
  /* ─── Gradients ─── */
  {
    id: "gradient-deep-navy",
    name: "Deep Navy",
    type: "gradient",
    value:
      "linear-gradient(135deg, #0b1224 0%, #131a35 45%, #1c2547 100%)",
    preview:
      "linear-gradient(135deg, #0b1224 0%, #131a35 45%, #1c2547 100%)",
  },
  {
    id: "gradient-twilight-purple",
    name: "Twilight Purple",
    type: "gradient",
    value:
      "linear-gradient(135deg, #1a0f2e 0%, #3b1a5e 50%, #5b2a86 100%)",
    preview:
      "linear-gradient(135deg, #1a0f2e 0%, #3b1a5e 50%, #5b2a86 100%)",
  },
  {
    id: "gradient-sunrise-amber",
    name: "Sunrise Amber",
    type: "gradient",
    value:
      "linear-gradient(135deg, #3a1c08 0%, #d97706 55%, #fbbf24 100%)",
    preview:
      "linear-gradient(135deg, #3a1c08 0%, #d97706 55%, #fbbf24 100%)",
  },
  {
    id: "gradient-forest-emerald",
    name: "Forest Emerald",
    type: "gradient",
    value:
      "linear-gradient(135deg, #052e1a 0%, #0f5132 55%, #10b981 100%)",
    preview:
      "linear-gradient(135deg, #052e1a 0%, #0f5132 55%, #10b981 100%)",
  },
  {
    id: "gradient-slate-noir",
    name: "Slate Noir",
    type: "gradient",
    value:
      "linear-gradient(135deg, #050505 0%, #1a1a1d 55%, #2d2d33 100%)",
    preview:
      "linear-gradient(135deg, #050505 0%, #1a1a1d 55%, #2d2d33 100%)",
  },
  {
    id: "gradient-rose-dawn",
    name: "Rose Dawn",
    type: "gradient",
    value:
      "linear-gradient(135deg, #2a0a1c 0%, #9d174d 55%, #fb7185 100%)",
    preview:
      "linear-gradient(135deg, #2a0a1c 0%, #9d174d 55%, #fb7185 100%)",
  },

  /* ─── Photos (Unsplash placeholders until real CDN assets exist) ─── */
  {
    id: "photo-skyline",
    name: "City Skyline",
    type: "photo",
    value:
      "url('https://images.unsplash.com/photo-1444723121867-7a241cacace9?auto=format&fit=crop&w=2400&q=70') center/cover no-repeat",
    preview:
      "linear-gradient(135deg, #1e293b 0%, #475569 60%, #94a3b8 100%)",
  },
  {
    id: "photo-mountains",
    name: "Mountain Mist",
    type: "photo",
    value:
      "url('https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=2400&q=70') center/cover no-repeat",
    preview:
      "linear-gradient(135deg, #0f172a 0%, #334155 50%, #cbd5e1 100%)",
  },
  {
    id: "photo-ocean",
    name: "Ocean Depth",
    type: "photo",
    value:
      "url('https://images.unsplash.com/photo-1505142468610-359e7d316be0?auto=format&fit=crop&w=2400&q=70') center/cover no-repeat",
    preview:
      "linear-gradient(135deg, #082f49 0%, #0369a1 55%, #38bdf8 100%)",
  },
  {
    id: "photo-desert",
    name: "Desert Dunes",
    type: "photo",
    value:
      "url('https://images.unsplash.com/photo-1473580044384-7ba9967e16a0?auto=format&fit=crop&w=2400&q=70') center/cover no-repeat",
    preview:
      "linear-gradient(135deg, #451a03 0%, #b45309 55%, #fcd34d 100%)",
  },

  /* ─── Interactive canvas — animated wallpapers ──────────────────────
   * Each entry's `value` is a key into INTERACTIVE_COMPONENTS in
   * `./wallpapers/index.ts`. The DesktopBackground component looks up
   * the matching React component and mounts it as the live
   * background; the `preview` gradient is shown in the picker tile. */

  // Premium animated themes — Mamboleoo / particlegalaxy.webflow / etc inspired.
  {
    id: "interactive-galaxy",
    name: "Particle Galaxy",
    type: "interactive",
    value: "galaxy",
    preview:
      "radial-gradient(ellipse at 30% 30%, #1e1b4b 0%, #020617 65%), radial-gradient(circle at 75% 60%, rgba(124,58,237,0.45) 0%, transparent 55%)",
  },
  {
    id: "interactive-mesh",
    name: "Network Mesh",
    type: "interactive",
    value: "mesh",
    preview:
      "radial-gradient(circle at 50% 50%, #1a1a2e 0%, #060611 75%), repeating-linear-gradient(45deg, rgba(203,213,225,0.04) 0 1px, transparent 1px 36px)",
  },
  {
    id: "interactive-metaballs",
    name: "Liquid Metaballs",
    type: "interactive",
    value: "metaballs",
    preview:
      "radial-gradient(circle at 25% 30%, rgba(217,70,239,0.55) 0%, transparent 45%), radial-gradient(circle at 75% 65%, rgba(6,182,212,0.5) 0%, transparent 50%), linear-gradient(135deg, #0c0420 0%, #1a0635 100%)",
  },
  {
    id: "interactive-synthwave",
    name: "Neon Synthwave",
    type: "interactive",
    value: "synthwave",
    preview:
      "linear-gradient(180deg, #1a0020 0%, #ff006e 55%, #ffaa00 75%, #00d4ff 100%)",
  },
  {
    id: "interactive-crystals",
    name: "Crystal Bloom",
    type: "interactive",
    value: "crystals",
    preview:
      "linear-gradient(135deg, #0a0420 0%, #1a0a3a 100%), radial-gradient(circle at 30% 40%, rgba(196,181,253,0.35) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(251,207,232,0.3) 0%, transparent 50%)",
  },

  // Dubai-themed canvases — built earlier and now wired in.
  {
    id: "interactive-aurora-dubai",
    name: "Aurora Dubai",
    type: "interactive",
    value: "aurora-dubai",
    preview:
      "linear-gradient(135deg, #06081a 0%, #1a1247 45%, #5e3a86 100%)",
  },
  {
    id: "interactive-burj-twilight",
    name: "Burj Twilight",
    type: "interactive",
    value: "burj-twilight",
    preview:
      "linear-gradient(180deg, #1a0d2e 0%, #5b1f5d 45%, #f97316 100%)",
  },
  {
    id: "interactive-desert-dunes",
    name: "Desert Dunes",
    type: "interactive",
    value: "desert-dunes",
    preview:
      "linear-gradient(180deg, #2a1407 0%, #b45309 45%, #fcd34d 100%)",
  },
  {
    id: "interactive-marina-lights",
    name: "Marina Lights",
    type: "interactive",
    value: "marina-lights",
    preview:
      "linear-gradient(180deg, #051028 0%, #0a2a4a 50%, #16345f 100%)",
  },
  {
    id: "interactive-palm-jumeirah",
    name: "Palm Jumeirah",
    type: "interactive",
    value: "palm-jumeirah",
    preview:
      "linear-gradient(180deg, #032936 0%, #086a78 55%, #f59e0b 100%)",
  },
  {
    id: "interactive-sandstorm",
    name: "Sandstorm",
    type: "interactive",
    value: "sandstorm",
    preview:
      "linear-gradient(135deg, #261609 0%, #7c3a0d 50%, #d97706 100%)",
  },
];

/* Map of fallback CSS for interactive wallpapers — used when the
 * canvas component fails to mount or while it lazy-loads. Keys match
 * `value` in WALLPAPERS entries above and `INTERACTIVE_COMPONENTS` in
 * `./wallpapers/index.ts`. The component renders ON TOP of this
 * fallback, so a slow first paint still shows a tinted background. */
export const INTERACTIVE_FALLBACK: Record<string, string> = {
  galaxy:
    "radial-gradient(ellipse at 30% 30%, #1e1b4b 0%, #020617 65%)",
  mesh: "radial-gradient(circle at 50% 50%, #1a1a2e 0%, #060611 75%)",
  metaballs:
    "linear-gradient(135deg, #0c0420 0%, #1a0635 100%)",
  synthwave:
    "linear-gradient(180deg, #1a0020 0%, #ff006e 55%, #ffaa00 75%, #00d4ff 100%)",
  crystals: "linear-gradient(135deg, #0a0420 0%, #1a0a3a 100%)",
  "aurora-dubai":
    "linear-gradient(135deg, #06081a 0%, #1a1247 45%, #5e3a86 100%)",
  "burj-twilight":
    "linear-gradient(180deg, #1a0d2e 0%, #5b1f5d 45%, #f97316 100%)",
  "desert-dunes":
    "linear-gradient(180deg, #2a1407 0%, #b45309 45%, #fcd34d 100%)",
  "marina-lights":
    "linear-gradient(180deg, #051028 0%, #0a2a4a 50%, #16345f 100%)",
  "palm-jumeirah":
    "linear-gradient(180deg, #032936 0%, #086a78 55%, #f59e0b 100%)",
  sandstorm: "linear-gradient(135deg, #261609 0%, #7c3a0d 50%, #d97706 100%)",
};

/** Suffix only — the actual localStorage key is namespaced per workspace
 *  via useWorkspaceKey(WALLPAPER_STORAGE_SUFFIX). */
export const WALLPAPER_STORAGE_SUFFIX = "tools-desktop-wallpaper-v1";
export const WALLPAPER_CHANGE_EVENT = "tools-desktop-wallpaper-change";

/* Default = the new "Aurora" paired wallpaper. Adapts to light/dark
 * automatically. We namespace paired ids with a `pair:` prefix in
 * the resolver so they never collide with the legacy slugs above. */
export const DEFAULT_WALLPAPER_ID = "pair:aurora";

export function getWallpaperById(id: string | null | undefined): Wallpaper {
  if (!id) return WALLPAPERS[0];
  return WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0];
}

/* Resolve the CSS `background` value for a wallpaper. For interactive
 * wallpapers we return the fallback gradient; once real canvases land
 * the renderer can branch on `type` separately. */
export function wallpaperBackground(w: Wallpaper): string {
  if (w.type === "interactive") {
    return INTERACTIVE_FALLBACK[w.value] ?? WALLPAPERS[0].value;
  }
  return w.value;
}
