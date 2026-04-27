"use client";

/* Marketing landing page for spacefield.co.
 *
 * Shown only to visitors who:
 *   - Have no local workspaces, AND
 *   - Are not signed in.
 *
 * HomeGate decides which to render. Once the user signs in (via the
 * SignInDialog rendered here) the auth-state listener in HomeGate flips
 * the page to <Desktop/> without a refresh.
 *
 * Sections, in order:
 *   1. Sticky top nav
 *   2. Hero with animated glow + dual CTAs
 *   3. Faux-desktop screenshot card
 *   4. Why Space Field — 3-column value props
 *   5. Tools strip — top-rated tools horizontal scroll
 *   6. Workspaces & roles split
 *   7. Pricing teaser
 *   8. FAQ accordion
 *   9. Multi-column footer
 *
 * Tokens only — no `text-white` / `dark:` variants. The accent var
 * (--accent, violet) is used for primary CTAs and glows. */

import Link from "next/link";
import { useEffect, useState } from "react";
import { TOOLS, TOOL_ICONS } from "../tools/_data/tools-list";
import { AuthProvider } from "../tools/_components/useAuth";
import SignInDialog from "../tools/_components/SignInDialog";

export default function Landing() {
  // Wrap in AuthProvider so SignInDialog (which calls useAuth) works
  // without needing the full Desktop tree mounted. AuthProvider here is
  // separate from the one Desktop mounts after login — only one is ever
  // alive at a time because HomeGate swaps the subtree.
  return (
    <AuthProvider>
      <LandingShell />
    </AuthProvider>
  );
}

