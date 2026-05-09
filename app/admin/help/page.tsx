import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime, inputClass } from "../_lib";
import type {
  HelpArticleRow,
  HelpArticleStatus,
  HelpArticleVisibility,
  HelpCategoryRow,
} from "../_types";

export const dynamic = "force-dynamic";

const PER_PAGE = 25;

const STATUS_CHIP: Record<HelpArticleStatus, string> = {
  draft: "bg-app-elevated text-secondary border border-app",
  published: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
  archived: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

const VISIBILITY_CHIP: Record<HelpArticleVisibility, string> = {
  public: "bg-tool-accent-soft text-tool-accent",
  authenticated: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  admin_only: "bg-rose-500/15 text-rose-500",
};

function formatVisibility(v: HelpArticleVisibility): string {
  return v === "admin_only" ? "admin" : v;
}

function helpfulRatio(row: HelpArticleRow): {
  text: string;
  pct: number | null;
} {
  const total = row.helpful_count + row.not_helpful_count;
  if (total === 0) return { text: "—", pct: null };
  const pct = Math.round((row.helpful_count / total) * 100);
  return {
    text: `${row.helpful_count} / ${row.not_helpful_count}`,
    pct,
  };
}

export default async function AdminHelpIndexPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    status?: string;
    category?: string;
  }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").trim();
  const statusQ = (sp.status ?? "").trim();
  const categoryQ = (sp.category ?? "").trim();

  const admin = createAdminClient();
  const offset = (page - 1) * PER_PAGE;

  let listQuery = admin
    .from("help_articles")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(offset, offset + PER_PAGE - 1);

  if (q) listQuery = listQuery.ilike("title", `%${q}%`);
  if (statusQ) listQuery = listQuery.eq("status", statusQ);
  if (categoryQ) listQuery = listQuery.eq("category_id", categoryQ);

  const [listRes, catsRes, statsPublishedRes, statsDraftRes, viewSumRes, topRes] =
    await Promise.all([
      listQuery,
      admin
        .from("help_categories")
        .select("*")
        .order("sort_order", { ascending: true }),
      admin
        .from("help_articles")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
      admin
        .from("help_articles")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft"),
      admin.from("help_articles").select("view_count").limit(5000),
      admin
        .from("help_articles")
        .select("id, slug, title, view_count")
        .order("view_count", { ascending: false })
        .limit(1),
    ]);

  const rows = (listRes.data ?? []) as HelpArticleRow[];
  const total = listRes.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const cats = (catsRes.data ?? []) as HelpCategoryRow[];
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const totalViews = ((viewSumRes.data ?? []) as Array<{ view_count: number }>)
    .reduce((sum, r) => sum + (r.view_count ?? 0), 0);
  const topArticle =
    ((topRes.data ?? []) as Array<{
      id: string;
      slug: string;
      title: string;
      view_count: number;
    }>)[0] ?? null;

  const baseParams = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (statusQ) p.set("status", statusQ);
    if (categoryQ) p.set("category", categoryQ);
    if (page > 1) p.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, v);
    }
    return p;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Communication
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Help center</h1>
          <p className="mt-0.5 text-xs text-muted">
            {total.toLocaleString()} articles · page {page} of {totalPages}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/help/categories"
            className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent"
          >
            Categories
          </Link>
          <Link
            href="/help"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent"
          >
            Public KB ↗
          </Link>
          <Link
            href="/admin/help/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            + New article
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Published"
          value={(statsPublishedRes.count ?? 0).toLocaleString()}
          tone="emerald"
        />
        <StatCard
          label="Drafts"
          value={(statsDraftRes.count ?? 0).toLocaleString()}
        />
        <StatCard label="Total views" value={totalViews.toLocaleString()} />
        <div className="rounded-xl border border-app bg-app-elevated p-4">
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Top article (by views)
          </div>
          {topArticle ? (
            <Link
              href={`/admin/help/${encodeURIComponent(topArticle.id)}`}
              className="mt-1 block text-sm font-semibold text-app hover:text-tool-accent"
            >
              <span className="line-clamp-2">{topArticle.title}</span>
              <span className="mt-0.5 block text-[11px] font-normal tabular-nums text-secondary">
                {(topArticle.view_count ?? 0).toLocaleString()} views
              </span>
            </Link>
          ) : (
            <div className="mt-2 text-xs text-faint">No articles yet.</div>
          )}
        </div>
      </div>

      {listRes.error && (
        <div className="rounded-xl border border-app bg-app-elevated p-3 text-xs text-rose-500">
          Read failed: {listRes.error.message}
        </div>
      )}

      <form
        action="/admin/help"
        className="flex flex-wrap items-end gap-2 rounded-xl border border-app bg-app-elevated p-3"
      >
        <Field label="Search title">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="title contains…"
            className={`${inputClass} h-9 w-56`}
          />
        </Field>
        <Field label="Status">
          <select
            name="status"
            defaultValue={statusQ}
            className={`${inputClass} h-9 w-36`}
          >
            <option value="">Any</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
        <Field label="Category">
          <select
            name="category"
            defaultValue={categoryQ}
            className={`${inputClass} h-9 w-48`}
          >
            <option value="">Any</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-sm text-app transition-colors hover:border-tool-accent"
        >
          Apply
        </button>
        <Link
          href="/admin/help"
          className="h-9 rounded-lg border border-transparent px-3 py-1.5 text-sm text-muted transition-colors hover:border-app hover:text-app"
        >
          Reset
        </Link>
      </form>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Title</th>
              <th className="px-3 py-2 text-left font-normal">Category</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Visibility</th>
              <th className="px-3 py-2 text-right font-normal">Views</th>
              <th className="px-3 py-2 text-left font-normal">Helpful</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-faint">
                  No articles match.
                </td>
              </tr>
            ) : (
              rows.map((a) => {
                const ratio = helpfulRatio(a);
                const cat = a.category_id ? catMap.get(a.category_id) : null;
                return (
                  <tr
                    key={a.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="max-w-md px-3 py-2">
                      <Link
                        href={`/admin/help/${encodeURIComponent(a.id)}`}
                        className="font-medium text-app hover:text-tool-accent"
                      >
                        <span className="line-clamp-1">{a.title}</span>
                      </Link>
                      <div className="font-mono text-[10px] text-faint">
                        {a.slug}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {cat ? (
                        <span className="rounded-full bg-app px-2 py-0.5 text-[10px] font-medium text-secondary border border-app">
                          {cat.display_name}
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_CHIP[a.status]}`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${VISIBILITY_CHIP[a.visibility]}`}
                      >
                        {formatVisibility(a.visibility)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-secondary">
                      {(a.view_count ?? 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className="font-mono tabular-nums text-secondary">
                        {ratio.text}
                      </span>
                      {ratio.pct !== null && (
                        <span className="ml-1 text-[10px] text-faint">
                          ({ratio.pct}%)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {formatDateTime(a.updated_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/help/${encodeURIComponent(a.id)}`}
                        className="rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 text-xs">
        <PageLink
          params={baseParams({ page: String(Math.max(1, page - 1)) })}
          disabled={page <= 1}
        >
          ← Prev
        </PageLink>
        <span className="font-mono tabular-nums text-muted">
          {page} / {totalPages}
        </span>
        <PageLink
          params={baseParams({ page: String(Math.min(totalPages, page + 1)) })}
          disabled={page >= totalPages}
        >
          Next →
        </PageLink>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.6rem] uppercase tracking-[0.18em] text-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald";
}) {
  const toneCls =
    tone === "emerald" ? "text-emerald-500 dark:text-emerald-400" : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-3">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls}`}>
        {value}
      </div>
    </div>
  );
}

function PageLink({
  params,
  disabled,
  children,
}: {
  params: URLSearchParams;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const cls =
    "rounded-lg border border-app px-2.5 py-1 transition-colors " +
    (disabled
      ? "pointer-events-none opacity-40 text-faint"
      : "bg-app-elevated text-app hover:border-tool-accent");
  if (disabled) return <span className={cls}>{children}</span>;
  return (
    <Link href={`/admin/help?${params.toString()}`} className={cls}>
      {children}
    </Link>
  );
}
