/**
 * Icon style options for the /tools desktop. The renderer in Dock.tsx and
 * Launchpad.tsx looks up the active style and switches the wrapper container
 * around each SVG glyph. The glyph itself stays the same — only the
 * "frame" around it changes (transparent line vs. filled vs. squircle).
 *
 * Default = "hairline" — the original look (clean line glyph on translucent
 * surface). New users should land on what they've always seen.
 */

export type IconStyleId = "hairline" | "filled" | "squircle" | "rounded-square";

export interface IconStyle {
  id: IconStyleId;
  name: string;
  description: string;
}

export const ICON_STYLES: IconStyle[] = [
  {
    id: "hairline",
    name: "Hairline",
    description: "Clean line glyphs on a translucent surface. The default.",
  },
  {
    id: "filled",
    name: "Filled",
    description: "Solid accent tile with a white glyph. Bold and product-y.",
  },
  {
    id: "squircle",
    name: "Squircle",
    description: "iOS-style soft rounded square with a subtle drop shadow.",
  },
  {
    id: "rounded-square",
    name: "Rounded square",
    description: "Material-style elevated tile with a thin border.",
  },
];

export const DEFAULT_ICON_STYLE: IconStyleId = "hairline";

export function isIconStyle(v: unknown): v is IconStyleId {
  return (
    v === "hairline" ||
    v === "filled" ||
    v === "squircle" ||
    v === "rounded-square"
  );
}
