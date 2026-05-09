import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import type { HelpCategoryRow } from "../../_types";
import { ArticleForm } from "../_ArticleForm";

export const dynamic = "force-dynamic";

export default async function AdminHelpNewPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("help_categories")
    .select("*")
    .order("sort_order", { ascending: true });
  const categories = (data ?? []) as HelpCategoryRow[];

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/help"
          className="text-[11px] uppercase tracking-[0.18em] text-muted hover:text-app"
        >
          ← All articles
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New article</h1>
        <p className="mt-0.5 text-xs text-muted">
          Markdown body. Slug auto-generates from the title.
        </p>
      </div>
      <ArticleForm mode="create" article={null} categories={categories} />
    </div>
  );
}
