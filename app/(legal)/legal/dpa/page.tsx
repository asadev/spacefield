import DraftBanner from "../../_components/DraftBanner";

export const metadata = {
  title: "Data Processing Agreement · Space Field",
  description: "How Space Field acts as a data processor for our business customers.",
};

export default function DpaPage() {
  return (
    <>
      <DraftBanner />
      <h2>Data Processing Agreement (DPA)</h2>

      <p>
        This Data Processing Agreement applies when a business customer
        (&quot;Controller&quot;) uses Space Field (&quot;Processor&quot;) to
        process personal data of its own end users. It supplements our{" "}
        <a href="/legal/terms">Terms of Service</a> and forms part of the
        Agreement.
      </p>

      <h3>1. Roles</h3>
      <p>
        Where you use the Service to process personal data of your customers,
        employees, or other data subjects, you act as the Controller and we
        act as the Processor.
      </p>

      <h3>2. Scope &amp; instructions</h3>
      <p>
        We process Customer Data only to provide the Service as described in
        the Terms and our public documentation, and on documented
        instructions from the Controller. We notify the Controller if any
        instruction infringes applicable law.
      </p>

      <h3>3. Confidentiality</h3>
      <p>
        Personnel authorised to process Customer Data are subject to
        confidentiality obligations.
      </p>

      <h3>4. Security</h3>
      <p>
        We maintain technical and organisational measures including:
        encryption in transit (TLS 1.3) and at rest, row-level security,
        access logging, principle-of-least-privilege role assignment,
        regular dependency scanning, and incident response procedures. The
        current summary lives on the{" "}
        <a href="/legal/security">Trust &amp; security</a> page.
      </p>

      <h3>5. Sub-processors</h3>
      <p>
        We use the sub-processors listed on the{" "}
        <a href="/legal/subprocessors">Subprocessors page</a>. We will notify
        Controllers of changes via that page and (for material additions)
        email. Controllers may object to a new sub-processor within 15 days;
        if no resolution is reached, the Controller may terminate the
        affected Service for material breach.
      </p>

      <h3>6. International transfers</h3>
      <p>
        Where Customer Data is transferred outside the EEA, UK, UAE, or other
        relevant jurisdiction, transfers are governed by the EU Standard
        Contractual Clauses (or the equivalent UK IDTA / UAE PDPL transfer
        mechanism), incorporated by reference.
      </p>

      <h3>7. Data subject rights</h3>
      <p>
        We provide self-service tools for Controllers to honour access,
        correction, deletion, and portability requests. Where a request
        reaches us directly, we forward it to the Controller without undue
        delay.
      </p>

      <h3>8. Breach notification</h3>
      <p>
        We notify Controllers of any confirmed personal data breach affecting
        their data without undue delay and in any case within 72 hours.
      </p>

      <h3>9. Audit</h3>
      <p>
        We make available to Controllers all information necessary to
        demonstrate compliance with this DPA, and accept reasonable
        documentation-based audits, typically once per 12 months and at the
        Controller&apos;s expense. SOC 2 / ISO 27001 attestation reports
        will be provided when issued.
      </p>

      <h3>10. Deletion / return</h3>
      <p>
        Upon termination of the Service, we delete or return Customer Data
        within 30 days, except where retention is required by law.
      </p>

      <h3>11. Signing</h3>
      <p>
        Most customers do not need a separately signed copy of this DPA;
        acceptance of the Terms of Service incorporates it by reference. If
        your organisation requires a counter-signed copy, email{" "}
        <a href="mailto:legal@spacefield.co">legal@spacefield.co</a>.
      </p>
    </>
  );
}
