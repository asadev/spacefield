"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import { mintToken } from "@/lib/api-tokens";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";

import { API_SCOPES, type ApiScope } from "../_types";

/**
 * Server actions for `/admin/api-tokens`.
 *
 *   * `mintTokenAction` — creates the row, then stashes the raw token in
 *     a single-use cookie so the index page can flash it once. Cookie is
 *     httpOnly + 5-minute lifetime so a refresh re-shows it but a new
 *     navigation past that window doesn't.
 *   * `revokeTokenAction` — sets `revoked_at = now()`. Idempotent.
 *
 * Both actions audit. Both call `assertAdmin()` first.
 */

const SCOPE_SET = new Set<string>(API_SCOPES);

const FLASH_COOKIE = "sf_admin_token_flash";

function parseScopes(formData: FormData): ApiScope[] {
  // Multi-checkboxes come through as repeated `scopes` entries.
  const out: ApiScope[] = [];
  for (const v of formData.getAll("scopes")) {
    const s = String(v);
    if (SCOPE_SET.has(s)) out.push(s as ApiScope);
  }
  return out;
}

function parseExpiresAt(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // <input type="date"> sends YYYY-MM-DD. Promote to end-of-day UTC so
  // a token "valid through May 30" actually works May 30 in any TZ.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T23:59:59.999Z`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/* ────────────────────── mintTokenAction ────────────────────── */

export async function mintTokenAction(formData: FormData): Promise<void> {
  await assertAdmin();

  const userId = String(formData.get("user_id") ?? "").trim();
  const workspaceRaw = String(formData.get("workspace_id") ?? "").trim();
  const workspaceId = workspaceRaw && workspaceRaw !== "_global"
    ? workspaceRaw
    : null;
  const name = String(formData.get("name") ?? "").trim();
  const scopes = parseScopes(formData);
  const expiresAt = parseExpiresAt(formData.get("expires_at"));

  if (!userId) throw new Error("missing user");
  if (!name) throw new Error("missing name");

  const minted = await mintToken({
    userId,
    workspaceId,
    name,
    scopes,
    expiresAt,
  });

  await recordAdminAction({
    action: "api_token.mint",
    targetType: "api_token",
    targetId: minted.id,
    after: {
      id: minted.id,
      user_id: minted.row.user_id,
      workspace_id: minted.row.workspace_id,
      name: minted.row.name,
      prefix: minted.row.prefix,
      scopes: minted.row.scopes,
      expires_at: minted.row.expires_at,
    },
  });

  // Single-shot cookie carries the raw token to the index page so we
  // can render the "save now — won't be shown again" panel. httpOnly
  // keeps it server-side; the index reads + clears it on first hit.
  const jar = await cookies();
  jar.set(FLASH_COOKIE, JSON.stringify({ id: minted.id, raw: minted.rawToken }), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 60 * 5, // 5 minutes
    path: "/admin/api-tokens",
  });

  revalidatePath("/admin/api-tokens");
  redirect(`/admin/api-tokens?just_minted=${encodeURIComponent(minted.id)}`);
}

/* ────────────────────── revokeTokenAction ────────────────────── */

export async function revokeTokenAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("api_tokens")
    .select("id, user_id, workspace_id, name, prefix, revoked_at")
    .eq("id", id)
    .maybeSingle();

  // Idempotent: if already revoked, just no-op the update but still audit
  // the click — useful for "Asad clicked revoke twice" forensics.
  const { error } = await admin
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null);

  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "api_token.revoke",
    targetType: "api_token",
    targetId: id,
    before,
    after: { id, revoked_at: "now()" },
  });

  revalidatePath("/admin/api-tokens");
}
