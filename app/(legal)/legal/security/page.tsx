import DraftBanner from "../../_components/DraftBanner";

export const metadata = {
  title: "Trust & security · Space Field",
  description: "How we protect your data and what we're working on next.",
};

export default function SecurityPage() {
  return (
    <>
      <DraftBanner level="review" />
      <h2>Trust &amp; security</h2>

      <p>
        Space Field is built by a small team operating from the UAE. We treat
        security as table-stakes engineering, not a feature. This page is a
        plain-English summary of what we do today and what we&apos;re actively
        working on.
      </p>

      <h3>What we do today</h3>
      <ul>
        <li>
          <strong>TLS 1.3</strong> on every connection. HSTS enforced
          (max-age 2 years, includeSubDomains, preload).
        </li>
        <li>
          <strong>Row-Level Security</strong> on multi-tenant tables.
          Workspace isolation enforced at the database layer, not just app
          code.
        </li>
        <li>
          <strong>Role-based access control</strong> for the admin panel
          with per-route permission gates and a full audit log.
        </li>
        <li>
          <strong>Rate limiting + IP rules</strong> on the edge, with admin
          controls for blocking specific addresses and customising per-route
          limits.
        </li>
        <li>
          <strong>Security headers</strong> on every response: HSTS,
          X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
          Permissions-Policy, and a Content-Security-Policy (report-only
          while we tune it).
        </li>
        <li>
          <strong>Cookies</strong> are Secure + HttpOnly + SameSite=Lax for
          session tokens.
        </li>
        <li>
          <strong>Encrypted at rest</strong> — Supabase storage and database
          are encrypted with AES-256.
        </li>
        <li>
          <strong>Daily backups</strong> with point-in-time recovery on the
          database.
        </li>
        <li>
          <strong>Webhook signatures</strong> verified on incoming Paddle
          calls; outbound webhooks are HMAC-signed.
        </li>
      </ul>

      <h3>What we&apos;re working on</h3>
      <ul>
        <li>
          Third-party penetration test before our public launch.
        </li>
        <li>External error tracking (Sentry) with source-mapped releases.</li>
        <li>Synthetic monitoring + public uptime page on status.spacefield.co.</li>
        <li>SOC 2 Type 1 readiness (Drata or Vanta as the control plane).</li>
        <li>MFA / 2FA opt-in for end users (already planned for admins).</li>
        <li>Documented incident-response and breach-notification runbooks.</li>
      </ul>

      <h3>Subprocessors &amp; data flow</h3>
      <p>
        See the <a href="/legal/subprocessors">Subprocessors page</a> for the
        full list of third parties involved in serving the platform. Customer
        data is stored on Supabase infrastructure in the European Union with
        global edge caching via Vercel.
      </p>

      <h3>Responsible disclosure</h3>
      <p>
        If you believe you&apos;ve found a security issue, please email{" "}
        <a href="mailto:security@spacefield.co">security@spacefield.co</a>.
        We aim to acknowledge within 72 hours and resolve verified issues
        promptly. Please give us reasonable time to fix before public
        disclosure. Our machine-readable contact info lives at{" "}
        <a href="/.well-known/security.txt">/.well-known/security.txt</a>.
      </p>

      <p>
        We do not yet run a paid bug bounty program. Notable researchers may
        be acknowledged in the hall of fame below (with consent).
      </p>

      <h3 id="hall-of-fame">Hall of fame</h3>
      <p className="text-sm text-secondary">
        Once we receive valid reports, names go here. Empty for now.
      </p>

      <h3>Questions</h3>
      <p>
        Enterprise security questionnaires:{" "}
        <a href="mailto:security@spacefield.co">security@spacefield.co</a>.
      </p>
    </>
  );
}
