"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV, currentSection, isHrefActive } from "./_nav";

/**
 * Section-scoped sidebar. Shows ONLY the items belonging to the
 * currently-active top-level section so the list never grows past one
 * screen. Active section is derived from the URL via `currentSection`.
 *
 * Pinned items (Dashboard / Search / Activity) live in the Header,
 * not here.
 */
export default function Sidebar() {
  const pathname = usePathname() ?? "";
  const active = currentSection(pathname);
  const items = NAV.filter((n) => !n.pinned && n.section === active);

  return (
    <nav className="flex flex-col gap-0.5" aria-label={`${active} navigation`}>
      <div className="px-3 pb-2 pt-1 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {active}
      </div>
      {items.map((item) => {
        const isActive = isHrefActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "rounded-lg px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-tool-accent-soft text-tool-accent font-medium"
                : "text-secondary hover:bg-app-elevated hover:text-app",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
