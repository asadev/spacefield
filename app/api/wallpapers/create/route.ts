import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { putR2Object, r2PublicUrl } from "@/lib/r2";

/* POST /api/wallpapers/create
 *
 * Multipart form:
 *   - name             (required, string)
 *   - slug             (required, kebab-case)
 *   - mode_preference  (auto | light | dark, required)
 *   - light_file       (File, optional)
 *   - dark_file        (File, optional)
 *
 * Server uploads each provided file to R2 under
 *   wallpapers/<wallpaper_id>__<mode>.<ext>
 * then inserts a row in public.wallpapers via the service-role client
 * (admin-only flow gated by assertAdmin).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MODES = new Set(["auto", "light", "dark"]);
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB per file — wallpapers are images, not video.

type ModeKey = "light" | "dark";

function safeExtension(file: File): string {
  const fromName = (file.name.match(/\.([a-zA-Z0-9]{2,5})$/) || [])[1];
  if (fromName) return fromName.toLowerCase();
  const ct = (file.type || "").toLowerCase();
  if (ct.includes("svg")) return "svg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("avif")) return "avif";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  return "bin";
}

function isKebabCase(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 64;
}

export async function POST(req: NextRequest) {
  let admin: { userId: string; email: string | null };
  try {
    admin = await assertAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unauthorized";
    return NextResponse.json(
      { error: msg },
      { status: msg === "not signed in" ? 401 : 403 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const name = String(form.get("name") ?? "").trim();
  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  const mode_preference = String(form.get("mode_preference") ?? "auto").trim();

  if (!name || name.length > 80) {
    return NextResponse.json(
      { error: "name is required (max 80 chars)" },
      { status: 400 }
    );
  }
  if (!slug || !isKebabCase(slug)) {
    return NextResponse.json(
      { error: "slug must be kebab-case (a-z, 0-9, dashes)" },
      { status: 400 }
    );
  }
  if (!ALLOWED_MODES.has(mode_preference)) {
    return NextResponse.json(
      { error: "mode_preference must be auto, light, or dark" },
      { status: 400 }
    );
  }

  const lightFile = form.get("light_file");
  const darkFile = form.get("dark_file");
  const files: { mode: ModeKey; file: File }[] = [];
  if (lightFile && typeof lightFile === "object" && "arrayBuffer" in lightFile) {
    files.push({ mode: "light", file: lightFile as File });
  }
  if (darkFile && typeof darkFile === "object" && "arrayBuffer" in darkFile) {
    files.push({ mode: "dark", file: darkFile as File });
  }
  if (files.length === 0) {
    return NextResponse.json(
      { error: "provide at least one of light_file or dark_file" },
      { status: 400 }
    );
  }
  for (const { file } of files) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `file too large — max ${MAX_BYTES / (1024 * 1024)} MB per variant` },
        { status: 413 }
      );
    }
  }

  const id = randomUUID();

  // Upload all variants in parallel.
  const uploads = await Promise.all(
    files.map(async ({ mode, file }) => {
      const ext = safeExtension(file);
      const key = `wallpapers/${id}__${mode}.${ext}`;
      const buf = Buffer.from(await file.arrayBuffer());
      await putR2Object({
        key,
        body: buf,
        contentType: file.type || "application/octet-stream",
        cacheControl: "public, max-age=31536000, immutable",
      });
      return { mode, url: r2PublicUrl({ key, assetProxy: "wallpapers" }) };
    })
  );

  let lightUrl: string | null = null;
  let darkUrl: string | null = null;
  for (const u of uploads) {
    if (u.mode === "light") lightUrl = u.url;
    else darkUrl = u.url;
  }

  const sb = createAdminClient();
  const { data: row, error } = await sb
    .from("wallpapers")
    .insert({
      id,
      slug,
      name,
      category: "custom",
      light_url: lightUrl,
      dark_url: darkUrl,
      mode_preference,
      created_by: admin.userId,
    })
    .select(
      "id, slug, name, category, light_url, dark_url, mode_preference, created_by, created_at"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ wallpaper: row });
}
