import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "../_components/MarketingShell";
import { createClient } from "@/lib/supabase/server";
import TierCard from "./_components/TierCard";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Workspaces are free forever. Upgrade when your team grows or your storage grows. No credit card required to start.",
};

/* Pricing page — server component.
 *
 * Pulls public subscription tiers from Supabase (anon-readable). If the
 * fetch fails or returns nothing, falls back to a hardcoded copy so the
 * marketing page always renders. There is no billing yet — paid tiers
 * link to /contact?topic=sales.
 */

interface Tier {
  tier_id: string;
  name: string;
  price_cents_monthly: number | null;
  price_cents_yearly: number | null;
  max_owned_workspaces: number | null;
  max_storage_per_workspace_mb: number | null;
  max_members_per_workspace: number | null;
  features: Record<string, unknown> | null;
  is_public: boolean;
  sort_order: number;
}

const FALLBACK_TIERS: Tier[] = [
  {
    tier_id: "free",
    name: "Free",
    price_cents_monthly: 0,
    price_cents_yearly: 0,
    max_owned_workspaces: 1,
    max_storage_per_workspace_mb: 5 * 1024,
    max_members_per_workspace: 5,
    features: {},
    is_public: true,
    sort_order: 1,
  },
  {
    tier_id: "pro",
    name: "Pro",
    price_cents_monthly: 1900,
    price_cents_yearly: 19000,
    max_owned_workspaces: 5,
    max_storage_per_workspace_mb: 100 * 1024,
    max_members_per_workspace: 25,
    features: { premium_tools: true, priority_support: true, export: true },
    is_public: true,
    sort_order: 2,
  },
  {
    tier_id: "team",
    name: "Team",
    price_cents_monthly: 4900,
    price_cents_yearly: 49000,
    max_owned_workspaces: 25,
    max_storage_per_workspace_mb: 1024 * 1024,
    max_members_per_workspace: null,
    features: {
      premium_tools: true,
      priority_support: true,
      export: true,
      admin_console: true,
      audit_log: true,
    },
    is_public: true,
    sort_order: 3,
  },
  {
    tier_id: "enterprise",
    name: "Enterprise",
    price_cents_monthly: null,
    price_cents_yearly: null,
    max_owned_workspaces: null,
    max_storage_per_workspace_mb: null,
    max_members_per_workspace: null,
    features: {
      premium_tools: true,
      priority_support: true,
      export: true,
      admin_console: true,
      audit_log: true,
      sso: true,
      custom_contracts: true,
    },
    is_public: true,
    sort_order: 4,
  },
];

const TAGLINES: Record<string, string> = {
  free: "For solos and curious teams. One workspace, 5 GB included.",
  pro: "For people who want to actually use it. 5 workspaces, 100 GB each.",
  team: "Bring your team. 1 TB per workspace, admin console.",
  enterprise: "For larger orgs with bespoke needs.",
};

const RECOMMENDED_TIER_ID = "pro";

const FEATURE_LABELS: Record<string, string> = {
  premium_tools: "Premium tools",
  priority_support: "Priority support",
  export: "Export to PDF/CSV",
  admin_console: "Admin console",
  sso: "SSO (SAML/OIDC)",
  audit_log: "Audit log",
  custom_contracts: "Custom contracts",
};

const FEATURE_ORDER = [
  "premium_tools",
  "priority_support",
  "export",
  "admin_console",
  "sso",
  "audit_log",
  "custom_contracts",
];

function formatPrice(cents: number | null): {
  big: string;
  yearly: string | null;
} {
  if (cents === null || cents === undefined) {
    return { big: "Custom", yearly: null };
  }
  if (cents === 0) {
    return { big: "Free", yearly: null };
  }
  const dollars = cents / 100;
  return { big: `$${dollars.toFixed(0)} / mo`, yearly: null };
}

function formatYearly(cents: number | null): string | null {
  if (cents === null || cents === undefined || cents === 0) return null;
  const dollars = cents / 100;
  return `or $${dollars.toFixed(0)} / year`;
}

function workspacesLine(tier: Tier): string {
  if (tier.max_owned_workspaces === null) return "Unlimited workspaces";
  if (tier.max_owned_workspaces === 1) return "1 workspace";
  return `${tier.max_owned_workspaces} workspaces`;
}

function membersLine(tier: Tier): string {
  if (tier.max_members_per_workspace === null) return "Unlimited members";
  return `Up to ${tier.max_members_per_workspace} members / workspace`;
}

