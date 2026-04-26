/* Barrel export for the 6 interactive canvas wallpapers used by the
 * /tools desktop. Components are lazy-loaded via React.lazy in
 * DesktopBackground, but exported eagerly here so the WallpaperPicker
 * can render small preview thumbnails inline. */
export { default as BurjTwilight } from "./BurjTwilight";
export { default as PalmJumeirah } from "./PalmJumeirah";
export { default as DesertDunes } from "./DesertDunes";
export { default as AuroraDubai } from "./AuroraDubai";
export { default as MarinaLights } from "./MarinaLights";
export { default as Sandstorm } from "./Sandstorm";
