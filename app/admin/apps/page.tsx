import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { inputClass } from "../_lib";
import type { AppDomain, AppRegistryRow } from "../_types";
import { togglePublished } from "./_actions";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

const DOMAIN_LABELS: Record<AppDomain, string> = {
  re: "Real Estate",
  solutions: "Solutions",
  os: "OS shell",
  admin: "Admin",
};

const DOMAIN_FILTERS: Array<{ value: "" | AppDomain; label: string }> = [
  { value: "", label: "All domains" },
  { value: "re", label: "Real Estate" },
  { value: "solutions", label: "Solutions" },
  { value: "os", label: "OS shell" },
  { value: "admin", label: "Admin" },
];

const PUBLISHED_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "true", label: "Published" },
  { value: "false", label: "Unpublished" },
];

function chipClassForDomain(domain: AppDomain): string {
  switch (domain) {
    case "re":
      return "bg-tool-accent-soft text-tool-accent";
    case "solutions":
      return "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400";
    case "os":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "admin":
      return "bg-rose-500/15 text-rose-500";
    default:
      return "bg-app-elevated text-secondary border border-app";
  }
}

function chipClassForAccess(mode: string): string {
  switch (mode) {
    case "public":
      return "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400";
    case "authenticated":
      return "bg-app-elevated text-secondary border border-app";
    case "tier":
      return "bg-tool-accent-soft text-tool-accent";
    case "allowlist":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "admin_only":
      return "bg-rose-500/15 text-rose-500";
    default:
      return "bg-app-elevated text-secondary border border-app";
  }
}

async function togglePublishedAction(formData: FormData): Promise<void> {
  "use server";
  await togglePublished(formData);
}

