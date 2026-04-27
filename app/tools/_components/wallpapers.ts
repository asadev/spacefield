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

  /* ─── Interactive canvas (placeholder gradients for now) ─── */
  {
    id: "interactive-particles",
    name: "Particle Field",
    type: "interactive",
    value: "particles",
    preview:
      "radial-gradient(circle at 30% 30%, #312e81 0%, #0f172a 70%), radial-gradient(circle at 70% 60%, #4338ca 0%, transparent 60%)",
  },
  {
    id: "interactive-aurora",
    name: "Aurora Flow",
    type: "interactive",
    value: "aurora",
    preview:
      "linear-gradient(135deg, #064e3b 0%, #1e3a8a 50%, #4c1d95 100%)",
  },
];

/* Map of fallback CSS for interactive wallpapers. The real renderer is
 * intentionally not built yet — we render the fallback via an inline
 * style so the desktop background still feels different per choice. */
export const INTERACTIVE_FALLBACK: Record<string, string> = {
  particles:
    "radial-gradient(circle at 30% 30%, #312e81 0%, #0f172a 70%), radial-gradient(circle at 70% 60%, #4338ca 0%, transparent 60%)",
  aurora:
    "linear-gradient(135deg, #064e3b 0%, #1e3a8a 50%, #4c1d95 100%)",
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
