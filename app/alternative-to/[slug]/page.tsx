/* /alternative-to/[slug] — SEO landing page for "alternative to X".
 *
 * One page per pre-baked competitor (six today). Static-generated via
 * generateStaticParams so they get crawled and cached cheaply.
 *
 * Each page: hero, five specific wins, a comparison snippet (top six
 * matrix rows for that competitor), an "honest stay-with-them" call-out,
 * and a CTA. The matrix snippet links out to /compare for the full view.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  getCompetitor,
  listAlternativeSlugs,
  COMPARE_FEATURES,
  COMPARE_COLUMN_LABELS,
  type FeatureSupport,
} from "../_data/competitors";

export const revalidate = 300;

/* Disallow ad-hoc slugs: anything not enumerated by generateStaticParams
 * must 404 with a real 404 status (not a soft 200 + "not found" body).
 * Combined with notFound() in the component below, an unknown slug now
 * returns HTTP 404 to bots and humans. */
export const dynamicParams = false;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return listAlternativeSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const c = getCompetitor(slug);
  if (!c) {
    return {
      title: "Alternative not found",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `${c.shortName} alternative — Space Field`,
    description: `Looking for a ${c.shortName} alternative? Space Field bundles CRM, tasks, people, files, AI assistant and 130+ tools in one workspace. Five specific reasons teams switch.`,
    alternates: { canonical: `/alternative-to/${c.slug}` },
  };
}

const SUPPORT_SYMBOL: Record<FeatureSupport, string> = {
  yes: "✓",
  no: "—",
  partial: "~",
};

const SUPPORT_CLASS: Record<FeatureSupport, string> = {
  yes: "text-emerald-500",
  no: "text-muted",
  partial: "text-amber-500",
};

export default async function AlternativeToPage({ params }: PageProps) {
  const { slug } = await params;
  const c = getCompetitor(slug);
  if (!c) notFound();

  // First six features for the snippet table.
  const snippetRows = COMPARE_FEATURES.slice(0, 6);
  const otherAlts = listAlternativeSlugs().filter((s) => s !== c.slug);

  return (
    <main className="min-h-screen bg-app text-app">
      <div className="mx-auto max-w-4xl px-5 py-16">
        <Link
          href="/compare"
          className="text-[0.65rem] uppercase tracking-[0.25em] text-faint hover:text-app"
        >
          ← All comparisons
        </Link>

        {/* Hero */}
        <header className="mt-6">
          <span className="text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent">
            {c.shortName} alternative
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            A Space Field workspace beats a {c.shortName} subscription.
          </h1>
          <p className="mt-4 text-base text-secondary">
            {c.shortName} {c.positioning} Space Field gives you CRM,
            tasks, people, files, an AI assistant, and 130+ purpose-built
            tools — all in one desktop-OS-style workspace, on one per-seat
            price.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/?signup=1"
              className="rounded-lg bg-tool-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Try free
            </Link>
            <Link
              href="/compare"
              className="rounded-lg border border-app bg-app-elevated px-5 py-2.5 text-sm font-medium transition-colors hover:border-tool-accent"
            >
              See full comparison
            </Link>
          </div>
        </header>

        {/* Wins */}
        <section className="mt-14">
          <h2 className="text-xl font-semibold">
            Five reasons teams move from {c.shortName} to Space Field.
          </h2>
          <ol className="mt-6 space-y-4">
            {c.wins.map((w, i) => (
              <li
                key={w.title}
                className="rounded-2xl border border-app bg-app-elevated p-5"
              >
                <div className="flex items-start gap-4">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-tool-accent-soft text-sm font-semibold text-tool-accent">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-app">
                      {w.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-secondary">
                      {w.body}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Comparison snippet */}
        <section className="mt-14">
          <h2 className="text-xl font-semibold">
            How we stack up, at a glance.
          </h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-app bg-app-elevated">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-app">
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted">
                    Feature
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-tool-accent">
                    Space Field
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted">
                    {COMPARE_COLUMN_LABELS[c.slug] ?? c.shortName}
                  </th>
                </tr>
              </thead>
              <tbody>
                {snippetRows.map((row, i) => {
                  const sf = row.support["spacefield"] ?? "no";
                  const rival = row.support[c.slug] ?? "no";
                  return (
                    <tr
                      key={row.feature}
                      className={
                        i % 2 === 0
                          ? "border-b border-app/50"
                          : "border-b border-app/50 bg-app/40"
                      }
                    >
                      <th
                        scope="row"
                        className="px-4 py-3 text-start font-medium text-app"
                      >
                        {row.feature}
                      </th>
                      <td className="px-4 py-3">
                        <span className={`text-base font-semibold ${SUPPORT_CLASS[sf]}`}>
                          {SUPPORT_SYMBOL[sf]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-base font-semibold ${SUPPORT_CLASS[rival]}`}>
                          {SUPPORT_SYMBOL[rival]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">
            Showing 6 of {COMPARE_FEATURES.length} rows.{" "}
            <Link href="/compare" className="text-tool-accent hover:underline">
              Full matrix →
            </Link>
          </p>
        </section>

        {/* Honest call-outs */}
        <section className="mt-14 rounded-2xl border border-app bg-app-elevated p-6">
          <h2 className="text-base font-semibold">
            When you should stay on {c.shortName}.
          </h2>
          <p className="mt-2 text-xs text-muted">
            We'd rather be honest now than refund you later.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-secondary">
            {c.honestCallouts.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA */}
        <section className="mt-14 rounded-2xl border border-tool-accent bg-tool-accent-soft p-8 text-center">
          <h2 className="text-xl font-semibold">
            Spin up a workspace in 5 minutes.
          </h2>
          <p className="mt-2 text-sm text-secondary">
            Pick a template, get your CRM, tools, and AI Assistant pre-wired,
            invite teammates. No card needed for the free tier.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/?signup=1"
              className="rounded-lg bg-tool-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Get started free
            </Link>
            <Link
              href="/templates"
              className="rounded-lg border border-app bg-app-elevated px-5 py-2.5 text-sm font-medium transition-colors hover:border-tool-accent"
            >
              Browse templates
            </Link>
          </div>
        </section>

        {/* Other alternatives */}
        <section className="mt-14">
          <h2 className="text-base font-semibold">Compare against another tool</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {otherAlts.map((s) => (
              <Link
                key={s}
                href={`/alternative-to/${s}`}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-sm transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                {COMPARE_COLUMN_LABELS[s] ?? s} alternative
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
