"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

type Reason = "cause" | "rif" | "mutual" | "voluntary";
type Tone = "formal" | "compassionate" | "direct";

const REASONS: Record<Reason, string> = {
  cause: "Termination for cause",
  rif: "Reduction in force / position elimination",
  mutual: "Mutual separation",
  voluntary: "Voluntary resignation (accepted)",
};

function formatDate(iso: string) {
  if (!iso) return "[date]";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function TerminationLetterPage() {
  const [company, setCompany] = useState("Acme Inc.");
  const [signer, setSigner] = useState("Jamie Rivera, Head of People");
  const [employee, setEmployee] = useState("Alex Thompson");
  const [position, setPosition] = useState("Senior Software Engineer");
  // Initial dates are derived from Date.now() on the client only to avoid
  // SSR/CSR hydration mismatch.
  const [lastDay, setLastDay] = useState("");
  const [reason, setReason] = useState<Reason>("rif");
  const [severanceAmount, setSeveranceAmount] = useState("12,000 USD");
  const [severanceDuration, setSeveranceDuration] = useState("8 weeks of base pay");
  const [benefitsEnd, setBenefitsEnd] = useState("");
  useEffect(() => {
    setLastDay(new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10));
    setBenefitsEnd(new Date(Date.now() + 45 * 24 * 3600 * 1000).toISOString().slice(0, 10));
  }, []);
  const [returnItems, setReturnItems] = useState(
    "company laptop, access badge, corporate credit card, and any printed materials"
  );
  const [tone, setTone] = useState<Tone>("formal");

  const letter = useMemo(() => {
    const today = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const lastDayFmt = formatDate(lastDay);
    const benefitsFmt = formatDate(benefitsEnd);

    const opening = {
      formal: `Dear ${employee},\n\nThis letter confirms the termination of your employment with ${company}, effective ${lastDayFmt}.`,
      compassionate: `Dear ${employee},\n\nIt is with genuine regret that we are writing to confirm the end of your employment with ${company}, effective ${lastDayFmt}. We know this is difficult news.`,
      direct: `${employee},\n\nYour employment with ${company} will end on ${lastDayFmt}.`,
    }[tone];

    const reasonPara = {
      cause: {
        formal: `The decision to terminate your employment is based on documented issues previously communicated to you and follows internal review processes. This constitutes a termination for cause.`,
        compassionate: `After careful consideration of prior conversations, and with the hope this outcome could be avoided, the company has concluded that ending the employment relationship is necessary. This decision is based on matters previously discussed with you.`,
        direct: `The reason is for cause, based on issues already documented and communicated.`,
      },
      rif: {
        formal: `The decision is the result of an organizational restructuring and the elimination of your position. It is not related to your individual performance or conduct.`,
        compassionate: `This decision is the result of a difficult restructuring and the elimination of your role. It is not a reflection of your work, your effort, or your character — all of which we have genuinely valued.`,
        direct: `Reason: position elimination as part of a reduction in force. This is not about your performance.`,
      },
      mutual: {
        formal: `This separation is mutual and reflects an agreement between you and the company regarding the end of the employment relationship.`,
        compassionate: `We have agreed together that this is the right moment for you and for the company to part ways, and we appreciate the openness of our conversations in reaching this decision.`,
        direct: `This is a mutual separation. Both sides have agreed.`,
      },
      voluntary: {
        formal: `This letter acknowledges and formalizes your voluntary resignation from your position.`,
        compassionate: `We acknowledge your voluntary decision to move on and we respect the thought that went into it. Thank you for the professionalism you have shown throughout the transition.`,
        direct: `This confirms acceptance of your voluntary resignation.`,
      },
    }[reason][tone];

    const severance =
      severanceAmount || severanceDuration
        ? {
            formal: `As part of your separation, the company will provide severance in the amount of ${severanceAmount || "[amount]"}${severanceDuration ? `, equivalent to ${severanceDuration}` : ""}. Payment will be made in accordance with ${company}'s standard payroll practices and is conditional on your execution of the accompanying separation agreement.`,
            compassionate: `To help support you through this transition, we are offering severance of ${severanceAmount || "[amount]"}${severanceDuration ? ` (${severanceDuration})` : ""}, payable under our normal payroll process once the separation agreement is signed.`,
            direct: `Severance: ${severanceAmount || "[amount]"}${severanceDuration ? ` — ${severanceDuration}` : ""}. Paid via standard payroll once the separation agreement is signed.`,
          }[tone]
        : "";

    const benefits = {
      formal: `Your participation in the company's benefits plans will continue through ${benefitsFmt}. You will receive separate information regarding COBRA or other applicable continuation coverage.`,
      compassionate: `Your health and other benefits will remain active through ${benefitsFmt}, and you will receive information about continuation options so you are not left without coverage.`,
      direct: `Benefits end ${benefitsFmt}. COBRA / continuation details will follow separately.`,
    }[tone];

    const propertyClause = {
      formal: `Please return all company property on or before your last day of employment, including ${returnItems}.`,
      compassionate: `Please plan to return your company property on or before your last day, including ${returnItems}. Let us know if you need help coordinating the return.`,
      direct: `Return all company property by your last day: ${returnItems}.`,
    }[tone];

    const closing = {
      formal: `If you have questions, please contact the undersigned. We wish you success in your next endeavors.\n\nSincerely,\n\n${signer}\n${company}`,
      compassionate: `If you need anything — a reference, clarification, or help during the transition — please reach out. We are rooting for you.\n\nWith regards,\n\n${signer}\n${company}`,
      direct: `Questions: contact me directly.\n\n${signer}\n${company}`,
    }[tone];

    return `${today}\n\n${opening}\n\n${reasonPara}\n\n${severance}${severance ? "\n\n" : ""}${benefits}\n\n${propertyClause}\n\n${closing}`;
  }, [
    employee,
    company,
    lastDay,
    benefitsEnd,
    reason,
    tone,
    severanceAmount,
    severanceDuration,
    returnItems,
    signer,
  ]);

  const copy = () => navigator.clipboard?.writeText(letter);

  // ----- Letter sections derived for structured preview -----
  const todayFmt = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    []
  );
  const lastDayDisplay = formatDate(lastDay);
  const benefitsDisplay = formatDate(benefitsEnd);

  const reasonBody = useMemo(() => {
    return {
      cause: {
        formal: `The decision to terminate your employment is based on documented issues previously communicated to you and follows internal review processes. This constitutes a termination for cause.`,
        compassionate: `After careful consideration of prior conversations, and with the hope this outcome could be avoided, the company has concluded that ending the employment relationship is necessary. This decision is based on matters previously discussed with you.`,
        direct: `The reason is for cause, based on issues already documented and communicated.`,
      },
      rif: {
        formal: `The decision is the result of an organizational restructuring and the elimination of your position. It is not related to your individual performance or conduct.`,
        compassionate: `This decision is the result of a difficult restructuring and the elimination of your role. It is not a reflection of your work, your effort, or your character — all of which we have genuinely valued.`,
        direct: `Reason: position elimination as part of a reduction in force. This is not about your performance.`,
      },
      mutual: {
        formal: `This separation is mutual and reflects an agreement between you and the company regarding the end of the employment relationship.`,
        compassionate: `We have agreed together that this is the right moment for you and for the company to part ways, and we appreciate the openness of our conversations in reaching this decision.`,
        direct: `This is a mutual separation. Both sides have agreed.`,
      },
      voluntary: {
        formal: `This letter acknowledges and formalizes your voluntary resignation from your position.`,
        compassionate: `We acknowledge your voluntary decision to move on and we respect the thought that went into it. Thank you for the professionalism you have shown throughout the transition.`,
        direct: `This confirms acceptance of your voluntary resignation.`,
      },
    }[reason][tone];
  }, [reason, tone]);

  const severanceBody = useMemo(() => {
    if (!severanceAmount && !severanceDuration) return "";
    return {
      formal: `As part of your separation, the company will provide severance in the amount of ${severanceAmount || "[amount]"}${severanceDuration ? `, equivalent to ${severanceDuration}` : ""}. Payment will be made in accordance with ${company}'s standard payroll practices and is conditional on your execution of the accompanying separation agreement.`,
      compassionate: `To help support you through this transition, we are offering severance of ${severanceAmount || "[amount]"}${severanceDuration ? ` (${severanceDuration})` : ""}, payable under our normal payroll process once the separation agreement is signed.`,
      direct: `Severance: ${severanceAmount || "[amount]"}${severanceDuration ? ` — ${severanceDuration}` : ""}. Paid via standard payroll once the separation agreement is signed.`,
    }[tone];
  }, [severanceAmount, severanceDuration, tone, company]);

  const benefitsBody = useMemo(() => {
    return {
      formal: `Your participation in the company's benefits plans will continue through ${benefitsDisplay}. You will receive separate information regarding COBRA or other applicable continuation coverage.`,
      compassionate: `Your health and other benefits will remain active through ${benefitsDisplay}, and you will receive information about continuation options so you are not left without coverage.`,
      direct: `Benefits end ${benefitsDisplay}. COBRA / continuation details will follow separately.`,
    }[tone];
  }, [tone, benefitsDisplay]);

  const propertyBody = useMemo(() => {
    return {
      formal: `Please return all company property on or before your last day of employment, including ${returnItems}.`,
      compassionate: `Please plan to return your company property on or before your last day, including ${returnItems}. Let us know if you need help coordinating the return.`,
      direct: `Return all company property by your last day: ${returnItems}.`,
    }[tone];
  }, [tone, returnItems]);

  const salutation =
    tone === "direct" ? `${employee},` : `Dear ${employee},`;
  const signOff =
    tone === "formal"
      ? "Sincerely,"
      : tone === "compassionate"
      ? "With regards,"
      : "—";

  // Company initials for letterhead monogram
  const monogram = useMemo(() => {
    return company
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "·";
  }, [company]);

  // Reference number derived from company / employee for letter file ref
  const refNumber = useMemo(() => {
    const seed = (company + employee).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return `HR-${String(seed % 9000 + 1000).padStart(4, "0")}-${reason.toUpperCase().slice(0, 3)}`;
  }, [company, employee, reason]);

  return (
    <ToolShell
      category="Legal & Compliance"
      title="Termination Letter Generator"
      description="Write a clean employment termination letter. Pick a tone — formal, compassionate, or direct — and the template adjusts."
    >
      <div data-tool-theme="hr" data-tool="termination-letter-generator" className="space-y-5">
        {/* Window shell */}
        <div className="overflow-hidden rounded-2xl border border-tool-accent-soft bg-tool-surface backdrop-blur-xl">
          {/* Title bar */}
          <div className="flex items-center gap-3 border-b border-tool-accent-soft bg-tool-accent-soft px-4 py-2.5">
            <div className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-rose-400/80 ring-1 ring-rose-500/30" />
              <span className="h-3 w-3 rounded-full bg-amber-400/80 ring-1 ring-amber-500/30" />
              <span className="h-3 w-3 rounded-full bg-emerald-400/80 ring-1 ring-emerald-500/30" />
            </div>
            <div className="flex-1 text-center text-[0.7rem] font-medium tracking-wide text-secondary">
              Termination Letter — Separation Notice Builder
            </div>
            <div className="text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent">
              {refNumber}
            </div>
          </div>

          {/* Hero header */}
          <div className="tool-hero border-b border-tool-accent-soft px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent">
                  {REASONS[reason]} · {tone}
                </div>
                <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-app">
                  Confidential separation notice
                </h2>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Chip glyph="◼">{employee}</Chip>
                <Chip glyph="◇">{position}</Chip>
                <Chip glyph="◷">eff. {lastDayDisplay}</Chip>
              </div>
            </div>
          </div>
        </div>

        {/* Two-column workspace: form + letter preview */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* Form panel */}
          <div className="overflow-hidden rounded-2xl border border-tool-accent-soft bg-tool-surface backdrop-blur">
            <div className="flex items-center justify-between border-b border-tool-accent-soft bg-tool-accent-soft px-5 py-3">
              <div>
                <div className="text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent">
                  Letter details
                </div>
                <h3 className="text-sm font-semibold text-app">
                  Edit the variables
                </h3>
              </div>
              <div className="font-mono text-[0.65rem] tabular-nums text-muted">
                {tone}
              </div>
            </div>

            <div className="space-y-4 px-5 py-4">
              <FieldGroup label="Employee">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <QueryField label="Name">
                    <input
                      value={employee}
                      onChange={(e) => setEmployee(e.target.value)}
                      className={fieldCls}
                    />
                  </QueryField>
                  <QueryField label="Position">
                    <input
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      className={fieldCls}
                    />
                  </QueryField>
                </div>
              </FieldGroup>

              <FieldGroup label="Separation timeline">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <QueryField label="Last day">
                    <input
                      type="date"
                      value={lastDay}
                      onChange={(e) => setLastDay(e.target.value)}
                      className={fieldCls}
                    />
                  </QueryField>
                  <QueryField label="Benefits end">
                    <input
                      type="date"
                      value={benefitsEnd}
                      onChange={(e) => setBenefitsEnd(e.target.value)}
                      className={fieldCls}
                    />
                  </QueryField>
                </div>
              </FieldGroup>

              <FieldGroup label="Decision">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <QueryField label="Reason">
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value as Reason)}
                      className={fieldCls}
                    >
                      {(Object.keys(REASONS) as Reason[]).map((r) => (
                        <option key={r} value={r}>
                          {REASONS[r]}
                        </option>
                      ))}
                    </select>
                  </QueryField>
                  <QueryField label="Tone">
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value as Tone)}
                      className={fieldCls}
                    >
                      <option value="formal">Formal</option>
                      <option value="compassionate">Compassionate</option>
                      <option value="direct">Direct</option>
                    </select>
                  </QueryField>
                </div>
              </FieldGroup>

              <FieldGroup label="Final pay & severance">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <QueryField label="Severance amount">
                    <input
                      value={severanceAmount}
                      onChange={(e) => setSeveranceAmount(e.target.value)}
                      className={fieldCls}
                    />
                  </QueryField>
                  <QueryField label="Severance duration">
                    <input
                      value={severanceDuration}
                      onChange={(e) => setSeveranceDuration(e.target.value)}
                      className={fieldCls}
                    />
                  </QueryField>
                </div>
              </FieldGroup>

              <FieldGroup label="Return of property">
                <QueryField label="Items to return">
                  <input
                    value={returnItems}
                    onChange={(e) => setReturnItems(e.target.value)}
                    className={fieldCls}
                  />
                </QueryField>
              </FieldGroup>

              <FieldGroup label="Letterhead">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <QueryField label="Company">
                    <input
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className={fieldCls}
                    />
                  </QueryField>
                  <QueryField label="Signer">
                    <input
                      value={signer}
                      onChange={(e) => setSigner(e.target.value)}
                      className={fieldCls}
                    />
                  </QueryField>
                </div>
              </FieldGroup>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={copy}
                  className="inline-flex items-center gap-2 rounded-lg border border-tool-accent-soft bg-surface px-3.5 py-2 text-xs font-medium text-app transition hover:bg-tool-accent-soft"
                >
                  <span className="text-tool-accent">⎘</span> Copy text
                </button>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 rounded-lg bg-tool-accent px-3.5 py-2 text-xs font-medium text-white transition hover:brightness-110"
                >
                  <span>↓</span> Print / PDF
                </button>
              </div>

              <div className="rounded-xl border border-tool-accent-soft bg-tool-accent-soft p-3 text-[0.7rem] leading-relaxed text-secondary">
                <span className="font-semibold text-tool-accent">Note · </span>
                Template only — jurisdiction-specific rules (notice periods, final pay timing, WARN Act) still apply. Have employment counsel review before sending.
              </div>
            </div>
          </div>

          {/* Letter preview — formal letterhead on white paper */}
          <div
            id="term-print-root"
            className="overflow-hidden rounded-2xl border border-tool-accent-soft bg-white text-zinc-900 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.25)]"
          >
            {/* Letterhead */}
            <div className="border-b-2 border-tool-accent bg-gradient-to-br from-[var(--tool-accent-soft)] to-white px-10 pt-9 pb-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-tool-accent text-lg font-bold tracking-tight text-white shadow-md">
                    {monogram}
                  </div>
                  <div>
                    <div className="font-serif text-2xl font-semibold leading-tight text-zinc-900">
                      {company}
                    </div>
                    <div className="mt-0.5 text-[0.65rem] uppercase tracking-[0.25em] text-tool-accent">
                      Office of the People Team
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[0.6rem] uppercase tracking-[0.2em] text-zinc-500">
                    Reference
                  </div>
                  <div className="font-mono text-[0.7rem] tabular-nums text-zinc-700">
                    {refNumber}
                  </div>
                </div>
              </div>
              <div className="mt-5 flex items-end justify-between text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                <span>Confidential — for addressee only</span>
                <span className="font-mono normal-case tracking-normal text-zinc-700">
                  {todayFmt}
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="px-10 py-8 font-serif text-[0.95rem] leading-7 text-zinc-800">
              {/* Addressee block */}
              <div className="mb-6">
                <div className="font-semibold text-zinc-900">{employee}</div>
                <div className="text-zinc-600">{position}</div>
                <div className="text-zinc-600">{company}</div>
              </div>

              {/* Subject line */}
              <div className="mb-6 border-l-2 border-tool-accent pl-3">
                <div className="text-[0.65rem] uppercase tracking-[0.2em] text-tool-accent">
                  Subject
                </div>
                <div className="font-semibold text-zinc-900">
                  Notice of Separation — effective {lastDayDisplay}
                </div>
              </div>

              {/* Salutation */}
              <p className="mb-5">{salutation}</p>

              {/* Opening */}
              <p className="mb-5">
                {tone === "compassionate"
                  ? `It is with genuine regret that we are writing to confirm the end of your employment with ${company}, effective ${lastDayDisplay}. We know this is difficult news.`
                  : tone === "direct"
                  ? `Your employment with ${company} will end on ${lastDayDisplay}.`
                  : `This letter confirms the termination of your employment with ${company}, effective ${lastDayDisplay}.`}
              </p>

              {/* Sections grid — labelled clauses */}
              <div className="my-6 space-y-5 rounded-lg border border-tool-accent-soft bg-[var(--tool-accent-soft)] p-5">
                <Clause label="Reason for separation">{reasonBody}</Clause>
                <Clause label="Effective date">
                  Last day of employment: <span className="font-semibold">{lastDayDisplay}</span>.
                </Clause>
                {severanceBody && (
                  <Clause label="Final pay & severance">{severanceBody}</Clause>
                )}
                <Clause label="Benefits & continuation">{benefitsBody}</Clause>
                <Clause label="Return of company property">{propertyBody}</Clause>
              </div>

              {/* Closing paragraph */}
              <p className="mb-8">
                {tone === "compassionate"
                  ? "If you need anything — a reference, clarification, or help during the transition — please reach out. We are rooting for you."
                  : tone === "direct"
                  ? "Questions: contact me directly."
                  : "If you have questions, please contact the undersigned. We wish you success in your next endeavors."}
              </p>

              {/* Sign-off */}
              <p className="mb-10">{signOff}</p>

              {/* Signature block — HR + employee acknowledgement */}
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                <SignatureLine label="On behalf of the company" name={signer} subtitle={company} />
                <SignatureLine
                  label="Employee acknowledgement"
                  name={employee}
                  subtitle="Signature confirms receipt only"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-tool-accent-soft bg-[var(--tool-accent-soft)] px-10 py-3 text-center text-[0.6rem] uppercase tracking-[0.2em] text-zinc-500">
              {company} · {refNumber} · Page 1 of 1
            </div>
          </div>
        </div>

        {/* Hidden raw text for clipboard parity (kept off-screen) */}
        <pre className="sr-only">{letter}</pre>

        <style jsx global>{`
          @media print {
            body * { visibility: hidden !important; }
            #term-print-root, #term-print-root * { visibility: visible !important; }
            #term-print-root {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              padding: 56px !important;
              background: white !important;
              color: black !important;
              font-family: Georgia, 'Times New Roman', serif !important;
            }
            #term-print-root * { color: black !important; background: white !important; border-color: #ccc !important; box-shadow: none !important; }
          }
        `}</style>
      </div>
    </ToolShell>
  );
}

