/**
 * Launch-readiness checklist — the single source of truth for the
 * `/admin/status` dashboard.
 *
 * Edit this file to update item status. Each item should be small enough
 * to ship as one PR/commit. Notes carry industry context (what big
 * companies do at scale) so the gap is obvious, not just labelled.
 *
 * Categories follow the standard at-scale readiness rubric used by
 * Stripe, Linear, Vercel, Notion when they prep a product for public
 * launch. We didn't invent the structure — we filled it in honestly
 * against the current Spacefield build.
 */

export type Status = "done" | "partial" | "missing" | "blocked" | "na";
export type Priority = "P0" | "P1" | "P2" | "P3";

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
}

export interface Item {
  /** stable kebab-case id, used for anchor links */
  id: string;
  category: CategoryId;
  title: string;
  status: Status;
  priority: Priority;
  /** 1-3 sentence note — what it is, why it matters, what we have/lack */
  notes?: string;
  /** optional file path (admin route, lib path, table name) for context */
  ref?: string;
}

export const CATEGORIES: Category[] = [
  {
    id: "product",
    label: "Product completeness",
    description:
      "Core surfaces and features the user touches. Must be coherent and bug-free before a wider launch.",
  },
  {
    id: "ai",
    label: "AI runtime",
    description:
      "Models, prompts, evals, cost control. Hidden cost of bad AI ops is unbounded spend + silent quality drift.",
  },
  {
    id: "database",
    label: "Database & data layer",
    description:
      "Postgres/Supabase, RLS, migrations, indexes, retention. Most production outages start here.",
  },
  {
    id: "cache",
    label: "Caching & CDN",
    description:
      "Edge cache, ISR/SSR strategy, in-memory and Redis caches. Cuts cost 5-10x and latency 3-5x when done right.",
  },
  {
    id: "perf",
    label: "Performance",
    description:
      "Core Web Vitals, bundle size, query p95/p99, time-to-interactive. Public launch traffic exposes every slow path.",
  },
  {
    id: "security",
    label: "Security",
    description:
      "Auth, RBAC, secrets, WAF, OWASP top 10, pen-test. Security debt compounds — fix before user count climbs.",
  },
  {
    id: "scale",
    label: "Scalability",
    description:
      "Load capacity, autoscaling, queue depth, multi-region. What breaks at 10x current traffic?",
  },
  {
    id: "reliability",
    label: "Reliability",
    description:
      "SLOs, error budgets, retries, idempotency, circuit breakers. Difference between '99% uptime' and '99.9%' is engineering.",
  },
  {
    id: "observability",
    label: "Observability",
    description:
      "Logs, metrics, traces, alerts, dashboards, on-call. You cannot fix what you cannot see.",
  },
  {
    id: "devops",
    label: "DevOps & CI/CD",
    description:
      "Build, test, deploy, rollback, env management, IaC. Halves time from bug-discovery to bug-shipped.",
  },
  {
    id: "compliance",
    label: "Compliance & legal",
    description:
      "ToS, privacy, GDPR, UAE PDPL, DPA, subprocessors. Required for any B2B deal and most consumer markets.",
  },
  {
    id: "cx",
    label: "Customer experience",
    description:
      "Onboarding, help docs, in-app support, status page, comms. First-week retention is decided here.",
  },
  {
    id: "gtm",
    label: "Business & GTM",
    description:
      "Pricing, billing edges, growth loops, launch comms, press, partnerships, public roadmap.",
  },
  {
    id: "mobile",
    label: "Mobile & multi-platform",
    description:
      "Responsive web, native apps, push delivery, offline. Mobile-first markets demand parity.",
  },
  {
    id: "launch",
    label: "Launch readiness",
    description:
      "Load test, DR drill, runbooks, on-call rota, war-room plan. Final gates before flipping the switch.",
  },
];

// ─────────────────────────────────────────────────────────────────────
// Items
// ─────────────────────────────────────────────────────────────────────

