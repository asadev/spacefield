/* Booking viewer — date + slot picker, invitee details, confirmation. */

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveLink, recordView } from "@/lib/share/server";
import type { BookingPayload } from "@/lib/share/types";
import { hashClientFingerprint } from "@/lib/share/fingerprint";
import { createClient } from "@/lib/supabase/server";
import BookingPicker from "../../_components/BookingPicker";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ws?: string }>;
}

export const dynamic = "force-dynamic";

async function fetchBookedSlots(linkId: string): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("share_booked_slots", { p_link_id: linkId });
    return Array.isArray(data) ? (data as string[]) : [];
  } catch {
    return [];
  }
}

export default async function BookingViewer({ params, searchParams }: Props) {
  const { slug } = await params;
  const { ws } = await searchParams;
  const subdomain = ws ?? null;

  const link = await resolveLink(slug, subdomain);
  if (!link || link.type !== "booking") notFound();
  const payload = link.payload as unknown as BookingPayload;

  const h = await headers();
  recordView({
    slug,
    subdomain,
    ipHash: await hashClientFingerprint(h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? ""),
    uaHash: await hashClientFingerprint(h.get("user-agent") ?? ""),
    referrer: h.get("referer") ?? "",
  }).catch(() => {});

  const bookedSlots = await fetchBookedSlots(link.id);

  return (
    <article className="space-y-6">
      {payload.brandLogo ? (
        <img src={payload.brandLogo} alt="" className="h-10 w-10 rounded-lg object-cover" />
      ) : null}

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{payload.title}</h1>
        {payload.description ? (
          <p className="text-sm text-slate-500">{payload.description}</p>
        ) : null}
      </header>

      <BookingPicker linkId={link.id} payload={payload} bookedSlots={bookedSlots} />
    </article>
  );
}
