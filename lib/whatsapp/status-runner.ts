import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { getEvolutionClient } from "./client";
import { nextSendDelayMs, flagSoftBan, looksLikeSoftBan } from "./throttle";
import type { WhatsAppInstanceRow } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Scheduled WhatsApp Status runtime (Wave 5, EPIC-18). The send-runner cron
 * claims due scheduled status posts (claim_due_status_posts RPC) and this posts
 * each via Evolution sendStatus, applying the same anti-ban inter-message delay
 * (nextSendDelayMs) used by broadcasts. Status is not a 1:1 message so it is
 * NOT written to whatsapp_messages, but it still respects the throttle pacing
 * and trips the soft-ban on a block signal.
 */

export interface StatusPost {
  id: string;
  workspace_id: string;
  instance_id: string;
  kind: string; // 'text' | 'image' | 'video'
  caption: string | null;
  text_content: string | null;
  media_url: string | null;
  background_color: string | null;
  font: number | null;
}

export async function claimDueStatusPosts(
  admin: Admin,
  limit = 10,
): Promise<StatusPost[]> {
  const { data, error } = await admin.rpc("claim_due_status_posts", {
    max_rows: limit,
  });
  if (error) throw new Error(`claim_due_status_posts: ${error.message}`);
  return (data ?? []) as StatusPost[];
}

export async function processStatusPost(
  admin: Admin,
  post: StatusPost,
): Promise<"sent" | "failed"> {
  try {
    const { data: instRow } = await admin
      .from("whatsapp_instances")
      .select("*")
      .eq("id", post.instance_id)
      .maybeSingle();
    if (!instRow || (instRow as WhatsAppInstanceRow).status !== "connected") {
      await admin
        .from("whatsapp_status_posts")
        .update({
          status: "failed",
          last_error: "instance_not_connected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);
      return "failed";
    }
    const inst = instRow as WhatsAppInstanceRow;

    // Pace like a broadcast send (anti-ban).
    const delayMs = Math.min(await nextSendDelayMs(inst.id), 8000);
    await new Promise((r) => setTimeout(r, delayMs));

    const type = (["image", "video"].includes(post.kind) ? post.kind : "text") as
      | "text"
      | "image"
      | "video";
    const content = type === "text" ? post.text_content ?? "" : post.media_url ?? "";
    if (!content) {
      await admin
        .from("whatsapp_status_posts")
        .update({ status: "failed", last_error: "no_content", updated_at: new Date().toISOString() })
        .eq("id", post.id);
      return "failed";
    }

    const client = getEvolutionClient();
    await client.sendStatus(inst.evolution_instance_name, {
      type,
      content,
      caption: post.caption ?? undefined,
      backgroundColor: post.background_color ?? undefined,
      font: post.font ?? undefined,
    });

    await admin
      .from("whatsapp_status_posts")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", post.id);
    return "sent";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (looksLikeSoftBan(msg)) {
      await flagSoftBan(post.instance_id, `status post: ${msg}`);
    }
    await admin
      .from("whatsapp_status_posts")
      .update({ status: "failed", last_error: msg.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", post.id);
    return "failed";
  }
}

/** Drain due status posts in one tick (called by the send-runner cron). */
export async function runDueStatusPosts(
  admin: Admin,
  limit = 5,
): Promise<{ sent: number; failed: number }> {
  const posts = await claimDueStatusPosts(admin, limit);
  let sent = 0;
  let failed = 0;
  for (const p of posts) {
    const r = await processStatusPost(admin, p);
    if (r === "sent") sent++;
    else failed++;
  }
  return { sent, failed };
}
