import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import BloomExperience from "./BloomExperience";

/* Bloom variant — South Asian heritage, light mode.
 * Cream / saffron / maroon / deep teal palette. Mughal-arch photo frames,
 * henna-flourish SVG borders animating in, ornate tiered cake with edible-gold
 * piping, calligraphic display serif (Cormorant Garamond), drifting marigold
 * petals on scroll, rose-gold gradient accents. Like a beautifully designed
 * wedding card — warm, ceremonial, tasteful. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Happy Birthday, Simren — Bloom",
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
  return <BloomExperience photos={readPhotos()} />;
}
