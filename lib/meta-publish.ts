import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { postToInstagram, postToPage } from "@/lib/meta";
import { presignedDownloadUrl } from "@/lib/r2";

/**
 * Shared "claim a row → call Meta → write the result back" helper used
 * by both the manual /api/admin/social/publish route and the cron at
 * /api/cron/social-publish. Splitting it out of the route handler keeps
 * Next.js happy (route files can only export HTTP handlers + a few
 * config consts) and lets the cron loop over rows without re-doing the
 * admin auth dance.
 */

export type SocialChannel = "facebook" | "instagram";
export type SocialStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export type SocialPostRow = {
  id: string;
  channel: SocialChannel;
  status: SocialStatus;
  body: string;
  attachment_ids: string[];
  link_url: string | null;
  scheduled_at: string | null;
  meta_post_id: string | null;
  meta_permalink: string | null;
  insights: Record<string, unknown>;
  insights_at: string | null;
  failure_reason: string | null;
  created_by: string;
  created_at: string;
  published_at: string | null;
};

export type PublishOutcome =
  | { ok: true; post: SocialPostRow }
  | { ok: false; error: string; post?: SocialPostRow };

export async function publishSocialPost(id: string): Promise<PublishOutcome> {
  const admin = createAdminClient();

  // 1. Atomic status claim — only succeeds for rows currently in a
  //    publishable state. Concurrent presses (manual + cron) cannot
  //    both win because the second UPDATE matches zero rows.
  const { data: claimed, error: claimErr } = await admin
    .from("social_posts")
    .update({ status: "publishing", failure_reason: null })
    .eq("id", id)
    .in("status", ["draft", "scheduled", "failed"])
    .select("*");
  if (claimErr) {
    return { ok: false, error: claimErr.message };
  }
  if (!claimed || claimed.length === 0) {
    const { data: current } = await admin
      .from("social_posts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!current) return { ok: false, error: "post_not_found" };
    const row = current as SocialPostRow;
    if (row.status === "published") return { ok: true, post: row };
    return { ok: false, error: `post is ${row.status}`, post: row };
  }
  const row = claimed[0] as SocialPostRow;

  try {
    const imageUrls = await resolveAttachmentUrls(row.attachment_ids);

    let metaPostId: string;
    let permalink: string | undefined;
    if (row.channel === "facebook") {
      const r = await postToPage({
        message: row.body,
        link: row.link_url ?? undefined,
        // FB carousels need a different endpoint shape; v1 sends only
        // the first image. Multi-image FB is a follow-up.
        image_url: imageUrls[0],
      });
      metaPostId = r.id;
      permalink = r.permalink_url;
    } else {
      if (imageUrls.length === 0) {
        throw new Error("instagram posts require an image attachment");
      }
      const r = await postToInstagram({
        caption: row.body,
        image_url: imageUrls[0],
      });
      metaPostId = r.id;
      permalink = r.permalink_url;
    }

    const { data: updated, error: upErr } = await admin
      .from("social_posts")
      .update({
        status: "published",
        meta_post_id: metaPostId,
        meta_permalink: permalink ?? null,
        published_at: new Date().toISOString(),
        failure_reason: null,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (upErr || !updated) {
      // Meta accepted but DB update failed — surface the meta id in
      // the error message so the admin can recover state.
      return {
        ok: false,
        error: `published to meta (${metaPostId}) but db update failed: ${
          upErr?.message ?? "unknown"
        }`,
      };
    }
    return { ok: true, post: updated as SocialPostRow };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const { data: failed } = await admin
      .from("social_posts")
      .update({ status: "failed", failure_reason: reason })
      .eq("id", id)
      .select("*")
      .single();
    return {
      ok: false,
      error: reason,
      post: (failed as SocialPostRow | null) ?? undefined,
    };
  }
}

/* Resolve attachment file ids → URLs Meta can fetch server-side. */
async function resolveAttachmentUrls(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workspace_files")
    .select("id, r2_key, name")
    .in("id", ids);
  if (error) {
    throw new Error(`could not load attachments: ${error.message}`);
  }
  const rows = (data ?? []) as Array<{
    id: string;
    r2_key: string;
    name: string;
  }>;

  // Preserve caller-specified order.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is { id: string; r2_key: string; name: string } => Boolean(r));

  const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/+$/, "");
  if (publicBase) {
    return ordered.map((r) => `${publicBase}/${r.r2_key}`);
  }
  // Fallback: 1-hour presigned URL. Meta only needs to fetch once
  // during the single publish call.
  return Promise.all(
    ordered.map((r) =>
      presignedDownloadUrl({
        key: r.r2_key,
        fileName: r.name,
        expiresInSeconds: 60 * 60,
      })
    )
  );
}