function LandingShell() {
  const [signInOpen, setSignInOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const openSignIn = () => setSignInOpen(true);

  return (
    <main className="min-h-screen bg-app text-app">
      <TopNav scrolled={scrolled} onSignIn={openSignIn} />
      <Hero onSignIn={openSignIn} />
      <DesktopShowcase />
      <ValueProps />
      <ToolsStrip />
      <WorkspacesSplit />
      <PricingTeaser onSignIn={openSignIn} />
      <FAQ />
      <Footer />

      <SignInDialog open={signInOpen} onClose={() => setSignInOpen(false)} />
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* TopNav                                                              */
/* ------------------------------------------------------------------ */

function TopNav({
  scrolled,
  onSignIn,
}: {
  scrolled: boolean;
  onSignIn: () => void;
}) {
  return (
    <header
      className={`sticky top-0 z-50 w-full transition-colors duration-200 ${
        scrolled
          ? "border-b border-app bg-app-elevated/85 backdrop-blur"
          : "border-b border-transparent bg-transparent"
      }`}
    >
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

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            href="/pricing"
            className="hidden rounded-md px-3 py-1.5 text-sm text-secondary transition-colors hover:text-app sm:inline-block"
          >
            Pricing
          </Link>
          <Link
            href="/about"
            className="hidden rounded-md px-3 py-1.5 text-sm text-secondary transition-colors hover:text-app sm:inline-block"
          >
            About
          </Link>
          <button
            type="button"
            onClick={onSignIn}
            className="rounded-md px-3 py-1.5 text-sm text-tool-accent transition-colors hover:bg-tool-accent-soft"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={onSignIn}
            className="rounded-md bg-tool-accent px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
          >
            Sign up
          </button>
        </div>
      </nav>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function Hero({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Animated glow layers — same vibe as the workspace background */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="landing-glow landing-glow-a" />
        <div className="landing-glow landing-glow-b" />
        <div className="landing-grid" />
      </div>

      <div className="relative mx-auto flex min-h-[80vh] max-w-5xl flex-col items-start justify-center px-5 py-24 sm:py-32">
        <span className="rounded-full border border-app bg-app-elevated/60 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-secondary backdrop-blur">
          A desktop OS for the web
        </span>

        <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-app sm:text-5xl md:text-6xl lg:text-7xl">
          Your workspace,{" "}
          <span
            style={{
              background:
                "linear-gradient(120deg, var(--accent), color-mix(in srgb, var(--accent) 40%, #06b6d4))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            assembled
          </span>
          .
        </h1>

        <p className="mt-5 max-w-2xl text-base text-secondary sm:text-lg">
          Space Field is a desktop OS in your browser. Open real apps in
          windows, split work across named workspaces, and bring your team in
          when you're ready. Local first. Yours always.
        </p>

        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={onSignIn}
            className="rounded-xl bg-tool-accent px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[color:var(--accent-bg)] transition-opacity hover:opacity-90 active:opacity-80 sm:rounded-lg sm:py-2.5"
          >
            Get started
          </button>
          <button
            type="button"
            onClick={() => {
              /* demo placeholder */
            }}
            className="rounded-xl border border-app bg-app-elevated px-5 py-3 text-sm font-medium text-app transition-colors hover:bg-app active:bg-surface sm:rounded-lg sm:py-2.5"
          >
            Watch demo
          </button>
        </div>

        <p className="mt-5 text-xs text-muted">
          No credit card. Works offline. Ready in seconds.
        </p>
      </div>

      <style jsx>{`
        .landing-glow {
          position: absolute;
          width: 60vw;
          height: 60vw;
          border-radius: 50%;
          filter: blur(90px);
          opacity: 0.55;
          mix-blend-mode: screen;
        }
        .landing-glow-a {
          top: -15vw;
          left: -10vw;
          background: radial-gradient(
            circle at center,
            color-mix(in srgb, var(--accent) 70%, transparent) 0%,
            transparent 70%
          );
          animation: landing-drift-a 22s ease-in-out infinite;
        }
        .landing-glow-b {
          bottom: -20vw;
          right: -15vw;
          background: radial-gradient(
            circle at center,
            rgba(6, 182, 212, 0.55) 0%,
            rgba(6, 182, 212, 0) 70%
          );
          animation: landing-drift-b 26s ease-in-out infinite;
        }
        .landing-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(
              to right,
              color-mix(in srgb, var(--text) 6%, transparent) 1px,
              transparent 1px
            ),
            linear-gradient(
              to bottom,
              color-mix(in srgb, var(--text) 6%, transparent) 1px,
              transparent 1px
            );
          background-size: 48px 48px;
          mask-image: radial-gradient(
            ellipse at center,
            black 30%,
            transparent 70%
          );
          opacity: 0.4;
        }
        :global([data-theme="light"]) .landing-glow {
          opacity: 0.3;
          mix-blend-mode: multiply;
        }
        @keyframes landing-drift-a {
          0%,
          100% {
            transform: translate(0, 0);
          }
          50% {
            transform: translate(8vw, 6vh);
          }
        }
        @keyframes landing-drift-b {
          0%,
          100% {
            transform: translate(0, 0);
          }
          50% {
            transform: translate(-6vw, -4vh);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .landing-glow {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop showcase — fake OS chrome card                              */
/* ------------------------------------------------------------------ */

function DesktopShowcase() {
  return (
    <section className="bg-app-elevated">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <div className="overflow-hidden rounded-2xl border border-app bg-app shadow-2xl">
          {/* Faux topbar */}
          <div className="flex items-center justify-between border-b border-app px-4 py-2 text-xs text-secondary">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-app">Space Field</span>
              <span className="hidden sm:inline">File</span>
              <span className="hidden sm:inline">Window</span>
              <span className="hidden sm:inline">View</span>
              <span className="hidden sm:inline">Help</span>
            </div>
            <div className="flex items-center gap-2 text-muted">
              <span>9:41</span>
            </div>
          </div>

          {/* Faux desktop body */}
          <div className="relative h-[260px] sm:h-[360px] md:h-[420px] overflow-hidden">
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 20% 30%, color-mix(in srgb, var(--accent) 35%, transparent), transparent 55%), radial-gradient(circle at 80% 70%, rgba(6,182,212,0.35), transparent 55%), var(--bg)",
              }}
            />

            {/* Floating window 1 */}
            <FauxWindow
              title="Mortgage Calculator"
              className="absolute left-[6%] top-[14%] w-[52%] max-w-[360px]"
              accent="violet"
            />
            {/* Floating window 2 */}
            <FauxWindow
              title="Market Pulse"
              className="absolute right-[6%] top-[24%] w-[48%] max-w-[320px]"
              accent="cyan"
            />

            {/* Faux dock */}
            <div className="absolute inset-x-0 bottom-3 flex justify-center">
              <div className="flex items-center gap-2 rounded-2xl border border-app bg-app-elevated/80 px-3 py-2 backdrop-blur">
                {TOOLS.filter((t) => t.topRated)
                  .slice(0, 7)
                  .map((t) => (
                    <div
                      key={t.slug}
                      className="grid h-8 w-8 place-items-center rounded-lg bg-app text-tool-accent"
                      title={t.title}
                    >
                      <ToolIcon icon={t.icon} size={16} />
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>

        <p className="mx-auto mt-5 max-w-xl text-center text-sm text-muted">
          This is what spacefield.co opens to. Yours, with your apps.
        </p>
      </div>
    </section>
  );
}

function FauxWindow({
  title,
  className,
  accent,
}: {
  title: string;
  className: string;
  accent: "violet" | "cyan";
}) {
  return (
    <div
      className={`${className} rounded-xl border border-app bg-app-elevated shadow-2xl`}
    >
      <div className="flex items-center gap-2 border-b border-app px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 text-[11px] font-medium text-secondary">
          {title}
        </span>
      </div>
      <div className="space-y-2 p-3">
        <div
          className="h-2 w-2/3 rounded"
          style={{
            background:
              accent === "violet"
                ? "color-mix(in srgb, var(--accent) 40%, transparent)"
                : "rgba(6, 182, 212, 0.4)",
          }}
        />
        <div className="h-2 w-1/2 rounded bg-app" />
        <div className="h-2 w-3/4 rounded bg-app" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="h-10 rounded-lg bg-app" />
          <div className="h-10 rounded-lg bg-app" />
          <div
            className="h-10 rounded-lg"
            style={{
              background:
                accent === "violet"
                  ? "color-mix(in srgb, var(--accent) 30%, transparent)"
                  : "rgba(6, 182, 212, 0.25)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Value props                                                          */
/* ------------------------------------------------------------------ */

function ValueProps() {
  const items: { icon: keyof typeof TOOL_ICONS; title: string; body: string }[] =
    [
      {
        icon: "layers",
        title: "Multi-workspace from day one",
        body: "Split work, life, and side projects into named workspaces. Each one gets its own apps, files, dock, and wallpaper.",
      },
      {
        icon: "dashboard",
        title: "Real apps, not pages",
        body: "Every tool runs in its own native React window — drag, resize, minimize, snap. It's not a tab graveyard, it's an operating system.",
      },
      {
        icon: "shield",
        title: "Local first, sync when you want",
        body: "Everything works offline. Sign in only when you want cross-device sync. Your data, your timeline.",
      },
    ];

  return (
    <section className="bg-app">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <header className="max-w-2xl">
          <span className="text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent">
            Why Space Field
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-app sm:text-4xl">
            Built like the desktop you wish your browser had.
          </h2>
        </header>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.title}
              className="rounded-2xl border border-app bg-app-elevated p-6"
            >
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-tool-accent-soft text-tool-accent">
                <ToolIcon icon={it.icon} size={20} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-app">{it.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-secondary">
                {it.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tools strip — horizontal scroll                                      */
/* ------------------------------------------------------------------ */

function ToolsStrip() {
  const items = TOOLS.filter((t) => t.topRated).slice(0, 20);

  return (
    <section className="bg-app-elevated">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-xl">
            <span className="text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent">
              Apps
            </span>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-app sm:text-4xl">
              A native app for everything you do.
            </h2>
            <p className="mt-3 text-sm text-secondary">
              Calculators, dashboards, generators, planners — install only what
              you need, browse the rest in the App Store.
            </p>
          </div>
        </header>

        <div className="mt-10 -mx-5 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-3">
            {items.map((t) => (
              <div
                key={t.slug}
                className="flex w-[170px] shrink-0 flex-col items-start gap-3 rounded-xl border border-app bg-app p-4"
              >
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-tool-accent-soft text-tool-accent">
                  <ToolIcon icon={t.icon} size={20} />
                </div>
                <span className="line-clamp-2 text-sm font-medium text-app">
                  {t.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Workspaces & roles                                                   */
/* ------------------------------------------------------------------ */

function WorkspacesSplit() {
  return (
    <section className="bg-app">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <span className="text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent">
              Teams
            </span>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-app sm:text-4xl">
              Workspaces aren't folders. They're the unit of access.
            </h2>
            <p className="mt-4 text-base text-secondary">
              Invite teammates to a workspace, control what they can see and
              install, and keep your personal projects in a separate one of your
              own.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-secondary">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 grid h-5 w-5 place-items-center rounded-md bg-tool-accent-soft text-tool-accent">
                  <ToolIcon icon="trophy" size={12} />
                </span>
                <span>
                  <strong className="font-semibold text-app">Owner.</strong>{" "}
                  Billing, deletion, ownership transfer. One per workspace.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 grid h-5 w-5 place-items-center rounded-md bg-tool-accent-soft text-tool-accent">
                  <ToolIcon icon="shield" size={12} />
                </span>
                <span>
                  <strong className="font-semibold text-app">Admin.</strong>{" "}
                  Add and remove members, install apps, configure the dock.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 grid h-5 w-5 place-items-center rounded-md bg-tool-accent-soft text-tool-accent">
                  <ToolIcon icon="users" size={12} />
                </span>
                <span>
                  <strong className="font-semibold text-app">Member.</strong>{" "}
                  Use installed apps, see shared data, contribute work.
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-app bg-app-elevated p-5 shadow-xl">
            <div className="space-y-3">
              <FauxWorkspaceCard
                name="Acme Real Estate"
                role="Admin"
                members={6}
              />
              <FauxWorkspaceCard
                name="Personal — Asad"
                role="Owner"
                members={1}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FauxWorkspaceCard({
  name,
  role,
  members,
}: {
  name: string;
  role: string;
  members: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-app bg-app p-4">
      <div
        className="grid h-10 w-10 place-items-center rounded-lg text-sm font-semibold text-white"
        style={{
          background:
            "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 40%, #06b6d4))",
        }}
      >
        {name.charAt(0)}
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-app">{name}</div>
        <div className="text-xs text-muted">
          {members} {members === 1 ? "member" : "members"}
        </div>
      </div>
      <span className="rounded-md bg-tool-accent-soft px-2 py-1 text-[0.65rem] font-medium uppercase tracking-wider text-tool-accent">
        {role}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pricing teaser                                                       */
/* ------------------------------------------------------------------ */

function PricingTeaser({ onSignIn }: { onSignIn: () => void }) {
  const tiers = [
    {
      name: "Free",
      price: "$0",
      blurb: "Solo workspace, every app, local-only. Forever.",
      highlight: false,
    },
    {
      name: "Pro",
      price: "$9",
      blurb: "Cloud sync, more storage, premium apps and themes.",
      highlight: true,
    },
    {
      name: "Team",
      price: "$19",
      blurb: "Shared workspaces, roles, audit log, priority support.",
      highlight: false,
    },
  ];

  return (
    <section className="bg-app-elevated">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
        <header className="max-w-2xl">
          <span className="text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent">
            Pricing
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-app sm:text-4xl">
            Start free. Upgrade when you outgrow it.
          </h2>
        </header>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col rounded-2xl border p-6 ${
                t.highlight
                  ? "border-tool-accent bg-app"
                  : "border-app bg-app"
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-app">{t.name}</h3>
                {t.highlight && (
                  <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[0.6rem] uppercase tracking-wider text-tool-accent">
                    Popular
                  </span>
                )}
              </div>
              <div className="mt-3 text-3xl font-bold text-app">
                {t.price}
                <span className="ml-1 text-sm font-normal text-muted">
                  /mo
                </span>
              </div>
              <p className="mt-3 text-sm text-secondary">{t.blurb}</p>
              <button
                type="button"
                onClick={onSignIn}
                className={`mt-6 rounded-lg px-4 py-2 text-sm font-medium transition-opacity ${
                  t.highlight
                    ? "bg-tool-accent text-white hover:opacity-90"
                    : "border border-app bg-app-elevated text-app hover:bg-app"
                }`}
              >
                Get {t.name}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/pricing"
            className="text-sm font-medium text-tool-accent hover:underline"
          >
            See full pricing →
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                  */
/* ------------------------------------------------------------------ */

function FAQ() {
  const items = [
    {
      q: "Do I need an account to use Space Field?",
      a: "No. Open spacefield.co and you're already inside your workspace — local-first by design. Sign in only when you want cross-device sync.",
    },
    {
      q: "Where is my data stored?",
      a: "By default, in your browser's localStorage. If you sign in, it syncs to our backend so you can pick up where you left off on any device.",
    },
    {
      q: "Can I use this on mobile?",
      a: "Yes — the dock and apps adapt to small screens. But the multi-window OS shines on a real screen. Use mobile for quick lookups, desktop for real work.",
    },
    {
      q: "How do workspaces work with my team?",
      a: "Create a workspace, invite teammates, and set their role. Owners control billing, admins control apps and members, members do the work.",
    },
    {
      q: "Can I build my own apps?",
      a: "Soon. We're opening a tool SDK so any React component can register as a Space Field app and show up in the App Store.",
    },
    {
      q: "Is there a free tier?",
      a: "Yes — local-only is free forever. Cloud sync, premium apps, and team workspaces are paid.",
    },
  ];

  return (
    <section className="bg-app">
      <div className="mx-auto max-w-3xl px-5 py-20 sm:py-24">
        <header className="text-center">
          <span className="text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent">
            FAQ
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-app sm:text-4xl">
            Quick answers.
          </h2>
        </header>

        <div className="mt-10 divide-y divide-[color:var(--border)] rounded-2xl border border-app bg-app-elevated">
          {items.map((it) => (
            <details key={it.q} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-app">
                {it.q}
                <span className="text-tool-accent transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-secondary">
                {it.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                               */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="border-t border-app bg-app-elevated">
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
            ]}
          />
          <FooterColumn
            heading="Contact"
            links={[{ label: "Get in touch", href: "/contact" }]}
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
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="text-sm text-secondary transition-colors hover:text-app"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tool icon — small SVG matching tools-list TOOL_ICONS                 */
/* ------------------------------------------------------------------ */

function ToolIcon({
  icon,
  size = 16,
}: {
  icon: keyof typeof TOOL_ICONS;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={TOOL_ICONS[icon]} />
    </svg>
  );
}
