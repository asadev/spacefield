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

export type CustomDomainScope = "workspace" | "share";

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

/* ─────────────────────────── v2 types ─────────────────────────── */

export type SkillKind = "code" | "custom";
export type SkillStatus = "live" | "draft" | "disabled";

/** Tool definition shape inside a custom skill's tools_json. */
export interface SkillToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  read_only: boolean;
  handler_kind: "rpc" | "http";
  handler_target: string; // RPC name OR HTTP URL
  handler_params?: Record<string, unknown>;
  requires_confirmation?: boolean;
}

export interface AiSkillRow {
  id: string;
  kind: SkillKind;
  display_name: string;
  description: string;
  system_fragment: string;
  status: SkillStatus;
  handler_module: string | null;
  tools_json: SkillToolDef[];
  allowed_workspace_roles: WorkspaceRole[];
  requires_confirmation_default: boolean;
  category: string;
  icon: string | null;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export type ModelProvider =
  | "anthropic" | "openai" | "google" | "xai" | "meta" | "mistral" | "custom";
export type ModelStatus = "live" | "beta" | "deprecated";
export type CapabilityTier = "flagship" | "balanced" | "fast" | "reasoning";

export interface AiModelRow {
  id: string;
  provider: ModelProvider;
  label: string;
  context_window: number;
  max_output_tokens: number;
  supports_vision: boolean;
  supports_thinking: boolean;
  supports_tools: boolean;
  cost_input_per_million: number;
  cost_output_per_million: number;
  status: ModelStatus;
  capability_tier: CapabilityTier;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export type CallKind = "classifier" | "executor" | "orchestrator" | "formatter";

export interface RuntimeModelAssignmentRow {
  call_kind: CallKind;
  model_id: string;
  fallback_model_id: string | null;
  temperature: number;
  max_tokens: number;
  metadata: Record<string, unknown>;
  updated_at: string;
  updated_by: string | null;
}

export type EmailCategory = "transactional" | "marketing" | "auth" | "notification" | "digest";
export type EmailRole = "noreply" | "hello" | "info" | "support" | "sales" | "invites" | "security" | "legal";

export interface EmailTemplateRow {
  key: string;
  display_name: string;
  description: string;
  category: EmailCategory;
  role: EmailRole;
  subject: string;
  html: string;
  plain_text: string | null;
  variables_json: string[];
  enabled: boolean;
  locale: string;
  last_test_send_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface EmailSendRow {
  id: string;
  template_key: string | null;
  to_email: string;
  subject: string;
  status: "queued" | "sent" | "failed" | "bounced";
  provider_id: string | null;
  error: string | null;
  sent_by: string | null;
  workspace_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface WebhookEndpointRow {
  id: string;
  workspace_id: string | null;
  name: string;
  url: string;
  events: string[];
  secret: string;
  enabled: boolean;
  max_retries: number;
  last_delivery_at: string | null;
  last_delivery_status: string | null;
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type WebhookDeliveryStatus =
  | "pending" | "success" | "timeout" | "network_error" | "non_2xx"
  | "signing_skipped" | "retry_scheduled" | "exhausted";

export interface WebhookDeliveryV2Row {
  id: string;
  endpoint_id: string;
  event: string;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  http_status: number | null;
  response_excerpt: string | null;
  attempted_at: string;
  duration_ms: number | null;
  signed: boolean;
  attempt: number;
  metadata: Record<string, unknown>;
}

export interface CronJobRow {
  id: string;
  path: string;
  schedule: string;
  description: string;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_duration_ms: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface CronRunRow {
  id: string;
  job_id: string | null;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "error" | "timeout" | "disabled";
  summary: string | null;
  error: string | null;
  triggered_by: "cron" | "manual" | "webhook" | "test";
  metadata: Record<string, unknown>;
}

export interface ApiTokenRow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  name: string;
  token_hash: string;
  prefix: string;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  created_at: string;
  revoked_at: string | null;
}

export type AlertConditionType =
  | "signup_drop" | "webhook_failures" | "error_rate" | "cron_missed"
  | "low_credit" | "custom_query" | "agent_failures" | "storage_pct";

export interface AdminAlertRow {
  id: string;
  name: string;
  description: string;
  condition_type: AlertConditionType;
  condition_params: Record<string, unknown>;
  action_channels: ("email" | "telegram" | "whatsapp")[];
  action_recipients: string[];
  cooldown_minutes: number;
  enabled: boolean;
  last_evaluated_at: string | null;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface UserFeatureOverrideRow {
  user_id: string;
  flag_key: string;
  enabled: boolean;
  reason: string | null;
  set_by: string | null;
  created_at: string;
}

export interface WorkspaceFeatureOverrideRow {
  user_id: string;
  flag_key: string;
  enabled: boolean;
  reason: string | null;
  set_by: string | null;
  created_at: string;
}

/** API token scope catalogue. Single source of truth for the new-token
 * picker UI. Add new scopes here as features ship. */
export const API_SCOPES = [
  "read:profile",
  "read:workspaces",
  "read:files",
  "write:files",
  "read:crm",
  "write:crm",
  "read:boards",
  "write:boards",
  "agent:dispatch",
  "admin:read",
  "admin:write",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** Email role catalog. Mirror of lib/email-senders.ts. */
export const EMAIL_ROLES: EmailRole[] = [
  "noreply", "hello", "info", "support", "sales", "invites", "security", "legal",
];

/** Call-kinds the runtime dispatches with. */
export const CALL_KINDS: CallKind[] = ["classifier", "executor", "orchestrator", "formatter"];

/** Provider enum for the model dropdown. */
export const MODEL_PROVIDERS: ModelProvider[] = [
  "anthropic", "openai", "google", "xai", "meta", "mistral", "custom",
];
