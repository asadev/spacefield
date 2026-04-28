import "server-only";

/**
 * Meta Graph API helpers for posting to the Space Field Facebook Page
 * and connected Instagram Business account.
 *
 * Auth: a Business Manager **System User token** that never expires.
 * Stored in env (`META_SYSTEM_USER_TOKEN`) — never hardcoded. The token
 * has the Page + IG account assigned through the Business Portfolio,
 * so it works directly against `/{page_id}/feed`, `/{page_id}/photos`,
 * `/{ig_id}/media`, etc.
 *
 * All exports lazy-read env so a missing var fails the request rather
 * than the module load (Next.js compiles server modules eagerly).
 */

const GRAPH_VERSION = "v22.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/* ──────────────────── env accessors ──────────────────── */

export function metaToken(): string {
  const t = process.env.META_SYSTEM_USER_TOKEN;
  if (!t) {
    throw new Error("META_SYSTEM_USER_TOKEN is not set");
  }
  return t;
}

export function metaPageId(): string {
  const id = process.env.META_PAGE_ID;
  if (!id) throw new Error("META_PAGE_ID is not set");
  return id;
}

export function metaInstagramId(): string {
  const id = process.env.META_INSTAGRAM_BUSINESS_ID;
  if (!id) throw new Error("META_INSTAGRAM_BUSINESS_ID is not set");
  return id;
}

/* Re-exported as constants for convenience at call sites that prefer
 * a value over a function. They throw on first access if env is unset. */
export const META_PAGE_ID = process.env.META_PAGE_ID ?? "";
export const META_INSTAGRAM_BUSINESS_ID =
  process.env.META_INSTAGRAM_BUSINESS_ID ?? "";

/* ──────────────────── shared fetch helpers ──────────────────── */

type GraphErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    fbtrace_id?: string;
  };
};

async function readGraphError(res: Response): Promise<string> {
  let detail = "";
  try {
    const json = (await res.json()) as GraphErrorPayload;
    detail = json?.error?.message ?? "";
  } catch {
    try {
      detail = await res.text();
    } catch {
      detail = "";
    }
  }
  return detail || `${res.status} ${res.statusText}`;
}

async function graphPost<T>(
  path: string,
  body: Record<string, string>
): Promise<T> {
  const params = new URLSearchParams(body);
  params.set("access_token", metaToken());
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    body: params,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`meta POST ${path} failed: ${await readGraphError(res)}`);
  }
  return (await res.json()) as T;
}

