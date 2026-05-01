"use client";

/* InteractiveBackground — dispatcher that mounts the canvas component
 * matching the user's selected interactive wallpaper. Imports all 11
 * canvases statically so changing wallpaper is instant (no separate
 * lazy chunk per canvas), but THIS module itself is lazy-loaded by
 * DesktopBackground so users on a static gradient never download any
 * canvas code.
 *
 * If the requested key isn't in the map, returns null and lets the
 * static CSS fallback (already painted underneath) carry the visual. */

import { INTERACTIVE_COMPONENTS } from "./wallpapers/index";

interface Props {
  /** Key into INTERACTIVE_COMPONENTS (e.g. "galaxy", "mesh"). */
  interactiveKey: string;
}

export default function InteractiveBackground({ interactiveKey }: Props) {
  const Component = INTERACTIVE_COMPONENTS[interactiveKey];
  if (!Component) return null;
  return <Component />;
}
