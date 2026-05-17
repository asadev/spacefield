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
  { id: "confirm-destructive", category: "product", phase: "hardening", title: "Confirm dialog on every destructive action", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-18 (N6): components/ConfirmButton.tsx pattern + 5 gap-fills (chat delete-message, launchpad file-delete + share-revoke, trash-permanent-delete, share-dialog-revoke)." },
  { id: "undo-snackbar", category: "product", phase: "polish", title: "Undo-snackbar pattern on non-destructive edits", status: "done", priority: "P3", effort: "M", notes: "Shipped 2026-05-18 (N6): components/UndoSnackbar.tsx + lib/undo.ts pub/sub bus. Mounted in layout. Wired to comment + task soft-delete with 5-second UNDO window calling /api/trash restore." },
  { id: "global-search", category: "product", phase: "polish", title: "Global search (Cmd+K command palette)", status: "done", priority: "P2", effort: "L", notes: "Shipped 2026-05-14: components/CommandPalette + /search page + search_documents tsvector index + global_search() RPC. Cmd-K opens anywhere. Tasks/projects/employees/comments index on create/update." },
  { id: "keyboard-shortcuts", category: "product", phase: "polish", title: "Keyboard shortcuts standard", status: "partial", priority: "P3", effort: "M", notes: "Cmd-K (search/jump/create) shipped 2026-05-14. Other shortcuts (j/k nav, ? for help) still pending." },
  { id: "csv-export", category: "product", phase: "polish", title: "CSV export on every list view", status: "partial", priority: "P2", effort: "S", notes: "Some lists export (admin/people, admin/tasks). Standardize across remaining lists." },
  { id: "saved-views", category: "product", phase: "scale", title: "Saved views / filters per user", status: "partial", priority: "P3", effort: "L", notes: "saved_views table + lib/saved-views/ helpers + SavedViewsDropdown component shipped 2026-05-14. List pages need to opt-in to using them." },
  { id: "notification-center", category: "product", phase: "polish", title: "In-app notification center", status: "done", priority: "P2", effort: "L", notes: "Shipped 2026-05-14: notifications table + RPCs + lib/collab/notifications.ts + NotificationBell component + /inbox page with All/Unread/Mentions/Assignments tabs + mark-all-read." },
  { id: "activity-feed-user", category: "product", phase: "polish", title: "Per-user activity feed", status: "done", priority: "P2", effort: "M", notes: "Shipped 2026-05-14: activities table + activity_emit() RPC + lib/collab/activity.ts + ActivityFeed component (per-record or workspace-wide)." },
  { id: "workspace-switcher", category: "product", phase: "foundation", title: "Workspace switcher (multi-workspace user)", status: "done", priority: "P0", effort: "M" },
  { id: "workspace-invites", category: "product", phase: "foundation", title: "Workspace invite flow", status: "partial", priority: "P0", effort: "M", notes: "Verify: invite, accept, role assignment, revoke. End-to-end test." },
  { id: "workspace-members", category: "product", phase: "foundation", title: "Workspace member management (roles, remove)", status: "partial", priority: "P0", effort: "M" },
  { id: "workspace-deletion", category: "product", phase: "hardening", title: "Workspace deletion flow", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-17 (P1): /workspace/settings danger zone, owner-only, type-workspace-name-to-confirm, 30d grace, /api/cron/workspace-purge runs daily 07:30 UTC. Migration 20260517a." },
  { id: "account-deletion", category: "product", phase: "hardening", title: "Account self-deletion flow", status: "done", priority: "P0", effort: "M", notes: "Shipped 2026-05-17 (P1): /account/danger-zone, type-email-to-confirm, 30d grace, /api/cron/account-purge runs daily 07:00 UTC. account_deletion_requests table + RPCs in 20260517a." },
  { id: "email-change", category: "product", phase: "hardening", title: "Email change flow with verification", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-17 (P1): /account email-change card uses Supabase Auth updateUser({email}) which sends verification round-trip automatically." },
  { id: "avatar-upload", category: "product", phase: "polish", title: "Avatar / profile photo upload", status: "done", priority: "P3", effort: "S", notes: "Audited 2026-05-18 (N6): app/tools/_components/ProfilePane.tsx already has end-to-end upload — mime validation, react-easy-crop, 512KB post-crop cap, Supabase storage to avatars bucket, persists to profiles.avatar_url + user_metadata.custom_avatar_url, remove flow. Marked complete." },
  { id: "file-uploads-general", category: "product", phase: "hardening", title: "Standard file upload (size limits, mime check)", status: "partial", priority: "P1", effort: "M" },
  { id: "version-history", category: "product", phase: "scale", title: "Version history for editable content", status: "missing", priority: "P3", effort: "L" },
  { id: "real-time-collab", category: "product", phase: "scale", title: "Real-time collaboration (Y-style CRDT)", status: "missing", priority: "P3", effort: "XL", notes: "Future. Most tools don't need it day one." },
  { id: "import-data", category: "product", phase: "polish", title: "Data import wizards (CSV, vCard, etc.)", status: "done", priority: "P2", effort: "L", notes: "Shipped 2026-05-17 (P4): universal 4-step wizard at /import (Contacts/Leads/Employees/Tasks). RFC-4180 parser, auto-mapping via header aliases, validation, batch import 100 rows/call. POST /api/import/[entity]." },

  // ── 2026-05-14 overnight build — new modules ──
  { id: "tasks-module", category: "product", phase: "foundation", title: "Tasks + Projects module", status: "done", priority: "P1", effort: "L", notes: "Shipped 2026-05-14: schema (projects + tasks), /tasks list+kanban+detail, /projects, /admin/tasks oversight, 5 AI tools (list/create/update/search/summarize). Inspired by Linear/Asana." },
  { id: "people-module", category: "product", phase: "foundation", title: "People (HR) module", status: "done", priority: "P1", effort: "XL", notes: "Shipped 2026-05-14: 7 tables (employees, time_off_policies/balances/requests, onboarding_templates/runs, employee_documents). Routes: /people, /people/[id], /people/org-chart, /people/time-off, /admin/people/*. 9 AI tools. UAE doc-expiry tracker. Inspired by BambooHR + Connecteam." },
  { id: "comments-mentions", category: "product", phase: "foundation", title: "Polymorphic comments + @mentions", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-14: comments table polymorphic on (entity_type, entity_id) + CommentsThread + MentionInput components + @mention fan-out into notifications. Works on any record." },
  { id: "tags-module", category: "product", phase: "polish", title: "Workspace-wide tags / labels", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-14: tags + entity_tags tables + /tags manager + TagChip / TagPicker components. Polymorphic — works on any record." },
  { id: "recycle-bin", category: "product", phase: "polish", title: "Universal recycle bin / trash recovery", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-14: /trash page lists workspace soft-deletes across tasks/projects/comments/CRM/files with restore + admin-only purge. Some tables (employees, employee_documents) use archived_at — separate un-archive flow." },
  { id: "demo-data-seed", category: "cx", phase: "polish", title: "Sample / demo data seed for new workspaces", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-14: /api/onboarding/seed-demo POST inserts ~30 demo rows tagged __demo__ for reversible removal. Admin-gated." },

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
  { id: "rag-kb", category: "ai", phase: "polish", title: "RAG / pgvector knowledge base", status: "partial", priority: "P2", effort: "XL", notes: "Shipped 2026-05-18 (N5): pgvector extension + embeddings table (HNSW cosine) + semantic_search RPC + lib/ai/embeddings.ts (embed/indexChunk/semanticSearch). Migration 20260518b. Content indexing into chunks still TODO per data source." },
  { id: "skills-marketplace", category: "ai", phase: "maturity", title: "Skills marketplace (user-submitted)", status: "missing", priority: "P3", effort: "XL" },
  { id: "streaming-responses", category: "ai", phase: "hardening", title: "Streaming AI responses (SSE)", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-17 (P6): unified lib/ai-stream/{server,client}.ts — sseHeaders/formatSSE/streamToSSE helpers + useAIStream() hook with AbortController. Applied to /chat surface; new code can opt in trivially." },
  { id: "stop-generation", category: "ai", phase: "polish", title: "Stop-generation button on every AI surface", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-17 (P6): components/StopGenerationButton.tsx + visible during streaming. useAIStream().stop() aborts upstream Anthropic.messages.stream via req.signal." },
  { id: "token-counting", category: "ai", phase: "hardening", title: "Token usage tracked per request", status: "partial", priority: "P1", effort: "S", notes: "Need: stored in DB per call with cost, agent, user, workspace." },
  { id: "per-agent-dashboard", category: "ai", phase: "hardening", title: "Per-agent dashboard (latency, cost, success rate, errors)", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-18 (N5): /admin/insights/ai-costs page reads ai_cost_summary(60) + ai_cost_summary(1440) RPCs and renders per-agent + per-model tables (calls/tokens/cost). Latency dashboard at /admin/insights/latency from B-1 2026-05-17." },
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
  { id: "async-batch", category: "ai", phase: "scale", title: "Async/batch processing for heavy AI tasks", status: "done", priority: "P2", effort: "L", notes: "Shipped 2026-05-18 (N5): ai_batch_jobs queue table + enqueueAIBatch/runQueuedAIBatch helpers + /api/cron/ai-batch-runner every 1 min. Two-phase atomic claim prevents double-execution. 4-min per-job cap + callback URL support." },
  { id: "function-call-test-harness", category: "ai", phase: "scale", title: "Function-calling test harness", status: "missing", priority: "P2", effort: "M" },
  { id: "long-context-strategy", category: "ai", phase: "scale", title: "Long-context handling (>100k tokens)", status: "missing", priority: "P3", effort: "M", notes: "Summarize old turns, retain recent verbatim, RAG the rest." },
  { id: "embedding-index", category: "ai", phase: "polish", title: "Embeddings table + vector index (pgvector)", status: "done", priority: "P2", effort: "M", notes: "Shipped 2026-05-18 (N5 migration 20260518b): vector extension enabled, embeddings table with workspace_id + entity_type/id polymorphic ref + HNSW cosine ANN index + RLS workspace-scoped." },
  { id: "ai-cost-public", category: "ai", phase: "polish", title: "Show users their AI usage / remaining budget", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-18 (N5): components/AICostBudget.tsx — server component resolves workspace tier → fixed budget map (free $0 / pro $10 / business $50) → progress bar + over-budget badge. Mounted on /admin/insights/ai-costs." },

  // ════════════════════════════════════════════════════════════════════
  // ── Database & data ──
  // ════════════════════════════════════════════════════════════════════
  { id: "schema-baseline", category: "database", phase: "foundation", title: "Schema baseline (~60 tables)", status: "done", priority: "P0", effort: "XL" },
  { id: "rls-coverage", category: "database", phase: "hardening", title: "RLS on every multi-tenant table (verified)", status: "partial", priority: "P0", effort: "M", notes: "Run weekly: query returns tables WITHOUT a policy. Single biggest data-leak vector." },
  { id: "migrations-rollback", category: "database", phase: "hardening", title: "Every migration has documented rollback", status: "partial", priority: "P1", effort: "M", notes: "Shipped 2026-05-14: supabase/migrations/README.md + docs/database/CONVENTIONS.md codify the convention. 20260514b includes a worked inverse-SQL header. Retrofitting prior migrations still pending." },
  { id: "indexes-audit", category: "database", phase: "hardening", title: "Index audit on top 50 slow queries", status: "missing", priority: "P1", effort: "M", notes: "Run pg_stat_statements; add covering indexes where missing. Linear blogged about this." },
  { id: "connection-pooler-tuned", category: "database", phase: "hardening", title: "Connection pooler tuned (transaction mode)", status: "partial", priority: "P1", effort: "S", notes: "Supavisor on by default. Verify pool mode + max_client_conn sized for Vercel fan-out." },
  { id: "backups-restore-drill", category: "database", phase: "hardening", title: "Backups + documented restore drill", status: "partial", priority: "P0", effort: "S", notes: "Supabase has daily backups + PITR. db_backup_drills log table shipped 2026-05-14 to record actual drills. First real restore drill still TBD." },
  { id: "data-retention-policy", category: "database", phase: "hardening", title: "Data retention policy (logs, events, deleted users)", status: "partial", priority: "P1", effort: "M", notes: "admin_purge_audit_log RPC (May-14) + /api/cron/audit-purge weekly Mon 06:15 UTC (May-15 B-2) + admin_caller_is_admin service-role bypass (May-15 migration 20260515d) — audit log retention is now live. Per-table policies (paddle_webhook_events, error_events) still TBD." },
  { id: "soft-delete-pattern", category: "database", phase: "hardening", title: "Standard soft-delete pattern (deleted_at)", status: "partial", priority: "P2", effort: "M", notes: "Added deleted_at + partial indexes to crm_contacts/crm_leads/crm_deals 2026-05-14. Workspace_files + chat.messages already had it. Workspaces/shared_links/forms/notes still pending." },
  { id: "audit-log-coverage", category: "database", phase: "foundation", title: "Audit log captures every admin mutation", status: "done", priority: "P0", effort: "M", ref: "/admin/audit" },
  { id: "read-replicas", category: "database", phase: "scale", title: "Read replicas for analytics queries", status: "missing", priority: "P2", effort: "S", notes: "Supabase Pro+ ships them. Spares the primary." },
  { id: "slow-query-cron", category: "database", phase: "scale", title: "Weekly slow-query review cron", status: "done", priority: "P2", effort: "S", notes: "Shipped end-to-end: slow_queries_top_50 view + admin_slow_queries RPC (May-14) + /api/cron/slow-queries-snapshot weekly Mon 06:45 UTC (May-15) + slow_query_snapshots history table + /admin/insights/slow-queries dashboard + service-role bypass on the admin gate." },
  { id: "materialized-views", category: "database", phase: "scale", title: "Materialized views for heavy aggregations", status: "missing", priority: "P3", effort: "M", notes: "Share analytics, insights dashboards." },
  { id: "partitioning", category: "database", phase: "scale", title: "Partition time-series tables (logs, events, audit)", status: "missing", priority: "P2", effort: "M", notes: "Postgres native partitioning by month. Keeps queries fast as the table grows." },
  { id: "fk-cascade-review", category: "database", phase: "hardening", title: "Foreign-key cascade rules reviewed", status: "missing", priority: "P2", effort: "M", notes: "ON DELETE CASCADE on the wrong column = silent data loss." },
  { id: "schema-erd", category: "database", phase: "polish", title: "Schema ERD docs", status: "done", priority: "P3", effort: "S", notes: "Shipped 2026-05-15 (B-2): docs/database/ERD.md — 452 lines, 145 tables across 16 domains, relationships + purpose per table." },
  { id: "migration-ci-test", category: "database", phase: "scale", title: "Migrations tested in CI (apply + rollback)", status: "missing", priority: "P2", effort: "M" },
  { id: "data-seed-scripts", category: "database", phase: "polish", title: "Data seed scripts for new accounts", status: "missing", priority: "P2", effort: "S", notes: "Empty workspace = sad workspace. Seed sample CRM contacts, a sample tool config, etc." },
  { id: "prod-db-access-policy", category: "database", phase: "hardening", title: "Production DB access policy (who, what, when)", status: "missing", priority: "P1", effort: "S", notes: "Service-role keys in vault only. Document who has Supabase Studio access." },
  { id: "pii-encryption-col", category: "database", phase: "scale", title: "Column-level encryption on sensitive PII", status: "missing", priority: "P2", effort: "M", notes: "pgcrypto on phone, address, ID numbers. Defense-in-depth beyond RLS." },
  { id: "fulltext-search", category: "database", phase: "polish", title: "Full-text search indices on user content", status: "missing", priority: "P2", effort: "M" },
  { id: "extensions-audit", category: "database", phase: "hardening", title: "Postgres extensions audit (pg_stat_statements, pgvector, pgcrypto)", status: "partial", priority: "P2", effort: "XS" },
  { id: "vacuum-tuning", category: "database", phase: "scale", title: "Autovacuum tuned for hot tables", status: "missing", priority: "P2", effort: "S" },
  { id: "table-size-monitor", category: "database", phase: "scale", title: "Table size monitoring + growth alerts", status: "partial", priority: "P2", effort: "S", notes: "Shipped 2026-05-14: public.table_sizes view over pg_class with total_bytes / row_estimate. Alert wiring (cron + thresholds) still TBD." },
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
  { id: "etag-headers", category: "cache", phase: "polish", title: "ETag headers on JSON API responses", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-14 (lib) + applied 2026-05-17 (P2): /api/admin/errors, /api/admin/integrations, /api/admin/alerts all use respondWithEtag(). 304 caching live on read-heavy admin GETs." },
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
  { id: "bundle-analyzer", category: "perf", phase: "hardening", title: "Bundle size budget + analyzer in CI", status: "partial", priority: "P1", effort: "S", notes: "Shipped 2026-05-18 (N4): next.config.ts loads @next/bundle-analyzer when ANALYZE=1 env is set + the dep is installed. Run `pnpm add -D @next/bundle-analyzer && ANALYZE=1 pnpm build` to emit analyze/{client,server}.html. CI gating still pending." },
  { id: "rsc-streaming", category: "perf", phase: "polish", title: "Suspense boundaries for streaming RSC", status: "partial", priority: "P2", effort: "M" },
  { id: "p95-db-queries", category: "perf", phase: "hardening", title: "DB query p95 < 200ms on every page", status: "missing", priority: "P1", effort: "M", notes: "Need pg_stat_statements wired to admin/insights for visibility." },
  { id: "ttfb-budget", category: "perf", phase: "hardening", title: "TTFB budget (<500ms public, <1s admin)", status: "missing", priority: "P1", effort: "S" },
  { id: "speed-insights", category: "perf", phase: "hardening", title: "Vercel Speed Insights enabled", status: "done", priority: "P1", effort: "XS", notes: "@vercel/speed-insights + @vercel/analytics wired in app/layout.tsx. Real-user Web Vitals flowing." },
  { id: "n-plus-one", category: "perf", phase: "hardening", title: "N+1 query audit on list pages", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-18 (N4): 5 fixes — tools/availability (was 80 RPC round-trips per Launchpad render), admin/storage (was 50 storage RPC calls), admin/bulk/run agent counts, admin/locales counts, admin/social dedupe-by-r2_key signing cache. Each has inline 'N+1 fix' comment." },
  { id: "preload-critical", category: "perf", phase: "polish", title: "Preload critical fonts + hero images", status: "partial", priority: "P2", effort: "S" },
  { id: "client-bundle-trim", category: "perf", phase: "scale", title: "Trim client bundles (dynamic import heavy libs)", status: "partial", priority: "P2", effort: "M" },
  { id: "mobile-perf", category: "perf", phase: "hardening", title: "Mobile 3G/4G perf check (LCP <4s on slow network)", status: "partial", priority: "P1", effort: "S", notes: "Audit doc shipped 2026-05-18 (N4): docs/perf/MOBILE.md — 5 surfaces analysed (/, /pricing, /tools/property-poster-creator, /admin, sheets editor) with import counts + heavy-dep flags + cross-cutting recommendations. Actual fix-PRs follow." },
  { id: "react-profiler", category: "perf", phase: "scale", title: "React Profiler audit on slow components", status: "missing", priority: "P2", effort: "M" },
  { id: "rsc-depth-audit", category: "perf", phase: "scale", title: "RSC component depth audit (no 50-deep trees)", status: "missing", priority: "P3", effort: "M" },
  { id: "cold-start-times", category: "perf", phase: "scale", title: "Vercel function cold-start times measured + budgeted", status: "missing", priority: "P2", effort: "S" },
  { id: "api-latency-budgets", category: "perf", phase: "hardening", title: "Per-endpoint latency budget (p95)", status: "missing", priority: "P1", effort: "S" },
  { id: "code-splitting", category: "perf", phase: "polish", title: "Per-route code splitting (Next.js default, audit)", status: "done", priority: "P3", effort: "XS" },
  { id: "tree-shaking", category: "perf", phase: "polish", title: "Tree-shaking verified (no dead lodash etc.)", status: "partial", priority: "P3", effort: "S" },
  { id: "virtual-scroll", category: "perf", phase: "scale", title: "Virtual scrolling on long lists (>500 rows)", status: "done", priority: "P2", effort: "M", notes: "Shipped 2026-05-18 (N4): components/VirtualList.tsx (dependency-free, ResizeObserver-based) + VirtualTableBody table-friendly variant. Applied to /trash + /tags (highest-volume unpaginated client-side lists)." },
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
  { id: "csp-headers", category: "security", phase: "hardening", title: "Content-Security-Policy headers", status: "partial", priority: "P1", effort: "M", notes: "Shipped 2026-05-13 in Report-Only mode (lib/security-headers.ts). Tighten + flip to enforcing once a violation reporter (Sentry) is wired." },
  { id: "hsts", category: "security", phase: "hardening", title: "HSTS header (Strict-Transport-Security)", status: "done", priority: "P1", effort: "XS", notes: "Shipped 2026-05-13 — max-age 2y, includeSubDomains, preload." },
  { id: "x-content-type", category: "security", phase: "hardening", title: "X-Content-Type-Options: nosniff", status: "done", priority: "P1", effort: "XS" },
  { id: "x-frame-options", category: "security", phase: "hardening", title: "X-Frame-Options / frame-ancestors", status: "done", priority: "P1", effort: "XS", notes: "SAMEORIGIN + CSP frame-ancestors self." },
  { id: "referrer-policy", category: "security", phase: "hardening", title: "Referrer-Policy header", status: "done", priority: "P2", effort: "XS", notes: "strict-origin-when-cross-origin" },
  { id: "permissions-policy", category: "security", phase: "hardening", title: "Permissions-Policy header", status: "done", priority: "P2", effort: "XS", notes: "Locks camera/mic/payment/FLoC; geo allowed for self." },
  { id: "owasp-asvs", category: "security", phase: "hardening", title: "OWASP ASVS Level 1 self-assessment", status: "missing", priority: "P1", effort: "L", notes: "~60 controls. Walk through, mark each, fix gaps." },
  { id: "csrf-protection", category: "security", phase: "hardening", title: "CSRF protection on server actions", status: "partial", priority: "P0", effort: "S", notes: "Next.js built-in origin check. Verify not disabled." },
  { id: "waf", category: "security", phase: "hardening", title: "WAF (Vercel Firewall or Cloudflare)", status: "missing", priority: "P1", effort: "M" },
  { id: "ddos-mitigation", category: "security", phase: "hardening", title: "DDoS mitigation (L3/L4 + L7)", status: "partial", priority: "P1", effort: "S" },
  { id: "pen-test", category: "security", phase: "polish", title: "Third-party penetration test", status: "missing", priority: "P1", effort: "L", notes: "$3-8k. AFTER hardening, BEFORE public launch. Cobalt or HackerOne Pentest." },
  { id: "dep-scanning", category: "security", phase: "hardening", title: "Dependency vulnerability scanning in CI", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-14: .github/workflows/audit.yml runs pnpm audit --audit-level=high on every PR + Mondays 06:00 UTC; Dependabot grouped weekly minor+patch." },
  { id: "captcha-signup", category: "security", phase: "hardening", title: "CAPTCHA / Turnstile on signup + share-create", status: "missing", priority: "P2", effort: "S", notes: "Cloudflare Turnstile, free, invisible." },
  { id: "file-upload-scan", category: "security", phase: "hardening", title: "Virus/malware scan on user uploads", status: "missing", priority: "P2", effort: "M" },
  { id: "session-mgmt", category: "security", phase: "hardening", title: "Session management (device list + remote revoke)", status: "partial", priority: "P2", effort: "M" },
  { id: "mfa-2fa", category: "security", phase: "hardening", title: "MFA / 2FA for users", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-17 (S4): /account/security TOTP enrollment via Supabase auth.mfa.enroll + verify. Migration 20260517e. Users can add authenticator app + view factors + remove." },
  { id: "mfa-recovery", category: "security", phase: "hardening", title: "MFA recovery codes flow", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-17 (S4): 8 single-use codes (XXXXX-XXXXX format, ~50-bit entropy), SHA-256+pepper hashed in mfa_recovery_codes table. Plaintext shown once at generation; regenerable behind re-auth." },
  { id: "reauthentication-sensitive", category: "security", phase: "hardening", title: "Re-auth for sensitive actions (delete, change email)", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-17 (S4): lib/mfa/reauth.ts::requireRecentAuth (10min default, 1h cookie ceiling). /auth/reauth prompt with TOTP+recovery fallback. Applied to email change + account/workspace deletion + disable-MFA." },
  { id: "account-lockout", category: "security", phase: "hardening", title: "Account lockout on brute-force", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-17 (S5) + wired 2026-05-18 (N3): /api/auth/check-lockout probe before magic-link send + defensive re-check in /auth/callback. /auth/locked?email&until page surfaces state. ?unlock=1 query unlocks via magic-link. recordAuthFailure stays exported for future password-auth path (Spacefield is OTP+OAuth only today)." },
  { id: "suspicious-login-alerts", category: "security", phase: "hardening", title: "Suspicious-login email (new device / location)", status: "partial", priority: "P2", effort: "M", notes: "Shipped 2026-05-17 (S5): login_events + record_login RPC detects new device/IP (60d window), /api/cron/suspicious-login-scan emits in-app notifications every 15min. Email sender stubbed pending Resend/Postmark signup." },
  { id: "secret-scanning-repo", category: "security", phase: "hardening", title: "Secret scanning in repo (Gitleaks)", status: "done", priority: "P1", effort: "XS", notes: "Shipped 2026-05-17 (S6): .github/workflows/secret-scan.yml runs Gitleaks on every PR + push to main." },
  { id: "license-audit", category: "security", phase: "hardening", title: "License audit on dependencies (no GPL leakage)", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-17 (S6): .github/workflows/license-check.yml runs license-checker summary + fails on GPL/AGPL." },
  { id: "sbom", category: "security", phase: "maturity", title: "SBOM (software bill of materials)", status: "done", priority: "P3", effort: "S", notes: "Shipped 2026-05-17 (S6): .github/workflows/sbom.yml generates CycloneDX on every push to main, uploaded as workflow artifact." },
  { id: "dast-scan", category: "security", phase: "polish", title: "DAST scan (OWASP ZAP) in CI nightly", status: "missing", priority: "P2", effort: "M" },
  { id: "sast-scan", category: "security", phase: "hardening", title: "SAST scan (CodeQL) on PRs", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-17 (S6): .github/workflows/sast.yml runs GitHub CodeQL on javascript-typescript on every PR + weekly Monday cron. Free, native, no signup." },
  { id: "bug-bounty", category: "security", phase: "maturity", title: "Bug bounty program (HackerOne / Intigriti)", status: "missing", priority: "P3", effort: "S" },
  { id: "security-txt", category: "security", phase: "hardening", title: "/.well-known/security.txt", status: "done", priority: "P2", effort: "XS", notes: "Shipped 2026-05-13. Points at /legal/security + security@spacefield.co." },
  { id: "responsible-disclosure", category: "security", phase: "hardening", title: "Responsible disclosure policy page", status: "done", priority: "P2", effort: "S", notes: "Shipped in /legal/security 2026-05-13. Hall-of-fame section ready for first valid report." },
  { id: "incident-response-sec", category: "security", phase: "hardening", title: "Security incident response plan", status: "missing", priority: "P1", effort: "M" },
  { id: "data-breach-process", category: "security", phase: "hardening", title: "Data-breach notification process (72h GDPR)", status: "missing", priority: "P1", effort: "S" },
  { id: "webhook-sig-incoming", category: "security", phase: "hardening", title: "Verify incoming webhook signatures (Paddle)", status: "partial", priority: "P0", effort: "XS", notes: "lib/paddle-verify.ts shipped 2026-05-14 (ts+h1 parser, 5-min replay window, constant-time HMAC). Paddle webhook route still uses its inline verifier — swap to the lib." },
  { id: "webhook-sig-outgoing", category: "security", phase: "hardening", title: "Sign outgoing webhooks (HMAC)", status: "done", priority: "P1", effort: "S", ref: "/admin/webhooks", notes: "Shipped 2026-05-14 (lib) + applied 2026-05-17 (P2): lib/webhooks/sign.ts inline HMAC replaced with lib/hmac.ts::signHmacSha256. Outgoing X-Signature header live on dispatcher." },
  { id: "api-key-scoping", category: "security", phase: "hardening", title: "API key scoping (read-only vs admin)", status: "partial", priority: "P1", effort: "M" },
  { id: "api-key-expiry", category: "security", phase: "polish", title: "API key expiration + rotation reminder", status: "missing", priority: "P2", effort: "S" },
  { id: "admin-ip-allowlist", category: "security", phase: "hardening", title: "IP allowlist for /admin (optional, per-account)", status: "partial", priority: "P2", effort: "M", ref: "/admin/ip-rules" },
  { id: "tls-1-3", category: "security", phase: "foundation", title: "TLS 1.3", status: "done", priority: "P0", effort: "XS", notes: "Vercel default." },
  { id: "cert-monitoring", category: "security", phase: "hardening", title: "TLS cert auto-renewal monitoring", status: "partial", priority: "P1", effort: "XS", notes: "Vercel handles renewal. Add an alert if it fails." },
  { id: "audit-log-immutable", category: "security", phase: "hardening", title: "Audit log immutable (append-only)", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-14 in 20260514b: restrictive RLS policies DENY UPDATE + DELETE on admin_audit_log for anon + authenticated. Service-role keeps bypass for legitimate writes." },

  // ──────────────────────────────────────────────────────────────────
  // 2026-05-15 SECURITY SCAN findings (5 parallel opus scanners)
  // Auto-fix dispatched in same session; statuses flip as fixes land.
  // ──────────────────────────────────────────────────────────────────

  // P0 — Critical (ALL DONE via 2026-05-15 fix sweep)
  { id: "scan-sb-001-quote-xss", category: "security", phase: "hardening", title: "[SB-001] Stored XSS in /q/[slug] via quote.terms", status: "done", priority: "P0", effort: "S", notes: "FIXED 2026-05-15 (V-1): quote-builder feeds quote.terms through sanitiseTermsHtml; /q/[slug] re-sanitises on read (defence in depth). New lib/safe-html.ts." },
  { id: "scan-sb-002-embed-xss", category: "security", phase: "hardening", title: "[SB-002] Stored XSS in /p/[slug] via embed block.html", status: "done", priority: "P0", effort: "S", notes: "FIXED 2026-05-15 (V-1): /p/[slug] renders '[embed removed for safety]' placeholder; mintLink strips html field from any embed block." },
  { id: "scan-sc-001-service-role-fallback", category: "security", phase: "hardening", title: "[SC-001] Service-role client silently falls back to anon key when env missing", status: "done", priority: "P0", effort: "XS", notes: "FIXED 2026-05-15 (V-5): lib/supabase/admin.ts throws on missing URL/key; the 3 mirrors warn-once + return null/[]. Production trip-wire eliminated." },
  { id: "scan-sd-001-contact-unauth", category: "security", phase: "hardening", title: "[SD-001] /api/contact: no auth, no rate-limit, sends 2 emails per call (mailbomb vector)", status: "done", priority: "P0", effort: "XS", notes: "FIXED 2026-05-15 (V-3): wrapped with withApiHandler + rateLimit 5/600s + _hp_company honeypot." },
  { id: "scan-sd-002-share-mint-rate", category: "security", phase: "hardening", title: "[SD-002] /api/share/mint: no rate-limit, no slug allowlist", status: "done", priority: "P0", effort: "S", notes: "FIXED 2026-05-15 (V-3): wrapped with withApiHandler 30/600s + reserved-slug reject (signin/admin/api/spacefield/etc)." },
  { id: "scan-se-001-next-cve", category: "security", phase: "hardening", title: "[SE-001] next@^16.2.4 has 7 advisories including 3 middleware-bypass CVEs", status: "done", priority: "P0", effort: "XS", notes: "FIXED 2026-05-15 (V-5): package.json bumped to ^16.2.6. Vercel auto-installs on next deploy." },

  // P1 — High (most done; xlsx + PII compliance + share-anon-rate need Asad input)
  { id: "scan-sa-001-share-mint-workspace", category: "security", phase: "hardening", title: "[SA-001] share_mint RPC trusts client workspace_id without membership check", status: "done", priority: "P1", effort: "S", notes: "FIXED 2026-05-15 (V-3 migration 20260515a): share_mint now raises 'not a member of workspace' when is_workspace_member(p_workspace_id) fails (null = personal link still allowed)." },
  { id: "scan-sa-002-share-anon-rpcs", category: "security", phase: "hardening", title: "[SA-002] share_record_submit/view granted to anon, no rate-limit or payload-size cap", status: "partial", priority: "P1", effort: "M", notes: "PARTIAL 2026-05-15 (V-3 migration 20260515a): share_record_submit now rejects payloads >16KB. Anon rate-limit on direct PostgREST RPC calls still missing — needs design decision (route through Next vs keep anon direct)." },
  { id: "scan-sb-003-webhook-ssrf", category: "security", phase: "hardening", title: "[SB-003] SSRF via payload.webhookUrl: fetch(userInput) with response excerpt logged", status: "done", priority: "P1", effort: "S", notes: "FIXED 2026-05-15 (V-2): new lib/safe-fetch.ts blocks private/loopback/link-local IPs + cloud metadata + non-http(s); applied to 4 call sites (share-webhook-sign, webhooks/sign, workflow-runner, agent skill HTTP dispatcher)." },
  { id: "scan-sb-004-help-md-xss", category: "security", phase: "hardening", title: "[SB-004] XSS via javascript:/data: URI scheme in admin help-article markdown links", status: "done", priority: "P1", effort: "XS", notes: "FIXED 2026-05-15 (V-1): both _markdown.ts and _markdownClient.ts route link/image URLs through safeHref() (scheme allowlist: http(s)/mailto/tel/relative/anchor)." },
  { id: "scan-sb-005-or-filter-injection", category: "security", phase: "hardening", title: "[SB-005] PostgREST .or()-filter injection in AI CRM search tools", status: "done", priority: "P1", effort: "S", notes: "FIXED 2026-05-15 (V-3): crm-contacts + crm-companies search tools now pipe query through escapeForOr(escapeForLike(q)) before interpolation. New lib/escape-helpers.ts." },
  { id: "scan-sb-006-or-filter-weak", category: "security", phase: "hardening", title: "[SB-006] .or() filter weaker escapes in tasks/people libs", status: "done", priority: "P1", effort: "XS", notes: "FIXED 2026-05-15 (V-3): lib/tasks/server.ts (2 sites) + lib/people/server.ts now use the same escapeForLike + escapeForOr helpers." },
  { id: "scan-sb-007-csv-formula-inj", category: "security", phase: "hardening", title: "[SB-007] CSV formula injection in admin exports", status: "done", priority: "P1", effort: "XS", notes: "FIXED 2026-05-15 (V-3): app/admin/database/_helpers.ts::csvCell + app/admin/people/export/route.ts now delegate to escapeCsvCell (prefixes =/@/+/-/\\t with ')." },
  { id: "scan-sc-002-cron-secret-url", category: "security", phase: "hardening", title: "[SC-002] CRON_SECRET in URL query string logged by Vercel", status: "done", priority: "P1", effort: "XS", notes: "FIXED 2026-05-15 (V-5): app/admin/jobs/_actions.ts no longer writes ?secret=; Authorization: Bearer header path is the only one." },
  { id: "scan-sc-003-error-leak", category: "security", phase: "hardening", title: "[SC-003] Raw DB error messages echoed to API clients", status: "done", priority: "P1", effort: "M", notes: "Final sweep 2026-05-18 (N1): 30 more routes patched (CRM root x11, activity+notifications x2, wallpapers x2, cron suspicious-login-scan, files x3, share x6, inbound x2, billing+paddle x2, people docs reveal). Total swept ~65 routes — admin + agent + CRM + most user-facing. Remaining ~25 routes only return Supabase result-object error.message passthroughs (not caught exceptions); lower-impact and separate hardening pass." },
  { id: "scan-sc-004-error-page", category: "security", phase: "hardening", title: "[SC-004] error.tsx + global-error.tsx render error.message in prod", status: "done", priority: "P1", effort: "XS", notes: "FIXED 2026-05-15 (V-5): both pages now show generic copy + error.digest only; raw message JSX removed." },
  { id: "scan-sc-005-pii-eid-plaintext", category: "security", phase: "hardening", title: "[SC-005] employee_documents.number (EID/visa) plaintext + readable by every workspace member", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-17 (S1 migration 20260517d): pgcrypto column encryption (pgp_sym_encrypt with vault-stored app_pii_key), tightened RLS to HR-role or document-owner only, API masking by default (number_last4), reveal flow via /api/people/documents/[id]/reveal with audit log." },
  { id: "scan-sd-003-comments-rate", category: "security", phase: "hardening", title: "[SD-003] /api/comments POST/PATCH/DELETE: no rate-limit, no mention cap", status: "done", priority: "P1", effort: "XS", notes: "FIXED 2026-05-15 (V-3): each verb wrapped in withApiHandler with its own bucket; POST/PATCH cap mentions at 10 (too_many_mentions 400)." },
  { id: "scan-sd-004-people-mass-assign", category: "security", phase: "hardening", title: "[SD-004] /api/people/employees POST: no auth + mass-assignment via user_id", status: "done", priority: "P1", effort: "S", notes: "FIXED 2026-05-15 (V-3): auth.getUser() 401 at route boundary + .strict() Zod schema that omits user_id; mass-assignment now impossible." },
  { id: "scan-sd-005-people-routes", category: "security", phase: "hardening", title: "[SD-005] /api/people/onboarding|time-off|documents: same skip-auth + mass-assignment", status: "done", priority: "P1", effort: "S", notes: "FIXED 2026-05-15 (V-3): same auth gate + .strict() Zod schemas across all 3 routes." },
  { id: "scan-sd-006-webhook-ssrf-admin", category: "security", phase: "hardening", title: "[SD-006] Admin outgoing webhook test: no SSRF allowlist", status: "done", priority: "P1", effort: "S", notes: "FIXED 2026-05-15 (V-2): lib/webhooks/sign.ts uses safeFetch — blocks private IPs + cloud metadata even from admin." },
  { id: "scan-se-002-xlsx", category: "security", phase: "hardening", title: "[SE-002] xlsx@^0.18.5 unpatched", status: "done", priority: "P1", effort: "M", notes: "Closed 2026-05-18 (N2): sheets editor fully ported from xlsx to exceljs (bidirectional Univer conversion including styles + merges + formulas + CSV import path). xlsx removed from package.json. SheetJS CVEs gone." },
  { id: "scan-se-003-csp-no-reporter", category: "security", phase: "hardening", title: "[SE-003] CSP Report-Only has no report-uri/report-to", status: "done", priority: "P1", effort: "S", notes: "FIXED 2026-05-15 (V-5): new /api/security/csp-report route (edge, throttled, 16KB cap, logs to error_events). lib/security-headers.ts now includes report-uri + report-to + Report-To header." },

  // P2 — Medium (most done; SB-008 prompt-injection + SC-006 inbound-token still deferred)
  { id: "scan-sa-003-contact-rate", category: "security", phase: "hardening", title: "[SA-003] /api/contact rate-limit", status: "done", priority: "P2", effort: "XS", notes: "FIXED via SD-001 (same fix covers both)." },
  { id: "scan-sa-004-task-get-unauth", category: "security", phase: "hardening", title: "[SA-004] /api/tasks/:id + /api/projects/:id GET skip auth", status: "done", priority: "P2", effort: "XS", notes: "FIXED 2026-05-15 (V-3): both GET handlers now call getAuthUserId() and 401 short-circuit." },
  { id: "scan-sb-008-prompt-injection", category: "security", phase: "hardening", title: "[SB-008] Indirect prompt injection: tool outputs into LLM context", status: "done", priority: "P2", effort: "L", notes: "Shipped 2026-05-17 (S2): lib/agent/runtime/_sanitize.ts wraps every tool output in ::SPACEFIELD::TOOL_OUTPUT::DATA_ONLY:: fence + strips zero-width/control chars + role-tag tokens. Executor system prompt instructs model to treat fenced content as data." },
  { id: "scan-sb-011-file-url-xss", category: "security", phase: "hardening", title: "[SB-011] employee_documents.file_url not validated", status: "done", priority: "P2", effort: "XS", notes: "FIXED 2026-05-15 (V-1): createEmployeeDocument validates file_url is null or http(s); throws file_url_must_be_http_or_https otherwise." },
  { id: "scan-sc-006-inbound-token-url", category: "security", phase: "hardening", title: "[SC-006] Inbound webhook ?token= fallback ends up in logs", status: "missing", priority: "P2", effort: "S", notes: "Deferred: deprecating the query-string path will break existing Zapier/Make integrations. Needs migration plan + customer comms first." },
  { id: "scan-sc-007-waitlist-email-log", category: "security", phase: "hardening", title: "[SC-007] /waitlist action logs raw user emails", status: "done", priority: "P2", effort: "XS", notes: "FIXED 2026-05-15 (V-5): emailLogTag(sha256.slice(0,8)) replaces raw email in all 4 log lines." },
  { id: "scan-sd-007-health-leak", category: "security", phase: "hardening", title: "[SD-007] /api/health publicly exposes commit SHA + region + probe details", status: "done", priority: "P2", effort: "XS", notes: "FIXED 2026-05-15 (V-5): commit+region+detail gated behind ?deep=1 + Authorization: Bearer (HEALTH_DEEP_TOKEN or CRON_SECRET fallback). Default body slim." },
  { id: "scan-sd-008-cron-timing", category: "security", phase: "hardening", title: "[SD-008] cron-secret === not crypto.timingSafeEqual", status: "done", priority: "P2", effort: "XS", notes: "FIXED 2026-05-15 (V-3): safeEqualHeader helper uses timingSafeEqual + burns a flat compare on length mismatch." },
  { id: "scan-sd-009-savecontent-type", category: "security", phase: "hardening", title: "[SD-009] /api/files/save-content content-type allowlist", status: "done", priority: "P2", effort: "XS", notes: "FIXED 2026-05-15 (V-3): allowlist of application/json | text/plain | text/markdown | text/csv | OOXML; everything else rejected with 400." },
  { id: "scan-sd-013-no-body-limit", category: "security", phase: "hardening", title: "[SD-013] No app-level bodySizeLimit", status: "done", priority: "P2", effort: "XS", notes: "FIXED 2026-05-15 (V-3): next.config.ts now sets experimental.serverActions.bodySizeLimit = '2mb'." },
  { id: "scan-se-004-csp-unsafe-eval", category: "security", phase: "hardening", title: "[SE-004] CSP allows 'unsafe-eval' in script-src", status: "done", priority: "P2", effort: "S", notes: "FIXED 2026-05-15 (V-5): 'unsafe-eval' removed from script-src. 'unsafe-inline' retained for Tailwind. Monitor via the new csp-report endpoint." },
  { id: "scan-se-005-protobufjs", category: "security", phase: "hardening", title: "[SE-005] protobufjs <7.5.6 transitive (via Univer)", status: "done", priority: "P2", effort: "XS", notes: "FIXED 2026-05-15 (V-5): package.json adds pnpm.overrides.protobufjs >=7.5.6. Resolves on next install." },
  { id: "scan-se-008-xfo-embed", category: "security", phase: "hardening", title: "[SE-008] Unconditional X-Frame-Options overrides /embed/* rule", status: "done", priority: "P2", effort: "XS", notes: "FIXED 2026-05-15 (V-5 + parent middleware patch): isEmbedPath() guard in applySecurityHeaders + middleware.ts now passes path to the helper. Skips XFO + frame-ancestors for /embed/* and /p|q|r|b|d/* Share viewers." },

  // P3 — Low (3 done in same sweep; 4 deferred as low-impact hygiene)
  { id: "scan-sa-005-paddle-retention", category: "security", phase: "polish", title: "[SA-005] paddle_webhook_events.payload retains PII indefinitely", status: "done", priority: "P3", effort: "S", notes: "Shipped 2026-05-17 (S5): purge_old_paddle_events RPC + /api/cron/paddle-retention runs daily 05:00 UTC pruning >90d processed rows (30d floor)." },
  { id: "scan-sa-007-invite-unconfirmed", category: "security", phase: "polish", title: "[SA-007] accept_workspace_invite doesn't verify email_confirmed_at", status: "done", priority: "P3", effort: "XS", notes: "Shipped 2026-05-17 (S5 migration 20260517f): explicit email_confirmed_at IS NOT NULL check at top of accept_workspace_invite — defence in depth even if Supabase default changes." },
  { id: "scan-sb-009-persona-inject", category: "security", phase: "polish", title: "[SB-009] Workspace-admin persona_description injected into system prompt", status: "done", priority: "P3", effort: "S", notes: "Shipped 2026-05-17 (S2): persona.ts now sanitises via stripPromptInjectionMarkers + collapses blank lines + caps persona_description at 1500 chars and bot_name at 60 chars before injecting." },
  { id: "scan-sb-010-admin-sql-fns", category: "security", phase: "polish", title: "[SB-010] Admin SQL console allows pg_sleep / pg_terminate_backend / pg_read_file", status: "done", priority: "P3", effort: "S", notes: "Shipped 2026-05-17 (S2): sql-console BLOCKED_FUNCTIONS list extended to 22 functions including pg_sleep, pg_terminate/cancel_backend, pg_read_file/dir, lo_import/export, current_setting, set_config, pg_stat_file/activity, dblink." },
  { id: "scan-sc-010-help-cookie", category: "security", phase: "polish", title: "[SC-010] /api/admin/help/vote anon-id cookie missing Secure flag", status: "done", priority: "P3", effort: "XS", notes: "FIXED 2026-05-15 (V-5): cookie now sets secure: true." },
  { id: "scan-sc-013-bak-file", category: "security", phase: "polish", title: "[SC-013] public/logos/wasl.png.bak stray file in repo", status: "done", priority: "P3", effort: "XS", notes: "FIXED 2026-05-15 (V-5): deleted." },
  { id: "scan-se-012-pre-push-npm", category: "security", phase: "polish", title: "[SE-012] .githooks/pre-push uses 'npm run build' (should be pnpm)", status: "done", priority: "P3", effort: "XS", notes: "FIXED 2026-05-15 (V-5): swapped to pnpm build." },

  { id: "subresource-integrity", category: "security", phase: "polish", title: "SRI on external CDN scripts (if any)", status: "missing", priority: "P3", effort: "XS" },
  { id: "cookie-flags", category: "security", phase: "hardening", title: "Cookie flags (Secure, HttpOnly, SameSite=Lax)", status: "done", priority: "P0", effort: "XS", notes: "Supabase auth cookies set correctly via @supabase/ssr defaults. Verified 2026-05-13." },

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
  { id: "idempotency-keys", category: "reliability", phase: "hardening", title: "Idempotency keys on critical mutations", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-14 (lib) + applied 2026-05-17 (P2): migration 20260517b creates idempotency_keys table; withIdempotency() wrapping Paddle webhook + Share mint + agent dispatch." },
  { id: "error-reporter-lib", category: "reliability", phase: "foundation", title: "Error reporter lib (admin/errors)", status: "done", priority: "P0", effort: "M", ref: "/admin/errors" },
  { id: "sentry-or-datadog", category: "reliability", phase: "hardening", title: "Sentry (or equivalent) for production errors", status: "partial", priority: "P0", effort: "S", notes: "Dormant wrapper shipped 2026-05-14 at lib/sentry.ts. Activates when SENTRY_DSN env is set AND @sentry/nextjs is installed. Until then falls back to log.error. Asad: create Sentry project + set DSN to flip on." },
  { id: "health-endpoint", category: "reliability", phase: "hardening", title: "/api/health endpoint (DB + AI probes)", status: "partial", priority: "P0", effort: "S", notes: "Shipped 2026-05-13 — edge endpoint probing Supabase, returns 503 on degraded. Skips AI provider probe (would burn tokens on every monitor hit). Add ?deep=1 later for AI probe." },
  { id: "feature-killswitch", category: "reliability", phase: "hardening", title: "Per-feature kill-switch (one-click disable)", status: "partial", priority: "P1", effort: "S" },
  { id: "rollback-plan", category: "reliability", phase: "hardening", title: "Documented rollback plan (Vercel + DB)", status: "missing", priority: "P1", effort: "S" },
  { id: "incident-runbook", category: "reliability", phase: "hardening", title: "Incident response runbook (Sev1/2/3)", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-14: docs/launch/INCIDENT_RESPONSE.md — Sev1/2/3 defs, 30-min checklist, war-room procedure, external comms templates per severity." },
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
  { id: "structured-logging", category: "observability", phase: "hardening", title: "Structured JSON logging on every request", status: "done", priority: "P1", effort: "S", notes: "lib/log.ts (May-13) + withRequestId AsyncLocalStorage wrapper (May-14). Every log line emitted inside withApiHandler auto-attaches request_id." },
  { id: "request-id", category: "observability", phase: "hardening", title: "Request ID correlation across layers", status: "done", priority: "P1", effort: "S", notes: "Middleware sets X-Request-Id (May-13). withApiHandler wraps handlers in withRequestId() so log lines auto-stamp (May-14)." },
  { id: "trace-id-prop", category: "observability", phase: "scale", title: "Trace ID propagation", status: "missing", priority: "P2", effort: "M" },
  { id: "endpoint-latency-histogram", category: "observability", phase: "hardening", title: "Latency histogram per endpoint", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-14: api_latency table + api_latency_summary(p_window_minutes) RPC returning p50/p95/p99/err_rate per source. withApiHandler writes fire-and-forget." },
  { id: "endpoint-status-dist", category: "observability", phase: "hardening", title: "Status code distribution per endpoint", status: "done", priority: "P1", effort: "S", notes: "Captured in api_latency.status alongside ms; api_latency_summary exposes err_rate; full per-bucket query trivial off the same table." },
  { id: "db-query-time-per-request", category: "observability", phase: "scale", title: "DB query time per request visible", status: "missing", priority: "P2", effort: "S" },
  { id: "cache-hit-rate", category: "observability", phase: "scale", title: "Cache hit rate metric", status: "missing", priority: "P2", effort: "S" },
  { id: "queue-depth-metric", category: "observability", phase: "scale", title: "Job queue depth metric", status: "missing", priority: "P2", effort: "S" },
  { id: "ai-provider-metrics", category: "observability", phase: "hardening", title: "Per-provider AI latency + error rate", status: "missing", priority: "P1", effort: "S" },
  { id: "cost-per-workspace", category: "observability", phase: "hardening", title: "Cost per workspace per day visible", status: "partial", priority: "P1", effort: "S", ref: "/admin/insights" },
  { id: "top-spender-alert", category: "observability", phase: "scale", title: "Top-spending users alert", status: "missing", priority: "P2", effort: "S" },
  { id: "anomaly-detection", category: "observability", phase: "scale", title: "Anomaly detection on key metrics", status: "missing", priority: "P3", effort: "L" },
  { id: "product-analytics", category: "observability", phase: "polish", title: "Product analytics (PostHog / Amplitude)", status: "partial", priority: "P1", effort: "M", notes: "Dormant wrapper shipped 2026-05-14 at lib/posthog.ts. Activates when POSTHOG_KEY env is set AND posthog-node is installed." },
  { id: "session-replay", category: "observability", phase: "polish", title: "Session replay (PostHog Recorder)", status: "missing", priority: "P2", effort: "XS", notes: "Mask sensitive inputs. Helps support 10×." },
  { id: "ab-test-framework", category: "observability", phase: "scale", title: "A/B test framework", status: "missing", priority: "P3", effort: "M" },
  { id: "feature-usage-tracking", category: "observability", phase: "polish", title: "Per-feature usage tracking", status: "missing", priority: "P2", effort: "S", notes: "Which tools are actually used? Drives roadmap." },
  { id: "funnel-dropoff-alert", category: "observability", phase: "scale", title: "Funnel drop-off alerts", status: "missing", priority: "P2", effort: "S" },
  { id: "error-grouping", category: "observability", phase: "hardening", title: "Error grouping + dedup", status: "partial", priority: "P1", effort: "S", notes: "Sentry does this for free." },
  { id: "source-maps", category: "observability", phase: "hardening", title: "Source maps uploaded to error tracker", status: "missing", priority: "P1", effort: "XS" },
  { id: "release-tag-errors", category: "observability", phase: "hardening", title: "Release tag visible in error reports", status: "done", priority: "P1", effort: "XS", notes: "Shipped 2026-05-14: lib/release-info.ts exposes commit/region/deployment_id; lib/error-log.ts stamps {commit, region, deployment_id, env} into error_events.context.release on every captured error." },
  { id: "user-feedback-button", category: "observability", phase: "polish", title: "In-app 'report a problem' button", status: "missing", priority: "P2", effort: "S" },

  // ════════════════════════════════════════════════════════════════════
  // ── DevOps & CI/CD ──
  // ════════════════════════════════════════════════════════════════════
  { id: "git-deploy", category: "devops", phase: "foundation", title: "Git-push-to-deploy via Vercel", status: "done", priority: "P0", effort: "XS" },
  { id: "preview-envs", category: "devops", phase: "foundation", title: "Preview deployments per PR", status: "done", priority: "P1", effort: "XS" },
  { id: "ci-tests", category: "devops", phase: "hardening", title: "Automated test suite (unit + e2e) in CI", status: "missing", priority: "P0", effort: "L", notes: "Vitest for libs + Playwright for 5 critical flows. We have no test suite today." },
  { id: "type-check-ci", category: "devops", phase: "hardening", title: "tsc + ESLint in CI (not just pre-push)", status: "done", priority: "P1", effort: "XS", notes: "Shipped 2026-05-14: .github/workflows/ci.yml runs tsc + ESLint on every PR to main. Two jobs: typecheck and lint, both ubuntu-latest with pnpm cache." },
  { id: "env-management", category: "devops", phase: "hardening", title: "Env vars: prod/preview/dev separation", status: "partial", priority: "P1", effort: "S" },
  { id: "staging-env", category: "devops", phase: "hardening", title: "Dedicated staging environment", status: "missing", priority: "P1", effort: "M", notes: "Free Supabase + Vercel project. Lets you do destructive testing." },
  { id: "iac", category: "devops", phase: "maturity", title: "Infrastructure as code (Terraform / Pulumi)", status: "missing", priority: "P3", effort: "L" },
  { id: "settings-backup", category: "devops", phase: "hardening", title: "Backup of Vercel + Supabase project settings", status: "missing", priority: "P2", effort: "S" },
  { id: "deploy-gates", category: "devops", phase: "hardening", title: "Deploy gates (build + smoke test pass)", status: "partial", priority: "P1", effort: "M" },
  { id: "release-notes", category: "devops", phase: "polish", title: "Release notes / changelog automation", status: "missing", priority: "P2", effort: "S", notes: "Changesets or release-please." },
  { id: "branch-protection", category: "devops", phase: "hardening", title: "Branch protection on main (no force-push)", status: "missing", priority: "P1", effort: "XS" },
  { id: "signed-commits", category: "devops", phase: "polish", title: "Signed commits required", status: "missing", priority: "P3", effort: "XS" },
  { id: "renovate", category: "devops", phase: "polish", title: "Automated dependency updates (Renovate/Dependabot)", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-14: .github/dependabot.yml — npm daily, minor+patch grouped weekly, open-PR limit 5; github-actions weekly." },
  { id: "lockfile-integrity", category: "devops", phase: "hardening", title: "Lockfile integrity check in CI", status: "done", priority: "P2", effort: "XS", notes: "CI installs with `pnpm install --frozen-lockfile`, so any lockfile drift fails the typecheck/lint jobs." },
  { id: "build-cache", category: "devops", phase: "scale", title: "Build caching (Turbopack, Vercel)", status: "partial", priority: "P2", effort: "XS", notes: "Vercel default. Verify cache hit rate." },
  { id: "test-coverage-gate", category: "devops", phase: "scale", title: "Test coverage minimum gate (60% start)", status: "missing", priority: "P2", effort: "S" },
  { id: "pre-commit-hooks", category: "devops", phase: "polish", title: "Pre-commit hooks (prettier + lint)", status: "partial", priority: "P3", effort: "XS" },
  { id: "pr-template", category: "devops", phase: "polish", title: "PR + issue templates", status: "done", priority: "P3", effort: "XS", notes: "Shipped 2026-05-14: .github/PULL_REQUEST_TEMPLATE.md + bug_report + feature_request + config.yml (disables blank issues, routes security to security@)." },
  { id: "codeowners", category: "devops", phase: "polish", title: "CODEOWNERS file", status: "done", priority: "P3", effort: "XS", notes: "Shipped 2026-05-14: single-owner @spacefield for all paths." },
  { id: "license-file", category: "devops", phase: "polish", title: "LICENSE file", status: "done", priority: "P3", effort: "XS", notes: "Shipped 2026-05-14: Proprietary / All Rights Reserved. Owner: Spacefield (Asad Iqbal), 2026." },
  { id: "security-md", category: "devops", phase: "polish", title: "SECURITY.md (disclosure policy)", status: "done", priority: "P2", effort: "XS", notes: "Shipped 2026-05-14 at repo root. Reports to security@spacefield.co, 72h ack, links to /.well-known/security.txt + /legal/security." },
  { id: "storybook", category: "devops", phase: "maturity", title: "Component library / Storybook", status: "missing", priority: "P3", effort: "L" },
  { id: "visual-regression", category: "devops", phase: "maturity", title: "Visual regression testing (Chromatic/Percy)", status: "missing", priority: "P3", effort: "M" },
  { id: "e2e-smoke", category: "devops", phase: "hardening", title: "E2E smoke pack (5 critical user flows)", status: "missing", priority: "P0", effort: "M", notes: "Signup → tool → save → share → checkout. Playwright on preview deployments." },
  { id: "perf-budget-ci", category: "devops", phase: "scale", title: "Perf budget enforced in CI", status: "missing", priority: "P2", effort: "S" },

  // ════════════════════════════════════════════════════════════════════
  // ── Compliance & legal ──
  // ════════════════════════════════════════════════════════════════════
  { id: "tos-page", category: "compliance", phase: "hardening", title: "Terms of Service page", status: "partial", priority: "P0", effort: "S", notes: "Starter draft live at /legal/terms (2026-05-13). UAE jurisdiction, AI disclaimers, Paddle MoR. Needs UAE-licensed counsel review before formal effect." },
  { id: "privacy-page", category: "compliance", phase: "hardening", title: "Privacy Policy page", status: "partial", priority: "P0", effort: "S", notes: "Starter draft live at /legal/privacy. GDPR + UAE PDPL compatible structure. Needs counsel review." },
  { id: "dpa-template", category: "compliance", phase: "hardening", title: "DPA template (Data Processing Agreement)", status: "partial", priority: "P1", effort: "S", notes: "Starter live at /legal/dpa. Auto-incorporated by Terms. Counter-signed copies on request." },
  { id: "cookie-consent", category: "compliance", phase: "hardening", title: "Cookie consent banner (EU + UAE)", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-15: components/CookieConsent.tsx (in-house, no third-party JS) + lib/cookie-consent.ts SSR helper + mounted in app/layout.tsx with no-flash SSR gating. Persists to localStorage + cookie." },
  { id: "gdpr-data-export", category: "compliance", phase: "hardening", title: "GDPR data-export self-service", status: "partial", priority: "P1", effort: "M", ref: "/admin/data-exports" },
  { id: "gdpr-erasure", category: "compliance", phase: "hardening", title: "Right-to-erasure flow (user-initiated delete)", status: "missing", priority: "P1", effort: "M" },
  { id: "subprocessors-list", category: "compliance", phase: "polish", title: "Public subprocessors page + change notification", status: "done", priority: "P2", effort: "XS", notes: "Live at /legal/subprocessors with vendor / region / data columns. Email subscribe-to-changes." },
  { id: "aup", category: "compliance", phase: "hardening", title: "Acceptable Use Policy", status: "partial", priority: "P2", effort: "S", notes: "Live at /legal/aup. Real-estate specifics + AI-content rules covered. Needs counsel pass." },
  { id: "trust-center", category: "compliance", phase: "polish", title: "Trust center page (security summary)", status: "done", priority: "P2", effort: "S", notes: "Live at /legal/security. Current controls + roadmap + responsible-disclosure flow." },
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
  { id: "accessibility-statement", category: "compliance", phase: "polish", title: "Accessibility statement (WCAG)", status: "done", priority: "P2", effort: "XS", notes: "Live at /legal/accessibility. Known gaps + reporting flow documented." },
  { id: "cookie-audit", category: "compliance", phase: "polish", title: "Cookie audit page (what we set + why)", status: "done", priority: "P2", effort: "S", notes: "Live at /legal/cookies with name / vendor / purpose / duration / category." },

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
  { id: "error-pages", category: "cx", phase: "polish", title: "Branded 404 + 500 pages with 'report this'", status: "done", priority: "P2", effort: "S", notes: "app/not-found.tsx + app/error.tsx branded with dark visual language. 'Report this' link still TODO when error tracking is wired." },
  { id: "tooltips", category: "cx", phase: "polish", title: "Tooltips on non-obvious UI", status: "partial", priority: "P3", effort: "M" },
  { id: "inline-help-fields", category: "cx", phase: "polish", title: "Inline help on form fields", status: "partial", priority: "P3", effort: "M" },
  { id: "optimistic-ui", category: "cx", phase: "polish", title: "Optimistic UI on mutations", status: "partial", priority: "P2", effort: "M" },
  { id: "toast-standard", category: "cx", phase: "polish", title: "Toast notifications standardized", status: "done", priority: "P3", effort: "S", notes: "Shipped 2026-05-17 (P5): lib/toast.ts pub-sub bus + <Toaster/> mounted in layout. toast.info/success/warn/error() API + ?toast=kind:msg query support for redirect-style flash messages." },
  { id: "shortcut-help", category: "cx", phase: "polish", title: "'?' opens keyboard shortcut help", status: "done", priority: "P3", effort: "S", notes: "Shipped 2026-05-17 (P5): components/ShortcutHelp.tsx mounted in layout. Listens for unmodified '?' with input/contenteditable guard; Esc-dismissable; 3 groups (Global/Lists/Forms)." },
  { id: "recently-used", category: "cx", phase: "polish", title: "Recently used items per user", status: "done", priority: "P3", effort: "S", notes: "Shipped 2026-05-18 (N6 migration 20260518a): recent_items table + record_view + list_recent RPCs (LRU 50/user). Cmd-K palette hydrates from server-side recents with localStorage fallback." },
  { id: "favorites-pinned", category: "cx", phase: "polish", title: "Favorites / pinned items", status: "done", priority: "P3", effort: "S", notes: "Shipped 2026-05-14: favorites table + lib/favorites + FavoriteToggle star button + FavoritesList sidebar widget." },
  { id: "email-digest", category: "cx", phase: "scale", title: "Daily/weekly email digest opt-in", status: "missing", priority: "P3", effort: "M" },
  { id: "notification-prefs", category: "cx", phase: "polish", title: "Notification preferences page", status: "done", priority: "P2", effort: "M", notes: "Shipped 2026-05-17 (P5): /account/notifications + notification_prefs table (20260517c). 7 toggles: mentions, task-assigned/completed, time-off, workspace-invite, weekly digest, email marketing." },
  { id: "unsubscribe-link", category: "cx", phase: "hardening", title: "Unsubscribe link on every email (legal req)", status: "missing", priority: "P0", effort: "XS", notes: "CAN-SPAM + UAE rules require it." },
  { id: "list-unsub-header", category: "cx", phase: "hardening", title: "List-Unsubscribe header (one-click)", status: "missing", priority: "P1", effort: "XS", notes: "Gmail bulk-sender requirement since 2024." },
  { id: "email-pref-center", category: "cx", phase: "polish", title: "Email preference center", status: "missing", priority: "P2", effort: "S" },
  { id: "account-settings-unified", category: "cx", phase: "polish", title: "Unified account settings page", status: "partial", priority: "P1", effort: "S" },
  { id: "billing-portal", category: "cx", phase: "polish", title: "Billing portal (Paddle customer portal)", status: "partial", priority: "P1", effort: "S" },
  { id: "receipts-invoices", category: "cx", phase: "polish", title: "Self-serve receipts + invoices", status: "partial", priority: "P1", effort: "S" },
  { id: "tax-compliant-invoices", category: "cx", phase: "hardening", title: "Tax-compliant invoices (UAE VAT, EU VAT)", status: "partial", priority: "P1", effort: "S", notes: "Paddle handles most. Verify UAE TRN appears on invoices." },
  { id: "currency-switcher", category: "cx", phase: "polish", title: "Currency switcher (AED, USD, EUR, GBP, SAR)", status: "done", priority: "P2", effort: "M", notes: "Shipped 2026-05-18 (N6): components/CurrencySwitcher.tsx dropdown writes spacefield-currency cookie + dispatches spacefield:currency-changed event. Mounted on /pricing." },
  { id: "locale-formatting", category: "cx", phase: "polish", title: "Locale-aware date/number formatting", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-18 (N6): lib/locale/format.ts — isomorphic formatDate/formatNumber/formatCurrency. Server-side reads cookie via next/headers, client reads document.cookie. 5 supported locales + 5 currencies." },
  { id: "onboarding-emails", category: "cx", phase: "polish", title: "Onboarding email sequence (drip)", status: "missing", priority: "P2", effort: "M" },
  { id: "reengagement-emails", category: "cx", phase: "scale", title: "Re-engagement / win-back emails", status: "missing", priority: "P2", effort: "M" },
  { id: "churn-survey", category: "cx", phase: "polish", title: "Cancellation survey (why?)", status: "missing", priority: "P2", effort: "S" },
  { id: "whats-new-modal", category: "cx", phase: "polish", title: "What's-new modal on first login after release", status: "done", priority: "P3", effort: "S", notes: "Shipped 2026-05-17 (P5): components/WhatsNew.tsx + lib/changelog/entries.ts + cookie-based last-seen tracking. Mount in layout reads cookie SSR-side, modal opens on version mismatch." },

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
  { id: "public-roadmap", category: "gtm", phase: "polish", title: "Public roadmap page", status: "done", priority: "P2", effort: "S", notes: "Live at /roadmap — Shipped / In progress / Next up. Curated; does not leak internal P0 list." },
  { id: "launch-comms-plan", category: "gtm", phase: "polish", title: "Launch comms plan (PH, Twitter, press)", status: "missing", priority: "P1", effort: "M" },
  { id: "press-kit", category: "gtm", phase: "polish", title: "Press kit + brand assets page", status: "done", priority: "P2", effort: "S", notes: "Live at /press — logos, founder bio, boilerplate, press FAQs." },
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
  { id: "waitlist", category: "gtm", phase: "polish", title: "Pre-launch waitlist page + email collection", status: "done", priority: "P1", effort: "S", notes: "Live at /waitlist. waitlist_signups table + waitlist_join RPC via 20260513_waitlist.sql." },

  // ════════════════════════════════════════════════════════════════════
  // ── Mobile & multi-platform ──
  // ════════════════════════════════════════════════════════════════════
  { id: "responsive-web", category: "mobile", phase: "foundation", title: "Responsive web (phone + tablet)", status: "partial", priority: "P0", effort: "L", notes: "Apr 27 redesign verified main app. /admin needs phone polish." },
  { id: "pwa", category: "mobile", phase: "polish", title: "Installable PWA (manifest + service worker)", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-17 (P3): public/manifest.webmanifest (standalone, icons, shortcuts) + public/sw.js (versioned cache, stale-while-revalidate on static, push handler) + ServiceWorkerRegister mounted in layout. PWAInstallPrompt shows on beforeinstallprompt with 30-day dismiss memory. usePushPermission hook for opt-in-after-positive-moment UX." },
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
  { id: "launch-runbook", category: "launch", phase: "polish", title: "Launch runbook (T-30 to T+30 plan)", status: "done", priority: "P0", effort: "M", notes: "Shipped 2026-05-14: docs/launch/RUNBOOK.md — 5 phases (pre-launch / launch week / launch day hour-by-hour / first week / first month), named roles (founder/on-call/support all currently Asad — SPOF called out)." },
  { id: "war-room", category: "launch", phase: "polish", title: "War-room channel + comms primed", status: "missing", priority: "P1", effort: "XS" },
  { id: "tabletop-drill", category: "launch", phase: "polish", title: "Tabletop incident drill (3 scenarios)", status: "missing", priority: "P1", effort: "S" },
  { id: "dns-ttl-drop", category: "launch", phase: "polish", title: "DNS TTLs dropped to 60s pre-launch", status: "missing", priority: "P2", effort: "XS" },
  { id: "scale-up-capacity", category: "launch", phase: "polish", title: "Pre-scale Supabase + Vercel plan", status: "missing", priority: "P1", effort: "XS" },
  { id: "waitlist-primed", category: "launch", phase: "polish", title: "Pre-launch waitlist warmed (email sequence)", status: "missing", priority: "P2", effort: "S" },
  { id: "kpi-baseline", category: "launch", phase: "polish", title: "Launch-week KPI dashboard", status: "missing", priority: "P1", effort: "M" },
  { id: "support-staffing", category: "launch", phase: "polish", title: "Launch-week support coverage plan", status: "missing", priority: "P1", effort: "XS" },
  { id: "rollback-trigger", category: "launch", phase: "polish", title: "Pre-defined rollback triggers (numbers, not feelings)", status: "done", priority: "P0", effort: "XS", notes: "Shipped 2026-05-14: docs/launch/ROLLBACK_TRIGGERS.md — auto rollback at 5xx>5%, p95>3s, AI>$100/hr, webhook<80% (5-min sustained). Manual triggers + comms matrix." },
  { id: "post-mortem-template", category: "launch", phase: "polish", title: "Blameless post-mortem template", status: "done", priority: "P2", effort: "XS", notes: "Shipped 2026-05-14: docs/launch/POST_MORTEM_TEMPLATE.md — full blameless template with worked example, 48h circulation rule." },
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
