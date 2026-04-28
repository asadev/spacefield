"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV: { href: string; label: string }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/workspaces", label: "Workspaces" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/tiers", label: "Tiers" },
  { href: "/admin/tools", label: "Tools" },
  { href: "/admin/wallpapers", label: "Wallpapers" },
  { href: "/admin/social", label: "Social" },
];

export default function Sidebar() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "rounded-lg px-3 py-2 text-sm transition-colors",
              active
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
