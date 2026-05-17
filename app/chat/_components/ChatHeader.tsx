/* app/chat/_components/ChatHeader.tsx — sticky header for /chat.
 *
 * Server component. Shows the entity title + subtitle + a back link to
 * the entity's detail page when one is known.
 */

import Link from "next/link";

import type { ContextKind } from "@/lib/ai-context/load";

const KIND_LABEL: Record<ContextKind, string> = {
  task: "task",
  project: "project",
  contact: "contact",
  deal: "deal",
  employee: "employee",
  none: "workspace",
};

export interface ChatHeaderProps {
  title: string;
  subtitle: string | null;
  href: string | null;
  kind: ContextKind;
}

export default function ChatHeader({
  title,
  subtitle,
  href,
  kind,
}: ChatHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-app bg-app px-4 py-3">
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold text-app">
          Chat about: {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-secondary">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs">
        {href ? (
          <Link
            href={href}
            className="rounded-md border border-app bg-app-elevated px-2 py-1 text-secondary hover:border-tool-accent hover:text-app"
          >
            Open {KIND_LABEL[kind]}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
