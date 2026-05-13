import DraftBanner from "../../_components/DraftBanner";

export const metadata = {
  title: "Terms of Service · Space Field",
  description: "The terms that govern your use of Space Field.",
};

const EFFECTIVE = "May 13, 2026";

export default function TermsPage() {
  return (
    <>
      <DraftBanner />
      <p className="text-xs text-faint">Effective {EFFECTIVE}</p>
      <h2>Terms of Service</h2>

      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and
        use of Space Field (&quot;Spacefield&quot;, &quot;we&quot;,
        &quot;us&quot;), operated from the United Arab Emirates. By creating an
        account or otherwise using the Service, you agree to these Terms.
      </p>

      <h3>1. The Service</h3>
      <p>
        Space Field provides a hosted platform of real-estate and business
        tools, AI assistants, content-sharing utilities, and related software
        functionality. Features and tools available on the Service may change
        over time.
      </p>

      <h3>2. Accounts</h3>
      <p>
        You must provide accurate registration information and keep your
        credentials secure. You are responsible for activity on your account.
        We may suspend or terminate accounts that violate these Terms or
        applicable law.
      </p>

      <h3>3. Acceptable use</h3>
      <p>
        Your use of the Service is governed by our{" "}
        <a href="/legal/aup">Acceptable Use Policy</a>. You must not use the
        Service to infringe rights, send unsolicited communications, attempt
        to disrupt the platform, or process content that violates law.
      </p>

      <h3>4. Subscriptions & billing</h3>
      <p>
        Paid plans renew automatically until cancelled. Payments are processed
        by Paddle.com, our merchant-of-record, which handles taxes including
        UAE VAT where applicable. Refunds are at our discretion and follow the
        policy stated on the Pricing page.
      </p>

      <h3>5. AI features</h3>
      <p>
        The Service uses third-party AI providers (Anthropic, OpenAI, others).
        AI-generated content may be incorrect, incomplete, or biased. You are
        responsible for reviewing AI output before relying on it for material
        decisions, legal advice, financial advice, or property transactions.
      </p>

      <h3>6. Content you submit</h3>
      <p>
        You retain ownership of content you upload to the Service. You grant
        us a non-exclusive, worldwide licence to process that content solely
        to provide the Service to you, including transmitting it to AI
        providers under our{" "}
        <a href="/legal/subprocessors">subprocessor list</a> and{" "}
        <a href="/legal/privacy">Privacy Policy</a>.
      </p>

      <h3>7. Our intellectual property</h3>
      <p>
        The Service, its branding, source code, documentation, and tool
        templates are owned by Spacefield or its licensors. Nothing in these
        Terms transfers our IP to you.
      </p>

      <h3>8. Service availability</h3>
      <p>
        We aim for reliable service but do not guarantee uninterrupted
        availability. Scheduled maintenance is communicated when practical;
        unplanned downtime may occur.
      </p>

      <h3>9. Disclaimers</h3>
      <p>
        The Service is provided &quot;as is&quot; and &quot;as available&quot;
        without warranties of any kind, express or implied, to the maximum
        extent permitted by law.
      </p>

      <h3>10. Limitation of liability</h3>
      <p>
        To the maximum extent permitted by law, our aggregate liability under
        these Terms is limited to the amount you paid us in the 12 months
        preceding the claim. We are not liable for indirect, incidental,
        special, or consequential damages.
      </p>

      <h3>11. Governing law</h3>
      <p>
        These Terms are governed by the laws of the United Arab Emirates.
        Disputes are subject to the exclusive jurisdiction of the courts of
        Dubai, UAE.
      </p>

      <h3>12. Changes</h3>
      <p>
        We may update these Terms. Material changes will be notified by email
        or in-app at least 14 days before they take effect.
      </p>

      <h3>13. Contact</h3>
      <p>
        Questions:{" "}
        <a href="mailto:legal@spacefield.co">legal@spacefield.co</a>.
      </p>
    </>
  );
}
