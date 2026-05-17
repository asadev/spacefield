/* /compare — feature matrix of Space Field vs the four headline rivals.
 *
 * Static-ish content: re-renders if the competitors data ever changes.
 * 5-minute ISR so an edit deploys promptly without re-rendering on every
 * marketing visit.
 *
 * Tone: honest. "no" appears when we don't have parity; "partial" where
 * the competitor's coverage is real but caveated. Footnotes show as
 * accessible <abbr title="..."> on the cell.
 */

import Link from "next/link";
import type { Metadata } from "next";

import {
  COMPARE_COLUMN_SLUGS,
  COMPARE_COLUMN_LABELS,
  COMPARE_FEATURES,
  COMPETITORS,
  type FeatureSupport,
} from "../alternative-to/_data/competitors";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Compare Space Field vs Salesforce, HubSpot, Zoho One, Notion",
  description:
    "Honest, side-by-side feature comparison of Space Field with the major CRM and productivity platforms. No marketing fluff — we mark 'no' where we don't have parity.",
  alternates: { canonical: "/compare" },
};

const SUPPORT_SYMBOL: Record<FeatureSupport, string> = {
  yes: "✓",
  no: "—",
  partial: "~",
};

const SUPPORT_LABEL: Record<FeatureSupport, string> = {
  yes: "Yes",
  no: "No",
  partial: "Partial",
};

const SUPPORT_CLASS: Record<FeatureSupport, string> = {
  yes: "text-emerald-500 font-semibold",
  no: "text-muted",
  partial: "text-amber-500 font-semibold",
};

export default function ComparePage() {
  const altSlugs = COMPETITORS.filter((c) => c.alternativePage).map(
    (c) => c.slug
  );

  return (
    <main className="min-h-screen bg-app text-app">
      <div className="mx-auto max-w-6xl px-5 py-16">
        <Link
          href="/"
          className="text-[0.65rem] uppercase tracking-[0.25em] text-faint hover:text-app"
        >
          ← Space Field
        </Link>

        <header className="mt-6 max-w-3xl">
          <span className="text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent">
            Compare
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Space Field vs Salesforce, HubSpot, Zoho One, Notion.
          </h1>
          <p className="mt-4 text-base text-secondary">
            Honest side-by-side. We mark{" "}
            <span className="font-semibold text-emerald-500">✓ yes</span> only
            where we ship today,{" "}
            <span className="font-semibold text-amber-500">~ partial</span>{" "}
            when it's real but caveated, and{" "}
            <span className="font-semibold text-muted">— no</span> when the
            competitor wins. Hover any cell for a footnote.
          </p>
        </header>

        <div className="mt-10 overflow-x-auto rounded-2xl border border-app bg-app-elevated">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-app">
                <th className="sticky start-0 z-10 bg-app-elevated px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted">
                  Feature
                </th>
                {COMPARE_COLUMN_SLUGS.map((slug) => (
                  <th
                    key={slug}
                    className={`px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider ${
                      slug === "spacefield"
                        ? "text-tool-accent"
                        : "text-muted"
                    }`}
                  >
                    {COMPARE_COLUMN_LABELS[slug]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_FEATURES.map((row, i) => (
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
                    className="sticky start-0 z-10 bg-inherit px-4 py-3 text-start font-medium text-app"
                  >
                    {row.feature}
                    {row.detail && (
                      <div className="mt-1 text-xs font-normal text-muted">
                        {row.detail}
                      </div>
                    )}
                  </th>
                  {COMPARE_COLUMN_SLUGS.map((slug) => {
                    const support = row.support[slug] ?? "no";
                    const note = row.note?.[slug];
                    const cell = (
                      <span
                        className={`text-base ${SUPPORT_CLASS[support]}`}
                        aria-label={SUPPORT_LABEL[support]}
                      >
                        {SUPPORT_SYMBOL[support]}
                      </span>
                    );
                    return (
                      <td key={slug} className="px-4 py-3 align-top">
                        {note ? (
                          <abbr
                            title={note}
                            className="cursor-help no-underline"
                          >
                            {cell}
                          </abbr>
                        ) : (
                          cell
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-12 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-app bg-app-elevated p-6">
            <h2 className="text-lg font-semibold">Where we win</h2>
            <p className="mt-2 text-sm text-secondary">
              Real-estate-native tools, a desktop-OS UI, an AI Assistant that
              works across every tool (not per-feature), workspace templates
              that ship with real apps installed, and one per-seat price.
            </p>
          </div>
          <div className="rounded-2xl border border-app bg-app-elevated p-6">
            <h2 className="text-lg font-semibold">Where we don't</h2>
            <p className="mt-2 text-sm text-secondary">
              Massive integration marketplaces, decades-old enterprise
              governance depth, and category-leading mind-map / whiteboard
              tooling — competitors who started 10+ years ago still lead
              there. We'll catch up. We're not pretending.
            </p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold">Looking for a specific alternative?</h2>
          <p className="mt-2 text-sm text-secondary">
            Deep-dive pages with the five reasons people switch:
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {altSlugs.map((slug) => (
              <Link
                key={slug}
                href={`/alternative-to/${slug}`}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-sm transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Alternative to {COMPARE_COLUMN_LABELS[slug] ?? slug}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-2xl border border-tool-accent bg-tool-accent-soft p-8 text-center">
          <h2 className="text-xl font-semibold">Try it for yourself</h2>
          <p className="mt-2 text-sm text-secondary">
            Sign up free, pick a template, and have a working CRM + tools +
            AI Assistant in under 5 minutes.
          </p>
          <Link
            href="/?signup=1"
            className="mt-5 inline-flex rounded-lg bg-tool-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Get started free
          </Link>
        </section>
      </div>
    </main>
  );
}
