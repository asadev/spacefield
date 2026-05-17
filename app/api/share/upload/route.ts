/* Authenticated file upload → mints a `file`-type Share link.
 *
 * Accepts multipart/form-data with:
 *   - file: the binary blob
 *   - workspaceId (optional)
 *   - password (optional, plaintext — we hash before store)
 *   - maxDownloads (optional integer)
 *   - expiresAt (optional ISO date)
 *
 * Returns { ok, url, slug, linkId } same shape as /api/share/mint.
 */

import { NextRequest, NextResponse } from "next/server";
import { safeErrorMessage } from "@/lib/safe-error";
import { createClient } from "@/lib/supabase/server";
import { mintLink } from "@/lib/share/server";
import type { FilePayload } from "@/lib/share/types";

export const runtime = "nodejs";

const BUCKET = "share-files";
const MAX_BYTES = 100 * 1024 * 1024;

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
      return NextResponse.json({ ok: false, error: "file too large (100MB max)" }, { status: 413 });
    }

    const workspaceId = typeof form.get("workspaceId") === "string"
      ? String(form.get("workspaceId"))
      : undefined;
    const password = typeof form.get("password") === "string" ? String(form.get("password")) : "";
    const maxDownloadsRaw = form.get("maxDownloads");
    const maxDownloads =
      typeof maxDownloadsRaw === "string" && /^\d+$/.test(maxDownloadsRaw)
        ? parseInt(maxDownloadsRaw, 10)
        : undefined;
    const expiresAtRaw = form.get("expiresAt");
    const expiresAt =
      typeof expiresAtRaw === "string" && expiresAtRaw ? new Date(expiresAtRaw) : undefined;

    // Sanitize filename, prefix with timestamp so two uploads don't collide.
    const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
    const storagePath = `${userData.user.id}/${Date.now()}_${safe}`;

    const arrayBuf = await file.arrayBuffer();
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, arrayBuf, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadErr) {
      return NextResponse.json(
        { ok: false, error: uploadErr.message ?? "upload failed" },
        { status: 500 }
      );
    }

    const passwordHash = password ? await sha256Hex(password) : undefined;

    const payload: FilePayload = {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      storagePath,
      maxDownloads,
      downloadCount: 0,
      ...(passwordHash ? { passwordHash } : {}),
    };

    const minted = await mintLink({
      type: "file",
      payload: payload as unknown as Record<string, unknown>,
      workspaceId,
      sourceTool: "share-upload",
      expiresAt,
    });

    if (!minted.ok || !minted.url) {
      // Best-effort delete the uploaded blob to avoid orphans
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      return NextResponse.json(
        { ok: false, error: minted.error ?? "mint failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      url: minted.url,
      linkId: minted.link?.id,
      slug: minted.link?.slug,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: safeErrorMessage(err, {
          source: "share.upload",
          fallback: "upload_failed",
        }),
      },
      { status: 500 }
    );
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