async function graphGet<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const search = new URLSearchParams(params);
  search.set("access_token", metaToken());
  const res = await fetch(`${GRAPH_BASE}${path}?${search.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`meta GET ${path} failed: ${await readGraphError(res)}`);
  }
  return (await res.json()) as T;
}

/* ──────────────────── Facebook Page ──────────────────── */

export type PostToPageInput = {
  message?: string;
  link?: string;
  image_url?: string;
};

export type PostToPageResult = {
  id: string;
  permalink_url?: string;
};

/**
 * Post to the Facebook Page. The Graph API has two distinct endpoints:
 *   - `/{page_id}/photos` when an image is attached (caption goes in
 *     `message`, image fetched from `url`).
 *   - `/{page_id}/feed`   for a text-only or text+link post.
 *
 * Returns Meta's `id` (post id) and the permalink URL when available.
 */
export async function postToPage(
  input: PostToPageInput
): Promise<PostToPageResult> {
  const pageId = metaPageId();
  const message = input.message ?? "";

  if (input.image_url) {
    // Photo upload — Meta fetches the URL server-side. The published
    // post id is in `post_id` (the `id` is the photo node).
    const result = await graphPost<{ id: string; post_id?: string }>(
      `/${pageId}/photos`,
      {
        url: input.image_url,
        caption: message,
        published: "true",
      }
    );
    const id = result.post_id ?? result.id;
    const permalink = await getPagePostPermalink(id).catch(() => undefined);
    return { id, permalink_url: permalink };
  }

  const body: Record<string, string> = { message };
  if (input.link) body.link = input.link;
  const result = await graphPost<{ id: string }>(`/${pageId}/feed`, body);
  const permalink = await getPagePostPermalink(result.id).catch(
    () => undefined
  );
  return { id: result.id, permalink_url: permalink };
}

async function getPagePostPermalink(postId: string): Promise<string | undefined> {
  const res = await graphGet<{ permalink_url?: string }>(`/${postId}`, {
    fields: "permalink_url",
  });
  return res.permalink_url;
}

/* ──────────────────── Instagram Business ──────────────────── */

export type PostToInstagramInput = {
  caption: string;
  /** Must be a publicly accessible HTTPS URL (R2 public URL works). */
  image_url: string;
};

export type PostToInstagramResult = {
  /** The published media id. */
  id: string;
  permalink_url?: string;
};

/**
 * Two-step IG publish:
 *   1. POST `/{ig_id}/media` with `image_url + caption` → container id.
 *   2. POST `/{ig_id}/media_publish` with `creation_id` → media id.
 *
 * IG REQUIRES a public image URL — Meta fetches it server-side.
 */
export async function postToInstagram(
  input: PostToInstagramInput
): Promise<PostToInstagramResult> {
  const igId = metaInstagramId();

  const container = await graphPost<{ id: string }>(`/${igId}/media`, {
    image_url: input.image_url,
    caption: input.caption,
  });

  const published = await graphPost<{ id: string }>(`/${igId}/media_publish`, {
    creation_id: container.id,
  });

  const permalink = await getInstagramPermalink(published.id).catch(
    () => undefined
  );
  return { id: published.id, permalink_url: permalink };
}

async function getInstagramPermalink(
  mediaId: string
): Promise<string | undefined> {
  const res = await graphGet<{ permalink?: string }>(`/${mediaId}`, {
    fields: "permalink",
  });
  return res.permalink;
}

/* ──────────────────── Insights ──────────────────── */

export type PostInsights = {
  likes: number;
  comments: number;
  reach: number;
  impressions: number;
};

type FbInsightsPayload = {
  likes?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  insights?: {
    data?: Array<{
      name: string;
      values?: Array<{ value: number }>;
    }>;
  };
};

type IgInsightsPayload = {
  like_count?: number;
  comments_count?: number;
  insights?: {
    data?: Array<{
      name: string;
      values?: Array<{ value: number }>;
    }>;
  };
};

function readMetric(
  blocks: Array<{ name: string; values?: Array<{ value: number }> }> | undefined,
  name: string
): number {
  if (!blocks) return 0;
  const m = blocks.find((b) => b.name === name);
  const v = m?.values?.[0]?.value;
  return typeof v === "number" ? v : 0;
}

/**
 * Fetch the small slice of insights we render on the admin row.
 * Channel-specific because FB and IG expose different metric sets.
 */
export async function getPostInsights(
  metaPostId: string,
  channel: "facebook" | "instagram"
): Promise<PostInsights> {
  if (channel === "facebook") {
    // Use summaries for likes/comments (cheap), insights edge for reach
    // and impressions. `post_impressions` is the canonical reach proxy
    // on Page posts; we also pull `post_impressions_unique` as `reach`.
    const data = await graphGet<FbInsightsPayload>(`/${metaPostId}`, {
      fields:
        "likes.summary(true).limit(0),comments.summary(true).limit(0),insights.metric(post_impressions,post_impressions_unique)",
    });
    return {
      likes: data.likes?.summary?.total_count ?? 0,
      comments: data.comments?.summary?.total_count ?? 0,
      reach: readMetric(data.insights?.data, "post_impressions_unique"),
      impressions: readMetric(data.insights?.data, "post_impressions"),
    };
  }

  // Instagram. Reach + impressions live on the media insights edge.
  const data = await graphGet<IgInsightsPayload>(`/${metaPostId}`, {
    fields: "like_count,comments_count,insights.metric(reach,impressions)",
  });
  return {
    likes: data.like_count ?? 0,
    comments: data.comments_count ?? 0,
    reach: readMetric(data.insights?.data, "reach"),
    impressions: readMetric(data.insights?.data, "impressions"),
  };
}
