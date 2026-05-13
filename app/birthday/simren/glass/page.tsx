import fs from "node:fs";
import path from "node:path";
import GlassExperience from "./GlassExperience";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Happy Birthday, Simren",
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
  return <GlassExperience photos={photos} />;
}
