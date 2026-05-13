import Link from "next/link";

export const metadata = {
  title: "Changelog · Space Field",
  description: "Recent updates and improvements to Space Field.",
};

interface ChangelogEntry {
  date: string;
  title: string;
  tag: "shipped" | "fixed" | "improved" | "security";
  description: string;
}

/**
 * Handcrafted changelog. We deliberately don't auto-derive from git
 * commits because users don't care about "refactor: split helper" —
 * they want to see what changed for them. Update this file when
 * shipping a user-facing change.
 */
const ENTRIES: ChangelogEntry[] = [
  {
    date: "May 13, 2026",
    title: "Security headers + request IDs",
    tag: "security",
    description:
      "Every page now serves HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy and Permissions-Policy. A request ID is set on every response so support tickets can be matched to logs.",
  },
  {
    date: "May 13, 2026",
    title: "Legal pages live",
    tag: "shipped",
    description:
      "Terms of Service, Privacy Policy, Acceptable Use Policy, DPA, Subprocessors, Trust & security, Accessibility, and Cookie policy are now public.",
  },
  {
    date: "May 13, 2026",
    title: "Public roadmap + press kit",
    tag: "shipped",
    description:
      "Two new pages — /roadmap and /press — so customers and journalists can see where we're going and grab assets.",
  },
  {
    date: "May 9, 2026",
    title: "Admin panel — full control plane",
    tag: "shipped",
    description:
      "~50 admin routes covering AI, apps, users, workspaces, runtime config, observability, security, communication, experience, money, and content.",
  },
  {
    date: "May 9, 2026",
    title: "Custom iframe app registration",
    tag: "shipped",
    description:
      "Admins can plug in third-party iframe apps that show up alongside built-in tools.",
  },
  {
    date: "May 9, 2026",
    title: "Workflow runner",
    tag: "shipped",
    description:
      "Define multi-step workflows in admin and trigger them from a Run button. Run history captured in workflow_runs.",
  },
  {
    date: "May 2, 2026",
    title: "Share universal sharing",
    tag: "shipped",
    description:
      "Mint a public share link for any tool output. Lives on its own domain at share.example.com.",
  },
  {
    date: "Apr 28, 2026",
    title: "Pricing redesign + CRM phases 1-3",
    tag: "improved",
    description:
      "New pricing page; Forms, contacts, and pipeline live in CRM.",
  },
  {
    date: "Apr 27, 2026",
    title: "Mobile-first redesign",
    tag: "improved",
    description:
      "Phone layout pass across the main app. Tools surface optimised for thumb use.",
  },
];

const TAG_COLORS: Record<ChangelogEntry["tag"], string> = {
  shipped: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  fixed: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  improved: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  security: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export default function ChangelogPage() {
  return (
    <main className="min-h-screen bg-app text-app">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href="/"
          className="text-[0.6rem] uppercase tracking-[0.25em] text-faint hover:text-app"
        >
          ← Space Field
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Changelog</h1>
        <p className="mt-2 text-sm text-secondary">
          What we shipped, fixed, and improved — newest first.
        </p>

        <ul className="mt-10 space-y-6">
          {ENTRIES.map((e, idx) => (
            <li key={idx} className="border-l-2 border-app pl-6">
              <div className="flex items-baseline gap-3">
                <time className="text-xs text-faint">{e.date}</time>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${TAG_COLORS[e.tag]}`}
                >
                  {e.tag}
                </span>
              </div>
              <h2 className="mt-1 text-lg font-semibold">{e.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-secondary">
                {e.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
