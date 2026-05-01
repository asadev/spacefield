/* Barrel export for the interactive canvas/Three.js wallpapers used
 * by the /tools desktop. The InteractiveBackground dispatcher reads
 * INTERACTIVE_COMPONENTS to mount the right component for the user's
 * selected wallpaper id. The picker also imports these components to
 * render LIVE previews in the picker tiles (preview prop enables
 * reduced-density mode).
 *
 * Catalog deliberately small — Asad keeps the three that match the
 * reference aesthetic; the prior 6 Dubai canvases + Neon Synthwave +
 * Crystal Bloom were removed. */

import type { ComponentType } from "react";

import ParticleGalaxy from "./ParticleGalaxy";
import NetworkMesh from "./NetworkMesh";
import LiquidMetaballs from "./LiquidMetaballs";

export { ParticleGalaxy, NetworkMesh, LiquidMetaballs };

export interface InteractiveWallpaperProps {
  preview?: { w: number; h: number };
}

/** Map of interactive wallpaper `value` strings (as registered in
 *  wallpapers.ts WALLPAPERS array) to the canvas component that
 *  renders them. */
export const INTERACTIVE_COMPONENTS: Record<
  string,
  ComponentType<InteractiveWallpaperProps>
> = {
  galaxy: ParticleGalaxy,
  mesh: NetworkMesh,
  metaballs: LiquidMetaballs,
};
