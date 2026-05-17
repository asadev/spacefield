import DraftBanner from "../../_components/DraftBanner";

export const metadata = {
  title: "Acceptable Use Policy · Space Field",
  description: "What you may and may not do on Space Field.",
};

// Legal copy changes only on deploy. 1-hour ISR.
export const revalidate = 3600;

export default function AupPage() {
  return (
    <>
      <DraftBanner />
      <h2>Acceptable Use Policy</h2>

      <p>
        This Acceptable Use Policy (&quot;AUP&quot;) is part of our{" "}
        <a href="/legal/terms">Terms of Service</a>. Violating it can result in
        suspension or termination of your account.
      </p>

      <h3>1. You must not</h3>
      <ul>
        <li>
          Use the Service to violate any law or regulation, including UAE law.
        </li>
        <li>
          Infringe intellectual property, privacy, or publicity rights of any
          person or organisation.
        </li>
        <li>
          Send spam, unsolicited bulk email, or other unwanted communications
          via Space Field or its share-link infrastructure.
        </li>
        <li>
          Upload or generate content that is illegal, defamatory, harassing,
          hateful, sexually explicit involving minors, or that incites
          violence.
        </li>
        <li>
          Misrepresent the Service&apos;s AI-generated output as human-created
          where law or context requires disclosure.
        </li>
        <li>
          Attempt to circumvent the Service&apos;s security or rate limits, or
          probe / scan / load-test the Service without our written consent.
        </li>
        <li>
          Resell, white-label, or sublicense the Service unless you have an
          enterprise agreement permitting it.
        </li>
        <li>
          Use the Service to train competing AI models or to build a
          substantially similar product.
        </li>
        <li>
          Submit content you do not have rights to (e.g., scraped third-party
          databases, leaked private information).
        </li>
      </ul>

      <h3>2. Real-estate specific</h3>
      <ul>
        <li>
          Listings and outputs you generate must comply with the advertising
          and disclosure rules of the relevant jurisdiction (RERA in Dubai,
          MOMRA in KSA, etc.).
        </li>
        <li>
          You must not impersonate brokers, developers, or property owners.
        </li>
      </ul>

      <h3>3. AI output</h3>
      <p>
        You are responsible for reviewing AI-generated content before
        publishing it. AI features may produce inaccurate market data,
        property statistics, or legal text. Do not present AI output as
        professional financial, legal, or property valuation advice.
      </p>

      <h3>4. Reporting violations</h3>
      <p>
        Email <a href="mailto:abuse@spacefield.co">abuse@spacefield.co</a>{" "}
        with details. We investigate every report.
      </p>

      <h3>5. Enforcement</h3>
      <p>
        We may suspend or terminate accounts that violate this AUP, and may
        remove content without prior notice when required to protect users,
        the Service, or comply with law.
      </p>
    </>
  );
}
