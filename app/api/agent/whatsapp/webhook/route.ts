/* Meta WhatsApp Cloud API webhook.
 *
 * GET — verification handshake. Meta hits this once when registering the
 * webhook with `hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`.
 * We compare the verify_token against env and echo the challenge.
 *
 * POST — every inbound message + status update. We:
 *   1. Verify the X-Hub-Signature-256 HMAC against the raw body.
 *   2. Parse out user-text events (skip statuses, reactions, system).
 *   3. For each text: look up the sender phone in agent_whatsapp_links.
 *      - Linked → load the user's session-scoped Supabase client (via a
 *        signed JWT minted from the service role for that user_id) and
 *        dispatch through the runtime.
 *      - Not linked → look for a 6-digit code in the body; if found,
 *        link and reply "✅ WhatsApp linked".
 *   4. Send the reply via the Graph API.
 *
 * We always return 200 to Meta within ~5 seconds — they retry otherwise.
 * Heavy work (model calls) happens after we've spawned the response.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { dispatch } from "@/lib/agent/runtime/dispatcher";
import type { Tier, UserContext } from "@/lib/agent/runtime/types";
import { sendWhatsAppText } from "../send/route";

export const runtime = "nodejs";

interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

interface WhatsAppValue {
  messaging_product?: string;
  metadata?: { phone_number_id?: string };
  messages?: WhatsAppMessage[];
  statuses?: unknown[];
}

interface WebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: WhatsAppValue;
      field?: string;
    }>;
  }>;
}

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/* For acting "as the user" inside the runtime we need a Supabase client
 * scoped to that user's auth.uid() so RLS continues to apply. We cannot
 * mint user JWTs from the service-role key without going through the
 * GoTrue admin endpoints, so we use the admin generateLink flow to get
 * the user's session tokens, then build a regular client with that
 * session set. This is a bit roundabout but keeps every tool call
 * RLS-gated. */
async function clientAsUser(userId: string) {
  const adm = admin();
  const { data: userData, error: userErr } =
    await adm.auth.admin.getUserById(userId);
  if (userErr || !userData.user || !userData.user.email) {
    throw new Error(`user lookup failed: ${userErr?.message ?? "no email"}`);
  }
  const { data: linkData, error: linkErr } = await adm.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
  if (linkErr || !linkData.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${linkErr?.message ?? "no token"}`);
  }
  // Verify the OTP server-side to mint a session.
  const url = new URL(linkData.properties.action_link);
  const token = url.searchParams.get("token");
  const type = url.searchParams.get("type") as "magiclink" | "signup" | null;
  if (!token || !type) throw new Error("malformed action link");

  const sessionClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data: verified, error: verifyErr } = await sessionClient.auth.verifyOtp({
    token_hash: token,
    type,
  });
  if (verifyErr || !verified.session || !verified.user) {
    throw new Error(`verifyOtp failed: ${verifyErr?.message ?? "no session"}`);
  }
  // Set the session so subsequent queries run as the user.
  await sessionClient.auth.setSession({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  });
  return { client: sessionClient, user: verified.user };
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature) return false;
  if (!signature.startsWith("sha256=")) return false;
  const provided = Buffer.from(signature.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");
  const expected = process.env.META_WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && token && expected && token === expected) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

async function lookupTier(client: ReturnType<typeof admin>, userId: string): Promise<Tier> {
  const { data } = await client
    .from("subscriptions")
    .select("tier_id")
    .eq("user_id", userId)
    .maybeSingle();
  const tier = (data?.tier_id as string | undefined) ?? "free";
  if (tier === "pro" || tier === "team" || tier === "enterprise") return tier;
  return "free";
}

async function lookupRole(
  client: ReturnType<typeof admin>,
  userId: string,
  workspaceId: string
): Promise<"owner" | "admin" | "member" | "viewer"> {
  const { data } = await client
    .from("workspace_members")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const role = (data?.role as string | undefined) ?? "member";
  if (role === "owner" || role === "admin" || role === "viewer") return role;
  return "member";
}

async function handleLinkingFlow(
  from: string,
  text: string
): Promise<string | null> {
  const code = text.replace(/[^0-9]/g, "");
  if (code.length !== 6) {
    return "Hi! To link this number to your Spacefield workspace, open Spacefield → Settings → AI and tap 'Link WhatsApp'. Send me the 6-digit code.";
  }
  const adm = admin();
  const { data: codeRow } = await adm
    .from("agent_whatsapp_link_codes")
    .select("workspace_id, user_id, expires_at")
    .eq("code", code)
    .maybeSingle();
  if (!codeRow) {
    return "That code didn't match. Open Spacefield → Settings → AI to generate a fresh one.";
  }
  if (new Date(codeRow.expires_at).getTime() < Date.now()) {
    return "That code expired. Open Spacefield → Settings → AI to generate a fresh one.";
  }
  // Upsert the link. ON CONFLICT (whatsapp_number) is unique — if this
  // phone is linked to another user already, surface that.
  const { error: insertErr } = await adm.from("agent_whatsapp_links").insert({
    workspace_id: codeRow.workspace_id,
    user_id: codeRow.user_id,
    whatsapp_number: from,
  });
  if (insertErr) {
    if (insertErr.code === "23505") {
      return "This phone number is already linked to a Spacefield account. Unlink it first from Settings → AI.";
    }
    return `Couldn't link: ${insertErr.message}`;
  }
  await adm.from("agent_whatsapp_link_codes").delete().eq("code", code);
  return "WhatsApp linked. You can now text me to do things in your Spacefield workspace. Try: show my pipeline";
}

async function processMessage(msg: WhatsAppMessage): Promise<void> {
  if (msg.type !== "text" || !msg.text?.body) return;
  const from = msg.from;
  const text = msg.text.body;

  const adm = admin();
  const { data: link } = await adm
    .from("agent_whatsapp_links")
    .select("workspace_id, user_id")
    .eq("whatsapp_number", from)
    .maybeSingle();

  if (!link) {
    const reply = await handleLinkingFlow(from, text);
    if (reply) await sendWhatsAppText(from, reply);
    return;
  }

  try {
    const { client, user } = await clientAsUser(link.user_id);
    const tier = await lookupTier(adm, link.user_id);
    const role = await lookupRole(adm, link.user_id, link.workspace_id);
    const ctx: UserContext = {
      userId: link.user_id,
      workspaceId: link.workspace_id,
      tier,
      role,
      supabase: client,
      user,
      channel: "whatsapp",
    };
    const result = await dispatch(
      {
        kind: "text",
        channel: "whatsapp",
        text,
        from,
        receivedAt: new Date().toISOString(),
      },
      ctx
    );
    await sendWhatsAppText(from, result.reply);
  } catch (e) {
    console.error("[whatsapp webhook] dispatch failed", e);
    await sendWhatsAppText(
      from,
      "I hit an error processing that. Try again in a moment."
    );
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifySignature(raw, signature)) {
    return new NextResponse("invalid signature", { status: 401 });
  }
  let payload: WebhookPayload = {};
  try {
    payload = JSON.parse(raw) as WebhookPayload;
  } catch {
    return new NextResponse("ok", { status: 200 });
  }

  const messages: WhatsAppMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        messages.push(msg);
      }
    }
  }

  // Acknowledge fast. Process in the background; if we crash mid-process
  // Meta will redeliver and we'll handle it on the next attempt.
  void Promise.all(messages.map((m) => processMessage(m).catch(() => {})));

  return NextResponse.json({ received: messages.length });
}
