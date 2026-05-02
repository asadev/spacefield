/* Booking viewer — placeholder; full calendar UI ships in next iteration. */

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveLink, recordView } from "@/lib/toshare/server";
import type { BookingPayload } from "@/lib/toshare/types";
import { hashClientFingerprint } from "@/lib/toshare/fingerprint";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ws?: string }>;
}

export const dynamic = "force-dynamic";

export default async function BookingViewer({ params, searchParams }: Props) {
  const { slug } = await params;
  const { ws } = await searchParams;
  const subdomain = ws ?? null;
  const link = await resolveLink(slug, subdomain);
  if (!link || link.type !== "booking") notFound();
  const payload = link.payload as unknown as BookingPayload;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ua = h.get("user-agent") ?? "";
  recordView({
    slug,
    subdomain,
    ipHash: await hashClientFingerprint(ip),
    uaHash: await hashClientFingerprint(ua),
    referrer: h.get("referer") ?? "",
  }).catch(() => {});

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">{payload.title}</h1>
      {payload.description ? <p className="text-slate-500">{payload.description}</p> : null}
      <div className="rounded-xl border border-slate-200 p-6 text-sm text-slate-500 dark:border-slate-800">
        <p className="font-medium">Booking flow coming soon.</p>
        <p className="mt-1">
          {payload.durationMinutes}-minute slots in {payload.timezone}.
          {payload.notifyEmail ? ` Contact ${payload.notifyEmail} to book directly.` : ""}
        </p>
      </div>
    </div>
  );
}
