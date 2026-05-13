/**
 * Launch-readiness checklist — single source of truth for /admin/status.
 *
 * Asad-mode: every reasonable item across all 15 readiness categories,
 * with a `phase` so the path to launch is obvious and `effort` so you
 * know the cost of fixing each one. Plain-English notes. Stripe / Linear
 * / Vercel / Notion playbooks were the reference for "what big companies
 * actually ship" before going public.
 *
 * Edit a status field, push, and every view (overview / list / flow /
 * kanban) updates automatically.
 *
 * Status meanings:
 *   - done     — shipped and working
 *   - partial  — started but not complete, OR works but needs hardening
 *   - missing  — not built yet
 *   - blocked  — waiting on external (legal, vendor, hardware, etc.)
 *   - na       — does not apply to this product
 *
 * Phase meanings (the path to launch):
 *   - foundation — bones; must exist for the product to function
 *   - hardening  — production-safety; required before public launch
 *   - polish     — what makes launch feel great (CX, docs, GTM)
 *   - scale      — needed as we grow past first ~1000 users
 *   - maturity   — ongoing improvement, post-launch
 *
 * Priority meanings:
 *   - P0 — blocks launch
 *   - P1 — should be done by launch
 *   - P2 — nice-to-have at launch, must-have within 3 months
 *   - P3 — future / opportunistic
 *
 * Effort estimate (gut-feel):
 *   - XS  — under 1 hour
 *   - S   — under 4 hours
 *   - M   — under 1 day
 *   - L   — 1–3 days
 *   - XL  — over 3 days
 */

export type Status = "done" | "partial" | "missing" | "blocked" | "na";
export type Priority = "P0" | "P1" | "P2" | "P3";
export type Phase = "foundation" | "hardening" | "polish" | "scale" | "maturity";
export type Effort = "XS" | "S" | "M" | "L" | "XL";

export type CategoryId =
  | "product"
  | "ai"
  | "database"
  | "cache"
  | "perf"
  | "security"
  | "scale"
  | "reliability"
  | "observability"
  | "devops"
  | "compliance"
  | "cx"
  | "gtm"
  | "mobile"
  | "launch";

export interface Category {
  id: CategoryId;
  label: string;
  description: string;
  /** plain-English one-liner Asad can read instead of the description */
  asad: string;
}

export interface PhaseDef {
  id: Phase;
  label: string;
  /** plain-English explanation for the overview/flow view */
  asad: string;
}

export interface Item {
  id: string;
  category: CategoryId;
  phase: Phase;
  title: string;
  status: Status;
  priority: Priority;
  notes?: string;
  effort?: Effort;
  ref?: string;
}

export const PHASES: PhaseDef[] = [
  {
    id: "foundation",
    label: "Foundation",
    asad: "Bones of the product. Must work for anything else to matter. Mostly already done.",
  },
  {
    id: "hardening",
    label: "Hardening",
    asad: "What separates 'works on my laptop' from 'survives the internet'. This is where the launch lives or dies — security, monitoring, performance, legal.",
  },
  {
    id: "polish",
    label: "Polish",
    asad: "The 10% that makes the difference between 'good launch' and 'great launch' — onboarding, help docs, press kit, the little CX touches.",
  },
  {
    id: "scale",
    label: "Scale",
    asad: "Stuff that breaks at 1000+ users. Don't need it on day one but stop ignoring it once traffic is real.",
  },
  {
    id: "maturity",
    label: "Maturity",
    asad: "Forever-work that compounds — SOC2, evals, partner integrations, new markets. Post-launch reality.",
  },
];

export const CATEGORIES: Category[] = [
  {
    id: "product",
    label: "Product completeness",
    description: "Core surfaces, features, parity between platforms.",
    asad: "Is every button you click going to actually do something useful?",
  },
  {
    id: "ai",
    label: "AI runtime",
    description: "Models, prompts, evals, cost, safety.",
    asad: "The AI brain — does it work, can we afford it, can it embarrass us?",
  },
  {
    id: "database",
    label: "Database & data",
    description: "Postgres/Supabase schema, RLS, retention, backups.",
    asad: "Where everything lives. If this goes down or leaks, you have a crisis.",
  },
  {
    id: "cache",
    label: "Caching & CDN",
    description: "Edge cache, ISR/SSR, Redis, image optimization.",
    asad: "Speed and cost. Good caching = 5–10× cheaper AND faster.",
  },
  {
    id: "perf",
    label: "Performance",
    description: "Core Web Vitals, bundle size, query p95/p99.",
    asad: "How fast pages feel. Slow = users leave before signing up.",
  },
  {
    id: "security",
    label: "Security",
    description: "Auth, RBAC, WAF, OWASP, secrets, pen-test.",
    asad: "Don't get hacked. One breach can end the company.",
  },
  {
    id: "scale",
    label: "Scalability",
    description: "Load capacity, queues, multi-region, autoscaling.",
    asad: "Can the product survive a Twitter spike or 10× our current traffic?",
  },
  {
    id: "reliability",
    label: "Reliability",
    description: "SLOs, retries, idempotency, circuit breakers, kill-switches.",
    asad: "The difference between '99% uptime' and '99.9% uptime' — engineering choices.",
  },
  {
    id: "observability",
    label: "Observability",
    description: "Logs, metrics, traces, alerts, on-call.",
    asad: "You can't fix what you can't see. Right now you'd find out from users on Twitter.",
  },
  {
    id: "devops",
    label: "DevOps & CI/CD",
    description: "Build, test, deploy, rollback, env separation.",
    asad: "The factory floor. Faster + safer shipping = faster company.",
  },
  {
    id: "compliance",
    label: "Compliance & legal",
    description: "ToS, privacy, GDPR, UAE PDPL, DPA, subprocessors.",
    asad: "The paperwork. Required for B2B sales and most regulators.",
  },
  {
    id: "cx",
    label: "Customer experience",
    description: "Onboarding, help, support, comms, branded errors.",
    asad: "How users feel using it. First-week retention is decided here.",
  },
  {
    id: "gtm",
    label: "Business & GTM",
    description: "Pricing, billing edges, launch comms, partnerships.",
    asad: "How you get and keep paying customers. Money stuff.",
  },
  {
    id: "mobile",
    label: "Mobile & multi-platform",
    description: "Responsive web, native apps, push, offline, PWA.",
    asad: "MENA is mobile-first. Half your users are on a phone.",
  },
  {
    id: "launch",
    label: "Launch readiness",
    description: "Load test, DR drill, runbooks, war room, comms.",
    asad: "Final gates before flipping the public switch.",
  },
];

// ─────────────────────────────────────────────────────────────────────
// Items
// ─────────────────────────────────────────────────────────────────────

