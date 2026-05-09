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

/* ─────────────────────────── v3 types ─────────────────────────── */

export interface AiProviderRow {
  id: string;
  display_name: string;
  base_url: string | null;
  api_key_env: string;
  api_key_set: boolean;
  status: "live" | "paused" | "disabled";
  cost_quota_usd: number;
  spent_usd: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface AgentToolOverrideRow {
  agent_id: string;
  skill_id: string;
  tool_name: string;
  override_description: string | null;
  override_input_schema: Record<string, unknown> | null;
  read_only_override: boolean | null;
  requires_confirmation_override: boolean | null;
  enabled: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface AgentWorkflowRow {
  id: string;
  display_name: string;
  description: string;
  steps: unknown[];
  trigger_kind: "manual" | "event" | "cron";
  trigger_config: Record<string, unknown>;
  status: "live" | "draft" | "disabled";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export type BannerVariant = "info" | "warning" | "success" | "error";
export type BannerAudience = "all" | "authenticated" | "tier" | "allowlist";

export interface SiteBannerRow {
  id: string;
  message: string;
  cta_label: string | null;
  cta_href: string | null;
  variant: BannerVariant;
  audience: BannerAudience;
  audience_tiers: string[];
  audience_user_ids: string[];
  starts_at: string | null;
  ends_at: string | null;
  enabled: boolean;
  dismissible: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export type PushAudience = "all" | "tier" | "allowlist" | "workspace";
export type PushStatus = "draft" | "scheduled" | "sending" | "sent" | "failed";

export interface PushCampaignRow {
  id: string;
  title: string;
  body: string;
  url: string | null;
  audience: PushAudience;
  audience_tiers: string[];
  audience_user_ids: string[];
  audience_workspace_ids: string[];
  scheduled_at: string | null;
  sent_at: string | null;
  status: PushStatus;
  total_targets: number;
  total_sent: number;
  total_failed: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface MaintenanceStateRow {
  id: 1;
  enabled: boolean;
  message: string;
  read_only: boolean;
  allowlist_user_ids: string[];
  starts_at: string | null;
  ends_at: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type RateLimitScope = "global" | "tier" | "user" | "workspace" | "route";

export interface RateLimitRuleRow {
  id: string;
  scope: RateLimitScope;
  scope_value: string | null;
  route_pattern: string | null;
  limit_count: number;
  window_sec: number;
  burst_count: number | null;
  enabled: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface IpRuleRow {
  id: string;
  cidr: string;
  action: "allow" | "block";
  reason: string | null;
  expires_at: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SecurityPoliciesRow {
  id: 1;
  enforce_2fa: boolean;
  enforce_2fa_for_admins: boolean;
  session_timeout_minutes: number;
  password_min_length: number;
  password_require_uppercase: boolean;
  password_require_number: boolean;
  password_require_symbol: boolean;
  max_login_attempts: number;
  lockout_duration_minutes: number;
  allow_sso_only: boolean;
  metadata: Record<string, unknown>;
  updated_at: string;
}

export interface SsoConfigRow {
  id: string;
  workspace_id: string | null;
  protocol: "saml" | "oidc" | "google" | "microsoft";
  display_name: string;
  entity_id: string | null;
  sso_url: string | null;
  certificate: string | null;
  client_id: string | null;
  client_secret_env: string | null;
  metadata_xml: string | null;
  status: "pending" | "active" | "disabled" | "failed";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BrandConfigRow {
  id: string;
  workspace_id: string | null;
  brand_name: string | null;
  logo_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  font_family: string | null;
  email_footer_html: string | null;
  custom_css: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LocaleRow {
  code: string;
  display_name: string;
  enabled: boolean;
  is_default: boolean;
  rtl: boolean;
  created_at: string;
}

export interface LocaleStringRow {
  locale_code: string;
  string_key: string;
  value: string;
  context: string | null;
  updated_at: string;
}

export type CouponKind = "percent" | "fixed" | "tier_upgrade" | "free_months";

export interface CouponRow {
  code: string;
  description: string;
  kind: CouponKind;
  value: number;
  applies_to_tiers: string[];
  max_redemptions: number | null;
  redemption_count: number;
  per_user_limit: number | null;
  starts_at: string | null;
  ends_at: string | null;
  enabled: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ModerationApplyTo = "chat" | "crm" | "social" | "share" | "any";
export type ModerationAction = "block" | "flag" | "review";

export interface ModerationRuleRow {
  id: string;
  rule_kind: "banned_word" | "regex" | "threshold" | "length";
  pattern: string;
  action: ModerationAction;
  applies_to: ModerationApplyTo;
  severity: number;
  enabled: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ModerationQueueRow {
  id: string;
  source: string;
  source_id: string | null;
  user_id: string | null;
  workspace_id: string | null;
  content: string;
  rule_id: string | null;
  severity: number;
  status: "pending" | "approved" | "rejected" | "escalated";
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
}

export type EvalTargetKind = "agent" | "skill" | "workflow";
export type EvalScoringMethod = "exact" | "contains" | "regex" | "llm_judge" | "custom";

export interface EvalSuiteRow {
  id: string;
  display_name: string;
  description: string;
  cases: unknown[];
  target_kind: EvalTargetKind;
  target_id: string | null;
  scoring_method: EvalScoringMethod;
  enabled: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EvalRunRow {
  id: string;
  suite_id: string | null;
  triggered_by: string | null;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  errored_cases: number;
  duration_ms: number | null;
  status: "running" | "completed" | "failed" | "cancelled";
  results: unknown[];
  metadata: Record<string, unknown>;
  created_at: string;
  finished_at: string | null;
}

export interface PromptLibraryRow {
  id: string;
  display_name: string;
  description: string;
  category: string;
  tags: string[];
  current_version: number;
  status: "live" | "draft" | "archived";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PromptVersionRow {
  prompt_id: string;
  version: number;
  body: string;
  variables: string[];
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export type ErrorLevel = "debug" | "info" | "warning" | "error" | "fatal";

export interface ErrorEventRow {
  id: string;
  occurred_at: string;
  level: ErrorLevel;
  source: string | null;
  message: string;
  fingerprint: string | null;
  user_id: string | null;
  workspace_id: string | null;
  request_id: string | null;
  url: string | null;
  user_agent: string | null;
  stack: string | null;
  context: Record<string, unknown>;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface BackupSnapshotRow {
  id: string;
  kind: "manual" | "scheduled" | "pre_migration";
  scope: "full" | "workspace" | "table";
  scope_target: string | null;
  storage_url: string | null;
  size_bytes: number | null;
  status: "pending" | "running" | "completed" | "failed" | "restored";
  started_at: string;
  finished_at: string | null;
  triggered_by: string | null;
  metadata: Record<string, unknown>;
}

export interface DataExportRequestRow {
  id: string;
  user_id: string | null;
  kind: "gdpr_export" | "deletion" | "workspace_export";
  status: "pending" | "running" | "ready" | "expired" | "failed";
  download_url: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface CohortRow {
  id: string;
  display_name: string;
  description: string;
  definition: Record<string, unknown>;
  user_count: number;
  last_computed_at: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface FunnelRow {
  id: string;
  display_name: string;
  description: string;
  steps: unknown[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  category: "product" | "platform" | "security" | "outage" | "marketing";
  audience: "all" | "admin" | "tier" | "allowlist";
  audience_tiers: string[];
  audience_user_ids: string[];
  pinned: boolean;
  published_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface IntegrationRow {
  id: string;
  display_name: string;
  category: string;
  description: string;
  logo_url: string | null;
  homepage_url: string | null;
  oauth_config: Record<string, unknown> | null;
  status: "available" | "beta" | "disabled" | "deprecated";
  required_env: string[];
  enabled: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WebhookSubscriptionRow {
  id: string;
  workspace_id: string | null;
  created_by: string | null;
  url: string;
  events: string[];
  secret: string | null;
  enabled: boolean;
  description: string | null;
  last_delivery_at: string | null;
  last_delivery_status: string | null;
  failure_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/* ─────────────────────────── v4 types ─────────────────────────── */

export interface HelpCategoryRow {
  id: string;
  display_name: string;
  description: string;
  icon: string | null;
  sort_order: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type HelpArticleStatus = "draft" | "published" | "archived";
export type HelpArticleVisibility = "public" | "authenticated" | "admin_only";

export interface HelpArticleRow {
  id: string;
  category_id: string | null;
  title: string;
  slug: string;
  body: string;
  excerpt: string | null;
  status: HelpArticleStatus;
  visibility: HelpArticleVisibility;
  tags: string[];
  view_count: number;
  helpful_count: number;
  not_helpful_count: number;
  sort_order: number;
  metadata: Record<string, unknown>;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingFlowRow {
  id: string;
  display_name: string;
  description: string;
  trigger_event: string;
  audience: string;
  status: "live" | "draft" | "archived";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type OnboardingStepKind =
  | "welcome" | "tour" | "form" | "video" | "checklist" | "call-to-action";

export interface OnboardingStepRow {
  id: string;
  flow_id: string;
  step_index: number;
  kind: OnboardingStepKind;
  title: string;
  body: string | null;
  cta_label: string | null;
  cta_href: string | null;
  config: Record<string, unknown>;
  created_at: string;
}

export interface ProductTourRow {
  id: string;
  display_name: string;
  description: string;
  trigger_route: string | null;
  trigger_kind: "manual" | "first_visit" | "feature_flag" | "dom_query";
  steps: unknown[];
  status: "live" | "draft" | "archived";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type SupportTicketStatus =
  | "open" | "in_progress" | "waiting_user" | "resolved" | "closed";
export type SupportTicketPriority = "low" | "normal" | "high" | "urgent";

export interface SupportTicketRow {
  id: string;
  user_id: string | null;
  workspace_id: string | null;
  subject: string;
  body: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  assigned_to: string | null;
  category: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  last_response_at: string | null;
}

export interface SupportMessageRow {
  id: string;
  ticket_id: string;
  author_id: string | null;
  is_admin: boolean;
  body: string;
  internal_note: boolean;
  attachments: unknown[];
  created_at: string;
}

export interface ImpersonationSessionRow {
  id: string;
  admin_id: string;
  target_user_id: string;
  reason: string;
  started_at: string;
  ended_at: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
}

export type RefundStatus =
  | "pending" | "approved" | "processed" | "rejected" | "failed";

export interface RefundRow {
  id: string;
  user_id: string | null;
  workspace_id: string | null;
  amount_cents: number;
  currency: string;
  reason: string | null;
  status: RefundStatus;
  external_payment_id: string | null;
  external_refund_id: string | null;
  processed_at: string | null;
  approved_by: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type InvoiceStatus =
  | "draft" | "sent" | "paid" | "overdue" | "void" | "refunded";

export interface InvoiceRow {
  id: string;
  number: string;
  user_id: string | null;
  workspace_id: string | null;
  amount_cents: number;
  currency: string;
  status: InvoiceStatus;
  due_date: string | null;
  paid_at: string | null;
  line_items: unknown[];
  subtotal_cents: number | null;
  tax_cents: number | null;
  total_cents: number | null;
  external_invoice_id: string | null;
  pdf_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type SurveyStatus = "live" | "draft" | "archived";

export interface SurveyRow {
  id: string;
  display_name: string;
  description: string;
  questions: unknown[];
  trigger_kind: "manual" | "signup" | "milestone" | "recurring";
  trigger_config: Record<string, unknown>;
  audience: string;
  audience_config: Record<string, unknown>;
  status: SurveyStatus;
  response_count: number;
  created_at: string;
  updated_at: string;
}

export interface SurveyResponseRow {
  id: string;
  survey_id: string | null;
  user_id: string | null;
  workspace_id: string | null;
  answers: Record<string, unknown>;
  nps_score: number | null;
  rating: number | null;
  comments: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type BulkOperationStatus =
  | "pending" | "running" | "completed" | "failed" | "cancelled";

export interface BulkOperationRow {
  id: string;
  actor_id: string | null;
  operation: string;
  target_kind: string;
  target_ids: string[];
  total: number;
  succeeded: number;
  failed: number;
  status: BulkOperationStatus;
  results: unknown[];
  metadata: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
}

export interface ActivityFeedRow {
  id: string;
  kind: string;
  actor_id: string | null;
  workspace_id: string | null;
  subject: string;
  body: string | null;
  url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/* ─────────────────────────── v6 types ─────────────────────────── */

export interface AdminRoleRow {
  id: string;
  display_name: string;
  description: string;
  is_system_default: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AdminRolePermissionRow {
  role_id: string;
  resource: string;
  action: string;
  granted_by: string | null;
  granted_at: string;
}

export interface UserAdminRoleRow {
  user_id: string;
  role_id: string;
  granted_by: string | null;
  granted_at: string;
  expires_at: string | null;
}

export type RuntimeConfigValueType =
  | "string" | "number" | "boolean" | "json" | "secret";

export interface RuntimeConfigRow {
  key: string;
  value: unknown;
  value_type: RuntimeConfigValueType;
  description: string;
  category: string;
  is_secret: boolean;
  metadata: Record<string, unknown>;
  updated_at: string;
  updated_by: string | null;
}

export type AdminPageSection =
  | "AI" | "Apps" | "People" | "Data & Ops" | "Security"
  | "Communication" | "Experience" | "Money" | "Content" | "Custom";

export type AdminPageLayout = "single" | "sidebar" | "grid" | "tabbed";

export interface AdminPageRow {
  id: string;
  title: string;
  description: string;
  icon: string | null;
  section: AdminPageSection;
  layout: AdminPageLayout;
  enabled: boolean;
  sort_order: number;
  required_role: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type AdminPageBlockKind =
  | "kpi" | "table" | "chart" | "markdown" | "button" | "iframe" | "form" | "divider";

export interface AdminPageBlockRow {
  id: string;
  page_id: string;
  kind: AdminPageBlockKind;
  title: string | null;
  config: Record<string, unknown>;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Resources a permission can target. Single source of truth for the
 * permission-matrix grid. Add resources here as new admin sections
 * land. */
export const PERMISSION_RESOURCES = [
  "users", "workspaces", "subscriptions", "tiers", "api_tokens",
  "agents", "skills", "tools", "models", "providers", "workflows",
  "prompts", "eval", "playground",
  "apps", "features", "integrations",
  "logs", "audit", "auth_events", "errors", "insights", "analytics",
  "funnels", "jobs", "webhooks", "alerts", "storage", "database",
  "backups", "domains", "runtime_config",
  "security_policies", "rate_limits", "ip_rules", "sso", "moderation",
  "data_exports",
  "emails", "banners", "announcements", "push", "messages", "support",
  "branding", "locales", "maintenance", "onboarding", "tours", "help",
  "surveys",
  "refunds", "invoices", "coupons", "cohorts",
  "social", "wallpapers",
  "roles",
] as const;

export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];

export const PERMISSION_ACTIONS = [
  "read", "create", "update", "delete", "approve", "export",
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
