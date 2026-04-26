// Referral system — server-side helpers.
// All writes go through a server-rendered Supabase client so RLS still
// applies (the policies are scoped to auth.uid()).
//
// Note: no file-level "use server" — that directive is reserved for Server
// Actions exposed to the client. This file exports constants + helpers and is
// consumed exclusively from other server code (route handlers + action files
// that carry their own "use server" boundary).

import "server-only";

import { createClient } from "@/lib/supabase/server";

// 8-char uppercase alphanumeric. Ambiguous chars (0/O/1/I) dropped so the code
// survives a phone call without asking "is that a zero or an O?".
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

// Pro threshold — how many CONVERTED referrals unlock is_pro.
export const PRO_THRESHOLD = 3;

// XP awarded when an invitee converts (completes their profile).
export const REFERRAL_XP_INVITER = 100;
export const REFERRAL_XP_INVITEE = 50;

function generateCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

// ─── getOrCreateCode ──────────────────────────────────────────────────────
// Returns the user's referral code, generating it on first call. Safe to call
// repeatedly — idempotent. Retries on the (astronomically rare) unique-code
// collision.
export async function getOrCreateCode(userId: string): Promise<string | null> {
  const supabase = await createClient();

  // Fast path — already exists.
  const { data: existing } = await supabase
    .from("referral_codes")
    .select("code")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.code) return existing.code;

  // Generate + insert. Retry on collision up to 5 times.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { error } = await supabase
      .from("referral_codes")
      .insert({ user_id: userId, code });

    if (!error) return code;

    // 23505 = unique_violation (either user_id or code). Re-check user_id:
    // if the user-code pair was created concurrently by another request we
    // want to return it.
    if (error.code === "23505") {
      const { data: racing } = await supabase
        .from("referral_codes")
        .select("code")
        .eq("user_id", userId)
        .maybeSingle();
      if (racing?.code) return racing.code;
      // else it was a code collision — try again.
      continue;
    }

    // Unknown error — bail.
    return null;
  }

  return null;
}

// ─── recordReferralSignup ─────────────────────────────────────────────────
// Called from the sign-up flow (after the invitee's auth.users row exists)
// when the URL contained ?ref=CODE. Looks up the inviter via the code and
// writes the referrals row. No-op if the invitee is already referred, or if
// the code is unknown, or if the invitee would be referring themselves.
export async function recordReferralSignup(
  inviteeId: string,
  code: string
): Promise<{ ok: boolean; reason?: string }> {
  if (!code) return { ok: false, reason: "no_code" };
  const supabase = await createClient();

  const normalized = code.trim().toUpperCase();

  const { data: inviter } = await supabase
    .from("referral_codes")
    .select("user_id")
    .eq("code", normalized)
    .maybeSingle();

  if (!inviter?.user_id) return { ok: false, reason: "unknown_code" };
  if (inviter.user_id === inviteeId) return { ok: false, reason: "self_referral" };

  // Idempotent — unique constraint on invitee_id means we can insert blindly
  // and treat 23505 as success.
  const { error } = await supabase.from("referrals").insert({
    inviter_id: inviter.user_id,
    invitee_id: inviteeId,
    code: normalized,
  });

  if (error && error.code !== "23505") {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

// ─── markConverted ────────────────────────────────────────────────────────
// Called the first time the invitee's profile crosses the "complete" bar
// (see app/dashboard/profile). Sets converted_at, awards XP to both sides,
// and flips is_pro on the inviter if they cross PRO_THRESHOLD.
export async function markConverted(inviteeId: string): Promise<{
  ok: boolean;
  converted?: boolean;
  inviterPromoted?: boolean;
}> {
  const supabase = await createClient();

  // Look up the row. If it's already converted or doesn't exist, bail.
  const { data: row } = await supabase
    .from("referrals")
    .select("id, inviter_id, converted_at")
    .eq("invitee_id", inviteeId)
    .maybeSingle();

  if (!row) return { ok: true, converted: false };
  if (row.converted_at) return { ok: true, converted: false };

  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("referrals")
    .update({ converted_at: now })
    .eq("id", row.id);

  if (updateErr) return { ok: false };

  // Award XP to both sides. We write xp_events directly (same pattern as
  // lib/xp-actions.ts) and bump the profiles.total_xp counter.
  await awardReferralXP(row.inviter_id, REFERRAL_XP_INVITER, "referral_converted", row.id);
  await awardReferralXP(inviteeId, REFERRAL_XP_INVITEE, "referral_joined", row.id);

  // Count converted referrals for the inviter. If >= threshold, flip is_pro.
  const { count } = await supabase
    .from("referrals")
    .select("*", { count: "exact", head: true })
    .eq("inviter_id", row.inviter_id)
    .not("converted_at", "is", null);

  let inviterPromoted = false;
  if ((count || 0) >= PRO_THRESHOLD) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_pro")
      .eq("id", row.inviter_id)
      .maybeSingle();

    if (!profile?.is_pro) {
      await supabase
        .from("profiles")
        .update({ is_pro: true, pro_unlocked_at: now })
        .eq("id", row.inviter_id);
      inviterPromoted = true;
    }
  }

  return { ok: true, converted: true, inviterPromoted };
}

async function awardReferralXP(
  userId: string,
  xp: number,
  action: string,
  sourceId: string
) {
  const supabase = await createClient();

  await supabase.from("xp_events").insert({
    user_id: userId,
    action,
    xp,
    source_type: "referral",
    source_id: sourceId,
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("total_xp")
    .eq("id", userId)
    .maybeSingle();

  const newTotal = (profile?.total_xp || 0) + xp;
  await supabase
    .from("profiles")
    .update({ total_xp: newTotal })
    .eq("id", userId);
}

// ─── getUserReferralStats ─────────────────────────────────────────────────
export interface ReferralStats {
  code: string | null;
  totalInvites: number;
  converted: number;
  pending: number;
  xpEarned: number;
  isPro: boolean;
  threshold: number;
  recent: Array<{ created_at: string; converted_at: string | null }>;
}

export async function getUserReferralStats(userId: string): Promise<ReferralStats> {
  const supabase = await createClient();

  const [codeRow, refs, profile, xpRows] = await Promise.all([
    supabase.from("referral_codes").select("code").eq("user_id", userId).maybeSingle(),
    supabase
      .from("referrals")
      .select("created_at, converted_at")
      .eq("inviter_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("profiles").select("is_pro").eq("id", userId).maybeSingle(),
    supabase
      .from("xp_events")
      .select("xp")
      .eq("user_id", userId)
      .eq("source_type", "referral"),
  ]);

  const list = refs.data || [];
  const converted = list.filter((r) => r.converted_at).length;
  const xpEarned = (xpRows.data || []).reduce((sum, r) => sum + (r.xp || 0), 0);

  return {
    code: codeRow.data?.code || null,
    totalInvites: list.length,
    converted,
    pending: list.length - converted,
    xpEarned,
    isPro: !!profile.data?.is_pro,
    threshold: PRO_THRESHOLD,
    recent: list,
  };
}
