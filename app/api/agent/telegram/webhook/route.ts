/* Telegram Bot API webhook.
 *
 * Telegram POSTs Update objects here. We:
 *   1. Verify X-Telegram-Bot-Api-Secret-Token against TELEGRAM_WEBHOOK_SECRET.
 *   2. Parse update.message (skip edits, callback queries, etc. for v2).
 *   3. Handle slash commands (/start, /link, /unlink, /help, /balance)
 *      directly without going through the agent runtime.
 *   4. For free-text: look up agent_telegram_links → if linked, dispatch
 *      via the same runtime as WhatsApp; if not, prompt /start.
 *
 * We always 200 OK to Telegram fast (within ~5s); heavy work runs in the
 * background. Telegram retries on non-2xx, so we'd rather drop a reply
 * than tell Telegram we failed.
 */

import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { dispatch } from "@/lib/agent/runtime/dispatcher";
import { loadPersona } from "@/lib/agent/runtime/persona";
import { TIER_DEFAULTS, currentMonthKey } from "@/lib/agent/runtime/budget";
import type { Tier, UserContext } from "@/lib/agent/runtime/types";
import { sendTelegramText } from "../send/_send";

export const runtime = "nodejs";
// Webhook runs the full hybrid agent (classifier → executor/orchestrator
// → formatter, plus tool calls). Hobby default is 10s, which 504s mid-
// tool. 60s is the Hobby ceiling.
export const maxDuration = 60;

interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
}

interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type?: string };
  date: number;
  text?: string;
}

interface TgUpdate {
  update_id?: number;
  message?: TgMessage;
  edited_message?: TgMessage;
}

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/* Same trick as WhatsApp: mint a session as the linked user so the
 * runtime sees a properly-scoped Supabase client. RLS still applies. */
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
  const url = new URL(linkData.properties.action_link);
  const token = url.searchParams.get("token");
  const type = url.searchParams.get("type") as "magiclink" | "signup" | null;
  if (!token || !type) throw new Error("malformed action link");

  const sessionClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data: verified, error: verifyErr } =
    await sessionClient.auth.verifyOtp({ token_hash: token, type });
  if (verifyErr || !verified.session || !verified.user) {
    throw new Error(`verifyOtp failed: ${verifyErr?.message ?? "no session"}`);
  }
  await sessionClient.auth.setSession({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  });
  return { client: sessionClient, user: verified.user };
}

