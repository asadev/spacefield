import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Body = {
  broker_id?: string;
  from_name?: string;
  from_email?: string;
  from_region?: string | null;
  destination_region?: string | null;
  message?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const brokerId = (body.broker_id ?? "").trim();
  const fromName = (body.from_name ?? "").trim();
  const fromEmail = (body.from_email ?? "").trim();
  const message = (body.message ?? "").trim();
  const fromRegion = body.from_region || null;
  const destRegion = body.destination_region || null;

  if (!brokerId || !fromName || !fromEmail || !message) {
    return NextResponse.json(
      { error: "broker_id, from_name, from_email, and message are required" },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (message.length > 4000) {
    return NextResponse.json(
      { error: "Message too long (max 4000 chars)" },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();

    // Verify the broker exists and is verified — avoids logging junk for
    // non-existent ids.
    const { data: broker, error: bErr } = await supabase
      .from("brokers")
      .select("id, status, public_email, full_name")
      .eq("id", brokerId)
      .maybeSingle();
    if (bErr) {
      return NextResponse.json({ error: bErr.message }, { status: 500 });
    }
    if (!broker || broker.status !== "verified") {
      return NextResponse.json({ error: "Broker not available" }, { status: 404 });
    }

    const { error } = await supabase.from("broker_inquiries").insert({
      broker_id: brokerId,
      from_name: fromName,
      from_email: fromEmail,
      from_region: fromRegion,
      destination_region: destRegion,
      message,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // TODO: hook up Resend/Postmark/SMTP to actually email broker.public_email.
    // For this MVP the inquiry lives in broker_inquiries and admins follow up
    // manually from the admin panel.
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
