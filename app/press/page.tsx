import Link from "next/link";

export const metadata = {
  title: "Press kit · Space Field",
  description: "Logos, founder bio, and assets for journalists and partners.",
};

// Press kit changes only on deploy (asset list is hard-coded).
// Generous ISR — this page is rarely visited and rarely changes.
export const revalidate = 3600;

interface Asset {
  label: string;
  href: string;
  description: string;
}

const LOGO_ASSETS: Asset[] = [
  { label: "Logo (SVG, dark mark)", href: "/icon-mark-dark.svg", description: "Vector. Use on light backgrounds." },
  { label: "Logo (PNG)", href: "/icon-512.png", description: "Raster, 512×512. Use when SVG isn't supported." },
];

export default function PressPage() {
  return (
    <main className="min-h-screen bg-app text-app">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <Link
          href="/"
          className="text-[0.6rem] uppercase tracking-[0.25em] text-faint hover:text-app"
        >
          ← Space Field
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Press kit</h1>
        <p className="mt-2 text-sm text-secondary">
          Everything a journalist, partner, or reviewer might need. For
          anything not covered here, reach{" "}
          <a className="underline" href="mailto:press@spacefield.co">
            press@spacefield.co
          </a>
          .
        </p>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-semibold">About Space Field</h2>
          <p className="text-sm leading-relaxed text-secondary">
            Space Field is an AI-powered workspace platform built for
            real-estate and business teams in the MENA region. It bundles a
            native CRM, People (HR), Tasks, files, an AI Assistant that
            spans the whole workspace, and 130+ purpose-built tools —
            including property valuation, market pulse, sales-offer
            generation, and poster creation — into a single desktop-OS-style
            workspace. Built in the UAE.
          </p>
          <ul className="ml-4 list-disc text-sm text-secondary">
            <li>Founded: 2026</li>
            <li>Headquarters: Dubai, United Arab Emirates</li>
            <li>Founder: Asad Iqbal</li>
            <li>Website: spacefield.co</li>
            <li>Press contact: press@spacefield.co</li>
          </ul>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-semibold">Logos</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {LOGO_ASSETS.map((a) => (
              <a
                key={a.href}
                href={a.href}
                download
                className="rounded-xl border border-app bg-app-elevated p-4 transition-colors hover:border-tool-accent"
              >
                <div className="text-sm font-medium">{a.label}</div>
                <div className="mt-1 text-xs text-secondary">{a.description}</div>
                <div className="mt-2 font-mono text-[11px] text-faint">
                  {a.href}
                </div>
              </a>
            ))}
          </div>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-semibold">Founder bio</h2>
          <p className="text-sm leading-relaxed text-secondary">
            Asad Iqbal — UAE-based founder building Space Field. Background in
            real estate operations and product. Long-form bio and headshot
            available on request.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-semibold">Boilerplate</h2>
          <p className="rounded-xl border border-app bg-app-elevated p-4 text-sm leading-relaxed text-secondary">
            Space Field is an AI-powered workspace for real-estate and
            business teams across the MENA region. The platform combines a
            native CRM, People (HR), Tasks, files, and a workspace-wide AI
            Assistant with 130+ purpose-built tools — from property
            valuation and market pulse to sales-offer generation and poster
            creation — all inside a single desktop-OS-style browser
            workspace. Founded in 2026 and built in the UAE.
          </p>
          <p className="text-xs text-muted">
            Short version (one sentence): Space Field is an AI-powered
            workspace platform that bundles CRM, People, Tasks, an AI
            Assistant, and 130+ business tools into one desktop-OS-style
            browser experience for the MENA market.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-semibold">FAQs from press</h2>
          <details className="rounded-xl border border-app bg-app-elevated p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Is Spacefield only for real estate?
            </summary>
            <p className="mt-2 text-sm text-secondary">
              No — real estate is our anchor vertical, but the platform
              ships a native CRM, People (HR), Tasks, files, and a
              workspace-wide AI Assistant that work across any business.
              Workspace templates today cover real estate, marketing, and
              operations, with more on the way.
            </p>
          </details>
          <details className="rounded-xl border border-app bg-app-elevated p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Which AI models do you use?
            </summary>
            <p className="mt-2 text-sm text-secondary">
              We route requests to Anthropic Claude as the primary model and
              OpenAI as a fallback. We do not train models on customer data.
            </p>
          </details>
          <details className="rounded-xl border border-app bg-app-elevated p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Where is data stored?
            </summary>
            <p className="mt-2 text-sm text-secondary">
              On Supabase infrastructure in the European Union, with daily
              backups and point-in-time recovery. Full detail on the{" "}
              <a className="underline" href="/legal/security">
                Trust &amp; security
              </a>{" "}
              page.
            </p>
          </details>
        </section>
      </div>
    </main>
  );
}
