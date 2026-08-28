/**
 * Launch-readiness checklist — single source of truth for /admin/status.
 *
 * the maintainer-mode: every reasonable item across all 15 readiness categories,
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
  /** plain-English one-liner the maintainer can read instead of the description */
  plain: string;
}

export interface PhaseDef {
  id: Phase;
  label: string;
  /** plain-English explanation for the overview/flow view */
  plain: string;
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
    plain: "Bones of the product. Must work for anything else to matter. Mostly already done.",
  },
  {
    id: "hardening",
    label: "Hardening",
    plain: "What separates 'works on my laptop' from 'survives the internet'. This is where the launch lives or dies — security, monitoring, performance, legal.",
  },
  {
    id: "polish",
    label: "Polish",
    plain: "The 10% that makes the difference between 'good launch' and 'great launch' — onboarding, help docs, press kit, the little CX touches.",
  },
  {
    id: "scale",
    label: "Scale",
    plain: "Stuff that breaks at 1000+ users. Don't need it on day one but stop ignoring it once traffic is real.",
  },
  {
    id: "maturity",
    label: "Maturity",
    plain: "Forever-work that compounds — SOC2, evals, partner integrations, new markets. Post-launch reality.",
  },
];

export const CATEGORIES: Category[] = [
  {
    id: "product",
    label: "Product completeness",
    description: "Core surfaces, features, parity between platforms.",
    plain: "Is every button you click going to actually do something useful?",
  },
  {
    id: "ai",
    label: "AI runtime",
    description: "Models, prompts, evals, cost, safety.",
    plain: "The AI brain — does it work, can we afford it, can it embarrass us?",
  },
  {
    id: "database",
    label: "Database & data",
    description: "Postgres/Supabase schema, RLS, retention, backups.",
    plain: "Where everything lives. If this goes down or leaks, you have a crisis.",
  },
  {
    id: "cache",
    label: "Caching & CDN",
    description: "Edge cache, ISR/SSR, Redis, image optimization.",
    plain: "Speed and cost. Good caching = 5–10× cheaper AND faster.",
  },
  {
    id: "perf",
    label: "Performance",
    description: "Core Web Vitals, bundle size, query p95/p99.",
    plain: "How fast pages feel. Slow = users leave before signing up.",
  },
  {
    id: "security",
    label: "Security",
    description: "Auth, RBAC, WAF, OWASP, secrets, pen-test.",
    plain: "Don't get hacked. One breach can end the company.",
  },
  {
    id: "scale",
    label: "Scalability",
    description: "Load capacity, queues, multi-region, autoscaling.",
    plain: "Can the product survive a Twitter spike or 10× our current traffic?",
  },
  {
    id: "reliability",
    label: "Reliability",
    description: "SLOs, retries, idempotency, circuit breakers, kill-switches.",
    plain: "The difference between '99% uptime' and '99.9% uptime' — engineering choices.",
  },
  {
    id: "observability",
    label: "Observability",
    description: "Logs, metrics, traces, alerts, on-call.",
    plain: "You can't fix what you can't see. Right now you'd find out from users on Twitter.",
  },
  {
    id: "devops",
    label: "DevOps & CI/CD",
    description: "Build, test, deploy, rollback, env separation.",
    plain: "The factory floor. Faster + safer shipping = faster company.",
  },
  {
    id: "compliance",
    label: "Compliance & legal",
    description: "ToS, privacy, GDPR, UAE PDPL, DPA, subprocessors.",
    plain: "The paperwork. Required for B2B sales and most regulators.",
  },
  {
    id: "cx",
    label: "Customer experience",
    description: "Onboarding, help, support, comms, branded errors.",
    plain: "How users feel using it. First-week retention is decided here.",
  },
  {
    id: "gtm",
    label: "Business & GTM",
    description: "Pricing, billing edges, launch comms, partnerships.",
    plain: "How you get and keep paying customers. Money stuff.",
  },
  {
    id: "mobile",
    label: "Mobile & multi-platform",
    description: "Responsive web, native apps, push, offline, PWA.",
    plain: "MENA is mobile-first. Half your users are on a phone.",
  },
  {
    id: "launch",
    label: "Launch readiness",
    description: "Load test, DR drill, runbooks, war room, comms.",
    plain: "Final gates before flipping the public switch.",
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
  { id: "feature-coverage-audit", category: "product", phase: "polish", title: "Feature coverage audit (no half-built tools)", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-19 (A3): docs/product/FEATURE-COVERAGE.md — every major surface (marketing/auth/CRM/Tasks/People/Chat/Admin/Tools/Share) rated 0-3 on empty/error/loading/mobile/RTL/a11y. Averages: 2.4/2.0/1.8/2.0/1.0/1.8. RTL flagged as top fix." },
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
  { id: "model-fallback", category: "ai", phase: "hardening", title: "Provider fallback chain (Claude → OpenAI → cached)", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-19 (A1): lib/ai/model-fallback.ts::callWithFallback wraps executor + orchestrator + /chat/stream. Wires admin-editable RuntimeModelInfo.fallbackId. Cross-provider suggestion helper for no-tool callers (claude→gpt-4o-mini chain)." },
  { id: "prompt-injection-defense", category: "ai", phase: "hardening", title: "Prompt-injection mitigations on user-content tools", status: "done", priority: "P1", effort: "M", notes: "OWASP LLM01 covered by W2 (lib/agent/runtime/_sanitize.ts strips zero-width + control + role-tag tokens, executor wraps tool_result in TOOL_OUTPUT fence) + W4 PII redaction + persona sanitisation + Y5 untrusted-data wrap on orchestrator." },
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
  { id: "tool-calling-tests", category: "ai", phase: "hardening", title: "Tool/function-calling reliability tests", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-19 (Y4): scripts/test-tool-calling.ts exercises each skill in ALL_SKILLS with a fixed prompt, validates stop_reason='tool_use', name is in catalog, input parses against declared input_schema." },
  { id: "multimodal-vision", category: "ai", phase: "polish", title: "Vision input (image upload to agents)", status: "done", priority: "P2", effort: "M", notes: "Shipped 2026-05-19 (Y5): /chat accepts up to 4 images per turn (png/jpeg/webp/gif, 5MB cap each), server validates + forwards as Anthropic image content blocks. ChatPanel drag-drop + paperclip picker + thumbnail strip." },
  { id: "agent-memory", category: "ai", phase: "polish", title: "Agent conversation memory (cross-session)", status: "done", priority: "P2", effort: "L", notes: "Shipped 2026-05-19 (Y3): /chat persists every turn via lib/chat/conversation.ts → agent_conversation_messages. Each call loads up to 20 prior turns. Channel-namespaced by context_ref so dispatcher vs /chat threads stay isolated." },
  { id: "agent-handoff", category: "ai", phase: "scale", title: "Multi-agent orchestration / handoff", status: "missing", priority: "P3", effort: "XL" },
  { id: "pii-redaction", category: "ai", phase: "hardening", title: "PII redaction before LLM call", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-18 (W4): lib/agent/runtime/redact.ts strips emails / international + UAE phones / Emirates IDs (784-prefix) / passports / credit cards (Luhn-validated). Reversible map for un-redacting output. Applied in executor + orchestrator pipeline." },
  { id: "no-training-flag", category: "ai", phase: "hardening", title: "Provider 'do not train on our data' flag set", status: "partial", priority: "P0", effort: "XS", notes: "Anthropic + OpenAI both honor headers/flags. Verify it's set on every API call." },
  { id: "ai-rate-limit-per-user", category: "ai", phase: "hardening", title: "Rate limit AI calls per user (abuse prevention)", status: "partial", priority: "P0", effort: "S", notes: "Stops a single user from blowing the daily budget." },
  { id: "prompt-cache", category: "ai", phase: "scale", title: "Cache identical AI prompts (exact + semantic)", status: "done", priority: "P2", effort: "M", notes: "Shipped 2026-05-18 (W4): Anthropic prompt caching annotated on system block + tool catalogue + most recent user turn. cache_control: ephemeral via lib/agent/runtime/cache.ts. Targets: in-app >=90% hit, WhatsApp/Telegram >=60%. Documented in docs/ai/PROMPT-CACHE.md." },
  { id: "async-batch", category: "ai", phase: "scale", title: "Async/batch processing for heavy AI tasks", status: "done", priority: "P2", effort: "L", notes: "Shipped 2026-05-18 (N5): ai_batch_jobs queue + enqueueAIBatch/runQueuedAIBatch helpers + /api/cron/ai-batch-runner. Two-phase atomic claim, 4-min cap, callback URL. Runs DAILY on Hobby; restore every-1-min cadence by upgrading Vercel Pro per docs/ops/CRON-CADENCE.md." },
  { id: "function-call-test-harness", category: "ai", phase: "scale", title: "Function-calling test harness", status: "done", priority: "P2", effort: "M", notes: "Shipped 2026-05-19 (Y4): scripts/test-tool-calling.ts exercises each ALL_SKILLS entry, validates stop_reason=tool_use, name in catalog, input parses against declared input_schema." },
  { id: "long-context-strategy", category: "ai", phase: "scale", title: "Long-context handling (>100k tokens)", status: "done", priority: "P3", effort: "M", notes: "Shipped 2026-05-18 (W4): lib/agent/runtime/summarise.ts — summariseIfNeeded() triggers above 80k tokens, summarises older turns via Haiku 4.5 into a synthetic system digest, keeps last 6 turns verbatim. Applied in executor + orchestrator." },
  { id: "embedding-index", category: "ai", phase: "polish", title: "Embeddings table + vector index (pgvector)", status: "done", priority: "P2", effort: "M", notes: "Shipped 2026-05-18 (N5 migration 20260518b): vector extension enabled, embeddings table with workspace_id + entity_type/id polymorphic ref + HNSW cosine ANN index + RLS workspace-scoped." },
  { id: "ai-cost-public", category: "ai", phase: "polish", title: "Show users their AI usage / remaining budget", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-18 (N5): components/AICostBudget.tsx — server component resolves workspace tier → fixed budget map (free $0 / pro $10 / business $50) → progress bar + over-budget badge. Mounted on /admin/insights/ai-costs." },

  // ════════════════════════════════════════════════════════════════════
  // ── Database & data ──
  // ════════════════════════════════════════════════════════════════════
  { id: "schema-baseline", category: "database", phase: "foundation", title: "Schema baseline (~60 tables)", status: "done", priority: "P0", effort: "XL" },
  { id: "rls-coverage", category: "database", phase: "hardening", title: "RLS on every multi-tenant table (verified)", status: "partial", priority: "P0", effort: "M", notes: "Run weekly: query returns tables WITHOUT a policy. Single biggest data-leak vector." },
  { id: "migrations-rollback", category: "database", phase: "hardening", title: "Every migration has documented rollback", status: "partial", priority: "P1", effort: "M", notes: "Shipped 2026-05-14: supabase/migrations/README.md + docs/database/CONVENTIONS.md codify the convention. 20260514b includes a worked inverse-SQL header. Retrofitting prior migrations still pending." },
  { id: "indexes-audit", category: "database", phase: "hardening", title: "Index audit on top 50 slow queries", status: "partial", priority: "P1", effort: "M", notes: "Shipped 2026-05-18 (W2): 5 covering indexes added for hot patterns (tasks composite, crm_contacts/crm_deals partials, admin_audit_log actor lookup). Full top-50 sweep awaits pg_stat_statements baseline accumulation in prod." },
  { id: "connection-pooler-tuned", category: "database", phase: "hardening", title: "Connection pooler tuned (transaction mode)", status: "partial", priority: "P1", effort: "S", notes: "Supavisor on by default. Verify pool mode + max_client_conn sized for Vercel fan-out." },
  { id: "backups-restore-drill", category: "database", phase: "hardening", title: "Backups + documented restore drill", status: "partial", priority: "P0", effort: "S", notes: "Supabase has daily backups + PITR. db_backup_drills log table shipped 2026-05-14 to record actual drills. First real restore drill still TBD." },
  { id: "data-retention-policy", category: "database", phase: "hardening", title: "Data retention policy (logs, events, deleted users)", status: "partial", priority: "P1", effort: "M", notes: "admin_purge_audit_log RPC (May-14) + /api/cron/audit-purge weekly Mon 06:15 UTC (May-15 B-2) + admin_caller_is_admin service-role bypass (May-15 migration 20260515d) — audit log retention is now live. Per-table policies (paddle_webhook_events, error_events) still TBD." },
  { id: "soft-delete-pattern", category: "database", phase: "hardening", title: "Standard soft-delete pattern (deleted_at)", status: "partial", priority: "P2", effort: "M", notes: "Added deleted_at + partial indexes to crm_contacts/crm_leads/crm_deals 2026-05-14. Workspace_files + chat.messages already had it. Workspaces/shared_links/forms/notes still pending." },
  { id: "audit-log-coverage", category: "database", phase: "foundation", title: "Audit log captures every admin mutation", status: "done", priority: "P0", effort: "M", ref: "/admin/audit" },
  { id: "read-replicas", category: "database", phase: "scale", title: "Read replicas for analytics queries", status: "missing", priority: "P2", effort: "S", notes: "Supabase Pro+ ships them. Spares the primary." },
  { id: "slow-query-cron", category: "database", phase: "scale", title: "Weekly slow-query review cron", status: "done", priority: "P2", effort: "S", notes: "Shipped end-to-end: slow_queries_top_50 view + admin_slow_queries RPC (May-14) + /api/cron/slow-queries-snapshot weekly Mon 06:45 UTC (May-15) + slow_query_snapshots history table + /admin/insights/slow-queries dashboard + service-role bypass on the admin gate." },
  { id: "materialized-views", category: "database", phase: "scale", title: "Materialized views for heavy aggregations", status: "done", priority: "P3", effort: "M", notes: "Shipped 2026-05-18 (W2 migration 20260518e): ai_cost_daily + api_latency_hourly matviews with CONCURRENTLY-refreshable unique indexes. /api/cron/refresh-matviews daily 06:30 UTC." },
  { id: "partitioning", category: "database", phase: "scale", title: "Partition time-series tables (logs, events, audit)", status: "partial", priority: "P2", effort: "M", notes: "Shipped 2026-05-18 (W2): partitioned-table scaffolds for api_latency / ai_calls / login_events / auth_failures (parallel _partitioned siblings, monthly RANGE). Migration includes documented swap procedure. /api/cron/partition-rotator creates next month's partition daily 06:50 UTC. Actual table swap is a separate ops step." },
  { id: "fk-cascade-review", category: "database", phase: "hardening", title: "Foreign-key cascade rules reviewed", status: "done", priority: "P2", effort: "M", notes: "Shipped 2026-05-18 (W2): docs/database/FK-CASCADE-AUDIT.md — 2621 words across all 258 FKs in 36 migrations. 130 CASCADE / 121 SET NULL / 2 RESTRICT / 5 NO ACTION. Concrete bugs flagged for subscriptions.tier_id, onboarding_runs.template_id, time_off cross-table inconsistency, crm_deals.stage_id RESTRICT vs upstream CASCADE." },
  { id: "schema-erd", category: "database", phase: "polish", title: "Schema ERD docs", status: "done", priority: "P3", effort: "S", notes: "Shipped 2026-05-15 (B-2): docs/database/ERD.md — 452 lines, 145 tables across 16 domains, relationships + purpose per table." },
  { id: "migration-ci-test", category: "database", phase: "scale", title: "Migrations tested in CI (apply + rollback)", status: "done", priority: "P2", effort: "M" , notes: "Shipped 2026-05-19 (C2): migration-ci.yml spins up postgres:16, applies all migrations, asserts idempotency (run twice, second is no-op)." },
  { id: "data-seed-scripts", category: "database", phase: "polish", title: "Data seed scripts for new accounts", status: "missing", priority: "P2", effort: "S", notes: "Empty workspace = sad workspace. Seed sample CRM contacts, a sample tool config, etc." },
  { id: "prod-db-access-policy", category: "database", phase: "hardening", title: "Production DB access policy (who, what, when)", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-19 (A3): docs/security/PROD-DB-ACCESS.md — Supabase Studio access list, service-role key handling, audit-log requirements." },
  { id: "pii-encryption-col", category: "database", phase: "scale", title: "Column-level encryption on sensitive PII", status: "partial", priority: "P2", effort: "M", notes: "Shipped 2026-05-17 (S1 migration 20260517d): pgcrypto column encryption on employee_documents.number (Emirates ID/visa/passport) with HR-or-owner RLS + masking by default + audit-logged reveal flow. Phone/address columns on contacts not yet encrypted — follow-up." },
  { id: "fulltext-search", category: "database", phase: "polish", title: "Full-text search indices on user content", status: "done", priority: "P2", effort: "M", notes: "Shipped 2026-05-19 (Y3 migration 20260519c): generated search_tsv tsvector columns on tasks/projects/comments + partial GIN indexes where deleted_at IS NULL. lib/search/fulltext.ts::ftsQuery wraps websearch_to_tsquery." },
  { id: "extensions-audit", category: "database", phase: "hardening", title: "Postgres extensions audit (pg_stat_statements, pgvector, pgcrypto)", status: "partial", priority: "P2", effort: "XS" },
  { id: "vacuum-tuning", category: "database", phase: "scale", title: "Autovacuum tuned for hot tables", status: "missing", priority: "P2", effort: "S" },
  { id: "table-size-monitor", category: "database", phase: "scale", title: "Table size monitoring + growth alerts", status: "partial", priority: "P2", effort: "S", notes: "Shipped 2026-05-14: public.table_sizes view over pg_class with total_bytes / row_estimate. Alert wiring (cron + thresholds) still TBD." },
  { id: "rto-rpo", category: "database", phase: "hardening", title: "RTO and RPO defined (recovery time/point)", status: "done", priority: "P1", effort: "XS", notes: "Shipped 2026-05-19 (Y6): docs/ops/RTO-RPO.md — Web+API RTO 1h / RPO 5min, AI 2h, jobs 2h/5min, email 4h, DNS 24h. Supabase PITR 2-min granularity 7d, +30d S3 mirror, +90d weekly CSV." },
  { id: "cross-region-backup", category: "database", phase: "scale", title: "Cross-region backup", status: "missing", priority: "P2", effort: "S", notes: "If the primary AWS region dies, where's the copy?" },

  // ════════════════════════════════════════════════════════════════════
  // ── Caching & CDN ──
  // ════════════════════════════════════════════════════════════════════
  { id: "vercel-edge-cache", category: "cache", phase: "hardening", title: "Vercel edge cache headers on public pages", status: "partial", priority: "P1", effort: "M", notes: "Add s-maxage + stale-while-revalidate on /, /learn, /market." },
  { id: "isr-strategy", category: "cache", phase: "hardening", title: "ISR strategy for content pages", status: "partial", priority: "P1", effort: "M", notes: "Shipped 2026-05-19 (Y2): 14 pages have export const revalidate set (/ 60s, /pricing+/changelog+/roadmap+/developers 300s, /press+/legal/* 3600s). Currently inert because layout.tsx uses await headers() — full effectiveness depends on a future unstable_cache refactor (docs/perf/CACHING.md §3)." },
  { id: "redis-layer", category: "cache", phase: "scale", title: "Redis cache layer (Upstash)", status: "missing", priority: "P1", effort: "M", notes: "Rate-limit buckets, hot feature-flag reads, feed cache. Cuts DB load 50-70%." },
  { id: "react-cache-memo", category: "cache", phase: "polish", title: "React cache() on duplicate server queries", status: "partial", priority: "P2", effort: "S" },
  { id: "image-cdn", category: "cache", phase: "hardening", title: "next/image on every public image", status: "partial", priority: "P1", effort: "M", notes: "Audit hero images — any plain <img> is a perf miss. Vercel optimizes next/image free." },
  { id: "static-assets-cdn", category: "cache", phase: "foundation", title: "Long-lived caching on /public assets", status: "done", priority: "P3", effort: "XS" },
  { id: "feature-flag-edge", category: "cache", phase: "scale", title: "Feature flags at edge (Vercel Edge Config)", status: "missing", priority: "P2", effort: "S", notes: "Flag check 30ms → <1ms." },
  { id: "cache-invalidation", category: "cache", phase: "hardening", title: "revalidateTag on every admin write affecting users", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-19 (Y2): updateTag() wired on 14 admin write verbs across banners/branding/features/maintenance → CACHE_TAGS constants (banners, brand.global, brand.workspace, feature-flags, maintenance)." },
  { id: "etag-headers", category: "cache", phase: "polish", title: "ETag headers on JSON API responses", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-14 (lib) + applied 2026-05-17 (P2): /api/admin/errors, /api/admin/integrations, /api/admin/alerts all use respondWithEtag(). 304 caching live on read-heavy admin GETs." },
  { id: "vary-headers", category: "cache", phase: "hardening", title: "Correct Vary headers (auth, locale)", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-19 (A2): middleware.ts::applyObsHeaders sets Vary: Authorization, Accept-Language, Cookie on every response, idempotently merged with existing Vary tokens." },
  { id: "cache-stampede", category: "cache", phase: "scale", title: "Cache stampede protection (single-flight)", status: "done", priority: "P2", effort: "M", notes: "Shipped 2026-05-19 (Y2): lib/cache/single-flight.ts coalesces concurrent callers for the same key into one in-flight promise." },
  { id: "cache-warming", category: "cache", phase: "scale", title: "Cache warming on cold starts (popular content)", status: "missing", priority: "P3", effort: "M" },
  { id: "html-compression", category: "cache", phase: "foundation", title: "HTML compression (gzip/brotli)", status: "done", priority: "P3", effort: "XS", notes: "Vercel default." },
  { id: "modern-image-formats", category: "cache", phase: "polish", title: "WebP/AVIF served via next/image", status: "partial", priority: "P2", effort: "S" },
  { id: "lazy-load-images", category: "cache", phase: "polish", title: "Lazy-load below-fold images", status: "partial", priority: "P2", effort: "S", notes: "next/image lazy by default. Audit any plain <img>." },
  { id: "critical-css", category: "cache", phase: "polish", title: "Critical CSS inlined", status: "partial", priority: "P3", effort: "S", notes: "Next.js handles this for built CSS." },
  { id: "resource-hints", category: "cache", phase: "polish", title: "Resource hints (preconnect, dns-prefetch)", status: "done", priority: "P3", effort: "S", notes: "Shipped 2026-05-18 (W3): 7 hints in app/layout.tsx head — preconnect vercel.live + GTM + dynamic Supabase project URL; dns-prefetch checkout/buy/cdn.paddle.com + Supabase." },
  { id: "font-subsetting", category: "cache", phase: "polish", title: "Font subsetting (only ship glyphs we use)", status: "partial", priority: "P3", effort: "S", notes: "next/font subsets by default. Verify Arabic glyph set if RTL added." },

  // ════════════════════════════════════════════════════════════════════
  // ── Performance ──
  // ════════════════════════════════════════════════════════════════════
  { id: "lighthouse-baseline", category: "perf", phase: "hardening", title: "Lighthouse / Web Vitals baseline (>90 perf)", status: "done", priority: "P0", effort: "S", notes: "Shipped 2026-05-19 (A2): .github/workflows/lighthouse.yml + lighthouserc.json — @lhci/cli runs on every PR touching app/lib/components/public/config, against /, /pricing, /compare, /developers. Soft-warn at perf>=0.80, a11y/best-practices/seo>=0.90. Flip to error after 2 clean cycles." },
  { id: "bundle-analyzer", category: "perf", phase: "hardening", title: "Bundle size budget + analyzer in CI", status: "partial", priority: "P1", effort: "S", notes: "Shipped 2026-05-18 (N4): next.config.ts loads @next/bundle-analyzer when ANALYZE=1 env is set + the dep is installed. Run `pnpm add -D @next/bundle-analyzer && ANALYZE=1 pnpm build` to emit analyze/{client,server}.html. CI gating still pending." },
  { id: "rsc-streaming", category: "perf", phase: "polish", title: "Suspense boundaries for streaming RSC", status: "partial", priority: "P2", effort: "M" },
  { id: "p95-db-queries", category: "perf", phase: "hardening", title: "DB query p95 < 200ms on every page", status: "missing", priority: "P1", effort: "M", notes: "Need pg_stat_statements wired to admin/insights for visibility." },
  { id: "ttfb-budget", category: "perf", phase: "hardening", title: "TTFB budget (<500ms public, <1s admin)", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-19 (A2): middleware emits Server-Timing: ttfb;dur=<ms> on every response. RUM tools (web-vitals, Speed Insights) capture without extra instrumentation." },
  { id: "speed-insights", category: "perf", phase: "hardening", title: "Vercel Speed Insights enabled", status: "done", priority: "P1", effort: "XS", notes: "@vercel/speed-insights + @vercel/analytics wired in app/layout.tsx. Real-user Web Vitals flowing." },
  { id: "n-plus-one", category: "perf", phase: "hardening", title: "N+1 query audit on list pages", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-18 (N4): 5 fixes — tools/availability (was 80 RPC round-trips per Launchpad render), admin/storage (was 50 storage RPC calls), admin/bulk/run agent counts, admin/locales counts, admin/social dedupe-by-r2_key signing cache. Each has inline 'N+1 fix' comment." },
  { id: "preload-critical", category: "perf", phase: "polish", title: "Preload critical fonts + hero images", status: "partial", priority: "P2", effort: "S" },
  { id: "client-bundle-trim", category: "perf", phase: "scale", title: "Trim client bundles (dynamic import heavy libs)", status: "partial", priority: "P2", effort: "M" },
  { id: "mobile-perf", category: "perf", phase: "hardening", title: "Mobile 3G/4G perf check (LCP <4s on slow network)", status: "partial", priority: "P1", effort: "S", notes: "Audit doc shipped 2026-05-18 (N4): docs/perf/MOBILE.md — 5 surfaces analysed (/, /pricing, /tools/property-poster-creator, /admin, sheets editor) with import counts + heavy-dep flags + cross-cutting recommendations. Actual fix-PRs follow." },
  { id: "react-profiler", category: "perf", phase: "scale", title: "React Profiler audit on slow components", status: "missing", priority: "P2", effort: "M" },
  { id: "rsc-depth-audit", category: "perf", phase: "scale", title: "RSC component depth audit (no 50-deep trees)", status: "missing", priority: "P3", effort: "M" },
  { id: "cold-start-times", category: "perf", phase: "scale", title: "Vercel function cold-start times measured + budgeted", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-19 (Y6): scripts/measure-cold-start.ts hits /api/health from N regions with curl timing and reports p50/p95 cold+warm. docs/perf/COLD-START.md documents methodology + budget targets." },
  { id: "api-latency-budgets", category: "perf", phase: "hardening", title: "Per-endpoint latency budget (p95)", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-19 (A2): lib/perf/budgets.ts — LATENCY_BUDGET_MS table per source (ai.chat.start 1200, public.* 400, webhook.paddle 500, default 300) + withLatencyBudget() wrap emits log.warn on breach. docs/perf/BUDGETS.md." },
  { id: "code-splitting", category: "perf", phase: "polish", title: "Per-route code splitting (Next.js default, audit)", status: "done", priority: "P3", effort: "XS" },
  { id: "tree-shaking", category: "perf", phase: "polish", title: "Tree-shaking verified (no dead lodash etc.)", status: "partial", priority: "P3", effort: "S" },
  { id: "virtual-scroll", category: "perf", phase: "scale", title: "Virtual scrolling on long lists (>500 rows)", status: "done", priority: "P2", effort: "M", notes: "Shipped 2026-05-18 (N4): components/VirtualList.tsx (dependency-free, ResizeObserver-based) + VirtualTableBody table-friendly variant. Applied to /trash + /tags (highest-volume unpaginated client-side lists)." },
  { id: "search-debounce", category: "perf", phase: "polish", title: "Debounce search inputs (250ms standard)", status: "partial", priority: "P2", effort: "S" },
  { id: "stale-response-handling", category: "perf", phase: "scale", title: "Stale-response handling (request cancellation)", status: "done", priority: "P2", effort: "S" , notes: "Shipped 2026-05-19 (C3): lib/fetch/abort.ts fetchWithStaleGuard wraps fetch with AbortController + deadline. Applied to 3 admin SSR pages." },
  { id: "http2-h3", category: "perf", phase: "foundation", title: "HTTP/2 + HTTP/3 enabled", status: "done", priority: "P3", effort: "XS", notes: "Vercel default." },
  { id: "edge-regions", category: "perf", phase: "scale", title: "Edge function regions optimized (MENA-friendly)", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-19 (Y6): vercel.json now [fra1, dub1] — Dubai region added for GCC primary users (sub-20ms vs the prior 80-110ms transcontinental hop). Frankfurt retained for EU coverage. Rationale comment inline." },
  { id: "cron-time-stagger", category: "perf", phase: "scale", title: "Cron jobs staggered (not all on :00)", status: "done", priority: "P3", effort: "XS", notes: "Shipped 2026-05-18 (W1): every secondary cron moved off :00. paddle 3:05, audit 6:21 Mon, slow-queries 6:43 Mon, account-purge 7:08, workspace-purge 7:33, social-publish 9:11, suspicious-login :04/:19/:34/:49, stuck-jobs every 5 min offset by 2. Only ai-batch-runner stays every-minute by necessity." },

  // ════════════════════════════════════════════════════════════════════
  // ── Security ──
  // ════════════════════════════════════════════════════════════════════
  { id: "auth-supabase", category: "security", phase: "foundation", title: "Supabase auth (email OTP + OAuth)", status: "done", priority: "P0", effort: "M" },
  { id: "rbac-roles", category: "security", phase: "foundation", title: "Role-based access control + assertCan gate", status: "done", priority: "P0", effort: "L", ref: "/admin/roles" },
  { id: "rate-limits", category: "security", phase: "hardening", title: "Rate limits on API routes + admin", status: "done", priority: "P0", effort: "M", ref: "/admin/rate-limits" },
  { id: "secrets-rotation", category: "security", phase: "hardening", title: "Secrets rotation policy (90d cadence)", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-19 (A3): docs/security/SECRETS-ROTATION.md — env-var inventory, 90d cadence, per-secret rotation procedure, owner per secret." },
  { id: "csp-headers", category: "security", phase: "hardening", title: "Content-Security-Policy headers", status: "partial", priority: "P1", effort: "M", notes: "Shipped 2026-05-13 in Report-Only mode (lib/security-headers.ts). Tighten + flip to enforcing once a violation reporter (Sentry) is wired." },
  { id: "hsts", category: "security", phase: "hardening", title: "HSTS header (Strict-Transport-Security)", status: "done", priority: "P1", effort: "XS", notes: "Shipped 2026-05-13 — max-age 2y, includeSubDomains, preload." },
  { id: "x-content-type", category: "security", phase: "hardening", title: "X-Content-Type-Options: nosniff", status: "done", priority: "P1", effort: "XS" },
  { id: "x-frame-options", category: "security", phase: "hardening", title: "X-Frame-Options / frame-ancestors", status: "done", priority: "P1", effort: "XS", notes: "SAMEORIGIN + CSP frame-ancestors self." },
  { id: "referrer-policy", category: "security", phase: "hardening", title: "Referrer-Policy header", status: "done", priority: "P2", effort: "XS", notes: "strict-origin-when-cross-origin" },
  { id: "permissions-policy", category: "security", phase: "hardening", title: "Permissions-Policy header", status: "done", priority: "P2", effort: "XS", notes: "Locks camera/mic/payment/FLoC; geo allowed for self." },
  { id: "owasp-asvs", category: "security", phase: "hardening", title: "OWASP ASVS Level 1 self-assessment", status: "done", priority: "P1", effort: "L", notes: "Shipped 2026-05-19 (A3): docs/security/OWASP-ASVS-L1.md — 74 controls walked, honest scoring: 56 pass / 16 partial / 2 fail (the 2 fails are L2-flavoured formal threat-modeling controls)." },
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
  { id: "suspicious-login-alerts", category: "security", phase: "hardening", title: "Suspicious-login email (new device / location)", status: "partial", priority: "P2", effort: "M", notes: "Shipped May-17 (S5) + May-19 (Z3 wired): /api/cron/suspicious-login-scan calls sendEmail() per notification_prefs; falls through to email_outbox when no provider env. Runs DAILY on Hobby (was every-15-min in code, Hobby-capped). Restore via Vercel Pro." },
  { id: "secret-scanning-repo", category: "security", phase: "hardening", title: "Secret scanning in repo (Gitleaks)", status: "done", priority: "P1", effort: "XS", notes: "Shipped 2026-05-17 (S6): .github/workflows/secret-scan.yml runs Gitleaks on every PR + push to main." },
  { id: "license-audit", category: "security", phase: "hardening", title: "License audit on dependencies (no GPL leakage)", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-17 (S6): .github/workflows/license-check.yml runs license-checker summary + fails on GPL/AGPL." },
  { id: "sbom", category: "security", phase: "maturity", title: "SBOM (software bill of materials)", status: "done", priority: "P3", effort: "S", notes: "Shipped 2026-05-17 (S6): .github/workflows/sbom.yml generates CycloneDX on every push to main, uploaded as workflow artifact." },
  { id: "dast-scan", category: "security", phase: "polish", title: "DAST scan (OWASP ZAP) in CI nightly", status: "done", priority: "P2", effort: "M" , notes: "Shipped 2026-05-19 (C2): .github/workflows/dast.yml runs OWASP ZAP baseline on PRs (soft-warn) + nightly full scan." },
  { id: "sast-scan", category: "security", phase: "hardening", title: "SAST scan (CodeQL) on PRs", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-17 (S6): .github/workflows/sast.yml runs GitHub CodeQL on javascript-typescript on every PR + weekly Monday cron. Free, native, no signup." },
  { id: "bug-bounty", category: "security", phase: "maturity", title: "Bug bounty program (HackerOne / Intigriti)", status: "missing", priority: "P3", effort: "S" },
  { id: "security-txt", category: "security", phase: "hardening", title: "/.well-known/security.txt", status: "done", priority: "P2", effort: "XS", notes: "Shipped 2026-05-13. Points at /legal/security + security@spacefield.co." },
  { id: "responsible-disclosure", category: "security", phase: "hardening", title: "Responsible disclosure policy page", status: "done", priority: "P2", effort: "S", notes: "Shipped in /legal/security 2026-05-13. Hall-of-fame section ready for first valid report." },
  { id: "incident-response-sec", category: "security", phase: "hardening", title: "Security incident response plan", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-14 (Agent L): docs/launch/INCIDENT_RESPONSE.md — Sev1/2/3 definitions, 30-min checklist, war-room procedure, copy-pasteable external comms templates per severity." },
  { id: "data-breach-process", category: "security", phase: "hardening", title: "Data-breach notification process (72h GDPR)", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-19 (A3): docs/security/DATA-BREACH-RESPONSE.md — first-24h checklist, 72h GDPR notification flow, internal + external comms templates." },
  { id: "webhook-sig-incoming", category: "security", phase: "hardening", title: "Verify incoming webhook signatures (Paddle)", status: "partial", priority: "P0", effort: "XS", notes: "lib/paddle-verify.ts shipped 2026-05-14 (ts+h1 parser, 5-min replay window, constant-time HMAC). Paddle webhook route still uses its inline verifier — swap to the lib." },
  { id: "webhook-sig-outgoing", category: "security", phase: "hardening", title: "Sign outgoing webhooks (HMAC)", status: "done", priority: "P1", effort: "S", ref: "/admin/webhooks", notes: "Shipped 2026-05-14 (lib) + applied 2026-05-17 (P2): lib/webhooks/sign.ts inline HMAC replaced with lib/hmac.ts::signHmacSha256. Outgoing X-Signature header live on dispatcher." },
  { id: "api-key-scoping", category: "security", phase: "hardening", title: "API key scoping (read-only vs admin)", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-18 (W5 migration 20260518f): api_tokens.scopes_arr text[] + api_token_has_scope RPC. 6 scopes (read:tasks/projects/contacts/deals/employees + read:all wildcard). Enforced in /api/v1/* via lib/api-tokens/verify.ts." },
  { id: "api-key-expiry", category: "security", phase: "polish", title: "API key expiration + rotation reminder", status: "done", priority: "P2", effort: "S" , notes: "Shipped 2026-05-19 (C3 migration 20260520c): api_tokens.expires_at + last_used_at + /api/cron/api-token-reminder daily emails 14d-from-expiry. /admin/api-tokens shows expiry status. Default 1y." },
  { id: "admin-ip-allowlist", category: "security", phase: "hardening", title: "IP allowlist for /admin (optional, per-account)", status: "partial", priority: "P2", effort: "M", ref: "/admin/ip-rules" },
  { id: "tls-1-3", category: "security", phase: "foundation", title: "TLS 1.3", status: "done", priority: "P0", effort: "XS", notes: "Vercel default." },
  { id: "cert-monitoring", category: "security", phase: "hardening", title: "TLS cert auto-renewal monitoring", status: "partial", priority: "P1", effort: "XS", notes: "Vercel handles renewal. Add an alert if it fails." },
  { id: "audit-log-immutable", category: "security", phase: "hardening", title: "Audit log immutable (append-only)", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-14 in 20260514b: restrictive RLS policies DENY UPDATE + DELETE on admin_audit_log for anon + authenticated. Service-role keeps bypass for legitimate writes." },

  // ──────────────────────────────────────────────────────────────────
  // 2026-05-21 USER-BEHAVIOR QA — 6 parallel opus agents across surfaces
  // (public / onboarding / AI / product / admin / API). Fix dispatch
  // follows in the same session; statuses flip as fixes land. Top
  // findings only — full ledger in docs/qa/{A-F}-*-FINDINGS.md.
  // ──────────────────────────────────────────────────────────────────

  // P0 — Critical
  { id: "qa-b-workspace-cascade", category: "database", phase: "hardening", title: "[QA-B] workspace-purge orphans 11 tables (GDPR breach)", status: "done", priority: "P0", effort: "S", notes: "FIXED 2026-05-21 (FA migration 20260521a): added ON DELETE CASCADE on workspace_id FK across 11 tables (comments/notifications/activities/tags/time_off_balances+requests/search_documents/ai_calls/ai_batch_jobs/embeddings/recent_items). Migration cleans orphans first; idempotent." },
  { id: "qa-f-cron-auth-open", category: "security", phase: "hardening", title: "[QA-F] Cron auth fails OPEN when CRON_SECRET unset", status: "done", priority: "P0", effort: "XS", notes: "FIXED 2026-05-21 (FB): lib/cron/_check_enabled.ts::requireCron hard-fails 401 when CRON_SECRET unset. No UA fallback." },
  { id: "qa-f-cron-timing-cmp", category: "security", phase: "hardening", title: "[QA-F] 14/15 cron endpoints use === string compare on bearer (timing leak)", status: "done", priority: "P0", effort: "S", notes: "FIXED 2026-05-21 (FB): requireCron uses timingSafeEqual on Bearer + ?token=. All 15 cron routes swept." },
  { id: "qa-c-batch-callback-ssrf", category: "security", phase: "hardening", title: "[QA-C] ai_batch_jobs.callback_url is unauthenticated SSRF vector", status: "done", priority: "P0", effort: "XS", notes: "FIXED 2026-05-21 (FB): lib/ai/batch.ts::fireCallback now routes through lib/safe-fetch — blocks private IPs / cloud metadata / non-http(s)." },
  { id: "qa-e-bulk-csv-formula", category: "security", phase: "hardening", title: "[QA-E] /api/admin/bulk/run CSV doesn't escape =/@/+/-/\\t (formula injection)", status: "done", priority: "P0", effort: "XS", notes: "FIXED 2026-05-21 (FB): admin/bulk/run + admin/waitlist/export imports escapeCsvCell from lib/escape-helpers; 5 bulk-export sites swept." },
  { id: "qa-d-task-legacy-comments", category: "product", phase: "hardening", title: "[QA-D] Task detail page mounts legacy TaskComments — bypasses /api/comments", status: "done", priority: "P0", effort: "S", notes: "FIXED 2026-05-21 (FD): tasks/[id]/page.tsx now mounts CommentsThread (entityType=task). Legacy TaskComments left on disk but unused. Projects/employees/deals/contacts detail pages had no similar legacy mounts." },
  { id: "qa-d-cmdk-dead-links", category: "product", phase: "polish", title: "[QA-D] Cmd-K palette: 11 of 12 jump-to/create links are 404s", status: "done", priority: "P0", effort: "XS", notes: "FIXED 2026-05-21 (FC): CommandPalette.tsx — kept 4 working JUMP_TO, added Projects+Inbox, removed 7 dead ones." },
  { id: "qa-d-crm-not-indexed", category: "product", phase: "hardening", title: "[QA-D] CRM contacts/leads/deals 100% absent from search_documents", status: "done", priority: "P0", effort: "S", notes: "FIXED 2026-05-21 (FD): new lib/crm/search-index.ts wraps indexContact/indexLead/indexDeal + unindex; wired into 6 REST routes + 3 AI skill files (crm-contacts/leads/deals). DELETE handlers also unindex." },
  { id: "qa-d-notif-fake-seed", category: "product", phase: "hardening", title: "[QA-D] OS-shell NotificationCenter reads localStorage fake seed, not /api/notifications", status: "done", priority: "P0", effort: "S", notes: "FIXED 2026-05-21 (FC): NotificationCenter.tsx fetches /api/notifications + posts /api/notifications/mark-read. localStorage seed deleted." },
  { id: "qa-b-login-404", category: "product", phase: "hardening", title: "[QA-B] 4 redirects to /login (404) — real route is /signin", status: "done", priority: "P0", effort: "XS", notes: "FIXED 2026-05-21 (FC): 5 files swapped /login → /signin. ?next= preserved." },
  { id: "qa-b-pending-deletion-signin", category: "product", phase: "hardening", title: "[QA-B] Pending-deletion users sign in normally during 30-day grace", status: "done", priority: "P0", effort: "S", notes: "FIXED 2026-05-21 (FE): /auth/callback cancels open account_deletion_request on successful sign-in + shows toast." },
  { id: "qa-b-account-deletion-emails", category: "cx", phase: "hardening", title: "[QA-B] Account-deletion confirmation emails never sent", status: "done", priority: "P0", effort: "XS", notes: "FIXED 2026-05-21 (FE): outbox/index.ts account.deletion_queued consumer calls sendEmail() with scheduled+final templates. account-purge cron snapshots email/name BEFORE the RPC delete." },
  { id: "qa-a-homepage-empty-body", category: "perf", phase: "hardening", title: "[QA-A] Homepage / ships an empty body to crawlers", status: "done", priority: "P0", effort: "S", notes: "FIXED 2026-05-21 (FE): HomeGate.tsx SSRs a HomeSsrFallback in the loading state. Crawlers + link previews see real content." },
  { id: "qa-a-analytics-no-consent", category: "compliance", phase: "hardening", title: "[QA-A] Vercel Analytics + Speed Insights load regardless of cookie consent", status: "done", priority: "P0", effort: "XS", notes: "FIXED 2026-05-21 (FB): layout.tsx mounts Analytics + SpeedInsights only when SSR-read consent === 'all'. No flash." },

  // P1 — High
  { id: "qa-a-dual-legal-regimes", category: "compliance", phase: "hardening", title: "[QA-A] Two parallel legal regimes live (/privacy + /legal/privacy)", status: "partial", priority: "P1", effort: "S", notes: "PARTIAL 2026-05-21 (FE): /privacy /terms /refund pages now permanentRedirect to /legal/*. <Link> updates in shared chrome (TopBar/MobileSettings/MarketingShell/FaqSection) still pending." },
  { id: "qa-a-alt-missing-data", category: "gtm", phase: "polish", title: "[QA-A] /alternative-to/monday + /clickup show all-dashes comparison", status: "done", priority: "P1", effort: "XS", notes: "FIXED 2026-05-21 (FE): monday + clickup data filled across 15 features; added to COMPARE_COLUMN_SLUGS." },
  { id: "qa-a-404-status-200", category: "perf", phase: "polish", title: "[QA-A] 404 pages return HTTP 200 on /alternative-to/<bogus> + /embed/<bogus>", status: "done", priority: "P1", effort: "XS", notes: "FIXED 2026-05-21 (FE): alternative-to/[slug] + embed/[toolId] now notFound() + dynamicParams = false." },
  { id: "qa-c-agent-conv-rls", category: "security", phase: "hardening", title: "[QA-C] agent_conversation_messages RLS only checks user_id, not workspace membership", status: "done", priority: "P1", effort: "XS", notes: "FIXED 2026-05-21 (FA migration 20260521b): policies recreated with (user_id = auth.uid() AND (workspace_id IS NULL OR is_workspace_member(workspace_id)))." },
  { id: "qa-c-budget-no-cta", category: "ai", phase: "polish", title: "[QA-C] AICostBudget shows over-budget badge but no Upgrade CTA", status: "done", priority: "P1", effort: "XS", notes: "FIXED 2026-05-21 (FC): AICostBudget.tsx shows <Link href=/pricing>Upgrade tier →</Link> when overspend." },
  { id: "qa-c-playground-no-ledger", category: "ai", phase: "hardening", title: "[QA-C] Admin playground routes bypass recordAiCall", status: "missing", priority: "P1", effort: "S", notes: "/api/admin/playground/{agent-run,prompt-test} hit Anthropic directly without writing to ai_calls. Admin spend invisible at /admin/insights/ai-costs." },
  { id: "qa-d-restore-no-reindex", category: "product", phase: "hardening", title: "[QA-D] restoreEntity never re-indexes restored rows", status: "done", priority: "P1", effort: "XS", notes: "FIXED 2026-05-21 (FA): trash/index.ts restoreEntity calls reindexAfterRestore(entityType, entityId) which re-pulls task/project/comment + writes to search_documents." },
  { id: "qa-d-people-404", category: "product", phase: "hardening", title: "[QA-D] /api/people returns 404 — MentionInput dropdown silently empty", status: "missing", priority: "P1", effort: "XS", notes: "Route was renamed or never built. MentionInput component fetches /api/people for @-completion. Build the route or point it at the correct list endpoint." },
  { id: "qa-e-tasks-no-nav", category: "product", phase: "polish", title: "[QA-E] /admin/tasks exists but missing from _nav.ts (unreachable from chrome)", status: "done", priority: "P1", effort: "XS", notes: "FIXED 2026-05-21 (FC): /admin/tasks added to admin _nav.ts under Apps section." },
  { id: "qa-e-waitlist-csv-formula", category: "security", phase: "hardening", title: "[QA-E] /admin/waitlist/export CSV doesn't escape formula chars", status: "done", priority: "P1", effort: "XS", notes: "FIXED 2026-05-21 (FB): waitlist/export/route.ts uses escapeCsvCell." },
  { id: "qa-e-jobs-no-stuck", category: "product", phase: "polish", title: "[QA-E] /admin/jobs doesn't surface stuck workflow/AI-batch rows", status: "missing", priority: "P1", effort: "XS", notes: "Only /admin/insights/health (lines 138-145) shows stuck-job state from W1. Add a panel to /admin/jobs." },
  { id: "qa-f-paddle-inline-verify", category: "security", phase: "hardening", title: "[QA-F] Paddle webhook handler uses inline verifier, not lib/paddle-verify.ts", status: "done", priority: "P1", effort: "XS", notes: "FIXED 2026-05-21 (FB): paddle/webhook/route.ts imports verifyPaddleSignature from lib/paddle-verify.ts. Idempotency + dispatch preserved." },
  { id: "qa-f-rate-limit-by-ip", category: "security", phase: "hardening", title: "[QA-F] /api/v1/* rate-limit keys by IP not by token", status: "missing", priority: "P1", effort: "S", notes: "Docs + OpenAPI advertise 'per token'. lib/api-wrap.ts:128 keys by IP because v1 endpoints don't set userId. Plumb token-id through withApiHandler." },
  { id: "qa-f-embed-no-dark", category: "gtm", phase: "polish", title: "[QA-F] Embed widgets light-mode-locked", status: "missing", priority: "P1", effort: "XS", notes: "/embed/[toolId] hardcodes #ffffff/#0f172a. Add prefers-color-scheme: dark CSS path so embeds match host site theme." },
  { id: "qa-c-ai-tools-no-workspace-filter", category: "security", phase: "hardening", title: "[QA-C] 3 AI tools skip workspace_id filter (defence-in-depth gone)", status: "missing", priority: "P1", effort: "S", notes: "lib/ai-tools/collab.ts + people.list_employee_documents + extras.list_my_favorites rely entirely on RLS for cross-workspace isolation. Add explicit .eq('workspace_id', ctx.workspaceId) belt-and-braces." },
  { id: "qa-c-classifier-null-workspace", category: "observability", phase: "hardening", title: "[QA-C] classifier/summariser/formatter write null-workspace rows to ai_calls", status: "missing", priority: "P1", effort: "S", notes: "Per-workspace cost reports under-count. Pass workspace_id through these helpers." },

  // P2 — Medium (curated)
  { id: "qa-a-icon-404", category: "gtm", phase: "polish", title: "[QA-A] /press logo download (PNG) hits 404 — file doesn't exist", status: "missing", priority: "P2", effort: "XS", notes: "press kit lists /icon-512.png as a Logo (PNG) download. File not in public/. Generate + commit, or remove link." },
  { id: "qa-a-pwa-shortcuts", category: "mobile", phase: "polish", title: "[QA-A] PWA manifest shortcuts target unreliable routes", status: "missing", priority: "P2", effort: "XS", notes: "manifest.webmanifest shortcuts list routes; some 404 on signed-out users (e.g. /tasks/new)." },
  { id: "qa-a-xfo-everyone", category: "security", phase: "hardening", title: "[QA-A] /embed/* gets correct CSP carve-out but XFO header is still SAMEORIGIN", status: "missing", priority: "P2", effort: "XS", notes: "isEmbedPath() drops frame-ancestors but the parent XFO header set elsewhere still says SAMEORIGIN — some browsers honour both. Audit middleware order." },
  { id: "qa-b-invite-flow-gaps", category: "product", phase: "hardening", title: "[QA-B] Workspace invite flow: mint exists but accept-by-email path unclear", status: "missing", priority: "P2", effort: "M", notes: "accept_workspace_invite RPC requires email_confirmed_at — but the invite-redemption UI doesn't exist as a clear /invite/[token] route. Verify the flow end-to-end." },
  { id: "qa-c-vision-mime-mismatch", category: "ai", phase: "hardening", title: "[QA-C] Vision input mime allowlist drift between client + server", status: "missing", priority: "P2", effort: "XS", notes: "Client validates png/jpeg/webp/gif. Server has a stricter list. Edge cases (e.g. heic) silently rejected with confusing UX." },
  { id: "qa-d-employee-doc-restore", category: "product", phase: "polish", title: "[QA-D] employee_documents have no restore UI after archive (archived_at)", status: "missing", priority: "P2", effort: "S", notes: "Soft-archived employee docs are invisible in /people but un-archive isn't surfaced anywhere. Add admin UI." },
  { id: "qa-d-import-malformed", category: "product", phase: "polish", title: "[QA-D] CSV import wizard error UX is opaque on bad rows", status: "missing", priority: "P2", effort: "S", notes: "Zod validation fires but the per-row error mapping isn't surfaced — user just sees 'N rows failed'. Show per-row reason." },
  { id: "qa-d-toaster-double-fires", category: "cx", phase: "polish", title: "[QA-D] Toaster sometimes double-fires on action followed by ?toast= flash redirect", status: "missing", priority: "P2", effort: "XS", notes: "Optimistic toast + redirect-flash toast collide. Dedupe by message hash with a 2s window." },
  { id: "qa-e-header-section-count", category: "product", phase: "polish", title: "[QA-E] Admin header label 'AI · N sections' counts items in section, not sections", status: "missing", priority: "P2", effort: "XS", notes: "app/admin/_components/Header.tsx:106. Says 'AI · 10 sections' when there are 9 sections total and 10 items in AI. Fix the variable name + count." },
  { id: "qa-e-messages-no-pagination", category: "product", phase: "polish", title: "[QA-E] /admin/messages hard-limits to 200 — no pagination", status: "missing", priority: "P2", effort: "XS", notes: "app/admin/messages/page.tsx:23. Anything past 200 disappears. Add cursor pagination." },
  { id: "qa-e-nav-orphans", category: "product", phase: "polish", title: "[QA-E] 8 admin pages exist on disk but missing from _nav.ts", status: "missing", priority: "P2", effort: "XS", notes: "/admin/{tasks,bulk,database/sql,eval/runs/[id],help/categories,moderation/queue,models/runtime,support/impersonations}. Add to nav or delete." },
  { id: "qa-f-openapi-3.1-gaps", category: "gtm", phase: "polish", title: "[QA-F] /developers/openapi.json uses 3.1-only nullable syntax + missing examples", status: "missing", priority: "P2", effort: "S", notes: "Tools generating from older OAS spec fail. Add examples per endpoint, add rate-limit extensions, declare 3.1 explicitly." },
  { id: "qa-f-openapi-servers", category: "gtm", phase: "polish", title: "[QA-F] OpenAPI servers list is static-prod-only", status: "missing", priority: "P3", effort: "XS", notes: "Add sandbox/preview servers so developers can test against non-prod." },

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

  // P1 — High (most done; xlsx + PII compliance + share-anon-rate need the maintainer input)
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
  { id: "circuit-breaker", category: "scale", phase: "hardening", title: "Circuit breaker on external APIs (Paddle/Anthropic/Twilio)", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-19 (A1): lib/ai/circuit-breaker.ts — per-provider state machine closed→open→half-open. 5 failures / 60s window / 30s cooldown / single-probe half-open. Wired into executor + orchestrator + /chat/stream." },
  { id: "graceful-degrade-ai", category: "scale", phase: "hardening", title: "Graceful degrade when AI provider down", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-19 (A1): lib/ai/availability.ts + AI_UNAVAILABLE_MESSAGE constant. /chat/stream pre-flight + per-provider canCall re-check; on open circuit, persists user turn + yields friendly delta + closes cleanly (no 500)." },
  { id: "backpressure", category: "scale", phase: "scale", title: "Backpressure on workflow runner", status: "done", priority: "P2", effort: "M" , notes: "Shipped 2026-05-19 (C3): lib/workflows/backpressure.ts checks workflow_runs running + ai_batch_jobs queued counts against thresholds. Enqueue path returns 503 + retry-after when exceeded." },
  { id: "vercel-fn-memory", category: "scale", phase: "scale", title: "Vercel function memory sized per route", status: "partial", priority: "P2", effort: "S", notes: "Default is 1024MB. Heavy routes (image gen) may need more; light routes can shrink to save cost." },
  { id: "vercel-fn-timeout", category: "scale", phase: "scale", title: "Vercel function timeout sized correctly", status: "partial", priority: "P2", effort: "XS" },
  { id: "dlq", category: "scale", phase: "scale", title: "Dead-letter queue for failed jobs", status: "missing", priority: "P2", effort: "M" },
  { id: "job-retry-backoff", category: "scale", phase: "hardening", title: "Job retry with exponential backoff", status: "partial", priority: "P1", effort: "S" },
  { id: "job-dedupe", category: "scale", phase: "hardening", title: "Job deduplication keys", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-19 (Y1): event_outbox.dedupe_key column with partial unique index. Producers pass deterministic keys (e.g. 'comment-mention-fanout:<comment_id>') so retries collapse." },
  { id: "storage-limits-monitor", category: "scale", phase: "scale", title: "File storage usage monitored + alerted", status: "missing", priority: "P2", effort: "XS", ref: "/admin/storage" },
  { id: "anthropic-tier", category: "scale", phase: "hardening", title: "Anthropic tier sized for peak (Tier 2+)", status: "partial", priority: "P1", effort: "XS", notes: "Tier 1 = 50 req/min. Launch traffic will hit ceiling." },
  { id: "email-sending-limits", category: "scale", phase: "hardening", title: "Email sending limits + warming", status: "missing", priority: "P1", effort: "M" },
  { id: "concurrent-write-test", category: "scale", phase: "hardening", title: "Concurrent-write test per workspace", status: "missing", priority: "P2", effort: "S" },
  { id: "realtime-channel-limits", category: "scale", phase: "scale", title: "Supabase Realtime channel limits monitored", status: "missing", priority: "P3", effort: "XS" },
  { id: "growth-projection-db", category: "scale", phase: "scale", title: "DB + storage growth projection (6-12mo ahead)", status: "done", priority: "P2", effort: "S" , notes: "Shipped 2026-05-19 (C3): scripts/db-growth-projection.ts uses table_sizes view + slow_query_snapshots to forecast row count + size 6/12 months out. Outputs to docs/database/GROWTH-PROJECTION.md." },
  { id: "sharding-plan", category: "scale", phase: "maturity", title: "Sharding plan for hottest tables (future)", status: "missing", priority: "P3", effort: "L", notes: "Document the path; don't implement until needed." },
  { id: "vercel-bandwidth-monitor", category: "scale", phase: "scale", title: "Vercel bandwidth + function-invocation monitoring", status: "missing", priority: "P2", effort: "S", notes: "Avoid surprise overage bills." },
  { id: "anthropic-spend-alert", category: "scale", phase: "hardening", title: "Anthropic daily spend alert + hard cap", status: "missing", priority: "P0", effort: "XS", notes: "Anthropic console supports this. Single line of defense against runaway cost." },

  // ════════════════════════════════════════════════════════════════════
  // ── Reliability ──
  // ════════════════════════════════════════════════════════════════════
  { id: "slo-definitions", category: "reliability", phase: "hardening", title: "SLO definitions (uptime, latency, error rate)", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-19 (A3): docs/ops/SLO.md — 3 SLIs (uptime / latency / error rate), targets, error-budget approach." },
  { id: "error-budgets", category: "reliability", phase: "scale", title: "Error budget tracking", status: "missing", priority: "P2", effort: "M" },
  { id: "retries-idempotent", category: "reliability", phase: "hardening", title: "Retries on idempotent ops (3x exp backoff)", status: "partial", priority: "P1", effort: "S" },
  { id: "idempotency-keys", category: "reliability", phase: "hardening", title: "Idempotency keys on critical mutations", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-14 (lib) + applied 2026-05-17 (P2): migration 20260517b creates idempotency_keys table; withIdempotency() wrapping Paddle webhook + Share mint + agent dispatch." },
  { id: "error-reporter-lib", category: "reliability", phase: "foundation", title: "Error reporter lib (admin/errors)", status: "done", priority: "P0", effort: "M", ref: "/admin/errors" },
  { id: "sentry-or-datadog", category: "reliability", phase: "hardening", title: "Sentry (or equivalent) for production errors", status: "partial", priority: "P0", effort: "S", notes: "Dormant wrapper shipped 2026-05-14 at lib/sentry.ts. Activates when SENTRY_DSN env is set AND @sentry/nextjs is installed. Until then falls back to log.error. the maintainer: create Sentry project + set DSN to flip on." },
  { id: "health-endpoint", category: "reliability", phase: "hardening", title: "/api/health endpoint (DB + AI probes)", status: "partial", priority: "P0", effort: "S", notes: "Shipped 2026-05-13 — edge endpoint probing Supabase, returns 503 on degraded. Skips AI provider probe (would burn tokens on every monitor hit). Add ?deep=1 later for AI probe." },
  { id: "feature-killswitch", category: "reliability", phase: "hardening", title: "Per-feature kill-switch (one-click disable)", status: "partial", priority: "P1", effort: "S" },
  { id: "rollback-plan", category: "reliability", phase: "hardening", title: "Documented rollback plan (Vercel + DB)", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-14 (Agent L): docs/launch/ROLLBACK_TRIGGERS.md — auto + manual triggers, Vercel one-click revert, migration-rollback convention, feature-flag kill switch, comms matrix." },
  { id: "incident-runbook", category: "reliability", phase: "hardening", title: "Incident response runbook (Sev1/2/3)", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-14: docs/launch/INCIDENT_RESPONSE.md — Sev1/2/3 defs, 30-min checklist, war-room procedure, external comms templates per severity." },
  { id: "tx-correctness", category: "reliability", phase: "hardening", title: "DB transactions used correctly", status: "partial", priority: "P1", effort: "M", notes: "Audit: any multi-statement write that isn't a transaction is a bug." },
  { id: "distributed-lock", category: "reliability", phase: "scale", title: "Distributed lock for critical sections", status: "done", priority: "P2", effort: "M", notes: "Shipped 2026-05-19 (Y1 migration 20260519a): lib/db/advisory-lock.ts::withAdvisoryLock + try_advisory_lock_str RPC over pg_try_advisory_xact_lock. Applied to workflow-runner (per-id) + ai-batch-runner + outbox-relay." },
  { id: "outbox-pattern", category: "reliability", phase: "scale", title: "Outbox pattern for cross-system writes", status: "done", priority: "P2", effort: "L", notes: "Shipped 2026-05-19 (Y1): event_outbox + claim_outbox_batch FOR UPDATE SKIP LOCKED RPC + /api/cron/outbox-relay. Runs DAILY on Hobby (was every-5-min in code). Producers emit via lib/outbox::emit. Restore cadence via Vercel Pro." },
  { id: "saga-pattern", category: "reliability", phase: "scale", title: "Saga pattern for multi-step ops", status: "missing", priority: "P3", effort: "L" },
  { id: "stuck-job-detection", category: "reliability", phase: "hardening", title: "Stuck-job detection + alert", status: "done", priority: "P1", effort: "S", notes: "Shipped W1: /api/cron/stuck-jobs-detect finds workflow_runs + ai_batch_jobs stuck >30 min, flips to 'stuck', alerts admins. Runs DAILY on Hobby (was every-5-min in code). Restore cadence via Vercel Pro." },
  { id: "webhook-retry-delivery", category: "reliability", phase: "hardening", title: "Outgoing-webhook delivery retries", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-18 (W1): lib/webhooks/retry.ts::deliverWithRetry — exp backoff 1s/4s/16s/64s, retries on 5xx + 408/429 + network errors. Async-mode persists next_attempt_at; sync-mode for admin test-send. webhook_deliveries_v2 extended with delivery_group UUID linking attempts." },
  { id: "webhook-dead-letter", category: "reliability", phase: "hardening", title: "Outgoing-webhook dead letter", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-19 (Y1 + W1): webhook_deliveries_v2 tracks every attempt with delivery_group UUID linking retries; event_outbox auto-flips to 'dead' status after max_attempts. event_outbox_mark_failed RPC with exponential backoff." },
  { id: "email-retry-queue", category: "reliability", phase: "scale", title: "Email send retry queue", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-19 (Z3 migration 20260520a): email_outbox table catches every email when no provider configured OR provider call fails. status/attempts/sent_at/error/provider columns; service-role RLS." },
  { id: "payment-webhook-idempotent", category: "reliability", phase: "hardening", title: "Idempotency on payment webhooks (Paddle)", status: "partial", priority: "P0", effort: "S", notes: "Paddle retries on 5xx. Duplicate processing = double-charge or double-grant." },
  { id: "signup-race", category: "reliability", phase: "hardening", title: "Signup race-condition handling (dedupe)", status: "partial", priority: "P1", effort: "S" },
  { id: "online-schema-changes", category: "reliability", phase: "hardening", title: "Online migration safety (no long locks)", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-19 (A3): docs/database/ONLINE-SCHEMA-CHANGES.md — additive-only rule, NOT NULL + DEFAULT staged patterns, large-table CONCURRENTLY index conventions, no-long-locks rules." },
  { id: "zero-downtime-deploys", category: "reliability", phase: "hardening", title: "Zero-downtime deploys verified", status: "partial", priority: "P1", effort: "S", notes: "Vercel handles atomic swap. Verify long-running requests survive the swap." },
  { id: "graceful-shutdown", category: "reliability", phase: "scale", title: "Graceful shutdown of long-running jobs on deploy", status: "done", priority: "P2", effort: "M" , notes: "Shipped 2026-05-19 (C4): docs/launch/GRACEFUL-SHUTDOWN.md — Vercel function shutdown protocol, in-flight request handling." },
  { id: "exactly-once-where-required", category: "reliability", phase: "scale", title: "Exactly-once delivery on payment events", status: "partial", priority: "P0", effort: "S", notes: "Tied to idempotency keys above." },
  { id: "read-your-writes", category: "reliability", phase: "polish", title: "Read-your-writes consistency on user view", status: "partial", priority: "P2", effort: "S", notes: "User edits something → next page load shows their edit, not a stale cached version." },

  // ════════════════════════════════════════════════════════════════════
  // ── Observability ──
  // ════════════════════════════════════════════════════════════════════
  { id: "logs-pipeline", category: "observability", phase: "foundation", title: "Centralized logs (admin/logs)", status: "done", priority: "P0", effort: "M", ref: "/admin/logs" },
  { id: "metrics-pipeline", category: "observability", phase: "hardening", title: "Metrics pipeline (counters, histograms)", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-19 (C1): lib/metrics/index.ts incr+histogram → app_metrics table (Prometheus-shaped, stored in Postgres). metrics_summary RPC for read." },
  { id: "distributed-tracing", category: "observability", phase: "scale", title: "Distributed tracing (OpenTelemetry)", status: "missing", priority: "P2", effort: "M" },
  { id: "alerts-routing", category: "observability", phase: "hardening", title: "Alert routing (Slack/SMS) with severities", status: "missing", priority: "P0", effort: "S", notes: "3am production fire — nobody knows today." },
  { id: "health-dashboard", category: "observability", phase: "hardening", title: "Top-level health dashboard (req/s, p95, error, $)", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-19 (A2): /admin/insights/health — server-rendered dashboard aggregating /api/health deep probe + api_latency_summary(1440) + ai_cost_summary(1440) + latest 5 ops.anomaly + stuck-jobs counts. 5 stat tiles + 3 inline SVG bar charts." },
  { id: "audit-trail", category: "observability", phase: "foundation", title: "Full admin action audit trail", status: "done", priority: "P0", effort: "M", ref: "/admin/audit" },
  { id: "synthetic-monitoring", category: "observability", phase: "hardening", title: "Synthetic monitoring (Better Stack / Checkly)", status: "missing", priority: "P1", effort: "S", notes: "External monitor hits /api/health every 60s from 3 regions. $10/mo." },
  { id: "uptime-public", category: "observability", phase: "hardening", title: "Public status page (status.spacefield.co)", status: "missing", priority: "P1", effort: "S", notes: "Better Stack Uptime $24/mo. Auto-generated from synthetic checks." },
  { id: "on-call", category: "observability", phase: "polish", title: "On-call rotation + escalation", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-19 (C4): docs/launch/ON-CALL.md — primary/secondary, escalation path, off-hours protocol." },
  { id: "log-retention", category: "observability", phase: "scale", title: "Log retention policy (30d hot / 1y cold)", status: "done", priority: "P2", effort: "M" , notes: "Shipped 2026-05-19 (C1): /api/cron/log-retention daily 04:00 UTC prunes error_events/audit_log/auth_failures/login_events/api_latency/ai_calls/app_metrics older than 90d." },
  { id: "structured-logging", category: "observability", phase: "hardening", title: "Structured JSON logging on every request", status: "done", priority: "P1", effort: "S", notes: "lib/log.ts (May-13) + withRequestId AsyncLocalStorage wrapper (May-14). Every log line emitted inside withApiHandler auto-attaches request_id." },
  { id: "request-id", category: "observability", phase: "hardening", title: "Request ID correlation across layers", status: "done", priority: "P1", effort: "S", notes: "Middleware sets X-Request-Id (May-13). withApiHandler wraps handlers in withRequestId() so log lines auto-stamp (May-14)." },
  { id: "trace-id-prop", category: "observability", phase: "scale", title: "Trace ID propagation", status: "partial", priority: "P2", effort: "M", notes: "Shipped 2026-05-13 → 14 (security headers + log): middleware mints X-Request-Id and withRequestId() AsyncLocalStorage propagates it through every log call. Full OpenTelemetry W3C traceparent propagation across service boundaries still deferred." },
  { id: "endpoint-latency-histogram", category: "observability", phase: "hardening", title: "Latency histogram per endpoint", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-14: api_latency table + api_latency_summary(p_window_minutes) RPC returning p50/p95/p99/err_rate per source. withApiHandler writes fire-and-forget." },
  { id: "endpoint-status-dist", category: "observability", phase: "hardening", title: "Status code distribution per endpoint", status: "done", priority: "P1", effort: "S", notes: "Captured in api_latency.status alongside ms; api_latency_summary exposes err_rate; full per-bucket query trivial off the same table." },
  { id: "db-query-time-per-request", category: "observability", phase: "scale", title: "DB query time per request visible", status: "done", priority: "P2", effort: "S" , notes: "Shipped 2026-05-19 (C1): lib/observability/query-timing.ts wraps supabase queries + writes histogram. Applied to 3 hot routes." },
  { id: "cache-hit-rate", category: "observability", phase: "scale", title: "Cache hit rate metric", status: "done", priority: "P2", effort: "S" , notes: "Shipped 2026-05-19 (C1): single-flight + admin caches now call metrics.incr(cache.hit/cache.miss). Read via metrics_summary RPC." },
  { id: "queue-depth-metric", category: "observability", phase: "scale", title: "Job queue depth metric", status: "done", priority: "P2", effort: "S" , notes: "Shipped 2026-05-19 (C1): stuck-jobs cron writes metrics.histogram(queue.depth.workflow_runs/ai_batch_jobs) each tick." },
  { id: "ai-provider-metrics", category: "observability", phase: "hardening", title: "Per-provider AI latency + error rate", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-18→19 (N5 + Y5): ai_calls table + recordAiCall on 9 LLM call sites (executor x2, orchestrator x2, formatter, summariser, classifier, /api/chat/stream, embeddings, batch). ai_cost_summary RPC aggregates by model + agent." },
  { id: "cost-per-workspace", category: "observability", phase: "hardening", title: "Cost per workspace per day visible", status: "partial", priority: "P1", effort: "S", ref: "/admin/insights" },
  { id: "top-spender-alert", category: "observability", phase: "scale", title: "Top-spending users alert", status: "done", priority: "P2", effort: "S" , notes: "Shipped 2026-05-19 (C1): anomaly-check extended to compare ai_cost_summary per workspace against historical median; alerts admins when 2× over baseline." },
  { id: "anomaly-detection", category: "observability", phase: "scale", title: "Anomaly detection on key metrics", status: "done", priority: "P3", effort: "L", notes: "Shipped Y6: /api/cron/anomaly-check compares api_latency_summary p95 + err_rate to historical baseline; alerts admins when p95 >=3x baseline or err_rate >=5%. Runs DAILY on Hobby (was twice-hourly in code). Restore via Vercel Pro." },
  { id: "product-analytics", category: "observability", phase: "polish", title: "Product analytics (PostHog / Amplitude)", status: "partial", priority: "P1", effort: "M", notes: "Dormant wrapper shipped 2026-05-14 at lib/posthog.ts. Activates when POSTHOG_KEY env is set AND posthog-node is installed." },
  { id: "session-replay", category: "observability", phase: "polish", title: "Session replay (PostHog Recorder)", status: "missing", priority: "P2", effort: "XS", notes: "Mask sensitive inputs. Helps support 10×." },
  { id: "ab-test-framework", category: "observability", phase: "scale", title: "A/B test framework", status: "missing", priority: "P3", effort: "M" },
  { id: "feature-usage-tracking", category: "observability", phase: "polish", title: "Per-feature usage tracking", status: "missing", priority: "P2", effort: "S", notes: "Which tools are actually used? Drives roadmap." },
  { id: "funnel-dropoff-alert", category: "observability", phase: "scale", title: "Funnel drop-off alerts", status: "missing", priority: "P2", effort: "S" },
  { id: "error-grouping", category: "observability", phase: "hardening", title: "Error grouping + dedup", status: "partial", priority: "P1", effort: "S", notes: "Sentry does this for free." },
  { id: "source-maps", category: "observability", phase: "hardening", title: "Source maps in production builds", status: "done", priority: "P1", effort: "XS", notes: "Shipped 2026-05-19 (A2): next.config.ts productionBrowserSourceMaps: true. Vercel-served errors land on the original TypeScript line numbers in browser devtools. Upload to a third-party error tracker is a separate step (needs Sentry signup)." },
  { id: "release-tag-errors", category: "observability", phase: "hardening", title: "Release tag visible in error reports", status: "done", priority: "P1", effort: "XS", notes: "Shipped 2026-05-14: lib/release-info.ts exposes commit/region/deployment_id; lib/error-log.ts stamps {commit, region, deployment_id, env} into error_events.context.release on every captured error." },
  { id: "user-feedback-button", category: "observability", phase: "polish", title: "In-app 'report a problem' button", status: "done", priority: "P2", effort: "S" , notes: "Shipped 2026-05-19 (C3): <FeedbackButton /> mounted in admin chrome opens modal → POST /api/feedback → user_feedback table." },

  // ════════════════════════════════════════════════════════════════════
  // ── DevOps & CI/CD ──
  // ════════════════════════════════════════════════════════════════════
  { id: "git-deploy", category: "devops", phase: "foundation", title: "Git-push-to-deploy via Vercel", status: "done", priority: "P0", effort: "XS" },
  { id: "preview-envs", category: "devops", phase: "foundation", title: "Preview deployments per PR", status: "done", priority: "P1", effort: "XS" },
  { id: "ci-tests", category: "devops", phase: "hardening", title: "Automated test suite (unit + e2e) in CI", status: "done", priority: "P0", effort: "L", notes: "Shipped 2026-05-19 (Y4): Vitest scaffold + 53 unit tests across 5 lib modules + Playwright 5 specs (homepage/pricing/signin/tasks/health) + bundle-budget assertion + .github/workflows/test.yml 3 gated jobs." },
  { id: "type-check-ci", category: "devops", phase: "hardening", title: "tsc + ESLint in CI (not just pre-push)", status: "done", priority: "P1", effort: "XS", notes: "Shipped 2026-05-14: .github/workflows/ci.yml runs tsc + ESLint on every PR to main. Two jobs: typecheck and lint, both ubuntu-latest with pnpm cache." },
  { id: "env-management", category: "devops", phase: "hardening", title: "Env vars: prod/preview/dev separation", status: "partial", priority: "P1", effort: "S" },
  { id: "staging-env", category: "devops", phase: "hardening", title: "Dedicated staging environment", status: "missing", priority: "P1", effort: "M", notes: "Free Supabase + Vercel project. Lets you do destructive testing." },
  { id: "iac", category: "devops", phase: "maturity", title: "Infrastructure as code (Terraform / Pulumi)", status: "missing", priority: "P3", effort: "L" },
  { id: "settings-backup", category: "devops", phase: "hardening", title: "Backup of Vercel + Supabase project settings", status: "done", priority: "P2", effort: "S" , notes: "Shipped 2026-05-19 (C2): scripts/backup-settings.ts exports JSON of workspace_settings + runtime_config + admin_pages + admin_roles + feature_flags. docs/ops/SETTINGS-BACKUP.md." },
  { id: "deploy-gates", category: "devops", phase: "hardening", title: "Deploy gates (build + smoke test pass)", status: "partial", priority: "P1", effort: "M" },
  { id: "release-notes", category: "devops", phase: "polish", title: "Release notes / changelog automation", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-19 (C2): release-notes.yml generates CHANGELOG.md update from commit messages on tag push. No external deps." },
  { id: "branch-protection", category: "devops", phase: "hardening", title: "Branch protection on main (no force-push)", status: "partial", priority: "P1", effort: "XS" , notes: "Shipped 2026-05-19 (C2): docs/devops/BRANCH-PROTECTION.md documents the rules to apply via GitHub UI (require ci/test/lighthouse checks, linear history, no force-push). the maintainer applies via UI." },
  { id: "signed-commits", category: "devops", phase: "polish", title: "Signed commits required", status: "missing", priority: "P3", effort: "XS" },
  { id: "renovate", category: "devops", phase: "polish", title: "Automated dependency updates (Renovate/Dependabot)", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-14: .github/dependabot.yml — npm daily, minor+patch grouped weekly, open-PR limit 5; github-actions weekly." },
  { id: "lockfile-integrity", category: "devops", phase: "hardening", title: "Lockfile integrity check in CI", status: "done", priority: "P2", effort: "XS", notes: "CI installs with `pnpm install --frozen-lockfile`, so any lockfile drift fails the typecheck/lint jobs." },
  { id: "build-cache", category: "devops", phase: "scale", title: "Build caching (Turbopack, Vercel)", status: "partial", priority: "P2", effort: "XS", notes: "Vercel default. Verify cache hit rate." },
  { id: "test-coverage-gate", category: "devops", phase: "scale", title: "Test coverage minimum gate (60% start)", status: "done", priority: "P2", effort: "S" , notes: "Shipped 2026-05-19 (C2): coverage.yml enforces 60% lib coverage threshold via vitest --coverage. Soft-warn first." },
  { id: "pre-commit-hooks", category: "devops", phase: "polish", title: "Pre-commit hooks (prettier + lint)", status: "partial", priority: "P3", effort: "XS" },
  { id: "pr-template", category: "devops", phase: "polish", title: "PR + issue templates", status: "done", priority: "P3", effort: "XS", notes: "Shipped 2026-05-14: .github/PULL_REQUEST_TEMPLATE.md + bug_report + feature_request + config.yml (disables blank issues, routes security to security@)." },
  { id: "codeowners", category: "devops", phase: "polish", title: "CODEOWNERS file", status: "done", priority: "P3", effort: "XS", notes: "Shipped 2026-05-14: single-owner @owner for all paths." },
  { id: "license-file", category: "devops", phase: "polish", title: "LICENSE file", status: "done", priority: "P3", effort: "XS", notes: "Shipped 2026-05-14: Proprietary / All Rights Reserved. Owner: Spacefield (Spacefield), 2026." },
  { id: "security-md", category: "devops", phase: "polish", title: "SECURITY.md (disclosure policy)", status: "done", priority: "P2", effort: "XS", notes: "Shipped 2026-05-14 at repo root. Reports to security@spacefield.co, 72h ack, links to /.well-known/security.txt + /legal/security." },
  { id: "storybook", category: "devops", phase: "maturity", title: "Component library / Storybook", status: "missing", priority: "P3", effort: "L" },
  { id: "visual-regression", category: "devops", phase: "maturity", title: "Visual regression testing (Chromatic/Percy)", status: "missing", priority: "P3", effort: "M" },
  { id: "e2e-smoke", category: "devops", phase: "hardening", title: "E2E smoke pack (5 critical user flows)", status: "done", priority: "P0", effort: "M", notes: "Shipped 2026-05-19 (Y4): playwright.config.ts + 5 specs (homepage / pricing / signin / tasks / api/health). Gated — runs when @playwright/test installed (CI workflow has the dep, local dev opts in via pnpm add)." },
  { id: "perf-budget-ci", category: "devops", phase: "scale", title: "Perf budget enforced in CI", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-19 (Y4): scripts/check-bundle-budget.js asserts main client bundle <550KB. .github/workflows/test.yml runs it on every PR + push." },

  // ════════════════════════════════════════════════════════════════════
  // ── Compliance & legal ──
  // ════════════════════════════════════════════════════════════════════
  { id: "tos-page", category: "compliance", phase: "hardening", title: "Terms of Service page", status: "partial", priority: "P0", effort: "S", notes: "Starter draft live at /legal/terms (2026-05-13). UAE jurisdiction, AI disclaimers, Paddle MoR. Needs UAE-licensed counsel review before formal effect." },
  { id: "privacy-page", category: "compliance", phase: "hardening", title: "Privacy Policy page", status: "partial", priority: "P0", effort: "S", notes: "Starter draft live at /legal/privacy. GDPR + UAE PDPL compatible structure. Needs counsel review." },
  { id: "dpa-template", category: "compliance", phase: "hardening", title: "DPA template (Data Processing Agreement)", status: "partial", priority: "P1", effort: "S", notes: "Starter live at /legal/dpa. Auto-incorporated by Terms. Counter-signed copies on request." },
  { id: "cookie-consent", category: "compliance", phase: "hardening", title: "Cookie consent banner (EU + UAE)", status: "done", priority: "P1", effort: "S", notes: "Shipped 2026-05-15: components/CookieConsent.tsx (in-house, no third-party JS) + lib/cookie-consent.ts SSR helper + mounted in app/layout.tsx with no-flash SSR gating. Persists to localStorage + cookie." },
  { id: "gdpr-data-export", category: "compliance", phase: "hardening", title: "GDPR data-export self-service", status: "partial", priority: "P1", effort: "M", ref: "/admin/data-exports" },
  { id: "gdpr-erasure", category: "compliance", phase: "hardening", title: "Right-to-erasure flow (user-initiated delete)", status: "done", priority: "P1", effort: "M", notes: "Shipped 2026-05-17 (P1 migration 20260517a): /account/danger-zone type-email-to-confirm + 30d grace + /api/cron/account-purge daily 07:00 UTC. account_deletion_requests table + RPCs." },
  { id: "subprocessors-list", category: "compliance", phase: "polish", title: "Public subprocessors page + change notification", status: "done", priority: "P2", effort: "XS", notes: "Live at /legal/subprocessors with vendor / region / data columns. Email subscribe-to-changes." },
  { id: "aup", category: "compliance", phase: "hardening", title: "Acceptable Use Policy", status: "partial", priority: "P2", effort: "S", notes: "Live at /legal/aup. Real-estate specifics + AI-content rules covered. Needs counsel pass." },
  { id: "trust-center", category: "compliance", phase: "polish", title: "Trust center page (security summary)", status: "done", priority: "P2", effort: "S", notes: "Live at /legal/security. Current controls + roadmap + responsible-disclosure flow." },
  { id: "uae-pdpl", category: "compliance", phase: "hardening", title: "UAE PDPL compliance review", status: "missing", priority: "P1", effort: "S", notes: "Federal Decree-Law No. 45 of 2021. the maintainer's primary market." },
  { id: "ksa-pdpl", category: "compliance", phase: "maturity", title: "KSA PDPL compliance (if expanding)", status: "missing", priority: "P3", effort: "M" },
  { id: "saudi-nca", category: "compliance", phase: "maturity", title: "Saudi NCA cybersecurity controls", status: "missing", priority: "P3", effort: "L", notes: "Required for govt deals in KSA. Skip until expansion." },
  { id: "ccpa", category: "compliance", phase: "polish", title: "CCPA opt-out (California users)", status: "missing", priority: "P3", effort: "S" },
  { id: "pipeda", category: "compliance", phase: "maturity", title: "PIPEDA (Canada)", status: "na", priority: "P3", effort: "S" },
  { id: "lgpd", category: "compliance", phase: "maturity", title: "LGPD (Brazil)", status: "na", priority: "P3", effort: "S" },
  { id: "data-residency", category: "compliance", phase: "maturity", title: "Data residency requirements documented", status: "missing", priority: "P2", effort: "S", notes: "If a UAE bank wants the data in UAE, we need an answer." },
  { id: "dpia", category: "compliance", phase: "polish", title: "DPIA (Data Protection Impact Assessment)", status: "missing", priority: "P2", effort: "M", notes: "Required under GDPR Art. 35 for high-risk processing (AI on personal data)." },
  { id: "ropa", category: "compliance", phase: "polish", title: "ROPA (Records of Processing Activities)", status: "missing", priority: "P2", effort: "S" },
  { id: "dpo", category: "compliance", phase: "maturity", title: "DPO (Data Protection Officer) designated", status: "missing", priority: "P3", effort: "XS", notes: "Required by GDPR at certain scale. the maintainer can be it initially, document the appointment." },
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
  { id: "transactional-email", category: "cx", phase: "hardening", title: "Transactional email provider (Postmark/Resend)", status: "partial", priority: "P0", effort: "S", notes: "Shipped 2026-05-19 (Z3): lib/email/send.ts provider-agnostic helper falls through RESEND_API_KEY → POSTMARK_API_KEY → email_outbox. 5 templates ready (suspicious-login/welcome/task-assigned/weekly-digest/account-deletion). Flip the switch by setting one env var." },
  { id: "user-changelog", category: "cx", phase: "polish", title: "User-facing changelog page", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-13: /changelog public page with date + tag + description per release. Plus the in-app What's New modal (May-17) reads lib/changelog/entries.ts and fires once per release." },
  { id: "feedback-widget", category: "cx", phase: "polish", title: "Feedback / feature-request widget", status: "done", priority: "P2", effort: "M" , notes: "Shipped 2026-05-19 (C3): same FeedbackButton component covers feedback widget — text + URL + admin notify." },
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
  { id: "unsubscribe-link", category: "cx", phase: "hardening", title: "Unsubscribe link on every email (legal req)", status: "done", priority: "P0", effort: "XS", notes: "Shipped 2026-05-19 (A3): /unsubscribe page + /api/unsubscribe route. HMAC-signed token (user_id + email_kind + expires_at, 90d TTL) verifies and flips the corresponding email_* col on notification_prefs. Skipped for transactional emails (suspicious-login etc.)." },
  { id: "list-unsub-header", category: "cx", phase: "hardening", title: "List-Unsubscribe header (one-click)", status: "done", priority: "P1", effort: "XS", notes: "Shipped 2026-05-19 (A3): lib/email/send.ts now emits List-Unsubscribe (URL + mailto) + List-Unsubscribe-Post: List-Unsubscribe=One-Click headers on marketing/digest emails (RFC 8058 / Gmail 2024 bulk-sender requirement). Wired through both Resend + Postmark provider paths." },
  { id: "email-pref-center", category: "cx", phase: "polish", title: "Email preference center", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-19 (Z3): /account/email page reads notification_prefs + 5 email-channel toggles (welcome / suspicious-login / task-assigned / weekly-digest / marketing). POST to /api/account/email-prefs upserts." },
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
  { id: "usage-billing", category: "gtm", phase: "scale", title: "Usage-based billing for AI tokens (over-limit)", status: "done", priority: "P2", effort: "M" , notes: "Shipped 2026-05-19 (C3): lib/ai/usage-billing.ts chargeOverage(workspaceId, usd) writes to ai_usage_overages table when monthly spend exceeds tier budget. Wired into recordAiCall post-call path." },
  { id: "annual-billing", category: "gtm", phase: "polish", title: "Annual billing option (20% discount)", status: "missing", priority: "P2", effort: "S", notes: "Improves cash flow + retention 30%." },
  { id: "referral-program", category: "gtm", phase: "polish", title: "Referral program (user-facing)", status: "partial", priority: "P2", effort: "M", ref: "/admin/coupons" },
  { id: "affiliate-program", category: "gtm", phase: "polish", title: "Affiliate program", status: "missing", priority: "P3", effort: "L", notes: "Different from referral — third parties earn commission on sales they drive." },
  { id: "free-trial", category: "gtm", phase: "foundation", title: "Free trial mechanics (decide: 14d? card-on-file?)", status: "missing", priority: "P0", effort: "S" },
  { id: "money-back-guarantee", category: "gtm", phase: "polish", title: "Money-back guarantee policy", status: "done", priority: "P2", effort: "XS" , notes: "Shipped 2026-05-19 (C4): docs/marketing/MONEY-BACK-GUARANTEE.md — 30-day policy, refund mechanism via Paddle, customer-facing copy." },
  { id: "volume-discount", category: "gtm", phase: "polish", title: "Volume / team discount", status: "missing", priority: "P3", effort: "S" },
  { id: "edu-nonprofit-pricing", category: "gtm", phase: "polish", title: "Edu / non-profit pricing tier", status: "missing", priority: "P3", effort: "XS" },
  { id: "startup-program", category: "gtm", phase: "maturity", title: "Startup program (credits for YC/etc.)", status: "missing", priority: "P3", effort: "XS" },
  { id: "public-roadmap", category: "gtm", phase: "polish", title: "Public roadmap page", status: "done", priority: "P2", effort: "S", notes: "Live at /roadmap — Shipped / In progress / Next up. Curated; does not leak internal P0 list." },
  { id: "launch-comms-plan", category: "gtm", phase: "polish", title: "Launch comms plan (PH, Twitter, press)", status: "done", priority: "P1", effort: "M" , notes: "Shipped 2026-05-19 (C4): docs/launch/COMMS-PLAN.md — pre-launch T-14 through T+0 + launch-day comms + post-launch sequences. Templates for Twitter/LinkedIn/PH/HN/email." },
  { id: "press-kit", category: "gtm", phase: "polish", title: "Press kit + brand assets page", status: "done", priority: "P2", effort: "S", notes: "Live at /press — logos, founder bio, boilerplate, press FAQs." },
  { id: "press-release-template", category: "gtm", phase: "polish", title: "Press release template", status: "done", priority: "P3", effort: "S" , notes: "Shipped 2026-05-19 (C4): docs/launch/PRESS-RELEASE-TEMPLATE.md — embargoed PR template." },
  { id: "journalist-list", category: "gtm", phase: "polish", title: "Journalist / MENA tech press outreach list", status: "done", priority: "P2", effort: "M" , notes: "Shipped 2026-05-19 (C4): docs/marketing/JOURNALIST-LIST.md — MENA tech press outreach template (TechRadar ME, Wamda, MENAbytes, Forbes ME)." },
  { id: "analytics-funnel", category: "gtm", phase: "hardening", title: "End-to-end conversion funnel (landing → paid)", status: "partial", priority: "P1", effort: "M", ref: "/admin/funnels" },
  { id: "public-api", category: "gtm", phase: "maturity", title: "Public API + developer docs", status: "done", priority: "P3", effort: "L", notes: "Shipped 2026-05-18 (W5): /api/v1/{tasks,projects,contacts,deals,employees} GET list + by-id, bearer-token + scope-gated, workspace-scoped, cursor pagination, 600 req/min rate-limit. /developers docs page + /developers/openapi.json spec. SHA-256 token verify via lib/api-tokens/verify.ts." },
  { id: "integrations-partners", category: "gtm", phase: "maturity", title: "Integration partners (Slack, Google, Sheets, Notion)", status: "partial", priority: "P3", effort: "L", ref: "/admin/integrations" },
  { id: "appsumo-deal", category: "gtm", phase: "maturity", title: "AppSumo / lifetime deal evaluation", status: "missing", priority: "P3", effort: "S" },
  { id: "product-hunt", category: "gtm", phase: "polish", title: "Product Hunt launch plan (hunter, assets, first-5 comments)", status: "done", priority: "P1", effort: "M" , notes: "Shipped 2026-05-19 (C4): docs/launch/PRODUCT-HUNT.md — hunter, day-of assets, first-5-comments script, 24h follow-up." },
  { id: "hn-show", category: "gtm", phase: "polish", title: "Hacker News / Show HN post drafted", status: "missing", priority: "P2", effort: "S" },
  { id: "twitter-launch", category: "gtm", phase: "polish", title: "Twitter/X launch thread + scheduling", status: "missing", priority: "P2", effort: "S" },
  { id: "linkedin-launch", category: "gtm", phase: "polish", title: "LinkedIn launch post + scheduling", status: "missing", priority: "P2", effort: "S" },
  { id: "case-studies", category: "gtm", phase: "polish", title: "Case studies (3 minimum)", status: "missing", priority: "P2", effort: "L" },
  { id: "testimonials", category: "gtm", phase: "polish", title: "Testimonials (10 minimum)", status: "missing", priority: "P2", effort: "M" },
  { id: "logo-wall", category: "gtm", phase: "polish", title: "Customer logo wall on homepage", status: "partial", priority: "P3", effort: "XS", notes: "Shipped 2026-05-19 (Z4): Trusted-by strip on / with 5 grayscale SVG placeholders + CUSTOMER_LOGOS swap-point. docs/marketing/LOGO-WALL.md documents permission requirements + asset spec. Real customer logos still need permissions before swap-in." },
  { id: "comparison-page", category: "gtm", phase: "scale", title: "Comparison page (vs alternatives)", status: "done", priority: "P2", effort: "M", notes: "Shipped 2026-05-19 (Z4): /compare — 15-row honest feature matrix vs Salesforce / HubSpot / Zoho One / Notion. Per-cell footnotes via abbr title. ISR 300." },
  { id: "alternative-to-seo", category: "gtm", phase: "scale", title: "Alternative-to-X SEO landing pages", status: "done", priority: "P3", effort: "L", notes: "Shipped 2026-05-19 (Z4): /alternative-to/[slug] x6 pre-baked (salesforce/hubspot/zoho-one/notion/monday/clickup). Each: hero + 5 wins + comparison snippet + honest 'stay with them if' counterpoints. ISR 300, generateStaticParams." },
  { id: "templates-library", category: "gtm", phase: "polish", title: "Templates library (free downloads, lead magnet)", status: "done", priority: "P2", effort: "L", notes: "Shipped 2026-05-19 (Z4): /templates lists 7 cards — 3 live (Real Estate / Marketing / Co-working/Ops) wired to W6 templates + 4 'Coming soon' conceptual." },
  { id: "embed-widgets", category: "gtm", phase: "scale", title: "Embeddable widgets (calculator, etc.)", status: "done", priority: "P3", effort: "M", notes: "Shipped 2026-05-19 (Z1): /embed/[toolId] with mortgage-calculator + roi-calculator widgets. Self-contained light-mode shell, no Spacefield chrome. CSP frame-ancestors carved out (SE-008). iframe snippet in docs/widgets/EMBED.md." },
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
  { id: "a11y-audit", category: "mobile", phase: "hardening", title: "Accessibility audit (WCAG 2.1 AA)", status: "partial", priority: "P1", effort: "M", notes: "Shipped 2026-05-19 (C2 + C4): .github/workflows/a11y.yml runs @axe-core/cli on every PR + docs/a11y/AUDIT-FINDINGS.md lists top 20 findings with file:line. Actual fixes follow." },
  { id: "deep-linking", category: "mobile", phase: "polish", title: "Universal links iOS / app links Android", status: "missing", priority: "P3", effort: "M" },
  { id: "web-to-app", category: "mobile", phase: "polish", title: "Web-to-app handoff (open in app if installed)", status: "missing", priority: "P3", effort: "S" },
  { id: "app-store-listing", category: "mobile", phase: "polish", title: "App Store listing (screenshots, icon, copy)", status: "missing", priority: "P2", effort: "M" },
  { id: "play-store-listing", category: "mobile", phase: "polish", title: "Play Store listing (screenshots, icon, copy)", status: "missing", priority: "P2", effort: "M" },
  { id: "privacy-nutrition-labels", category: "mobile", phase: "polish", title: "Privacy nutrition labels (App Store)", status: "missing", priority: "P2", effort: "S" },
  { id: "push-permission-flow", category: "mobile", phase: "polish", title: "Push permission UX (ask at right moment)", status: "done", priority: "P2", effort: "S", notes: "Shipped 2026-05-18 (W3): components/PushPermissionPrompt event-driven via firePushPermissionPrompt(trigger). Mounted globally + wired to 2 positive-moment triggers (task completed → 'done', workspace created)." },
  { id: "biometric-auth", category: "mobile", phase: "polish", title: "Biometric auth (Face/Touch ID)", status: "missing", priority: "P3", effort: "S" },
  { id: "crash-reporting-mobile", category: "mobile", phase: "polish", title: "Mobile crash reporting (Crashlytics/Sentry)", status: "missing", priority: "P2", effort: "S" },
  { id: "force-update-mobile", category: "mobile", phase: "scale", title: "Force-update mechanism (critical bugs)", status: "missing", priority: "P2", effort: "S" },
  { id: "app-review-prompt", category: "mobile", phase: "scale", title: "App review prompt (after positive moment)", status: "missing", priority: "P3", effort: "XS" },
  { id: "rtl-layout", category: "mobile", phase: "polish", title: "RTL (Arabic) layout audit", status: "partial", priority: "P1", effort: "M", notes: "Shipped 2026-05-18 (W3): <html dir='rtl'> on ar-* locale + 28 conversions across 21 files (ml/mr/pl/pr/left/right → ms/me/ps/pe/start/end logical properties). docs/mobile/RTL-AUDIT.md tracks what's left." },
  { id: "tablet-layout", category: "mobile", phase: "polish", title: "Tablet-optimized layout (iPad, foldables)", status: "done", priority: "P3", effort: "M", notes: "Shipped 2026-05-18 (W3): 4 breakpoint fixes — Landing features/pricing grids, SEO RelatedTools, pricing AddonSection — sm:grid-cols-2 bridge between grid-cols-1 and md:grid-cols-3. docs/mobile/TABLET-AUDIT.md tracks methodology." },

  // ════════════════════════════════════════════════════════════════════
  // ── Launch readiness ──
  // ════════════════════════════════════════════════════════════════════
  { id: "launch-runbook", category: "launch", phase: "polish", title: "Launch runbook (T-30 to T+30 plan)", status: "done", priority: "P0", effort: "M", notes: "Shipped 2026-05-14: docs/launch/RUNBOOK.md — 5 phases (pre-launch / launch week / launch day hour-by-hour / first week / first month), named roles (founder/on-call/support all currently the maintainer — SPOF called out)." },
  { id: "war-room", category: "launch", phase: "polish", title: "War-room channel + comms primed", status: "done", priority: "P1", effort: "XS" , notes: "Shipped 2026-05-19 (C4): docs/launch/WAR-ROOM.md — channel setup, staffing rotation, escalation ladder, decision-maker designation, press protocol." },
  { id: "tabletop-drill", category: "launch", phase: "polish", title: "Tabletop incident drill (3 scenarios)", status: "done", priority: "P1", effort: "S" , notes: "Shipped 2026-05-19 (C4): docs/launch/TABLETOP-DRILL.md — 3 scenarios (Anthropic outage / Paddle webhook fail / Supabase replica lag) with trigger / notification / decision tree / rollback criteria." },
  { id: "dns-ttl-drop", category: "launch", phase: "polish", title: "DNS TTLs dropped to 60s pre-launch", status: "missing", priority: "P2", effort: "XS" },
  { id: "scale-up-capacity", category: "launch", phase: "polish", title: "Pre-scale Supabase + Vercel plan", status: "done", priority: "P1", effort: "XS" , notes: "Shipped 2026-05-19 (C4): docs/launch/SCALE-UP-CAPACITY.md — pre-launch capacity checklist (Vercel plan, Supabase compute, Anthropic Tier 2+, rate-limits)." },
  { id: "waitlist-primed", category: "launch", phase: "polish", title: "Pre-launch waitlist warmed (email sequence)", status: "missing", priority: "P2", effort: "S" },
  { id: "kpi-baseline", category: "launch", phase: "polish", title: "Launch-week KPI dashboard", status: "done", priority: "P1", effort: "M" , notes: "Shipped 2026-05-19 (C4): docs/launch/KPI-DASHBOARD.md — signup/activation/error/AI-cost/support KPI definitions + sources." },
  { id: "support-staffing", category: "launch", phase: "polish", title: "Launch-week support coverage plan", status: "done", priority: "P1", effort: "XS" , notes: "Shipped 2026-05-19 (C4): docs/launch/SUPPORT-STAFFING.md — launch-week coverage, time-zone splits, escalation triggers, SLA." },
  { id: "rollback-trigger", category: "launch", phase: "polish", title: "Pre-defined rollback triggers (numbers, not feelings)", status: "done", priority: "P0", effort: "XS", notes: "Shipped 2026-05-14: docs/launch/ROLLBACK_TRIGGERS.md — auto rollback at 5xx>5%, p95>3s, AI>$100/hr, webhook<80% (5-min sustained). Manual triggers + comms matrix." },
  { id: "post-mortem-template", category: "launch", phase: "polish", title: "Blameless post-mortem template", status: "done", priority: "P2", effort: "XS", notes: "Shipped 2026-05-14: docs/launch/POST_MORTEM_TEMPLATE.md — full blameless template with worked example, 48h circulation rule." },
  { id: "press-embargo", category: "launch", phase: "polish", title: "Press embargo timing decided", status: "missing", priority: "P3", effort: "XS" },
  { id: "bug-bash", category: "launch", phase: "polish", title: "Whole-team bug bash 48h before launch", status: "done", priority: "P1", effort: "S" , notes: "Shipped 2026-05-19 (C4): docs/launch/BUG-BASH.md — 48h pre-launch bug bash protocol." },
  { id: "bug-freeze", category: "launch", phase: "polish", title: "Bug freeze 48h before launch", status: "done", priority: "P1", effort: "XS" , notes: "Shipped 2026-05-19 (C4): docs/launch/BUG-FREEZE.md — bug freeze policy, hotfix criteria, sign-off authority." },
  { id: "dns-prewarm", category: "launch", phase: "polish", title: "DNS pre-warm at edge", status: "missing", priority: "P3", effort: "XS" },
  { id: "cdn-warm", category: "launch", phase: "polish", title: "CDN cache warm before traffic", status: "missing", priority: "P3", effort: "S" },
  { id: "backup-payment-processor", category: "launch", phase: "maturity", title: "Backup payment processor (if Paddle fails)", status: "missing", priority: "P3", effort: "L" },
  { id: "backup-email-provider", category: "launch", phase: "scale", title: "Backup email provider", status: "missing", priority: "P3", effort: "S" },
  { id: "founder-availability", category: "launch", phase: "polish", title: "Founder on-deck (no travel during launch)", status: "missing", priority: "P0", effort: "XS" },
  { id: "first-10-hours-plan", category: "launch", phase: "polish", title: "First-10-hours response plan", status: "done", priority: "P1", effort: "XS" , notes: "Shipped 2026-05-19 (C4): docs/launch/FIRST-10-HOURS.md — hour-by-hour T+0 to T+10 plan." },
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
