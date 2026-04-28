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

const TIERS: TierData[] = [
  {
    tierId: "free",
    name: "Free",
    priceMonthly: 0,
    priceAnnualPerMonth: 0,
    tagline: "For solos kicking the tires. Every tool, one workspace.",
    isRecommended: false,
    isFree: true,
    storageLabel: "5 GB",
    membersLabel: "5",
    workspacesLabel: "1",
    bullets: [
      "All real estate, productivity, and finance tools",
      "Files Manager with drag-and-drop",
      "Documents and Sheets editors",
      "CRM with contacts, deals, and leads",
      "Real-time chat in your workspace",
      "Community support",
    ],
  },
  {
    tierId: "pro",
    name: "Pro",
    priceMonthly: 19,
    priceAnnualPerMonth: 15,
    tagline: "For people who use it every day. More room to actually work.",
    isRecommended: true,
    isFree: false,
    storageLabel: "100 GB",
    membersLabel: "10",
    workspacesLabel: "5",
    bullets: [
      "Everything in Free",
      "Real-time co-editing in Documents and Sheets",
      "Premium themes and wallpapers",
      "External share links for files",
      "Inventory module in CRM",
      "App and tool gating per member",
      "Email support, 48-hour response",
    ],
  },
  {
    tierId: "team",
    name: "Team",
    priceMonthly: 49,
    priceAnnualPerMonth: 39,
    tagline: "For teams that ship together. Admin controls and full history.",
    isRecommended: false,
    isFree: false,
    storageLabel: "1 TB",
    membersLabel: "50",
    workspacesLabel: "25",
    bullets: [
      "Everything in Pro",
      "50 members per workspace",
      "Activity log and audit log export",
      "Unlimited custom CRM fields",
      "Reports and exports across CRM",
      "Onboarding session for your team",
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
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
