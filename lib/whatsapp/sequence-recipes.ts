/**
 * Prebuilt clonable drip-sequence recipes (EPIC-19). Each is a list of
 * time-delayed steps in the shared action vocabulary; cloning seeds
 * whatsapp_sequences.steps for the operator to edit. delay_minutes is relative
 * to the PREVIOUS step (step 0 fires at enrollment).
 *
 * Not server-only — imported by the route (server) + safe for builder previews.
 */

export interface SequenceRecipe {
  key: string;
  name: string;
  description: string;
  steps: Array<{
    delay_minutes: number;
    actions: Array<{ type: string; params: Record<string, unknown> }>;
  }>;
  exit_conditions: { on_reply?: boolean };
}

const DAY = 60 * 24;

export const SEQUENCE_RECIPES: Record<string, SequenceRecipe> = {
  welcome_nurture: {
    key: "welcome_nurture",
    name: "Welcome nurture (3 messages)",
    description:
      "Greet now, share value tomorrow, gentle nudge in 3 days. Stops if they reply.",
    steps: [
      {
        delay_minutes: 0,
        actions: [
          {
            type: "send_text",
            params: {
              text:
                "Thanks for connecting{{contact.firstName}}! 🙏 We'll keep you posted on new arrivals and offers. Reply anytime.",
            },
          },
        ],
      },
      {
        delay_minutes: DAY,
        actions: [
          {
            type: "send_text",
            params: {
              text:
                "Quick tip: tell us what you're looking for (item + city) and we'll send the exact price + availability fast. 💬",
            },
          },
        ],
      },
      {
        delay_minutes: DAY * 3,
        actions: [
          {
            type: "send_text",
            params: {
              text:
                "Still browsing? We've got fresh stock this week. Want us to send a few options? 🛍️",
            },
          },
        ],
      },
    ],
    exit_conditions: { on_reply: true },
  },
  abandoned_inquiry: {
    key: "abandoned_inquiry",
    name: "Re-engage quiet inquiry",
    description:
      "If a customer went quiet, a 1-day and 3-day nudge. Stops the moment they reply.",
    steps: [
      {
        delay_minutes: DAY,
        actions: [
          {
            type: "send_text",
            params: {
              text:
                "Hi{{contact.firstName}}! Just checking in — did you still want details on what you asked about? Happy to help. 😊",
            },
          },
        ],
      },
      {
        delay_minutes: DAY * 2,
        actions: [
          {
            type: "send_text",
            params: {
              text:
                "No rush! If you're still interested, reply here and we'll sort it out for you. 🙏",
            },
          },
        ],
      },
    ],
    exit_conditions: { on_reply: true },
  },
  post_sale_followup: {
    key: "post_sale_followup",
    name: "Post-sale follow-up + review",
    description:
      "Thank-you next day, then a CSAT ask after 3 days. Stops on reply.",
    steps: [
      {
        delay_minutes: DAY,
        actions: [
          {
            type: "send_text",
            params: {
              text:
                "Thank you for your order{{contact.firstName}}! 🎉 Hope you love it. Reach out if you need anything.",
            },
          },
        ],
      },
      {
        delay_minutes: DAY * 3,
        actions: [
          {
            type: "send_menu",
            params: {
              header: "How was your experience with us?",
              options: ["⭐", "⭐⭐", "⭐⭐⭐", "⭐⭐⭐⭐", "⭐⭐⭐⭐⭐"],
              footer: "Reply 1-5 — it really helps! 🙏",
            },
          },
        ],
      },
    ],
    exit_conditions: { on_reply: true },
  },
};
