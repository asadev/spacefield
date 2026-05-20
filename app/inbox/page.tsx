/* /inbox — the full notifications inbox.
 *
 * Server-rendered. Reads via the user-scoped Supabase client through
 * `lib/collab/notifications.ts::listForUser`, which respects RLS.
 *
 * Tabs: All | Unread | @Mentions | Assignments | System.
 * Bulk: "Mark all read" applies to the currently-active tab when
 *       possible (a tab maps to either a kind or unread filter).
 */

import { redirect } from "next/navigation";

import { kindToTab, listForUser, type Notification } from "@/lib/collab/notifications";
import { createClient } from "@/lib/supabase/server";

import InboxTabs, { type InboxTab } from "./_components/InboxTabs";
import { MarkAllReadButton, MarkOneReadInline } from "./_components/InboxActions";

export const dynamic = "force-dynamic";

interface SearchParams {
  tab?: string;
}

function parseTab(v: string | undefined): InboxTab {
  switch (v) {
    case "unread":
    case "mentions":
    case "assignments":
    case "system":
      return v;
    default:
      return "all";
  }
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/signin?next=/inbox");
  }

  const sp = (await searchParams) ?? {};
  const tab = parseTab(sp.tab);

  // Pull a generous page; tab-specific filters apply client-side
  // because the kind→tab mapping is non-trivial (mentions = any
  // `comment.*`, assignments = task.* or *.assigned, system = rest).
  const all = await listForUser(user.id, { limit: 200 });
  const filtered = filterByTab(all, tab);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-app">Inbox</h1>
          <p className="text-xs text-muted">
            Notifications for {user.email}. Mentions, assignments, and system
            alerts in one place.
          </p>
        </div>
        <MarkAllReadButton />
      </header>

      <InboxTabs active={tab} />

      <section className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="overflow-hidden rounded-md border border-app">
            {filtered.map((n) => (
              <Row key={n.id} item={n} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function filterByTab(rows: Notification[], tab: InboxTab): Notification[] {
  switch (tab) {
    case "all":
      return rows;
    case "unread":
      return rows.filter((r) => r.read_at === null);
    case "mentions":
      return rows.filter((r) => kindToTab(r.kind) === "mentions");
    case "assignments":
      return rows.filter((r) => kindToTab(r.kind) === "assignments");
    case "system":
      return rows.filter((r) => kindToTab(r.kind) === "system");
    default:
      return rows;
  }
}

function Row({ item }: { item: Notification }) {
  const unread = item.read_at === null;
  return (
    <MarkOneReadInline id={item.id} unread={unread} href={item.href}>
      <div className="flex items-start gap-2">
        {unread && (
          <span
            aria-hidden
            className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-tool-accent"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium text-app">
              {item.title}
            </span>
            <span className="shrink-0 rounded-sm border border-app bg-app-elevated px-1.5 py-0.5 text-[9px] uppercase tracking-[0.15em] text-muted">
              {item.kind}
            </span>
          </div>
          {item.body && (
            <div className="mt-0.5 line-clamp-2 text-xs text-muted">
              {item.body}
            </div>
          )}
          <div className="mt-1 text-[0.6rem] uppercase tracking-[0.15em] text-faint">
            {relativeTime(item.created_at)}
          </div>
        </div>
      </div>
    </MarkOneReadInline>
  );
}

function EmptyState({ tab }: { tab: InboxTab }) {
  const message =
    tab === "unread"
      ? "No unread notifications."
      : tab === "mentions"
        ? "No mentions yet. When someone @-tags you, it shows up here."
        : tab === "assignments"
          ? "No assignments waiting. The inbox lights up when something's handed to you."
          : tab === "system"
            ? "No system notices. Good news — nothing's broken."
            : "You're all caught up.";
  return (
    <div className="rounded-md border border-dashed border-app bg-app-elevated px-4 py-10 text-center text-sm text-muted">
      {message}
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
