import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../../_lib";
import type { HelpArticleRow, HelpCategoryRow } from "../../_types";
import { ArticleForm } from "../_ArticleForm";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function AdminHelpArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);

  const admin = createAdminClient();

  // The route segment carries the article id (the row's text PK = slug).
  const [articleRes, catsRes] = await Promise.all([
    admin
      .from("help_articles")
      .select("*")
      .eq("id", decoded)
      .maybeSingle(),
    admin
      .from("help_categories")
      .select("*")
      .order("sort_order", { ascending: true }),
  ]);

  const article = (articleRes.data as HelpArticleRow | null) ?? null;
  if (!article) notFound();
  const categories = (catsRes.data ?? []) as HelpCategoryRow[];

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/help"
          className="text-[11px] uppercase tracking-[0.18em] text-muted hover:text-app"
        >
          ← All articles
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">
          Edit article
        </h1>
        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-faint">
          {article.id}
        </p>
        <p className="mt-1 text-[11px] text-muted">
          Created {formatDateTime(article.created_at)} · last updated{" "}
          {formatDateTime(article.updated_at)}
        </p>
      </div>
      <ArticleForm
        mode="edit"
        article={article}
        categories={categories}
      />
    </div>
  );
}
