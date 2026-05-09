import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { IpRuleRow } from "@/app/admin/_types";

/**
 * IP allow/block list. Admin-managed rules live in `public.ip_rules`.
 *
 * `evaluateIp` answers three things:
 *   - `allow` → IP is on an allow rule, request should bypass other limits
 *   - `block` → IP is on a block rule, request must be denied
 *   - `pass`  → no matching rule, fall through to normal logic
 *
 * Allow takes precedence over block when both match (operator wants
 * allow-listed addresses to skip rate-limit pain). Cached for 60s.
 */

type Cache = { rules: IpRuleRow[]; expiresAt: number };
let cache: Cache | null = null;
const TTL_MS = 60_000;

async function loadRules(): Promise<IpRuleRow[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.rules;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ip_rules")
      .select("*")
      .eq("enabled", true);
    if (error) {
      cache = { rules: [], expiresAt: now + TTL_MS };
      return [];
    }
    const all = (data ?? []) as IpRuleRow[];
    const filtered = all.filter((r) => {
      if (!r.expires_at) return true;
      return new Date(r.expires_at).getTime() > now;
    });
    cache = { rules: filtered, expiresAt: now + TTL_MS };
    return filtered;
  } catch {
    return [];
  }
}

export interface IpEvalResult {
  action: "allow" | "block" | "pass";
  rule_id?: string;
  reason?: string;
}

/**
 * Evaluate an IP against the rule set.
 */
export async function evaluateIp(ip: string): Promise<IpEvalResult> {
  if (!ip || ip === "unknown") return { action: "pass" };
  const rules = await loadRules();
  if (rules.length === 0) return { action: "pass" };

  // Allow rules win over block rules. Walk twice for clarity.
  const allows = rules.filter((r) => r.action === "allow");
  for (const rule of allows) {
    if (matchCidr(ip, rule.cidr)) {
      return {
        action: "allow",
        rule_id: rule.id,
        reason: rule.reason ?? undefined,
      };
    }
  }
  const blocks = rules.filter((r) => r.action === "block");
  for (const rule of blocks) {
    if (matchCidr(ip, rule.cidr)) {
      return {
        action: "block",
        rule_id: rule.id,
        reason: rule.reason ?? undefined,
      };
    }
  }
  return { action: "pass" };
}

/**
 * CIDR match for IPv4 + IPv6. Plain-IP rules (no `/`) are matched as
 * exact equality after normalising. Returns false on parse failure.
 */
export function matchCidr(ip: string, cidr: string): boolean {
  if (!ip || !cidr) return false;
  const trimmedIp = ip.trim();
  const trimmedCidr = cidr.trim();

  if (!trimmedCidr.includes("/")) {
    // Plain IP comparison.
    return normaliseIp(trimmedIp) === normaliseIp(trimmedCidr);
  }
  const [base, bitsRaw] = trimmedCidr.split("/");
  const bits = Number(bitsRaw);
  if (!Number.isFinite(bits) || bits < 0) return false;

  const isV4Ip = trimmedIp.includes(".") && !trimmedIp.includes(":");
  const isV4Net = base.includes(".") && !base.includes(":");
  if (isV4Ip !== isV4Net) return false;

  if (isV4Ip) {
    if (bits > 32) return false;
    const a = ipv4ToInt(trimmedIp);
    const b = ipv4ToInt(base);
    if (a === null || b === null) return false;
    if (bits === 0) return true;
    const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
    return (a & mask) === (b & mask);
  }

  // IPv6
  if (bits > 128) return false;
  const aBytes = ipv6ToBytes(trimmedIp);
  const bBytes = ipv6ToBytes(base);
  if (!aBytes || !bBytes) return false;
  return bytesShareTopBits(aBytes, bBytes, bits);
}

function normaliseIp(ip: string): string {
  if (ip.includes(":")) {
    const bytes = ipv6ToBytes(ip);
    if (!bytes) return ip.toLowerCase();
    return bytesToIpv6(bytes);
  }
  const n = ipv4ToInt(ip);
  if (n === null) return ip;
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join(".");
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = Number(p);
    if (n < 0 || n > 255) return null;
    out = (out << 8) | n;
  }
  return out >>> 0;
}

function ipv6ToBytes(ip: string): Uint8Array | null {
  // Strip optional zone id.
  const cleaned = ip.split("%")[0];
  // Split around "::" if present.
  let head: string[] = [];
  let tail: string[] = [];
  if (cleaned.includes("::")) {
    const [h, t] = cleaned.split("::");
    head = h ? h.split(":") : [];
    tail = t ? t.split(":") : [];
  } else {
    head = cleaned.split(":");
  }
  // The last group can be IPv4-mapped (e.g. ::ffff:1.2.3.4).
  const lastGroups = tail.length > 0 ? tail : head;
  const lastIdx = lastGroups.length - 1;
  if (lastIdx >= 0 && lastGroups[lastIdx]?.includes(".")) {
    const v4 = lastGroups[lastIdx];
    const n = ipv4ToInt(v4);
    if (n === null) return null;
    const hi = ((n >>> 16) & 0xffff).toString(16);
    const lo = (n & 0xffff).toString(16);
    lastGroups.splice(lastIdx, 1, hi, lo);
  }
  const totalGroups = head.length + tail.length;
  if (totalGroups > 8) return null;
  const fillCount = 8 - totalGroups;
  const groups: string[] = [
    ...head,
    ...Array<string>(fillCount).fill("0"),
    ...tail,
  ];
  if (groups.length !== 8) return null;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const raw = groups[i] || "0";
    if (!/^[0-9a-fA-F]{1,4}$/.test(raw)) return null;
    const v = parseInt(raw, 16);
    bytes[i * 2] = (v >>> 8) & 0xff;
    bytes[i * 2 + 1] = v & 0xff;
  }
  return bytes;
}

function bytesToIpv6(bytes: Uint8Array): string {
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    const v = (bytes[i] << 8) | bytes[i + 1];
    groups.push(v.toString(16));
  }
  return groups.join(":");
}

function bytesShareTopBits(
  a: Uint8Array,
  b: Uint8Array,
  bits: number
): boolean {
  if (bits === 0) return true;
  const fullBytes = Math.floor(bits / 8);
  for (let i = 0; i < fullBytes; i++) {
    if (a[i] !== b[i]) return false;
  }
  const remaining = bits % 8;
  if (remaining === 0) return true;
  const mask = (0xff << (8 - remaining)) & 0xff;
  return (a[fullBytes] & mask) === (b[fullBytes] & mask);
}

/** Test-only — invalidate the cache so unit tests can reset. */
export function __resetIpRulesCache(): void {
  cache = null;
}
