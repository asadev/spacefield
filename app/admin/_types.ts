/**
 * Shared admin-panel types. Mirrors Postgres tables created in
 * supabase/migrations/20260509_admin_panel_foundation.sql. All sub-routes
 * import from here so we have a single source of truth.
 */

export type AppDomain = "re" | "solutions" | "os" | "admin";

export type AppAccessMode =
  | "public"
  | "authenticated"
  | "tier"
  | "allowlist"
  | "admin_only";

export interface AppRegistryRow {
  id: string;
  domain: AppDomain;
  title: string;
  description: string;
  category: string;
  icon: string | null;
  published: boolean;
  access_mode: AppAccessMode;
  access_tiers: string[];
  allowlist_user_ids: string[];
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface UserAppGrantRow {
  user_id: string;
  slug: string;
  granted: boolean;
  granted_by: string | null;
  reason: string | null;
  created_at: string;
}

export type FeatureRollout = "off" | "on" | "allowlist" | "percent";

export interface FeatureFlagRow {
  key: string;
  title: string;
  description: string;
  enabled: boolean;
  rollout: FeatureRollout;
  rollout_percent: number;
  allowlist_user_ids: string[];
  allowlist_workspace_ids: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export type AgentKind = "chat" | "tool-sidekick" | "system";
export type AgentStatus = "live" | "draft" | "disabled";
export type AgentAccessMode =
  | "all"
  | "tier"
  | "workspace_role"
  | "allowlist"
  | "admin_only";

export interface AiAgentRow {
  id: string;
  display_name: string;
  description: string;
  kind: AgentKind;
  model: string;
  fast_model: string;
  system_prompt: string;
  greeting: string;
  allowed_skills: string[];
  allowed_tools: string[];
  temperature: number;
  max_tokens: number;
  status: AgentStatus;
  access_mode: AgentAccessMode;
  access_tiers: string[];
  access_roles: string[];
  allowlist_user_ids: string[];
  icon: string | null;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface AiAgentRunRow {
  id: string;
  agent_id: string | null;
  workspace_id: string | null;
  user_id: string | null;
  channel: string | null;
  status: "success" | "error" | "denied" | "timeout";
  input_excerpt: string | null;
  output_excerpt: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  duration_ms: number | null;
  model: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type CustomDomainStatus =
  | "pending"
  | "txt_verified"
  | "cname_verified"
  | "active"
  | "failed"
  | "disabled";

export type CustomDomainScope = "workspace" | "toshare";

export interface WorkspaceCustomDomainRow {
  id: string;
  workspace_id: string;
  domain: string;
  cname_target: string;
  txt_token: string;
  txt_verified_at: string | null;
  cname_verified_at: string | null;
  added_to_vercel_at: string | null;
  status: CustomDomainStatus;
  scope: CustomDomainScope;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminAuditLogRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type AuthEventName =
  | "sign_in"
  | "sign_out"
  | "sign_up"
  | "password_reset"
  | "magic_link"
  | "password_change"
  | "email_change"
  | "mfa_enabled"
  | "mfa_disabled"
  | "suspended"
  | "unsuspended";

export interface AuthEventRow {
  id: string;
  user_id: string | null;
  email: string | null;
  event: AuthEventName;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Models the platform offers in dropdowns. Single source of truth. */
export const AGENT_MODELS = [
  // Claude (most capable to fastest)
  { id: "claude-opus-4-7",                provider: "anthropic", label: "Claude Opus 4.7",   tier: "flagship" },
  { id: "claude-sonnet-4-6",              provider: "anthropic", label: "Claude Sonnet 4.6", tier: "balanced" },
  { id: "claude-haiku-4-5-20251001",      provider: "anthropic", label: "Claude Haiku 4.5",  tier: "fast" },
  // OpenAI fallback
  { id: "gpt-5",                          provider: "openai",    label: "GPT-5",             tier: "flagship" },
  { id: "gpt-5-mini",                     provider: "openai",    label: "GPT-5 Mini",        tier: "fast" },
] as const;

export type AgentModelId = (typeof AGENT_MODELS)[number]["id"];

/** Workspace roles enum mirror. */
export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Tiers used as the source of truth in dropdowns. Mirrors
 * subscription_tiers but without DB roundtrips for static UI. */
export const TIER_IDS = ["free", "pro", "team", "enterprise"] as const;
export type TierId = (typeof TIER_IDS)[number];
