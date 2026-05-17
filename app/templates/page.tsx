/* /templates — public template library.
 *
 * Lists the three shipped workspace templates (Real Estate / Marketing /
 * Finance) from W6 plus four conceptual templates we're seeding for
 * upcoming launches. Each card has a "Sign up to apply" CTA which lands
 * the visitor on the sign-up flow with the template key as a query
 * param — Desktop reads it after auth.
 *
 * Static-ish: 5-minute ISR.
 */

import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Workspace templates — Space Field",
  description:
    "Pre-configured workspaces for real estate, marketing, co-working, property developers, hotels and brokerage managers. One-click setup of CRM, tools, dock, and AI assistant.",
  alternates: { canonical: "/templates" },
};

type TemplateCard = {
  /** Workspace template key matching applyWorkspaceTemplate(); null when conceptual. */
  key: string | null;
  name: string;
  tagline: string;
  audience: string;
  /** Showcase tools (slugs, lowercased) that appear on the card. */
  tools: string[];
  /** Whether this template ships today vs is "Coming soon". */
  available: boolean;
  accent: "violet" | "cyan" | "emerald" | "amber" | "rose" | "indigo" | "slate";
};

const TEMPLATES: TemplateCard[] = [
  {
    key: "real-estate",
    name: "Real Estate Agency",
    tagline: "Sell more property with less app-juggling.",
    audience: "Brokers, agents, listings teams.",
    tools: [
      "Property Valuation",
      "Deal Scoring",
      "Market Pulse",
      "Sales Offer Generator",
      "Property Poster Creator",
      "Mortgage Calculator",
    ],
    available: true,
    accent: "violet",
  },
  {
    key: "marketing",
    name: "Marketing Agency",
    tagline: "Brief, write, ship, measure — all on one canvas.",
    audience: "In-house marketing teams and small agencies.",
    tools: [
      "Content Brief Builder",
      "Headline Analyzer",
      "SEO Meta Tags",
      "A/B Sample Size",
      "Ad Budget Allocator",
      "Email ROI",
    ],
    available: true,
    accent: "cyan",
  },
  {
    key: "finance-ops",
    name: "Co-working / Operations",
    tagline: "Runway, cash burn, NPV — the operator's bench.",
    audience: "Founders, co-working hubs, ops teams.",
    tools: [
      "NPV / IRR",
      "Cash Burn & Runway",
      "Runway Scenarios",
      "Sheets",
      "Documents",
    ],
    available: true,
    accent: "emerald",
  },
  {
    key: null,
    name: "Property Developer",
    tagline: "From land deal to handover — one workspace.",
    audience: "Developers running multi-phase projects.",
    tools: [
      "Investment Advisor",
      "ROI Calculator",
      "Property Valuation",
      "Market Pulse",
      "Tasks",
      "People",
      "Files",
    ],
    available: false,
    accent: "amber",
  },
  {
    key: null,
    name: "Boutique Hotel",
    tagline: "Guests, staff, reservations, revenue — together.",
    audience: "Independent hotels and short-stay operators.",
    tools: [
      "CRM (Guests)",
      "Tasks",
      "People",
      "Documents",
      "Email ROI",
      "AI Assistant",
    ],
    available: false,
    accent: "rose",
  },
  {
    key: null,
    name: "Brokerage Manager",
    tagline: "Lead routing, agent scoreboards, deal pipeline.",
    audience: "Managing brokers running 5–50 agents.",
    tools: [
      "CRM",
      "Deal Scoring",
      "Property Valuation",
      "People",
      "Tasks",
      "AI Assistant",
    ],
    available: false,
    accent: "indigo",
  },
  {
    key: null,
    name: "Consulting Practice",
    tagline: "Pitch, deliver, invoice — engagement-shaped.",
    audience: "Boutique consultancies and solo consultants.",
    tools: [
      "CRM",
      "Tasks",
      "Documents",
      "NPV / IRR",
      "Quote Builder",
      "AI Assistant",
    ],
    available: false,
    accent: "slate",
  },
];

const ACCENT_BG: Record<TemplateCard["accent"], string> = {
  violet: "from-violet-500/15 to-violet-500/0",
  cyan: "from-cyan-500/15 to-cyan-500/0",
  emerald: "from-emerald-500/15 to-emerald-500/0",
  amber: "from-amber-500/15 to-amber-500/0",
  rose: "from-rose-500/15 to-rose-500/0",
  indigo: "from-indigo-500/15 to-indigo-500/0",
  slate: "from-slate-500/15 to-slate-500/0",
};

const ACCENT_RING: Record<TemplateCard["accent"], string> = {
  violet: "border-violet-500/30",
  cyan: "border-cyan-500/30",
  emerald: "border-emerald-500/30",
  amber: "border-amber-500/30",
  rose: "border-rose-500/30",
  indigo: "border-indigo-500/30",
  slate: "border-slate-500/30",
};

export default function TemplatesPage() {
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
            Templates
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Workspaces, pre-assembled.
          </h1>
          <p className="mt-4 text-base text-secondary">
            Sign up, pick a template, and a complete workspace appears —
            tools installed, dock pinned, CRM boards laid out, AI Assistant
            tuned to the role. No setup wizard you abandon halfway.
          </p>
        </header>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((t) => (
            <article
              key={t.name}
              className={`relative overflow-hidden rounded-2xl border bg-app-elevated p-6 ${ACCENT_RING[t.accent]}`}
            >
              <div
                aria-hidden="true"
                className={`absolute inset-0 -z-10 bg-gradient-to-br ${ACCENT_BG[t.accent]}`}
              />

              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold text-app">{t.name}</h2>
                {!t.available && (
                  <span className="rounded-full border border-app bg-app px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-muted">
                    Coming soon
                  </span>
                )}
              </div>

              <p className="mt-1.5 text-sm text-secondary">{t.tagline}</p>
              <p className="mt-2 text-xs text-muted">{t.audience}</p>

              <div className="mt-5">
                <div className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                  Includes
                </div>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {t.tools.map((tool) => (
                    <li
                      key={tool}
                      className="rounded-md border border-app bg-app px-2 py-1 text-[0.7rem] text-secondary"
                    >
                      {tool}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6">
                {t.available && t.key ? (
                  <Link
                    href={`/?signup=1&template=${encodeURIComponent(t.key)}`}
                    className="inline-flex w-full justify-center rounded-lg bg-tool-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    Sign up to apply
                  </Link>
                ) : (
                  <Link
                    href="/contact?subject=Template+interest"
                    className="inline-flex w-full justify-center rounded-lg border border-app bg-app-elevated px-4 py-2 text-sm font-medium text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                  >
                    Notify me
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>

        <section className="mt-16 rounded-2xl border border-app bg-app-elevated p-8">
          <h2 className="text-xl font-semibold">Don't see your industry?</h2>
          <p className="mt-2 text-sm text-secondary">
            Every workspace is built from the same 130+ tools, plus CRM,
            tasks, people, files, AI Assistant. Start with the closest
            template — or empty — and re-shape it in a few minutes.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/?signup=1"
              className="rounded-lg bg-tool-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Start with a blank workspace
            </Link>
            <Link
              href="/contact?subject=Custom+template+request"
              className="rounded-lg border border-app bg-app px-5 py-2.5 text-sm font-medium transition-colors hover:border-tool-accent"
            >
              Request a template
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
