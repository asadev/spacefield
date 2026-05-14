import fs from "node:fs";
import path from "node:path";
import AutoMusic from "./_components/AutoMusic";

/* Shared layout for /birthday/simren and every variant under it.
 *
 * Mounts a single <AutoMusic /> instance globally so background music
 * starts (muted → unmute on first tap) once per session, regardless of
 * which variant the visitor lands on. The audio file is whatever sits
 * in `public/birthday/simren/audio/` — if multiple, the first by sort
 * order is used. If empty, the player is a no-op.
 */

export const dynamic = "force-dynamic";

function readFirstAudio(): string | null {
  const dir = path.join(process.cwd(), "public/birthday/simren/audio");
  if (!fs.existsSync(dir)) return null;
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => /\.(mp3|m4a|aac|wav|ogg|opus)$/i.test(f))
      .sort();
    if (files.length === 0) return null;
    return `/birthday/simren/audio/${encodeURIComponent(files[0])}`;
  } catch {
    return null;
  }
}

export default function BirthdayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const audioSrc = readFirstAudio();
  return (
    <>
      <AutoMusic src={audioSrc} />
      {children}
    </>
  );
}
