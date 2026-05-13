import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import BirthdayExperience from "./BirthdayExperience";

/* ─────────────────────────────────────────────────────────────────────────
 * Birthday page — Simren Zahra (May 14, 2026)
 *
 * Server component: reads `public/birthday/simren/` at request time and
 * passes the resulting photo URLs to the client component. Drop more
 * jpgs/pngs into the folder and they appear after a hard refresh — no
 * code changes required. Photo-less mode is supported (the client just
 * skips the gallery section).
 * ───────────────────────────────────────────────────────────────────── */

export const dynamic = "force-dynamic"; // re-scan public folder per request

export const metadata: Metadata = {
  title: "Happy Birthday, Simren",
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
  const photos = readPhotos();
  return <BirthdayExperience photos={photos} />;
}
