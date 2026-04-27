import { NextResponse, type NextRequest } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";

import { r2, R2_BUCKET } from "@/lib/r2";

/* GET /api/wallpapers/asset?key=wallpapers/<id>__<mode>.<ext>
 *
 * Streams a wallpaper asset from R2. Used as the fallback URL shape
 * when R2_PUBLIC_URL is not configured. Cached aggressively at the
 * edge — wallpaper R2 keys are content-immutable (id__mode.ext).
 *
 * Only keys under the `wallpapers/` prefix are served by this route;
 * any other prefix is rejected to keep this proxy from doubling as a
 * generic R2 reader.
 */

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || !key.startsWith("wallpapers/")) {
    return NextResponse.json({ error: "invalid key" }, { status: 400 });
  }

  try {
    const res = await r2().send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: key })
    );
    if (!res.Body) {
      return NextResponse.json({ error: "empty body" }, { status: 502 });
    }
    // The S3 SDK returns a web ReadableStream in node 18+. Cast it for
    // NextResponse, which accepts ReadableStream<Uint8Array>.
    const stream = res.Body as unknown as ReadableStream<Uint8Array>;
    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": res.ContentType ?? "application/octet-stream",
        "cache-control":
          res.CacheControl ?? "public, max-age=31536000, immutable",
        ...(res.ContentLength
          ? { "content-length": String(res.ContentLength) }
          : {}),
      },
    });
  } catch (err: unknown) {
    const code =
      (err as { name?: string } | null)?.name ??
      (err as { Code?: string } | null)?.Code ??
      "";
    if (code === "NoSuchKey" || code === "NotFound") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
