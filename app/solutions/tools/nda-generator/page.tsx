"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";

type Party = { name: string; address: string };

const JURISDICTIONS = [
  "Delaware, USA",
  "New York, USA",
  "California, USA",
  "England & Wales",
  "United Arab Emirates",
  "Singapore",
];

const JURISDICTION_CLAUSES: Record<string, string> = {
  "Delaware, USA":
    "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of law principles. The parties consent to the exclusive jurisdiction of the state and federal courts located in New Castle County, Delaware.",
  "New York, USA":
    "This Agreement shall be governed by and construed in accordance with the laws of the State of New York, without regard to its conflict of law principles. The parties consent to the exclusive jurisdiction of the state and federal courts located in New York County, New York.",
  "California, USA":
    "This Agreement shall be governed by and construed in accordance with the laws of the State of California, without regard to its conflict of law principles. The parties consent to the exclusive jurisdiction of the state and federal courts located in the Northern District of California.",
  "England & Wales":
    "This Agreement shall be governed by and construed in accordance with the laws of England and Wales. The parties submit to the exclusive jurisdiction of the courts of England and Wales in relation to any dispute arising out of or in connection with this Agreement.",
  "United Arab Emirates":
    "This Agreement shall be governed by the laws of the United Arab Emirates as applied in the Emirate of Dubai. The parties submit to the exclusive jurisdiction of the Dubai courts, save that either party may, at its discretion, refer any dispute to the DIFC Courts where jurisdiction applies.",
  "Singapore":
    "This Agreement shall be governed by and construed in accordance with the laws of the Republic of Singapore. The parties submit to the exclusive jurisdiction of the Singapore courts.",
};

