import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import ConstellationExperience from "./ConstellationExperience";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Happy Birthday, Simren — Constellation" },
  robots: { index: false, follow: false },
};

function readPhotos() {
  const dir = path.join(process.cwd(), "public/birthday/simren");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp|avif|heic)$/i.test(f))
    .sort()
    .map((f) => `/birthday/simren/${encodeURIComponent(f)}`);
}

export default function Page() {
  const photos = readPhotos();
  return <ConstellationExperience photos={photos} />;
}