async function lookupTier(
  client: ReturnType<typeof admin>,
  userId: string
): Promise<Tier> {
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

interface LinkRow {
  workspace_id: string;
  user_id: string;
  telegram_user_id: number;
}

async function findLink(telegramUserId: number): Promise<LinkRow | null> {
  const adm = admin();
  const { data } = await adm
    .from("agent_telegram_links")
    .select("workspace_id, user_id, telegram_user_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (!data) return null;
  return {
    workspace_id: data.workspace_id as string,
    user_id: data.user_id as string,
    telegram_user_id: Number(data.telegram_user_id),
  };
}

async function tryLink(
  code: string,
  tgUser: TgUser
): Promise<{ ok: boolean; reply: string }> {
  const adm = admin();
  const { data: codeRow } = await adm
    .from("agent_telegram_link_codes")
    .select("workspace_id, user_id, expires_at")
    .eq("code", code)
    .maybeSingle();
  if (!codeRow) {
    return {
      ok: false,
      reply:
        "That code didn't match. Open Spacefield → Settings → AI to generate a fresh one.",
    };
  }
  if (new Date(codeRow.expires_at).getTime() < Date.now()) {
    return {
      ok: false,
      reply:
        "That code expired. Open Spacefield → Settings → AI to generate a fresh one.",
    };
  }
  const { error: insertErr } = await adm.from("agent_telegram_links").insert({
    workspace_id: codeRow.workspace_id,
    user_id: codeRow.user_id,
    telegram_user_id: tgUser.id,
    telegram_username: tgUser.username ?? null,
  });
  if (insertErr) {
    if (insertErr.code === "23505") {
      return {
        ok: false,
        reply:
          "This Telegram account is already linked to a Spacefield account. Unlink it first from Settings → AI.",
      };
    }
    return { ok: false, reply: `Couldn't link: ${insertErr.message}` };
  }
  await adm.from("agent_telegram_link_codes").delete().eq("code", code);
  // Pull persona for the welcome message.
  const persona = await loadPersona(adm, codeRow.workspace_id);
  return {
    ok: true,
    reply: `Linked. Hello ${persona.bot_name}.\n\nTry "show my pipeline" or send /help.`,
  };
}

async function handleStart(msg: TgMessage): Promise<string> {
  const text = msg.text ?? "";
  const arg = text.replace(/^\/start\s*/i, "").trim();
  if (arg && /^\d{6}$/.test(arg) && msg.from) {
    const { reply } = await tryLink(arg, msg.from);
    return reply;
  }
  if (msg.from) {
    const link = await findLink(msg.from.id);
    if (link) {
      return "You're already linked. Try 'show my pipeline' or send /help.";
    }
  }
  return "Hi. Open Spacefield → Settings → AI → Link Telegram, then click the deep link to connect this chat to your workspace.";
}

async function handleHelp(): Promise<string> {
  return [
    "I'm your Spacefield workspace assistant on Telegram.",
    "",
    "What I can do:",
    "- Manage CRM contacts, companies, deals, leads, activities",
    "- Search workspace files",
    "- Manage boards (Notion-style records)",
    "- Workspace info: members, roles, invites",
    "",
    "Try:",
    "- show my pipeline",
    "- create a deal called Acme Corp Q4 for $25k",
    "- what's my balance",
    "",
    "Commands: /balance /unlink /help",
  ].join("\n");
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

async function handleBalance(link: LinkRow): Promise<string> {
  const adm = admin();
  const tier = await lookupTier(adm, link.user_id);
  const month = currentMonthKey();
  const { data } = await adm
    .from("agent_credit_balances")
    .select("quick_used, quick_cap, deep_used, deep_cap")
    .eq("workspace_id", link.workspace_id)
    .eq("user_id", link.user_id)
    .eq("month", month)
    .maybeSingle();
  const caps = TIER_DEFAULTS[tier];
  const qu = Number(data?.quick_used ?? 0);
  const qc = Number(data?.quick_cap ?? caps.quick);
  const du = Number(data?.deep_used ?? 0);
  const dc = Number(data?.deep_cap ?? caps.deep);
  return [
    `Tier: ${tier}`,
    `Quick: ${fmtTokens(qu)} / ${fmtTokens(qc)}`,
    `Deep: ${fmtTokens(du)} / ${fmtTokens(dc)}`,
  ].join("\n");
}

async function handleUnlink(link: LinkRow): Promise<string> {
  const adm = admin();
  await adm
    .from("agent_telegram_links")
    .delete()
    .eq("workspace_id", link.workspace_id)
    .eq("user_id", link.user_id);
  return "Unlinked. Send /start to relink.";
}

async function processMessage(msg: TgMessage): Promise<void> {
  if (!msg.text || !msg.from) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // Slash commands first.
  if (text.startsWith("/")) {
    const cmd = text.split(/\s+/)[0].toLowerCase().split("@")[0];
    if (cmd === "/start") {
      const reply = await handleStart(msg);
      await sendTelegramText(chatId, reply);
      return;
    }
    if (cmd === "/help") {
      await sendTelegramText(chatId, await handleHelp());
      return;
    }
    const link = await findLink(msg.from.id);
    if (cmd === "/link") {
      if (link) {
        await sendTelegramText(chatId, "You're already linked.");
      } else {
        await sendTelegramText(
          chatId,
          "Open Spacefield → Settings → AI → Link Telegram to get a code."
        );
      }
      return;
    }
    if (!link) {
      await sendTelegramText(
        chatId,
        "Not linked yet. Open Spacefield → Settings → AI → Link Telegram."
      );
      return;
    }
    if (cmd === "/balance") {
      await sendTelegramText(chatId, await handleBalance(link));
      return;
    }
    if (cmd === "/unlink") {
      await sendTelegramText(chatId, await handleUnlink(link));
      return;
    }
    await sendTelegramText(
      chatId,
      `Unknown command ${cmd}. Try /help.`
    );
    return;
  }

  // Free text → runtime.
  const link = await findLink(msg.from.id);
  if (!link) {
    await sendTelegramText(
      chatId,
      "Not linked yet. Open Spacefield → Settings → AI → Link Telegram, then click the deep link."
    );
    return;
  }

  try {
    const adm = admin();
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
      channel: "telegram",
    };
    const result = await dispatch(
      {
        kind: "text",
        channel: "telegram",
        text,
        from: String(msg.from.id),
        receivedAt: new Date().toISOString(),
      },
      ctx
    );
    await sendTelegramText(chatId, result.reply);
  } catch (e) {
    console.error("[telegram webhook] dispatch failed", e);
    await sendTelegramText(
      chatId,
      "I hit an error processing that. Try again in a moment."
    );
  }
}

export async function POST(req: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const provided = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || !provided) {
    return new NextResponse("invalid secret", { status: 401 });
  }
  // Timing-safe comparison so the secret can't be brute-forced via
  // response-latency analysis. Buffers must match length first or
  // timingSafeEqual throws.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new NextResponse("invalid secret", { status: 401 });
  }
  let payload: TgUpdate = {};
  try {
    payload = (await req.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }
  const msg = payload.message ?? payload.edited_message;
  if (!msg) return NextResponse.json({ ok: true });

  // Fire and forget — Telegram only cares about the 200.
  void processMessage(msg).catch((e) => {
    console.error("[telegram webhook] processMessage", e);
  });

  return NextResponse.json({ ok: true });
}
