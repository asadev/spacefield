/* Redirect viewer — short link to external URL with bounce.
 *
 * SHARE-01: this used to call redirect(payload.url) with zero validation,
 * turning trusted share.example.com/r/<slug> into an open-redirect / phishing
 * relay. We now (1) re-validate the stored URL here as defence-in-depth
 * (mint already rejects bad URLs — see lib/share/server.ts) and reject
 * anything that isn't an absolute http(s) URL, and (2) show an interstitial
 * "bounce" page that names the destination host before forwarding, instead
 * of a silent 307. This matches the file-header promise and stops the
 * trusted origin from laundering an attacker link in a single hop.
 */

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveLink, recordView } from "@/lib/share/server";
import { isSafeRedirectUrl, type RedirectPayload } from "@/lib/share/types";
import { hashClientFingerprint } from "@/lib/share/fingerprint";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ws?: string }>;
}

export const dynamic = "force-dynamic";

export default async function RedirectViewer({ params, searchParams }: Props) {
  const { slug } = await params;
  const { ws } = await searchParams;
  const subdomain = ws ?? null;

  const link = await resolveLink(slug, subdomain);
  if (!link || link.type !== "redirect") notFound();

  const payload = link.payload as unknown as RedirectPayload;

  // SHARE-01: never forward to an unvalidated / non-http(s) destination.
  // Treat a bad stored URL as a missing link rather than bouncing the
  // visitor somewhere dangerous.
  if (!isSafeRedirectUrl(payload.url)) notFound();
  const target = payload.url.trim();
  const host = new URL(target).host;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ua = h.get("user-agent") ?? "";
  const referrer = h.get("referer") ?? "";
  await recordView({
    slug,
    subdomain,
    ipHash: await hashClientFingerprint(ip),
    uaHash: await hashClientFingerprint(ua),
    referrer,
  });

  return (
    <>
      {/* Best-effort auto-forward for non-JS clients. The visible
          interstitial below names the destination so the trusted origin
          isn't silently laundering an external link. */}
      <meta httpEquiv="refresh" content={`1;url=${target}`} />
      <article className="space-y-6">
        <header className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Redirecting
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Taking you to an external site
          </h1>
        </header>
        <p className="text-sm text-slate-600">
          You are leaving share.example.com and being forwarded to{" "}
          <span className="font-medium break-all">{host}</span>.
        </p>
        <a
          href={target}
          rel="noopener noreferrer nofollow external"
          className="inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white no-underline hover:opacity-90"
        >
          Continue to {host}
        </a>
        <p className="text-xs text-slate-500 break-all">{target}</p>
      </article>
    </>
  );
}
