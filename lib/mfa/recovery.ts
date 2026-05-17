import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/* lib/mfa/recovery.ts — Issue and verify MFA recovery codes.
 *
 * Threat model: codes are 50-bit single-use tokens shown to the user
 * exactly once at generation time and never persisted plaintext on the
 * server. We hash with SHA-256 over a server-side pepper, which is
 * sufficient for the entropy in play (an attacker brute-forcing the
 * hash would still need ~2^49 attempts and would have to enumerate
 * codes that belong to a specific user_id, which their leaked DB row
 * would point them at). bcrypt isn't worth the per-row cost given the
 * entropy floor — we'd want it for low-entropy passwords, not
 * 10-character base32 strings.
 *
 * Lifecycle:
 *   - `regenerateRecoveryCodes(userId)`  → delete all un-used rows for
 *     the user, insert N fresh ones, return plaintext for one-time
 *     display. Called from /account/security and after TOTP enrollment.
 *   - `consumeRecoveryCode(userId, plain)` → look up by hash via the
 *     `consume_mfa_recovery_code` RPC, which atomically marks it used.
 *   - `countRemainingCodes(userId)`      → for the UI badge.
 */

const DEFAULT_BATCH = 8;
// 31-char base32 alphabet (Crockford-style, no I/L/O/U/0/1 confusables).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export interface RegenerateResult {
  codes: string[];
}

export async function regenerateRecoveryCodes(
  userId: string,
  count = DEFAULT_BATCH,
): Promise<RegenerateResult> {
  if (!userId) throw new Error("regenerateRecoveryCodes: userId required");
  const supabase = createAdminClient();

  // Invalidate the previous batch — security property: a leaked code
  // can't survive a regeneration event.
  const { error: delErr } = await supabase
    .from("mfa_recovery_codes")
    .delete()
    .eq("user_id", userId)
    .is("used_at", null);
  if (delErr) throw new Error(`recovery: failed to clear old codes: ${delErr.message}`);

  const codes: string[] = [];
  const rows: { user_id: string; code_hash: string }[] = [];
  for (let i = 0; i < count; i++) {
    const plain = randomCode();
    codes.push(plain);
    rows.push({ user_id: userId, code_hash: await hashRecoveryCode(plain) });
  }
  const { error: insErr } = await supabase.from("mfa_recovery_codes").insert(rows);
  if (insErr) throw new Error(`recovery: failed to insert new codes: ${insErr.message}`);

  return { codes };
}

/** Verify a user-supplied recovery code. Returns true on first valid
 *  consumption, false otherwise. Uses the `consume_mfa_recovery_code`
 *  RPC so the atomic mark-used happens server-side. */
export async function consumeRecoveryCode(
  plain: string,
  ipHash?: string | null,
): Promise<boolean> {
  const normalized = normalizeUserInput(plain);
  if (!normalized) return false;
  const hash = await hashRecoveryCode(normalized);

  // We rely on the caller's authed session to scope auth.uid() inside
  // the RPC, so we use the server (cookie-bound) client, not admin.
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("consume_mfa_recovery_code", {
    p_code_hash: hash,
    p_ip_hash: ipHash ?? null,
  });
  if (error) return false;
  return Boolean(data);
}

export async function countRemainingCodes(userId: string): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("mfa_recovery_codes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("used_at", null);
  if (error) return 0;
  return count ?? 0;
}

/* ============================================================
 * Internals
 * ============================================================ */

function randomCode(): string {
  // 10 chars from ALPHABET, then dash in the middle: XXXXX-XXXXX.
  // crypto.getRandomValues is available in modern Node (>=18) without
  // explicit import. We rejection-sample so the modulo bias is zero —
  // 256 % 31 = 8, so the cleanest cutoff is 248 (8 * 31).
  const buf = new Uint8Array(32);
  const out: string[] = [];
  while (out.length < 10) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < 10; i++) {
      const b = buf[i]!;
      if (b < 248) out.push(ALPHABET[b % ALPHABET.length]!);
    }
  }
  return out.slice(0, 5).join("") + "-" + out.slice(5, 10).join("");
}

function normalizeUserInput(s: string): string {
  // Strip whitespace + dashes, uppercase. Lets users paste with or
  // without the dash without us having to be picky in the UI.
  const cleaned = s.replace(/[\s-]/g, "").toUpperCase();
  if (cleaned.length !== 10) return "";
  // Reject characters not in the alphabet — anything else is a typo.
  for (const ch of cleaned) {
    if (!ALPHABET.includes(ch)) return "";
  }
  return cleaned.slice(0, 5) + "-" + cleaned.slice(5);
}

async function hashRecoveryCode(plain: string): Promise<string> {
  const pepper = process.env.MFA_RECOVERY_PEPPER ?? "spacefield-mfa-pepper-v1";
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(pepper + plain));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