export const CHECKLIST: Item[] = [
  // ════════════════════════════════════════════════════════════════════
  // ── Product completeness ──
  // ════════════════════════════════════════════════════════════════════
  { id: "admin-panel", category: "product", phase: "foundation", title: "Full admin control plane", status: "done", priority: "P0", effort: "XL", notes: "~50 admin routes across 9 sections. 7 parallel-agent rounds in May 2026.", ref: "/admin" },
  { id: "core-tools", category: "product", phase: "foundation", title: "Tool catalog (130+ tools)", status: "done", priority: "P0", effort: "XL", notes: "RE + Solutions tools on foundation tokens; routed through the OS shell." },
  { id: "share", category: "product", phase: "foundation", title: "Share universal sharing (share.example.com)", status: "done", priority: "P1", effort: "L" },
  { id: "iframe-apps", category: "product", phase: "foundation", title: "Custom iframe-app registration", status: "done", priority: "P1", effort: "M" },
  { id: "workflows-runner", category: "product", phase: "foundation", title: "Workflow dispatcher + workflow_runs", status: "done", priority: "P1", effort: "L", notes: "Live. Step retries + DLQ still TBD (see Reliability)." },
  { id: "property-poster", category: "product", phase: "foundation", title: "Property Poster Creator (flagship tool)", status: "done", priority: "P1", effort: "L" },
  { id: "crm", category: "product", phase: "foundation", title: "CRM (Forms, contacts, pipeline)", status: "partial", priority: "P1", effort: "L", notes: "Phases 1-3 shipped. Missing: bulk import templates, lead scoring, email-thread sync." },
  { id: "public-marketing", category: "product", phase: "foundation", title: "Public marketing surface", status: "done", priority: "P1", effort: "XL", notes: "/ + /learn + /community + /market on teal design system." },
  { id: "feature-coverage-audit", category: "product", phase: "polish", title: "Feature coverage audit (no half-built tools)", status: "missing", priority: "P1", effort: "M", notes: "Sweep before launch — every exposed tool must produce real output. Apr 30 pass caught many." },
  { id: "i18n-content", category: "product", phase: "polish", title: "Content i18n (en + ar minimum)", status: "partial", priority: "P2", effort: "L", notes: "Locales table exists. Translating pages + RTL audit not done." },
  { id: "empty-states-product", category: "product", phase: "polish", title: "Every list view has a useful empty state", status: "partial", priority: "P2", effort: "M", notes: "Admin tables say 'No rows'. User-facing tools should onboard via empty state with a CTA." },
  { id: "loading-states", category: "product", phase: "polish", title: "Skeleton loading states (not spinners)", status: "partial", priority: "P2", effort: "M" },
  { id: "error-states", category: "product", phase: "polish", title: "Inline error states on every form", status: "partial", priority: "P2", effort: "M", notes: "Forms exist but error messaging is inconsistent." },
  { id: "confirm-destructive", category: "product", phase: "hardening", title: "Confirm dialog on every destructive action", status: "partial", priority: "P1", effort: "S", notes: "Most have it, audit the rest. Bulk-action bar has confirm — good." },
  { id: "undo-snackbar", category: "product", phase: "polish", title: "Undo-snackbar pattern on non-destructive edits", status: "missing", priority: "P3", effort: "M", notes: "Gmail-style 'Undo' for ~5 seconds after edit. Reduces support load." },
  { id: "global-search", category: "product", phase: "polish", title: "Global search (Cmd+K command palette)", status: "missing", priority: "P2", effort: "L", notes: "Search across tools/apps/help/contacts. Linear-style. Massive power-user win." },
  { id: "keyboard-shortcuts", category: "product", phase: "polish", title: "Keyboard shortcuts standard", status: "missing", priority: "P3", effort: "M", notes: "? to show shortcut list. j/k navigation on lists. Power-user expectation." },
  { id: "csv-export", category: "product", phase: "polish", title: "CSV export on every list view", status: "partial", priority: "P2", effort: "S", notes: "Some lists export. Standardize." },
  { id: "saved-views", category: "product", phase: "scale", title: "Saved views / filters per user", status: "missing", priority: "P3", effort: "L" },
  { id: "notification-center", category: "product", phase: "polish", title: "In-app notification center", status: "missing", priority: "P2", effort: "L", notes: "Bell icon + inbox of mentions, system events, billing alerts." },
  { id: "activity-feed-user", category: "product", phase: "polish", title: "Per-user activity feed", status: "partial", priority: "P2", effort: "M" },
  { id: "workspace-switcher", category: "product", phase: "foundation", title: "Workspace switcher (multi-workspace user)", status: "done", priority: "P0", effort: "M" },
  { id: "workspace-invites", category: "product", phase: "foundation", title: "Workspace invite flow", status: "partial", priority: "P0", effort: "M", notes: "Verify: invite, accept, role assignment, revoke. End-to-end test." },
  { id: "workspace-members", category: "product", phase: "foundation", title: "Workspace member management (roles, remove)", status: "partial", priority: "P0", effort: "M" },
  { id: "workspace-deletion", category: "product", phase: "hardening", title: "Workspace deletion flow", status: "missing", priority: "P1", effort: "M", notes: "Owner-only, type-to-confirm, soft-delete 30d grace." },
  { id: "account-deletion", category: "product", phase: "hardening", title: "Account self-deletion flow", status: "missing", priority: "P0", effort: "M", notes: "GDPR requires it. Hard-delete schedule + audit-log preservation." },
  { id: "email-change", category: "product", phase: "hardening", title: "Email change flow with verification", status: "missing", priority: "P1", effort: "S", notes: "Verify both old and new email before swap." },
  { id: "avatar-upload", category: "product", phase: "polish", title: "Avatar / profile photo upload", status: "partial", priority: "P3", effort: "S" },
  { id: "file-uploads-general", category: "product", phase: "hardening", title: "Standard file upload (size limits, mime check)", status: "partial", priority: "P1", effort: "M" },
  { id: "version-history", category: "product", phase: "scale", title: "Version history for editable content", status: "missing", priority: "P3", effort: "L" },
  { id: "real-time-collab", category: "product", phase: "scale", title: "Real-time collaboration (Y-style CRDT)", status: "missing", priority: "P3", effort: "XL", notes: "Future. Most tools don't need it day one." },
  { id: "import-data", category: "product", phase: "polish", title: "Data import wizards (CSV, vCard, etc.)", status: "missing", priority: "P2", effort: "L", notes: "Critical for CRM (lead import) and Property tools (listing import)." },

  // ════════════════════════════════════════════════════════════════════
  // ── AI runtime ──
  // ════════════════════════════════════════════════════════════════════
  { id: "ai-agents-config", category: "ai", phase: "foundation", title: "Declarative AI agent config (model/prompt/skills/tools)", status: "done", priority: "P0", effort: "L", ref: "/admin/agents" },
  { id: "models-registry", category: "ai", phase: "foundation", title: "Models registry + provider keys", status: "done", priority: "P0", effort: "M" },
  { id: "prompt-library", category: "ai", phase: "hardening", title: "Prompt library with version history", status: "partial", priority: "P1", effort: "M", notes: "Table exists. Version diffing + A/B routing not wired." },
  { id: "eval-suites", category: "ai", phase: "hardening", title: "Eval suites (regression tests for prompts)", status: "partial", priority: "P1", effort: "L", notes: "Section exists. Runner that compares outputs across versions not wired. Linear runs nightly evals." },
  { id: "cost-cap-throttle", category: "ai", phase: "hardening", title: "Hard AI cost cap with auto-throttle", status: "partial", priority: "P0", effort: "M", notes: "Single biggest unbounded-spend risk. At 80% budget alert; at 100% throttle the agent." },
  { id: "model-fallback", category: "ai", phase: "hardening", title: "Provider fallback chain (Claude → OpenAI → cached)", status: "missing", priority: "P1", effort: "M", notes: "Single-provider outage today = AI surface dead." },
  { id: "prompt-injection-defense", category: "ai", phase: "hardening", title: "Prompt-injection mitigations on user-content tools", status: "missing", priority: "P1", effort: "M", notes: "OWASP LLM Top-10 #1. System-prompt reinforcement + input sanitization." },
  { id: "ai-output-moderation", category: "ai", phase: "hardening", title: "Output moderation on AI content posted publicly", status: "partial", priority: "P1", effort: "M", notes: "Reputational risk if a Share listing contains slurs/PII." },
  { id: "rag-kb", category: "ai", phase: "polish", title: "RAG / pgvector knowledge base", status: "missing", priority: "P2", effort: "XL", notes: "Cut hallucination on factual queries. pgvector + chunked docs." },
  { id: "skills-marketplace", category: "ai", phase: "maturity", title: "Skills marketplace (user-submitted)", status: "missing", priority: "P3", effort: "XL" },
  { id: "streaming-responses", category: "ai", phase: "hardening", title: "Streaming AI responses (SSE)", status: "partial", priority: "P1", effort: "M", notes: "Some surfaces stream, others wait for full response. Standardize — UX night/day difference." },
  { id: "stop-generation", category: "ai", phase: "polish", title: "Stop-generation button on every AI surface", status: "missing", priority: "P2", effort: "S" },
  { id: "token-counting", category: "ai", phase: "hardening", title: "Token usage tracked per request", status: "partial", priority: "P1", effort: "S", notes: "Need: stored in DB per call with cost, agent, user, workspace." },
  { id: "per-agent-dashboard", category: "ai", phase: "hardening", title: "Per-agent dashboard (latency, cost, success rate, errors)", status: "missing", priority: "P1", effort: "M" },
  { id: "prompt-ab-test", category: "ai", phase: "scale", title: "Prompt A/B testing framework", status: "missing", priority: "P2", effort: "L" },
  { id: "drift-detection", category: "ai", phase: "scale", title: "Output drift detection (when model behavior shifts)", status: "missing", priority: "P2", effort: "L", notes: "Daily eval against golden dataset. Alert if quality drops." },
  { id: "json-mode-validation", category: "ai", phase: "hardening", title: "Output schema validation (JSON mode)", status: "partial", priority: "P1", effort: "S", notes: "Wherever we parse AI output as JSON, validate against Zod schema; retry on fail." },
  { id: "tool-calling-tests", category: "ai", phase: "hardening", title: "Tool/function-calling reliability tests", status: "missing", priority: "P1", effort: "M" },
  { id: "multimodal-vision", category: "ai", phase: "polish", title: "Vision input (image upload to agents)", status: "partial", priority: "P2", effort: "M", notes: "Anthropic + OpenAI both support. Useful for Property Poster (analyze listing photo)." },
  { id: "agent-memory", category: "ai", phase: "polish", title: "Agent conversation memory (cross-session)", status: "partial", priority: "P2", effort: "L", notes: "Spacefield Assistant remembers within session; cross-session memory unclear." },
  { id: "agent-handoff", category: "ai", phase: "scale", title: "Multi-agent orchestration / handoff", status: "missing", priority: "P3", effort: "XL" },
  { id: "pii-redaction", category: "ai", phase: "hardening", title: "PII redaction before LLM call", status: "missing", priority: "P1", effort: "M", notes: "Strip emails/phones/IDs before sending user content to providers — privacy + sometimes legal." },
  { id: "no-training-flag", category: "ai", phase: "hardening", title: "Provider 'do not train on our data' flag set", status: "partial", priority: "P0", effort: "XS", notes: "Anthropic + OpenAI both honor headers/flags. Verify it's set on every API call." },
  { id: "ai-rate-limit-per-user", category: "ai", phase: "hardening", title: "Rate limit AI calls per user (abuse prevention)", status: "partial", priority: "P0", effort: "S", notes: "Stops a single user from blowing the daily budget." },
  { id: "prompt-cache", category: "ai", phase: "scale", title: "Cache identical AI prompts (exact + semantic)", status: "missing", priority: "P2", effort: "M", notes: "Anthropic prompt caching is automatic if you structure correctly. Verify we're using it." },
  { id: "async-batch", category: "ai", phase: "scale", title: "Async/batch processing for heavy AI tasks", status: "missing", priority: "P2", effort: "L", notes: "If a task takes >30s, run via job queue not request thread." },
  { id: "function-call-test-harness", category: "ai", phase: "scale", title: "Function-calling test harness", status: "missing", priority: "P2", effort: "M" },
  { id: "long-context-strategy", category: "ai", phase: "scale", title: "Long-context handling (>100k tokens)", status: "missing", priority: "P3", effort: "M", notes: "Summarize old turns, retain recent verbatim, RAG the rest." },
  { id: "embedding-index", category: "ai", phase: "polish", title: "Embeddings table + vector index (pgvector)", status: "missing", priority: "P2", effort: "M" },
  { id: "ai-cost-public", category: "ai", phase: "polish", title: "Show users their AI usage / remaining budget", status: "missing", priority: "P2", effort: "S", notes: "Trust + reduces support tickets." },

  // ════════════════════════════════════════════════════════════════════
  // ── Database & data ──
  // ════════════════════════════════════════════════════════════════════
  { id: "schema-baseline", category: "database", phase: "foundation", title: "Schema baseline (~60 tables)", status: "done", priority: "P0", effort: "XL" },
  { id: "rls-coverage", category: "database", phase: "hardening", title: "RLS on every multi-tenant table (verified)", status: "partial", priority: "P0", effort: "M", notes: "Run weekly: query returns tables WITHOUT a policy. Single biggest data-leak vector." },
  { id: "migrations-rollback", category: "database", phase: "hardening", title: "Every migration has documented rollback", status: "missing", priority: "P1", effort: "M", notes: "Supabase migrations are forward-only by default. Convention: inverse SQL next to forward." },
  { id: "indexes-audit", category: "database", phase: "hardening", title: "Index audit on top 50 slow queries", status: "missing", priority: "P1", effort: "M", notes: "Run pg_stat_statements; add covering indexes where missing. Linear blogged about this." },
  { id: "connection-pooler-tuned", category: "database", phase: "hardening", title: "Connection pooler tuned (transaction mode)", status: "partial", priority: "P1", effort: "S", notes: "Supavisor on by default. Verify pool mode + max_client_conn sized for Vercel fan-out." },
  { id: "backups-restore-drill", category: "database", phase: "hardening", title: "Backups + documented restore drill", status: "partial", priority: "P0", effort: "S", notes: "Supabase has daily backups + PITR. Have we ever ACTUALLY restored? Schedule it." },
  { id: "data-retention-policy", category: "database", phase: "hardening", title: "Data retention policy (logs, events, deleted users)", status: "missing", priority: "P1", effort: "M", notes: "Cron prunes >90d entries. Required for GDPR right-to-erasure." },
  { id: "soft-delete-pattern", category: "database", phase: "hardening", title: "Standard soft-delete pattern (deleted_at)", status: "partial", priority: "P2", effort: "M", notes: "Some tables yes, many no. Standardize for recovery from UI bulk-deletes." },
  { id: "audit-log-coverage", category: "database", phase: "foundation", title: "Audit log captures every admin mutation", status: "done", priority: "P0", effort: "M", ref: "/admin/audit" },
  { id: "read-replicas", category: "database", phase: "scale", title: "Read replicas for analytics queries", status: "missing", priority: "P2", effort: "S", notes: "Supabase Pro+ ships them. Spares the primary." },
  { id: "slow-query-cron", category: "database", phase: "scale", title: "Weekly slow-query review cron", status: "missing", priority: "P2", effort: "S" },
  { id: "materialized-views", category: "database", phase: "scale", title: "Materialized views for heavy aggregations", status: "missing", priority: "P3", effort: "M", notes: "Share analytics, insights dashboards." },
  { id: "partitioning", category: "database", phase: "scale", title: "Partition time-series tables (logs, events, audit)", status: "missing", priority: "P2", effort: "M", notes: "Postgres native partitioning by month. Keeps queries fast as the table grows." },
  { id: "fk-cascade-review", category: "database", phase: "hardening", title: "Foreign-key cascade rules reviewed", status: "missing", priority: "P2", effort: "M", notes: "ON DELETE CASCADE on the wrong column = silent data loss." },
  { id: "schema-erd", category: "database", phase: "polish", title: "Schema ERD docs auto-generated", status: "missing", priority: "P3", effort: "S", notes: "dbdocs.io or Supabase schema visualizer. Onboarding aid." },
  { id: "migration-ci-test", category: "database", phase: "scale", title: "Migrations tested in CI (apply + rollback)", status: "missing", priority: "P2", effort: "M" },
  { id: "data-seed-scripts", category: "database", phase: "polish", title: "Data seed scripts for new accounts", status: "missing", priority: "P2", effort: "S", notes: "Empty workspace = sad workspace. Seed sample CRM contacts, a sample tool config, etc." },
  { id: "prod-db-access-policy", category: "database", phase: "hardening", title: "Production DB access policy (who, what, when)", status: "missing", priority: "P1", effort: "S", notes: "Service-role keys in vault only. Document who has Supabase Studio access." },
  { id: "pii-encryption-col", category: "database", phase: "scale", title: "Column-level encryption on sensitive PII", status: "missing", priority: "P2", effort: "M", notes: "pgcrypto on phone, address, ID numbers. Defense-in-depth beyond RLS." },
  { id: "fulltext-search", category: "database", phase: "polish", title: "Full-text search indices on user content", status: "missing", priority: "P2", effort: "M" },
  { id: "extensions-audit", category: "database", phase: "hardening", title: "Postgres extensions audit (pg_stat_statements, pgvector, pgcrypto)", status: "partial", priority: "P2", effort: "XS" },
  { id: "vacuum-tuning", category: "database", phase: "scale", title: "Autovacuum tuned for hot tables", status: "missing", priority: "P2", effort: "S" },
  { id: "table-size-monitor", category: "database", phase: "scale", title: "Table size monitoring + growth alerts", status: "missing", priority: "P2", effort: "S" },
  { id: "rto-rpo", category: "database", phase: "hardening", title: "RTO and RPO defined (recovery time/point)", status: "missing", priority: "P1", effort: "XS", notes: "Decide: in a disaster, how long until back online and how much data can we lose? Standard at-scale: RTO 1h, RPO 5min." },
  { id: "cross-region-backup", category: "database", phase: "scale", title: "Cross-region backup", status: "missing", priority: "P2", effort: "S", notes: "If the primary AWS region dies, where's the copy?" },

  // ════════════════════════════════════════════════════════════════════
  // ── Caching & CDN ──
  // ════════════════════════════════════════════════════════════════════
  { id: "vercel-edge-cache", category: "cache", phase: "hardening", title: "Vercel edge cache headers on public pages", status: "partial", priority: "P1", effort: "M", notes: "Add s-maxage + stale-while-revalidate on /, /learn, /market." },
  { id: "isr-strategy", category: "cache", phase: "hardening", title: "ISR strategy for content pages", status: "missing", priority: "P1", effort: "M", notes: "Move stable content to revalidate: 60. Cuts function invocations 90%." },
  { id: "redis-layer", category: "cache", phase: "scale", title: "Redis cache layer (Upstash)", status: "missing", priority: "P1", effort: "M", notes: "Rate-limit buckets, hot feature-flag reads, feed cache. Cuts DB load 50-70%." },
  { id: "react-cache-memo", category: "cache", phase: "polish", title: "React cache() on duplicate server queries", status: "partial", priority: "P2", effort: "S" },
  { id: "image-cdn", category: "cache", phase: "hardening", title: "next/image on every public image", status: "partial", priority: "P1", effort: "M", notes: "Audit hero images — any plain <img> is a perf miss. Vercel optimizes next/image free." },
  { id: "static-assets-cdn", category: "cache", phase: "foundation", title: "Long-lived caching on /public assets", status: "done", priority: "P3", effort: "XS" },
  { id: "feature-flag-edge", category: "cache", phase: "scale", title: "Feature flags at edge (Vercel Edge Config)", status: "missing", priority: "P2", effort: "S", notes: "Flag check 30ms → <1ms." },
  { id: "cache-invalidation", category: "cache", phase: "hardening", title: "revalidateTag on every admin write affecting users", status: "missing", priority: "P1", effort: "M", notes: "Banner/brand/flag changes must invalidate downstream caches." },
  { id: "etag-headers", category: "cache", phase: "polish", title: "ETag headers on JSON API responses", status: "missing", priority: "P2", effort: "S" },
  { id: "vary-headers", category: "cache", phase: "hardening", title: "Correct Vary headers (auth, locale)", status: "missing", priority: "P1", effort: "S", notes: "Wrong Vary = users see each others' cached content. Auditable bug." },
  { id: "cache-stampede", category: "cache", phase: "scale", title: "Cache stampede protection (single-flight)", status: "missing", priority: "P2", effort: "M" },
  { id: "cache-warming", category: "cache", phase: "scale", title: "Cache warming on cold starts (popular content)", status: "missing", priority: "P3", effort: "M" },
  { id: "html-compression", category: "cache", phase: "foundation", title: "HTML compression (gzip/brotli)", status: "done", priority: "P3", effort: "XS", notes: "Vercel default." },
  { id: "modern-image-formats", category: "cache", phase: "polish", title: "WebP/AVIF served via next/image", status: "partial", priority: "P2", effort: "S" },
  { id: "lazy-load-images", category: "cache", phase: "polish", title: "Lazy-load below-fold images", status: "partial", priority: "P2", effort: "S", notes: "next/image lazy by default. Audit any plain <img>." },
  { id: "critical-css", category: "cache", phase: "polish", title: "Critical CSS inlined", status: "partial", priority: "P3", effort: "S", notes: "Next.js handles this for built CSS." },
  { id: "resource-hints", category: "cache", phase: "polish", title: "Resource hints (preconnect, dns-prefetch)", status: "missing", priority: "P3", effort: "S" },
  { id: "font-subsetting", category: "cache", phase: "polish", title: "Font subsetting (only ship glyphs we use)", status: "partial", priority: "P3", effort: "S", notes: "next/font subsets by default. Verify Arabic glyph set if RTL added." },

  // ════════════════════════════════════════════════════════════════════
  // ── Performance ──
  // ════════════════════════════════════════════════════════════════════
  { id: "lighthouse-baseline", category: "perf", phase: "hardening", title: "Lighthouse / Web Vitals baseline (>90 perf)", status: "missing", priority: "P0", effort: "S", notes: "Run on /, /learn, /tools/property-poster-creator. Target: LCP <2.5s, INP <200ms, CLS <0.1." },
  { id: "bundle-analyzer", category: "perf", phase: "hardening", title: "Bundle size budget + analyzer in CI", status: "missing", priority: "P1", effort: "S" },
  { id: "rsc-streaming", category: "perf", phase: "polish", title: "Suspense boundaries for streaming RSC", status: "partial", priority: "P2", effort: "M" },
  { id: "p95-db-queries", category: "perf", phase: "hardening", title: "DB query p95 < 200ms on every page", status: "missing", priority: "P1", effort: "M", notes: "Need pg_stat_statements wired to admin/insights for visibility." },
  { id: "ttfb-budget", category: "perf", phase: "hardening", title: "TTFB budget (<500ms public, <1s admin)", status: "missing", priority: "P1", effort: "S" },
  { id: "speed-insights", category: "perf", phase: "hardening", title: "Vercel Speed Insights enabled", status: "missing", priority: "P1", effort: "XS", notes: "One toggle. Free on Pro. Real-user Web Vitals — we have none today." },
  { id: "n-plus-one", category: "perf", phase: "hardening", title: "N+1 query audit on list pages", status: "missing", priority: "P1", effort: "M" },
  { id: "preload-critical", category: "perf", phase: "polish", title: "Preload critical fonts + hero images", status: "partial", priority: "P2", effort: "S" },
  { id: "client-bundle-trim", category: "perf", phase: "scale", title: "Trim client bundles (dynamic import heavy libs)", status: "partial", priority: "P2", effort: "M" },
  { id: "mobile-perf", category: "perf", phase: "hardening", title: "Mobile 3G/4G perf check (LCP <4s on slow network)", status: "missing", priority: "P1", effort: "S", notes: "Critical for MENA mobile users." },
  { id: "react-profiler", category: "perf", phase: "scale", title: "React Profiler audit on slow components", status: "missing", priority: "P2", effort: "M" },
  { id: "rsc-depth-audit", category: "perf", phase: "scale", title: "RSC component depth audit (no 50-deep trees)", status: "missing", priority: "P3", effort: "M" },
  { id: "cold-start-times", category: "perf", phase: "scale", title: "Vercel function cold-start times measured + budgeted", status: "missing", priority: "P2", effort: "S" },
  { id: "api-latency-budgets", category: "perf", phase: "hardening", title: "Per-endpoint latency budget (p95)", status: "missing", priority: "P1", effort: "S" },
  { id: "code-splitting", category: "perf", phase: "polish", title: "Per-route code splitting (Next.js default, audit)", status: "done", priority: "P3", effort: "XS" },
  { id: "tree-shaking", category: "perf", phase: "polish", title: "Tree-shaking verified (no dead lodash etc.)", status: "partial", priority: "P3", effort: "S" },
  { id: "virtual-scroll", category: "perf", phase: "scale", title: "Virtual scrolling on long lists (>500 rows)", status: "missing", priority: "P2", effort: "M", notes: "react-virtual or tanstack-virtual." },
  { id: "search-debounce", category: "perf", phase: "polish", title: "Debounce search inputs (250ms standard)", status: "partial", priority: "P2", effort: "S" },
  { id: "stale-response-handling", category: "perf", phase: "scale", title: "Stale-response handling (request cancellation)", status: "missing", priority: "P2", effort: "S" },
  { id: "http2-h3", category: "perf", phase: "foundation", title: "HTTP/2 + HTTP/3 enabled", status: "done", priority: "P3", effort: "XS", notes: "Vercel default." },
  { id: "edge-regions", category: "perf", phase: "scale", title: "Edge function regions optimized (MENA-friendly)", status: "partial", priority: "P2", effort: "S", notes: "fra1 or dub1 if Vercel adds. Default is iad1 (US East) which is slow for UAE." },
  { id: "cron-time-stagger", category: "perf", phase: "scale", title: "Cron jobs staggered (not all on :00)", status: "missing", priority: "P3", effort: "XS", notes: "Avoid the thundering-herd at every hour boundary." },

  // ════════════════════════════════════════════════════════════════════
  // ── Security ──
  // ════════════════════════════════════════════════════════════════════
  { id: "auth-supabase", category: "security", phase: "foundation", title: "Supabase auth (email OTP + OAuth)", status: "done", priority: "P0", effort: "M" },
  { id: "rbac-roles", category: "security", phase: "foundation", title: "Role-based access control + assertCan gate", status: "done", priority: "P0", effort: "L", ref: "/admin/roles" },
  { id: "rate-limits", category: "security", phase: "hardening", title: "Rate limits on API routes + admin", status: "done", priority: "P0", effort: "M", ref: "/admin/rate-limits" },
  { id: "secrets-rotation", category: "security", phase: "hardening", title: "Secrets rotation policy (90d cadence)", status: "missing", priority: "P1", effort: "S", notes: "Anthropic/Paddle/Supabase keys have lived for months." },
  { id: "csp-headers", category: "security", phase: "hardening", title: "Content-Security-Policy headers", status: "missing", priority: "P1", effort: "M", notes: "Blocks XSS payload exfiltration." },
  { id: "hsts", category: "security", phase: "hardening", title: "HSTS header (Strict-Transport-Security)", status: "missing", priority: "P1", effort: "XS", notes: "One line in middleware. Vercel TLS makes it safe to set max-age=31536000." },
  { id: "x-content-type", category: "security", phase: "hardening", title: "X-Content-Type-Options: nosniff", status: "missing", priority: "P1", effort: "XS" },
  { id: "x-frame-options", category: "security", phase: "hardening", title: "X-Frame-Options / frame-ancestors", status: "missing", priority: "P1", effort: "XS" },
  { id: "referrer-policy", category: "security", phase: "hardening", title: "Referrer-Policy header", status: "missing", priority: "P2", effort: "XS" },
  { id: "permissions-policy", category: "security", phase: "hardening", title: "Permissions-Policy header", status: "missing", priority: "P2", effort: "XS" },
  { id: "owasp-asvs", category: "security", phase: "hardening", title: "OWASP ASVS Level 1 self-assessment", status: "missing", priority: "P1", effort: "L", notes: "~60 controls. Walk through, mark each, fix gaps." },
  { id: "csrf-protection", category: "security", phase: "hardening", title: "CSRF protection on server actions", status: "partial", priority: "P0", effort: "S", notes: "Next.js built-in origin check. Verify not disabled." },
  { id: "waf", category: "security", phase: "hardening", title: "WAF (Vercel Firewall or Cloudflare)", status: "missing", priority: "P1", effort: "M" },
  { id: "ddos-mitigation", category: "security", phase: "hardening", title: "DDoS mitigation (L3/L4 + L7)", status: "partial", priority: "P1", effort: "S" },
  { id: "pen-test", category: "security", phase: "polish", title: "Third-party penetration test", status: "missing", priority: "P1", effort: "L", notes: "$3-8k. AFTER hardening, BEFORE public launch. Cobalt or HackerOne Pentest." },
  { id: "dep-scanning", category: "security", phase: "hardening", title: "Dependency vulnerability scanning in CI", status: "missing", priority: "P1", effort: "S", notes: "Dependabot + pnpm audit on every PR." },
  { id: "captcha-signup", category: "security", phase: "hardening", title: "CAPTCHA / Turnstile on signup + share-create", status: "missing", priority: "P2", effort: "S", notes: "Cloudflare Turnstile, free, invisible." },
  { id: "file-upload-scan", category: "security", phase: "hardening", title: "Virus/malware scan on user uploads", status: "missing", priority: "P2", effort: "M" },
  { id: "session-mgmt", category: "security", phase: "hardening", title: "Session management (device list + remote revoke)", status: "partial", priority: "P2", effort: "M" },
  { id: "mfa-2fa", category: "security", phase: "hardening", title: "MFA / 2FA for users", status: "missing", priority: "P1", effort: "M", notes: "TOTP via Supabase auth. Required at admin level minimum." },
  { id: "mfa-recovery", category: "security", phase: "hardening", title: "MFA recovery codes flow", status: "missing", priority: "P1", effort: "S" },
  { id: "reauthentication-sensitive", category: "security", phase: "hardening", title: "Re-auth for sensitive actions (delete, change email)", status: "missing", priority: "P1", effort: "S" },
  { id: "account-lockout", category: "security", phase: "hardening", title: "Account lockout on brute-force", status: "partial", priority: "P1", effort: "S", notes: "Supabase has some defaults; verify thresholds." },
  { id: "suspicious-login-alerts", category: "security", phase: "hardening", title: "Suspicious-login email (new device / location)", status: "missing", priority: "P2", effort: "M" },
  { id: "secret-scanning-repo", category: "security", phase: "hardening", title: "Secret scanning in repo (Gitleaks / GitHub native)", status: "missing", priority: "P1", effort: "XS" },
  { id: "license-audit", category: "security", phase: "hardening", title: "License audit on dependencies (no GPL leakage)", status: "missing", priority: "P2", effort: "S" },
  { id: "sbom", category: "security", phase: "maturity", title: "SBOM (software bill of materials)", status: "missing", priority: "P3", effort: "S", notes: "Required for some govt contracts. CycloneDX format." },
  { id: "dast-scan", category: "security", phase: "polish", title: "DAST scan (OWASP ZAP) in CI nightly", status: "missing", priority: "P2", effort: "M" },
  { id: "sast-scan", category: "security", phase: "hardening", title: "SAST scan (Snyk/SonarCloud) on PRs", status: "missing", priority: "P2", effort: "S" },
  { id: "bug-bounty", category: "security", phase: "maturity", title: "Bug bounty program (HackerOne / Intigriti)", status: "missing", priority: "P3", effort: "S" },
  { id: "security-txt", category: "security", phase: "hardening", title: "/.well-known/security.txt", status: "missing", priority: "P2", effort: "XS", notes: "Tells researchers where to report. 5-line file." },
  { id: "responsible-disclosure", category: "security", phase: "hardening", title: "Responsible disclosure policy page", status: "missing", priority: "P2", effort: "S" },
  { id: "incident-response-sec", category: "security", phase: "hardening", title: "Security incident response plan", status: "missing", priority: "P1", effort: "M" },
  { id: "data-breach-process", category: "security", phase: "hardening", title: "Data-breach notification process (72h GDPR)", status: "missing", priority: "P1", effort: "S" },
  { id: "webhook-sig-incoming", category: "security", phase: "hardening", title: "Verify incoming webhook signatures (Paddle)", status: "partial", priority: "P0", effort: "XS" },
  { id: "webhook-sig-outgoing", category: "security", phase: "hardening", title: "Sign outgoing webhooks (HMAC)", status: "missing", priority: "P1", effort: "S", ref: "/admin/webhooks" },
  { id: "api-key-scoping", category: "security", phase: "hardening", title: "API key scoping (read-only vs admin)", status: "partial", priority: "P1", effort: "M" },
  { id: "api-key-expiry", category: "security", phase: "polish", title: "API key expiration + rotation reminder", status: "missing", priority: "P2", effort: "S" },
  { id: "admin-ip-allowlist", category: "security", phase: "hardening", title: "IP allowlist for /admin (optional, per-account)", status: "partial", priority: "P2", effort: "M", ref: "/admin/ip-rules" },
  { id: "tls-1-3", category: "security", phase: "foundation", title: "TLS 1.3", status: "done", priority: "P0", effort: "XS", notes: "Vercel default." },
  { id: "cert-monitoring", category: "security", phase: "hardening", title: "TLS cert auto-renewal monitoring", status: "partial", priority: "P1", effort: "XS", notes: "Vercel handles renewal. Add an alert if it fails." },
  { id: "audit-log-immutable", category: "security", phase: "hardening", title: "Audit log immutable (append-only)", status: "partial", priority: "P1", effort: "S", notes: "Enforce via RLS: only INSERT, never UPDATE/DELETE." },
  { id: "subresource-integrity", category: "security", phase: "polish", title: "SRI on external CDN scripts (if any)", status: "missing", priority: "P3", effort: "XS" },
  { id: "cookie-flags", category: "security", phase: "hardening", title: "Cookie flags (Secure, HttpOnly, SameSite=Lax)", status: "partial", priority: "P0", effort: "XS", notes: "Supabase auth cookies are correct; verify any custom cookies match." },

  // ════════════════════════════════════════════════════════════════════
  // ── Scalability ──
  // ════════════════════════════════════════════════════════════════════
  { id: "vercel-autoscale", category: "scale", phase: "foundation", title: "Vercel function auto-scale (default)", status: "done", priority: "P1", effort: "XS" },
  { id: "supabase-tier", category: "scale", phase: "hardening", title: "Supabase compute tier sized for launch", status: "partial", priority: "P1", effort: "XS", notes: "Bump one tier the day before launch. ~$60/mo for medium." },
  { id: "queue-system", category: "scale", phase: "scale", title: "Durable background job queue", status: "partial", priority: "P1", effort: "L", notes: "Workflow runs exist. No durable retry-on-failure queue (Inngest, pg-boss)." },
  { id: "load-test", category: "scale", phase: "hardening", title: "Load test (k6) — sustain 1000 req/min hot pages", status: "missing", priority: "P0", effort: "M", notes: "Run against /, /login, /admin/agents, /api/share. Standard YC pre-launch gate." },
  { id: "multi-region", category: "scale", phase: "maturity", title: "Multi-region read (DB + edge)", status: "missing", priority: "P3", effort: "L", notes: "Not needed MENA-first. Path: Supabase replica in eu-central + Vercel fra1." },
  { id: "circuit-breaker", category: "scale", phase: "hardening", title: "Circuit breaker on external APIs (Paddle/Anthropic/Twilio)", status: "missing", priority: "P1", effort: "M" },
  { id: "graceful-degrade-ai", category: "scale", phase: "hardening", title: "Graceful degrade when AI provider down", status: "missing", priority: "P1", effort: "M", notes: "Currently most AI surface white-screens." },
  { id: "backpressure", category: "scale", phase: "scale", title: "Backpressure on workflow runner", status: "missing", priority: "P2", effort: "M" },
  { id: "vercel-fn-memory", category: "scale", phase: "scale", title: "Vercel function memory sized per route", status: "partial", priority: "P2", effort: "S", notes: "Default is 1024MB. Heavy routes (image gen) may need more; light routes can shrink to save cost." },
  { id: "vercel-fn-timeout", category: "scale", phase: "scale", title: "Vercel function timeout sized correctly", status: "partial", priority: "P2", effort: "XS" },
  { id: "dlq", category: "scale", phase: "scale", title: "Dead-letter queue for failed jobs", status: "missing", priority: "P2", effort: "M" },
  { id: "job-retry-backoff", category: "scale", phase: "hardening", title: "Job retry with exponential backoff", status: "partial", priority: "P1", effort: "S" },
  { id: "job-dedupe", category: "scale", phase: "hardening", title: "Job deduplication keys", status: "missing", priority: "P1", effort: "S" },
  { id: "storage-limits-monitor", category: "scale", phase: "scale", title: "File storage usage monitored + alerted", status: "missing", priority: "P2", effort: "XS", ref: "/admin/storage" },
  { id: "anthropic-tier", category: "scale", phase: "hardening", title: "Anthropic tier sized for peak (Tier 2+)", status: "partial", priority: "P1", effort: "XS", notes: "Tier 1 = 50 req/min. Launch traffic will hit ceiling." },
  { id: "email-sending-limits", category: "scale", phase: "hardening", title: "Email sending limits + warming", status: "missing", priority: "P1", effort: "M" },
  { id: "concurrent-write-test", category: "scale", phase: "hardening", title: "Concurrent-write test per workspace", status: "missing", priority: "P2", effort: "S" },
  { id: "realtime-channel-limits", category: "scale", phase: "scale", title: "Supabase Realtime channel limits monitored", status: "missing", priority: "P3", effort: "XS" },
  { id: "growth-projection-db", category: "scale", phase: "scale", title: "DB + storage growth projection (6-12mo ahead)", status: "missing", priority: "P2", effort: "S" },
  { id: "sharding-plan", category: "scale", phase: "maturity", title: "Sharding plan for hottest tables (future)", status: "missing", priority: "P3", effort: "L", notes: "Document the path; don't implement until needed." },
  { id: "vercel-bandwidth-monitor", category: "scale", phase: "scale", title: "Vercel bandwidth + function-invocation monitoring", status: "missing", priority: "P2", effort: "S", notes: "Avoid surprise overage bills." },
  { id: "anthropic-spend-alert", category: "scale", phase: "hardening", title: "Anthropic daily spend alert + hard cap", status: "missing", priority: "P0", effort: "XS", notes: "Anthropic console supports this. Single line of defense against runaway cost." },

  // ════════════════════════════════════════════════════════════════════
  // ── Reliability ──
  // ════════════════════════════════════════════════════════════════════
  { id: "slo-definitions", category: "reliability", phase: "hardening", title: "SLO definitions (uptime, latency, error rate)", status: "missing", priority: "P1", effort: "S", notes: "Pick 3 SLIs. Set targets (99.5% uptime). Drives everything else." },
  { id: "error-budgets", category: "reliability", phase: "scale", title: "Error budget tracking", status: "missing", priority: "P2", effort: "M" },
  { id: "retries-idempotent", category: "reliability", phase: "hardening", title: "Retries on idempotent ops (3x exp backoff)", status: "partial", priority: "P1", effort: "S" },
  { id: "idempotency-keys", category: "reliability", phase: "hardening", title: "Idempotency keys on critical mutations", status: "missing", priority: "P1", effort: "M", notes: "Stripe pattern: client UUID → idempotency_keys table → cached response." },
  { id: "error-reporter-lib", category: "reliability", phase: "foundation", title: "Error reporter lib (admin/errors)", status: "done", priority: "P0", effort: "M", ref: "/admin/errors" },
  { id: "sentry-or-datadog", category: "reliability", phase: "hardening", title: "Sentry (or equivalent) for production errors", status: "missing", priority: "P0", effort: "S", notes: "Internal /admin/errors lacks source maps, release tagging, alert rules, regression detection." },
  { id: "health-endpoint", category: "reliability", phase: "hardening", title: "/api/health endpoint (DB + AI probes)", status: "missing", priority: "P0", effort: "S", notes: "Returns 200 only if everything responds. Required for status page + load balancer." },
  { id: "feature-killswitch", category: "reliability", phase: "hardening", title: "Per-feature kill-switch (one-click disable)", status: "partial", priority: "P1", effort: "S" },
  { id: "rollback-plan", category: "reliability", phase: "hardening", title: "Documented rollback plan (Vercel + DB)", status: "missing", priority: "P1", effort: "S" },
  { id: "incident-runbook", category: "reliability", phase: "hardening", title: "Incident response runbook (Sev1/2/3)", status: "missing", priority: "P1", effort: "M", notes: "PagerDuty's open-source template is a good start." },
  { id: "tx-correctness", category: "reliability", phase: "hardening", title: "DB transactions used correctly", status: "partial", priority: "P1", effort: "M", notes: "Audit: any multi-statement write that isn't a transaction is a bug." },
  { id: "distributed-lock", category: "reliability", phase: "scale", title: "Distributed lock for critical sections", status: "missing", priority: "P2", effort: "M", notes: "Postgres advisory locks or Redis lock. Prevents double-execution race." },
  { id: "outbox-pattern", category: "reliability", phase: "scale", title: "Outbox pattern for cross-system writes", status: "missing", priority: "P2", effort: "L" },
  { id: "saga-pattern", category: "reliability", phase: "scale", title: "Saga pattern for multi-step ops", status: "missing", priority: "P3", effort: "L" },
  { id: "stuck-job-detection", category: "reliability", phase: "hardening", title: "Stuck-job detection + alert", status: "missing", priority: "P1", effort: "S" },
  { id: "webhook-retry-delivery", category: "reliability", phase: "hardening", title: "Outgoing-webhook delivery retries", status: "missing", priority: "P1", effort: "M" },
  { id: "webhook-dead-letter", category: "reliability", phase: "hardening", title: "Outgoing-webhook dead letter", status: "missing", priority: "P2", effort: "S" },
  { id: "email-retry-queue", category: "reliability", phase: "scale", title: "Email send retry queue", status: "missing", priority: "P2", effort: "S" },
  { id: "payment-webhook-idempotent", category: "reliability", phase: "hardening", title: "Idempotency on payment webhooks (Paddle)", status: "partial", priority: "P0", effort: "S", notes: "Paddle retries on 5xx. Duplicate processing = double-charge or double-grant." },
  { id: "signup-race", category: "reliability", phase: "hardening", title: "Signup race-condition handling (dedupe)", status: "partial", priority: "P1", effort: "S" },
  { id: "online-schema-changes", category: "reliability", phase: "hardening", title: "Online migration safety (no long locks)", status: "missing", priority: "P1", effort: "M", notes: "Adding NOT NULL to a 1M-row table = downtime. Use Postgres safe-migration patterns." },
  { id: "zero-downtime-deploys", category: "reliability", phase: "hardening", title: "Zero-downtime deploys verified", status: "partial", priority: "P1", effort: "S", notes: "Vercel handles atomic swap. Verify long-running requests survive the swap." },
  { id: "graceful-shutdown", category: "reliability", phase: "scale", title: "Graceful shutdown of long-running jobs on deploy", status: "missing", priority: "P2", effort: "M" },
  { id: "exactly-once-where-required", category: "reliability", phase: "scale", title: "Exactly-once delivery on payment events", status: "partial", priority: "P0", effort: "S", notes: "Tied to idempotency keys above." },
  { id: "read-your-writes", category: "reliability", phase: "polish", title: "Read-your-writes consistency on user view", status: "partial", priority: "P2", effort: "S", notes: "User edits something → next page load shows their edit, not a stale cached version." },

  // ════════════════════════════════════════════════════════════════════
  // ── Observability ──
  // ════════════════════════════════════════════════════════════════════
  { id: "logs-pipeline", category: "observability", phase: "foundation", title: "Centralized logs (admin/logs)", status: "done", priority: "P0", effort: "M", ref: "/admin/logs" },
  { id: "metrics-pipeline", category: "observability", phase: "hardening", title: "Metrics pipeline (counters, histograms)", status: "missing", priority: "P1", effort: "M", notes: "Vercel Analytics is paid + high-level. Grafana Cloud free + OTel for custom." },
  { id: "distributed-tracing", category: "observability", phase: "scale", title: "Distributed tracing (OpenTelemetry)", status: "missing", priority: "P2", effort: "M" },
  { id: "alerts-routing", category: "observability", phase: "hardening", title: "Alert routing (Slack/SMS) with severities", status: "missing", priority: "P0", effort: "S", notes: "3am production fire — nobody knows today." },
  { id: "health-dashboard", category: "observability", phase: "hardening", title: "Top-level health dashboard (req/s, p95, error, $)", status: "missing", priority: "P1", effort: "M" },
  { id: "audit-trail", category: "observability", phase: "foundation", title: "Full admin action audit trail", status: "done", priority: "P0", effort: "M", ref: "/admin/audit" },
  { id: "synthetic-monitoring", category: "observability", phase: "hardening", title: "Synthetic monitoring (Better Stack / Checkly)", status: "missing", priority: "P1", effort: "S", notes: "External monitor hits /api/health every 60s from 3 regions. $10/mo." },
  { id: "uptime-public", category: "observability", phase: "hardening", title: "Public status page (status.spacefield.co)", status: "missing", priority: "P1", effort: "S", notes: "Better Stack Uptime $24/mo. Auto-generated from synthetic checks." },
  { id: "on-call", category: "observability", phase: "polish", title: "On-call rotation + escalation", status: "missing", priority: "P2", effort: "S", notes: "Right now: Asad is implicitly on-call 24/7." },
  { id: "log-retention", category: "observability", phase: "scale", title: "Log retention policy (30d hot / 1y cold)", status: "missing", priority: "P2", effort: "M" },
  { id: "structured-logging", category: "observability", phase: "hardening", title: "Structured JSON logging on every request", status: "partial", priority: "P1", effort: "S" },
  { id: "request-id", category: "observability", phase: "hardening", title: "Request ID correlation across layers", status: "missing", priority: "P1", effort: "S", notes: "X-Request-Id header on every response; same ID in every log line. Cuts debug time 5×." },
  { id: "trace-id-prop", category: "observability", phase: "scale", title: "Trace ID propagation", status: "missing", priority: "P2", effort: "M" },
  { id: "endpoint-latency-histogram", category: "observability", phase: "hardening", title: "Latency histogram per endpoint", status: "missing", priority: "P1", effort: "M" },
  { id: "endpoint-status-dist", category: "observability", phase: "hardening", title: "Status code distribution per endpoint", status: "missing", priority: "P1", effort: "S" },
  { id: "db-query-time-per-request", category: "observability", phase: "scale", title: "DB query time per request visible", status: "missing", priority: "P2", effort: "S" },
  { id: "cache-hit-rate", category: "observability", phase: "scale", title: "Cache hit rate metric", status: "missing", priority: "P2", effort: "S" },
  { id: "queue-depth-metric", category: "observability", phase: "scale", title: "Job queue depth metric", status: "missing", priority: "P2", effort: "S" },
  { id: "ai-provider-metrics", category: "observability", phase: "hardening", title: "Per-provider AI latency + error rate", status: "missing", priority: "P1", effort: "S" },
  { id: "cost-per-workspace", category: "observability", phase: "hardening", title: "Cost per workspace per day visible", status: "partial", priority: "P1", effort: "S", ref: "/admin/insights" },
  { id: "top-spender-alert", category: "observability", phase: "scale", title: "Top-spending users alert", status: "missing", priority: "P2", effort: "S" },
  { id: "anomaly-detection", category: "observability", phase: "scale", title: "Anomaly detection on key metrics", status: "missing", priority: "P3", effort: "L" },
  { id: "product-analytics", category: "observability", phase: "polish", title: "Product analytics (PostHog / Amplitude)", status: "missing", priority: "P1", effort: "M", notes: "Funnel + retention dashboards. PostHog free tier covers small launch." },
  { id: "session-replay", category: "observability", phase: "polish", title: "Session replay (PostHog Recorder)", status: "missing", priority: "P2", effort: "XS", notes: "Mask sensitive inputs. Helps support 10×." },
  { id: "ab-test-framework", category: "observability", phase: "scale", title: "A/B test framework", status: "missing", priority: "P3", effort: "M" },
  { id: "feature-usage-tracking", category: "observability", phase: "polish", title: "Per-feature usage tracking", status: "missing", priority: "P2", effort: "S", notes: "Which tools are actually used? Drives roadmap." },
  { id: "funnel-dropoff-alert", category: "observability", phase: "scale", title: "Funnel drop-off alerts", status: "missing", priority: "P2", effort: "S" },
  { id: "error-grouping", category: "observability", phase: "hardening", title: "Error grouping + dedup", status: "partial", priority: "P1", effort: "S", notes: "Sentry does this for free." },
  { id: "source-maps", category: "observability", phase: "hardening", title: "Source maps uploaded to error tracker", status: "missing", priority: "P1", effort: "XS" },
  { id: "release-tag-errors", category: "observability", phase: "hardening", title: "Release tag visible in error reports", status: "missing", priority: "P1", effort: "XS" },
  { id: "user-feedback-button", category: "observability", phase: "polish", title: "In-app 'report a problem' button", status: "missing", priority: "P2", effort: "S" },

  // ════════════════════════════════════════════════════════════════════
  // ── DevOps & CI/CD ──
  // ════════════════════════════════════════════════════════════════════
  { id: "git-deploy", category: "devops", phase: "foundation", title: "Git-push-to-deploy via Vercel", status: "done", priority: "P0", effort: "XS" },
  { id: "preview-envs", category: "devops", phase: "foundation", title: "Preview deployments per PR", status: "done", priority: "P1", effort: "XS" },
  { id: "ci-tests", category: "devops", phase: "hardening", title: "Automated test suite (unit + e2e) in CI", status: "missing", priority: "P0", effort: "L", notes: "Vitest for libs + Playwright for 5 critical flows. We have no test suite today." },
  { id: "type-check-ci", category: "devops", phase: "hardening", title: "tsc + ESLint in CI (not just pre-push)", status: "partial", priority: "P1", effort: "XS" },
  { id: "env-management", category: "devops", phase: "hardening", title: "Env vars: prod/preview/dev separation", status: "partial", priority: "P1", effort: "S" },
  { id: "staging-env", category: "devops", phase: "hardening", title: "Dedicated staging environment", status: "missing", priority: "P1", effort: "M", notes: "Free Supabase + Vercel project. Lets you do destructive testing." },
  { id: "iac", category: "devops", phase: "maturity", title: "Infrastructure as code (Terraform / Pulumi)", status: "missing", priority: "P3", effort: "L" },
  { id: "settings-backup", category: "devops", phase: "hardening", title: "Backup of Vercel + Supabase project settings", status: "missing", priority: "P2", effort: "S" },
  { id: "deploy-gates", category: "devops", phase: "hardening", title: "Deploy gates (build + smoke test pass)", status: "partial", priority: "P1", effort: "M" },
  { id: "release-notes", category: "devops", phase: "polish", title: "Release notes / changelog automation", status: "missing", priority: "P2", effort: "S", notes: "Changesets or release-please." },
  { id: "branch-protection", category: "devops", phase: "hardening", title: "Branch protection on main (no force-push)", status: "missing", priority: "P1", effort: "XS" },
  { id: "signed-commits", category: "devops", phase: "polish", title: "Signed commits required", status: "missing", priority: "P3", effort: "XS" },
  { id: "renovate", category: "devops", phase: "polish", title: "Automated dependency updates (Renovate/Dependabot)", status: "missing", priority: "P2", effort: "S" },
  { id: "lockfile-integrity", category: "devops", phase: "hardening", title: "Lockfile integrity check in CI", status: "partial", priority: "P2", effort: "XS" },
  { id: "build-cache", category: "devops", phase: "scale", title: "Build caching (Turbopack, Vercel)", status: "partial", priority: "P2", effort: "XS", notes: "Vercel default. Verify cache hit rate." },
  { id: "test-coverage-gate", category: "devops", phase: "scale", title: "Test coverage minimum gate (60% start)", status: "missing", priority: "P2", effort: "S" },
  { id: "pre-commit-hooks", category: "devops", phase: "polish", title: "Pre-commit hooks (prettier + lint)", status: "partial", priority: "P3", effort: "XS" },
  { id: "pr-template", category: "devops", phase: "polish", title: "PR + issue templates", status: "missing", priority: "P3", effort: "XS" },
  { id: "codeowners", category: "devops", phase: "polish", title: "CODEOWNERS file", status: "missing", priority: "P3", effort: "XS" },
  { id: "license-file", category: "devops", phase: "polish", title: "LICENSE file", status: "partial", priority: "P3", effort: "XS" },
  { id: "security-md", category: "devops", phase: "polish", title: "SECURITY.md (disclosure policy)", status: "missing", priority: "P2", effort: "XS" },
  { id: "storybook", category: "devops", phase: "maturity", title: "Component library / Storybook", status: "missing", priority: "P3", effort: "L" },
  { id: "visual-regression", category: "devops", phase: "maturity", title: "Visual regression testing (Chromatic/Percy)", status: "missing", priority: "P3", effort: "M" },
  { id: "e2e-smoke", category: "devops", phase: "hardening", title: "E2E smoke pack (5 critical user flows)", status: "missing", priority: "P0", effort: "M", notes: "Signup → tool → save → share → checkout. Playwright on preview deployments." },
  { id: "perf-budget-ci", category: "devops", phase: "scale", title: "Perf budget enforced in CI", status: "missing", priority: "P2", effort: "S" },

  // ════════════════════════════════════════════════════════════════════
  // ── Compliance & legal ──
  // ════════════════════════════════════════════════════════════════════
  { id: "tos-page", category: "compliance", phase: "hardening", title: "Terms of Service page", status: "missing", priority: "P0", effort: "S", notes: "Termly template, customized for UAE + AI-content disclaimers. Required before paid users." },
  { id: "privacy-page", category: "compliance", phase: "hardening", title: "Privacy Policy page", status: "missing", priority: "P0", effort: "S", notes: "GDPR + UAE PDPL compliant. Lists subprocessors." },
  { id: "dpa-template", category: "compliance", phase: "hardening", title: "DPA template (Data Processing Agreement)", status: "missing", priority: "P1", effort: "S", notes: "B2B buyers ask for this." },
  { id: "cookie-consent", category: "compliance", phase: "hardening", title: "Cookie consent banner (EU + UAE)", status: "missing", priority: "P1", effort: "S" },
  { id: "gdpr-data-export", category: "compliance", phase: "hardening", title: "GDPR data-export self-service", status: "partial", priority: "P1", effort: "M", ref: "/admin/data-exports" },
  { id: "gdpr-erasure", category: "compliance", phase: "hardening", title: "Right-to-erasure flow (user-initiated delete)", status: "missing", priority: "P1", effort: "M" },
  { id: "subprocessors-list", category: "compliance", phase: "polish", title: "Public subprocessors page + change notification", status: "missing", priority: "P2", effort: "XS" },
  { id: "aup", category: "compliance", phase: "hardening", title: "Acceptable Use Policy", status: "missing", priority: "P2", effort: "S" },
  { id: "trust-center", category: "compliance", phase: "polish", title: "Trust center page (security summary)", status: "missing", priority: "P2", effort: "S", notes: "Drata/Vanta auto-generate. Or hand-roll. B2B sales accelerator." },
  { id: "uae-pdpl", category: "compliance", phase: "hardening", title: "UAE PDPL compliance review", status: "missing", priority: "P1", effort: "S", notes: "Federal Decree-Law No. 45 of 2021. Asad's primary market." },
  { id: "ksa-pdpl", category: "compliance", phase: "maturity", title: "KSA PDPL compliance (if expanding)", status: "missing", priority: "P3", effort: "M" },
  { id: "saudi-nca", category: "compliance", phase: "maturity", title: "Saudi NCA cybersecurity controls", status: "missing", priority: "P3", effort: "L", notes: "Required for govt deals in KSA. Skip until expansion." },
  { id: "ccpa", category: "compliance", phase: "polish", title: "CCPA opt-out (California users)", status: "missing", priority: "P3", effort: "S" },
  { id: "pipeda", category: "compliance", phase: "maturity", title: "PIPEDA (Canada)", status: "na", priority: "P3", effort: "S" },
  { id: "lgpd", category: "compliance", phase: "maturity", title: "LGPD (Brazil)", status: "na", priority: "P3", effort: "S" },
  { id: "data-residency", category: "compliance", phase: "maturity", title: "Data residency requirements documented", status: "missing", priority: "P2", effort: "S", notes: "If a UAE bank wants the data in UAE, we need an answer." },
  { id: "dpia", category: "compliance", phase: "polish", title: "DPIA (Data Protection Impact Assessment)", status: "missing", priority: "P2", effort: "M", notes: "Required under GDPR Art. 35 for high-risk processing (AI on personal data)." },
  { id: "ropa", category: "compliance", phase: "polish", title: "ROPA (Records of Processing Activities)", status: "missing", priority: "P2", effort: "S" },
  { id: "dpo", category: "compliance", phase: "maturity", title: "DPO (Data Protection Officer) designated", status: "missing", priority: "P3", effort: "XS", notes: "Required by GDPR at certain scale. Asad can be it initially, document the appointment." },
  { id: "eu-representative", category: "compliance", phase: "maturity", title: "EU representative (if EU users)", status: "missing", priority: "P3", effort: "S" },
  { id: "scc", category: "compliance", phase: "polish", title: "Standard Contractual Clauses (SCCs) for transfers", status: "missing", priority: "P2", effort: "S" },
  { id: "vendor-risk", category: "compliance", phase: "polish", title: "Vendor risk assessments (Supabase, Vercel, etc.)", status: "missing", priority: "P2", effort: "S" },
  { id: "security-questionnaire", category: "compliance", phase: "maturity", title: "Security questionnaire (SIG/CAIQ) prepped", status: "missing", priority: "P2", effort: "M", notes: "B2B buyers send this. Have answers ready." },
  { id: "iso27001", category: "compliance", phase: "maturity", title: "ISO 27001 readiness", status: "missing", priority: "P3", effort: "XL" },
  { id: "soc2-type1", category: "compliance", phase: "maturity", title: "SOC 2 Type 1 audit", status: "missing", priority: "P2", effort: "XL", notes: "Drata/Vanta accelerates this. ~$15-30k. Required for most enterprise sales." },
  { id: "soc2-type2", category: "compliance", phase: "maturity", title: "SOC 2 Type 2 audit (6-12mo of evidence)", status: "missing", priority: "P3", effort: "XL" },
  { id: "hipaa", category: "compliance", phase: "maturity", title: "HIPAA (if health data added)", status: "na", priority: "P3", effort: "XL" },
  { id: "pci-scope", category: "compliance", phase: "hardening", title: "PCI DSS scope documented (Paddle = MoR)", status: "missing", priority: "P1", effort: "XS", notes: "Paddle is merchant-of-record, so we're out of scope for most PCI. Document this." },
  { id: "sanctions-screening", category: "compliance", phase: "polish", title: "Sanctions screening (OFAC, EU)", status: "missing", priority: "P3", effort: "S", notes: "If facilitating transactions. Paddle handles their slice." },
  { id: "age-verification", category: "compliance", phase: "polish", title: "Age verification (18+ if applicable)", status: "missing", priority: "P3", effort: "XS" },
  { id: "coppa", category: "compliance", phase: "polish", title: "COPPA (under-13 US users blocked)", status: "missing", priority: "P3", effort: "XS" },
  { id: "accessibility-statement", category: "compliance", phase: "polish", title: "Accessibility statement (WCAG)", status: "missing", priority: "P2", effort: "XS" },
  { id: "cookie-audit", category: "compliance", phase: "polish", title: "Cookie audit page (what we set + why)", status: "missing", priority: "P2", effort: "S" },

  // ════════════════════════════════════════════════════════════════════
  // ── Customer experience ──
  // ════════════════════════════════════════════════════════════════════
  { id: "onboarding-flow", category: "cx", phase: "foundation", title: "Onboarding flow + product tours", status: "done", priority: "P1", effort: "L", ref: "/admin/onboarding" },
  { id: "help-center", category: "cx", phase: "polish", title: "Help center content (30-50 articles)", status: "partial", priority: "P1", effort: "L", notes: "System exists; writing is the bottleneck." },
  { id: "in-app-support", category: "cx", phase: "foundation", title: "In-app support inbox + ticket triage", status: "done", priority: "P1", effort: "M", ref: "/admin/support" },
  { id: "live-chat", category: "cx", phase: "polish", title: "Live chat widget (Crisp free tier)", status: "missing", priority: "P2", effort: "XS" },
  { id: "email-deliverability", category: "cx", phase: "hardening", title: "Email deliverability (SPF/DKIM/DMARC + warm-up)", status: "missing", priority: "P0", effort: "M", notes: "If first marketing blast lands in spam, launch is dead. 4-6 weeks to warm a cold IP." },
  { id: "transactional-email", category: "cx", phase: "hardening", title: "Transactional email provider (Postmark/Resend)", status: "missing", priority: "P0", effort: "S", notes: "Supabase default doesn't scale. ~$10/mo." },
  { id: "user-changelog", category: "cx", phase: "polish", title: "User-facing changelog page", status: "missing", priority: "P2", effort: "S" },
  { id: "feedback-widget", category: "cx", phase: "polish", title: "Feedback / feature-request widget", status: "missing", priority: "P2", effort: "M" },
  { id: "empty-states-cx", category: "cx", phase: "polish", title: "User-facing empty states with CTAs", status: "partial", priority: "P2", effort: "M" },
  { id: "error-pages", category: "cx", phase: "polish", title: "Branded 404 + 500 pages with 'report this'", status: "partial", priority: "P2", effort: "S" },
  { id: "tooltips", category: "cx", phase: "polish", title: "Tooltips on non-obvious UI", status: "partial", priority: "P3", effort: "M" },
  { id: "inline-help-fields", category: "cx", phase: "polish", title: "Inline help on form fields", status: "partial", priority: "P3", effort: "M" },
  { id: "optimistic-ui", category: "cx", phase: "polish", title: "Optimistic UI on mutations", status: "partial", priority: "P2", effort: "M" },
  { id: "toast-standard", category: "cx", phase: "polish", title: "Toast notifications standardized", status: "partial", priority: "P3", effort: "S" },
  { id: "shortcut-help", category: "cx", phase: "polish", title: "'?' opens keyboard shortcut help", status: "missing", priority: "P3", effort: "S" },
  { id: "recently-used", category: "cx", phase: "polish", title: "Recently used items per user", status: "missing", priority: "P3", effort: "S" },
  { id: "favorites-pinned", category: "cx", phase: "polish", title: "Favorites / pinned items", status: "missing", priority: "P3", effort: "S" },
  { id: "email-digest", category: "cx", phase: "scale", title: "Daily/weekly email digest opt-in", status: "missing", priority: "P3", effort: "M" },
  { id: "notification-prefs", category: "cx", phase: "polish", title: "Notification preferences page", status: "missing", priority: "P2", effort: "M" },
  { id: "unsubscribe-link", category: "cx", phase: "hardening", title: "Unsubscribe link on every email (legal req)", status: "missing", priority: "P0", effort: "XS", notes: "CAN-SPAM + UAE rules require it." },
  { id: "list-unsub-header", category: "cx", phase: "hardening", title: "List-Unsubscribe header (one-click)", status: "missing", priority: "P1", effort: "XS", notes: "Gmail bulk-sender requirement since 2024." },
  { id: "email-pref-center", category: "cx", phase: "polish", title: "Email preference center", status: "missing", priority: "P2", effort: "S" },
  { id: "account-settings-unified", category: "cx", phase: "polish", title: "Unified account settings page", status: "partial", priority: "P1", effort: "S" },
  { id: "billing-portal", category: "cx", phase: "polish", title: "Billing portal (Paddle customer portal)", status: "partial", priority: "P1", effort: "S" },
  { id: "receipts-invoices", category: "cx", phase: "polish", title: "Self-serve receipts + invoices", status: "partial", priority: "P1", effort: "S" },
  { id: "tax-compliant-invoices", category: "cx", phase: "hardening", title: "Tax-compliant invoices (UAE VAT, EU VAT)", status: "partial", priority: "P1", effort: "S", notes: "Paddle handles most. Verify UAE TRN appears on invoices." },
  { id: "currency-switcher", category: "cx", phase: "polish", title: "Currency switcher (AED, USD, EUR)", status: "missing", priority: "P2", effort: "M" },
  { id: "locale-formatting", category: "cx", phase: "polish", title: "Locale-aware date/number formatting", status: "partial", priority: "P2", effort: "S" },
  { id: "onboarding-emails", category: "cx", phase: "polish", title: "Onboarding email sequence (drip)", status: "missing", priority: "P2", effort: "M" },
  { id: "reengagement-emails", category: "cx", phase: "scale", title: "Re-engagement / win-back emails", status: "missing", priority: "P2", effort: "M" },
  { id: "churn-survey", category: "cx", phase: "polish", title: "Cancellation survey (why?)", status: "missing", priority: "P2", effort: "S" },
  { id: "whats-new-modal", category: "cx", phase: "polish", title: "What's-new modal on first login after release", status: "missing", priority: "P3", effort: "S" },

  // ════════════════════════════════════════════════════════════════════
  // ── Business & GTM ──
  // ════════════════════════════════════════════════════════════════════
  { id: "pricing-page", category: "gtm", phase: "foundation", title: "Pricing page", status: "done", priority: "P0", effort: "M" },
  { id: "paddle-checkout", category: "gtm", phase: "foundation", title: "Paddle checkout + webhook handling", status: "partial", priority: "P0", effort: "M", notes: "Wired. Spot-check refund + failed-renewal end-to-end." },
  { id: "usage-billing", category: "gtm", phase: "scale", title: "Usage-based billing for AI tokens (over-limit)", status: "missing", priority: "P2", effort: "M" },
  { id: "annual-billing", category: "gtm", phase: "polish", title: "Annual billing option (20% discount)", status: "missing", priority: "P2", effort: "S", notes: "Improves cash flow + retention 30%." },
  { id: "referral-program", category: "gtm", phase: "polish", title: "Referral program (user-facing)", status: "partial", priority: "P2", effort: "M", ref: "/admin/coupons" },
  { id: "affiliate-program", category: "gtm", phase: "polish", title: "Affiliate program", status: "missing", priority: "P3", effort: "L", notes: "Different from referral — third parties earn commission on sales they drive." },
  { id: "free-trial", category: "gtm", phase: "foundation", title: "Free trial mechanics (decide: 14d? card-on-file?)", status: "missing", priority: "P0", effort: "S" },
  { id: "money-back-guarantee", category: "gtm", phase: "polish", title: "Money-back guarantee policy", status: "missing", priority: "P2", effort: "XS" },
  { id: "volume-discount", category: "gtm", phase: "polish", title: "Volume / team discount", status: "missing", priority: "P3", effort: "S" },
  { id: "edu-nonprofit-pricing", category: "gtm", phase: "polish", title: "Edu / non-profit pricing tier", status: "missing", priority: "P3", effort: "XS" },
  { id: "startup-program", category: "gtm", phase: "maturity", title: "Startup program (credits for YC/etc.)", status: "missing", priority: "P3", effort: "XS" },
  { id: "public-roadmap", category: "gtm", phase: "polish", title: "Public roadmap page", status: "missing", priority: "P2", effort: "S" },
  { id: "launch-comms-plan", category: "gtm", phase: "polish", title: "Launch comms plan (PH, Twitter, press)", status: "missing", priority: "P1", effort: "M" },
  { id: "press-kit", category: "gtm", phase: "polish", title: "Press kit + brand assets page", status: "missing", priority: "P2", effort: "S" },
  { id: "press-release-template", category: "gtm", phase: "polish", title: "Press release template", status: "missing", priority: "P3", effort: "S" },
  { id: "journalist-list", category: "gtm", phase: "polish", title: "Journalist / MENA tech press outreach list", status: "missing", priority: "P2", effort: "M" },
  { id: "analytics-funnel", category: "gtm", phase: "hardening", title: "End-to-end conversion funnel (landing → paid)", status: "partial", priority: "P1", effort: "M", ref: "/admin/funnels" },
  { id: "public-api", category: "gtm", phase: "maturity", title: "Public API + developer docs", status: "missing", priority: "P3", effort: "L" },
  { id: "integrations-partners", category: "gtm", phase: "maturity", title: "Integration partners (Slack, Google, Sheets, Notion)", status: "partial", priority: "P3", effort: "L", ref: "/admin/integrations" },
  { id: "appsumo-deal", category: "gtm", phase: "maturity", title: "AppSumo / lifetime deal evaluation", status: "missing", priority: "P3", effort: "S" },
  { id: "product-hunt", category: "gtm", phase: "polish", title: "Product Hunt launch plan (hunter, assets, first-5 comments)", status: "missing", priority: "P1", effort: "M" },
  { id: "hn-show", category: "gtm", phase: "polish", title: "Hacker News / Show HN post drafted", status: "missing", priority: "P2", effort: "S" },
  { id: "twitter-launch", category: "gtm", phase: "polish", title: "Twitter/X launch thread + scheduling", status: "missing", priority: "P2", effort: "S" },
  { id: "linkedin-launch", category: "gtm", phase: "polish", title: "LinkedIn launch post + scheduling", status: "missing", priority: "P2", effort: "S" },
  { id: "case-studies", category: "gtm", phase: "polish", title: "Case studies (3 minimum)", status: "missing", priority: "P2", effort: "L" },
  { id: "testimonials", category: "gtm", phase: "polish", title: "Testimonials (10 minimum)", status: "missing", priority: "P2", effort: "M" },
  { id: "logo-wall", category: "gtm", phase: "polish", title: "Customer logo wall on homepage", status: "missing", priority: "P3", effort: "XS" },
  { id: "comparison-page", category: "gtm", phase: "scale", title: "Comparison page (vs alternatives)", status: "missing", priority: "P2", effort: "M" },
  { id: "alternative-to-seo", category: "gtm", phase: "scale", title: "Alternative-to-X SEO landing pages", status: "missing", priority: "P3", effort: "L" },
  { id: "templates-library", category: "gtm", phase: "polish", title: "Templates library (free downloads, lead magnet)", status: "missing", priority: "P2", effort: "L" },
  { id: "embed-widgets", category: "gtm", phase: "scale", title: "Embeddable widgets (calculator, etc.)", status: "missing", priority: "P3", effort: "M" },
  { id: "og-cards", category: "gtm", phase: "polish", title: "OG + Twitter cards on every page", status: "partial", priority: "P2", effort: "S" },
  { id: "schema-org", category: "gtm", phase: "polish", title: "Schema.org markup (Product, Organization, FAQ)", status: "partial", priority: "P2", effort: "S" },
  { id: "sitemap-robots", category: "gtm", phase: "foundation", title: "sitemap.xml + robots.txt correct", status: "done", priority: "P1", effort: "XS" },
  { id: "rss-feeds", category: "gtm", phase: "polish", title: "RSS feeds (blog, changelog)", status: "missing", priority: "P3", effort: "XS" },
  { id: "investor-data-room", category: "gtm", phase: "maturity", title: "Investor data room (when fundraising)", status: "missing", priority: "P3", effort: "M" },
  { id: "pitch-deck", category: "gtm", phase: "polish", title: "Current pitch deck", status: "missing", priority: "P2", effort: "M" },
  { id: "financial-model", category: "gtm", phase: "polish", title: "Financial model + projections", status: "missing", priority: "P2", effort: "M" },
  { id: "waitlist", category: "gtm", phase: "polish", title: "Pre-launch waitlist page + email collection", status: "missing", priority: "P1", effort: "S" },

  // ════════════════════════════════════════════════════════════════════
  // ── Mobile & multi-platform ──
  // ════════════════════════════════════════════════════════════════════
  { id: "responsive-web", category: "mobile", phase: "foundation", title: "Responsive web (phone + tablet)", status: "partial", priority: "P0", effort: "L", notes: "Apr 27 redesign verified main app. /admin needs phone polish." },
  { id: "pwa", category: "mobile", phase: "polish", title: "Installable PWA (manifest + service worker)", status: "missing", priority: "P2", effort: "S", notes: "Cheap win: app icon without App Store review." },
  { id: "push-web", category: "mobile", phase: "scale", title: "Web push notifications (VAPID)", status: "partial", priority: "P2", effort: "M", ref: "/admin/push" },
  { id: "native-ios", category: "mobile", phase: "maturity", title: "Native iOS app", status: "partial", priority: "P2", effort: "XL", notes: "Flutter project, separate track. 15 tools done." },
  { id: "native-android", category: "mobile", phase: "maturity", title: "Native Android app", status: "partial", priority: "P2", effort: "XL" },
  { id: "offline-mode", category: "mobile", phase: "scale", title: "Offline mode on key tools", status: "missing", priority: "P3", effort: "L" },
  { id: "a11y-audit", category: "mobile", phase: "hardening", title: "Accessibility audit (WCAG 2.1 AA)", status: "missing", priority: "P1", effort: "M", notes: "axe DevTools + manual keyboard nav. Required for govt + enterprise." },
  { id: "deep-linking", category: "mobile", phase: "polish", title: "Universal links iOS / app links Android", status: "missing", priority: "P3", effort: "M" },
  { id: "web-to-app", category: "mobile", phase: "polish", title: "Web-to-app handoff (open in app if installed)", status: "missing", priority: "P3", effort: "S" },
  { id: "app-store-listing", category: "mobile", phase: "polish", title: "App Store listing (screenshots, icon, copy)", status: "missing", priority: "P2", effort: "M" },
  { id: "play-store-listing", category: "mobile", phase: "polish", title: "Play Store listing (screenshots, icon, copy)", status: "missing", priority: "P2", effort: "M" },
  { id: "privacy-nutrition-labels", category: "mobile", phase: "polish", title: "Privacy nutrition labels (App Store)", status: "missing", priority: "P2", effort: "S" },
  { id: "push-permission-flow", category: "mobile", phase: "polish", title: "Push permission UX (ask at right moment)", status: "missing", priority: "P2", effort: "S" },
  { id: "biometric-auth", category: "mobile", phase: "polish", title: "Biometric auth (Face/Touch ID)", status: "missing", priority: "P3", effort: "S" },
  { id: "crash-reporting-mobile", category: "mobile", phase: "polish", title: "Mobile crash reporting (Crashlytics/Sentry)", status: "missing", priority: "P2", effort: "S" },
  { id: "force-update-mobile", category: "mobile", phase: "scale", title: "Force-update mechanism (critical bugs)", status: "missing", priority: "P2", effort: "S" },
  { id: "app-review-prompt", category: "mobile", phase: "scale", title: "App review prompt (after positive moment)", status: "missing", priority: "P3", effort: "XS" },
  { id: "rtl-layout", category: "mobile", phase: "polish", title: "RTL (Arabic) layout audit", status: "missing", priority: "P1", effort: "M", notes: "MENA market. Most components need dir-aware styles." },
  { id: "tablet-layout", category: "mobile", phase: "polish", title: "Tablet-optimized layout (iPad, foldables)", status: "partial", priority: "P3", effort: "M" },

  // ════════════════════════════════════════════════════════════════════
  // ── Launch readiness ──
  // ════════════════════════════════════════════════════════════════════
  { id: "launch-runbook", category: "launch", phase: "polish", title: "Launch runbook (T-30 to T+30 plan)", status: "missing", priority: "P0", effort: "M" },
  { id: "war-room", category: "launch", phase: "polish", title: "War-room channel + comms primed", status: "missing", priority: "P1", effort: "XS" },
  { id: "tabletop-drill", category: "launch", phase: "polish", title: "Tabletop incident drill (3 scenarios)", status: "missing", priority: "P1", effort: "S" },
  { id: "dns-ttl-drop", category: "launch", phase: "polish", title: "DNS TTLs dropped to 60s pre-launch", status: "missing", priority: "P2", effort: "XS" },
  { id: "scale-up-capacity", category: "launch", phase: "polish", title: "Pre-scale Supabase + Vercel plan", status: "missing", priority: "P1", effort: "XS" },
  { id: "waitlist-primed", category: "launch", phase: "polish", title: "Pre-launch waitlist warmed (email sequence)", status: "missing", priority: "P2", effort: "S" },
  { id: "kpi-baseline", category: "launch", phase: "polish", title: "Launch-week KPI dashboard", status: "missing", priority: "P1", effort: "M" },
  { id: "support-staffing", category: "launch", phase: "polish", title: "Launch-week support coverage plan", status: "missing", priority: "P1", effort: "XS" },
  { id: "rollback-trigger", category: "launch", phase: "polish", title: "Pre-defined rollback triggers (numbers, not feelings)", status: "missing", priority: "P0", effort: "XS" },
  { id: "post-mortem-template", category: "launch", phase: "polish", title: "Blameless post-mortem template", status: "missing", priority: "P2", effort: "XS" },
  { id: "press-embargo", category: "launch", phase: "polish", title: "Press embargo timing decided", status: "missing", priority: "P3", effort: "XS" },
  { id: "bug-bash", category: "launch", phase: "polish", title: "Whole-team bug bash 48h before launch", status: "missing", priority: "P1", effort: "S" },
  { id: "bug-freeze", category: "launch", phase: "polish", title: "Bug freeze 48h before launch", status: "missing", priority: "P1", effort: "XS" },
  { id: "dns-prewarm", category: "launch", phase: "polish", title: "DNS pre-warm at edge", status: "missing", priority: "P3", effort: "XS" },
  { id: "cdn-warm", category: "launch", phase: "polish", title: "CDN cache warm before traffic", status: "missing", priority: "P3", effort: "S" },
  { id: "backup-payment-processor", category: "launch", phase: "maturity", title: "Backup payment processor (if Paddle fails)", status: "missing", priority: "P3", effort: "L" },
  { id: "backup-email-provider", category: "launch", phase: "scale", title: "Backup email provider", status: "missing", priority: "P3", effort: "S" },
  { id: "founder-availability", category: "launch", phase: "polish", title: "Founder on-deck (no travel during launch)", status: "missing", priority: "P0", effort: "XS" },
  { id: "first-10-hours-plan", category: "launch", phase: "polish", title: "First-10-hours response plan", status: "missing", priority: "P1", effort: "XS" },
  { id: "metrics-tv", category: "launch", phase: "polish", title: "Real-time metrics on a TV during launch week", status: "missing", priority: "P2", effort: "XS" },
];

