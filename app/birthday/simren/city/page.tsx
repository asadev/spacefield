import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import CityExperience from "./CityExperience";

/* City variant — a 12-chapter scroll-driven cinematic film of one woman's
 * birthday told through the people of a city quietly conspiring to make
 * the day extraordinary. Dawn → bustle → preparation → night → drone show
 * → fireworks → quiet letter. Lenis inertial scroll, framer-motion chapter
 * choreography, three.js for the drone + fireworks chapters. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Happy Birthday, Simren — City" },
  description: "A day in the life of a city quietly preparing for one woman.",
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
  return <CityExperience photos={readPhotos()} />;
}
