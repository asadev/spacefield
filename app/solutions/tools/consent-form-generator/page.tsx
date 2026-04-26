"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";

const DATA_CATEGORIES = [
  "Name",
  "Email address",
  "Phone number",
  "Postal address",
  "Date of birth",
  "Government ID",
  "Financial / payment information",
  "IP address & device identifiers",
  "Usage & behavioral data",
  "Location data",
  "Health information",
  "Employment details",
];

const LEGAL_BASES = [
  {
    value: "consent",
    label: "Consent (Art. 6(1)(a))",
    blurb:
      "The data subject has given consent to the processing of their personal data for one or more specific purposes.",
  },
  {
    value: "contract",
    label: "Contract (Art. 6(1)(b))",
    blurb:
      "Processing is necessary for the performance of a contract to which the data subject is party or to take steps at the request of the data subject prior to entering into a contract.",
  },
  {
    value: "legitimate-interest",
    label: "Legitimate interest (Art. 6(1)(f))",
    blurb:
      "Processing is necessary for the purposes of the legitimate interests pursued by the controller, except where such interests are overridden by the rights and freedoms of the data subject.",
  },
  {
    value: "legal-obligation",
    label: "Legal obligation (Art. 6(1)(c))",
    blurb:
      "Processing is necessary for compliance with a legal obligation to which the controller is subject.",
  },
];

const RECIPIENT_CATEGORIES = [
  "Payment processors",
  "Cloud hosting & infrastructure providers",
  "Customer support platforms",
  "Analytics & marketing services",
  "Professional advisers (legal, accounting)",
  "Law enforcement or regulators (when legally required)",
];

// Inline-style helpers for the legal-doc preview. Token-driven so the legal
// theme controls the accent without any global style overrides.
const fillInline: React.CSSProperties = {
  backgroundColor: "var(--tool-accent-soft)",
  borderBottom: "1px dashed var(--tool-accent)",
  padding: "0 3px",
  borderRadius: 2,
  fontWeight: 500,
};

const fillBlock: React.CSSProperties = {
  backgroundColor: "var(--tool-accent-soft)",
  borderLeft: "2px solid var(--tool-accent)",
  padding: "6px 10px",
  borderRadius: 2,
  fontWeight: 500,
  display: "block",
};

