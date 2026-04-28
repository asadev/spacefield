"use client";

/* TierCard — client component used by /pricing.
 *
 * Renders one tier (Free / Pro / Team / Enterprise) as a card with
 * price, headline limits, and 5–7 included things. The Paddle
 * checkout flow is unchanged from the original component; what's
 * different is the visual shell and the fact that the storage add-on
 * dropdown lives in <AddonSection /> now (a separate row beneath the
 * tier grid). Add-on checkouts attach to the user's first owned
 * workspace and are handled there.
 *
 * Click flow (same as before):
 *   - signed-out → links to /signin
 *   - Free + signed-in → links to / (workspace)
 *   - Pro / Team + signed-in → POSTs to /api/billing/checkout with
 *     kind='tier' and opens the Paddle.js overlay with the returned
 *     price_id, customer_email, custom_data.
 *   - Enterprise → mailto:sales@spacefield.co
 *
 * Once the Paddle webhook fires it flips the subscriptions row to
 * the new tier. */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ensurePaddle } from "@/app/tools/_components/useBillingClient";
import type { BillingCycle } from "./types";

export interface TierCardProps {
  tierId: "free" | "pro" | "team" | "enterprise" | string;
  name: string;
  priceMonthly: number | null; // dollars per month, null = custom (Enterprise)
  priceAnnualPerMonth: number | null; // dollars per month when billed annually
  tagline: string;
  isRecommended: boolean;
  isFree: boolean;
  storageLabel: string; // "5 GB" / "100 GB" / "1 TB" / "Custom"
  membersLabel: string; // "5" / "10" / "50" / "Unlimited"
  workspacesLabel: string; // "1" / "5" / "25" / "Unlimited"
  bullets: string[]; // 5-7 included things
  billingCycle: BillingCycle;
}

interface MeResponse {
  user?: { id: string; email: string | null };
  workspaces?: Array<{ id: string; name: string }>;
  paddle_client_token?: string | null;
  paddle_environment?: "production" | "sandbox";
}

interface CheckoutResponse {
  provider?: "paddle";
  paddle?: {
    price_id: string;
    customer_email: string;
    custom_data: Record<string, string>;
  };
  error?: string;
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5l3.5 3.5L13 4.5" />
    </svg>
  );
}

