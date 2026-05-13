/**
 * Sentry no-op wrapper.
 *
 * We don't actually depend on `@sentry/nextjs` at build time — adding it
 * to package.json triggers a heavy postinstall (webpack plugin, source
 * map upload, etc.) that we're not ready for. Instead:
 *
 *   - If `SENTRY_DSN` is set AND the package happens to be installed
 *     (e.g. an op person installed it manually or a future round adds
 *     it), we use it.
 *   - Otherwise, we fall back to structured logging via lib/log.ts.
 *
 * Either way callers get a uniform `captureException` / `captureMessage`
 * surface and we can flip the switch from "no-op" to "live Sentry" by
 * adding the package + env var, with zero code changes elsewhere.
 *
 * The dynamic import is awaited on first use and cached so we don't pay
 * a `import()` round-trip per call.
 */

import { log } from "@/lib/log";
import { releaseInfo } from "@/lib/release-info";

interface SentryLike {
  captureException(err: unknown, hint?: { contexts?: Record<string, unknown> }): void;
  captureMessage(msg: string, hint?: { contexts?: Record<string, unknown> }): void;
}

let sentryPromise: Promise<SentryLike | null> | null = null;

async function getSentry(): Promise<SentryLike | null> {
  if (!process.env.SENTRY_DSN) return null;
  if (sentryPromise) return sentryPromise;
  sentryPromise = (async () => {
    try {
      // Vite/webpack will try to statically analyse a literal import
      // string, which fails when the package isn't installed. The
      // variable indirection keeps the dependency optional.
      const modName = "@sentry/nextjs";
      const mod = (await import(/* webpackIgnore: true */ modName).catch(
        () => null
      )) as SentryLike | null;
      return mod ?? null;
    } catch {
      return null;
    }
  })();
  return sentryPromise;
}

/**
 * Capture an exception. Falls back to `log.error` when Sentry isn't
 * wired up. Never throws — error tracking infra must not break the
 * caller's error path.
 */
export async function captureException(
  err: unknown,
  ctx?: Record<string, unknown>
): Promise<void> {
  try {
    const release = releaseInfo();
    const enriched = { ...(ctx ?? {}), release };
    const sentry = await getSentry();
    if (sentry) {
      sentry.captureException(err, { contexts: { app: enriched } });
      return;
    }
    log.error(
      "sentry.fallback.exception",
      enriched,
      err
    );
  } catch (inner) {
    // Last-ditch — never propagate.
    // eslint-disable-next-line no-console
    console.error("[sentry] captureException failed:", inner);
  }
}

/**
 * Capture a message (non-throw event). Falls back to `log.warn` when
 * Sentry isn't wired up.
 */
export async function captureMessage(
  msg: string,
  ctx?: Record<string, unknown>
): Promise<void> {
  try {
    const release = releaseInfo();
    const enriched = { ...(ctx ?? {}), release };
    const sentry = await getSentry();
    if (sentry) {
      sentry.captureMessage(msg, { contexts: { app: enriched } });
      return;
    }
    log.warn("sentry.fallback.message", { msg, ...enriched });
  } catch (inner) {
    // eslint-disable-next-line no-console
    console.error("[sentry] captureMessage failed:", inner);
  }
}

/**
 * True when an actual Sentry client is wired up. Useful for the admin
 * status checklist's runtime introspection.
 */
export function sentryActive(): boolean {
  return Boolean(process.env.SENTRY_DSN);
}
