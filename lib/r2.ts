import "server-only";
import {
  S3Client,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import {
  getSignedUrl,
} from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

/* Cloudflare R2 — S3-compatible object storage for Space Field uploads.
 *
 * Files Manager flow:
 *   1. Client requests a presigned upload URL via POST /api/files/upload
 *      (server validates quota + workspace membership).
 *   2. Browser PUTs the file directly to R2 using that URL — R2 creds
 *      never leave the server.
 *   3. After successful PUT, client tells server "done, here's the key
 *      and size" → server inserts a row into public.workspace_files.
 *   4. Read flow: client requests a presigned GET URL → browser fetches
 *      from R2 directly. (Cheaper than streaming through our server.)
 *
 * Object key shape: "<workspaceId>/<fileId>/<safeName>"
 *   - workspaceId scopes by workspace
 *   - fileId is a uuid we generate so the same name can be re-uploaded
 *   - safeName preserves the original filename for downloads
 */

const ENDPOINT = process.env.R2_ENDPOINT;
const BUCKET = process.env.R2_BUCKET_FILES ?? "spacefield-files";
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;

let cachedClient: S3Client | null = null;

export function r2(): S3Client {
  if (cachedClient) return cachedClient;
  if (!ENDPOINT || !ACCESS_KEY || !SECRET_KEY) {
    throw new Error(
      "R2 not configured — set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
    );
  }
  cachedClient = new S3Client({
    region: "auto",
    endpoint: ENDPOINT,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    // R2 doesn't strictly need this but it avoids region-detection requests.
    forcePathStyle: false,
  });
  return cachedClient;
}

export const R2_BUCKET = BUCKET;

/* Build the canonical R2 key for a workspace file. */
export function buildR2Key(args: {
  workspaceId: string;
  fileId: string;
  fileName: string;
}): string {
  // Strip path traversal + surrounding whitespace; keep extension.
  const safeName = args.fileName
    .replace(/[\\/]+/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 200) || "file";
  return `${args.workspaceId}/${args.fileId}/${safeName}`;
}

/* Presigned PUT URL — browser uploads directly to R2 with this. Default
 * expiry is short (10 min) since the URL is generated right before
 * upload starts. */
export async function presignedUploadUrl(args: {
  key: string;
  contentType?: string;
  contentLength?: number;
  expiresInSeconds?: number;
}): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: args.key,
    ContentType: args.contentType,
    ContentLength: args.contentLength,
  });
  return getSignedUrl(r2(), cmd, {
    expiresIn: args.expiresInSeconds ?? 600,
  });
}

/* Presigned GET URL — used both for download and for inline preview
 * (audio, video, image). */
export async function presignedDownloadUrl(args: {
  key: string;
  fileName?: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: args.key,
    ResponseContentDisposition: args.fileName
      ? `attachment; filename="${args.fileName.replace(/"/g, '\\"')}"`
      : undefined,
  });
  return getSignedUrl(r2(), cmd, {
    expiresIn: args.expiresInSeconds ?? 600,
  });
}

export async function deleteR2Object(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/* Direct server-side upload to R2. Used by routes (e.g. wallpapers
 * admin) that receive a small file via multipart and don't need the
 * presign-then-PUT-from-browser dance. */
export async function putR2Object(args: {
  key: string;
  body: Uint8Array | Buffer;
  contentType?: string;
  cacheControl?: string;
}): Promise<void> {
  await r2().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
      CacheControl: args.cacheControl,
    })
  );
}

/* Build a stable URL for an R2 object. Uses R2_PUBLIC_URL if set
 * (the recommended setup — Cloudflare custom domain or r2.dev), and
 * falls back to the same-origin proxy route /api/wallpapers/asset
 * for wallpaper assets. The fallback is transparent at the call site:
 * pass `assetProxy: 'wallpapers'` and we'll route through the proxy. */
export function r2PublicUrl(args: {
  key: string;
  assetProxy?: "wallpapers";
}): string {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/+$/, "");
  if (base) return `${base}/${args.key}`;
  if (args.assetProxy === "wallpapers") {
    return `/api/wallpapers/asset?key=${encodeURIComponent(args.key)}`;
  }
  // Last-resort: presigned long-lived URL. Caller should prefer the
  // proxy or set R2_PUBLIC_URL — this branch keeps things from blowing
  // up in environments where neither is configured.
  return `/api/wallpapers/asset?key=${encodeURIComponent(args.key)}`;
}

/* Read the actual size of an object from R2. Used by /api/files/finalize
 * to verify the client-supplied sizeBytes against ground truth before
 * inserting the metadata row + counting against quota. Returns null if
 * the object doesn't exist (upload didn't actually happen). */
export async function r2ObjectSize(key: string): Promise<number | null> {
  try {
    const res = await r2().send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: key })
    );
    return res.ContentLength ?? null;
  } catch (err: unknown) {
    const code =
      (err as { name?: string; $metadata?: { httpStatusCode?: number } } | null)
        ?.name ??
      (err as { Code?: string } | null)?.Code ??
      "";
    const status = (err as { $metadata?: { httpStatusCode?: number } } | null)
      ?.$metadata?.httpStatusCode;
    if (code === "NotFound" || code === "NoSuchKey" || status === 404) {
      return null;
    }
    throw err;
  }
}
