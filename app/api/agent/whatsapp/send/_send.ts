/* Internal WhatsApp sendMessage helper — extracted from route.ts so
 * the file `route.ts` only exports HTTP method handlers (Next 16
 * strict route-export rules under webpack reject named non-handler
 * exports).
 *
 * Server-side callers: the webhook handler in `../webhook/route.ts`
 * and the POST handler in `./route.ts`.
 */

const GRAPH_VERSION = "v22.0";

export interface SendResult {
  ok: boolean;
  status: number;
  body: unknown;
}

/** Send a plain-text WhatsApp message via the Meta Cloud API. */
export async function sendWhatsAppText(
  to: string,
  text: string,
): Promise<SendResult> {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!phoneNumberId || !token) {
    return {
      ok: false,
      status: 0,
      body: "missing META_WHATSAPP_PHONE_NUMBER_ID or META_SYSTEM_USER_TOKEN",
    };
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}
