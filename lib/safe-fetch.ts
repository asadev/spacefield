/**
 * Server-side fetch with SSRF guards. Blocks:
 *   - non-http(s) schemes
 *   - private IPv4 ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 100.64/10)
 *   - IPv6 loopback (::1) + ULA (fc00::/7) + link-local (fe80::/10)
 *   - IPv4-mapped IPv6 (::ffff:0:0/96)
 *   - "localhost" / "*.localhost" / ".internal" / numeric-only IPs
 *
 * Resolves DNS once before fetching; rejects if any resolved address is
 * in a blocked range. Note: DNS rebinding attack still possible since
 * fetch() re-resolves — for true safety, also pin the result address.
 * For this codebase, single-resolve is the right balance (cost vs risk).
 *
 * The helper does NOT add Authorization or sign payloads — callers
 * still build their HMAC header. This is purely the network guard.
 */

import "server-only";

export type SafeFetchReason =
  | "scheme-not-allowed"
  | "host-blocked-private"
  | "host-blocked-loopback"
  | "host-blocked-link-local"
  | "host-blocked-cloud-metadata"
  | "dns-resolve-failed";

export class SafeFetchError extends Error {
  reason: SafeFetchReason;
  constructor(reason: SafeFetchReason, message?: string) {
    super(message ?? reason);
    this.name = "SafeFetchError";
    this.reason = reason;
  }
}

export interface SafeFetchInit extends RequestInit {
  /** Hard timeout for the network call. Defaults to 8000ms. */
  timeoutMs?: number;
  /**
   * Optional explicit allowlist of exact hostnames (case-insensitive).
   * If supplied, any host outside this list is rejected as
   * "host-blocked-private" before DNS even runs.
   */
  allowedHosts?: string[];
}

/** Hostnames that must never reach the network — covers cloud-metadata
 * and well-known loopback aliases. Matched case-insensitively against
 * the raw URL hostname BEFORE DNS resolution so rebinding via DNS can't
 * skip this layer. */
const BLOCKED_HOSTNAMES = new Set<string>([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
  "::",
  // AWS / GCP / Azure / Oracle / DO instance-metadata
  "169.254.169.254",
  "metadata.google.internal",
  "metadata",
]);

/** Suffixes that should never resolve outside the local network. */
const BLOCKED_SUFFIXES = [
  ".localhost",
  ".internal",
  ".local",
  ".localdomain",
];

function isNodeRuntime(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.versions === "object" &&
    Boolean(process.versions?.node)
  );
}

/** True if `addr` is an IPv4 address in a private/blocked range. */
function isPrivateIPv4(addr: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(addr);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 — loopback
  if (a === 127) return true;
  // 169.254.0.0/16 — link-local + cloud metadata
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 100.64.0.0/10 — CGNAT
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 0.0.0.0/8 — "this network"
  if (a === 0) return true;
  return false;
}

/** True if `addr` is an IPv6 address we consider private/loopback/link-local. */
function isPrivateIPv6(addr: string): boolean {
  const lower = addr.toLowerCase().trim();
  if (!lower.includes(":")) return false;

  // Strip a zone id (fe80::1%eth0).
  const noZone = lower.split("%")[0];

  // Loopback / unspecified.
  if (noZone === "::1" || noZone === "::") return true;

  // IPv4-mapped IPv6 (::ffff:1.2.3.4 OR ::ffff:0102:0304).
  // Pull out the trailing IPv4 if present and rerun the v4 check.
  const v4Match = /::ffff:([0-9a-f.:]+)$/i.exec(noZone);
  if (v4Match) {
    const tail = v4Match[1];
    if (tail.includes(".") && isPrivateIPv4(tail)) return true;
    // Hex form ::ffff:0a00:0001 → 10.0.0.1
    const hex = tail.replace(/:/g, "");
    if (/^[0-9a-f]{8}$/.test(hex)) {
      const dotted = [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        parseInt(hex.slice(6, 8), 16),
      ].join(".");
      if (isPrivateIPv4(dotted)) return true;
    }
  }

  // fc00::/7 — Unique-Local Address. First byte 0xfc or 0xfd.
  const firstHextet = noZone.split(":")[0];
  if (firstHextet && /^[0-9a-f]+$/.test(firstHextet)) {
    const high = parseInt(firstHextet.padStart(4, "0").slice(0, 2), 16);
    if (high === 0xfc || high === 0xfd) return true;
  }

  // fe80::/10 — link-local.
  if (/^fe[89ab][0-9a-f]?:/.test(noZone)) return true;

  return false;
}

/** True if the literal string is an IPv4 dotted-quad or IPv6 address. */
function looksLikeNumericIp(host: string): boolean {
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (host.includes(":") && /^[0-9a-f:.%]+$/i.test(host)) return true;
  return false;
}

function classifyBlockedAddress(addr: string): SafeFetchReason | null {
  if (isPrivateIPv4(addr)) {
    if (addr === "127.0.0.1" || addr.startsWith("127.")) {
      return "host-blocked-loopback";
    }
    if (addr.startsWith("169.254.")) {
      // 169.254.169.254 is the canonical metadata address, but the whole
      // /16 is link-local — report metadata for the famous one to make
      // ops dashboards more useful.
      return addr === "169.254.169.254"
        ? "host-blocked-cloud-metadata"
        : "host-blocked-link-local";
    }
    return "host-blocked-private";
  }
  if (isPrivateIPv6(addr)) {
    const lower = addr.toLowerCase();
    if (lower === "::1") return "host-blocked-loopback";
    if (/^fe[89ab]/.test(lower)) return "host-blocked-link-local";
    return "host-blocked-private";
  }
  return null;
}

