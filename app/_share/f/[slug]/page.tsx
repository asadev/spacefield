/* Form viewer — renders a fillable form from FormPayload. */

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveLink, recordView } from "@/lib/share/server";
import type { FormPayload } from "@/lib/share/types";
import { hashClientFingerprint } from "@/lib/share/fingerprint";
import FormRenderer from "../../_components/FormRenderer";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ws?: string; submitted?: string }>;
}

export const dynamic = "force-dynamic";

export default async function FormViewer({ params, searchParams }: Props) {
  const { slug } = await params;
  const { ws, submitted } = await searchParams;
  const subdomain = ws ?? null;

  const link = await resolveLink(slug, subdomain);
  if (!link || link.type !== "form") notFound();

  const payload = link.payload as unknown as FormPayload;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ua = h.get("user-agent") ?? "";
  const referrer = h.get("referer") ?? "";
  recordView({
    slug,
    subdomain,
    ipHash: await hashClientFingerprint(ip),
    uaHash: await hashClientFingerprint(ua),
    referrer,
  }).catch(() => {});

  if (submitted === "1") {
    return (
      <div className="space-y-4 text-center">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: payload.brandColor ?? "#16a34a" }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold">Thanks!</h1>
        <p className="text-sm text-slate-500">
          {payload.successMessage ?? "Your response was received. You can close this window."}
        </p>
      </div>
    );
  }

  return (
    <FormRenderer
      payload={payload}
      linkId={link.id}
      slug={slug}
      subdomain={subdomain}
    />
  );
}
