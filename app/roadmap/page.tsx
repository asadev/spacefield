import Link from "next/link";

export const metadata = {
  title: "Roadmap · Space Field",
  description: "What we shipped recently, what we're building now, and what's next.",
};

/**
 * Public roadmap — handcrafted, NOT auto-derived from the internal
 * checklist. We don't want internal P0/P1 priorities or vendor names
 * leaking onto a public page. Editor: update the three buckets below
 * as items move between them.
 */

interface RoadmapItem {
  title: string;
  description: string;
}

const SHIPPED: RoadmapItem[] = [
  { title: "AI Property Poster Creator", description: "Generate marketing-ready property posters with AI sidekicks." },
  { title: "Share universal sharing", description: "Public share links for any tool output, on share.example.com." },
  { title: "CRM + Forms + Pipeline", description: "Capture leads, manage contacts, move them through a pipeline." },
  { title: "AI assistants across the platform", description: "Tool-specific sidekicks plus a general Space Field assistant." },
  { title: "Mobile-responsive redesign", description: "Phone-first layout pass across the main app." },
  { title: "Workspace permissions + roles", description: "Per-tier, per-workspace, per-user feature gating." },
];

const IN_PROGRESS: RoadmapItem[] = [
  { title: "Public uptime page on status.spacefield.co", description: "Real-time uptime + incident history." },
  { title: "External error tracking", description: "Sentry-grade error grouping with source maps." },
  { title: "MFA / 2FA for end users", description: "TOTP-based second factor." },
  { title: "Arabic (RTL) layout polish", description: "Full right-to-left pass across the marketing surface." },
  { title: "Public API + developer docs", description: "Programmatic access to tools via API tokens." },
];

const NEXT_UP: RoadmapItem[] = [
  { title: "Annual billing + discount", description: "Pay yearly, save 20%." },
  { title: "Embeddable widgets", description: "Drop a Property Poster generator into your own site." },
  { title: "Slack + Google Workspace integrations", description: "Two-way sync with the tools you already use." },
  { title: "Native iOS + Android apps", description: "Currently in beta; broader availability planned." },
  { title: "Knowledge-base RAG for the Assistant", description: "Ground answers in your workspace docs + market data." },
];

export default function RoadmapPage() {
  return (
    <main className="min-h-screen bg-app text-app">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <Link
          href="/"
          className="text-[0.6rem] uppercase tracking-[0.25em] text-faint hover:text-app"
        >
          ← Space Field
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Roadmap</h1>
        <p className="mt-2 max-w-2xl text-sm text-secondary">
          What we shipped recently, what we&apos;re actively building, and
          what&apos;s coming next. Want to influence priorities? Vote on the{" "}
          <a className="underline" href="mailto:hello@spacefield.co">
            feature request inbox
          </a>{" "}
          or fill in our{" "}
          <Link className="underline" href="/waitlist">
            waitlist
          </Link>
          .
        </p>

        <section className="mt-10">
          <h2 className="flex items-baseline gap-2 text-lg font-semibold">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Shipped
          </h2>
          <ul className="mt-3 space-y-2">
            {SHIPPED.map((it) => (
              <RoadmapRow key={it.title} item={it} />
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="flex items-baseline gap-2 text-lg font-semibold">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            In progress
          </h2>
          <ul className="mt-3 space-y-2">
            {IN_PROGRESS.map((it) => (
              <RoadmapRow key={it.title} item={it} />
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="flex items-baseline gap-2 text-lg font-semibold">
            <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
            Next up
          </h2>
          <ul className="mt-3 space-y-2">
            {NEXT_UP.map((it) => (
              <RoadmapRow key={it.title} item={it} />
            ))}
          </ul>
        </section>

        <p className="mt-12 text-xs text-faint">
          Dates and priorities can change. This page is updated regularly.
        </p>
      </div>
    </main>
  );
}

function RoadmapRow({ item }: { item: RoadmapItem }) {
  return (
    <li className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="font-medium">{item.title}</div>
      <div className="mt-1 text-sm text-secondary">{item.description}</div>
    </li>
  );
}
