/**
 * Admin nav source of truth — used by both the top Header (sections)
 * and the left Sidebar (current section's items).
 *
 * Single config keeps Header + Sidebar in sync. Add a new admin route by
 * adding a NavItem with the section it belongs to.
 */

export type NavSection =
  | "Dashboard"
  | "Platform"
  | "People"
  | "Ops"
  | "Security"
  | "Communication"
  | "Customization"
  | "AI Quality"
  | "Billing"
  | "Content";

export interface NavItem {
  href: string;
  label: string;
  /**
   * Section the item belongs to. Items with the same section show
   * together in the left Sidebar when that section is active in the
   * top Header.
   */
  section: NavSection;
  /**
   * Pinned items show in the Header instead of (or in addition to)
   * being inside a section's sidebar. Useful for Dashboard / Search /
   * Activity that admins jump to from any section.
   */
  pinned?: boolean;
}

export const NAV: NavItem[] = [
  // Header-pinned utilities
  { href: "/admin",                label: "Dashboard",                section: "Dashboard", pinned: true },
  { href: "/admin/search",         label: "Search",                   section: "Dashboard", pinned: true },
  { href: "/admin/activity",       label: "Activity",                 section: "Dashboard", pinned: true },

  // Platform — apps, AI agents, models, providers, skills, workflows, prompts
  { href: "/admin/apps",           label: "Apps & Features",          section: "Platform" },
  { href: "/admin/features",       label: "Feature flags",            section: "Platform" },
  { href: "/admin/agents",         label: "AI agents",                section: "Platform" },
  { href: "/admin/skills",         label: "Skills",                   section: "Platform" },
  { href: "/admin/tools-catalog",  label: "Tool catalog",             section: "Platform" },
  { href: "/admin/models",         label: "Models",                   section: "Platform" },
  { href: "/admin/providers",      label: "Providers (API keys)",     section: "Platform" },
  { href: "/admin/workflows",      label: "Workflows",                section: "Platform" },
  { href: "/admin/prompts",        label: "Prompt library",           section: "Platform" },
  { href: "/admin/integrations",   label: "Integrations",             section: "Platform" },

  // People
  { href: "/admin/users",          label: "Users",                    section: "People" },
  { href: "/admin/workspaces",     label: "Workspaces",               section: "People" },
  { href: "/admin/subscriptions",  label: "Subscriptions",            section: "People" },
  { href: "/admin/tiers",          label: "Tiers",                    section: "People" },
  { href: "/admin/api-tokens",     label: "API tokens",               section: "People" },
  { href: "/admin/coupons",        label: "Coupons & referrals",      section: "People" },
  { href: "/admin/cohorts",        label: "Cohorts",                  section: "People" },

  // Ops — observability, infra, data
  { href: "/admin/logs",           label: "Logs",                     section: "Ops" },
  { href: "/admin/audit",          label: "Audit log",                section: "Ops" },
  { href: "/admin/auth-events",    label: "Sign-ins",                 section: "Ops" },
  { href: "/admin/errors",         label: "Errors",                   section: "Ops" },
  { href: "/admin/insights",       label: "Cost & insights",          section: "Ops" },
  { href: "/admin/analytics",      label: "Share analytics",        section: "Ops" },
  { href: "/admin/funnels",        label: "Funnels",                  section: "Ops" },
  { href: "/admin/jobs",           label: "Jobs & cron",              section: "Ops" },
  { href: "/admin/webhooks",       label: "Webhooks",                 section: "Ops" },
  { href: "/admin/alerts",         label: "Alerts",                   section: "Ops" },
  { href: "/admin/storage",        label: "Storage",                  section: "Ops" },
  { href: "/admin/database",       label: "Database",                 section: "Ops" },
  { href: "/admin/backups",        label: "Backups",                  section: "Ops" },
  { href: "/admin/domains",        label: "Domains",                  section: "Ops" },

  // Security
  { href: "/admin/security",       label: "Security policies",        section: "Security" },
  { href: "/admin/rate-limits",    label: "Rate limits",              section: "Security" },
  { href: "/admin/ip-rules",       label: "IP rules",                 section: "Security" },
  { href: "/admin/sso",            label: "SSO",                      section: "Security" },
  { href: "/admin/moderation",     label: "Content moderation",       section: "Security" },
  { href: "/admin/data-exports",   label: "Data exports (GDPR)",      section: "Security" },

  // Communication
  { href: "/admin/emails",         label: "Email templates",          section: "Communication" },
  { href: "/admin/banners",        label: "Site banners",             section: "Communication" },
  { href: "/admin/announcements",  label: "Announcements",            section: "Communication" },
  { href: "/admin/push",           label: "Push campaigns",           section: "Communication" },
  { href: "/admin/messages",       label: "Messages",                 section: "Communication" },
  { href: "/admin/support",        label: "Support inbox",            section: "Communication" },
  { href: "/admin/help",           label: "Help center",              section: "Communication" },
  { href: "/admin/onboarding",     label: "Onboarding",               section: "Communication" },
  { href: "/admin/tours",          label: "Product tours",            section: "Communication" },
  { href: "/admin/surveys",        label: "Surveys & NPS",            section: "Communication" },

  // Customization
  { href: "/admin/branding",       label: "Branding",                 section: "Customization" },
  { href: "/admin/locales",        label: "Locales",                  section: "Customization" },
  { href: "/admin/maintenance",    label: "Maintenance mode",         section: "Customization" },

  // AI Quality
  { href: "/admin/eval",           label: "Eval suites",              section: "AI Quality" },
  { href: "/admin/playground",     label: "AI playground",            section: "AI Quality" },

  // Billing
  { href: "/admin/refunds",        label: "Refunds",                  section: "Billing" },
  { href: "/admin/invoices",       label: "Invoices",                 section: "Billing" },

  // Content
  { href: "/admin/social",         label: "Social",                   section: "Content" },
  { href: "/admin/wallpapers",     label: "Wallpapers",               section: "Content" },
  // Legacy single-tool toggle UI — kept for backward compat.
  { href: "/admin/tools",          label: "Tools (legacy)",           section: "Content" },
];

/** Top-level sections shown in the Header (in order). Excludes
 * Dashboard which is rendered as pinned items separately. */
export const SECTIONS: NavSection[] = [
  "Platform",
  "People",
  "Ops",
  "Security",
  "Communication",
  "Customization",
  "AI Quality",
  "Billing",
  "Content",
];

/**
 * Given the current pathname, figure out which top-level section is
 * active. We pick the LONGEST href prefix-match across non-pinned items
 * so that nested routes like `/admin/agents/abc/playground` correctly
 * highlight the "Platform" tab.
 *
 * Falls back to the first section if no match.
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
  return bestMatch?.section ?? "Platform";
}

/**
 * True if the given href is the active route (or a parent of it).
 * `/admin` only matches exact since otherwise it'd match every admin
 * route.
 */
export function isHrefActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}
