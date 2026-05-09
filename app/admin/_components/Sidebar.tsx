"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; group?: string };

// Nav grouped by purpose. v3 layout — every section the platform-control
// panel needs.
const NAV: NavItem[] = [
  { href: "/admin",                label: "Dashboard" },
  { href: "/admin/search",         label: "Search" },
  { href: "/admin/activity",       label: "Activity" },

  // Platform — apps, AI agents, models, providers, skills, workflows, prompts
  { href: "/admin/apps",           label: "Apps & Features",   group: "Platform" },
  { href: "/admin/features",       label: "Feature flags",     group: "Platform" },
  { href: "/admin/agents",         label: "AI agents",         group: "Platform" },
  { href: "/admin/skills",         label: "Skills",            group: "Platform" },
  { href: "/admin/tools-catalog",  label: "Tool catalog",      group: "Platform" },
  { href: "/admin/models",         label: "Models",            group: "Platform" },
  { href: "/admin/providers",      label: "Providers (API keys)", group: "Platform" },
  { href: "/admin/workflows",      label: "Workflows",         group: "Platform" },
  { href: "/admin/prompts",        label: "Prompt library",    group: "Platform" },
  { href: "/admin/integrations",   label: "Integrations",      group: "Platform" },

  // People
  { href: "/admin/users",          label: "Users",             group: "People" },
  { href: "/admin/workspaces",     label: "Workspaces",        group: "People" },
  { href: "/admin/subscriptions",  label: "Subscriptions",     group: "People" },
  { href: "/admin/tiers",          label: "Tiers",             group: "People" },
  { href: "/admin/api-tokens",     label: "API tokens",        group: "People" },
  { href: "/admin/coupons",        label: "Coupons & referrals", group: "People" },
  { href: "/admin/cohorts",        label: "Cohorts",           group: "People" },

  // Ops — logs/audit/auth-events/jobs/webhooks/alerts/etc
  { href: "/admin/logs",           label: "Logs",              group: "Ops" },
  { href: "/admin/audit",          label: "Audit log",         group: "Ops" },
  { href: "/admin/auth-events",    label: "Sign-ins",          group: "Ops" },
  { href: "/admin/errors",         label: "Errors",            group: "Ops" },
  { href: "/admin/insights",       label: "Cost & insights",   group: "Ops" },
  { href: "/admin/analytics",      label: "Share analytics", group: "Ops" },
  { href: "/admin/funnels",        label: "Funnels",           group: "Ops" },
  { href: "/admin/jobs",           label: "Jobs & cron",       group: "Ops" },
  { href: "/admin/webhooks",       label: "Webhooks",          group: "Ops" },
  { href: "/admin/alerts",         label: "Alerts",            group: "Ops" },
  { href: "/admin/storage",        label: "Storage",           group: "Ops" },
  { href: "/admin/database",       label: "Database",          group: "Ops" },
  { href: "/admin/backups",        label: "Backups",           group: "Ops" },
  { href: "/admin/domains",        label: "Domains",           group: "Ops" },

  // Security
  { href: "/admin/security",       label: "Security policies", group: "Security" },
  { href: "/admin/rate-limits",    label: "Rate limits",       group: "Security" },
  { href: "/admin/ip-rules",       label: "IP rules",          group: "Security" },
  { href: "/admin/sso",            label: "SSO",               group: "Security" },
  { href: "/admin/moderation",     label: "Content moderation", group: "Security" },
  { href: "/admin/data-exports",   label: "Data exports (GDPR)", group: "Security" },

  // Communication
  { href: "/admin/emails",         label: "Email templates",   group: "Communication" },
  { href: "/admin/banners",        label: "Site banners",      group: "Communication" },
  { href: "/admin/announcements",  label: "Announcements",     group: "Communication" },
  { href: "/admin/push",           label: "Push campaigns",    group: "Communication" },
  { href: "/admin/messages",       label: "Messages",          group: "Communication" },

  // Branding & Customization
  { href: "/admin/branding",       label: "Branding",          group: "Customization" },
  { href: "/admin/locales",        label: "Locales",           group: "Customization" },
  { href: "/admin/maintenance",    label: "Maintenance mode",  group: "Customization" },

  // AI Quality
  { href: "/admin/eval",           label: "Eval suites",       group: "AI Quality" },

  // Content
  { href: "/admin/social",         label: "Social",            group: "Content" },
  { href: "/admin/wallpapers",     label: "Wallpapers",        group: "Content" },
  // Legacy single-tool toggle UI — kept for backward compat.
  { href: "/admin/tools",          label: "Tools (legacy)",    group: "Content" },
];

export default function Sidebar() {
  const pathname = usePathname() ?? "";

  // Group items in the order they first appear in NAV.
  const groups: { name: string | undefined; items: NavItem[] }[] = [];
  for (const item of NAV) {
    let bucket = groups.find((g) => g.name === item.group);
    if (!bucket) {
      bucket = { name: item.group, items: [] };
      groups.push(bucket);
    }
    bucket.items.push(item);
  }

  const isActive = (href: string) =>
    href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.name ?? "_root"} className="flex flex-col gap-0.5">
          {g.name && (
            <div className="px-3 pb-1 pt-2 text-[0.55rem] uppercase tracking-[0.2em] text-faint">
              {g.name}
            </div>
          )}
          {g.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "rounded-lg px-3 py-2 text-sm transition-colors",
                isActive(item.href)
                  ? "bg-tool-accent-soft text-tool-accent font-medium"
                  : "text-secondary hover:bg-app-elevated hover:text-app",
              ].join(" ")}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
