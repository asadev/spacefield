"use client";

/* TierGrid — the Hero + 4-tier card grid as one client island.
 *
 * Wraps Hero (which has the Annual/Monthly toggle) and the row of
 * TierCards. The toggle state lives here so flipping it updates every
 * card's price at once. This is the only piece of the pricing page
 * that *must* be a client component — everything below (add-ons,
 * comparison table, FAQ, CTA) is independent of billing-cycle state. */

import { useState } from "react";
import Hero from "./Hero";
import TierCard from "./TierCard";
import type { BillingCycle } from "./types";

interface TierData {
  tierId: "free" | "pro" | "team" | "enterprise";
  name: string;
  priceMonthly: number | null;
  priceAnnualPerMonth: number | null;
  tagline: string;
  isRecommended: boolean;
  isFree: boolean;
  storageLabel: string;
  membersLabel: string;
  workspacesLabel: string;
  bullets: string[];
}

/* Annual discount is 30% off monthly × 12. Annual price IDs aren't yet
 * minted in Paddle (TODO: create them and pass through to checkout);
 * until then the toggle just shows the discounted display price and
 * checkout uses the monthly price ID. */
const ANNUAL_DISCOUNT = 0.3;
const annualPerMonth = (monthly: number) =>
  Math.round(monthly * (1 - ANNUAL_DISCOUNT));

const TIERS: TierData[] = [
  {
    tierId: "free",
    name: "Free",
    priceMonthly: 0,
    priceAnnualPerMonth: 0,
    tagline: "Solo workspace, all tools, just enough room to start.",
    isRecommended: false,
    isFree: true,
    storageLabel: "5 GB",
    membersLabel: "1 user",
    workspacesLabel: "1",
    bullets: [
      "Single-user workspace — no invites",
      "Every tool: real estate, productivity, finance",
      "Files Manager with drag-and-drop",
      "Documents and Sheets editors",
      "CRM with contacts, deals, and leads",
      "Community support",
    ],
  },
  {
    tierId: "pro",
    name: "Pro",
    priceMonthly: 10,
    priceAnnualPerMonth: annualPerMonth(10),
    tagline: "Solo, but serious. More storage, premium polish.",
    isRecommended: true,
    isFree: false,
    storageLabel: "100 GB",
    membersLabel: "1 user",
    workspacesLabel: "1",
    bullets: [
      "Everything in Free",
      "100 GB storage (vs 5 GB)",
      "Premium themes and wallpapers",
      "External share links for files",
      "Inventory module in CRM",
      "Email support, 48-hour response",
    ],
  },
  {
    tierId: "team",
    name: "Team",
    priceMonthly: 30,
    priceAnnualPerMonth: annualPerMonth(30),
    tagline: "Bring your people in. 5 seats included, +$5/mo each more.",
    isRecommended: false,
    isFree: false,
    storageLabel: "1 TB",
    membersLabel: "5 included",
    workspacesLabel: "Up to 25",
    bullets: [
      "Everything in Pro",
      "5 members included; add more at $5/mo each",
      "Workspace admin controls and roles",
      "Activity log and audit log export",
      "Unlimited custom CRM fields",
      "Reports and exports across CRM",
      "Priority email support, 12-hour response",
    ],
  },
  {
    tierId: "enterprise",
    name: "Enterprise",
    priceMonthly: null,
    priceAnnualPerMonth: null,
    tagline: "For larger orgs with bespoke needs. We tailor it to you.",
    isRecommended: false,
    isFree: false,
    storageLabel: "Custom",
    membersLabel: "Unlimited",
    workspacesLabel: "Unlimited",
    bullets: [
      "Everything in Team",
      "SSO via SAML or OIDC",
      "Custom contracts and DPA",
      "Dedicated account manager",
      "Custom SLA and uptime target",
      "Self-host option available",
      "Migration support from your current stack",
    ],
  },
];

export default function TierGrid() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");

  return (
    <>
      <Hero
        billingCycle={billingCycle}
        onChangeBillingCycle={setBillingCycle}
      />
      <section className="border-b border-app/40 bg-app">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20 lg:py-24">
          <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {TIERS.map((tier) => (
              <TierCard
                key={tier.tierId}
                tierId={tier.tierId}
                name={tier.name}
                priceMonthly={tier.priceMonthly}
                priceAnnualPerMonth={tier.priceAnnualPerMonth}
                tagline={tier.tagline}
                isRecommended={tier.isRecommended}
                isFree={tier.isFree}
                storageLabel={tier.storageLabel}
                membersLabel={tier.membersLabel}
                workspacesLabel={tier.workspacesLabel}
                bullets={tier.bullets}
                billingCycle={billingCycle}
              />
            ))}
          </div>

          <p className="mt-8 text-center text-xs text-muted">
            All prices in USD. Taxes and local payment methods handled by
            Paddle, our merchant of record.
          </p>
        </div>
      </section>
    </>
  );
}