export default async function AdminAppsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    domain?: string;
    category?: string;
    published?: string;
  }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").trim();
  const domainParam = (sp.domain ?? "").trim();
  const domain: AppDomain | "" =
    domainParam === "re" ||
    domainParam === "solutions" ||
    domainParam === "os" ||
    domainParam === "admin"
      ? domainParam
      : "";
  const categoryFilter = (sp.category ?? "").trim();
  const publishedFilterRaw = (sp.published ?? "").trim();
  const publishedFilter =
    publishedFilterRaw === "true" || publishedFilterRaw === "false"
      ? publishedFilterRaw
      : "";

  const admin = createAdminClient();

  // Build the filtered query for the table + paged count.
  const buildBase = () => {
    let query = admin.from("app_registry").select("*", { count: "exact" });
    if (domain) query = query.eq("domain", domain);
    if (categoryFilter) query = query.eq("category", categoryFilter);
    if (publishedFilter) {
      query = query.eq("published", publishedFilter === "true");
    }
    if (q) {
      // search by id (slug) or title — case-insensitive substring match.
      const escaped = q.replace(/,/g, " ").replace(/\*/g, "");
      query = query.or(`id.ilike.%${escaped}%,title.ilike.%${escaped}%`);
    }
    return query;
  };

  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;

  // Run in parallel: filtered page, full-domain stat counts.
  const [pageRes, statsRes, categoriesRes] = await Promise.all([
    buildBase()
      .order("domain", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true })
      .range(from, to),
    admin.from("app_registry").select("domain, published"),
    admin.from("app_registry").select("category"),
  ]);

  const rows = ((pageRes.data ?? []) as AppRegistryRow[]) ?? [];
  const total = pageRes.count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  type StatRow = { domain: AppDomain; published: boolean };
  const stats = (statsRes.data ?? []) as StatRow[];
  const totalAll = stats.length;
  const publishedAll = stats.filter((s) => s.published).length;
  const unpublishedAll = totalAll - publishedAll;

  const byDomain: Record<AppDomain, number> = {
    re: 0,
    solutions: 0,
    os: 0,
    admin: 0,
  };
  for (const s of stats) {
    if (s.domain in byDomain) byDomain[s.domain] += 1;
  }

  const categorySet = new Set<string>();
  for (const c of (categoriesRes.data ?? []) as Array<{ category: string }>) {
    if (c.category) categorySet.add(c.category);
  }
  const categories = Array.from(categorySet).sort();

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Platform
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">Apps & Features</h1>
        <p className="mt-0.5 text-xs text-muted">
          Every app the OS shell exposes. Toggle publish, edit access mode, or
          override per-workspace and per-user.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Total apps" value={totalAll} />
        <SummaryCard
          label="Published"
          value={publishedAll}
          tone="emerald"
        />
        <SummaryCard
          label="Unpublished"
          value={unpublishedAll}
          tone="rose"
        />
        <SummaryCard
          label="Categories"
          value={categories.length}
          tone="muted"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          ["re", "solutions", "os", "admin"] as const
        ).map((d) => (
          <DomainCard
            key={d}
            domain={d}
            count={byDomain[d]}
            active={domain === d}
            q={q}
            category={categoryFilter}
            published={publishedFilter}
          />
        ))}
      </div>

      {/* Filters */}
      <form
        action="/admin/apps"
        className="grid gap-2 rounded-xl border border-app bg-app-elevated p-3 sm:grid-cols-[1fr_180px_180px_140px_auto]"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by slug or title"
          className={`${inputClass} h-9`}
        />
        <select
          name="domain"
          defaultValue={domain}
          className={`${inputClass} h-9`}
        >
          {DOMAIN_FILTERS.map((d) => (
            <option key={d.value || "_all"} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <select
          name="category"
          defaultValue={categoryFilter}
          className={`${inputClass} h-9`}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          name="published"
          defaultValue={publishedFilter}
          className={`${inputClass} h-9`}
        >
          {PUBLISHED_FILTERS.map((p) => (
            <option key={p.value || "_all"} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-sm text-app transition-colors hover:border-tool-accent"
        >
          Apply
        </button>
      </form>

      <p className="text-xs text-muted">
        {total.toLocaleString()} match{total === 1 ? "" : "es"} · page {page} of{" "}
        {totalPages}
      </p>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Title</th>
              <th className="px-3 py-2 text-left font-normal">Slug</th>
              <th className="px-3 py-2 text-left font-normal">Domain</th>
              <th className="px-3 py-2 text-left font-normal">Category</th>
              <th className="px-3 py-2 text-left font-normal">Access</th>
              <th className="px-3 py-2 text-left font-normal">Published</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-faint">
                  No apps match.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-app last:border-b-0 hover:bg-app/40"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/apps/${encodeURIComponent(row.id)}`}
                      className="font-medium text-app hover:text-tool-accent"
                    >
                      {row.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                    {row.id}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${chipClassForDomain(
                        row.domain
                      )}`}
                    >
                      {DOMAIN_LABELS[row.domain] ?? row.domain}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-secondary">
                    {row.category || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${chipClassForAccess(
                        row.access_mode
                      )}`}
                    >
                      {row.access_mode}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <form
                      action={togglePublishedAction}
                      className="inline-flex items-center gap-2"
                    >
                      <input type="hidden" name="slug" value={row.id} />
                      <input
                        type="hidden"
                        name="next"
                        value={row.published ? "false" : "true"}
                      />
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          row.published
                            ? "bg-emerald-500/15 text-emerald-500"
                            : "bg-rose-500/15 text-rose-500"
                        }`}
                      >
                        {row.published ? "Published" : "Hidden"}
                      </span>
                      <button
                        type="submit"
                        className="rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                      >
                        {row.published ? "Unpublish" : "Publish"}
                      </button>
                    </form>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/admin/apps/${encodeURIComponent(row.id)}`}
                      className="rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2 text-xs">
        <PageLink
          page={page - 1}
          disabled={page <= 1}
          q={q}
          domain={domain}
          category={categoryFilter}
          published={publishedFilter}
        >
          ← Prev
        </PageLink>
        <span className="font-mono tabular-nums text-muted">
          {page} / {totalPages}
        </span>
        <PageLink
          page={page + 1}
          disabled={page >= totalPages}
          q={q}
          domain={domain}
          category={categoryFilter}
          published={publishedFilter}
        >
          Next →
        </PageLink>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "emerald" | "rose" | "muted";
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-500 dark:text-emerald-400"
      : tone === "rose"
        ? "text-rose-500"
        : tone === "muted"
          ? "text-secondary"
          : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function DomainCard({
  domain,
  count,
  active,
  q,
  category,
  published,
}: {
  domain: AppDomain;
  count: number;
  active: boolean;
  q: string;
  category: string;
  published: string;
}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (published) params.set("published", published);
  params.set("domain", active ? "" : domain);
  const href = `/admin/apps?${params.toString()}`;
  return (
    <Link
      href={href}
      className={[
        "rounded-xl border p-4 transition-colors",
        active
          ? "border-tool-accent bg-tool-accent-soft"
          : "border-app bg-app-elevated hover:border-tool-accent",
      ].join(" ")}
    >
      <div
        className={`text-[0.6rem] uppercase tracking-[0.2em] ${
          active ? "text-tool-accent" : "text-faint"
        }`}
      >
        {DOMAIN_LABELS[domain]}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <div
          className={`text-2xl font-semibold tabular-nums ${
            active ? "text-tool-accent" : "text-app"
          }`}
        >
          {count.toLocaleString()}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${chipClassForDomain(
            domain
          )}`}
        >
          {domain}
        </span>
      </div>
    </Link>
  );
}

function PageLink({
  page,
  disabled,
  q,
  domain,
  category,
  published,
  children,
}: {
  page: number;
  disabled?: boolean;
  q?: string;
  domain?: AppDomain | "";
  category?: string;
  published?: string;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  if (domain) params.set("domain", domain);
  if (category) params.set("category", category);
  if (published) params.set("published", published);
  const cls =
    "rounded-lg border border-app px-2.5 py-1 transition-colors " +
    (disabled
      ? "pointer-events-none opacity-40 text-faint"
      : "bg-app-elevated text-app hover:border-tool-accent");
  if (disabled) return <span className={cls}>{children}</span>;
  return (
    <Link href={`/admin/apps?${params.toString()}`} className={cls}>
      {children}
    </Link>
  );
}
