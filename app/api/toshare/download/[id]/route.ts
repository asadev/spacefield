/* Public file-download endpoint.
 *
 * Validates link → optional password gate → records download → 302s to
 * a Supabase signed URL valid for 60 seconds. Signed URL is single-use
 * effectively because by the time the redirect resolves it's already
 * been consumed.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLinkById } from "@/lib/toshare/server";
import { hashClientFingerprint } from "@/lib/toshare/fingerprint";
import type { FilePayload } from "@/lib/toshare/types";

export const runtime = "nodejs";

const BUCKET = "toshare-files";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const password = req.nextUrl.searchParams.get("p") ?? "";

  const link = await getLinkById(id);
  if (!link || link.status !== "active" || link.type !== "file") {
    return new NextResponse("File not found", { status: 404 });
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return new NextResponse("File expired", { status: 410 });
  }

  const payload = link.payload as unknown as FilePayload;

  // Password check
  if (payload.passwordHash) {
    const provided = await sha256Hex(password);
    if (provided !== payload.passwordHash) {
      return NextResponse.json({ error: "password required" }, { status: 401 });
    }
  }

  // Atomically check max-downloads + record
  const supabase = await createClient();
  const ipHash = await hashClientFingerprint(
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? ""
  );
  const uaHash = await hashClientFingerprint(req.headers.get("user-agent") ?? "");
  const { data: ok, error: rpcErr } = await supabase.rpc("toshare_record_download", {
    p_link_id: id,
    p_ip_hash: ipHash,
    p_ua_hash: uaHash,
  });
  if (rpcErr || ok === false) {
    return new NextResponse("Download limit reached", { status: 410 });
  }

  // Generate a 60s signed URL
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(payload.storagePath, 60, {
      download: payload.fileName,
    });

  if (signErr || !signed?.signedUrl) {
    return new NextResponse("Could not generate download URL", { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl, 302);
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
