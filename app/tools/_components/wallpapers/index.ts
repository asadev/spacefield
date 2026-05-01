/* Barrel export for the interactive canvas wallpapers used by the
 * /tools desktop. Components are lazy-loaded via React.lazy in
 * DesktopBackground; this file lets WallpaperPicker render small
 * preview thumbnails inline using the same components.
 *
 * The map at the bottom is the source of truth that DesktopBackground
 * uses to dispatch from a wallpaper id (`value` field) to a canvas
 * component. Add new wallpapers here AND register them in
 * `../wallpapers.ts` (WALLPAPERS array) so the picker discovers them. */

import type { ComponentType } from "react";

import AuroraDubai from "./AuroraDubai";
import BurjTwilight from "./BurjTwilight";
import DesertDunes from "./DesertDunes";
import MarinaLights from "./MarinaLights";
import PalmJumeirah from "./PalmJumeirah";
import Sandstorm from "./Sandstorm";

import ParticleGalaxy from "./ParticleGalaxy";
import NetworkMesh from "./NetworkMesh";
import LiquidMetaballs from "./LiquidMetaballs";
import NeonSynthwave from "./NeonSynthwave";
import CrystalBloom from "./CrystalBloom";

export {
  AuroraDubai,
  BurjTwilight,
  DesertDunes,
  MarinaLights,
  PalmJumeirah,
  Sandstorm,
  ParticleGalaxy,
  NetworkMesh,
  LiquidMetaballs,
  NeonSynthwave,
  CrystalBloom,
};

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
  // Dubai-themed canvases (built earlier; now wired up).
  "aurora-dubai": AuroraDubai,
  "burj-twilight": BurjTwilight,
  "desert-dunes": DesertDunes,
  "marina-lights": MarinaLights,
  "palm-jumeirah": PalmJumeirah,
  sandstorm: Sandstorm,

  // New extraordinary themes — particle, mesh, fluid, retro, crystal.
  galaxy: ParticleGalaxy,
  mesh: NetworkMesh,
  metaballs: LiquidMetaballs,
  synthwave: NeonSynthwave,
  crystals: CrystalBloom,
};
