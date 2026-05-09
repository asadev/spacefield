/**
 * Edge-runtime-safe helpers for middleware.ts.
 *
 * lib/rate-limit.ts, lib/ip-rules.ts, and lib/error-log.ts all import
 * "server-only" and use the @supabase/supabase-js admin client, both of
 * which break in Edge runtime. Middleware runs on Edge for Vercel
 * deployments, so we need fetch-only mirrors of the helpers we want to
 * call from middleware.
 *
 * NOTE — this file is intentionally NOT marked "server-only". It must be
 * importable from `middleware.ts` which runs on the Edge runtime.
 *
 * The shapes mirror lib/rate-limit.ts and lib/ip-rules.ts so callers
 * can swap between the two transparently.
 */

import type {
  IpRuleRow,
  RateLimitRuleRow,
  RateLimitScope,
  ErrorLevel,
} from "@/app/admin/_types";

/* ─────────────────────── shared low-level helpers ─────────────────────── */

interface SupabaseEnv {
  url: string;
  serviceKey: string;
}

function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}

async function supabaseSelect<T>(
  path: string,
  query: string
): Promise<T[] | null> {
  const env = getSupabaseEnv();
  if (!env) return null;
  try {
    const res = await fetch(
      `${env.url}/rest/v1/${path}${query ? `?${query}` : ""}`,
      {
        method: "GET",
        headers: {
          apikey: env.serviceKey,
          Authorization: `Bearer ${env.serviceKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as T[];
  } catch {
    return null;
  }
}

/* ────────────────────────── error logging (edge) ────────────────────────── */

export interface LogErrorEdgeInput {
  message: string;
  source?: string | null;
  level?: ErrorLevel;
  stack?: string | null;
  url?: string | null;
  user_agent?: string | null;
  fingerprint?: string | null;
  context?: Record<string, unknown>;
}

/** Edge-safe SHA-1 via Web Crypto. Falls back to a tiny string-hash if
 * crypto.subtle is unavailable for some reason. */
async function edgeHashSha1Hex(input: string): Promise<string> {
  try {
    const enc = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest("SHA-1", enc);
    const bytes = new Uint8Array(buf);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex.slice(0, 16);
  } catch {
    // Lightweight fallback — collision-prone but never throws.
    let h = 0;
    for (let i = 0; i < input.length; i++) {
      h = ((h << 5) - h + input.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(16).padStart(8, "0").slice(0, 16);
  }
}

async function edgeAutoFingerprint(
  message: string,
  stack?: string | null
): Promise<string> {
  const firstFrame =
    typeof stack === "string"
      ? (stack
          .split("\n")
          .map((l) => l.trim())
          .find((l) => l.startsWith("at ")) ?? "")
      : "";
  return edgeHashSha1Hex(`${message}\n${firstFrame}`);
}

/**
 * Edge-runtime-safe error logger. POSTs to Supabase REST directly so we
 * never load the Node-only error-log helper from middleware.
 *
 * Best-effort — any failure is swallowed.
 */
export async function logErrorEdge(input: LogErrorEdgeInput): Promise<void> {
  try {
    const env = getSupabaseEnv();
    if (!env) return;
    const message = (input.message ?? "").toString().slice(0, 4000);
    if (!message) return;

    const fingerprint =
      input.fingerprint && input.fingerprint.trim()
        ? input.fingerprint.trim().slice(0, 64)
        : await edgeAutoFingerprint(message, input.stack);

    await fetch(`${env.url}/rest/v1/error_events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.serviceKey,
        Authorization: `Bearer ${env.serviceKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        level: input.level ?? "error",
        source: input.source ?? null,
        message,
        fingerprint,
        url: input.url ?? null,
        user_agent: input.user_agent ?? null,
        stack: input.stack ?? null,
        context: input.context ?? {},
      }),
      cache: "no-store",
    });
  } catch {
    // Swallow — never break the original code path.
  }
}

/* ───────────────────────── client-IP extraction ───────────────────────── */

/**
 * Best-effort client IP from request headers. Vercel sets
 * `x-forwarded-for` with the originating IP first.
 */
export function getClientIpFromHeaders(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "";
}

/* ───────────────────────────── IP rule check ───────────────────────────── */

interface IpCacheEntry {
  rules: IpRuleRow[];
  expiresAt: number;
}

let ipCache: IpCacheEntry | null = null;
const IP_CACHE_TTL_MS = 60_000;

async function loadIpRulesEdge(): Promise<IpRuleRow[]> {
  const now = Date.now();
  if (ipCache && ipCache.expiresAt > now) return ipCache.rules;
  const rows = await supabaseSelect<IpRuleRow>(
    "ip_rules",
    "select=*&enabled=eq.true"
  );
  if (!rows) {
    ipCache = { rules: [], expiresAt: now + IP_CACHE_TTL_MS };
    return [];
  }
  const filtered = rows.filter((r) => {
    if (!r.expires_at) return true;
    return new Date(r.expires_at).getTime() > now;
  });
  ipCache = { rules: filtered, expiresAt: now + IP_CACHE_TTL_MS };
  return filtered;
}

export interface IpEvalResult {
  action: "allow" | "block" | "pass";
  rule_id?: string;
  reason?: string;
}

/**
 * Edge-safe variant of evaluateIp() from lib/ip-rules.ts. Uses the same
 * CIDR matcher but loads rules over fetch.
 */
export async function evaluateIpEdge(ip: string): Promise<IpEvalResult> {
  if (!ip) return { action: "pass" };
  const rules = await loadIpRulesEdge();
  if (rules.length === 0) return { action: "pass" };

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

/* ─── CIDR matcher (mirrored from lib/ip-rules.ts; kept Edge-pure here) ─── */

export function matchCidr(ip: string, cidr: string): boolean {
  if (!ip || !cidr) return false;
  const trimmedIp = ip.trim();
  const trimmedCidr = cidr.trim();

  if (!trimmedCidr.includes("/")) {
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
  const cleaned = ip.split("%")[0];
  let head: string[] = [];
  let tail: string[] = [];
  if (cleaned.includes("::")) {
    const [h, t] = cleaned.split("::");
    head = h ? h.split(":") : [];
    tail = t ? t.split(":") : [];
  } else {
    head = cleaned.split(":");
  }
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

/* ──────────────────── rate-limit rules + bucket (edge) ──────────────────── */

interface RuleCacheEntry {
  rules: RateLimitRuleRow[];
  expiresAt: number;
}

const RULE_TTL_MS = 60_000;
const ruleCache = new Map<string, RuleCacheEntry>();

function ruleCacheKey(
  scope: RateLimitScope,
  value?: string,
  route?: string
): string {
  return `${scope}::${value ?? ""}::${route ?? ""}`;
}

/**
 * Edge-safe variant of getApplicableRules() from lib/rate-limit.ts.
 */
export async function getApplicableRulesEdge(
  scope: RateLimitScope,
  value?: string,
  route?: string
): Promise<RateLimitRuleRow[]> {
  const key = ruleCacheKey(scope, value, route);
  const cached = ruleCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rules;
  }
  let q = `select=*&scope=eq.${encodeURIComponent(scope)}&enabled=eq.true`;
  if (
    (scope === "tier" || scope === "user" || scope === "workspace") &&
    value
  ) {
    q += `&scope_value=eq.${encodeURIComponent(value)}`;
  }
  const rows = await supabaseSelect<RateLimitRuleRow>("rate_limit_rules", q);
  if (!rows) {
    ruleCache.set(key, { rules: [], expiresAt: Date.now() + RULE_TTL_MS });
    return [];
  }
  let rules = rows;
  if (scope === "route" && route) {
    rules = rows.filter((r) => routeMatches(r.route_pattern, route));
  }
  ruleCache.set(key, { rules, expiresAt: Date.now() + RULE_TTL_MS });
  return rules;
}

function routeMatches(pattern: string | null, route: string): boolean {
  if (!pattern) return false;
  if (pattern === route) return true;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
  return regex.test(route);
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  reset_at: Date;
}

/**
 * Edge-safe in-process bucket. Same semantics as
 * lib/rate-limit.ts#checkAndIncrement — see that file for caveats about
 * per-process state on serverless.
 */
export async function checkAndIncrementEdge(
  rule: RateLimitRuleRow,
  key: string
): Promise<RateLimitDecision> {
  const now = Date.now();
  const windowMs = Math.max(1, rule.window_sec) * 1000;
  const max = Math.max(1, rule.limit_count);
  const bucketKey = `${rule.id}::${key}`;

  let bucket = buckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
  }
  bucket.count += 1;
  buckets.set(bucketKey, bucket);

  if (buckets.size > 256 && Math.random() < 0.05) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }

  const allowed = bucket.count <= max;
  return {
    allowed,
    remaining: Math.max(0, max - bucket.count),
    reset_at: new Date(bucket.resetAt),
  };
}

/** Test-only: reset the in-process buckets + rule cache. */
export function __resetEdgeRateLimitState(): void {
  buckets.clear();
  ruleCache.clear();
  ipCache = null;
}
