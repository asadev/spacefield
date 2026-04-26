import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import Avatar from "./_components/Avatar";
import { fetchAuthUsersByIds, formatBytes, formatDateTime } from "./_lib";

export const dynamic = "force-dynamic";

type ContactMessage = {
  id: string;
  name: string | null;
  email: string;
  topic: string;
  message: string;
  created_at: string;
  resolved_at: string | null;
};

type ProfileLite = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

export default async function AdminDashboardPage() {
  const admin = createAdminClient();

  const [
    usersCountRes,
    workspacesCountRes,
    filesAggRes,
    subsAggRes,
    messagesRes,
    profilesRes,
  ] = await Promise.all([
    admin.from("profiles").select("user_id", { count: "exact", head: true }),
    admin.from("workspaces").select("id", { count: "exact", head: true }),
    admin.from("workspace_files").select("size_bytes"),
    admin.from("subscriptions").select("tier_id, status"),
    admin
      .from("contact_messages")
      .select("id, name, email, topic, message, created_at, resolved_at")
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("profiles")
      .select("user_id, username, full_name, avatar_url, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const userCount = usersCountRes.count ?? 0;
  const workspaceCount = workspacesCountRes.count ?? 0;

  const fileRows = (filesAggRes.data ?? []) as Array<{ size_bytes: number }>;
  const fileCount = fileRows.length;
  const fileBytes = fileRows.reduce(
    (sum, r) => sum + Number(r.size_bytes ?? 0),
    0
  );

  const subRows = (subsAggRes.data ?? []) as Array<{
    tier_id: string;
    status: string;
  }>;
  const activeByTier = new Map<string, number>();
  let activeTotal = 0;
  for (const r of subRows) {
    if (r.status !== "active" && r.status !== "trialing") continue;
    activeTotal += 1;
    activeByTier.set(r.tier_id, (activeByTier.get(r.tier_id) ?? 0) + 1);
  }

  const messages = (messagesRes.data ?? []) as ContactMessage[];
  const recentSignups = (profilesRes.data ?? []) as ProfileLite[];

  // Email lookup for recent signups
  const emails = await fetchAuthUsersByIds(recentSignups.map((p) => p.user_id));

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Overview
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">Dashboard</h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={userCount.toLocaleString()} href="/admin/users" />
        <StatCard
          label="Active subscriptions"
          value={activeTotal.toLocaleString()}
          subline={
            activeByTier.size === 0
              ? "No active subs"
              : Array.from(activeByTier.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([tier, count]) => `${count} ${tier}`)
                  .join(" · ")
          }
          href="/admin/subscriptions"
        />
        <StatCard
          label="Workspaces"
          value={workspaceCount.toLocaleString()}
          href="/admin/workspaces"
        />
        <StatCard
          label="Files"
          value={fileCount.toLocaleString()}
          subline={formatBytes(fileBytes)}
        />
      </div>

      {/* Two-column lists */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section
          title="Recent contact messages"
          empty={messages.length === 0 ? "No messages yet." : null}
          right={
            <Link href="/admin/messages" className="text-xs text-tool-accent hover:underline">
              All messages →
            </Link>
          }
        >
          <ul className="divide-y divide-app">
            {messages.map((m) => (
              <li key={m.id} className="py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-app">
                      {m.name || m.email}{" "}
                      <span className="font-normal text-muted">·</span>{" "}
                      <span className="font-normal text-muted">{m.topic}</span>
                    </div>
                    <div className="truncate text-xs text-secondary">{m.email}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-secondary">
                      {m.message}
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-[10px] tabular-nums text-faint">
                    {formatDateTime(m.created_at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Recent signups"
          empty={recentSignups.length === 0 ? "No signups yet." : null}
          right={
            <Link href="/admin/users" className="text-xs text-tool-accent hover:underline">
              All users →
            </Link>
          }
        >
          <ul className="divide-y divide-app">
            {recentSignups.map((p) => {
              const u = emails.get(p.user_id);
              return (
                <li key={p.user_id} className="py-3 text-sm">
                  <Link
                    href={`/admin/users/${p.user_id}`}
                    className="flex items-center gap-3 group"
                  >
                    <Avatar url={p.avatar_url} fallback={p.full_name || p.username || u?.email || "?"} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-app group-hover:text-tool-accent">
                        {p.full_name || p.username || u?.email || p.user_id.slice(0, 8)}
                      </div>
                      <div className="truncate text-xs text-secondary">
                        {u?.email ?? "—"}
                      </div>
                    </div>
                    <div className="shrink-0 font-mono text-[10px] tabular-nums text-faint">
                      {formatDateTime(p.created_at)}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subline,
  href,
}: {
  label: string;
  value: string;
  subline?: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-xl border border-app bg-app-elevated p-4 transition-colors hover:border-tool-accent">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl tabular-nums text-app">
        {value}
      </div>
      {subline && (
        <div className="mt-1 text-xs text-secondary">{subline}</div>
      )}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Section({
  title,
  children,
  right,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  empty?: string | null;
}) {
  return (
    <section className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-app">{title}</h2>
        {right}
      </div>
      {empty ? <div className="py-6 text-sm text-faint">{empty}</div> : children}
    </section>
  );
}

