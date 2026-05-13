/**
 * PostHog no-op wrapper.
 *
 * Same shape as lib/sentry.ts — dormant until `POSTHOG_KEY` is set AND
 * `posthog-node` is installed. Until then `capture()` is a structured
 * log line, which gives us a paper trail of which events we'd be
 * sending if analytics were live.
 *
 * When the time comes to actually ship, install `posthog-node` and set:
 *   POSTHOG_KEY=phc_xxx
 *   POSTHOG_HOST=https://eu.i.posthog.com   (optional, defaults to .com)
 */

import { log } from "@/lib/log";
import { releaseInfo } from "@/lib/release-info";

interface PostHogClientLike {
  capture(args: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
  }): void;
}

let clientPromise: Promise<PostHogClientLike | null> | null = null;

async function getClient(): Promise<PostHogClientLike | null> {
  const key = process.env.POSTHOG_KEY;
  if (!key) return null;
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    try {
      const modName = "posthog-node";
      const mod = (await import(/* webpackIgnore: true */ modName).catch(
        () => null
      )) as
        | { PostHog: new (key: string, opts?: { host?: string }) => PostHogClientLike }
        | null;
      if (!mod) return null;
      return new mod.PostHog(key, {
        host: process.env.POSTHOG_HOST,
      });
    } catch {
      return null;
    }
  })();
  return clientPromise;
}

/**
 * Capture a product-analytics event. The `distinct_id` property is the
 * canonical PostHog identifier — pass either a user id or an anonymous
 * device id. When unset we fall back to "anonymous" so the event still
 * fires.
 *
 * Never throws — analytics infra must not break user-visible code.
 */
export async function capture(
  event: string,
  properties?: Record<string, unknown>
): Promise<void> {
  try {
    const release = releaseInfo();
    const enriched: Record<string, unknown> = {
      ...(properties ?? {}),
      $release: release.commit,
      $env: release.env,
    };
    const distinctId =
      (typeof enriched.distinct_id === "string" && enriched.distinct_id) ||
      (typeof enriched.user_id === "string" && enriched.user_id) ||
      "anonymous";

    const client = await getClient();
    if (client) {
      client.capture({ distinctId, event, properties: enriched });
      return;
    }
    log.info("posthog.fallback.capture", {
      event,
      distinct_id: distinctId,
      ...enriched,
    });
  } catch (inner) {
    // eslint-disable-next-line no-console
    console.error("[posthog] capture failed:", inner);
  }
}

/** True when PostHog is wired up. */
export function posthogActive(): boolean {
  return Boolean(process.env.POSTHOG_KEY);
}