/* ---------- Sub-components ---------- */

const fieldCls =
  "w-full rounded-lg border border-tool-accent-soft bg-surface px-3 py-2 text-sm text-app shadow-sm outline-none transition focus:border-tool-accent focus:ring-2 focus:ring-tool-accent";

function QueryField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="h-px flex-1 bg-tool-accent-soft opacity-60" />
        <span className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-tool-accent">
          {label}
        </span>
        <span className="h-px flex-1 bg-tool-accent-soft opacity-60" />
      </div>
      {children}
    </div>
  );
}

function Chip({ children, glyph }: { children: React.ReactNode; glyph?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-tool-accent-soft bg-surface px-2.5 py-1 text-[0.7rem] font-medium text-app backdrop-blur">
      {glyph && <span className="text-tool-accent">{glyph}</span>}
      {children}
    </span>
  );
}

function Clause({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-tool-accent">
        {label}
      </div>
      <div className="text-[0.9rem] leading-6 text-zinc-800">{children}</div>
    </div>
  );
}

function SignatureLine({
  label,
  name,
  subtitle,
}: {
  label: string;
  name: string;
  subtitle: string;
}) {
  return (
    <div>
      <div className="mb-1 text-[0.6rem] uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </div>
      <div className="h-10 border-b border-zinc-400" />
      <div className="mt-1 text-sm font-semibold text-zinc-900">{name}</div>
      <div className="text-[0.7rem] text-zinc-500">{subtitle}</div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="h-6 border-b border-zinc-300" />
          <div className="mt-1 text-[0.6rem] uppercase tracking-[0.18em] text-zinc-500">
            Signature
          </div>
        </div>
        <div>
          <div className="h-6 border-b border-zinc-300" />
          <div className="mt-1 text-[0.6rem] uppercase tracking-[0.18em] text-zinc-500">
            Date
          </div>
        </div>
      </div>
    </div>
  );
}
