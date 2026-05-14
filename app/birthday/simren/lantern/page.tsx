import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import LanternExperience from "./LanternExperience";

/* Lantern variant — warm dark, festival of paper lanterns rising into a
 * midnight sky. Each lantern carries one photo glowing softly inside its
 * rice-paper body. Wish-lanterns carry written wishes. SVG bodies + CSS
 * keyframes for rise + framer-motion for tap-to-bring-forward. No WebGL.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Happy Birthday, Simren — Lantern" },
  description: "A sky full of small lights, for Simren Zahra on May 14, 2026.",
  robots: { index: false, follow: false },
};

function readPhotos(): string[] {
  const dir = path.join(process.cwd(), "public/birthday/simren");
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp|avif|heic)$/i.test(f))
      .sort()
      .map((f) => `/birthday/simren/${encodeURIComponent(f)}`);
  } catch {
    return [];
  }
}

export default function Page() {
  return <LanternExperience photos={readPhotos()} />;
}
