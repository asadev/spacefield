import Link from "next/link";
import type { Metadata } from "next";

import { createAdminClient } from "@/lib/supabase/admin";

import type { HelpArticleRow, HelpCategoryRow } from "../admin/_types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Help center",
  description:
    "Guides, how-tos, and answers for using Space Field — by category.",
};

type ArticleListItem = Pick<
  HelpArticleRow,
  "id" | "slug" | "title" | "excerpt" | "category_id" | "sort_order" | "view_count"
>;

export default async function PublicHelpIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const admin = createAdminClient();

  let articleQuery = admin
    .from("help_articles")
    .select("id, slug, title, excerpt, category_id, sort_order, view_count")
    .eq("status", "published")
    .in("visibility", ["public", "authenticated"])
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true })
    .limit(500);
  if (q) articleQuery = articleQuery.ilike("title", `%${q}%`);

  const [catsRes, articlesRes] = await Promise.all([
    admin
      .from("help_categories")
      .select("*")
      .eq("enabled", true)
      .order("sort_order", { ascending: true }),
    articleQuery,
  ]);

  const cats = (catsRes.data ?? []) as HelpCategoryRow[];
  const articles = (articlesRes.data ?? []) as ArticleListItem[];
  const byCategory = new Map<string, ArticleListItem[]>();
  const uncategorised: ArticleListItem[] = [];
  for (const a of articles) {
    if (!a.category_id) {
      uncategorised.push(a);
      continue;
    }
    const list = byCategory.get(a.category_id) ?? [];
    list.push(a);
    byCategory.set(a.category_id, list);
  }

  const totalArticles = articles.length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Help center
        </div>
        <h1 className="mt-1 text-3xl font-semibold text-app">
          How can we help?
        </h1>
        <p className="mt-1 text-sm text-muted">
          {totalArticles.toLocaleString()} articles across {cats.length} categories.
        </p>
        <form action="/help" className="mt-5 flex max-w-xl gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search articles…"
            className="h-11 flex-1 rounded-lg border border-app bg-app-elevated px-4 text-sm text-app outline-none transition-colors placeholder:text-faint focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft"
          />
          <button
            type="submit"
            className="rounded-lg bg-tool-accent px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Search
          </button>
        </form>
      </div>

      {q && (
        <div className="mb-4 text-xs text-muted">
          Filtering by &ldquo;{q}&rdquo; ·{" "}
          <Link href="/help" className="text-tool-accent hover:underline">
            clear
          </Link>
        </div>
      )}

      <div className="space-y-8">
        {cats.map((c) => {
          const items = byCategory.get(c.id) ?? [];
          if (items.length === 0 && q) return null;
          return (
            <section key={c.id}>
              <header className="mb-3 flex items-baseline justify-between gap-2 border-b border-app pb-2">
                <div className="flex items-center gap-2">
                  {c.icon && (
                    <span
                      aria-hidden
                      className="text-base leading-none text-tool-accent"
                    >
                      {c.icon}
                    </span>
                  )}
                  <h2 className="text-base font-semibold text-app">
                    {c.display_name}
                  </h2>
                  <span className="text-[11px] tabular-nums text-faint">
                    {items.length}
                  </span>
                </div>
              </header>
              {c.description && (
                <p className="mb-3 text-xs text-muted">{c.description}</p>
              )}
              {items.length === 0 ? (
                <p className="text-xs text-faint">No published articles yet.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {items.map((a) => (
                    <ArticleCard key={a.id} article={a} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {uncategorised.length > 0 && (
          <section>
            <header className="mb-3 border-b border-app pb-2">
              <h2 className="text-base font-semibold text-app">Other</h2>
            </header>
            <ul className="grid gap-2 sm:grid-cols-2">
              {uncategorised.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </ul>
          </section>
        )}

        {q && articles.length === 0 && (
          <div className="rounded-xl border border-app bg-app-elevated p-6 text-center">
            <div className="text-sm text-app">
              No articles match &ldquo;{q}&rdquo;.
            </div>
            <Link
              href="/help"
              className="mt-2 inline-block text-xs text-tool-accent hover:underline"
            >
              Clear search
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function ArticleCard({ article }: { article: ArticleListItem }) {
  return (
    <li>
      <Link
        href={`/help/${encodeURIComponent(article.slug)}`}
        className="group block rounded-xl border border-app bg-app-elevated p-3 transition-colors hover:border-tool-accent"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium text-app group-hover:text-tool-accent">
            <span className="line-clamp-2">{article.title}</span>
          </div>
        </div>
        {article.excerpt && (
          <p className="mt-1 text-xs leading-relaxed text-secondary line-clamp-2">
            {article.excerpt}
          </p>
        )}
      </Link>
    </li>
  );
}
