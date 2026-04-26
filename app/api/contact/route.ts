import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, notifyTeam } from "@/lib/email";
import {
  contactReceivedEmail,
} from "@/lib/email";
import { senderForContactTopic } from "@/lib/email-senders";

/* POST /api/contact
 *   body: { name, email, topic, message }
 *
 * Replaces the old inline-from-the-page Supabase insert. Now:
 *   1. inserts the row into public.contact_messages (anon-insert RLS)
 *   2. sends a branded auto-reply to the user from the topic-matched
 *      sender (info / support / sales)
 *   3. notifies the team inbox so we actually see the submission
 *
 * Errors in step 2 or 3 don't fail the request — the row is saved
 * either way and the team can pick it up from the admin panel.
 */

interface Body {
  name?: string | null;
  email?: string;
  topic?: string;
  message?: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { name, email, topic, message } = body;
  if (!email || !message) {
    return NextResponse.json({ error: "missing email or message" }, { status: 400 });
  }
  const safeTopic = (topic || "general").toLowerCase();
  const safeName = (name ?? "").toString().trim() || null;

  // 1. Insert the row (anon-insert allowed by RLS)
  const supabase = await createClient();
  const { data: row, error: insertErr } = await supabase
    .from("contact_messages")
    .insert({
      name: safeName,
      email: email.trim(),
      topic: safeTopic,
      message: message.toString().trim(),
    })
    .select("id")
    .single();
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 400 });
  }

  // 2. Auto-reply to the user from the right sender role
  const senderRole = senderForContactTopic(safeTopic);
  try {
    const tpl = contactReceivedEmail({ name: safeName, topic: safeTopic });
    await sendEmail({
      from: senderRole,
      to: email.trim(),
      subject: tpl.subject,
      html: tpl.html,
    });
  } catch (err) {
    console.warn("[contact] auto-reply failed:", err);
  }

  // 3. Notify the team
  try {
    await notifyTeam({
      role: senderRole,
      subject: `[${safeTopic}] ${safeName ?? email}`,
      html: `
        <p><strong>From:</strong> ${escapeHtml(safeName ?? "(no name)")} &lt;${escapeHtml(
          email
        )}&gt;</p>
        <p><strong>Topic:</strong> ${escapeHtml(safeTopic)}</p>
        <hr>
        <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.5;">${escapeHtml(
          (message ?? "").toString()
        )}</pre>
        <hr>
        <p style="color:#888;font-size:12px;">
          Submission ID: ${row?.id ?? "-"} · See more in the admin panel
          at https://spacefield.co/admin/messages
        </p>
      `,
      replyTo: email.trim(),
    });
  } catch (err) {
    console.warn("[contact] team notify failed:", err);
  }

  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