export default function ConsentFormGeneratorPage() {
  const [company, setCompany] = useState("Acme Inc.");
  const [controller, setController] = useState(
    "Acme Inc., a Delaware corporation with registered office at 123 Market St, San Francisco, CA 94103"
  );
  const [purpose, setPurpose] = useState(
    "managing your account, providing our services, and sending product updates you have opted into"
  );
  const [categories, setCategories] = useState<string[]>([
    "Name",
    "Email address",
    "IP address & device identifiers",
    "Usage & behavioral data",
  ]);
  const [basis, setBasis] = useState(LEGAL_BASES[0].value);
  const [retention, setRetention] = useState(
    "for the duration of your account plus 24 months, unless a longer period is required by law"
  );
  const [recipients, setRecipients] = useState<string[]>([
    "Payment processors",
    "Cloud hosting & infrastructure providers",
    "Analytics & marketing services",
  ]);
  const [thirdCountry, setThirdCountry] = useState(false);
  const [country, setCountry] = useState("United States");
  const [contactEmail, setContactEmail] = useState("privacy@acme.com");

  const toggle = (
    value: string,
    list: string[],
    setter: (v: string[]) => void
  ) => {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  const basisLabel = LEGAL_BASES.find((b) => b.value === basis)?.label ?? "";
  const basisBlurb = LEGAL_BASES.find((b) => b.value === basis)?.blurb ?? "";

  const formText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`DATA PROCESSING CONSENT FORM — ${company}`);
    lines.push("");
    lines.push("1. Data Controller");
    lines.push(controller);
    lines.push(`Contact for privacy matters: ${contactEmail}`);
    lines.push("");
    lines.push("2. Purpose of Processing");
    lines.push(`We process your personal data for the purpose of ${purpose}.`);
    lines.push("");
    lines.push("3. Categories of Personal Data");
    lines.push("We collect and process the following categories of personal data:");
    categories.forEach((c) => lines.push(`  • ${c}`));
    lines.push("");
    lines.push("4. Legal Basis for Processing");
    lines.push(
      `The legal basis for the processing is ${LEGAL_BASES.find((b) => b.value === basis)?.label}. ${basisBlurb}`
    );
    lines.push("");
    lines.push("5. Retention Period");
    lines.push(`We will retain your personal data ${retention}.`);
    lines.push("");
    lines.push("6. Recipients");
    lines.push(
      "Your personal data may be shared with the following categories of recipients, each of whom is bound by appropriate confidentiality and data protection obligations:"
    );
    recipients.forEach((r) => lines.push(`  • ${r}`));
    lines.push("");
    lines.push("7. International Transfers");
    if (thirdCountry) {
      lines.push(
        `Your personal data may be transferred to ${country}. Where such transfers occur outside the European Economic Area, they are protected by appropriate safeguards, including Standard Contractual Clauses approved by the European Commission and, where applicable, supplementary measures.`
      );
    } else {
      lines.push(
        "Your personal data will be processed within the European Economic Area and will not be transferred to third countries."
      );
    }
    lines.push("");
    lines.push("8. Your Rights");
    lines.push(
      "You have the right to: (a) access your personal data; (b) rectify inaccurate data; (c) request erasure; (d) restrict processing; (e) data portability; (f) object to processing; (g) withdraw consent at any time, without affecting the lawfulness of processing based on consent before its withdrawal; and (h) lodge a complaint with a supervisory authority."
    );
    lines.push("");
    lines.push("9. Consent");
    lines.push(
      "I confirm that I have read and understood the information above and I consent to the processing of my personal data for the purposes described."
    );
    lines.push("");
    lines.push("Full name: _________________________________");
    lines.push("Signature: _________________________________");
    lines.push("Date:       _________________________________");
    return lines.join("\n");
  }, [
    company,
    controller,
    contactEmail,
    purpose,
    categories,
    basis,
    basisBlurb,
    retention,
    recipients,
    thirdCountry,
    country,
  ]);

  const copy = () => navigator.clipboard?.writeText(formText);

  // Numbered legal-doc sections rendered as a styled preview (visual only).
  const sections: { n: number; title: string; body: React.ReactNode }[] = [
    {
      n: 1,
      title: "Data Controller",
      body: (
        <>
          <p style={fillBlock} className="text-app">
            {controller}
          </p>
          <p className="mt-2 text-[0.78rem] text-secondary">
            Contact for privacy matters:{" "}
            <span style={fillInline} className="text-app">
              {contactEmail}
            </span>
          </p>
        </>
      ),
    },
    {
      n: 2,
      title: "Purpose of Processing",
      body: (
        <p>
          We process your personal data for the purpose of{" "}
          <span style={fillInline} className="text-app">
            {purpose}
          </span>
          .
        </p>
      ),
    },
    {
      n: 3,
      title: "Categories of Personal Data",
      body: (
        <>
          <p>We collect and process the following categories of personal data:</p>
          <ul className="mt-2 ml-5 list-disc space-y-0.5 text-app">
            {categories.length === 0 ? (
              <li className="italic text-muted">— none selected —</li>
            ) : (
              categories.map((c) => <li key={c}>{c}</li>)
            )}
          </ul>
        </>
      ),
    },
    {
      n: 4,
      title: "Legal Basis for Processing",
      body: (
        <p>
          The legal basis for the processing is{" "}
          <span style={fillInline} className="text-app">
            {basisLabel}
          </span>
          . {basisBlurb}
        </p>
      ),
    },
    {
      n: 5,
      title: "Retention Period",
      body: (
        <p>
          We will retain your personal data{" "}
          <span style={fillInline} className="text-app">
            {retention}
          </span>
          .
        </p>
      ),
    },
    {
      n: 6,
      title: "Recipients",
      body: (
        <>
          <p>
            Your personal data may be shared with the following categories of
            recipients, each of whom is bound by appropriate confidentiality and
            data protection obligations:
          </p>
          <ul className="mt-2 ml-5 list-disc space-y-0.5 text-app">
            {recipients.length === 0 ? (
              <li className="italic text-muted">— none selected —</li>
            ) : (
              recipients.map((r) => <li key={r}>{r}</li>)
            )}
          </ul>
        </>
      ),
    },
    {
      n: 7,
      title: "International Transfers",
      body: thirdCountry ? (
        <p>
          Your personal data may be transferred to{" "}
          <span style={fillInline} className="text-app">
            {country}
          </span>
          . Where such transfers occur outside the European Economic Area, they
          are protected by appropriate safeguards, including Standard
          Contractual Clauses approved by the European Commission and, where
          applicable, supplementary measures.
        </p>
      ) : (
        <p>
          Your personal data will be processed within the European Economic
          Area and will not be transferred to third countries.
        </p>
      ),
    },
    {
      n: 8,
      title: "Your Rights",
      body: (
        <p>
          You have the right to: (a) access your personal data; (b) rectify
          inaccurate data; (c) request erasure; (d) restrict processing; (e)
          data portability; (f) object to processing; (g) withdraw consent at
          any time, without affecting the lawfulness of processing based on
          consent before its withdrawal; and (h) lodge a complaint with a
          supervisory authority.
        </p>
      ),
    },
    {
      n: 9,
      title: "Consent",
      body: (
        <p>
          I confirm that I have read and understood the information above and I
          consent to the processing of my personal data for the purposes
          described.
        </p>
      ),
    },
  ];

  return (
    <ToolShell
      category="Legal & Compliance"
      title="GDPR Consent Form Generator"
      description="Build a compliant consent form — controller, purpose, data categories, legal basis, retention, recipients, and international transfers."
    >
      <div data-tool-theme="legal" data-tool="consent-form-generator">
        {/* Foundation hero band — legal slate via tool-hero */}
        <div className="tool-hero mb-6 rounded-xl border border-app px-5 py-4">
          <div className="flex items-center gap-3 text-[0.6rem] uppercase tracking-[0.32em] text-secondary">
            <span className="inline-block h-px w-8 bg-tool-accent" />
            GDPR · Article 6 · Data Protection Notice
          </div>
          <h2 className="mt-2 font-tool-heading text-xl font-semibold text-app">
            Draft a compliant consent form in minutes
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.25fr]">
          {/* Left rail — input form */}
          <div className="relative">
            <ToolCard title="Form details" subtitle="Draft inputs">
              <div className="grid grid-cols-1 gap-3">
                <Field label="Company name">
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className={inputCls("ring-tool-accent focus:ring-2")}
                  />
                </Field>
                <Field label="Data controller (full legal description)">
                  <textarea
                    value={controller}
                    onChange={(e) => setController(e.target.value)}
                    className={inputCls("min-h-[72px] ring-tool-accent focus:ring-2")}
                  />
                </Field>
                <Field label="Purpose of processing">
                  <textarea
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    className={inputCls("min-h-[72px] ring-tool-accent focus:ring-2")}
                  />
                </Field>
                <Field label="Contact email">
                  <input
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className={inputCls("ring-tool-accent focus:ring-2")}
                  />
                </Field>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.18em] text-secondary">
                  <span className="inline-block h-1 w-4 bg-tool-accent" />
                  Data categories collected
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {DATA_CATEGORIES.map((c) => {
                    const on = categories.includes(c);
                    return (
                      <label
                        key={c}
                        className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-xs transition-colors ${
                          on
                            ? "border-tool-accent bg-tool-accent-soft text-app"
                            : "border-app bg-surface text-secondary hover:border-tool-accent"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(c, categories, setCategories)}
                          className="h-3 w-3 accent-current text-tool-accent"
                        />
                        {c}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4">
                <Field label="Legal basis">
                  <select
                    value={basis}
                    onChange={(e) => setBasis(e.target.value)}
                    className={inputCls("ring-tool-accent focus:ring-2")}
                  >
                    {LEGAL_BASES.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="mt-3">
                <Field label="Retention period">
                  <input
                    value={retention}
                    onChange={(e) => setRetention(e.target.value)}
                    className={inputCls("ring-tool-accent focus:ring-2")}
                  />
                </Field>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.18em] text-secondary">
                  <span className="inline-block h-1 w-4 bg-tool-accent" />
                  Recipient categories
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {RECIPIENT_CATEGORIES.map((r) => {
                    const on = recipients.includes(r);
                    return (
                      <label
                        key={r}
                        className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-xs transition-colors ${
                          on
                            ? "border-tool-accent bg-tool-accent-soft text-app"
                            : "border-app bg-surface text-secondary hover:border-tool-accent"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(r, recipients, setRecipients)}
                          className="h-3 w-3 accent-current text-tool-accent"
                        />
                        {r}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <Field label="Third-country transfer?">
                  <select
                    value={thirdCountry ? "yes" : "no"}
                    onChange={(e) => setThirdCountry(e.target.value === "yes")}
                    className={inputCls("ring-tool-accent focus:ring-2")}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </Field>
                <Field label="Country">
                  <input
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    disabled={!thirdCountry}
                    className={inputCls(
                      thirdCountry
                        ? "ring-tool-accent focus:ring-2"
                        : "opacity-40"
                    )}
                  />
                </Field>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  onClick={copy}
                  className="rounded-md border border-app bg-surface px-4 py-2.5 text-sm text-secondary transition-colors hover:border-tool-accent hover:text-app"
                >
                  Copy text
                </button>
                <button
                  onClick={() => window.print()}
                  className="rounded-md border border-tool-accent bg-tool-accent-soft px-4 py-2.5 text-sm font-medium text-app transition-colors hover:brightness-110"
                >
                  Print / PDF
                </button>
              </div>
            </ToolCard>
          </div>

          {/* Right — legal-doc preview chrome */}
          <div id="consent-print-root">
            <div className="relative overflow-hidden rounded-xl border border-app bg-app-elevated">
              {/* Document chrome — paper sheet on bg-app-elevated */}
              <div
                className="relative mx-auto max-w-none p-8 sm:p-10 text-app"
                style={{
                  fontFamily: "var(--tool-heading-family)",
                  minHeight: 820,
                }}
              >
                {/* Side rule — uses tool surface tint */}
                <span
                  className="pointer-events-none absolute left-6 top-10 bottom-10 w-px sm:left-8"
                  style={{ background: "var(--tool-accent-soft)" }}
                />
                {/* Corner serif marks */}
                <span
                  className="pointer-events-none absolute left-3 top-3 h-4 w-4 border-l border-t border-tool-accent"
                />
                <span
                  className="pointer-events-none absolute right-3 top-3 h-4 w-4 border-r border-t border-tool-accent"
                />
                <span
                  className="pointer-events-none absolute left-3 bottom-3 h-4 w-4 border-l border-b border-tool-accent"
                />
                <span
                  className="pointer-events-none absolute right-3 bottom-3 h-4 w-4 border-r border-b border-tool-accent"
                />

                {/* Masthead */}
                <header className="border-b-2 border-app pb-5 text-center">
                  <div
                    className="text-[0.6rem] uppercase tracking-[0.4em] text-tool-accent"
                  >
                    GDPR · Article 6 · Data Protection Notice
                  </div>
                  <h1 className="mt-2 font-tool-heading text-[1.45rem] font-semibold uppercase tracking-[0.18em] text-app">
                    Data Processing Consent Form
                  </h1>
                  <div className="mt-2 flex items-center justify-center gap-3 text-[0.7rem] uppercase tracking-[0.25em] text-muted">
                    <span className="h-px w-10 bg-app" />
                    <span>Executed Document</span>
                    <span className="h-px w-10 bg-app" />
                  </div>
                </header>

                {/* Party block */}
                <section className="mt-6 grid grid-cols-1 gap-4 rounded border border-app bg-surface p-4 sm:grid-cols-2">
                  <div>
                    <div className="text-[0.55rem] uppercase tracking-[0.28em] text-muted">
                      Controller
                    </div>
                    <div className="mt-1 text-[0.95rem] font-semibold text-app">
                      <span style={fillInline}>{company}</span>
                    </div>
                    <div className="mt-1 text-[0.78rem] leading-snug text-secondary">
                      {controller}
                    </div>
                  </div>
                  <div>
                    <div className="text-[0.55rem] uppercase tracking-[0.28em] text-muted">
                      Data Subject
                    </div>
                    <div className="mt-1 text-[0.95rem] font-semibold italic text-muted">
                      [ to be completed by signatory ]
                    </div>
                    <div className="mt-1 text-[0.78rem] leading-snug text-secondary">
                      Privacy contact:{" "}
                      <span style={fillInline} className="text-app">
                        {contactEmail}
                      </span>
                    </div>
                  </div>
                </section>

                {/* Body — numbered sections */}
                <article className="mt-7 space-y-5 text-[0.88rem] leading-[1.65] text-app">
                  {sections.map((s) => (
                    <section key={s.n} className="relative pl-9">
                      <span
                        className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border border-tool-accent bg-tool-accent-soft text-[0.65rem] font-semibold text-tool-accent"
                      >
                        {s.n}
                      </span>
                      <h3 className="mb-1 font-tool-heading text-[0.78rem] font-semibold uppercase tracking-[0.18em] text-app">
                        Article {s.n}. {s.title}
                      </h3>
                      <div className="text-app">{s.body}</div>
                    </section>
                  ))}
                </article>

                {/* Signature block */}
                <footer className="mt-10 border-t border-app pt-6">
                  <div className="mb-4 text-[0.6rem] uppercase tracking-[0.32em] text-muted">
                    Signatures &amp; Acknowledgement
                  </div>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div>
                      <div className="h-10 border-b border-app-strong" />
                      <div className="mt-1 text-[0.65rem] uppercase tracking-[0.22em] text-muted">
                        Full name
                      </div>
                    </div>
                    <div>
                      <div className="h-10 border-b border-app-strong" />
                      <div className="mt-1 text-[0.65rem] uppercase tracking-[0.22em] text-muted">
                        Date
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <div className="h-12 border-b border-app-strong" />
                      <div className="mt-1 flex items-center justify-between text-[0.65rem] uppercase tracking-[0.22em] text-muted">
                        <span>Signature of data subject</span>
                        <span className="italic normal-case tracking-normal text-faint">
                          x ——————————
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 text-center text-[0.6rem] uppercase tracking-[0.3em] text-muted">
                    — End of Document —
                  </div>
                </footer>
              </div>
            </div>

            {/* Hidden plain-text payload preserved for clipboard / print fallback. */}
            <pre className="sr-only" aria-hidden="true">
              {formText}
            </pre>
          </div>
        </div>
      </div>
    </ToolShell>
  );
}
