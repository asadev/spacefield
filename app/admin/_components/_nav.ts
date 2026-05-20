/**
 * Admin nav source of truth — used by both the top Header (sections)
 * and the left Sidebar (current section's items).
 *
 * Sections grouped by TOPIC, not by historical commit order:
 *   - AI:            everything AI (agents/skills/tools/models/
 *                    providers/workflows/prompts/eval/playground)
 *   - Apps:          app registry, feature flags, integrations
 *   - People:        users, workspaces, subscriptions, tiers, tokens,
 *                    coupons, cohorts
 *   - Data & Ops:    logs, audit, errors, insights, analytics, funnels,
 *                    jobs, webhooks, alerts, storage, database, backups,
 *                    domains
 *   - Security:      policies, rate-limits, ip-rules, sso, moderation,
 *                    data-exports, sign-ins
 *   - Communication: emails, banners, announcements, push, messages,
 *                    support
 *   - Experience:    branding, locales, maintenance, onboarding, tours,
 *                    help center, surveys
 *   - Money:         refunds, invoices
 *   - Content:       social, wallpapers, tools (legacy)
 */

export type NavSection =
  | "Dashboard"
  | "AI"
  | "Apps"
  | "People"
  | "Data & Ops"
  | "Security"
  | "Communication"
  | "Experience"
  | "Money"
  | "Content";

export interface NavItem {
  href: string;
  label: string;
  section: NavSection;
  /** Pinned items show in the Header instead of in a section's sidebar. */
  pinned?: boolean;
}

