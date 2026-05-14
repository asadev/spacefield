import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import LetterExperience from "./LetterExperience";

/* Letter variant — light, intimate. A folded letter on a softly-lit
 * desk, sealed with deep red wax. Tap the seal, the letter unfolds and
 * writes itself out in cursive. Photos tucked behind the page; pencil
 * cake in the margin with five candles you blow out by tapping. Sign-
 * off is generic ("Yours, always —"). NEVER a name. See design-spec.md
 * in this folder for the full plan.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // `absolute` bypasses the root layout's "%s | Space Field" template.
  title: { absolute: "Happy Birthday, Simren — Letter" },
  description: "A letter for Simren Zahra on May 14, 2026.",
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
  return <LetterExperience photos={readPhotos()} />;
}
