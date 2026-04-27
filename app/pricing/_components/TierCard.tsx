"use client";

/* TierCard — client component used by /pricing.
 *
 * Renders one tier (Free / Pro / Team / Enterprise) with its base
 * storage figure and an "Add storage" dropdown beneath. Selecting an
 * add-on updates the displayed total cap inline ("100 GB + 2 TB =
 * 2.1 TB") so the user can see the math before they click upgrade.
 *
 * Click flow:
 *   - signed-out → links to /signin (Sign in to upgrade)
 *   - signed-in & paid tier (Pro/Team) → POSTs to /api/billing/checkout
 *     with kind='tier' and redirects the browser to the Polar-hosted
 *     checkout URL.
 *   - signed-in & free tier with add-on selected → POSTs to
 *     /api/billing/checkout with kind='addon' (the add-on attaches to
 *     the user's first owned workspace; a workspace must exist).
 *   - signed-in & enterprise → "Contact sales".
 *
 * Once Polar redirects back to /billing/success the webhook flips the
 * subscriptions row to the new tier (or marks the addon active).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  STORAGE_ADDON_OPTIONS,
  formatStorageBytes,
  formatStorageMb,
  effectiveCapBytes,
} from "@/app/_data/storage-addons";
import { ensurePaddle } from "@/app/tools/_components/useBillingClient";

export interface TierCardProps {
  tierId: string;
  name: string;
  priceBig: string;
  priceYearly: string | null;
  tagline: string;
  isRecommended: boolean;
  isFree: boolean;
  baseStorageMb: number | null;
  workspacesLine: string;
  membersLine: string;
  featureBullets: string[];
}

interface MeResponse {
  user?: { id: string; email: string | null };
  workspaces?: Array<{ id: string; name: string }>;
  storage_addons?: Array<{ workspace_id: string; addon_gb: number }>;
  tier_config?: { name?: string | null } | null;
  billing_provider?: "paddle" | "polar";
  paddle_client_token?: string | null;
  paddle_environment?: "production" | "sandbox";
}

interface CheckoutResponse {
  provider?: "paddle" | "polar";
  url?: string;
  session_id?: string;
  paddle?: {
    price_id: string;
    customer_email: string;
    custom_data: Record<string, string>;
  };
  error?: string;
}

export default function TierCard({
  tierId,
  name,
  priceBig,
  priceYearly,
  tagline,
  isRecommended,
  isFree,
  baseStorageMb,
  workspacesLine,
  membersLine,
  featureBullets,
}: TierCardProps) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meChecked, setMeChecked] = useState(false);
  const [addonGb, setAddonGb] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

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

  const baseLabel = useMemo(() => {
    if (baseStorageMb === null) return "Custom storage";
    return `${formatStorageMb(baseStorageMb)} included`;
  }, [baseStorageMb]);

  const totalCapLabel = useMemo(() => {
    if (baseStorageMb === null) return null;
    if (addonGb === 0) return null;
    const totalBytes = effectiveCapBytes(baseStorageMb, addonGb);
    const baseStr = formatStorageMb(baseStorageMb);
    const addonOpt = STORAGE_ADDON_OPTIONS.find((o) => o.gb === addonGb);
    const addonStr = addonOpt ? addonOpt.label.replace(/^\+/, "") : `${addonGb} GB`;
    return `${baseStr} + ${addonStr} = ${formatStorageBytes(totalBytes)}`;
  }, [baseStorageMb, addonGb]);

  const isSignedIn = Boolean(me?.user);
  const targetWorkspaceId = me?.workspaces?.[0]?.id ?? null;

  const cardClass = isRecommended
    ? "relative flex flex-col rounded-2xl border border-tool-accent bg-app-elevated p-6 ring-1 ring-tool-accent-soft"
    : "relative flex flex-col rounded-2xl border border-app bg-app-elevated p-6";

  // Tier slug for the checkout API. Free / Enterprise can't be
  // checked out (Free is default; Enterprise is contact-sales).
  const checkoutTier: "pro" | "team" | null =
    tierId === "pro" || tierId === "team" ? tierId : null;

  async function handleUpgrade() {
    setMsg(null);
    if (!isSignedIn) return;
    if (!targetWorkspaceId) {
      setMsg({
        kind: "error",
        text: "Create a workspace first, then come back to upgrade.",
      });
      return;
    }

    // Decide whether this click means "buy a tier" or "buy an add-on".
    // Tier cards (pro/team) always check out the tier itself; the
    // add-on dropdown selection is informational on those cards.
    // The Free card uses the dropdown to attach an add-on.
    const body: Record<string, unknown> = { workspaceId: targetWorkspaceId };
    if (checkoutTier) {
      body.kind = "tier";
      body.tier = checkoutTier;
    } else if (addonGb !== 0) {
      body.kind = "addon";
      body.addon_gb = addonGb;
    } else {
      setMsg({
        kind: "error",
        text: "Pick an add-on from the dropdown above first.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as CheckoutResponse;
      if (!res.ok) {
        throw new Error(data.error || `Checkout failed (${res.status})`);
      }
      if (data.provider === "paddle" && data.paddle) {
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
            window.location.href = "/billing/success?provider=paddle";
          },
        });
        Paddle.Checkout.open({
          items: [{ priceId: data.paddle.price_id, quantity: 1 }],
          customer: { email: data.paddle.customer_email },
          customData: data.paddle.custom_data,
          settings: {
            displayMode: "overlay",
            successUrl: `${window.location.origin}/billing/success?provider=paddle`,
            allowLogout: false,
          },
        });
        // Overlay opens — leave the button in "Opening…" state until
        // the user finishes or closes the modal.
        return;
      }
      if (!data.url) {
        throw new Error(`Checkout failed (${res.status})`);
      }
      window.location.href = data.url;
    } catch (err) {
      setMsg({
        kind: "error",
        text: err instanceof Error ? err.message : "Failed",
      });
      setSubmitting(false);
    }
  }

  // CTA label/behavior matrix.
  const showAddonControls = baseStorageMb !== null;
  let ctaNode: React.ReactNode;
  if (!meChecked) {
    ctaNode = (
      <button
        type="button"
        disabled
        className="inline-flex w-full items-center justify-center rounded-lg border border-app bg-app px-4 py-2.5 text-sm font-medium text-muted"
      >
        Loading…
      </button>
    );
  } else if (!isSignedIn) {
    ctaNode = (
      <Link
        href="/signin"
        className={
          isRecommended
            ? "inline-flex w-full items-center justify-center rounded-lg bg-tool-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            : "inline-flex w-full items-center justify-center rounded-lg border border-app bg-app px-4 py-2.5 text-sm font-medium text-app transition-colors hover:border-tool-accent hover:text-tool-accent"
        }
      >
        {isFree ? "Sign in to start" : "Sign in to upgrade"}
      </Link>
    );
  } else if (isFree && addonGb === 0) {
    ctaNode = (
      <Link
        href="/"
        className="inline-flex w-full items-center justify-center rounded-lg border border-app bg-app px-4 py-2.5 text-sm font-medium text-app transition-colors hover:border-tool-accent hover:text-tool-accent"
      >
        Get started
      </Link>
    );
  } else if (baseStorageMb === null) {
    // Enterprise — keep "Contact sales".
    ctaNode = (
      <Link
        href="/contact?topic=sales"
        className={
          isRecommended
            ? "inline-flex w-full items-center justify-center rounded-lg bg-tool-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            : "inline-flex w-full items-center justify-center rounded-lg border border-app bg-app px-4 py-2.5 text-sm font-medium text-app transition-colors hover:border-tool-accent hover:text-tool-accent"
        }
      >
        Contact sales
      </Link>
    );
  } else {
    ctaNode = (
      <button
        type="button"
        onClick={handleUpgrade}
        disabled={submitting}
        className={
          isRecommended
            ? "inline-flex w-full items-center justify-center rounded-lg bg-tool-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            : "inline-flex w-full items-center justify-center rounded-lg border border-app bg-app px-4 py-2.5 text-sm font-medium text-app transition-colors hover:border-tool-accent hover:text-tool-accent disabled:opacity-60"
        }
      >
        {submitting
          ? "Redirecting…"
          : checkoutTier
            ? `Upgrade to ${name}`
            : addonGb === 0
              ? `Continue on ${name}`
              : "Buy add-on"}
      </button>
    );
  }

  return (
    <div className={cardClass} data-tier={tierId}>
      {isRecommended && (
        <span className="absolute -top-3 left-6 rounded-full bg-tool-accent-soft px-2.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.14em] text-tool-accent">
          Most popular
        </span>
      )}

      <h3 className="text-lg font-bold text-app">{name}</h3>

      <div className="mt-3">
        <div className="text-3xl font-bold text-app tabular-nums">
          {priceBig}
        </div>
        {priceYearly && (
          <div className="mt-1 text-xs text-muted">{priceYearly}</div>
        )}
      </div>

      <p className="mt-3 text-sm text-secondary">{tagline}</p>

      <ul className="mt-5 space-y-2 text-sm text-secondary">
        <li className="flex gap-2">
          <span className="text-tool-accent">✓</span>
          <span>{workspacesLine}</span>
        </li>
        <li className="flex gap-2">
          <span className="text-tool-accent">✓</span>
          <span>{baseLabel}</span>
        </li>
        <li className="flex gap-2">
          <span className="text-tool-accent">✓</span>
          <span>{membersLine}</span>
        </li>
        {featureBullets.slice(0, 3).map((label) => (
          <li key={label} className="flex gap-2">
            <span className="text-tool-accent">✓</span>
            <span>{label}</span>
          </li>
        ))}
      </ul>

      {showAddonControls && (
        <div className="mt-5 rounded-lg border border-app bg-app p-3">
          <label className="block text-[0.6rem] uppercase tracking-[0.14em] text-muted">
            Add storage
            <select
              value={addonGb}
              onChange={(e) => setAddonGb(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-app bg-app-elevated px-2.5 py-1.5 text-xs font-medium text-app focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
            >
              {STORAGE_ADDON_OPTIONS.map((opt) => (
                <option key={opt.gb} value={opt.gb}>
                  {opt.label} — {opt.price}
                </option>
              ))}
            </select>
          </label>
          {totalCapLabel && (
            <div className="mt-2 text-[0.7rem] text-secondary">
              {totalCapLabel}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 pt-4">{ctaNode}</div>

      {msg && (
        <div
          className={`mt-3 text-xs ${
            msg.kind === "success" ? "text-tool-accent" : "text-rose-400"
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
