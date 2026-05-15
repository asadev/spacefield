"use client";

/* InboxTabs — client-side tab strip for the /inbox page.
 *
 * Switching tabs updates the `tab` query param via next/navigation, so
 * the server-side page re-renders with the right filter applied. Keeps
 * the page itself a Server Component for simplicity.
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type InboxTab = "all" | "unread" | "mentions" | "assignments" | "system";

const TABS: Array<{ id: InboxTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "mentions", label: "@Mentions" },
  { id: "assignments", label: "Assignments" },
  { id: "system", label: "System" },
];

export default function InboxTabs({ active }: { active: InboxTab }) {
  const pathname = usePathname() ?? "/inbox";
  const sp = useSearchParams();
  const base = sp ? new URLSearchParams(sp.toString()) : new URLSearchParams();

  return (
    <nav
      aria-label="Inbox tabs"
      className="flex flex-wrap items-center gap-1 border-b border-app"
    >
      {TABS.map((t) => {
        const next = new URLSearchParams(base);
        if (t.id === "all") next.delete("tab");
        else next.set("tab", t.id);
        const qs = next.toString();
        const href = `${pathname}${qs ? `?${qs}` : ""}`;
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={href}
            className={[
              "shrink-0 rounded-t-md px-3 py-2 text-sm transition-colors",
              isActive
                ? "border-b-2 border-tool-accent font-medium text-tool-accent"
                : "text-secondary hover:bg-app-elevated hover:text-app",
            ].join(" ")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
