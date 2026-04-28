"use client";

/* Pricing hero — top of /pricing.
 *
 * Headline + short value-prop subhead + small Annual/Monthly toggle.
 * The toggle is purely visual for now — the actual Paddle prices in
 * checkout flow are monthly. When yearly pricing is wired this can
 * pass `billingCycle` down through page.tsx into TierCard. */

import type { BillingCycle } from "./types";

interface Props {
  billingCycle: BillingCycle;
  onChangeBillingCycle: (cycle: BillingCycle) => void;
}

export default function Hero({ billingCycle, onChangeBillingCycle }: Props) {
  return (
    <section className="relative isolate overflow-hidden border-b border-app">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="pricing-glow pricing-glow-a" />
        <div className="pricing-glow pricing-glow-b" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 py-20 sm:py-24 lg:py-28">
        <span className="rounded-full border border-app bg-app-elevated/60 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-secondary backdrop-blur">
          Pricing
        </span>

        <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-app sm:text-5xl lg:text-6xl">
          Pricing that fits your team.
        </h1>

        <p className="mt-5 max-w-2xl text-base text-secondary sm:text-lg">
          One workspace OS. Every tool included. Scale from a solo desk to a
          full company without changing platforms. Start free — pay only when
          you outgrow it.
        </p>

        <div className="mt-10 inline-flex items-center gap-1 rounded-full border border-app bg-app-elevated p-1">
          <button
            type="button"
            onClick={() => onChangeBillingCycle("monthly")}
            aria-pressed={billingCycle === "monthly"}
            className={
              billingCycle === "monthly"
                ? "rounded-full bg-tool-accent px-4 py-1.5 text-xs font-medium text-white"
                : "rounded-full px-4 py-1.5 text-xs font-medium text-secondary transition-colors hover:text-app"
            }
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => onChangeBillingCycle("annual")}
            aria-pressed={billingCycle === "annual"}
            className={
              billingCycle === "annual"
                ? "inline-flex items-center gap-2 rounded-full bg-tool-accent px-4 py-1.5 text-xs font-medium text-white"
                : "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-secondary transition-colors hover:text-app"
            }
          >
            Annual
            <span
              className={
                billingCycle === "annual"
                  ? "rounded-full bg-white/20 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-white"
                  : "rounded-full bg-tool-accent-soft px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-tool-accent"
              }
            >
              -20%
            </span>
          </button>
        </div>
      </div>

      <style jsx>{`
        .pricing-glow {
          position: absolute;
          width: 60vw;
          height: 60vw;
          border-radius: 50%;
          filter: blur(110px);
          opacity: 0.4;
          mix-blend-mode: screen;
          pointer-events: none;
        }
        .pricing-glow-a {
          top: -30vw;
          left: -10vw;
          background: radial-gradient(
            circle at center,
            color-mix(in srgb, var(--accent) 70%, transparent) 0%,
            transparent 70%
          );
        }
        .pricing-glow-b {
          top: -25vw;
          right: -15vw;
          background: radial-gradient(
            circle at center,
            rgba(6, 182, 212, 0.5) 0%,
            rgba(6, 182, 212, 0) 70%
          );
        }
        :global([data-theme="light"]) .pricing-glow {
          opacity: 0.25;
          mix-blend-mode: multiply;
        }
      `}</style>
    </section>
  );
}
