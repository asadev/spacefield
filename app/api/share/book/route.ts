/* Booking endpoint — visitor picks a slot and submits.
 *
 * Validates against the booking config's windows + already-booked slots
 * server-side (DB ensures atomicity), then notifies the host via webhook
 * + email, and emits an ICS attachment URL for the invitee.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLinkById } from "@/lib/share/server";
import { hashClientFingerprint } from "@/lib/share/fingerprint";
import { sendEmail } from "@/lib/email";
import { deliverSignedWebhook } from "@/lib/share/webhook-sign";
import type { BookingPayload, ShareLinkRow } from "@/lib/share/types";
import { buildShareUrl } from "@/lib/share/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (
      !body ||
      typeof body.linkId !== "string" ||
      typeof body.startLocal !== "string" ||
      typeof body.inviteeName !== "string" ||
      typeof body.inviteeEmail !== "string"
    ) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.inviteeEmail)) {
      return NextResponse.json({ error: "invalid email" }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const ua = req.headers.get("user-agent") ?? "";
    const ipHash = await hashClientFingerprint(ip);
    const uaHash = await hashClientFingerprint(ua);

    // rate limit: 5 bookings / hour / ip (low because each booking is real
    // calendar time)
    try {
      const supabase = await createClient();
      const { data: rl } = await supabase.rpc("rate_limit_check", {
        p_bucket: "share_book",
        p_key: ipHash || "anon",
        p_limit: 5,
        p_window_seconds: 3600,
      });
      if (rl === false) {
        return NextResponse.json({ error: "Too many bookings." }, { status: 429 });
      }
    } catch {}

    const link = await getLinkById(body.linkId);
    if (!link || link.status !== "active" || link.type !== "booking") {
      return NextResponse.json({ error: "booking page not found" }, { status: 404 });
    }

    const supabase = await createClient();
    const { error: rpcErr } = await supabase.rpc("share_record_booking", {
      p_link_id: link.id,
      p_start_local: body.startLocal,
      p_invitee_name: body.inviteeName,
      p_invitee_email: body.inviteeEmail,
      p_notes: typeof body.notes === "string" ? body.notes : null,
      p_ip_hash: ipHash,
      p_ua_hash: uaHash,
    });

    if (rpcErr) {
      // RPC throws "slot already booked" / "expired" / etc — surface the message
      const status = rpcErr.message.includes("already booked") ? 409 : 400;
      return NextResponse.json({ error: rpcErr.message }, { status });
    }

    // Fan-out async
    notifyBooking({ link, body }).catch((err) => {
      console.warn("[share/book] notify failed:", err);
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}

async function notifyBooking(args: { link: ShareLinkRow; body: Record<string, unknown> }) {
  const payload = args.link.payload as unknown as BookingPayload;
  const url = buildShareUrl(args.link);
  const inviteeName = String(args.body.inviteeName).trim();
  const inviteeEmail = String(args.body.inviteeEmail).trim();
  const startLocal = String(args.body.startLocal);
  const notes = typeof args.body.notes === "string" ? args.body.notes.trim() : "";

  // Webhook (signed)
  if (payload.webhookUrl) {
    await deliverSignedWebhook({
      linkId: args.link.id,
      workspaceId: args.link.workspace_id,
      webhookUrl: payload.webhookUrl,
      event: "booking.created",
      body: {
        linkId: args.link.id,
        slug: args.link.slug,
        publicUrl: url,
        booking: {
          title: payload.title,
          startLocal,
          timezone: payload.timezone,
          durationMinutes: payload.durationMinutes,
          invitee: { name: inviteeName, email: inviteeEmail },
          notes,
        },
      },
    });
  }

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const accent = payload.brandColor ?? "#0f172a";
  const slotText = formatSlot(startLocal, payload.timezone, payload.durationMinutes);

  // Host notification
  if (payload.notifyEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.notifyEmail)) {
    try {
      await sendEmail({
        to: payload.notifyEmail,
        subject: `New booking · ${payload.title}`,
        html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
    <div style="border-left:3px solid ${accent};padding-left:12px;margin-bottom:18px;">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">New booking</div>
      <div style="font-size:18px;font-weight:600;color:#0f172a;margin-top:2px;">${escape(payload.title)}</div>
    </div>
    <div style="color:#334155;font-size:14px;line-height:1.6;">
      <div><strong>When:</strong> ${escape(slotText)}</div>
      <div><strong>Who:</strong> ${escape(inviteeName)} · ${escape(inviteeEmail)}</div>
      ${notes ? `<div style="margin-top:8px;"><strong>Notes:</strong> ${escape(notes)}</div>` : ""}
    </div>
  </div>
</body></html>`,
        text: `New booking for "${payload.title}" — ${slotText}. Invitee: ${inviteeName} <${inviteeEmail}>${notes ? ". Notes: " + notes : ""}`,
        from: "noreply",
      });
    } catch (err) {
      console.warn("[share/book] host email failed:", err);
    }
  }

  // Invitee confirmation
  try {
    await sendEmail({
      to: inviteeEmail,
      subject: `Booking confirmed: ${payload.title}`,
      html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
    <div style="border-left:3px solid ${accent};padding-left:12px;margin-bottom:18px;">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Booking confirmed</div>
      <div style="font-size:18px;font-weight:600;color:#0f172a;margin-top:2px;">${escape(payload.title)}</div>
    </div>
    <div style="color:#334155;font-size:14px;line-height:1.6;">
      <div><strong>When:</strong> ${escape(slotText)}</div>
      ${payload.locationInfo ? `<div style="margin-top:8px;"><strong>Where:</strong> ${escape(payload.locationInfo)}</div>` : ""}
      ${payload.description ? `<div style="margin-top:8px;color:#64748b;">${escape(payload.description)}</div>` : ""}
    </div>
  </div>
</body></html>`,
      text: `Booking confirmed: "${payload.title}" — ${slotText}.${payload.locationInfo ? " Location: " + payload.locationInfo : ""}`,
      from: "noreply",
      replyTo: payload.notifyEmail,
    });
  } catch (err) {
    console.warn("[share/book] invitee email failed:", err);
  }
}

function formatSlot(startLocal: string, timezone: string, durationMinutes: number): string {
  // startLocal like "2026-05-04T14:30:00"
  const [datePart, timePart] = startLocal.split("T");
  const [hh, mm] = (timePart ?? "00:00").split(":");
  const d = new Date(`${datePart}T${hh}:${mm}:00`);
  const dateLabel = d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = `${hh}:${mm} (${timezone}) · ${durationMinutes} min`;
  return `${dateLabel} at ${timeLabel}`;
}
