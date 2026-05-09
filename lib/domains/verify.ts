import "server-only";

/**
 * DNS verification helpers for `workspace_custom_domains`.
 *
 * NOTE — middleware integration is a follow-up.
 *
 * Once a custom domain is verified + attached to Vercel, the production
 * `middleware.ts` still needs a host-routing branch that looks up the
 * incoming `Host` header against `workspace_custom_domains` and
 * (a) for `scope='workspace'` → rewrites the request into the owning
 *     workspace's OS shell, and
 * (b) for `scope='toshare'`   → behaves like the existing
 *     `toshareRouter()` but for this customer's vanity domain.
 *
 * That lookup belongs in middleware (edge runtime, must be cheap), so it
 * needs a small in-memory cache plus a server-cached Supabase query, and
 * touching `middleware.ts` is intentionally outside the scope of this
 * admin slice. Do not modify middleware here. The current admin UI
 * verifies DNS + attaches to Vercel; turning that into actual host
 * routing is the next ticket.
 *
 * All helpers below are pure (no DB touch). They use Node's
 * `dns/promises` resolver and an `AbortController` to cap each lookup
 * at 5s — DNS misconfiguration on a customer side should never hang an
 * admin page render.
 */

import { promises as dns } from "node:dns";

const DNS_TIMEOUT_MS = 5_000;

/** Resolve `_spacefield-verify.<domain>` TXT records (5s timeout). */
export async function dnsTxt(domain: string): Promise<string[]> {
  const target = txtName(domain);
  if (!target) return [];
  return withTimeout<string[]>(
    (signal) =>
      runWithSignal(signal, async () => {
        try {
          const records = await dns.resolveTxt(target);
          // resolveTxt returns string[][] — each TXT record may be split
          // across multiple strings the resolver concatenates.
          return records.map((chunks) => chunks.join(""));
        } catch {
          return [];
        }
      }),
    [] as string[],
    DNS_TIMEOUT_MS
  );
}

/** Resolve CNAME chain for the apex/sub `<domain>` (5s timeout). */
export async function dnsCname(domain: string): Promise<string[]> {
  const target = normalizeDomain(domain);
  if (!target) return [];
  return withTimeout<string[]>(
    (signal) =>
      runWithSignal(signal, async () => {
        try {
          const records = await dns.resolveCname(target);
          return records.map((r) => r.toLowerCase());
        } catch {
          return [];
        }
      }),
    [] as string[],
    DNS_TIMEOUT_MS
  );
}

/**
 * Returns true if any TXT record at `_spacefield-verify.<domain>`
 * exactly equals the verification token. Whitespace-trimmed compare.
 */
export async function verifyTxtToken(
  domain: string,
  token: string
): Promise<boolean> {
  const t = (token ?? "").trim();
  if (!t) return false;
  const records = await dnsTxt(domain);
  for (const r of records) {
    if (r.trim() === t) return true;
  }
  return false;
}

/**
 * Returns true if any CNAME on `<domain>` matches `expected`
 * (case-insensitive, trailing dot stripped).
 */
export async function verifyCname(
  domain: string,
  expected: string
): Promise<boolean> {
  const want = stripTrailingDot((expected ?? "").trim().toLowerCase());
  if (!want) return false;
  const records = await dnsCname(domain);
  for (const r of records) {
    if (stripTrailingDot(r) === want) return true;
  }
  return false;
}

/* ──────────────────── helpers ──────────────────── */

function normalizeDomain(domain: string | null | undefined): string {
  return (domain ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function txtName(domain: string): string {
  const d = normalizeDomain(domain);
  if (!d) return "";
  return `_spacefield-verify.${d}`;
}

function stripTrailingDot(s: string): string {
  return s.endsWith(".") ? s.slice(0, -1) : s;
}

/**
 * Wrap a resolver call so that if it doesn't settle within `ms` we
 * return `fallback` and abort. Node's `dns/promises` resolver doesn't
 * accept an AbortSignal directly, so we race the work against a timer
 * and rely on the resolver's own internal timeout to clean up — this
 * keeps the overall page render bounded.
 */
async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  fallback: T,
  ms: number
): Promise<T> {
  const ac = new AbortController();
  let to: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((resolve) => {
    to = setTimeout(() => {
      ac.abort();
      resolve(fallback);
    }, ms);
  });
  try {
    const result = await Promise.race([work(ac.signal), timeoutPromise]);
    return result;
  } catch {
    return fallback;
  } finally {
    if (to) clearTimeout(to);
  }
}

/**
 * Best-effort honor of an AbortSignal around an async resolver. Returns
 * the resolver's value, or rejects/resolves early when aborted.
 */
async function runWithSignal<T>(
  signal: AbortSignal,
  fn: () => Promise<T>
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new Error("aborted"));
  }
  return await fn();
}
