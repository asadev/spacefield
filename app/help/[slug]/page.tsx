import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import type {
  HelpArticleRow,
  HelpCategoryRow,
} from "../../admin/_types";
import { renderMarkdown } from "../../admin/help/_markdown";
import { HelpfulVote } from "./HelpfulVote";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);

  const admin = createAdminClient();
  const { data } = await admin
    .from("help_articles")
    .select("title, excerpt")
    .eq("slug", decoded)
    .eq("status", "published")
    .in("visibility", ["public", "authenticated"])
    .maybeSingle();

  if (!data) {
    return {
      title: "Help — article not found",
      robots: { index: false, follow: false },
    };
  }

  const r = data as { title: string; excerpt: string | null };
  return {
    title: r.title,
    description: r.excerpt ?? undefined,
  };
}

const SESSION_COOKIE = "help_session_id";
const VIEWED_PREFIX = "help_v_"; // help_v_<slug> = "1" once counted

function makeSessionId(): string {
  // Doesn't need to be cryptographic — just a stable per-browser key.
  const r = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36);
  return `${t}${r}`;
}

async function ensureSessionCookie(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE);
  if (existing?.value) return existing.value;
  const id = makeSessionId();
  try {
    store.set(SESSION_COOKIE, id, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      httpOnly: false,
      sameSite: "lax",
    });
  } catch {
    // Some render contexts don't allow cookie writes; that's fine — the
    // article page is dynamic so a subsequent visit will set it.
  }
  return id;
}

async function bumpViewIfFirst(slug: string): Promise<void> {
  await ensureSessionCookie();
  const store = await cookies();
  const cookieKey = `${VIEWED_PREFIX}${slug.slice(0, 60)}`;
  if (store.get(cookieKey)?.value === "1") return;

  const admin = createAdminClient();
  // Atomic increment via the public RPC. Falls back to a read-then-update
  // if the function doesn't exist in the DB (defensive — won't fail page).
  const rpc = await admin.rpc("help_article_increment_view", {
    p_slug: slug,
  });
  if (rpc.error) {
    // Last-resort fallback: read current, then write +1. Worse for concurrency
    // but the worst-case loss is a missed view bump on an article that just
    // hit a thundering herd at the same second.
    const cur = await admin
      .from("help_articles")
      .select("view_count")
      .eq("slug", slug)
      .maybeSingle();
    if (cur.data) {
      const next = (cur.data as { view_count: number }).view_count + 1;
      await admin
        .from("help_articles")
        .update({ view_count: next })
        .eq("slug", slug);
    }
  }
  try {
    store.set(cookieKey, "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days — a "session" for the view-count purpose
      httpOnly: false,
      sameSite: "lax",
    });
  } catch {
    // ignore — see ensureSessionCookie
  }
}

export default async function PublicHelpArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);

  const admin = createAdminClient();
  const { data } = await admin
    .from("help_articles")
    .select("*")
    .eq("slug", decoded)
    .eq("status", "published")
    .in("visibility", ["public", "authenticated"])
    .maybeSingle();

  const article = (data as HelpArticleRow | null) ?? null;
  if (!article) notFound();

  // Fire-and-await — increments at most once per browser session.
  await bumpViewIfFirst(article.slug);

  let category: HelpCategoryRow | null = null;
  if (article.category_id) {
    const { data: catData } = await admin
      .from("help_categories")
      .select("*")
      .eq("id", article.category_id)
      .eq("enabled", true)
      .maybeSingle();
    category = (catData as HelpCategoryRow | null) ?? null;
  }

  const html = renderMarkdown(article.body);
  const helpfulTotal = article.helpful_count + article.not_helpful_count;
  const helpfulPct =
    helpfulTotal === 0
      ? null
      : Math.round((article.helpful_count / helpfulTotal) * 100);

  // Same-category sibling list (next reads).
  let siblings: Array<Pick<HelpArticleRow, "id" | "slug" | "title">> = [];
  if (article.category_id) {
    const { data: sibData } = await admin
      .from("help_articles")
      .select("id, slug, title")
      .eq("status", "published")
      .in("visibility", ["public", "authenticated"])
      .eq("category_id", article.category_id)
      .neq("id", article.id)
      .order("sort_order", { ascending: true })
      .limit(6);
    siblings = (sibData ?? []) as Array<
      Pick<HelpArticleRow, "id" | "slug" | "title">
    >;
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <nav className="mb-4 text-[11px] uppercase tracking-[0.18em] text-muted">
        <Link href="/help" className="hover:text-app">
          Help
        </Link>
        {category && (
          <>
            <span className="mx-1.5 text-faint">/</span>
            <span className="text-secondary">{category.display_name}</span>
          </>
        )}
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-app">{article.title}</h1>
        {article.excerpt && (
          <p className="mt-2 text-base text-secondary">{article.excerpt}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-faint">
          <span className="tabular-nums">
            {(article.view_count ?? 0).toLocaleString()} views
          </span>
          {helpfulPct !== null && (
            <span className="tabular-nums">
              {helpfulPct}% found this helpful
            </span>
          )}
          {article.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {article.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-app bg-app-elevated px-2 py-0.5 text-[10px] text-secondary"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      <div
        className="help-article text-app"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <hr className="my-8 border-app" />

      <HelpfulVote
        articleId={article.id}
        helpful={article.helpful_count}
        notHelpful={article.not_helpful_count}
      />

      {siblings.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            More in {category?.display_name ?? "this category"}
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {siblings.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/help/${encodeURIComponent(s.slug)}`}
                  className="block rounded-lg border border-app bg-app-elevated p-3 text-sm text-app transition-colors hover:border-tool-accent"
                >
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
