import Link from "next/link";

import { buttonGhostClass } from "../../_lib";
import { createCoupon } from "../_actions";
import CouponForm from "../_components/CouponForm";

export const dynamic = "force-dynamic";

export default function NewCouponPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/coupons"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Coupons
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New coupon</h1>
        <p className="mt-0.5 text-xs text-muted">
          Create a redeemable promo code. After saving you&apos;ll be sent to
          the per-coupon page where you can review redemptions.
        </p>
      </div>

      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <CouponForm
          coupon={null}
          action={createCoupon}
          submitLabel="Create coupon"
        />
      </section>

      <div>
        <Link href="/admin/coupons" className={buttonGhostClass}>
          Back to coupons
        </Link>
      </div>
    </div>
  );
}
