/* Inline event catalogue for webhook subscriptions.
 *
 * Single source of truth for the multi-select on /admin/webhooks/new and
 * /admin/webhooks/[id]. Keep alphabetical-ish (auth → biz → ops). When
 * adding a new event, also wire whatever emits it to call `sendSigned`
 * with the matching event name. */

export const WEBHOOK_EVENTS = [
  "form.submitted",
  "form.spam",
  "quote.accepted",
  "booking.created",
  "booking.cancelled",
  "file.shared",
  "agent.run",
  "agent.error",
  "signin",
  "signup",
  "subscription.changed",
  "workspace.created",
  "workspace.paused",
] as const;

export type WebhookEventName = (typeof WEBHOOK_EVENTS)[number];