export default function NdaGeneratorPage() {
  const [mutual, setMutual] = useState(true);
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [term, setTerm] = useState("3");
  const [jurisdiction, setJurisdiction] = useState(JURISDICTIONS[0]);
  const [purpose, setPurpose] = useState(
    "evaluating a potential business relationship between the parties"
  );
  const [parties, setParties] = useState<Party[]>([
    { name: "Acme Inc.", address: "123 Market St, San Francisco, CA 94103" },
    { name: "Beta LLC", address: "456 High St, Wilmington, DE 19801" },
  ]);

  const addParty = () => {
    if (parties.length >= 3) return;
    setParties((p) => [...p, { name: "", address: "" }]);
  };
  const removeParty = (i: number) => {
    if (parties.length <= 2) return;
    setParties((p) => p.filter((_, idx) => idx !== i));
  };
  const updateParty = (i: number, patch: Partial<Party>) => {
    setParties((p) => p.map((party, idx) => (idx === i ? { ...party, ...patch } : party)));
  };

  const effectiveLong = useMemo(() => {
    try {
      const d = new Date(effectiveDate);
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return effectiveDate;
    }
  }, [effectiveDate]);

  const partyBlock = (p: Party, i: number) => {
    const idx = i + 1;
    const label =
      parties.length === 2
        ? i === 0
          ? '"Disclosing Party"'
          : '"Receiving Party"'
        : `"Party ${idx}"`;
    return `${p.name || `[Party ${idx} Name]`}, having its principal place of business at ${p.address || "[address]"} (${label})`;
  };

  const ndaText = useMemo(() => {
    const title = mutual
      ? "MUTUAL NON-DISCLOSURE AGREEMENT"
      : "NON-DISCLOSURE AGREEMENT";

    const intro = `This ${mutual ? "Mutual " : ""}Non-Disclosure Agreement (this "Agreement") is entered into as of ${effectiveLong} (the "Effective Date") by and ${
      parties.length === 2 ? "between" : "among"
    }:\n\n${parties
      .map((p, i) => `(${i + 1}) ${partyBlock(p, i)}`)
      .join(";\n\n")}.\n\nEach of the foregoing is referred to individually as a "Party" and collectively as the "Parties."`;

    const discloser = mutual
      ? "each Party (in such capacity, the \"Discloser\")"
      : "the Disclosing Party";
    const receiver = mutual
      ? "the other Party or Parties (in such capacity, the \"Recipient\")"
      : "the Receiving Party";

    const clauses = [
      `1. PURPOSE. The Parties wish to explore and evaluate a business relationship in connection with ${purpose} (the "Purpose"). In the course of discussions, ${discloser} may disclose to ${receiver} certain non-public information that is confidential or proprietary.`,

      `2. CONFIDENTIAL INFORMATION. "Confidential Information" means any information disclosed by ${discloser} to ${receiver}, whether orally, in writing, or in any other form, that is designated as confidential, or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. Confidential Information includes, without limitation, business plans, financial data, customer lists, pricing, product roadmaps, technical specifications, source code, know-how, and trade secrets.`,

      `3. EXCLUSIONS. Confidential Information does not include information that: (a) is or becomes publicly available through no fault of Recipient; (b) was rightfully known to Recipient without restriction before disclosure; (c) is rightfully obtained from a third party not under a duty of confidentiality; or (d) is independently developed by Recipient without use of or reference to the Confidential Information.`,

      `4. OBLIGATIONS. Recipient shall (a) use Confidential Information solely for the Purpose; (b) protect it using at least the same degree of care it uses to protect its own confidential information of similar nature, but in no event less than a reasonable degree of care; and (c) limit access to Confidential Information to its employees, contractors, and advisors who have a need to know and who are bound by confidentiality obligations at least as protective as those set forth herein.`,

      `5. COMPELLED DISCLOSURE. If Recipient is required by law or by a court or governmental authority to disclose any Confidential Information, Recipient shall, to the extent legally permitted, provide Discloser with prompt written notice and reasonable cooperation so that Discloser may seek a protective order or other appropriate remedy.`,

      `6. TERM. This Agreement shall commence on the Effective Date and continue for a period of ${term} year${term === "1" ? "" : "s"}. The obligations of confidentiality with respect to Confidential Information shall survive for a period of ${term} year${term === "1" ? "" : "s"} from the date of disclosure, except that obligations relating to trade secrets shall continue for as long as such information remains a trade secret under applicable law.`,

      `7. RETURN OR DESTRUCTION. Upon written request, Recipient shall promptly return or destroy all Confidential Information in its possession and, at Discloser's request, certify such return or destruction in writing. Recipient may retain one archival copy for legal compliance purposes, subject to continuing confidentiality obligations.`,

      `8. NO LICENSE. Nothing in this Agreement grants Recipient any license or other right in or to any Confidential Information, patents, copyrights, trademarks, or trade secrets, whether by implication, estoppel, or otherwise.`,

      `9. NO WARRANTY. All Confidential Information is provided "as is." ${mutual ? "Neither Party" : "Disclosing Party"} makes any representation or warranty as to the accuracy or completeness of Confidential Information.`,

      `10. NO OBLIGATION. Nothing in this Agreement obligates any Party to enter into any further agreement or business relationship with any other Party.`,

      `11. INJUNCTIVE RELIEF. The Parties acknowledge that a breach of this Agreement may cause irreparable harm for which monetary damages would be an inadequate remedy, and that the non-breaching Party shall be entitled to seek injunctive relief in addition to any other remedies available at law or in equity.`,

      `12. GOVERNING LAW. ${JURISDICTION_CLAUSES[jurisdiction]}`,

      `13. ENTIRE AGREEMENT. This Agreement constitutes the entire agreement between the Parties concerning its subject matter and supersedes all prior or contemporaneous understandings, whether written or oral. It may be amended only by a writing signed by all Parties.`,

      `14. COUNTERPARTS. This Agreement may be executed in counterparts, including by electronic signature, each of which shall be deemed an original and all of which together shall constitute one instrument.`,
    ];

    const signatures = parties
      .map(
        (p) =>
          `${p.name || "[Party Name]"}\n\nBy: ______________________________\nName: ____________________________\nTitle: ___________________________\nDate: ____________________________`
      )
      .join("\n\n\n");

    return `${title}\n\n${intro}\n\n${clauses.join("\n\n")}\n\nIN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.\n\n\n${signatures}`;
  }, [mutual, parties, effectiveLong, purpose, term, jurisdiction]);

  const copy = () => navigator.clipboard?.writeText(ndaText);

  // ── Visual shell helpers ───────────────────────────────────────────────
  const docTitle = mutual
    ? "MUTUAL NON-DISCLOSURE AGREEMENT"
    : "NON-DISCLOSURE AGREEMENT";

  const SECTIONS: { num: string; title: string; body: string }[] = [
    {
      num: "I",
      title: "Confidential Information",
      body: `"Confidential Information" means any information disclosed by ${
        mutual ? "either Party" : "the Disclosing Party"
      } to ${
        mutual ? "the other" : "the Receiving Party"
      }, whether orally, in writing, or in any other form, that is designated as confidential, or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. It includes, without limitation, business plans, financial data, customer lists, pricing, product roadmaps, technical specifications, source code, know-how, and trade secrets.`,
    },
    {
      num: "II",
      title: `Term — ${term} year${term === "1" ? "" : "s"}`,
      body: `This Agreement shall commence on the Effective Date and continue for a period of ${term} year${
        term === "1" ? "" : "s"
      }. Confidentiality obligations survive for ${term} year${
        term === "1" ? "" : "s"
      } from the date of disclosure; trade secrets remain protected for so long as they qualify as trade secrets under applicable law.`,
    },
    {
      num: "III",
      title: "Obligations of the Recipient",
      body: `Recipient shall (a) use Confidential Information solely for the Purpose; (b) protect it using at least a reasonable degree of care; and (c) limit access to employees, contractors, and advisors who have a need to know and who are bound by confidentiality obligations at least as protective as those set forth herein.`,
    },
    {
      num: "IV",
      title: `Governing Law — ${jurisdiction}`,
      body: JURISDICTION_CLAUSES[jurisdiction],
    },
  ];

  const DEFINITIONS: { term: string; meaning: string }[] = [
    {
      term: "Effective Date",
      meaning: effectiveLong,
    },
    {
      term: "Purpose",
      meaning: purpose,
    },
    {
      term: "Discloser",
      meaning: mutual
        ? "Each Party, when sharing Confidential Information."
        : "The Party identified above as the Disclosing Party.",
    },
    {
      term: "Recipient",
      meaning: mutual
        ? "Each Party, when receiving Confidential Information."
        : "The Party identified above as the Receiving Party.",
    },
  ];

  return (
    <ToolShell
      category="Legal & Compliance"
      title="NDA Generator"
      description="Generate a printable mutual or one-way NDA. Boilerplate that reads like a human wrote it."
    >
      <div data-tool-theme="legal" data-tool="nda-generator">
        {/* Document toolbar — formal masthead control bar */}
        <div className="no-print mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-app bg-app-elevated px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-app bg-tool-accent-soft font-tool-heading text-[0.7rem] font-semibold tracking-wider text-tool-accent">
              NDA
            </div>
            <div className="leading-tight">
              <div className="font-tool-heading text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                Document
              </div>
              <div className="font-tool-heading text-sm font-medium text-app">
                {mutual ? "Mutual NDA · Draft" : "One-way NDA · Draft"}
              </div>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-app bg-app p-1 text-[0.6rem]">
              <button
                onClick={() => setMutual(true)}
                className={`rounded px-2.5 py-1 uppercase tracking-[0.15em] transition ${
                  mutual
                    ? "bg-tool-accent text-app-elevated"
                    : "text-secondary hover:text-app"
                }`}
                style={mutual ? { color: "var(--bg)" } : undefined}
              >
                Mutual
              </button>
              <button
                onClick={() => setMutual(false)}
                className={`rounded px-2.5 py-1 uppercase tracking-[0.15em] transition ${
                  !mutual
                    ? "bg-tool-accent"
                    : "text-secondary hover:text-app"
                }`}
                style={!mutual ? { color: "var(--bg)" } : undefined}
              >
                One-way
              </button>
            </div>
            <button
              onClick={copy}
              className="rounded-md border border-app bg-app px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-secondary hover:text-app"
            >
              Copy text
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-md border border-tool-accent bg-tool-accent px-4 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] transition hover:opacity-90"
              style={{ color: "var(--bg)" }}
            >
              Print / PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
          {/* Left rail — form inputs */}
          <div className="space-y-4">
            <ToolCard title="Document terms" subtitle="Cover & dates">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Effective date">
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className={inputCls()}
                  />
                </Field>
                <Field label="Term (years)">
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    className={inputCls()}
                  />
                </Field>
              </div>

              <div className="mt-3">
                <Field label="Governing jurisdiction">
                  <select
                    value={jurisdiction}
                    onChange={(e) => setJurisdiction(e.target.value)}
                    className={inputCls()}
                  >
                    {JURISDICTIONS.map((j) => (
                      <option key={j}>{j}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="mt-3">
                <Field label="Purpose" hint="Reason for sharing">
                  <input
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    className={inputCls()}
                  />
                </Field>
              </div>
            </ToolCard>

            <ToolCard
              title={`Parties (${parties.length})`}
              subtitle="Disclosing & receiving"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="font-tool-heading text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                  {parties.length === 2 ? "Bilateral" : "Multilateral"}
                </div>
                <button
                  onClick={addParty}
                  disabled={parties.length >= 3}
                  className="rounded border border-tool-accent bg-tool-accent-soft px-2.5 py-1 text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-tool-accent disabled:opacity-40"
                >
                  + Add party
                </button>
              </div>
              <div className="space-y-3">
                {parties.map((p, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-app bg-app p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-tool-heading text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                        Party {i + 1}
                        {parties.length === 2 && (
                          <span className="ml-1 text-muted">
                            · {i === 0 ? "Disclosing" : "Receiving"}
                          </span>
                        )}
                      </span>
                      {parties.length > 2 && (
                        <button
                          onClick={() => removeParty(i)}
                          className="rounded border border-app px-1.5 text-[0.55rem] text-muted hover:text-app"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <input
                      value={p.name}
                      onChange={(e) => updateParty(i, { name: e.target.value })}
                      placeholder="Legal name"
                      className={inputCls("text-xs")}
                    />
                    <input
                      value={p.address}
                      onChange={(e) =>
                        updateParty(i, { address: e.target.value })
                      }
                      placeholder="Principal address"
                      className={inputCls("mt-2 text-xs")}
                    />
                  </div>
                ))}
              </div>
            </ToolCard>
          </div>

          {/* Right — legal-doc preview chrome */}
          <div
            id="nda-print-root"
            className="overflow-hidden rounded-2xl border border-app bg-app-elevated shadow-card"
          >
            {/* Formal masthead */}
            <div className="tool-hero relative border-b border-app px-10 py-12 text-center">
              <div className="font-tool-heading text-[0.55rem] uppercase tracking-[0.32em] text-tool-accent">
                Confidential · Legal Instrument
              </div>
              <h1 className="font-tool-heading mt-4 text-3xl font-semibold leading-tight tracking-[0.08em] text-app sm:text-4xl">
                {docTitle}
              </h1>
              <div className="mx-auto mt-4 h-px w-32 bg-tool-accent-soft" />
              <div className="mt-4 text-xs uppercase tracking-[0.22em] text-secondary">
                Effective {effectiveLong}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <span>{jurisdiction}</span>
                <span>·</span>
                <span>
                  Term: {term} year{term === "1" ? "" : "s"}
                </span>
                <span>·</span>
                <span>
                  {parties.length} {parties.length === 2 ? "Parties" : "Parties"}
                </span>
              </div>
            </div>

            {/* Numbered party blocks */}
            <div className="border-b border-app px-10 py-8">
              <div className="font-tool-heading mb-4 text-[0.55rem] uppercase tracking-[0.25em] text-muted">
                Recital — Parties to this Agreement
              </div>
              <p className="mb-5 text-sm leading-relaxed text-secondary">
                This Agreement is entered into as of the Effective Date by and{" "}
                {parties.length === 2 ? "between" : "among"}:
              </p>
              <ol className="space-y-3">
                {parties.map((p, i) => {
                  const role =
                    parties.length === 2
                      ? i === 0
                        ? "Disclosing Party"
                        : "Receiving Party"
                      : `Party ${i + 1}`;
                  return (
                    <li
                      key={i}
                      className="grid grid-cols-[auto_1fr] gap-4 rounded-lg border border-app bg-app p-4"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-md border border-app bg-tool-accent-soft font-tool-heading text-sm font-semibold text-tool-accent">
                        {i + 1}
                      </div>
                      <div>
                        <div className="font-tool-heading text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                          {role}
                        </div>
                        <div className="mt-1 text-base font-medium text-app">
                          {p.name || `[Party ${i + 1} Name]`}
                        </div>
                        <div className="mt-0.5 text-xs leading-relaxed text-secondary">
                          having its principal place of business at{" "}
                          {p.address || "[address]"}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Definitions list */}
            <div className="border-b border-app px-10 py-8">
              <div className="mb-4 flex items-baseline gap-3">
                <span className="font-tool-heading text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  §
                </span>
                <h2 className="font-tool-heading text-lg font-semibold tracking-tight text-app">
                  Definitions
                </h2>
                <span className="ml-2 h-px flex-1 bg-tool-accent-soft" />
              </div>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-[180px_1fr]">
                {DEFINITIONS.map((d) => (
                  <div key={d.term} className="contents">
                    <dt className="font-tool-heading text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                      {d.term}
                    </dt>
                    <dd className="text-sm leading-relaxed text-secondary">
                      {d.meaning}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Sectioned body */}
            <div className="space-y-2 px-10 py-10">
              {SECTIONS.map((s) => (
                <section key={s.num} className="mb-6">
                  <div className="mb-3 flex items-baseline gap-3">
                    <span className="font-tool-heading min-w-[2rem] text-[0.7rem] uppercase tracking-[0.22em] text-tool-accent">
                      {s.num}.
                    </span>
                    <h3 className="font-tool-heading text-base font-semibold tracking-tight text-app">
                      {s.title}
                    </h3>
                    <span className="ml-2 h-px flex-1 bg-tool-accent-soft" />
                  </div>
                  <p className="pl-10 text-sm leading-relaxed text-secondary">
                    {s.body}
                  </p>
                </section>
              ))}

              {/* Full text reference (kept as authoritative print body) */}
              <details className="mt-4 rounded-lg border border-app bg-app">
                <summary className="cursor-pointer px-4 py-2 font-tool-heading text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  Full clause text · 14 articles
                </summary>
                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap border-t border-app bg-app-elevated p-5 font-serif text-[0.78rem] leading-relaxed text-secondary">
                  {ndaText}
                </pre>
              </details>

              {/* Signature row */}
              <div className="mt-10 border-t border-app pt-8">
                <div className="font-tool-heading mb-5 text-center text-[0.55rem] uppercase tracking-[0.28em] text-muted">
                  In witness whereof, the Parties have executed this Agreement
                </div>
                <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                  {parties.map((p, i) => {
                    const role =
                      parties.length === 2
                        ? i === 0
                          ? "Disclosing Party"
                          : "Receiving Party"
                        : `Party ${i + 1}`;
                    return (
                      <div key={i}>
                        <div className="font-tool-heading text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                          {role}
                        </div>
                        <div className="mt-1 text-sm font-medium text-app">
                          {p.name || `[Party ${i + 1} Name]`}
                        </div>
                        <div className="mt-6 border-b border-app-strong" />
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                          <span>Signature</span>
                          <span className="text-right">Date</span>
                        </div>
                        <div className="mt-3 space-y-1 text-[0.65rem] uppercase tracking-[0.18em] text-muted">
                          <div>Name: ___________________________</div>
                          <div>Title: ___________________________</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-app px-10 py-4 text-[0.55rem] uppercase tracking-[0.22em] text-muted">
              <span>{docTitle}</span>
              <span>· {effectiveLong} ·</span>
              <span>Confidential</span>
            </div>
          </div>
        </div>
      </div>
    </ToolShell>
  );
}