// ─────────────────────────────────────────────────────────────────────
// Derived helpers
// ─────────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<Status, string> = {
  done: "Done",
  partial: "In progress",
  missing: "Missing",
  blocked: "Blocked",
  na: "N/A",
};

export const STATUS_ICON: Record<Status, string> = {
  done: "✓",
  partial: "◐",
  missing: "○",
  blocked: "✕",
  na: "—",
};

export const PHASE_LABEL: Record<Phase, string> = {
  foundation: "Foundation",
  hardening: "Hardening",
  polish: "Polish",
  scale: "Scale",
  maturity: "Maturity",
};

/** Tailwind class fragments — match admin token set. */
export const STATUS_CLASSES: Record<Status, string> = {
  done: "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-300",
  partial: "bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300",
  missing: "bg-rose-500/10 text-rose-700 ring-1 ring-inset ring-rose-500/20 dark:text-rose-300",
  blocked: "bg-slate-500/10 text-slate-600 ring-1 ring-inset ring-slate-500/20 dark:text-slate-300",
  na: "bg-slate-500/5 text-faint ring-1 ring-inset ring-slate-500/10",
};

export const PRIORITY_CLASSES: Record<Priority, string> = {
  P0: "bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold",
  P1: "bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium",
  P2: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  P3: "bg-slate-500/10 text-faint",
};

