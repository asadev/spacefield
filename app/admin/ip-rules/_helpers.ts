import type { IpRuleRow } from "../_types";

/** Loose CIDR/IP regex: simple, covers IPv4 with optional /N. We only
 *  validate format, not value — `999.999.999.999` would slip past, but
 *  the goal is "obvious garbage rejected", not RFC-grade parsing. */
export const CIDR_REGEX = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/;

/** Pure-IPv4 (no CIDR) regex for the tester input. */
export const IPV4_REGEX = /^\d{1,3}(\.\d{1,3}){3}$/;

export function isValidCidr(value: string): boolean {
  if (!CIDR_REGEX.test(value)) return false;
  const [host, mask] = value.split("/");
  for (const octet of host.split(".")) {
    const n = Number(octet);
    if (!Number.isFinite(n) || n < 0 || n > 255) return false;
  }
  if (mask !== undefined) {
    const m = Number(mask);
    if (!Number.isFinite(m) || m < 0 || m > 32) return false;
  }
  return true;
}

export function isValidIpv4(value: string): boolean {
  if (!IPV4_REGEX.test(value)) return false;
  for (const octet of value.split(".")) {
    const n = Number(octet);
    if (!Number.isFinite(n) || n < 0 || n > 255) return false;
  }
  return true;
}

function ipToInt(ip: string): number | null {
  if (!isValidIpv4(ip)) return null;
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) >>> 0) +
    ((parts[1] << 16) >>> 0) +
    ((parts[2] << 8) >>> 0) +
    (parts[3] >>> 0);
}

/** Returns true when `ip` falls inside the given CIDR. */
export function ipInCidr(ip: string, cidr: string): boolean {
  if (!isValidCidr(cidr)) return false;
  const [base, maskStr] = cidr.split("/");
  const mask = maskStr === undefined ? 32 : Number(maskStr);
  if (mask < 0 || mask > 32) return false;
  const ipInt = ipToInt(ip);
  const baseInt = ipToInt(base);
  if (ipInt === null || baseInt === null) return false;
  if (mask === 0) return true;
  const bitMask = (~0 << (32 - mask)) >>> 0;
  return (ipInt & bitMask) === (baseInt & bitMask);
}

/* ─────────────────────── matcher ─────────────────────── */

export type IpMatchResult = {
  rule: IpRuleRow;
  reason: string;
};

export function matchIpRules(rules: IpRuleRow[], ip: string): IpMatchResult[] {
  const out: IpMatchResult[] = [];
  if (!isValidIpv4(ip)) return out;
  const now = Date.now();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.expires_at) {
      const t = new Date(rule.expires_at).getTime();
      if (Number.isFinite(t) && t < now) continue;
    }
    if (ipInCidr(ip, rule.cidr)) {
      out.push({
        rule,
        reason: `IP ${ip} matches ${rule.cidr}`,
      });
    }
  }
  return out;
}

export function actionChipClass(action: "allow" | "block"): string {
  return action === "allow"
    ? "bg-emerald-500/15 text-emerald-500"
    : "bg-rose-500/15 text-rose-500";
}
