"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import FeedbackButton from "@/components/FeedbackButton";
import NotificationBell from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";

import { NAV, SECTIONS, currentSection, isHrefActive } from "./_nav";

/**
 * Top admin chrome: brand + section tabs + pinned utility links.
 * The active section is derived from the current pathname so deep
 * routes like `/admin/agents/abc/playground` correctly highlight
 * "Platform".
 */
export default function Header({ email }: { email?: string | null }) {
  const pathname = usePathname() ?? "";
  const active = currentSection(pathname);
  const pinned = NAV.filter((n) => n.pinned);

  return (
    <header className="sticky top-0 z-30 border-b border-app bg-app/85 backdrop-blur supports-[backdrop-filter]:bg-app/70">
      {/* Row 1 — brand + section tabs + utility */}
      <div className="flex h-12 items-center gap-6 px-6">
        {/* Brand — static label only. Use the "Dashboard" pinned link in
            row 2 to navigate to /admin (avoids redundant click targets). */}
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-app">
          <span className="rounded-md bg-tool-accent-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-tool-accent">
            Admin
          </span>
          <span className="hidden text-xs text-muted sm:inline">Space Field</span>
        </div>

        {/* Section tabs */}
        <nav
          aria-label="Admin sections"
          className="flex flex-1 items-center gap-1 overflow-x-auto"
        >
          {SECTIONS.map((s) => {
            const isActive = active === s;
            return (
              <Link
                key={s}
                href={firstHrefOfSection(s)}
                className={[
                  "shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-tool-accent-soft text-tool-accent font-medium"
                    : "text-secondary hover:bg-app-elevated hover:text-app",
                ].join(" ")}
              >
                {s}
              </Link>
            );
          })}
        </nav>

        {/* Identity + theme + feedback + notifications + exit */}
        <div className="hidden items-center gap-3 text-xs text-muted md:flex">
          <FeedbackButton />
          <ThemeToggle />
          <span className="font-mono tabular-nums">{email ?? "—"}</span>
          {email ? <NotificationBell /> : null}
          <Link href="/" className="text-secondary hover:text-tool-accent">
            Exit
          </Link>
        </div>
      </div>

      {/* Row 2 — pinned utility links */}
      <div className="flex h-9 items-center gap-3 px-6 text-xs">
        {pinned.map((p) => {
          const isActive = isHrefActive(pathname, p.href);
          return (
            <Link
              key={p.href}
              href={p.href}
              className={[
                "rounded px-2 py-1 transition-colors",
                isActive
                  ? "text-tool-accent font-medium"
                  : "text-secondary hover:text-app",
              ].join(" ")}
            >
              {p.label}
            </Link>
          );
        })}
        <span className="ml-auto text-faint">{labelForSection(active)}</span>
      </div>
    </header>
  );
}

/** First non-pinned href in a section — landing page when admin clicks
 * the section tab. */
function firstHrefOfSection(section: string): string {
  const first = NAV.find((n) => !n.pinned && n.section === section);
  return first?.href ?? "/admin";
}

function labelForSection(section: string): string {
  const count = NAV.filter((n) => !n.pinned && n.section === section).length;
  return `${section} · ${count} sections`;
}
