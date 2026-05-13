import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import GardenExperience from "./GardenExperience";

/* Garden variant — light, pastel meadow. Polaroids on a wood table,
 * SVG wildflowers that bloom on scroll, hand-drawn naked cake with
 * frosting roses, wishes pinned to twine like handwritten notes. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Happy Birthday, Simren — Garden",
  description: "A small thing for Simren Zahra on May 14, 2026.",
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
  return <GardenExperience photos={readPhotos()} />;
}
