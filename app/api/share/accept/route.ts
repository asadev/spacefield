/* Quote acceptance endpoint — called from public quote viewer.
 *
 * Records a `convert` event in share_events with the acceptance details
 * (signer name, signature timestamp, IP hash). Fires webhook + email to
 * the quote creator if configured.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLinkById } from "@/lib/share/server";
import { hashClientFingerprint } from "@/lib/share/fingerprint";
import { sendEmail } from "@/lib/email";
import { deliverSignedWebhook } from "@/lib/share/webhook-sign";
import type { QuotePayload, ShareLinkRow } from "@/lib/share/types";
import { buildShareUrl } from "@/lib/share/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (
      !body ||
      typeof body.linkId !== "string" ||
      typeof body.signerName !== "string" ||
      body.signerName.trim().length === 0
    ) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const ua = req.headers.get("user-agent") ?? "";
    const ipHash = await hashClientFingerprint(ip);
    const uaHash = await hashClientFingerprint(ua);

    // rate limit: 10 accepts / hour / ip
    try {
      const supabase = await createClient();
      const { data: rl } = await supabase.rpc("rate_limit_check", {
        p_bucket: "share_accept",
        p_key: ipHash || "anon",
        p_limit: 10,
        p_window_seconds: 3600,
      });
      if (rl === false) {
        return NextResponse.json({ error: "Too many requests." }, { status: 429 });
      }
    } catch {}

    const link = await getLinkById(body.linkId);
    if (!link || link.status !== "active" || link.type !== "quote") {
      return NextResponse.json({ error: "quote not found" }, { status: 404 });
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: "quote expired" }, { status: 410 });
    }

    // Record via SECURITY DEFINER RPC (RLS blocks direct event inserts)
    const supabase = await createClient();
    const { error: evtErr } = await supabase.rpc("share_record_accept", {
      p_link_id: link.id,
      p_signer_name: body.signerName,
      p_signer_email: typeof body.signerEmail === "string" ? body.signerEmail : null,
      p_signer_company: typeof body.signerCompany === "string" ? body.signerCompany : null,
      p_ip_hash: ipHash,
      p_ua_hash: uaHash,
    });
    if (evtErr) {
      return NextResponse.json({ error: evtErr.message }, { status: 400 });
    }

    // Fire-and-forget notifications
    notifyAccept({ link, body }).catch((err) => {
      console.warn("[share/accept] notify failed:", err);
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}

async function notifyAccept(args: { link: ShareLinkRow; body: Record<string, unknown> }) {
  const payload = args.link.payload as unknown as QuotePayload;
  const url = buildShareUrl(args.link);
  const signerName = String(args.body.signerName).trim();
  const signerEmail = typeof args.body.signerEmail === "string" ? args.body.signerEmail.trim() : "";
  const signerCompany =
    typeof args.body.signerCompany === "string" ? args.body.signerCompany.trim() : "";
  const total = payload.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);

  // Webhook (signed)
  if (payload.webhookUrl) {
    await deliverSignedWebhook({
      linkId: args.link.id,
      workspaceId: args.link.workspace_id,
      webhookUrl: payload.webhookUrl,
      event: "quote.accepted",
      body: {
        linkId: args.link.id,
        slug: args.link.slug,
        publicUrl: url,
        quote: { title: payload.title, currency: payload.currency, total },
        signer: { name: signerName, email: signerEmail, company: signerCompany },
      },
    });
  }

  // Email
  if (payload.notifyEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.notifyEmail)) {
    const accent = payload.brandColor ?? "#0f172a";
    const escape = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const fmt = (n: number) => {
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: payload.currency,
        }).format(n);
      } catch {
        return `${payload.currency} ${n.toFixed(2)}`;
      }
    };
    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
    <div style="border-left:3px solid ${accent};padding-left:12px;margin-bottom:18px;">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Quote accepted</div>
      <div style="font-size:18px;font-weight:600;color:#0f172a;margin-top:2px;">${escape(payload.title || "Quote")}</div>
    </div>
    <div style="color:#334155;font-size:14px;line-height:1.5;">
      <div style="margin-bottom:6px;"><strong>Signer:</strong> ${escape(signerName)}</div>
      ${signerEmail ? `<div style="margin-bottom:6px;"><strong>Email:</strong> ${escape(signerEmail)}</div>` : ""}
      ${signerCompany ? `<div style="margin-bottom:6px;"><strong>Company:</strong> ${escape(signerCompany)}</div>` : ""}
      <div style="margin-bottom:6px;"><strong>Total:</strong> ${escape(fmt(total))}</div>
    </div>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
      <a href="${url}" style="font-size:13px;color:#64748b;text-decoration:none;">View quote</a>
    </div>
  </div>
  <div style="text-align:center;margin-top:14px;font-size:11px;color:#94a3b8;">Sent via share.example.com</div>
</body></html>`;
    try {
      await sendEmail({
        to: payload.notifyEmail,
        subject: `Quote accepted · ${payload.title || "Quote"}`,
        html,
        text: `${signerName}${signerCompany ? ` (${signerCompany})` : ""} accepted your quote "${payload.title}". Total: ${fmt(total)}. View: ${url}`,
        from: "noreply",
      });
    } catch (err) {
      console.warn("[share/accept] email failed:", err instanceof Error ? err.message : err);
    }
  }
}
