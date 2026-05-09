import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

import type { ApiScope, ApiTokenRow } from "@/app/admin/_types";

/**
 * Programmatic API tokens.
 *
 *   * `mintToken` — creates a new row. Returns the raw token ONCE; we
 *     persist only the SHA-256 hash plus an 8-char prefix for UI.
 *   * `hashToken` — pure helper. Same hash function used at mint and
 *     validate time so the lookup matches.
 *   * `validateToken` — for any future middleware that wants to accept
 *     bearer tokens. Calls the `api_token_lookup` RPC, which already
 *     filters out expired/revoked rows. Updates `last_used_at` async
 *     so callers don't pay the round-trip.
 *
 * The auth-middleware integration is a v2-follow-up; this module is the
 * platform contract those middlewares will plug into.
 */

export interface MintTokenArgs {
  userId: string;
  workspaceId?: string | null;
  name: string;
  scopes: ApiScope[];
  expiresAt?: string | null;
}

export interface MintTokenResult {
  id: string;
  rawToken: string;
  row: ApiTokenRow;
}

export interface ValidateTokenResult {
  userId: string;
  workspaceId: string | null;
  scopes: string[];
  tokenId: string;
}

/** SHA-256 hex digest of the raw token string. Server-only. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Generate a fresh 32-byte token, persist its hash + prefix, return the
 * raw token to the caller exactly once. Throws on insert error.
 */
export async function mintToken(args: MintTokenArgs): Promise<MintTokenResult> {
  if (!args.userId) throw new Error("mintToken: userId required");
  if (!args.name?.trim()) throw new Error("mintToken: name required");

  const rawToken = randomBytes(32).toString("hex");
  const token_hash = hashToken(rawToken);
  const prefix = rawToken.slice(0, 8);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_tokens")
    .insert({
      user_id: args.userId,
      workspace_id: args.workspaceId ?? null,
      name: args.name.trim(),
      token_hash,
      prefix,
      scopes: args.scopes ?? [],
      expires_at: args.expiresAt ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "failed to mint token");
  }

  return {
    id: (data as ApiTokenRow).id,
    rawToken,
    row: data as ApiTokenRow,
  };
}

/**
 * Look up a token by its raw value. Returns null when the token is
 * unknown, expired, or revoked. Fires-and-forgets a `last_used_at`
 * update so the lookup itself stays cheap.
 *
 *   * `lastUsedIp` is optional; if present, recorded on the row.
 */
export async function validateToken(
  rawToken: string,
  opts: { lastUsedIp?: string | null } = {}
): Promise<ValidateTokenResult | null> {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("api_token_lookup", {
    p_token_hash: tokenHash,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  // Fire-and-forget last_used_at + last_used_ip. We don't await it so
  // the auth path stays fast; if the update fails the next request
  // simply re-tries it.
  void admin
    .from("api_tokens")
    .update({
      last_used_at: new Date().toISOString(),
      last_used_ip: opts.lastUsedIp ?? null,
    })
    .eq("id", (row as { token_id: string }).token_id);

  const r = row as {
    token_id: string;
    user_id: string;
    workspace_id: string | null;
    scopes: string[] | string;
  };
  const scopes = Array.isArray(r.scopes)
    ? r.scopes
    : (() => {
        try {
          return JSON.parse(typeof r.scopes === "string" ? r.scopes : "[]") as string[];
        } catch {
          return [];
        }
      })();

  return {
    tokenId: r.token_id,
    userId: r.user_id,
    workspaceId: r.workspace_id ?? null,
    scopes,
  };
}
