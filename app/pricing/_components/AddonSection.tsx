"use client";

/* AddonSection — storage add-ons row on the public /pricing page.
 *
 * Three add-on tiers (+500 GB, +2 TB, +10 TB) shown side by side.
 * Clicking "Add to workspace" on a card runs the same Paddle.js
 * checkout flow that lives on TierCard — the "addon" code path. The
 * shared logic is duplicated minimally here because we want the
 * per-card click handler to be self-contained. Source of truth for the
 * options is `app/_data/storage-addons.ts` (DB check constraint
 * matches). */

import { useEffect, useState } from "react";
import Link from "next/link";
import { STORAGE_ADDON_OPTIONS } from "@/app/_data/storage-addons";
import { ensurePaddle } from "@/app/tools/_components/useBillingClient";

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

export default function AddonSection() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meChecked, setMeChecked] = useState(false);
  const [submittingGb, setSubmittingGb] = useState<number | null>(null);
  const [errorGb, setErrorGb] = useState<{ gb: number; text: string } | null>(
    null
  );

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
        // ignored
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

  const purchasable = STORAGE_ADDON_OPTIONS.filter((o) => o.gb !== 0);

  async function handleBuyAddon(gb: number) {
    setErrorGb(null);
    if (!isSignedIn) return;
    if (!targetWorkspaceId) {
      setErrorGb({ gb, text: "Create a workspace first, then come back." });
      return;
    }
    setSubmittingGb(gb);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "addon",
          addon_gb: gb,
          workspaceId: targetWorkspaceId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as CheckoutResponse;
      if (!res.ok) {
        throw new Error(data.error || `Checkout failed (${res.status})`);
      }
      if (!data.paddle) throw new Error(`Checkout failed (${res.status})`);
      const token = me?.paddle_client_token ?? "";
      if (!token) {
        throw new Error("Paddle is not configured yet. Try again shortly.");
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
    } catch (err) {
      setErrorGb({
        gb,
        text: err instanceof Error ? err.message : "Failed",
      });
      setSubmittingGb(null);
    }
  }

  return (
    <section className="border-b border-app/40 bg-app">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
        <header className="max-w-2xl">
          <span className="text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent">
            Storage add-ons
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-app sm:text-4xl">
            Need more space? Add storage to any plan, anytime.
          </h2>
          <p className="mt-3 text-sm text-secondary sm:text-base">
            Add-ons stack on top of your tier&apos;s base storage. Your
            add-on stays with the workspace and applies on top of your tier
            base — change tiers without losing it.
          </p>
        </header>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {purchasable.map((opt) => {
            const submitting = submittingGb === opt.gb;
            const error = errorGb?.gb === opt.gb ? errorGb.text : null;
            return (
              <div
                key={opt.gb}
                className="flex flex-col rounded-2xl border border-app bg-app-elevated p-6"
              >
                <div className="text-sm font-medium uppercase tracking-[0.14em] text-muted">
                  {opt.label.replace(/^\+/, "")}
                </div>
                <div className="mt-2 text-2xl font-bold text-app">
                  {opt.price}
                </div>
                <p className="mt-2 text-sm text-secondary">
                  Adds {opt.label.replace(/^\+/, "")} on top of any
                  workspace&apos;s tier storage.
                </p>

                <div className="mt-6">
                  {!meChecked ? (
                    <button
                      type="button"
                      disabled
                      className="inline-flex w-full items-center justify-center rounded-lg border border-app bg-app px-4 py-2.5 text-sm font-medium text-muted"
                    >
                      Loading
                    </button>
                  ) : !isSignedIn ? (
                    <Link
                      href="/signin"
                      className="inline-flex w-full items-center justify-center rounded-lg border border-app bg-app px-4 py-2.5 text-sm font-medium text-app transition-colors hover:border-tool-accent hover:text-tool-accent"
                    >
                      Sign in to add
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleBuyAddon(opt.gb)}
                      disabled={submitting}
                      className="inline-flex w-full items-center justify-center rounded-lg border border-app bg-app px-4 py-2.5 text-sm font-medium text-app transition-colors hover:border-tool-accent hover:text-tool-accent disabled:opacity-60"
                    >
                      {submitting ? "Opening" : "Add to workspace"}
                    </button>
                  )}
                </div>

                {error && (
                  <div className="mt-3 text-xs text-rose-500">{error}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
