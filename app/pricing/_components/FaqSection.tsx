/* FaqSection — eight short Q&A cards on the /pricing page.
 *
 * Plain English, no fluff. The "refund" entry links to /refund where
 * the actual policy lives. Renders as <details> so it's accessible
 * without JS and works in the RSC stream. */

import Link from "next/link";

interface FaqItem {
  q: string;
  a: React.ReactNode;
}

const ITEMS: FaqItem[] = [
  {
    q: "Can I change plans anytime?",
    a: (
      <>
        Yes. Upgrade and the higher cap is live immediately. Downgrade and
        the change applies at the end of your current billing period — you
        keep what you paid for until then.
      </>
    ),
  },
  {
    q: "Do you pro-rate upgrades?",
    a: (
      <>
        Yes. When you upgrade mid-period, Paddle bills the difference
        pro-rated to the days remaining. Downgrades are not pro-rated —
        they take effect at period end.
      </>
    ),
  },
  {
    q: "What payment methods do you accept?",
    a: (
      <>
        Card, Apple Pay, Google Pay, and a handful of local methods,
        depending on your region. Checkout runs through Paddle, our
        merchant of record, so taxes and invoices are handled for you.
      </>
    ),
  },
  {
    q: "Can I get a refund?",
    a: (
      <>
        For first-time subscribers, yes — within 14 days. For renewals and
        add-ons we evaluate case by case. Full policy at{" "}
        <Link
          href="/refund"
          className="font-medium text-tool-accent hover:underline"
        >
          /refund
        </Link>
        .
      </>
    ),
  },
  {
    q: "Does my workspace data move with me?",
    a: (
      <>
        Yes. Your workspaces, files, tools, contacts, and chat history are
        tied to your account, not your tier. If you cancel you keep
        read-only access to your data; you just can&apos;t add past the
        Free cap until you upgrade again.
      </>
    ),
  },
  {
    q: "What happens if I exceed my storage?",
    a: (
      <>
        Existing files stay readable. New uploads are blocked until you
        free up space, attach a storage add-on, or upgrade your tier. We
        never silently delete a file you paid to store.
      </>
    ),
  },
  {
    q: "Can I use the platform for client work?",
    a: (
      <>
        Yes. Pro and Team are designed for it — separate workspaces per
        client, role-based access, and a CRM that keeps each client&apos;s
        contacts and deals isolated. Enterprise adds custom contracts and
        SLAs.
      </>
    ),
  },
  {
    q: "Do you offer education or non-profit discounts?",
    a: (
      <>
        Yes — meaningful ones.{" "}
        <a
          href="mailto:sales@spacefield.co"
          className="font-medium text-tool-accent hover:underline"
        >
          Email sales@spacefield.co
        </a>{" "}
        from your org domain and we&apos;ll sort it out.
      </>
    ),
  },
];

export default function FaqSection() {
  return (
    <section className="border-b border-app/40 bg-app">
      <div className="mx-auto max-w-4xl px-5 py-20 sm:py-24">
        <header className="text-center">
          <span className="text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent">
            FAQ
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-app sm:text-4xl">
            Questions, answered.
          </h2>
        </header>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {ITEMS.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-app bg-app-elevated p-5 transition-colors hover:border-tool-accent/60"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-sm font-semibold text-app">
                <span>{item.q}</span>
                <span className="mt-0.5 text-tool-accent transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="mt-3 text-sm leading-relaxed text-secondary">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
