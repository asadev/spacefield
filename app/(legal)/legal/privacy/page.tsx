import DraftBanner from "../../_components/DraftBanner";

export const metadata = {
  title: "Privacy Policy · Space Field",
  description: "How Space Field collects, uses, and protects your data.",
};

// Legal copy changes only on deploy. 1-hour ISR.
export const revalidate = 3600;

const EFFECTIVE = "May 13, 2026";

export default function PrivacyPage() {
  return (
    <>
      <DraftBanner />
      <p className="text-xs text-faint">Effective {EFFECTIVE}</p>
      <h2>Privacy Policy</h2>

      <p>
        This Privacy Policy explains how Space Field (&quot;we&quot;) collects
        and uses personal data when you use our Service. It is written to be
        compatible with the UAE Personal Data Protection Law (Federal
        Decree-Law No. 45 of 2021) and the EU General Data Protection
        Regulation (GDPR).
      </p>

      <h3>1. Data controller</h3>
      <p>
        Spacefield is the data controller for your account data. Contact{" "}
        <a href="mailto:privacy@spacefield.co">privacy@spacefield.co</a> for
        any privacy enquiry.
      </p>

      <h3>2. What we collect</h3>
      <ul>
        <li>
          <strong>Account data:</strong> name, email, hashed password, sign-in
          method, profile preferences.
        </li>
        <li>
          <strong>Usage data:</strong> pages viewed, features used, AI tool
          interactions, share-link activity.
        </li>
        <li>
          <strong>Content data:</strong> documents, contacts, listings, and
          any other content you submit to the Service.
        </li>
        <li>
          <strong>Device data:</strong> IP address, browser, OS, locale, and
          rough geolocation (city level).
        </li>
        <li>
          <strong>Billing data:</strong> handled by Paddle.com (our
          merchant-of-record); we receive only invoice metadata, not full card
          numbers.
        </li>
      </ul>

      <h3>3. Why we use it (legal basis)</h3>
      <ul>
        <li>
          <strong>Contract:</strong> to provide the Service you signed up for.
        </li>
        <li>
          <strong>Legitimate interests:</strong> security, fraud prevention,
          product improvement, internal analytics.
        </li>
        <li>
          <strong>Consent:</strong> marketing emails, analytics cookies,
          optional features (you can withdraw consent at any time).
        </li>
        <li>
          <strong>Legal obligation:</strong> tax records, lawful disclosure
          requests.
        </li>
      </ul>

      <h3>4. Who we share it with</h3>
      <p>
        We use a small set of third-party subprocessors to operate the
        Service. The full current list is on the{" "}
        <a href="/legal/subprocessors">Subprocessors page</a>. We do not sell
        your personal data to anyone.
      </p>

      <h3>5. AI providers</h3>
      <p>
        When you use AI features, the content you submit is transmitted to our
        AI providers (Anthropic, OpenAI). We instruct providers not to train
        their models on your content where this is supported. Provider
        retention windows are summarised on the{" "}
        <a href="/legal/subprocessors">Subprocessors page</a>.
      </p>

      <h3>6. Where we store data</h3>
      <p>
        Your data is stored on Supabase infrastructure in the European Union
        (eu-west / eu-central regions) with daily backups. Edge functions and
        CDN caches are global. If you require data residency in a specific
        jurisdiction (UAE, KSA), contact us — we can discuss enterprise
        arrangements.
      </p>

      <h3>7. How long we keep it</h3>
      <p>
        Account data is retained while your account is active. After deletion,
        we hard-delete content within 30 days and retain only the minimum
        required for legal, tax, and audit purposes (typically 6 years).
      </p>

      <h3>8. Your rights</h3>
      <p>
        Under the GDPR and UAE PDPL you have the right to access, correct,
        delete, restrict, port, or object to processing of your personal data.
        Self-service tools for export and deletion are available from your
        account settings; for anything else, email{" "}
        <a href="mailto:privacy@spacefield.co">privacy@spacefield.co</a>. We
        respond within 30 days.
      </p>

      <h3>9. Security</h3>
      <p>
        We encrypt data at rest and in transit, enforce row-level security on
        multi-tenant tables, and log administrative actions. Our practices
        evolve continuously; the latest summary lives on the{" "}
        <a href="/legal/security">Trust &amp; security</a> page.
      </p>

      <h3>10. Children</h3>
      <p>
        The Service is not directed to children under 13. Do not register a
        child for the Service.
      </p>

      <h3>11. Changes</h3>
      <p>
        Material changes are notified at least 14 days before they take
        effect.
      </p>

      <h3>12. Contact</h3>
      <p>
        <a href="mailto:privacy@spacefield.co">privacy@spacefield.co</a>
      </p>
    </>
  );
}