export const PHASE_CLASSES: Record<Phase, string> = {
  foundation: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  hardening: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  polish: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  scale: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  maturity: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

export const EFFORT_LABEL: Record<Effort, string> = {
  XS: "<1h",
  S: "<4h",
  M: "<1d",
  L: "1-3d",
  XL: ">3d",
};

export interface Tally {
  done: number;
  partial: number;
  missing: number;
  blocked: number;
  na: number;
  total: number;
}

/** Counts per status for the whole list or a filtered slice. */
export function tally(items: Item[]): Tally {
  const out: Tally = { done: 0, partial: 0, missing: 0, blocked: 0, na: 0, total: 0 };
  for (const it of items) {
    out[it.status]++;
    out.total++;
  }
  return out;
}

/** Weighted completion: done = 1, partial = 0.5, na excluded. */
export function completion(items: Item[]): number {
  const counted = items.filter((i) => i.status !== "na");
  if (counted.length === 0) return 0;
  const score = counted.reduce(
    (s, i) => s + (i.status === "done" ? 1 : i.status === "partial" ? 0.5 : 0),
    0,
  );
  return Math.round((score / counted.length) * 100);
}

export function byCategory(catId: CategoryId, items: Item[] = CHECKLIST): Item[] {
  return items.filter((i) => i.category === catId);
}

export function byPhase(phase: Phase, items: Item[] = CHECKLIST): Item[] {
  return items.filter((i) => i.phase === phase);
}

export function byStatus(status: Status, items: Item[] = CHECKLIST): Item[] {
  return items.filter((i) => i.status === status);
}

/** Items that should be tackled next: P0/P1 missing-or-partial, ordered. */
export function nextUp(limit = 10, items: Item[] = CHECKLIST): Item[] {
  const open = items.filter(
    (i) =>
      (i.status === "missing" || i.status === "partial") &&
      (i.priority === "P0" || i.priority === "P1"),
  );
  // P0-missing first, then P0-partial, then P1-missing, then P1-partial.
  // Within ties, shorter effort first (XS, S, M, L, XL).
  const effortRank: Record<Effort, number> = { XS: 0, S: 1, M: 2, L: 3, XL: 4 };
  const score = (i: Item) => {
    const p = i.priority === "P0" ? 0 : 1;
    const s = i.status === "missing" ? 0 : 1;
    const e = i.effort ? effortRank[i.effort] : 5;
    return p * 100 + s * 10 + e;
  };
  return [...open].sort((a, b) => score(a) - score(b)).slice(0, limit);
}

/** Plain-English summary of overall state for the Overview page. */
export function plainSummary(): string {
  const t = tally(CHECKLIST);
  const pct = completion(CHECKLIST);
  const p0Open = CHECKLIST.filter(
    (i) =>
      i.priority === "P0" && (i.status === "missing" || i.status === "partial"),
  ).length;

  const verdict =
    pct >= 80
      ? "Close to launch — finishing touches."
      : pct >= 60
      ? "Solid product, real hardening work left."
      : pct >= 40
      ? "Strong foundation, still a lot to ship before public launch."
      : "Early days. Foundation looks good but hardening is mostly untouched.";

  return `${verdict} ${t.done} done, ${t.partial} in progress, ${t.missing} missing. ${p0Open} P0 items still open (must finish before launch).`;
}
