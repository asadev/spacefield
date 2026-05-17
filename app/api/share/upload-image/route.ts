/* Authenticated image upload to the public share bucket.
 *
 * Accepts multipart/form-data with `file` (image blob). Returns
 * { ok, url } where url is the public Supabase storage URL safe to
 * embed in any link payload.
 *
 * Used by the property poster's "Share as link" flow to upload a
 * rasterized snapshot of the poster, which is then served as the
 * exact-pixel hero on share.example.com/p/<slug>.
 */

import { NextRequest, NextResponse } from "next/server";
import { safeErrorMessage } from "@/lib/safe-error";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BUCKET = "share-public";
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "image too large (10MB max)" }, { status: 413 });
    }
    if (!(file.type.startsWith("image/") || file.type === "")) {
      return NextResponse.json({ ok: false, error: "must be an image" }, { status: 400 });
    }

    // Sanitize filename + add timestamp prefix so uploads don't collide
    const ext = (file.name.split(".").pop() ?? "png").toLowerCase().slice(0, 4);
    const path = `${userData.user.id}/${Date.now()}.${ext}`;

    const arrayBuf = await file.arrayBuffer();
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, arrayBuf, {
      contentType: file.type || "image/png",
      upsert: false,
    });
    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ ok: true, url: pub.publicUrl });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: safeErrorMessage(err, {
          source: "share.upload_image",
          fallback: "upload_failed",
        }),
      },
      { status: 500 }
    );
  }
}
