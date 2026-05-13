/**
 * Release metadata — the "who/where/what version" tag we attach to
 * every log line, error report, and latency sample.
 *
 * On Vercel, the relevant env vars are populated automatically:
 *   - VERCEL_GIT_COMMIT_SHA  (full commit SHA of the deployment)
 *   - VERCEL_REGION          (e.g. "iad1", "fra1")
 *   - VERCEL_DEPLOYMENT_ID   (e.g. "dpl_xxx")
 *   - VERCEL_ENV             ("production" | "preview" | "development")
 *
 * For local dev / non-Vercel hosts the values fall back to "local" /
 * "dev" so downstream code never has to null-check.
 */

export interface ReleaseInfo {
  /** Short (7-char) commit SHA — useful for breadcrumb display. */
  commit: string;
  /** Vercel region code, e.g. "iad1". "local" outside Vercel. */
  region: string;
  /** Vercel deployment id. "local" outside Vercel. */
  deployment_id: string;
  /** "production" | "preview" | "development" | "dev". */
  env: string;
}

let cached: ReleaseInfo | null = null;

export function releaseInfo(): ReleaseInfo {
  if (cached) return cached;
  const fullSha = process.env.VERCEL_GIT_COMMIT_SHA;
  cached = {
    commit: fullSha ? fullSha.slice(0, 7) : "local",
    region: process.env.VERCEL_REGION ?? "local",
    deployment_id: process.env.VERCEL_DEPLOYMENT_ID ?? "local",
    env: process.env.VERCEL_ENV ?? "dev",
  };
  return cached;
}

/**
 * Full (non-truncated) commit SHA when callers need to dedupe or link
 * to GitHub. Falls back to "local" off-Vercel.
 */
export function releaseSha(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
}
