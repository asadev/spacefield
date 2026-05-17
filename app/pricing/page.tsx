import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import TierGrid from "./_components/TierGrid";
import CurrencySwitcher from "@/components/CurrencySwitcher";

/* Mobile-perf (Wave 4 Z2): the Hero + TierGrid is the only thing above
 * the fold on a mobile cold load. The 422-line ComparisonTable, the
 * AddonSection, and FaqSection are all below the fold — defer them so
 * the cold paint downloads only what's visible. SSR stays on so SEO
 * (and the no-JS view) still renders the full page; the savings are
 * the parse/eval cost on the client. */
const ComparisonTable = dynamic(() => import("./_components/ComparisonTable"));
const AddonSection = dynamic(() => import("./_components/AddonSection"));
const FaqSection = dynamic(() => import("./_components/FaqSection"));

/* /pricing — public pricing page.
 *
 * Layout, top to bottom:
 *   1. Top nav (own simple nav so the page is full-bleed and
 *      doesn't fight the MarketingShell max-w-3xl container)
 *   2. <TierGrid /> — Hero + 4-card tier grid (one client island that
 *      shares Annual/Monthly state)
 *   3. <AddonSection /> — three storage add-on cards
 *   4. <ComparisonTable /> — full feature matrix, sticky-left columns
 *      on desktop, swipeable tier-tab accordion on mobile
 *   5. <FaqSection /> — eight Q&A cards
 *   6. CTA strip — "Start with Free. Upgrade when you grow."
 *   7. Footer mirroring Landing.tsx
 *
 * Tier copy (price, storage, member counts) lives inline in
 * TierGrid.tsx. The Supabase subscription_tiers table is no longer the
 * source of truth for the marketing page — it was a stub. Real tier
 * caps come from Paddle products + the cap RPCs server-side. Keeping
 * the marketing copy in the codebase lets us iterate it without
 * touching the DB. */

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Pricing that fits your team. One workspace OS, every tool included. Start free, upgrade when you grow. Free, Pro, Team, and Enterprise plans.",
};

// Pricing copy is hard-coded in TierGrid.tsx — no DB read, no
// dynamic data. 5-minute ISR window is conservative; the page only
// changes when we redeploy with new copy or new tier structure.
export const revalidate = 300;

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-app text-app">
      <PricingTopNav />
      <TierGrid />
      <AddonSection />
      <ComparisonTable />
      <FaqSection />
      <CtaStrip />
      <PricingFooter />
    </main>
  );
}

function PricingTopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-app bg-app-elevated/85 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-5 w-5 rounded-md"
            style={{
              background:
                "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 50%, #06b6d4))",
            }}
          />
          <span className="text-sm font-semibold tracking-tight text-app">
            Space Field
          </span>
        </Link>

        <div className="ms-auto flex items-center gap-1 sm:gap-2">
          <CurrencySwitcher className="hidden sm:inline-flex" />
          <Link
            href="/pricing"
            className="rounded-md px-3 py-1.5 text-sm text-app sm:inline-block"
          >
            Pricing
          </Link>
          <Link
            href="/about"
            className="hidden rounded-md px-3 py-1.5 text-sm text-secondary transition-colors hover:text-app sm:inline-block"
          >
            About
          </Link>
          <Link
            href="/signin"
            className="rounded-md px-3 py-1.5 text-sm text-tool-accent transition-colors hover:bg-tool-accent-soft"
          >
            Sign in
          </Link>
          <Link
            href="/signin?next=%2Fpricing"
            className="rounded-md bg-tool-accent px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
          >
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}

function CtaStrip() {
  return (
    <section className="border-b border-app/40 bg-app-elevated">
      <div className="mx-auto max-w-5xl px-5 py-20 sm:py-24">
        <div className="relative isolate overflow-hidden rounded-3xl border border-app bg-app p-10 sm:p-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent) 30%, transparent), transparent 55%), radial-gradient(circle at 100% 100%, rgba(6,182,212,0.25), transparent 55%)",
              opacity: 0.7,
            }}
          />
          <div className="relative">
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-app sm:text-4xl">
              Start with Free. Upgrade when you grow.
            </h2>
            <p className="mt-4 max-w-2xl text-base text-secondary">
              Every tool, every editor, the full CRM, and shared chat — on
              the Free plan from day one. Your workspace and data move
              with you when you upgrade.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signin?next=%2Fpricing"
                className="rounded-lg bg-tool-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              >
                Get started
              </Link>
              <a
                href="mailto:sales@spacefield.co"
                className="rounded-lg border border-app bg-app-elevated px-5 py-2.5 text-sm font-semibold text-app transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Talk to sales
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingFooter() {
  return (
    <footer className="bg-app-elevated">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-5 w-5 rounded-md"
                style={{
                  background:
                    "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 50%, #06b6d4))",
                }}
              />
              <span className="text-sm font-semibold text-app">
                Space Field
              </span>
            </div>
            <p className="mt-3 max-w-xs text-xs text-muted">
              A desktop OS for the web. Local first, yours always.
            </p>
          </div>

          <FooterColumn
            heading="Product"
            links={[
              { label: "Pricing", href: "/pricing" },
              { label: "About", href: "/about" },
            ]}
          />
          <FooterColumn
            heading="Legal"
            links={[
              { label: "Privacy", href: "/privacy" },
              { label: "Terms", href: "/terms" },
              { label: "Refunds", href: "/refund" },
            ]}
          />
          <FooterColumn
            heading="Contact"
            links={[
              { label: "Get in touch", href: "/contact" },
              { label: "Sales", href: "mailto:sales@spacefield.co" },
            ]}
          />
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-app pt-6 text-xs text-muted">
          <span>© {new Date().getFullYear()} Space Field</span>
          <span>Made with care.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  heading,
  links,
}: {
  heading: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <span className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
        {heading}
      </span>
      <ul className="mt-3 space-y-2">
        {links.map((l) =>
          l.href.startsWith("mailto:") ? (
            <li key={l.href}>
              <a
                href={l.href}
                className="text-sm text-secondary transition-colors hover:text-app"
              >
                {l.label}
              </a>
            </li>
          ) : (
            <li key={l.href}>
              <Link
                href={l.href}
                className="text-sm text-secondary transition-colors hover:text-app"
              >
                {l.label}
              </Link>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
