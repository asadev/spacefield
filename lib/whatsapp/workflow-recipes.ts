/**
 * Prebuilt clonable workflow recipes (EPIC-19). Each recipe is a step-list graph
 * { trigger, conditions, actions[] } in the SAME action vocabulary the shared
 * executor runs. Cloning a recipe just seeds whatsapp_workflows.graph; the
 * operator edits it in the builder. Menus are NUMBERED TEXT (no native buttons).
 *
 * Not server-only — imported by the route (server) and safe to surface to the
 * builder UI for previews.
 */

export interface WorkflowRecipe {
  key: string;
  name: string;
  description: string;
  graph: {
    trigger: "conversation_created" | "message_created";
    conditions: Record<string, unknown>;
    actions: Array<{ type: string; params: Record<string, unknown> }>;
  };
}

export const WORKFLOW_RECIPES: Record<string, WorkflowRecipe> = {
  welcome: {
    key: "welcome",
    name: "Welcome new customer",
    description:
      "First time someone messages, send a warm greeting + a numbered menu of options.",
    graph: {
      trigger: "conversation_created",
      conditions: { first_message_only: true },
      actions: [
        {
          type: "send_menu",
          params: {
            header:
              "Assalam o Alaikum! 👋 Thanks for reaching out. How can we help today?",
            options: ["See prices", "Check availability", "Talk to a person"],
            footer: "Reply with a number (1-3).",
          },
        },
      ],
    },
  },
  lead_qualification: {
    key: "lead_qualification",
    name: "Lead qualification",
    description:
      "Ask a qualifying question and label the conversation as a lead for follow-up.",
    graph: {
      trigger: "conversation_created",
      conditions: { first_message_only: true },
      actions: [
        {
          type: "send_text",
          params: {
            text:
              "Great to hear from you{{contact.firstName}}! To help fast — are you buying for yourself or for resale, and which city are you in?",
          },
        },
      ],
    },
  },
  faq_bot: {
    key: "faq_bot",
    name: "FAQ auto-reply",
    description:
      "When a message mentions price/delivery/timing keywords, reply with your standard answer.",
    graph: {
      trigger: "message_created",
      conditions: {
        keywords: ["price", "rate", "kitna", "delivery", "shipping", "timing", "hours"],
        match: "contains",
      },
      actions: [
        {
          type: "send_text",
          params: {
            text:
              "Thanks for asking! 💬 Prices and delivery details are shared on request — tell us the item you're interested in and your city, and we'll send the exact rate.",
          },
        },
      ],
    },
  },
  csat: {
    key: "csat",
    name: "CSAT (reply 1-5)",
    description:
      "Ask for a 1-5 satisfaction rating. Pair with a rule that labels the reply.",
    graph: {
      trigger: "message_created",
      conditions: { keywords: ["thanks", "thank you", "shukria", "done"], match: "contains" },
      actions: [
        {
          type: "send_menu",
          params: {
            header: "Glad we could help! 🙏 How was your experience?",
            options: ["⭐ (poor)", "⭐⭐", "⭐⭐⭐", "⭐⭐⭐⭐", "⭐⭐⭐⭐⭐ (great)"],
            footer: "Reply 1-5.",
          },
        },
      ],
    },
  },
  ai_concierge: {
    key: "ai_concierge",
    name: "AI concierge (auto-draft)",
    description:
      "Let AI draft + send a context-aware reply to incoming messages (requires an AI key).",
    graph: {
      trigger: "message_created",
      conditions: { match: "any" },
      actions: [{ type: "ai_reply", params: {} }],
    },
  },
};
