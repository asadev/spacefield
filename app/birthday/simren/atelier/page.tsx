import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import AtelierExperience from "./AtelierExperience";

/* ATELIER variant — designer's mood board for Simren Zahra (May 14, 2026)
 * Cream linen / cork board, pinned photos, washi tape, scrap-paper notes,
 * hand-painted script title, brass tacks.
 *
 * Server component: reads photo files at request time and hands list down. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Happy Birthday, Simren — Atelier" },
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
  return <AtelierExperience photos={readPhotos()} />;
}
