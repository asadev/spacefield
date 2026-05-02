/* Redirect viewer — short link to external URL with bounce. */

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { resolveLink, recordView } from "@/lib/share/server";
import type { RedirectPayload } from "@/lib/share/types";
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

  redirect(payload.url);
}