export const CHECKLIST: Item[] = [
  // ── Product completeness ────────────────────────────────────────────
  {
    id: "admin-panel",
    category: "product",
    title: "Full admin control plane",
    status: "done",
    priority: "P0",
    notes:
      "~50 admin routes across 9 sections — agents, apps, users, workspaces, runtime config, errors, etc. Built over 7+ parallel-agent rounds in May.",
    ref: "/admin",
  },
  {
    id: "core-tools",
    category: "product",
    title: "Tool catalog (130+ tools)",
    status: "done",
    priority: "P0",
    notes:
      "RE + Solutions tools redesigned on foundation tokens. Standalone tool pages disabled; everything routed through the OS shell.",
    ref: "app/solutions/tools",
  },
  {
    id: "toshare",
    category: "product",
    title: "toShare universal sharing (toshare.net)",
    status: "done",
    priority: "P1",
    notes:
      "6 viewer types, MintShareButton, 5 tools wired. Shipped 2026-05-02 (briefly broken by _share folder name — fixed).",
    ref: "app/(share)",
  },
  {
    id: "iframe-apps",
    category: "product",
    title: "Custom iframe-app registration",
    status: "done",
    priority: "P1",
    notes: "Admins can register third-party iframe apps via DB; merged with built-in tool list at runtime.",
  },
  {
    id: "workflows-runner",
    category: "product",
    title: "Workflow dispatcher + workflow_runs table",
    status: "done",
    priority: "P1",
    notes: "runWorkflow dispatcher live; Run button in admin. Step retries + DLQ still TBD.",
  },
  {
    id: "property-poster",
    category: "product",
    title: "Property Poster Creator (flagship tool)",
    status: "done",
    priority: "P1",
    notes: "6 templates, dual dimensions, AI sidekick. Output design refresh deferred.",
  },
  {
    id: "crm",
    category: "product",
    title: "CRM (Forms, contacts, pipeline)",
    status: "partial",
    priority: "P1",
    notes: "3-phase CRM shipped Apr 28. Still missing: bulk import templates, lead scoring, email-thread sync.",
  },
  {
    id: "public-marketing",
    category: "product",
    title: "Public marketing surface (/, /learn, /community, /market)",
    status: "done",
    priority: "P1",
    notes: "Teal design system, SEO, widgets, analytics. Last big pass was the Apr 12 mega-upgrade.",
  },
  {
    id: "feature-coverage-audit",
    category: "product",
    title: "Feature coverage audit (no half-built tools)",
    status: "missing",
    priority: "P1",
    notes:
      "Need a sweep: every tool exposed must produce real output (no Coming Soon, no fake controls). Apr 30 pass caught many — re-run before launch.",
  },
  {
    id: "i18n-content",
    category: "product",
    title: "Content i18n (en + ar minimum)",
    status: "partial",
    priority: "P2",
    notes: "Locales table exists in admin. Need to actually translate pages and switch the UI provider. Arabic RTL pass not done.",
  },

  // ── AI runtime ──────────────────────────────────────────────────────
  {
    id: "ai-agents-config",
    category: "ai",
    title: "AI agents — declarative config (model/prompt/skills/tools)",
    status: "done",
    priority: "P0",
    notes: "Spacefield Assistant + Property Poster Helper live. Admin can swap model, edit prompt, gate by tier/workspace/user.",
    ref: "/admin/agents",
  },
  {
    id: "models-registry",
    category: "ai",
    title: "Models registry + provider keys",
    status: "done",
    priority: "P0",
    ref: "/admin/models, /admin/providers",
  },
  {
    id: "prompt-library",
    category: "ai",
    title: "Prompt library with versions",
    status: "partial",
    priority: "P1",
    notes:
      "Table + admin UI exist. Version history + A/B routing across versions not wired. Anthropic + OpenAI prompt-tracing best practice.",
  },
  {
    id: "eval-suites",
    category: "ai",
    title: "Eval suites (regression tests for prompts)",
    status: "partial",
    priority: "P1",
    notes:
      "Admin section exists, but actual eval runner that compares outputs across model versions isn't wired. Linear and Notion run nightly evals.",
  },
  {
    id: "cost-controls",
    category: "ai",
    title: "Per-workspace AI cost cap + alerts",
    status: "partial",
    priority: "P0",
    notes:
      "Cost & insights dashboard exists. Hard caps with alerting and auto-throttle when 80% / 100% of budget — NOT wired. Single biggest unbounded-spend risk.",
    ref: "/admin/insights",
  },
  {
    id: "model-fallback",
    category: "ai",
    title: "Provider fallback chain (Claude → OpenAI → cached)",
    status: "missing",
    priority: "P1",
    notes:
      "If Anthropic is degraded, calls should retry on OpenAI or serve a cached/templated response. Currently single-provider failure = AI surface dead.",
  },
  {
    id: "prompt-injection",
    category: "ai",
    title: "Prompt-injection mitigations on user-content tools",
    status: "missing",
    priority: "P1",
    notes:
      "Tools that feed user-supplied data into a prompt (Property Poster, CRM enrich) need input sanitization + system-prompt reinforcement. OWASP LLM Top-10 #1.",
  },
  {
    id: "ai-output-moderation",
    category: "ai",
    title: "Output moderation pass on user-shared AI content",
    status: "partial",
    priority: "P1",
    notes:
      "Admin moderation page exists. Automated moderation on toShare-published AI output not wired. Reputational risk if a posted listing contains slurs/PII.",
  },
  {
    id: "rag-knowledge-base",
    category: "ai",
    title: "RAG / knowledge base for grounded answers",
    status: "missing",
    priority: "P2",
    notes:
      "Spacefield Assistant currently uses prompt-only grounding. A pgvector or Pinecone index over docs + market data would cut hallucination on factual queries.",
  },
  {
    id: "skills-marketplace",
    category: "ai",
    title: "Skills marketplace (user-submitted skills)",
    status: "missing",
    priority: "P3",
    notes: "Future. Internal Skills catalog exists; opening to user contribution requires review + sandbox + revenue split.",
  },

  // ── Database ────────────────────────────────────────────────────────
  {
    id: "schema-baseline",
    category: "database",
    title: "Schema baseline (~60 tables across admin runtime)",
    status: "done",
    priority: "P0",
    notes: "All admin features have backing tables. Sessions 2026-05-09 series added admin_roles, runtime_config, admin_pages, etc.",
  },
  {
    id: "rls-coverage",
    category: "database",
    title: "Row-Level Security on every multi-tenant table",
    status: "partial",
    priority: "P0",
    notes:
      "Most tables have RLS. Need a sweep: write a Postgres function that returns every table without an RLS policy and run it weekly. Supabase ships this snippet.",
  },
  {
    id: "migrations-rollback",
    category: "database",
    title: "Every migration has a rollback path",
    status: "missing",
    priority: "P1",
    notes:
      "Supabase migrations are forward-only by default. Need a convention: every DDL must include the inverse, stored next to it. Critical for hot-fix rollback.",
  },
  {
    id: "indexes-audit",
    category: "database",
    title: "Index audit on hot query paths",
    status: "missing",
    priority: "P1",
    notes:
      "Run `pg_stat_statements` analysis on the 50 most expensive queries; add covering indexes. Standard pre-launch step — Linear blog wrote about this.",
  },
  {
    id: "connection-pooler",
    category: "database",
    title: "Connection pooler tuned (PgBouncer/Supavisor)",
    status: "partial",
    priority: "P1",
    notes:
      "Supabase Supavisor enabled by default. Verify pool mode = transaction, max_client_conn sized for Vercel function fan-out (each function = 1+ conn).",
  },
  {
    id: "backups-restore-drill",
    category: "database",
    title: "Backups + DOCUMENTED restore drill",
    status: "partial",
    priority: "P0",
    notes:
      "Supabase has daily backups + PITR. Have we ever actually restored to a fresh project and verified? Schedule a restore drill — paper backups are not backups.",
    ref: "/admin/backups",
  },
  {
    id: "data-retention-policy",
    category: "database",
    title: "Data retention policy (logs, events, deleted users)",
    status: "missing",
    priority: "P1",
    notes:
      "Right now logs/audit/errors tables grow forever. Need a cron that prunes >90d entries (configurable per table). Required for GDPR right-to-erasure.",
  },
  {
    id: "soft-delete-pattern",
    category: "database",
    title: "Soft-delete pattern for user-facing entities",
    status: "partial",
    priority: "P2",
    notes:
      "Some tables (workspaces, files) soft-delete. Many don't. Standardize: `deleted_at timestamp` + RLS to hide. Lets us recover from accidental UI bulk-deletes.",
  },
  {
    id: "audit-log-coverage",
    category: "database",
    title: "Audit log captures every admin mutation",
    status: "done",
    priority: "P0",
    notes: "audit log + sign-in events tables exist. Verify every admin _action writes an audit row (some skip it).",
    ref: "/admin/audit",
  },
  {
    id: "read-replicas",
    category: "database",
    title: "Read replicas for analytics queries",
    status: "missing",
    priority: "P2",
    notes:
      "Supabase Pro+ supports read replicas. Analytics queries (toShare aggregates, admin insights) should hit a replica to spare the primary.",
  },

  // ── Caching & CDN ───────────────────────────────────────────────────
  {
    id: "vercel-edge-cache",
    category: "cache",
    title: "Vercel edge cache headers on public pages",
    status: "partial",
    priority: "P1",
    notes:
      "Many pages are server-rendered with no cache headers. Add `s-maxage` + `stale-while-revalidate` on /, /learn, /market for global TTFB <100ms.",
  },
  {
    id: "isr-strategy",
    category: "cache",
    title: "ISR strategy for content pages (blog, learn, tools)",
    status: "missing",
    priority: "P1",
    notes:
      "Currently mostly force-dynamic. Move stable content to `revalidate: 60` + on-demand revalidate webhooks from CMS edits. Cuts function invocations 90%.",
  },
  {
    id: "redis-layer",
    category: "cache",
    title: "Redis layer for hot reads (sessions, rate-limit, feed cache)",
    status: "missing",
    priority: "P1",
    notes:
      "Upstash Redis on Vercel = 1-click. Use for: rate-limit buckets, hot feature-flag reads, top-20 community feed entries. Cuts DB load 50-70%.",
  },
  {
    id: "query-memoization",
    category: "cache",
    title: "React `cache()` on duplicate server-side queries",
    status: "partial",
    priority: "P2",
    notes:
      "Some libs already deduplicate within a request. Audit: any data lib called >1x per request without `cache()` wrapper is a wasted DB call.",
  },
  {
    id: "image-cdn",
    category: "cache",
    title: "Image optimization via next/image + Vercel CDN",
    status: "partial",
    priority: "P1",
    notes:
      "Mixed usage. Audit hero images — any <img> on a marketing page is a perf miss. Vercel optimizes next/image for free.",
  },
  {
    id: "static-assets-cdn",
    category: "cache",
    title: "Long-lived caching on /public assets",
    status: "done",
    priority: "P3",
    notes: "Next.js + Vercel default — immutable hashed filenames.",
  },
  {
    id: "feature-flag-cache",
    category: "cache",
    title: "Feature flags resolved at edge",
    status: "missing",
    priority: "P2",
    notes:
      "Currently flags hit DB on every request. Move to Vercel Edge Config (KV at edge) — flag check goes from 30ms to <1ms.",
  },
  {
    id: "cache-invalidation",
    category: "cache",
    title: "Cache invalidation protocol (revalidateTag everywhere)",
    status: "missing",
    priority: "P1",
    notes:
      "When admin edits branding/banner/flag, downstream caches must invalidate. Add `revalidateTag()` to every admin write that affects user-visible state.",
  },

  // ── Performance ─────────────────────────────────────────────────────
  {
    id: "lighthouse-baseline",
    category: "perf",
    title: "Lighthouse / Web Vitals baseline (Performance > 90)",
    status: "missing",
    priority: "P0",
    notes:
      "Need numbers. Run Lighthouse on /, /learn, /tools/property-poster-creator. Target: LCP <2.5s, INP <200ms, CLS <0.1.",
  },
  {
    id: "bundle-analyzer",
    category: "perf",
    title: "Bundle size budget + analyzer in CI",
    status: "missing",
    priority: "P1",
    notes:
      "Add @next/bundle-analyzer; gate PRs at +50kb. Vercel built page size analysis is free.",
  },
  {
    id: "rsc-streaming",
    category: "perf",
    title: "React Server Components streaming + Suspense boundaries",
    status: "partial",
    priority: "P2",
    notes:
      "Some routes render entire trees before flushing HTML. Wrap slow data fetches in `<Suspense>` so above-the-fold paints fast.",
  },
  {
    id: "p95-db-queries",
    category: "perf",
    title: "DB query p95 < 200ms on every page",
    status: "missing",
    priority: "P1",
    notes:
      "Need pg_stat_statements wired to admin/insights with p95/p99 per query. Right now we cannot tell which page is slow.",
  },
  {
    id: "ttfb-budget",
    category: "perf",
    title: "TTFB budget (<500ms for public pages, <1s admin)",
    status: "missing",
    priority: "P1",
    notes: "Tied to ISR strategy + edge cache. Measure via Vercel Analytics Speed Insights (already free on Pro).",
  },
  {
    id: "speed-insights",
    category: "perf",
    title: "Vercel Speed Insights enabled",
    status: "missing",
    priority: "P1",
    notes: "Just turn it on in Vercel dashboard. Logs real-user Web Vitals — free signal we're missing.",
  },
  {
    id: "n-plus-one",
    category: "perf",
    title: "N+1 query audit on list pages",
    status: "missing",
    priority: "P1",
    notes:
      "Admin tables (users, agents, workspaces) — verify every row doesn't trigger a separate query. Use Supabase joins or batched RPC.",
  },
  {
    id: "preload-critical",
    category: "perf",
    title: "Preload critical fonts + above-fold images",
    status: "partial",
    priority: "P2",
    notes: "Next.js handles fonts. Audit hero images for `priority` prop.",
  },
  {
    id: "client-bundle-trim",
    category: "perf",
    title: "Trim client bundles — server-only utilities not leaked",
    status: "partial",
    priority: "P2",
    notes:
      'Run `npx @next/bundle-analyzer` once. Anything with "use client" pulling in heavy lib (markdown parser, chart) → dynamic import.',
  },
  {
    id: "mobile-perf",
    category: "perf",
    title: "Mobile 3G/4G perf check (slow-network LCP <4s)",
    status: "missing",
    priority: "P1",
    notes:
      "Critical for MENA mobile users. Chrome DevTools throttle → 4G → Lighthouse. Currently never measured.",
  },

  // ── Security ────────────────────────────────────────────────────────
  {
    id: "auth-supabase",
    category: "security",
    title: "Supabase auth (email OTP + OAuth)",
    status: "done",
    priority: "P0",
  },
  {
    id: "rbac-roles",
    category: "security",
    title: "Role-based access control (admin_roles + assertCan)",
    status: "done",
    priority: "P0",
    notes: "Shipped session 2026-05-09 v7. Every server action gated by permission key.",
    ref: "/admin/roles",
  },
  {
    id: "rate-limits",
    category: "security",
    title: "Rate limits on API routes + admin",
    status: "done",
    priority: "P0",
    notes: "Middleware enforces per-route limits. IP-rules table backs allow/deny.",
    ref: "/admin/rate-limits",
  },
  {
    id: "secrets-rotation",
    category: "security",
    title: "Secrets rotation policy (90d)",
    status: "missing",
    priority: "P1",
    notes:
      "API keys (Anthropic, Paddle, Supabase service role) have lived for months. Document a 90d rotation cadence + automate via Vercel env API. Stripe rotates internally every 90d.",
  },
  {
    id: "csp-headers",
    category: "security",
    title: "Content-Security-Policy headers",
    status: "missing",
    priority: "P1",
    notes:
      "No CSP set. Add a starter policy (script-src self + analytics, frame-ancestors self) in middleware. Blocks XSS payload exfiltration.",
  },
  {
    id: "owasp-top10",
    category: "security",
    title: "OWASP Top-10 self-assessment",
    status: "missing",
    priority: "P1",
    notes:
      "Walk through OWASP ASVS L1 (~60 controls). Most fail at: dependency vuln scanning, error message leakage, missing CSRF on state-changing GETs.",
  },
  {
    id: "csrf-protection",
    category: "security",
    title: "CSRF protection on server actions",
    status: "partial",
    priority: "P0",
    notes:
      "Next.js Server Actions ship with built-in origin checks. Verify NOT disabled in next.config.ts. Audit any custom API routes that mutate without a token check.",
  },
  {
    id: "waf",
    category: "security",
    title: "Web Application Firewall (Vercel Firewall or Cloudflare)",
    status: "missing",
    priority: "P1",
    notes:
      "Vercel Pro includes Firewall — set rules for known bad UAs, bot signatures, geo-blocks. Cloudflare in front gives more granularity + DDoS L7. Pick one.",
  },
  {
    id: "ddos-mitigation",
    category: "security",
    title: "DDoS mitigation (L3/L4 + L7)",
    status: "partial",
    priority: "P1",
    notes: "Vercel/Cloudflare handle L3/L4. L7 requires WAF rules + rate-limiting (we have rate-limit, need WAF rules).",
  },
  {
    id: "pen-test",
    category: "security",
    title: "Third-party penetration test",
    status: "missing",
    priority: "P1",
    notes:
      "$3-8k for a 1-week external test (HackerOne Pentest, Cobalt, Bishop Fox). Required by most B2B buyers. Do AFTER hardening, before public launch.",
  },
  {
    id: "dep-scanning",
    category: "security",
    title: "Dependency vulnerability scanning in CI",
    status: "missing",
    priority: "P1",
    notes: "GitHub Dependabot + `pnpm audit` in CI on every PR. Auto-PRs for patch upgrades.",
  },
  {
    id: "captcha-signup",
    category: "security",
    title: "CAPTCHA / Turnstile on signup + share-create",
    status: "missing",
    priority: "P2",
    notes:
      "Cloudflare Turnstile (free, invisible). Prevents signup spam + toShare link spam. Trivial to add.",
  },
  {
    id: "file-upload-scan",
    category: "security",
    title: "Virus/malware scan on user uploads",
    status: "missing",
    priority: "P2",
    notes:
      "Supabase Storage doesn't scan. Add ClamAV via a Supabase Edge Function on upload, quarantine on hit. Critical if we let users share files publicly.",
  },
  {
    id: "session-mgmt",
    category: "security",
    title: "Session management — device list + remote revoke",
    status: "partial",
    priority: "P2",
    notes: "Sign-in events tracked. UI for user to see/kill active sessions not built.",
  },

  // ── Scalability ─────────────────────────────────────────────────────
  {
    id: "vercel-autoscale",
    category: "scale",
    title: "Vercel functions auto-scale (default)",
    status: "done",
    priority: "P1",
    notes: "Default behavior. Pro plan covers most surges. Hobby caps cron — already migrated.",
  },
  {
    id: "supabase-tier",
    category: "scale",
    title: "Supabase tier sized for projected load",
    status: "partial",
    priority: "P1",
    notes:
      "Verify current compute add-on size. Small ($25/mo) tops out around ~50 concurrent connections. Medium ($60) for first real traffic.",
  },
  {
    id: "queue-system",
    category: "scale",
    title: "Background job queue (durable)",
    status: "partial",
    priority: "P1",
    notes:
      "Workflow runs + jobs table exist. No durable queue (BullMQ, pg-boss, Inngest). Vercel cron is fine for hourly, not for sub-minute fan-out.",
  },
  {
    id: "load-test",
    category: "scale",
    title: "Load test — sustain 1000 req/min on hot pages",
    status: "missing",
    priority: "P0",
    notes:
      "Run k6 or Artillery against /, /login, /admin/agents, /api/share/[id]. Find the knee. Standard pre-launch gate at every YC startup.",
  },
  {
    id: "multi-region",
    category: "scale",
    title: "Multi-region read (DB + edge functions)",
    status: "missing",
    priority: "P3",
    notes:
      "Not needed for MENA-first launch. Document the path: Supabase read replica in eu-central + Vercel functions in fra1.",
  },
  {
    id: "circuit-breaker",
    category: "scale",
    title: "Circuit breaker on external APIs (Paddle, Anthropic, Twilio)",
    status: "missing",
    priority: "P1",
    notes:
      "If Paddle is degraded for 30s, every checkout retries and we DOS ourselves. Use a simple rolling-window breaker (opossum lib or hand-rolled).",
  },
  {
    id: "graceful-degrade",
    category: "scale",
    title: "Graceful degradation when AI provider is down",
    status: "missing",
    priority: "P1",
    notes:
      "If Anthropic returns 503, AI-powered tools should show 'AI assist temporarily unavailable' + still let user proceed manually. Currently most surface white-screens.",
  },
  {
    id: "backpressure",
    category: "scale",
    title: "Backpressure on workflow dispatcher",
    status: "missing",
    priority: "P2",
    notes: "If 1000 workflows queue at once, runner should rate-limit fanout, not spin up 1000 concurrent function invocations.",
  },

  // ── Reliability ─────────────────────────────────────────────────────
  {
    id: "slo-definitions",
    category: "reliability",
    title: "SLO definitions — uptime, latency, error rate",
    status: "missing",
    priority: "P1",
    notes:
      "Pick 3 SLIs: API uptime, p95 latency, error rate. Set SLOs (e.g. 99.5% uptime monthly). Stripe/Linear publish these. Drives every other decision.",
  },
  {
    id: "error-budgets",
    category: "reliability",
    title: "Error budget tracking",
    status: "missing",
    priority: "P2",
    notes: "Once SLOs exist, track monthly burn. When budget exhausted, freeze new features. Google SRE playbook.",
  },
  {
    id: "retries-idempotent",
    category: "reliability",
    title: "Retries on idempotent operations (3x, exp backoff)",
    status: "partial",
    priority: "P1",
    notes: "Some external API calls retry. Standardize: any HTTP GET retries on 5xx; writes only if idempotency key present.",
  },
  {
    id: "idempotency-keys",
    category: "reliability",
    title: "Idempotency keys on critical mutations",
    status: "missing",
    priority: "P1",
    notes:
      "Payments, share-creation, agent-runs — duplicate POSTs must be safe. Stripe pattern: client-generated UUID stored in `idempotency_keys` table with response.",
  },
  {
    id: "error-reporting",
    category: "reliability",
    title: "Error reporter lib (admin/errors)",
    status: "done",
    priority: "P0",
    notes: "Built session 2026-05-09 v4. Captures server + client. Need Sentry/Datadog mirror for alerting + grouping.",
    ref: "/admin/errors",
  },
  {
    id: "sentry-or-datadog",
    category: "reliability",
    title: "Sentry or Datadog for production errors",
    status: "missing",
    priority: "P0",
    notes:
      "Internal /admin/errors is great for triage but lacks: source maps, release tagging, regression detection, alert rules. Sentry free tier covers us until ~10k events/mo.",
  },
  {
    id: "health-endpoint",
    category: "reliability",
    title: "/api/health endpoint with DB + AI provider probes",
    status: "missing",
    priority: "P0",
    notes:
      "Returns 200 only if DB query succeeds + Anthropic ping succeeds. Required for public status page and load balancer health checks.",
  },
  {
    id: "feature-killswitch",
    category: "reliability",
    title: "Kill-switch per feature flag (one-click disable)",
    status: "partial",
    priority: "P1",
    notes: "Feature flags exist. Verify every NEW feature ships behind a flag with a clear kill-switch path documented in launch runbook.",
  },
  {
    id: "rollback-plan",
    category: "reliability",
    title: "Documented rollback plan",
    status: "missing",
    priority: "P1",
    notes:
      "Vercel rollback is 1-click (instant rollback). For DB migrations, need: which migrations are reversible? Document in `/admin/database` per migration.",
  },
  {
    id: "incident-runbook",
    category: "reliability",
    title: "Incident response runbook",
    status: "missing",
    priority: "P1",
    notes:
      "Sev1/Sev2/Sev3 definitions, who pages whom, comms templates, post-mortem template. Cribbed from PagerDuty's open-source runbook is fine.",
  },

  // ── Observability ───────────────────────────────────────────────────
  {
    id: "logs-pipeline",
    category: "observability",
    title: "Centralized logs (admin/logs)",
    status: "done",
    priority: "P0",
    notes: "Logs flow into DB-backed admin dashboard. Add: streaming UI, faceted search, log retention.",
    ref: "/admin/logs",
  },
  {
    id: "metrics-pipeline",
    category: "observability",
    title: "Metrics pipeline (counters, histograms)",
    status: "missing",
    priority: "P1",
    notes:
      "No counter/histogram exporter. Options: Vercel Analytics (already paid) for high-level, OTel + Grafana Cloud free tier for custom.",
  },
  {
    id: "distributed-tracing",
    category: "observability",
    title: "Distributed tracing (OpenTelemetry)",
    status: "missing",
    priority: "P2",
    notes:
      'When a request fans out across 4 server actions + 2 RPCs, a trace makes the slow link obvious. Vercel ships OTel — enable, send to Grafana Tempo or Honeycomb.',
  },
  {
    id: "alerts-routing",
    category: "observability",
    title: "Alert routing (Slack/email/SMS) with severities",
    status: "missing",
    priority: "P0",
    notes:
      "Right now if production is on fire at 3am, nobody knows. Wire Sentry → Slack #incidents; Better Stack → SMS for P0.",
  },
  {
    id: "dashboard-suite",
    category: "observability",
    title: "Top-level health dashboard (req/s, error rate, p95, $/day)",
    status: "missing",
    priority: "P1",
    notes:
      "One page summarizing: traffic, error rate, p95 latency, daily AI spend, daily Paddle revenue. /admin/insights is close — finish it.",
  },
  {
    id: "audit-trail",
    category: "observability",
    title: "Admin actions are fully audited",
    status: "done",
    priority: "P0",
    notes: "audit-log table captures who/what/when. Verify EVERY admin _action calls audit().",
  },
  {
    id: "synthetic-monitoring",
    category: "observability",
    title: "Synthetic monitoring (Better Stack / Checkly)",
    status: "missing",
    priority: "P1",
    notes:
      "External monitor hitting /api/health + a login flow every 60s from 3 regions. Catches outages before users tweet at you. ~$10/mo.",
  },
  {
    id: "uptime-public",
    category: "observability",
    title: "Public status page (status.spacefield.co)",
    status: "missing",
    priority: "P1",
    notes:
      "Better Stack Uptime ($24/mo) or Atlassian Statuspage. Auto-generates from synthetic checks. Note: NOT this page — this page is internal.",
  },
  {
    id: "on-call",
    category: "observability",
    title: "On-call rotation + escalation policy",
    status: "missing",
    priority: "P2",
    notes:
      "Right now: Asad is paged 24/7 implicitly. Once team grows, PagerDuty or Better Stack On-Call ($5/user/mo). Define escalation: 5min → secondary, 15min → manager.",
  },
  {
    id: "log-retention",
    category: "observability",
    title: "Log retention 30d hot / 1y cold",
    status: "missing",
    priority: "P2",
    notes:
      "Postgres logs table will balloon. Move >30d to S3 Glacier (or just delete >90d). Configurable per category — errors longer than INFO.",
  },

  // ── DevOps / CI/CD ──────────────────────────────────────────────────
  {
    id: "git-deploy",
    category: "devops",
    title: "Git-push-to-deploy via Vercel",
    status: "done",
    priority: "P0",
    notes: "Push to main triggers prod deploy. Verified May 9.",
  },
  {
    id: "preview-envs",
    category: "devops",
    title: "Preview deployments per PR",
    status: "done",
    priority: "P1",
    notes: "Vercel default. Use them — every change gets a real URL.",
  },
  {
    id: "ci-tests",
    category: "devops",
    title: "Automated test suite (unit + e2e) in CI",
    status: "missing",
    priority: "P0",
    notes:
      "Currently: pre-push hook runs build. NO test suite. Add Vitest for libs + Playwright for 5 critical user flows (signup, share, agent chat, tool open, paddle checkout).",
  },
  {
    id: "type-check-ci",
    category: "devops",
    title: "TypeScript check + ESLint in CI (not just pre-push)",
    status: "partial",
    priority: "P1",
    notes: "Pre-push covers it locally. Add GitHub Action so PRs from other contributors also pass.",
  },
  {
    id: "env-management",
    category: "devops",
    title: "Env var management — prod/preview/dev separation",
    status: "partial",
    priority: "P1",
    notes: "Vercel env scopes exist. Audit: any preview deploys hitting production Supabase? Should hit staging.",
  },
  {
    id: "staging-env",
    category: "devops",
    title: "Dedicated staging environment",
    status: "missing",
    priority: "P1",
    notes:
      "Currently preview deploys = prod data. A real staging branch + staging Supabase project lets us do destructive testing. Free Supabase + Vercel project.",
  },
  {
    id: "iac",
    category: "devops",
    title: "Infrastructure as code (Terraform / Pulumi)",
    status: "missing",
    priority: "P3",
    notes:
      "Nice-to-have once team grows. For now Vercel + Supabase dashboards are fine. Critical settings (env vars, RLS) should be in repo as SQL/config.",
  },
  {
    id: "backup-config",
    category: "devops",
    title: "Backup of Vercel project settings + Supabase config",
    status: "missing",
    priority: "P2",
    notes:
      "If Vercel project gets deleted, can we rebuild? Export env vars, document custom domains, document Supabase project settings. JSON file in repo.",
  },
  {
    id: "deploy-gates",
    category: "devops",
    title: "Deploy gates (build passes + smoke test passes)",
    status: "partial",
    priority: "P1",
    notes: "Build gate exists. Add a Playwright smoke test in CI that runs against the preview URL before merge.",
  },
  {
    id: "release-notes",
    category: "devops",
    title: "Release notes / changelog automation",
    status: "missing",
    priority: "P2",
    notes: "Use Changesets or release-please. Auto-generated CHANGELOG.md from commits — public-facing changelog is GTM material.",
  },

  // ── Compliance & Legal ──────────────────────────────────────────────
  {
    id: "tos-page",
    category: "compliance",
    title: "Terms of Service page",
    status: "missing",
    priority: "P0",
    notes:
      "Termly or LinearLegal templates. Customized for UAE jurisdiction + AI-output disclaimers (we generate content). Required before paid users.",
  },
  {
    id: "privacy-page",
    category: "compliance",
    title: "Privacy Policy page",
    status: "missing",
    priority: "P0",
    notes: "GDPR + UAE PDPL compliant. Lists subprocessors (Supabase, Vercel, Paddle, Anthropic, OpenAI).",
  },
  {
    id: "dpa-template",
    category: "compliance",
    title: "DPA (Data Processing Agreement) template",
    status: "missing",
    priority: "P1",
    notes: "B2B buyers ask for this. Use the SCC-based template. Sign on request.",
  },
  {
    id: "cookie-consent",
    category: "compliance",
    title: "Cookie consent banner",
    status: "missing",
    priority: "P1",
    notes: "Required for EU traffic. CookieYes or open-source vanilla-cookieconsent. Block GA + Paddle until consent.",
  },
  {
    id: "gdpr-data-export",
    category: "compliance",
    title: "GDPR data-export self-service",
    status: "partial",
    priority: "P1",
    notes: "/admin/data-exports exists. User-facing 'Download my data' UI not built. Required: 30d response window by law.",
    ref: "/admin/data-exports",
  },
  {
    id: "gdpr-erasure",
    category: "compliance",
    title: "Right-to-erasure flow",
    status: "missing",
    priority: "P1",
    notes:
      "User clicks 'Delete account' → soft-delete + 30d grace + hard-delete cron. Audit log entry retained per legal-basis exception.",
  },
  {
    id: "subprocessors-list",
    category: "compliance",
    title: "Public subprocessors list (with notification on changes)",
    status: "missing",
    priority: "P2",
    notes: "Stripe-style page listing Supabase / Vercel / Anthropic / Paddle / etc. Update + email notify on changes.",
  },
  {
    id: "aup",
    category: "compliance",
    title: "Acceptable Use Policy",
    status: "missing",
    priority: "P2",
    notes:
      "What users CANNOT do with the platform (spam, illegal listings, prohibited AI use). Anthropic + OpenAI policies need to be passed through to end users.",
  },
  {
    id: "trust-center",
    category: "compliance",
    title: "Trust center page (security/compliance summary)",
    status: "missing",
    priority: "P2",
    notes: "Drata or Vanta auto-generate one. Or hand-roll: encryption-at-rest, in-transit, MFA, GDPR, subprocessors. B2B sales accelerator.",
  },
  {
    id: "uae-pdpl",
    category: "compliance",
    title: "UAE PDPL compliance review",
    status: "missing",
    priority: "P1",
    notes:
      "Federal Decree-Law No. 45 of 2021. Asad's primary market. Similar to GDPR but distinct in localization and consent rules. Pay a UAE lawyer 1 hour to review.",
  },

  // ── CX ──────────────────────────────────────────────────────────────
  {
    id: "onboarding-flow",
    category: "cx",
    title: "Onboarding flow + product tours",
    status: "done",
    priority: "P1",
    notes: "Onboarding + tours sections live in admin.",
    ref: "/admin/onboarding",
  },
  {
    id: "help-center",
    category: "cx",
    title: "Help center / knowledge base content",
    status: "partial",
    priority: "P1",
    notes: "Admin section exists; need 30-50 actual articles. Writing is the bottleneck, not the system.",
    ref: "/admin/help",
  },
  {
    id: "in-app-support",
    category: "cx",
    title: "In-app support inbox + ticket triage",
    status: "done",
    priority: "P1",
    notes: "Support inbox shipped. Need SLA targets — first response <4h business hours.",
    ref: "/admin/support",
  },
  {
    id: "live-chat",
    category: "cx",
    title: "Live chat widget (Crisp / Intercom)",
    status: "missing",
    priority: "P2",
    notes: "Crisp free tier covers up to 2 agents. Useful for first-100-customers feedback funnel. Self-rolled chat = scope creep.",
  },
  {
    id: "email-deliverability",
    category: "cx",
    title: "Email deliverability (SPF/DKIM/DMARC + warm-up)",
    status: "missing",
    priority: "P0",
    notes:
      "Verify SPF/DKIM/DMARC on the sending domain. Cold IPs need 4-6 weeks of warming via Mailwarm/Postmark. If first marketing blast goes to spam, launch is dead.",
  },
  {
    id: "transactional-email",
    category: "cx",
    title: "Transactional email provider (Postmark/Resend)",
    status: "missing",
    priority: "P0",
    notes:
      "What sends signup OTPs, paddle receipts, reset-password? If Supabase default — fine for tiny scale, but no template control. Postmark or Resend ($10/mo).",
  },
  {
    id: "user-changelog",
    category: "cx",
    title: "User-facing changelog (what's new)",
    status: "missing",
    priority: "P2",
    notes: "/changelog page rendered from CHANGELOG.md or a Notion DB. Drives feature awareness for existing users.",
  },
  {
    id: "feedback-widget",
    category: "cx",
    title: "Feedback widget (Canny-style)",
    status: "missing",
    priority: "P2",
    notes: "Lets users upvote requests. Self-host with Featurebase or build on top of existing /admin/surveys.",
  },
  {
    id: "empty-states",
    category: "cx",
    title: "Empty-state copy + illustrations on every list view",
    status: "partial",
    priority: "P2",
    notes: 'Many admin tables read "No rows" — fine for admin. User-facing tools (CRM contacts, files) should onboard via empty state.',
  },
  {
    id: "error-pages",
    category: "cx",
    title: "Branded 404 + 500 error pages",
    status: "partial",
    priority: "P2",
    notes: "Default Next.js error UI. Replace with branded versions including a 'report this' link.",
  },

  // ── Business / GTM ─────────────────────────────────────────────────
  {
    id: "pricing-page",
    category: "gtm",
    title: "Pricing page",
    status: "done",
    priority: "P0",
    notes: "Pricing redesign shipped Apr 28.",
  },
  {
    id: "paddle-checkout",
    category: "gtm",
    title: "Paddle checkout + webhook handling",
    status: "partial",
    priority: "P0",
    notes:
      "Wired. Edge cases: failed renewals, chargebacks, manual refunds. Spot-check by issuing 1 refund through /admin/refunds end-to-end.",
  },
  {
    id: "usage-billing",
    category: "gtm",
    title: "Usage-based billing for AI tokens (over-limit)",
    status: "missing",
    priority: "P2",
    notes: "If a user blows past their AI quota, do we throttle or auto-charge? Decide. Paddle metered billing supports both.",
  },
  {
    id: "annual-billing",
    category: "gtm",
    title: "Annual billing option (with discount)",
    status: "missing",
    priority: "P2",
    notes: "20% annual discount = standard. Improves cash flow + retention 30%. Paddle one-line config.",
  },
  {
    id: "referral-program",
    category: "gtm",
    title: "Referral program",
    status: "partial",
    priority: "P2",
    notes: "Coupons & referrals admin section exists. User-facing 'invite a friend, both get 1 month free' flow not built.",
    ref: "/admin/coupons",
  },
  {
    id: "public-roadmap",
    category: "gtm",
    title: "Public roadmap",
    status: "missing",
    priority: "P2",
    notes: "Productboard, Canny, or a simple `/roadmap` page. Sets expectations + reduces support inbox.",
  },
  {
    id: "launch-comms",
    category: "gtm",
    title: "Launch comms plan (ProductHunt, Twitter, press)",
    status: "missing",
    priority: "P1",
    notes:
      "ProductHunt PT-launch checklist (hunter, gallery assets, first-5-comments primed). Twitter announcement thread. UAE press contacts.",
  },
  {
    id: "press-kit",
    category: "gtm",
    title: "Press kit + brand assets page",
    status: "missing",
    priority: "P2",
    notes: "/press: logos in 3 formats, screenshots, founder bio, factsheet. Journalists ask for it; not having it = lost coverage.",
  },
  {
    id: "analytics-funnel",
    category: "gtm",
    title: "End-to-end conversion funnel analytics",
    status: "partial",
    priority: "P1",
    notes: "Funnels admin section exists. Need: landing → signup → activation → paid. Bottlenecks → growth bets.",
    ref: "/admin/funnels",
  },
  {
    id: "public-api",
    category: "gtm",
    title: "Public API + developer docs",
    status: "missing",
    priority: "P3",
    notes: "API tokens admin exists. Docs page + OpenAPI spec + sandbox would unlock integrations. Post-launch.",
  },

  // ── Mobile ──────────────────────────────────────────────────────────
  {
    id: "responsive-web",
    category: "mobile",
    title: "Responsive web (phone + tablet)",
    status: "partial",
    priority: "P0",
    notes:
      "Apr 27 mobile redesign verified for main app. Tools surface mostly works. Final audit on /admin (likely cramped on phone) + /community feeds.",
  },
  {
    id: "pwa",
    category: "mobile",
    title: "Installable PWA (add-to-home-screen)",
    status: "missing",
    priority: "P2",
    notes: "manifest.json + service worker. Cheap win — gives mobile users an app icon without an App Store review.",
  },
  {
    id: "push-web",
    category: "mobile",
    title: "Web push notifications",
    status: "partial",
    priority: "P2",
    notes:
      "Push campaigns admin section exists. Service worker + VAPID + actual user opt-in flow needs verification.",
    ref: "/admin/push",
  },
  {
    id: "native-app",
    category: "mobile",
    title: "Native iOS + Android apps",
    status: "partial",
    priority: "P2",
    notes:
      "Separate Flutter project tracked in personal memory. 15 tools done. Decide: ship-as-PWA-first then native v2, or block launch on native parity.",
  },
  {
    id: "offline-mode",
    category: "mobile",
    title: "Offline mode (key tools)",
    status: "missing",
    priority: "P3",
    notes: "PWA + IndexedDB. Property Poster + Pricing Calc could work offline with last-known templates.",
  },
  {
    id: "a11y-audit",
    category: "mobile",
    title: "Accessibility audit (WCAG 2.1 AA)",
    status: "missing",
    priority: "P1",
    notes:
      "axe DevTools sweep + manual keyboard nav check. Required for govt + enterprise sales; also good karma. Common misses: focus rings, alt text, color contrast.",
  },

  // ── Launch readiness ────────────────────────────────────────────────
  {
    id: "launch-runbook",
    category: "launch",
    title: "Launch runbook (T-7 to T+7 day plan)",
    status: "missing",
    priority: "P0",
    notes:
      "What we deploy and when, who's on-call, comms timeline, war-room channel, rollback triggers, success metrics. One Notion doc. Reviewed in a tabletop exercise.",
  },
  {
    id: "war-room",
    category: "launch",
    title: "War-room channel + comms primed",
    status: "missing",
    priority: "P1",
    notes: "#launch-warroom in Slack or Discord. Status page admin access. Twitter login on standby for outage tweet.",
  },
  {
    id: "tabletop-drill",
    category: "launch",
    title: "Tabletop incident drill",
    status: "missing",
    priority: "P1",
    notes:
      "Walk through 3 scenarios: DB outage, AI provider outage, payment provider outage. Verify everyone knows their role. 1 hour exercise.",
  },
  {
    id: "dns-ttl-drop",
    category: "launch",
    title: "Drop DNS TTLs to 60s pre-launch",
    status: "missing",
    priority: "P2",
    notes: "Gives faster failover if we need to point away from a degraded edge. Restore to 1h post-launch.",
  },
  {
    id: "scale-up-capacity",
    category: "launch",
    title: "Pre-scale Supabase compute + Vercel plan",
    status: "missing",
    priority: "P1",
    notes: "Before launch day: bump Supabase compute add-on one tier. Saves a 5-minute restart-during-spike.",
  },
  {
    id: "social-pre-launch",
    category: "launch",
    title: "Pre-launch waitlist + email primed",
    status: "missing",
    priority: "P2",
    notes:
      "Waitlist page collecting emails to warm a launch list. Even 500 pre-registered users → 200 sign-ups on day 1.",
  },
  {
    id: "kpi-baseline",
    category: "launch",
    title: "KPI dashboard for launch week",
    status: "missing",
    priority: "P1",
    notes:
      "Signups/hour, activation rate, paid-conversion, error rate, AI cost. One page, refreshed every 5 minutes during launch week.",
  },
  {
    id: "support-staffing",
    category: "launch",
    title: "Support coverage plan (launch week)",
    status: "missing",
    priority: "P1",
    notes: "Who covers support 9-9 in launch week? Canned responses to top 10 expected questions ready.",
  },
  {
    id: "rollback-trigger",
    category: "launch",
    title: "Pre-defined rollback triggers",
    status: "missing",
    priority: "P0",
    notes: "If error rate >5%, p95 >3s, or AI cost >$100/hr → automatic rollback. Document the numbers BEFORE launch, not during.",
  },
  {
    id: "post-mortem-template",
    category: "launch",
    title: "Post-mortem template + cadence",
    status: "missing",
    priority: "P2",
    notes: "Blameless template (PagerDuty's is open-source). Run within 48h of any Sev1/Sev2. Action items tracked.",
  },
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

/** Tailwind class fragments — used in badges. Match the admin token set. */
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

/** Counts per status for the whole list or a filtered slice. */
export function tally(items: Item[]): Record<Status, number> & { total: number } {
  const out: Record<Status, number> & { total: number } = {
    done: 0, partial: 0, missing: 0, blocked: 0, na: 0, total: 0,
  };
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
  const score = counted.reduce((s, i) => s + (i.status === "done" ? 1 : i.status === "partial" ? 0.5 : 0), 0);
  return Math.round((score / counted.length) * 100);
}

export function byCategory(catId: CategoryId, items: Item[] = CHECKLIST): Item[] {
  return items.filter((i) => i.category === catId);
}
