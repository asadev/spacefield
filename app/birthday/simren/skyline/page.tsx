import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import SkylineExperience from "./SkylineExperience";

/* Skyline variant — a 3D city at night that lights window-by-window
 * as the visitor scrolls. Each light is a wish for her. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Happy Birthday, Simren — Skyline" },
  description: "A city, lit for one night.",
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
  return <SkylineExperience photos={readPhotos()} />;
}
