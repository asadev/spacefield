import type { Metadata } from "next";
import MarketingShell from "../_components/MarketingShell";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <MarketingShell eyebrow="Legal" title="Terms of Service">
      <p className="text-xs text-muted">Last updated: 27 April 2026</p>

      <p>
        These terms govern your use of Space Field at{" "}
        <a href="https://spacefield.co">spacefield.co</a>. By using the
        service you agree to them — if you don&apos;t, please don&apos;t use
        it.
      </p>

      <h2>The basics</h2>
      <ul>
        <li>
          Space Field is provided as-is. We try to keep it up but make no
          uptime guarantee — for now this is a single-developer project.
        </li>
        <li>
          You&apos;re responsible for keeping your account credentials safe.
        </li>
        <li>
          Don&apos;t use Space Field to do illegal things, harass others,
          send spam, mine cryptocurrency, or hammer the service to break it.
        </li>
      </ul>

      <h2>Your content</h2>
      <p>
        You own everything you create inside Space Field — workspace state,
        notes, lists, anything you type into tools. We claim no rights over
        it. If you delete it, it&apos;s gone.
      </p>

      <h2>Workspace sharing</h2>
      <p>
        When you invite someone to a workspace, they get the role you give
        them (member or admin). Members can read and write the shared
        workspace state. Don&apos;t share workspaces with content you
        wouldn&apos;t want them to see.
      </p>

      <h2>Free tier</h2>
      <p>
        Today Space Field is free. If we add paid tiers in the future,
        existing free accounts won&apos;t suddenly be locked — we&apos;ll
        give plenty of notice.
      </p>

      <h2>Paid plans, cancellations, and refunds</h2>
      <p>
        Pro, Team, and Enterprise plans plus storage add-ons are
        recurring subscriptions. You can cancel any subscription at any
        time from <strong>Settings → Workspaces</strong>; cancellation
        takes effect at the end of the current billing period and we
        don&apos;t pro-rate unused days. Customers in the EU and UK have
        a 14-day right to withdraw on the initial purchase. Other refund
        scenarios (platform outages, duplicate charges, accidental
        renewals) are covered in our full{" "}
        <a href="/refund">refund policy</a>.
      </p>

      <h2>Termination</h2>
      <p>
        You can delete your account at any time. We can suspend accounts
        that abuse the service.
      </p>

      <h2>Liability</h2>
      <p>
        Space Field is provided without warranties of any kind. We&apos;re
        not liable for indirect, incidental, or consequential damages
        arising from using or being unable to use the service.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        If we update these terms materially we&apos;ll bump the
        &quot;last updated&quot; date and announce on the site. Continued
        use after a change means you accept the new version.
      </p>

      <h2>Contact</h2>
      <p>
        Anything unclear? Use the <a href="/contact">contact form</a>.
      </p>
    </MarketingShell>
  );
}