export const NAV: NavItem[] = [
  // Header-pinned utilities
  { href: "/admin",                label: "Dashboard",                section: "Dashboard", pinned: true },
  { href: "/admin/search",         label: "Search",                   section: "Dashboard", pinned: true },
  { href: "/admin/activity",       label: "Activity",                 section: "Dashboard", pinned: true },
  { href: "/admin/status",         label: "Status",                   section: "Dashboard", pinned: true },

  // ── AI ── everything that powers the AI runtime
  { href: "/admin/agents",         label: "AI agents",                section: "AI" },
  { href: "/admin/skills",         label: "Skills",                   section: "AI" },
  { href: "/admin/tools-catalog",  label: "Tool catalog",             section: "AI" },
  { href: "/admin/models",         label: "Models",                   section: "AI" },
  { href: "/admin/providers",      label: "Providers (API keys)",     section: "AI" },
  { href: "/admin/workflows",      label: "Workflows",                section: "AI" },
  { href: "/admin/workflows/builder", label: "Workflow builder (V2)", section: "AI" },
  { href: "/admin/prompts",        label: "Prompt library",           section: "AI" },
  { href: "/admin/eval",           label: "Eval suites",              section: "AI" },
  { href: "/admin/playground",     label: "Playground",               section: "AI" },

  // ── Apps ── what the platform exposes to users
  { href: "/admin/apps",           label: "Apps & Features",          section: "Apps" },
  { href: "/admin/features",       label: "Feature flags",            section: "Apps" },
  { href: "/admin/integrations",   label: "Integrations",             section: "Apps" },
  { href: "/admin/pages",          label: "Custom pages",             section: "Apps" },
  { href: "/admin/templates",      label: "Workspace templates",      section: "Apps" },
  { href: "/admin/tasks",          label: "Tasks",                    section: "Apps" },

  // ── People ──
  { href: "/admin/users",          label: "Users",                    section: "People" },
  { href: "/admin/workspaces",     label: "Workspaces",               section: "People" },
  { href: "/admin/roles",          label: "Roles & permissions",      section: "People" },
  { href: "/admin/subscriptions",  label: "Subscriptions",            section: "People" },
  { href: "/admin/tiers",          label: "Tiers",                    section: "People" },
  { href: "/admin/api-tokens",     label: "API tokens",               section: "People" },
  { href: "/admin/coupons",        label: "Coupons & referrals",      section: "People" },
  { href: "/admin/cohorts",        label: "Cohorts",                  section: "People" },
  { href: "/admin/people",         label: "Employees (HR)",           section: "People" },
  { href: "/admin/people/policies", label: "Time-off policies",       section: "People" },
  { href: "/admin/people/onboarding", label: "Onboarding templates",  section: "People" },
  { href: "/admin/waitlist",       label: "Waitlist signups",         section: "People" },

  // ── Data & Ops ── observability + infra
  { href: "/admin/logs",           label: "Logs",                     section: "Data & Ops" },
  { href: "/admin/audit",          label: "Audit log",                section: "Data & Ops" },
  { href: "/admin/errors",         label: "Errors",                   section: "Data & Ops" },
  { href: "/admin/insights",       label: "Cost & insights",          section: "Data & Ops" },
  { href: "/admin/insights/health", label: "Health",                  section: "Data & Ops" },
  { href: "/admin/insights/ai-costs", label: "AI costs",              section: "Data & Ops" },
  { href: "/admin/insights/latency", label: "API latency",            section: "Data & Ops" },
  { href: "/admin/insights/slow-queries", label: "Slow queries",      section: "Data & Ops" },
  { href: "/admin/insights/reports", label: "Cross-tool reports",     section: "Data & Ops" },
  { href: "/admin/analytics",      label: "Share analytics",        section: "Data & Ops" },
  { href: "/admin/funnels",        label: "Funnels",                  section: "Data & Ops" },
  { href: "/admin/jobs",           label: "Jobs & cron",              section: "Data & Ops" },
  { href: "/admin/webhooks",       label: "Webhooks",                 section: "Data & Ops" },
  { href: "/admin/alerts",         label: "Alerts",                   section: "Data & Ops" },
  { href: "/admin/storage",        label: "Storage",                  section: "Data & Ops" },
  { href: "/admin/database",       label: "Database",                 section: "Data & Ops" },
  { href: "/admin/runtime-config", label: "Runtime config",           section: "Data & Ops" },
  { href: "/admin/backups",        label: "Backups",                  section: "Data & Ops" },
  { href: "/admin/domains",        label: "Domains",                  section: "Data & Ops" },

  // ── Security ──
  { href: "/admin/security",       label: "Security policies",        section: "Security" },
  { href: "/admin/rate-limits",    label: "Rate limits",              section: "Security" },
  { href: "/admin/ip-rules",       label: "IP rules",                 section: "Security" },
  { href: "/admin/sso",            label: "SSO",                      section: "Security" },
  { href: "/admin/moderation",     label: "Content moderation",       section: "Security" },
  { href: "/admin/data-exports",   label: "Data exports (GDPR)",      section: "Security" },
  { href: "/admin/auth-events",    label: "Sign-ins",                 section: "Security" },

  // ── Communication ──
  { href: "/admin/emails",         label: "Email templates",          section: "Communication" },
  { href: "/admin/banners",        label: "Site banners",             section: "Communication" },
  { href: "/admin/announcements",  label: "Announcements",            section: "Communication" },
  { href: "/admin/push",           label: "Push campaigns",           section: "Communication" },
  { href: "/admin/messages",       label: "Messages",                 section: "Communication" },
  { href: "/admin/support",        label: "Support inbox",            section: "Communication" },

  // ── Experience ── branding, content, customer journey
  { href: "/admin/branding",       label: "Branding",                 section: "Experience" },
  { href: "/admin/locales",        label: "Locales",                  section: "Experience" },
  { href: "/admin/maintenance",    label: "Maintenance mode",         section: "Experience" },
  { href: "/admin/onboarding",     label: "Onboarding",               section: "Experience" },
  { href: "/admin/tours",          label: "Product tours",            section: "Experience" },
  { href: "/admin/help",           label: "Help center",              section: "Experience" },
  { href: "/admin/surveys",        label: "Surveys & NPS",            section: "Experience" },

  // ── Money ──
  { href: "/admin/refunds",        label: "Refunds",                  section: "Money" },
  { href: "/admin/invoices",       label: "Invoices",                 section: "Money" },

  // ── Content ──
  { href: "/admin/social",         label: "Social",                   section: "Content" },
  { href: "/admin/wallpapers",     label: "Wallpapers",               section: "Content" },
  // Legacy single-tool toggle UI — kept for backward compat.
  { href: "/admin/tools",          label: "Tools (legacy)",           section: "Content" },
];

/** Top-level sections shown in the Header (in order). Excludes
 * Dashboard which renders as pinned items separately. */
export const SECTIONS: NavSection[] = [
  "AI",
  "Apps",
  "People",
  "Data & Ops",
  "Security",
  "Communication",
  "Experience",
  "Money",
  "Content",
];

/**
 * Given the current pathname, figure out which section is active.
 * Longest-prefix match across non-pinned items. Falls back to AI
 * (the most likely landing place from /admin).
 */
export function currentSection(pathname: string): NavSection {
  let bestMatch: { len: number; section: NavSection } | null = null;
  for (const item of NAV) {
    if (item.pinned) continue;
    if (item.href === "/admin") continue;
    if (pathname === item.href || pathname.startsWith(item.href + "/")) {
      if (!bestMatch || item.href.length > bestMatch.len) {
        bestMatch = { len: item.href.length, section: item.section };
      }
    }
  }
  return bestMatch?.section ?? "AI";
}

/** True if the given href is the active route (or a parent of it). */
export function isHrefActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}