function tierFeatureBullets(tier: Tier): string[] {
  const features = tier.features || {};
  return FEATURE_ORDER.filter((key) => Boolean(features[key])).map(
    (key) => FEATURE_LABELS[key]
  );
}

export default async function PricingPage() {
  let tiers: Tier[] = FALLBACK_TIERS;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("subscription_tiers")
      .select("*")
      .eq("is_public", true)
      .order("sort_order", { ascending: true });
    if (!error && data && data.length > 0) {
      tiers = data as Tier[];
    }
  } catch {
    // Fall through to fallback
  }

  return (
    <MarketingShell eyebrow="Pricing" title="Pick a plan, start working.">
      <p>
        Workspaces are free forever. Upgrade when your team grows or your
        storage grows. <strong className="text-app">No credit card</strong>{" "}
        required to start.
      </p>

      <div className="not-prose mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => {
          const isRecommended = tier.tier_id === RECOMMENDED_TIER_ID;
          const isFree =
            tier.price_cents_monthly === 0 || tier.tier_id === "free";
          const price = formatPrice(tier.price_cents_monthly);
          const yearly = formatYearly(tier.price_cents_yearly);
          const featureBullets = tierFeatureBullets(tier);
          const tagline =
            TAGLINES[tier.tier_id] ??
            "Flexible tier for teams that need more.";

          return (
            <TierCard
              key={tier.tier_id}
              tierId={tier.tier_id}
              name={tier.name}
              priceBig={price.big}
              priceYearly={yearly}
              tagline={tagline}
              isRecommended={isRecommended}
              isFree={isFree}
              baseStorageMb={tier.max_storage_per_workspace_mb}
              workspacesLine={workspacesLine(tier)}
              membersLine={membersLine(tier)}
              featureBullets={featureBullets}
            />
          );
        })}
      </div>

      <div className="not-prose mt-14">
        <h2 className="text-xl font-semibold text-app">
          Frequently asked
        </h2>
        <div className="mt-4 divide-y divide-app rounded-2xl border border-app bg-app-elevated">
          <details className="group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-app">
              Do I need a credit card to start?
              <span className="text-muted transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm text-secondary">
              No. The free tier is genuinely free — sign up with email and
              you&apos;re in. We only ask for billing details if you decide
              to upgrade.
            </p>
          </details>

          <details className="group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-app">
              Can I upgrade or downgrade later?
              <span className="text-muted transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm text-secondary">
              Yes, anytime. Upgrades take effect immediately; downgrades
              apply at the end of your current billing period so you keep
              what you paid for.
            </p>
          </details>

          <details className="group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-app">
              How are workspaces and members different?
              <span className="text-muted transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm text-secondary">
              A workspace is a separate desktop with its own tools, files,
              and wallpaper. Members are people invited into a single
              workspace. Limits stack — you might own 5 workspaces with 25
              members each.
            </p>
          </details>

          <details className="group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-app">
              What happens to my files if I downgrade?
              <span className="text-muted transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm text-secondary">
              Nothing is deleted. Files stay readable; you just can&apos;t
              add new ones past the lower tier&apos;s limit until you free
              up space or upgrade again.
            </p>
          </details>

          <details className="group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-app">
              Do you offer discounts for non-profits or education?
              <span className="text-muted transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm text-secondary">
              Yes — meaningful ones. Send us a note from your org email via
              the <Link href="/contact?topic=sales">contact form</Link> and
              we&apos;ll sort it out.
            </p>
          </details>

          <details className="group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-app">
              Can my team self-host this?
              <span className="text-muted transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm text-secondary">
              Self-hosting is available on Enterprise. Get in touch and
              we&apos;ll walk you through the deployment options and what
              your team owns vs. what we operate.
            </p>
          </details>
        </div>
      </div>

      <div className="not-prose mt-12 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-app bg-app-elevated p-6">
        <div>
          <h3 className="text-lg font-semibold text-app">Still deciding?</h3>
          <p className="mt-1 text-sm text-secondary">
            Tell us what you&apos;re trying to do. We&apos;ll point you at
            the right tier — or build you the one you actually need.
          </p>
        </div>
        <Link
          href="/contact?topic=sales"
          className="inline-flex items-center justify-center rounded-lg bg-tool-accent px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Talk to us
        </Link>
      </div>
    </MarketingShell>
  );
}