function classifyBlockedHostString(host: string): SafeFetchReason | null {
  const lower = host.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) {
    if (lower === "localhost" || lower === "127.0.0.1" || lower === "::1") {
      return "host-blocked-loopback";
    }
    if (lower === "169.254.169.254" || lower === "metadata.google.internal" || lower === "metadata") {
      return "host-blocked-cloud-metadata";
    }
    return "host-blocked-private";
  }
  for (const suffix of BLOCKED_SUFFIXES) {
    if (lower.endsWith(suffix)) return "host-blocked-private";
  }
  if (looksLikeNumericIp(host)) {
    const direct = classifyBlockedAddress(host);
    if (direct) return direct;
  }
  return null;
}

/**
 * Server-side fetch with SSRF guards.
 *
 * Reason codes (on `SafeFetchError`):
 *   - "scheme-not-allowed"
 *   - "host-blocked-private"
 *   - "host-blocked-loopback"
 *   - "host-blocked-link-local"
 *   - "host-blocked-cloud-metadata"
 *   - "dns-resolve-failed"
 */
export async function safeFetch(
  url: string | URL,
  init?: SafeFetchInit
): Promise<Response> {
  const parsed = url instanceof URL ? url : new URL(url);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SafeFetchError(
      "scheme-not-allowed",
      `scheme "${parsed.protocol}" is not allowed`
    );
  }

  // Strip surrounding brackets from raw IPv6 literals in URL hostname.
  const hostnameRaw = parsed.hostname;
  const hostname = hostnameRaw.startsWith("[") && hostnameRaw.endsWith("]")
    ? hostnameRaw.slice(1, -1)
    : hostnameRaw;

  // Optional explicit allowlist — short-circuits all subsequent checks
  // but still runs the literal-host blocklist (defence in depth).
  const allowed = init?.allowedHosts?.map((h) => h.toLowerCase());
  if (allowed && allowed.length > 0) {
    if (!allowed.includes(hostname.toLowerCase())) {
      throw new SafeFetchError(
        "host-blocked-private",
        `host "${hostname}" is not in allowedHosts`
      );
    }
  }

  // Literal-string check — catches "localhost", numeric IPs in private
  // ranges, ".internal" suffixes, metadata aliases, etc. Runs before
  // DNS so the cheapest layer always fires first.
  const literal = classifyBlockedHostString(hostname);
  if (literal) {
    throw new SafeFetchError(
      literal,
      `host "${hostname}" is blocked`
    );
  }

  // Node-runtime DNS check. Edge runtimes (no `dns/promises`) skip
  // straight to fetch() — the literal-string layer is the only line of
  // defence there, which is why the blocklist above is conservative.
  if (isNodeRuntime() && !looksLikeNumericIp(hostname)) {
    try {
      // Dynamic import keeps edge bundlers from choking on `dns/promises`.
      const { lookup } = await import("dns/promises");
      const results = await lookup(hostname, { all: true });
      for (const r of results) {
        const reason = classifyBlockedAddress(r.address);
        if (reason) {
          throw new SafeFetchError(
            reason,
            `host "${hostname}" resolves to blocked address ${r.address}`
          );
        }
      }
    } catch (e) {
      if (e instanceof SafeFetchError) throw e;
      throw new SafeFetchError(
        "dns-resolve-failed",
        `DNS lookup failed for "${hostname}": ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }

  // Merge caller's AbortSignal with our timeout signal so both still work.
  const timeoutMs = init?.timeoutMs ?? 8000;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const callerSignal = init?.signal ?? null;
  const signal = callerSignal
    ? mergeSignals(callerSignal, timeoutSignal)
    : timeoutSignal;

  // Strip our custom fields before handing init to fetch().
  const { timeoutMs: _omitTimeout, allowedHosts: _omitAllowed, signal: _omitSignal, ...rest } =
    init ?? {};
  void _omitTimeout;
  void _omitAllowed;
  void _omitSignal;

  return fetch(parsed, { ...rest, signal });
}

/**
 * Compose two AbortSignals — the merged signal aborts when either input
 * aborts. Uses AbortSignal.any() when available (Node ≥20.3 / modern
 * browsers); falls back to a manual controller otherwise so older edge
 * runtimes still work.
 */
function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const anyFn = (AbortSignal as unknown as {
    any?: (signals: AbortSignal[]) => AbortSignal;
  }).any;
  if (typeof anyFn === "function") {
    return anyFn.call(AbortSignal, [a, b]);
  }
  const ctl = new AbortController();
  const onAbort = (sig: AbortSignal) => () => {
    if (!ctl.signal.aborted) ctl.abort(sig.reason);
  };
  if (a.aborted) ctl.abort(a.reason);
  else a.addEventListener("abort", onAbort(a), { once: true });
  if (b.aborted) ctl.abort(b.reason);
  else b.addEventListener("abort", onAbort(b), { once: true });
  return ctl.signal;
}
