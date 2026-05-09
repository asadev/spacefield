/* Internal Telegram sendMessage helper — extracted from route.ts so
 * the file `route.ts` only exports HTTP method handlers (Next 16 strict
 * route-export rules under webpack reject named non-handler exports).
 *
 * Server-side callers: the webhook handler in `../webhook/route.ts`
 * and the POST handler in `./route.ts`.
 */

export interface SendResult {
  ok: boolean;
  status: number;
  body: unknown;
}

export async function sendTelegramText(
  chatId: number,
  text: string,
): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { ok: false, status: 0, body: "missing TELEGRAM_BOT_TOKEN" };
  }
  // Telegram caps single messages at 4096 chars.
  const safe = text.length > 4096 ? text.slice(0, 4093) + "..." : text;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: safe,
      disable_web_page_preview: true,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}