export default function TierCard({
  tierId,
  name,
  priceMonthly,
  priceAnnualPerMonth,
  tagline,
  isRecommended,
  isFree,
  storageLabel,
  membersLabel,
  workspacesLabel,
  bullets,
  billingCycle,
}: TierCardProps) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meChecked, setMeChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!cancelled && res.ok) {
          const body = (await res.json()) as MeResponse;
          setMe(body);
        }
      } catch {
        // ignored — treated as signed-out
      } finally {
        if (!cancelled) setMeChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isSignedIn = Boolean(me?.user);
  const targetWorkspaceId = me?.workspaces?.[0]?.id ?? null;

  // Tier slug for the checkout API. Free / Enterprise can't be
  // checked out (Free is default; Enterprise is contact-sales).
  const checkoutTier: "pro" | "team" | null =
    tierId === "pro" || tierId === "team" ? tierId : null;

  const { displayPrice, displaySuffix, displayHint } = useMemo(() => {
    if (priceMonthly === null) {
      return {
        displayPrice: "Custom",
        displaySuffix: null as string | null,
        displayHint: "Volume pricing",
      };
    }
    if (priceMonthly === 0) {
      return {
        displayPrice: "$0",
        displaySuffix: "/ mo",
        displayHint: "Free forever",
      };
    }
    if (billingCycle === "annual" && priceAnnualPerMonth !== null) {
      return {
        displayPrice: `$${priceAnnualPerMonth}`,
        displaySuffix: "/ mo",
        displayHint: `Billed annually at $${priceAnnualPerMonth * 12}`,
      };
    }
    return {
      displayPrice: `$${priceMonthly}`,
      displaySuffix: "/ mo",
      displayHint: priceAnnualPerMonth
        ? `or $${priceAnnualPerMonth} / mo billed annually`
        : null,
    };
  }, [priceMonthly, priceAnnualPerMonth, billingCycle]);

  // ----- Paddle checkout — kept identical to the original TierCard.
  async function handleUpgrade() {
    setError(null);
    if (!isSignedIn) return;
    if (!checkoutTier) return; // only Pro/Team reach this branch
    if (!targetWorkspaceId) {
      setError("Create a workspace first, then come back to upgrade.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "tier",
          tier: checkoutTier,
          workspaceId: targetWorkspaceId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as CheckoutResponse;
      if (!res.ok) {
        throw new Error(data.error || `Checkout failed (${res.status})`);
      }
      if (!data.paddle) {
        throw new Error(`Checkout failed (${res.status})`);
      }
      const token = me?.paddle_client_token ?? "";
      if (!token) {
        throw new Error(
          "Paddle is not fully configured yet. Try again shortly."
        );
      }
      const Paddle = await ensurePaddle({
        token,
        environment: me?.paddle_environment ?? "production",
        onCheckoutCompleted: () => {
          window.location.href = "/billing/success";
        },
      });
      Paddle.Checkout.open({
        items: [{ priceId: data.paddle.price_id, quantity: 1 }],
        customer: { email: data.paddle.customer_email },
        customData: data.paddle.custom_data,
        settings: {
          displayMode: "overlay",
          successUrl: `${window.location.origin}/billing/success`,
          allowLogout: false,
        },
      });
      // Overlay opens — leave the button in "Opening" state until the
      // user finishes or closes the modal.
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setSubmitting(false);
    }
  }

  // ----- CTA decision matrix.
  let ctaNode: React.ReactNode;
  const primaryBtnClass = isRecommended
    ? "inline-flex w-full items-center justify-center rounded-lg bg-tool-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
    : "inline-flex w-full items-center justify-center rounded-lg bg-app-elevated px-4 py-2.5 text-sm font-semibold text-app ring-1 ring-inset ring-app transition-colors hover:ring-tool-accent hover:text-tool-accent disabled:opacity-60";
  const ghostBtnClass =
    "inline-flex w-full items-center justify-center rounded-lg bg-app-elevated px-4 py-2.5 text-sm font-semibold text-app ring-1 ring-inset ring-app transition-colors hover:ring-tool-accent hover:text-tool-accent";

  if (!meChecked) {
    ctaNode = (
      <button
        type="button"
        disabled
        className="inline-flex w-full items-center justify-center rounded-lg bg-app-elevated px-4 py-2.5 text-sm font-semibold text-muted ring-1 ring-inset ring-app"
      >
        Loading
      </button>
    );
  } else if (tierId === "enterprise") {
    ctaNode = (
      <a href="mailto:sales@spacefield.co" className={primaryBtnClass}>
        Contact sales
      </a>
    );
  } else if (!isSignedIn) {
    ctaNode = (
      <Link href="/signin" className={primaryBtnClass}>
        {isFree ? "Start free" : "Get started"}
      </Link>
    );
  } else if (isFree) {
    ctaNode = (
      <Link href="/" className={ghostBtnClass}>
        Start free
      </Link>
    );
  } else {
    ctaNode = (
      <button
        type="button"
        onClick={() => void handleUpgrade()}
        disabled={submitting}
        className={primaryBtnClass}
      >
        {submitting ? "Opening" : "Get started"}
      </button>
    );
  }

  // ----- Card chrome.
  const cardClass = isRecommended
    ? "relative flex flex-col rounded-2xl border-2 border-tool-accent bg-app-elevated p-6 shadow-[0_0_0_4px_var(--accent-bg)]"
    : "relative flex flex-col rounded-2xl border border-app bg-app-elevated p-6";

  return (
    <div className={cardClass} data-tier={tierId}>
      {isRecommended && (
        <span className="absolute -top-3 right-6 rounded-full bg-tool-accent px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-white shadow-sm">
          Most popular
        </span>
      )}

      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-app">{name}</h3>
      </div>

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight text-app tabular-nums">
          {displayPrice}
        </span>
        {displaySuffix && (
          <span className="text-sm font-medium text-muted">
            {displaySuffix}
          </span>
        )}
      </div>
      {displayHint && (
        <div className="mt-1 min-h-[1rem] text-xs text-muted">
          {displayHint}
        </div>
      )}

      <p className="mt-3 text-sm leading-relaxed text-secondary">{tagline}</p>

      {/* Headline trio — Workspaces / Members / Storage */}
      <dl className="mt-5 grid grid-cols-3 gap-2 rounded-xl border border-app bg-app p-3 text-center">
        <div>
          <dt className="text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Workspaces
          </dt>
          <dd className="mt-1 text-sm font-semibold text-app">
            {workspacesLabel}
          </dd>
        </div>
        <div className="border-x border-app/60">
          <dt className="text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Members
          </dt>
          <dd className="mt-1 text-sm font-semibold text-app">
            {membersLabel}
          </dd>
        </div>
        <div>
          <dt className="text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Storage
          </dt>
          <dd className="mt-1 text-sm font-semibold text-app">
            {storageLabel}
          </dd>
        </div>
      </dl>

      <ul className="mt-5 space-y-2.5 text-sm text-secondary">
        {bullets.map((label) => (
          <li key={label} className="flex items-start gap-2">
            <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-tool-accent-soft text-tool-accent">
              <CheckIcon />
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex-1" />

      <div className="pt-4">{ctaNode}</div>

      {error && (
        <div className="mt-3 text-xs text-rose-500">{error}</div>
      )}
    </div>
  );
}
