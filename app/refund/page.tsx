import type { Metadata } from "next";
import MarketingShell from "../_components/MarketingShell";

export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    "Refund and cancellation policy for Space Field — covers Pro, Team, Enterprise plans and storage add-ons.",
};

export default function RefundPage() {
  return (
    <MarketingShell eyebrow="Legal" title="Refund Policy">
      <p className="text-xs text-muted">Last updated: 28 April 2026</p>

      <p>
        This policy explains how refunds and cancellations work for paid
        Space Field subscriptions and storage add-ons. By purchasing a paid
        plan you agree to it.
      </p>

      <h2>Subscriptions cancel anytime, take effect at the end of the period</h2>
      <p>
        You can cancel your Pro, Team, or Enterprise subscription at any time
        from <strong>Settings → Workspaces → Storage</strong>, or by emailing{" "}
        <a href="mailto:support@spacefield.co">support@spacefield.co</a>.
        Cancellation takes effect at the end of your current billing period
        — you keep access to the paid features and the higher storage cap
        until then. We do not pro-rate or refund unused days within the
        current period.
      </p>

      <h2>Storage add-ons</h2>
      <p>
        Storage add-ons (+500 GB / +2 TB / +10 TB) follow the same rule as
        the base subscription. You can remove an add-on at any time; the
        change takes effect at the end of the current billing period.
        Files already uploaded against the higher cap remain accessible
        until the cap drops back, after which uploads will be blocked once
        the new cap is reached. We won&apos;t delete your files automatically
        when an add-on ends.
      </p>

      <h2>Free tier</h2>
      <p>
        The free tier is, as the name suggests, free. Nothing to refund.
        You can stop using the service at any time, and you can delete
        your account from <strong>Settings → Account</strong>.
      </p>

      <h2>14-day right to withdraw (EU / UK customers)</h2>
      <p>
        If you are a consumer based in the EU or UK, you have a 14-day
        right to withdraw from a subscription purchase under EU Directive
        2011/83/EU and equivalent UK legislation. To use this right,
        contact{" "}
        <a href="mailto:support@spacefield.co">support@spacefield.co</a>{" "}
        within 14 days of your initial subscription with your account
        email and the subject line &quot;Withdrawal request&quot;. We
        will refund the most recent charge in full.
      </p>
      <p>
        This right applies only to the first subscription purchase, not to
        renewals. By starting to use Space Field you consent to immediate
        delivery of the digital service, but the right of withdrawal is
        preserved for the 14-day window above.
      </p>

      <h2>Refunds in exceptional circumstances</h2>
      <p>
        Outside the 14-day EU/UK window, refunds aren&apos;t the default
        — most SaaS subscriptions don&apos;t offer them and we follow the
        same standard. That said, we will consider a refund in good faith
        when:
      </p>
      <ul>
        <li>
          A platform outage or bug substantially prevented you from using
          the paid features during the period in question.
        </li>
        <li>
          You were charged after a cancellation that didn&apos;t process
          correctly on our side.
        </li>
        <li>
          You were charged for a duplicate subscription (same workspace,
          same period).
        </li>
      </ul>
      <p>
        Email{" "}
        <a href="mailto:support@spacefield.co">support@spacefield.co</a>{" "}
        with your account email, the workspace name, and a short description
        of what happened. We aim to respond within 2 business days.
      </p>

      <h2>How long refunds take</h2>
      <p>
        Approved refunds are issued to the original payment method. Once
        we (or our merchant of record) initiate the refund, your bank or
        card network typically posts the credit within 5–10 business days.
        We don&apos;t control that timing.
      </p>

      <h2>Chargebacks</h2>
      <p>
        Please contact us before initiating a chargeback. Most issues we
        can resolve directly within a couple of days. Filed chargebacks
        result in the workspace being suspended until the dispute is
        resolved, because our payment processor freezes the disputed funds
        for the duration.
      </p>

      <h2>Account closure</h2>
      <p>
        Closing your account doesn&apos;t automatically refund any prior
        charges — it stops future renewals. If you want both a refund and
        an account closure, please email us in the same message.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we update this policy materially we&apos;ll bump the &quot;last
        updated&quot; date above and announce the change on the site.
        Subscriptions purchased before a change are governed by the policy
        in effect at the time of purchase.
      </p>

      <h2>Contact</h2>
      <p>
        Refund or cancellation questions:{" "}
        <a href="mailto:support@spacefield.co">support@spacefield.co</a>{" "}
        or use the <a href="/contact">contact form</a>.
      </p>
    </MarketingShell>
  );
}
