import type { Metadata } from "next";
import Link from "next/link";

import { runGlobalSearch } from "@/lib/search/query";
import { createClient } from "@/lib/supabase/server";
import { labelForEntity, type SearchHit } from "@/lib/search/types";

/* /search?q=<query>
 *
 * Full-page version of the command palette. Useful when:
 *   - the user wants a shareable URL of a search ("send me everything
 *     matching 'tenant XYZ'")
 *   - there are more results than the palette can show
 *   - someone arrives via the address bar
 *
 * Server-rendered against the user's session-bound Supabase client so
 * we get the same RLS-filtered results as the palette would.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search",
  description: "Search across your workspaces.",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold mb-4">Search</h1>
        <p className="text-sm opacity-70">
          You need to be signed in to search.{" "}
          <Link href="/auth/sign-in" className="underline">
            Sign in
          </Link>
          .
        </p>
      </main>
    );
  }

  let results: Awaited<ReturnType<typeof runGlobalSearch>> | null = null;
  let error: string | null = null;

  if (query) {
    try {
      results = await runGlobalSearch(query, { limit: 100 });
    } catch (e) {
      error = e instanceof Error ? e.message : "search failed";
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold mb-2">Search</h1>

      <form method="get" action="/search" className="mb-8">
        <input
          name="q"
          defaultValue={query}
          autoFocus
          placeholder="Search anything…"
          className="w-full rounded-md border border-[var(--chrome-border,#0001)] bg-[var(--chrome-solid-bg,#fff)] px-4 py-2.5 text-base outline-none focus:border-[var(--chrome-border-strong,#0003)]"
        />
      </form>

      {!query ? (
        <p className="text-sm opacity-60">
          Type a query above. Tip: Cmd+K opens the quick palette anywhere.
        </p>
      ) : error ? (
        <p className="text-sm text-red-600">Search failed: {error}</p>
      ) : !results || results.total === 0 ? (
        <p className="text-sm opacity-60">
          No results for <span className="font-medium">&ldquo;{query}&rdquo;</span>.
        </p>
      ) : (
        <div className="space-y-8">
          {results.groups.map((group) => (
            <section key={group.kind}>
              <h2 className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-2">
                {group.label}{" "}
                <span className="opacity-50">({group.items.length})</span>
              </h2>
              <ul className="rounded-lg border border-[var(--chrome-border,#0001)] divide-y divide-[var(--chrome-border,#0001)] bg-[var(--chrome-solid-bg,#fff)]">
                {group.items.map((hit) => (
                  <SearchRow key={`${hit.entity_type}:${hit.entity_id}`} hit={hit} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function SearchRow({ hit }: { hit: SearchHit }) {
  return (
    <li>
      <Link
        href={hit.href}
        className="flex items-start gap-3 px-4 py-2.5 hover:bg-[var(--chrome-hover,#0000000a)]"
      >
        <span aria-hidden className="mt-0.5 text-base opacity-60">
          {iconFor(hit)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium truncate">
            {hit.title}
          </span>
          {hit.subtitle ? (
            <span className="block text-xs opacity-60 truncate">
              {hit.subtitle}
            </span>
          ) : null}
        </span>
        <span className="text-xs opacity-50 shrink-0">
          {labelForEntity(hit.entity_type)}
        </span>
      </Link>
    </li>
  );
}

function iconFor(hit: SearchHit): string {
  if (!hit.icon) return "·";
  // If the caller stored an emoji or single char, render as-is; if they
  // stored a lucide name we fall back to a glyph since this server page
  // doesn't import lucide.
  if (hit.icon.length <= 2) return hit.icon;
  return "·";
}
