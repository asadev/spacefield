/* Shared types for the Spacefield AI agent runtime.
 *
 * Forward-compatible: `IncomingMessage.kind` is a discriminated union so a
 * future `'voice'` variant (Whisper transcript) can be added without
 * touching the existing call sites. v1 only ships text.
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";

export type IncomingChannel = "whatsapp" | "in_app" | "telegram";

/** Optional scoping for the in-app per-app chat. Restricts the skill
 *  catalog the executor sees. `null` = no scope (default). */
export type DispatchScope = "crm" | "files" | "boards" | null;

/** Forward-compatible incoming message. */
export type IncomingMessage =
  | {
      kind: "text";
      channel: IncomingChannel;
      text: string;
      from: string; // sender phone (E.164) for whatsapp, user id for in_app
      receivedAt: string; // ISO timestamp
    }
  | {
      kind: "voice"; // Phase 2 — placeholder so types stay stable
      channel: IncomingChannel;
      audioRef: string;
      from: string;
      receivedAt: string;
    };

export type Tier = "free" | "pro" | "team" | "enterprise";

export type ConversationRole = "user" | "assistant";

export interface ConversationMessage {
  role: ConversationRole;
  content: string;
}

export interface UserContext {
  userId: string;
  workspaceId: string;
  tier: Tier;
  role: "owner" | "admin" | "member" | "viewer";
  /**
   * The caller's Supabase client — already authenticated as the user. Tools
   * MUST use this instead of service-role so RLS continues to apply.
   */
  supabase: SupabaseClient;
  user: User;
  /** Channel the request came in on, for reply formatting heuristics. */
  channel: IncomingChannel;
}

export type JsonSchema = Record<string, unknown>;

export interface ToolExecuteResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolDefinition {
  /** Stable, snake_case name surfaced to the LLM. */
  name: string;
  /** Plain-English description for the LLM. */
  description: string;
  /** JSON Schema for the tool's input. */
  input_schema: JsonSchema;
  /** Minimum workspace role required. Default: 'member'. */
  required_role?: "owner" | "admin" | "member";
  /** Free-tier may only call read_only=true tools. */
  read_only: boolean;
  /**
   * Execute the tool against the user's workspace. ctx.supabase is the
   * caller-scoped client — RLS applies. Throw or return ok:false on failure;
   * never raise to the caller.
   */
  execute: (input: unknown, ctx: UserContext) => Promise<ToolExecuteResult>;
}

export interface SkillDefinition {
  /** e.g. 'crm.deals' */
  id: string;
  /** Human label, used in catalog. */
  label: string;
  /** Short description; included in the classifier-visible skill list. */
  description: string;
  /** Fragment appended to the executor/orchestrator system prompt when the skill is in scope. */
  systemFragment: string;
  /** Tools owned by this skill. */
  tools: ToolDefinition[];
}

/** Output of the GPT-4o mini classifier. */
export interface ClassifierResult {
  intent: string;
  skills: string[]; // skill ids the executor should have access to
  complexity: "simple" | "complex" | "off_topic";
  requires_clarification: boolean;
  /** When complexity === 'off_topic' or requires_clarification, a one-line direct reply. */
  suggested_reply?: string;
}

export type CallKind =
  | "classifier"
  | "executor"
  | "orchestrator"
  | "formatter"
  | "tool_summarizer";

export type Bucket = "quick" | "deep";

/** Token usage from a single model call. */
export interface CallUsage {
  bucket: Bucket;
  tokens: number;
  model: string;
  callKind: CallKind;
}

export interface DispatchResult {
  reply: string;
  usage: CallUsage[];
  /** True when the user was over-budget; reply is a short upsell. */
  budgetExhausted?: boolean;
  /** When the bot needs the user to confirm a write, this is set. The
   *  /api/agent/dispatch endpoint surfaces it to the in-app chat as a
   *  visible callout. The reply already contains the same prompt. */
  requiresApproval?: {
    skillId: string;
    toolName: string;
    summary: string;
  };
  /** Sum of credits debited during this dispatch. */
  creditUsed?: { quick: number; deep: number };
}
