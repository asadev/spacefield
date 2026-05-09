import "server-only";

/**
 * Vercel API helpers for attaching/removing custom domains on the
 * spacefield Vercel project. Uses the v10 projects/{id}/domains
 * endpoint for add and v9 for remove (Vercel keeps both stable).
 *
 * Auth: process.env.VERCEL_TOKEN — must be a token in the team that
 * owns the project. Team and project IDs are pinned to the spacefield
 * production project; do not point this at a different project from
 * env vars at runtime.
 */

const TEAM_ID = "your-vercel-team-id";
const PROJECT_ID = "your-vercel-project-id";

export interface VercelOpResult {
  ok: boolean;
  error?: string;
  /** Raw status code returned by Vercel (when one was received). */
  status?: number;
  /** Optional payload returned by Vercel for caller diagnostics. */
  payload?: unknown;
}

/**
 * Attach a domain to the spacefield Vercel project.
 *
 * Vercel returns:
 *   - 200/201 on success (domain newly attached)
 *   - 409 when the domain is already attached to this project — we
 *     treat that as success so re-running the action is idempotent.
 *   - 4xx for validation errors (invalid host, attached elsewhere)
 *   - 5xx for Vercel-side failures
 */
export async function addDomainToVercel(
  domain: string
): Promise<VercelOpResult> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return { ok: false, error: "VERCEL_TOKEN not configured" };

  const cleaned = normalizeDomain(domain);
  if (!cleaned) return { ok: false, error: "invalid domain" };

  try {
    const res = await fetch(
      `https://api.vercel.com/v10/projects/${PROJECT_ID}/domains?teamId=${TEAM_ID}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: cleaned }),
        cache: "no-store",
      }
    );

    const body = await safeJson(res);

    if (res.ok) return { ok: true, status: res.status, payload: body };

    // 409 = "domain already exists in this project" — already attached,
    // count it as success.
    if (res.status === 409) {
      return { ok: true, status: res.status, payload: body };
    }

    return {
      ok: false,
      status: res.status,
      error: extractError(body) ?? `Vercel API ${res.status} ${res.statusText}`,
      payload: body,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Remove a domain from the spacefield Vercel project.
 *
 * Vercel returns:
 *   - 200 on success
 *   - 404 when the domain wasn't attached — we treat that as success
 *     so re-running the action is idempotent.
 */
export async function removeDomainFromVercel(
  domain: string
): Promise<VercelOpResult> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return { ok: false, error: "VERCEL_TOKEN not configured" };

  const cleaned = normalizeDomain(domain);
  if (!cleaned) return { ok: false, error: "invalid domain" };

  try {
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${PROJECT_ID}/domains/${encodeURIComponent(
        cleaned
      )}?teamId=${TEAM_ID}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );

    if (res.ok) return { ok: true, status: res.status };

    // Already gone — idempotent success.
    if (res.status === 404) return { ok: true, status: res.status };

    const body = await safeJson(res);
    return {
      ok: false,
      status: res.status,
      error: extractError(body) ?? `Vercel API ${res.status} ${res.statusText}`,
      payload: body,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ──────────────────── helpers ──────────────────── */

function normalizeDomain(domain: string | null | undefined): string {
  return (domain ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function extractError(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { error?: { message?: string; code?: string } };
  if (b.error?.message) {
    return b.error.code
      ? `${b.error.code}: ${b.error.message}`
      : b.error.message;
  }
  return null;
}
