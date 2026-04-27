import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteR2Object } from "@/lib/r2";

/* DELETE /api/wallpapers/delete
 *   body: { id: string }
 *
 * Looks up the row, removes the R2 objects (light + dark — best
 * effort, missing keys aren't fatal), then deletes the DB row.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  // Two URL shapes possible:
  //   https://<R2_PUBLIC_URL>/wallpapers/<id>__<mode>.<ext>
  //   /api/wallpapers/asset?key=wallpapers%2F<id>__<mode>.<ext>
  try {
    if (url.includes("?key=")) {
      const u = new URL(url, "http://localhost");
      const k = u.searchParams.get("key");
      return k ?? null;
    }
    const idx = url.indexOf("/wallpapers/");
    if (idx >= 0) return url.slice(idx + 1);
    return null;
  } catch {
    return null;
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unauthorized";
    return NextResponse.json(
      { error: msg },
      { status: msg === "not signed in" ? 401 : 403 }
    );
  }

  let body: { id?: string };
  try {
    body = (await req.json()) as { id?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data: row, error: readErr } = await sb
    .from("wallpapers")
    .select("id, light_url, dark_url")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const keys = [
    extractKeyFromUrl(row.light_url),
    extractKeyFromUrl(row.dark_url),
  ].filter((k): k is string => !!k);

  await Promise.all(
    keys.map(async (key) => {
      try {
        await deleteR2Object(key);
      } catch {
        // Best effort — orphaned R2 object is preferable to a stuck DB row.
      }
    })
  );

  const { error: delErr } = await sb.from("wallpapers").delete().eq("id", id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
