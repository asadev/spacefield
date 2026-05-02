"use server";

/* ─────────────────────────────────────────────────────────────────────────
 * toShare server actions — every tool calls mintLink() to publish content
 * at toshare.net/<type>/<slug>. Resolution + analytics live here too.
 * ───────────────────────────────────────────────────────────────────── */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import {
  type ToShareType,
  type ToShareLinkRow,
  type ToShareLinkPayload,
  buildToShareUrl,
  TOSHARE_TYPES,
} from "./types";

// ─── mint ───────────────────────────────────────────────────────────────

export interface MintLinkInput {
  type: ToShareType;
  payload: Record<string, unknown>;
  workspaceId?: string;          // null → personal/private link
  sourceTool?: string;           // e.g. 'crm-form-builder', 'property-poster'
  customSlug?: string;           // paid-tier vanity slug
  customSubdomain?: string;      // paid-tier custom subdomain
  expiresAt?: Date;
}

export interface MintLinkResult {
  ok: boolean;
  link?: ToShareLinkRow;
  url?: string;
  error?: string;
}

export async function mintLink(input: MintLinkInput): Promise<MintLinkResult> {
  if (!TOSHARE_TYPES.includes(input.type)) {
    return { ok: false, error: `invalid type: ${input.type}` };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, error: "not signed in" };
  }

  // If a workspace is set, pull in defaults: subdomain + brand logo +
  // brand color. The link payload only overrides these if it explicitly
  // sets them.
  let resolvedSubdomain = input.customSubdomain ?? null;
  let mergedPayload = input.payload;
  if (input.workspaceId) {
    const { data: ws } = await supabase
      .from("workspaces")
      .select("toshare_subdomain, toshare_brand_color, avatar_url")
      .eq("id", input.workspaceId)
      .maybeSingle();
    if (ws) {
      if (!resolvedSubdomain && ws.toshare_subdomain) {
        resolvedSubdomain = ws.toshare_subdomain as string;
      }
      const payloadCopy = { ...input.payload };
      // Only fill-in defaults if the payload doesn't already have them
      if (!payloadCopy.brandColor && ws.toshare_brand_color) {
        payloadCopy.brandColor = ws.toshare_brand_color;
      }
      if (!payloadCopy.brandLogo && ws.avatar_url) {
        payloadCopy.brandLogo = ws.avatar_url;
      }
      mergedPayload = payloadCopy;
    }
  }

  const { data, error } = await supabase.rpc("toshare_mint", {
    p_workspace_id: input.workspaceId ?? null,
    p_owner_user_id: userData.user.id,
    p_type: input.type,
    p_payload: mergedPayload,
    p_source_tool: input.sourceTool ?? null,
    p_custom_slug: input.customSlug ?? null,
    p_custom_subdomain: resolvedSubdomain,
    p_expires_at: input.expiresAt?.toISOString() ?? null,
  });

  if (error || !data) {
    return { ok: false, error: error?.message ?? "mint failed" };
  }

  const row = data as ToShareLinkRow;
  revalidatePath("/tools");
  return {
    ok: true,
    link: row,
    url: buildToShareUrl(row),
  };
}

// ─── resolve (called from public viewer) ────────────────────────────────
//
// IMPORTANT: must use the admin client (service-role) because:
//   1. Public toshare.net visitors are NOT signed in to Spacefield, so
//      they hit the RLS SELECT policy as the `anon` role.
//   2. The SELECT policy on toshare_links restricts reads to owner +
//      workspace members — anon would always get 0 rows.
//   3. Page server-components decide which fields to send to the browser
//      (e.g. they never expose webhookUrl / notifyEmail), so using
//      service-role here is safe.

export async function resolveLink(slug: string, subdomain: string | null): Promise<ToShareLinkRow | null> {
  const admin = createAdminClient();
  const query = admin
    .from("toshare_links")
    .select("*")
    .eq("slug", slug)
    .eq("status", "active")
    .limit(1);

  const { data, error } = subdomain
    ? await query.eq("custom_subdomain", subdomain)
    : await query.is("custom_subdomain", null);

  if (error || !data || data.length === 0) return null;
  const row = data[0] as ToShareLinkRow;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
  return row;
}

export async function getLinkById(linkId: string): Promise<ToShareLinkRow | null> {
  // Same reasoning as resolveLink — public submit/accept/book API routes
  // call this for anonymous visitors.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("toshare_links")
    .select("*")
    .eq("id", linkId)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0] as ToShareLinkRow;
}

// ─── view / submit recording ────────────────────────────────────────────

export async function recordView(input: {
  slug: string;
  subdomain: string | null;
  ipHash?: string;
  uaHash?: string;
  referrer?: string;
}): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("toshare_record_view", {
      p_slug: input.slug,
      p_subdomain: input.subdomain,
      p_ip_hash: input.ipHash ?? null,
      p_ua_hash: input.uaHash ?? null,
      p_referrer: input.referrer ?? null,
    });
    return (data as string | null) ?? null;
  } catch {
    return null;
  }
}

export async function recordSubmit(input: {
  linkId: string;
  payload: Record<string, unknown>;
  ipHash?: string;
  uaHash?: string;
}): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient();
    await supabase.rpc("toshare_record_submit", {
      p_link_id: input.linkId,
      p_payload: input.payload,
      p_ip_hash: input.ipHash ?? null,
      p_ua_hash: input.uaHash ?? null,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ─── workspace link list (for management UI) ────────────────────────────

export async function listWorkspaceLinks(workspaceId: string): Promise<ToShareLinkRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("toshare_links")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return data as ToShareLinkRow[];
}

export async function listMyLinks(): Promise<ToShareLinkRow[]> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data, error } = await supabase
    .from("toshare_links")
    .select("*")
    .eq("owner_user_id", userData.user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return data as ToShareLinkRow[];
}

export async function pauseLink(linkId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("toshare_links")
    .update({ status: "paused", updated_at: new Date().toISOString() })
    .eq("id", linkId);
  return { ok: !error };
}

export async function resumeLink(linkId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("toshare_links")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", linkId);
  return { ok: !error };
}

export async function deleteLink(linkId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.from("toshare_links").delete().eq("id", linkId);
  return { ok: !error };
}
