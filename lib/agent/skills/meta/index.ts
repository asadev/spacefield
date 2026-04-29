/* Meta skill — help, balance, "what can you do".
 *
 * These are read-only and always available, even on the free tier and
 * even when the user is over budget (we want them to be able to ask
 * "how do I get more credits?" without being blocked).
 */

import { toolError, toolOk } from "../_helpers";
import { currentMonthKey } from "@/lib/agent/runtime/budget";
import type { SkillDefinition, ToolDefinition } from "@/lib/agent/runtime/types";

const get_help: ToolDefinition = {
  name: "get_help",
  description:
    "Return a short capability summary — what skills the assistant has and example things it can do.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  read_only: true,
  execute: async () => {
    return toolOk({
      capabilities: [
        "Manage CRM contacts, companies, deals, leads, and activities",
        "Search workspace files and view metadata",
        "Manage workspace boards (Notion/Monday-style records)",
        "Workspace info: list members, see who's an admin, invite people",
      ],
      examples: [
        "show my pipeline",
        "create a deal called Acme Corp Q4 for $25k",
        "schedule a call with Dana tomorrow at 3pm",
        "convert my new lead into a deal",
        "find the Q4 contract file",
      ],
    });
  },
};

const get_credit_balance: ToolDefinition = {
  name: "get_credit_balance",
  description:
    "Get the user's current month credit balance for both Quick and Deep buckets.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  read_only: true,
  execute: async (_input, ctx) => {
    const month = currentMonthKey();
    const { data, error } = await ctx.supabase
      .from("agent_credit_balances")
      .select("quick_used, quick_cap, deep_used, deep_cap, month")
      .eq("workspace_id", ctx.workspaceId)
      .eq("user_id", ctx.userId)
      .eq("month", month)
      .maybeSingle();
    if (error) return toolError(error.message);
    return toolOk(data ?? { quick_used: 0, quick_cap: 0, deep_used: 0, deep_cap: 0, month });
  },
};

const about_spacefield: ToolDefinition = {
  name: "about_spacefield",
  description:
    "Return a short description of Spacefield — for users asking 'what is this'.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  read_only: true,
  execute: async () => {
    return toolOk({
      description:
        "Spacefield is a workspace OS — CRM, files, boards, and more, all in one place. This assistant lets you do work in your Spacefield workspace by texting.",
      site: "https://spacefield.co",
    });
  },
};

export const metaSkill: SkillDefinition = {
  id: "meta",
  label: "Meta",
  description: "Help, capabilities, credit balance, about.",
  systemFragment:
    "Meta tools are always available. For greetings or 'what can you do', call get_help. For 'am I out of credits?' or 'how much have I used', call get_credit_balance.",
  tools: [get_help, get_credit_balance, about_spacefield],
};
