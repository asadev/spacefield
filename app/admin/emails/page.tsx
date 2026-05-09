import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  formatDateTime,
} from "../_lib";

import type { EmailCategory, EmailTemplateRow } from "../_types";

export const dynamic = "force-dynamic";

const CATEGORIES: EmailCategory[] = [
  "transactional",
  "marketing",
  "auth",
  "notification",
  "digest",
];

type SearchParams = Promise<{ category?: string }>;

export default async function AdminEmailsIndexPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const categoryFilter =
    sp.category && (CATEGORIES as string[]).includes(sp.category)
      ? (sp.category as EmailCategory)
      : null;

  const admin = createAdminClient();

  // Fetch templates (filter category server-side if set).
  let q = admin
    .from("email_templates")
    .select(
      "key, display_name, description, category, role, subject, enabled, locale, last_test_send_at, updated_at"
    )
    .order("category", { ascending: true })
    .order("key", { ascending: true });
  if (categoryFilter) q = q.eq("category", categoryFilter);

  const { data: templatesRaw } = await q;
  const templates =
    (templatesRaw as Pick<
      EmailTemplateRow,
      | "key"
      | "display_name"
      | "description"
      | "category"
      | "role"
      | "subject"
      | "enabled"
      | "locale"
      | "last_test_send_at"
      | "updated_at"
    >[] | null) ?? [];

  // Per-template send count (last 30 days). One round trip — group in JS.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sendCounts = new Map<string, number>();
  if (templates.length > 0) {
    const { data: sends } = await admin
      .from("email_sends")
      .select("template_key, id")
      .gte("created_at", since)
      .in(
        "template_key",
        templates.map((t) => t.key)
      );
    for (const row of (sends as { template_key: string | null }[] | null) ??
      []) {
      const k = row.template_key;
      if (!k) continue;
      sendCounts.set(k, (sendCounts.get(k) ?? 0) + 1);
    }
  }

  let totalSends = 0;
  for (const v of sendCounts.values()) totalSends += v;
  const stats = computeStats(templates, totalSends);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Content
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">Email templates</h1>
        <p className="mt-0.5 text-xs text-muted">
          DB-driven transactional emails. Edit subject + body without a
          deploy. Code calls{" "}
          <code className="rounded bg-app px-1 text-[11px]">
            sendTemplate(&quot;key&quot;, ...)
          </code>{" "}
          to fire one off.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Templates" value={stats.total} />
        <StatCard label="Enabled" value={stats.enabled} accent="emerald" />
        <StatCard label="Disabled" value={stats.disabled} accent="amber" />
        <StatCard label="Sends (30d)" value={stats.totalSends} accent="violet" />
      </div>

      {/* Filter + new */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/admin/emails"
          className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
            !categoryFilter
              ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
              : "border-app bg-app-elevated text-secondary hover:border-tool-accent"
          }`}
        >
          All
        </Link>
        {CATEGORIES.map((cat) => (
          <Link
            key={cat}
            href={`/admin/emails?category=${cat}`}
            className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
              categoryFilter === cat
                ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                : "border-app bg-app-elevated text-secondary hover:border-tool-accent"
            }`}
          >
            {cat}
          </Link>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Link href="/admin/emails/new" className={buttonClass}>
            + New template
          </Link>
        </div>
      </div>

      {/* Index table */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Key</th>
              <th className="px-3 py-2 text-left font-normal">Name</th>
              <th className="px-3 py-2 text-left font-normal">Category</th>
              <th className="px-3 py-2 text-left font-normal">Subject</th>
              <th className="px-3 py-2 text-left font-normal">Role</th>
              <th className="px-3 py-2 text-left font-normal">Enabled</th>
              <th className="px-3 py-2 text-right font-normal">30d sends</th>
              <th className="px-3 py-2 text-right font-normal">Last test</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-8 text-center text-faint"
                >
                  {categoryFilter
                    ? `No templates in ${categoryFilter}.`
                    : "No templates yet."}{" "}
                  <Link
                    href="/admin/emails/new"
                    className="text-tool-accent underline-offset-2 hover:underline"
                  >
                    Create one →
                  </Link>
                </td>
              </tr>
            ) : (
              templates.map((tpl) => (
                <TemplateRow
                  key={tpl.key}
                  tpl={tpl}
                  sendCount={sendCounts.get(tpl.key) ?? 0}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div>
        <Link href="/admin" className={buttonGhostClass}>
          ← Admin home
        </Link>
      </div>
    </div>
  );
}

/* ─────────────────────── components ─────────────────────── */

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "amber" | "violet";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-500"
      : accent === "amber"
        ? "text-amber-500"
        : accent === "violet"
          ? "text-tool-accent"
          : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function CategoryChip({ category }: { category: EmailCategory }) {
  const map: Record<EmailCategory, string> = {
    transactional: "bg-tool-accent-soft text-tool-accent",
    marketing: "bg-amber-500/15 text-amber-500",
    auth: "bg-emerald-500/15 text-emerald-500",
    notification: "bg-app text-secondary border border-app",
    digest: "bg-app text-secondary border border-app",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${map[category]}`}
    >
      {category}
    </span>
  );
}

function TemplateRow({
  tpl,
  sendCount,
}: {
  tpl: Pick<
    EmailTemplateRow,
    | "key"
    | "display_name"
    | "description"
    | "category"
    | "role"
    | "subject"
    | "enabled"
    | "locale"
    | "last_test_send_at"
  >;
  sendCount: number;
}) {
  const encoded = encodeURIComponent(tpl.key);
  return (
    <tr className="border-b border-app last:border-b-0 hover:bg-app/40">
      <td className="px-3 py-2 align-top font-mono text-xs text-app">
        <Link
          href={`/admin/emails/${encoded}`}
          className="hover:text-tool-accent"
        >
          {tpl.key}
        </Link>
      </td>
      <td className="px-3 py-2 align-top">
        <div className="truncate text-sm text-app">{tpl.display_name}</div>
        {tpl.description && (
          <div className="mt-0.5 truncate text-[11px] text-muted max-w-[260px]">
            {tpl.description}
          </div>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <CategoryChip category={tpl.category} />
      </td>
      <td className="px-3 py-2 align-top">
        <div className="truncate text-xs text-secondary max-w-[300px]">
          {tpl.subject}
        </div>
      </td>
      <td className="px-3 py-2 align-top font-mono text-[11px] text-muted">
        {tpl.role}
      </td>
      <td className="px-3 py-2 align-top">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
            tpl.enabled
              ? "bg-emerald-500/15 text-emerald-500"
              : "bg-app text-faint border border-app"
          }`}
        >
          {tpl.enabled ? "On" : "Off"}
        </span>
      </td>
      <td className="px-3 py-2 align-top text-right font-mono text-xs tabular-nums text-secondary">
        {sendCount.toLocaleString()}
      </td>
      <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-muted">
        {formatDateTime(tpl.last_test_send_at)}
      </td>
      <td className="px-3 py-2 align-top text-right">
        <Link
          href={`/admin/emails/${encoded}`}
          className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
        >
          Edit
        </Link>
      </td>
    </tr>
  );
}

function computeStats(
  templates: Pick<EmailTemplateRow, "enabled">[],
  totalSends: number
): { total: number; enabled: number; disabled: number; totalSends: number } {
  let enabled = 0;
  let disabled = 0;
  for (const t of templates) {
    if (t.enabled) enabled += 1;
    else disabled += 1;
  }
  return { total: templates.length, enabled, disabled, totalSends };
}
