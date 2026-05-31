/* Wallpaper catalog for the /tools desktop.
 *
 * Each entry has a `value` (a CSS background-image string) and a
 * `preview` string used to render the thumbnail in WallpaperPicker —
 * usually the same as `value`, but photos/former-interactive entries
 * use a cheap gradient preview so the picker grid stays cheap to render.
 *
 * No real photo assets exist yet, so the "photo" entries use Unsplash
 * stock URLs as placeholders. Keep that in mind before wiring CDN. */
export type WallpaperType = "gradient" | "photo";

export interface Wallpaper {
  id: string;
  name: string;
  type: WallpaperType;
  /* A full CSS `background-image` value applied inline. */
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

  /* ─── Former interactive (3D canvas) wallpapers ─────────────────────
   * These used to mount WebGL canvases (three / react-three). Those
   * canvases and their deps were removed for performance. The entries
   * are kept as plain gradients (using each one's former fallback
   * gradient as the background) so any user who had one selected still
   * gets a valid, crash-free background — identical on every device. */
  {
    id: "interactive-galaxy",
    name: "Particle Galaxy",
    type: "gradient",
    value: "radial-gradient(ellipse at 30% 30%, #1e1b4b 0%, #020617 65%)",
    preview:
      "radial-gradient(ellipse at 30% 30%, #1e1b4b 0%, #020617 65%), radial-gradient(circle at 75% 60%, rgba(124,58,237,0.45) 0%, transparent 55%)",
  },
  {
    id: "interactive-mesh",
    name: "Network Mesh",
    type: "gradient",
    value: "radial-gradient(circle at 50% 50%, #1a1a2e 0%, #060611 75%)",
    preview:
      "radial-gradient(circle at 50% 50%, #1a1a2e 0%, #060611 75%), repeating-linear-gradient(45deg, rgba(203,213,225,0.04) 0 1px, transparent 1px 36px)",
  },
  {
    id: "interactive-metaballs",
    name: "Liquid Metaballs",
    type: "gradient",
    value: "linear-gradient(135deg, #0c0420 0%, #1a0635 100%)",
    preview:
      "radial-gradient(circle at 25% 30%, rgba(217,70,239,0.55) 0%, transparent 45%), radial-gradient(circle at 75% 65%, rgba(6,182,212,0.5) 0%, transparent 50%), linear-gradient(135deg, #0c0420 0%, #1a0635 100%)",
  },
];

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

/* Resolve the CSS `background` value for a wallpaper. */
export function wallpaperBackground(w: Wallpaper): string {
  return w.value;
}
