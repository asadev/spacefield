"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

interface Step {
  id: string;
  description: string;
  owner: string;
  duration: string;
}

interface SOP {
  title: string;
  overview: string;
  steps: Step[];
  rollback: string;
  success: string;
}

const STORAGE_KEY = "solutions:sop-builder:v1";
const uid = () => Math.random().toString(36).slice(2, 9);

const TEMPLATES: Record<string, () => SOP> = {
  blank: () => ({
    title: "",
    overview: "",
    steps: [{ id: uid(), description: "", owner: "", duration: "" }],
    rollback: "",
    success: "",
  }),
  onboarding: () => ({
    title: "New Hire Onboarding",
    overview:
      "Standard procedure for onboarding a new full-time employee across IT, HR, and the hiring manager.",
    steps: [
      { id: uid(), description: "Send offer letter via HRIS; confirm signed copy returned.", owner: "HR", duration: "1 day" },
      { id: uid(), description: "Provision email, Slack, 1Password, laptop, MFA token.", owner: "IT", duration: "2 days" },
      { id: uid(), description: "Day 1: tour, welcome lunch, team intros, HR forms.", owner: "Manager", duration: "1 day" },
      { id: uid(), description: "Week 1: shadow a teammate; complete compliance training.", owner: "Manager", duration: "5 days" },
      { id: uid(), description: "Day 30 check-in: set first goals, review onboarding, confirm access.", owner: "Manager + HR", duration: "1 hour" },
    ],
    rollback:
      "If hire does not start, IT deprovisions all accounts within 24 hours; HR voids equity grant paperwork.",
    success:
      "New hire is productive on a first project by day 30 with no access blockers and a signed 30-day review.",
  }),
  incident: () => ({
    title: "Production Incident Response",
    overview:
      "Severity 1 or 2 incident handling for customer-facing services.",
    steps: [
      { id: uid(), description: "On-call acknowledges page within 5 min; declares severity in #incidents.", owner: "On-call", duration: "5 min" },
      { id: uid(), description: "Open an incident doc with timestamped log; assign IC, comms, scribe.", owner: "Incident Commander", duration: "10 min" },
      { id: uid(), description: "Mitigate first (rollback, flag off, scale up); fix root cause after.", owner: "Responders", duration: "15–60 min" },
      { id: uid(), description: "Update status page and key customers every 30 min until resolved.", owner: "Comms", duration: "Ongoing" },
      { id: uid(), description: "Declare resolved; schedule blameless post-mortem within 5 business days.", owner: "IC", duration: "1 hour" },
    ],
    rollback:
      "If mitigation worsens impact, revert immediately and page the backup on-call. Escalate to eng leadership for Sev1 longer than 60 min.",
    success:
      "Incident closed with customer impact under SLA, post-mortem scheduled, and action items tracked to completion.",
  }),
  release: () => ({
    title: "Production Release",
    overview:
      "Standard workflow for shipping a release candidate to production with safeguards.",
    steps: [
      { id: uid(), description: "RC frozen in staging for 24 hours; full regression test pass.", owner: "QA", duration: "1 day" },
      { id: uid(), description: "Release notes drafted + approved; customer-facing changes reviewed.", owner: "PM", duration: "2 hours" },
      { id: uid(), description: "Canary deploy to 5% of traffic; watch error rate + latency for 30 min.", owner: "Release Engineer", duration: "30 min" },
      { id: uid(), description: "Ramp to 100%; announce in #releases; mark the tag.", owner: "Release Engineer", duration: "30 min" },
      { id: uid(), description: "Post-release monitoring for 2 hours; close the ticket.", owner: "On-call", duration: "2 hours" },
    ],
    rollback:
      "If canary error rate exceeds baseline by 20%, revert immediately using the previous tag. Hotfix path only after root-cause analysis.",
    success:
      "Release live on 100% of traffic with no customer-impacting regression, release notes published, and ticket closed.",
  }),
  fintechCompliance: () => ({
    title: "Fintech KYC / Customer Onboarding",
    overview:
      "Compliance-first onboarding for a regulated fintech customer. Aligns with FinCEN CDD Final Rule, FATF Recommendation 10, and BSA/AML requirements.",
    steps: [
      { id: uid(), description: "Collect customer identifying info (CIP): name, DOB, address, TIN.", owner: "Onboarding Ops", duration: "30 min" },
      { id: uid(), description: "ID verification via trusted IDV vendor + liveness check.", owner: "Compliance", duration: "1 hour" },
      { id: uid(), description: "Screen against OFAC, UN, EU sanctions + PEP lists; record hit decisions.", owner: "Compliance", duration: "30 min" },
      { id: uid(), description: "Risk-rate the customer (low/med/high); escalate high-risk to MLRO.", owner: "MLRO", duration: "1 hour" },
      { id: uid(), description: "File CTR if cash > $10,000; monitor for SAR-triggering activity.", owner: "Compliance", duration: "As needed" },
      { id: uid(), description: "Annual CDD refresh; event-driven re-review on material change.", owner: "Compliance Ops", duration: "Annual" },
    ],
    rollback:
      "If OFAC/sanctions hit confirmed, freeze onboarding, reject transactions, and file SAR within 30 days of detection.",
    success:
      "Customer onboarded with complete CIP file, clean sanctions result, appropriate risk rating, and a documented audit trail.",
  }),
  saasRelease: () => ({
    title: "SaaS Release — Production Rollout",
    overview:
      "Progressive release with feature flags, canary, and rollback plan. Aligns with Google SRE and DORA release practices.",
    steps: [
      { id: uid(), description: "Merge to main; CI green; tag release candidate.", owner: "Release Engineer", duration: "30 min" },
      { id: uid(), description: "Stage validation 24h: smoke tests, synthetic checks, migration dry-run.", owner: "QA", duration: "1 day" },
      { id: uid(), description: "Feature flag defaults off; canary 1% traffic for 30 min.", owner: "Release Engineer", duration: "30 min" },
      { id: uid(), description: "Canary 10% traffic for 30 min; compare SLO indicators vs baseline.", owner: "SRE", duration: "30 min" },
      { id: uid(), description: "Ramp 50% → 100% if no SLO burn; announce in #releases.", owner: "Release Engineer", duration: "1 hour" },
      { id: uid(), description: "Post-release monitoring 2h; page owners of affected services.", owner: "On-call", duration: "2 hours" },
      { id: uid(), description: "Flip feature flags per launch plan; monitor kill-switch readiness.", owner: "Product Eng", duration: "Launch window" },
    ],
    rollback:
      "Auto-rollback if canary error rate > baseline × 1.2 or SLO burn rate > 2x. Kill-switch the flag before reverting the deploy.",
    success:
      "Release at 100% of traffic, SLO within bounds, release notes published, ticket closed, no P0/P1 open against the change.",
  }),
  ecommerceFulfillment: () => ({
    title: "Ecommerce Order → Ship Fulfillment",
    overview:
      "End-to-end order fulfillment from capture to delivery. Benchmarks align with NRF 2024 ecommerce ops guidance.",
    steps: [
      { id: uid(), description: "Order received; fraud-check via Stripe Radar / Signifyd.", owner: "Payments", duration: "5 min" },
      { id: uid(), description: "Inventory allocate; oversell guard; OMS assigns warehouse.", owner: "OMS", duration: "5 min" },
      { id: uid(), description: "Pick + pack: scan-verify SKU, batch for carrier pickup.", owner: "Warehouse", duration: "30 min" },
      { id: uid(), description: "Carrier label + handoff; send shipping confirmation email.", owner: "Shipping", duration: "15 min" },
      { id: uid(), description: "Transit tracking; ping customer at out-for-delivery + delivered.", owner: "CX Automation", duration: "Transit time" },
      { id: uid(), description: "Post-delivery: review invite 5 days out; RMA window opens.", owner: "CX", duration: "5 days" },
    ],
    rollback:
      "If fraud alert triggers, hold order and notify customer; refund if unrecoverable. If stockout, split shipment or cancel with credit.",
    success:
      "Order ship-on-time within promised SLA, tracking delivered, CSAT > target, return rate within category norm.",
  }),
  clinicIntake: () => ({
    title: "Clinic Patient Intake",
    overview:
      "Standard new-patient intake for an outpatient clinic. HIPAA-compliant; aligns with AMA practice management guidance.",
    steps: [
      { id: uid(), description: "Pre-visit: send intake forms (demographics, history, HIPAA, consent) via patient portal.", owner: "Front desk", duration: "1 day prior" },
      { id: uid(), description: "Day of: verify insurance eligibility + copay; collect photo ID.", owner: "Front desk", duration: "15 min" },
      { id: uid(), description: "Rooming: vitals, chief complaint, med reconciliation, allergies.", owner: "MA / Nurse", duration: "15 min" },
      { id: uid(), description: "Provider visit: exam, assessment, plan documented in EHR.", owner: "Provider", duration: "20–40 min" },
      { id: uid(), description: "Checkout: follow-up scheduling, referrals, patient education handout.", owner: "Front desk", duration: "10 min" },
      { id: uid(), description: "Post-visit: claim submitted within 48h; patient survey in 7 days.", owner: "Billing + Ops", duration: "1 week" },
    ],
    rollback:
      "If insurance denied at eligibility, offer self-pay schedule and reschedule if needed. If urgent issue found during intake, escalate to same-day provider or ER per triage protocol.",
    success:
      "Patient seen within 15 min of appointment, complete chart documented, follow-up scheduled, clean claim submitted, CAHPS survey returned > target.",
  }),
  vendor: () => ({
    title: "Vendor Onboarding",
    overview:
      "Due diligence and paperwork for onboarding a new SaaS or services vendor.",
    steps: [
      { id: uid(), description: "Submit vendor request with use case, category, expected spend, data sensitivity.", owner: "Requester", duration: "1 day" },
      { id: uid(), description: "Security review: SOC 2 / ISO 27001, data flow, subprocessors.", owner: "Security", duration: "3 days" },
      { id: uid(), description: "Legal review: MSA / DPA / SCCs; negotiate terms.", owner: "Legal", duration: "5 days" },
      { id: uid(), description: "Finance approval + SSO/SCIM provisioning; tag in the vendor registry.", owner: "Finance + IT", duration: "2 days" },
    ],
    rollback:
      "If security or legal review blocks, close the request and document findings for future comparable vendors.",
    success:
      "Vendor contracted, SSO/SCIM wired, logged in the registry, and owner assigned for renewal.",
  }),
};

const TEMPLATE_LABELS: Record<string, string> = {
  blank: "Blank",
  onboarding: "HR Onboarding",
  incident: "Incident Response",
  release: "Prod Release",
  vendor: "Vendor Onboarding",
  fintechCompliance: "Fintech KYC",
  saasRelease: "SaaS Release",
  ecommerceFulfillment: "Ecom Fulfillment",
  clinicIntake: "Clinic Intake",
};

type SubTab = "edit" | "preview" | "print";
type SectionKey = "purpose" | "scope" | "procedure" | "references";

export default function SopBuilderPage() {
  const [sop, setSop] = useState<SOP>(TEMPLATES.blank());
  const [hydrated, setHydrated] = useState(false);
  const [hoverInsertIdx, setHoverInsertIdx] = useState<number | null>(null);
  const [tab, setTab] = useState<SubTab>("edit");
  const [openSection, setOpenSection] = useState<SectionKey>("procedure");
  const [version, setVersion] = useState<string>("1.0");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SOP;
        if (parsed && Array.isArray(parsed.steps)) setSop(parsed);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sop));
    } catch {
      /* ignore */
    }
  }, [sop, hydrated]);

  const loadTemplate = (key: string) => {
    const tpl = TEMPLATES[key];
    if (!tpl) return;
    if (sop.title || sop.steps.some((s) => s.description)) {
      if (!confirm("Replace current SOP with template?")) return;
    }
    setSop(tpl());
  };

  const updateStep = (id: string, patch: Partial<Step>) =>
    setSop((prev) => ({
      ...prev,
      steps: prev.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  const addStep = () =>
    setSop((prev) => ({
      ...prev,
      steps: [...prev.steps, { id: uid(), description: "", owner: "", duration: "" }],
    }));
  const insertStepAt = (idx: number) =>
    setSop((prev) => {
      const copy = [...prev.steps];
      copy.splice(idx, 0, { id: uid(), description: "", owner: "", duration: "" });
      return { ...prev, steps: copy };
    });
  const removeStep = (id: string) =>
    setSop((prev) => ({ ...prev, steps: prev.steps.filter((s) => s.id !== id) }));
  const moveStep = (id: string, dir: -1 | 1) =>
    setSop((prev) => {
      const idx = prev.steps.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.steps.length) return prev;
      const copy = [...prev.steps];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return { ...prev, steps: copy };
    });

  const markdown = useMemo(() => buildMarkdown(sop), [sop]);

  // Derive an "owner" chip from the first step that names one, fallback "Unassigned"
  const primaryOwner = useMemo(() => {
    const found = sop.steps.find((s) => s.owner.trim());
    return found ? found.owner.trim() : "Unassigned";
  }, [sop.steps]);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      alert("Markdown copied");
    } catch {
      alert("Copy failed — select text manually from preview");
    }
  };

  const exportMarkdown = () => {
    try {
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug = (sop.title || "sop").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sop";
      a.download = `${slug}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed");
    }
  };

  const dateStr = useMemo(() => {
    try {
      return new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  }, []);

  return (
    <ToolShell
      category="Productivity"
      title="SOP Builder"
      description="Write a standard operating procedure with steps, owners, durations, rollback, and success criteria. Start from a template or blank."
    >
      <div data-tool-theme="productivity" data-tool="sop-builder">
        {/* ============================== HERO ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-2xl border border-app bg-tool-surface px-6 py-5 sm:px-8">
          <div className="absolute inset-0 -z-10 opacity-40 [background-image:radial-gradient(circle_at_85%_-10%,var(--tool-accent-soft),transparent_55%)]" />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-app bg-tool-accent-soft text-tool-accent">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path d="M8 6h11M8 12h11M8 18h11" strokeLinecap="round" />
                  <circle cx="4" cy="6" r="1.5" fill="currentColor" />
                  <circle cx="4" cy="12" r="1.5" fill="currentColor" />
                  <circle cx="4" cy="18" r="1.5" fill="currentColor" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-2 rounded-full bg-tool-accent-soft px-2.5 py-0.5 text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                  SOP Builder
                </div>
                <input
                  type="text"
                  value={sop.title}
                  onChange={(e) => setSop({ ...sop, title: e.target.value })}
                  placeholder="Untitled SOP"
                  className="mt-1.5 w-full bg-transparent text-xl font-semibold tracking-tight text-app placeholder:text-muted focus:outline-none sm:text-2xl"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-tool-accent-soft px-2.5 py-1 text-[0.65rem] font-medium text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]">
                <UserGlyph />
                Owner: {primaryOwner}
              </span>
              <label className="inline-flex items-center gap-1.5 rounded-full bg-tool-accent-soft px-2.5 py-1 text-[0.65rem] font-medium text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]">
                <TagGlyph />
                v
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-10 bg-transparent text-tool-accent focus:outline-none"
                />
              </label>
              <span className="inline-flex items-center rounded-full border border-app bg-app-elevated px-2.5 py-1 text-[0.65rem] text-secondary">
                {dateStr}
              </span>
              <span className="inline-flex items-center rounded-full border border-app bg-app-elevated px-2.5 py-1 text-[0.65rem] text-secondary">
                {sop.steps.length} step{sop.steps.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {/* sub-tabs */}
          <div className="mt-5 flex items-center gap-1 rounded-lg border border-app bg-app-elevated p-1 sm:w-fit">
            {(["edit", "preview", "print"] as SubTab[]).map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={
                    active
                      ? "rounded-md bg-tool-accent px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-white shadow-sm"
                      : "rounded-md px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-secondary transition hover:bg-tool-accent-soft hover:text-tool-accent"
                  }
                >
                  {t}
                </button>
              );
            })}
          </div>
        </section>

        {/* ============================== ACTION BAR ============================== */}
        <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app bg-app-elevated px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">Templates</span>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(TEMPLATES).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => loadTemplate(k)}
                  className="rounded-md border border-app bg-app px-2.5 py-1 text-[0.65rem] font-medium text-secondary transition hover:border-tool-accent hover:bg-tool-accent-soft hover:text-tool-accent"
                >
                  {TEMPLATE_LABELS[k] ?? k}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copyMarkdown}
              className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app px-3 py-1.5 text-[0.7rem] font-medium text-secondary transition hover:border-tool-accent hover:text-tool-accent"
            >
              <CopyGlyph /> Copy MD
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-[0.7rem] font-semibold text-white transition hover:brightness-110"
            >
              <PrintGlyph /> Print
            </button>
            <button
              type="button"
              onClick={exportMarkdown}
              className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-[0.7rem] font-semibold text-white transition hover:brightness-110"
            >
              <ExportGlyph /> Export
            </button>
          </div>
        </section>

        {/* ============================== EDIT VIEW ============================== */}
        {tab === "edit" && (
          <div className="space-y-3">
            <Accordion
              id="purpose"
              title="Purpose"
              hint="Why this SOP exists"
              open={openSection === "purpose"}
              onToggle={() => setOpenSection(openSection === "purpose" ? "procedure" : "purpose")}
            >
              <textarea
                value={sop.overview}
                onChange={(e) => setSop({ ...sop, overview: e.target.value })}
                placeholder="What problem does this procedure solve? Who benefits?"
                rows={3}
                className="w-full resize-none rounded-lg border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-muted focus:border-app-focus focus:outline-none focus:ring-1 ring-tool-accent"
              />
            </Accordion>

            <Accordion
              id="scope"
              title="Scope"
              hint="Who, what, when this applies"
              open={openSection === "scope"}
              onToggle={() => setOpenSection(openSection === "scope" ? "procedure" : "scope")}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                    Owner / role
                  </label>
                  <div className="rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-secondary">
                    {primaryOwner}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                    Version
                  </label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app focus:border-app-focus focus:outline-none focus:ring-1 ring-tool-accent"
                  />
                </div>
              </div>
            </Accordion>

            <Accordion
              id="procedure"
              title="Procedure"
              hint={`${sop.steps.length} step${sop.steps.length === 1 ? "" : "s"}`}
              open={openSection === "procedure"}
              onToggle={() => setOpenSection(openSection === "procedure" ? "purpose" : "procedure")}
            >
              <div className="space-y-2">
                {sop.steps.map((s, idx) => (
                  <div key={s.id}>
                    <div
                      className="group/insert relative h-2"
                      onMouseEnter={() => setHoverInsertIdx(idx)}
                      onMouseLeave={() =>
                        setHoverInsertIdx((cur) => (cur === idx ? null : cur))
                      }
                    >
                      <button
                        type="button"
                        onClick={() => insertStepAt(idx)}
                        aria-label="Insert step"
                        className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-tool-accent bg-app-elevated px-2 py-0.5 text-[0.6rem] font-medium text-tool-accent transition ${
                          hoverInsertIdx === idx
                            ? "opacity-100"
                            : "opacity-0 group-hover/insert:opacity-100"
                        }`}
                      >
                        <span className="text-sm leading-none">+</span> step
                      </button>
                    </div>

                    <StepCard
                      step={s}
                      index={idx}
                      total={sop.steps.length}
                      onChange={(patch) => updateStep(s.id, patch)}
                      onMove={(dir) => moveStep(s.id, dir)}
                      onRemove={() => removeStep(s.id)}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addStep}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-tool-accent bg-tool-accent-soft py-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-tool-accent transition hover:brightness-110"
                >
                  <span className="text-base leading-none">+</span> Add step
                </button>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-secondary">
                    <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                    Rollback
                  </label>
                  <textarea
                    value={sop.rollback}
                    onChange={(e) => setSop({ ...sop, rollback: e.target.value })}
                    placeholder="What to do if something goes wrong."
                    rows={4}
                    className="w-full resize-none rounded-lg border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-muted focus:border-app-focus focus:outline-none focus:ring-1 ring-tool-accent"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-secondary">
                    <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                    Success criteria
                  </label>
                  <textarea
                    value={sop.success}
                    onChange={(e) => setSop({ ...sop, success: e.target.value })}
                    placeholder="How you know it worked."
                    rows={4}
                    className="w-full resize-none rounded-lg border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-muted focus:border-app-focus focus:outline-none focus:ring-1 ring-tool-accent"
                  />
                </div>
              </div>
            </Accordion>

            <Accordion
              id="references"
              title="References"
              hint="Linked docs / related SOPs"
              open={openSection === "references"}
              onToggle={() => setOpenSection(openSection === "references" ? "procedure" : "references")}
            >
              <p className="text-sm text-secondary">
                Reference materials are pulled in automatically when you export. For
                inline links, paste them directly into the relevant procedure step.
              </p>
            </Accordion>
          </div>
        )}

        {/* ============================== PREVIEW VIEW ============================== */}
        {tab === "preview" && (
          <div className="rounded-2xl border border-app bg-app-elevated p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                Live preview
              </span>
              <span className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                Standard Operating Procedure · {dateStr} · v{version}
              </span>
            </div>
            <article className="space-y-5">
              <header>
                <h1 className="text-2xl font-semibold tracking-tight text-app">
                  {sop.title || (
                    <span className="italic text-muted">Untitled SOP</span>
                  )}
                </h1>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-md bg-tool-accent-soft px-2 py-0.5 text-[0.65rem] font-medium text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]">
                    <UserGlyph />
                    {primaryOwner}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-tool-accent-soft px-2 py-0.5 text-[0.65rem] font-medium text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]">
                    <TagGlyph />
                    v{version}
                  </span>
                </div>
              </header>

              {sop.overview && (
                <section>
                  <h2 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-tool-accent">
                    Purpose
                  </h2>
                  <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-secondary">
                    {sop.overview}
                  </p>
                </section>
              )}

              <section>
                <h2 className="mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-tool-accent">
                  Procedure
                </h2>
                <ol className="space-y-3 pl-0">
                  {sop.steps.map((s, i) => (
                    <li key={s.id} className="flex gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tool-accent text-[0.75rem] font-semibold text-white">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <p className="m-0 whitespace-pre-wrap text-[0.95rem] leading-relaxed text-app">
                          {s.description || (
                            <span className="italic text-muted">
                              (empty step)
                            </span>
                          )}
                        </p>
                        {(s.owner || s.duration) && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {s.owner && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-tool-accent-soft px-2 py-0.5 text-[0.65rem] font-medium text-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]">
                                <UserGlyph /> {s.owner}
                              </span>
                            )}
                            {s.duration && (
                              <span className="inline-flex items-center gap-1 rounded-md border border-app bg-app px-2 py-0.5 text-[0.65rem] font-medium text-secondary">
                                <ClockGlyph /> {s.duration}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              {sop.rollback && (
                <section>
                  <h2 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-tool-accent">
                    Rollback plan
                  </h2>
                  <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-secondary">
                    {sop.rollback}
                  </p>
                </section>
              )}
              {sop.success && (
                <section>
                  <h2 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-tool-accent">
                    Success criteria
                  </h2>
                  <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-secondary">
                    {sop.success}
                  </p>
                </section>
              )}
            </article>
          </div>
        )}

        {/* ============================== PRINT VIEW ============================== */}
        {tab === "print" && (
          <div className="rounded-2xl border border-app bg-app-elevated p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                Print preview (markdown source)
              </span>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-[0.7rem] font-semibold text-white transition hover:brightness-110"
              >
                <PrintGlyph /> Print now
              </button>
            </div>
            <pre className="max-h-[600px] overflow-auto rounded-lg border border-app bg-app p-4 text-xs leading-relaxed text-secondary">
              {markdown}
            </pre>
          </div>
        )}
      </div>
    </ToolShell>
  );
}

/* ============================== COMPONENTS ============================== */

function Accordion({
  id,
  title,
  hint,
  open,
  onToggle,
  children,
}: {
  id: SectionKey;
  title: string;
  hint?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`section-${id}`}
      className={`overflow-hidden rounded-xl border transition ${
        open
          ? "border-tool-accent bg-tool-accent-soft"
          : "border-app bg-app-elevated"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-md text-[0.7rem] font-semibold transition ${
              open
                ? "bg-tool-accent text-white"
                : "bg-tool-accent-soft text-tool-accent"
            }`}
          >
            {open ? "−" : "+"}
          </span>
          <span className={`text-sm font-semibold ${open ? "text-tool-accent" : "text-app"}`}>
            {title}
          </span>
          {hint && (
            <span className="text-[0.65rem] uppercase tracking-[0.14em] text-muted">
              {hint}
            </span>
          )}
        </div>
      </button>
      {open && <div className="border-t border-app bg-app-elevated p-4">{children}</div>}
    </section>
  );
}

function StepCard({
  step,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  step: Step;
  index: number;
  total: number;
  onChange: (patch: Partial<Step>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="group/step relative flex gap-3 rounded-xl border border-app bg-app p-3 transition hover:border-tool-accent">
      {/* numbered tool-accent circle */}
      <div className="flex flex-col items-center gap-2 pt-0.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tool-accent text-[0.8rem] font-semibold text-white shadow-sm">
          {index + 1}
        </span>
        <div className="flex flex-col gap-1 opacity-0 transition group-hover/step:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="flex h-5 w-5 items-center justify-center rounded border border-app text-secondary transition hover:border-tool-accent hover:text-tool-accent disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="flex h-5 w-5 items-center justify-center rounded border border-app text-secondary transition hover:border-tool-accent hover:text-tool-accent disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex h-5 w-5 items-center justify-center rounded border border-app text-secondary transition hover:border-tool-accent hover:text-tool-accent"
            aria-label="Remove step"
          >
            ×
          </button>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <textarea
          value={step.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={`Step ${index + 1}: what happens?`}
          rows={2}
          className="w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-app placeholder:text-muted focus:border-app-focus focus:bg-app-elevated focus:outline-none"
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-2">
          <span className="text-[0.58rem] uppercase tracking-[0.12em] text-muted">
            Owner
          </span>
          <input
            type="text"
            value={step.owner}
            onChange={(e) => onChange({ owner: e.target.value })}
            placeholder="Role or person"
            className="w-32 rounded-full bg-tool-accent-soft px-2.5 py-0.5 text-[0.7rem] text-tool-accent placeholder:text-muted focus:outline-none focus:ring-1 ring-tool-accent ring-1 ring-[color:var(--tool-accent-ring)]"
          />
          <span className="text-[0.58rem] uppercase tracking-[0.12em] text-muted">
            Duration
          </span>
          <input
            type="text"
            value={step.duration}
            onChange={(e) => onChange({ duration: e.target.value })}
            placeholder="e.g. 30 min"
            className="w-24 rounded-full border border-app bg-app-elevated px-2.5 py-0.5 text-[0.7rem] text-secondary placeholder:text-muted focus:border-app-focus focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

function UserGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.5-3.5 4.5-5 7-5s5.5 1.5 7 5" strokeLinecap="round" />
    </svg>
  );
}

function ClockGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}

function TagGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
      <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9z" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
}

function CopyGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function PrintGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <path d="M6 9V4h12v5" />
      <rect x="4" y="9" width="16" height="8" rx="1.5" />
      <rect x="7" y="14" width="10" height="6" rx="1" />
    </svg>
  );
}

function ExportGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <path d="M12 4v12" strokeLinecap="round" />
      <path d="m7 9 5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" strokeLinecap="round" />
    </svg>
  );
}

function buildMarkdown(sop: SOP): string {
  const lines: string[] = [];
  lines.push(`# ${sop.title || "Untitled SOP"}`);
  if (sop.overview) lines.push("", "## Overview", "", sop.overview);
  lines.push("", "## Steps", "");
  sop.steps.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.description || "(empty)"}`);
    const meta: string[] = [];
    if (s.owner) meta.push(`Owner: ${s.owner}`);
    if (s.duration) meta.push(`Duration: ${s.duration}`);
    if (meta.length) lines.push(`   - ${meta.join(" · ")}`);
  });
  if (sop.rollback) lines.push("", "## Rollback plan", "", sop.rollback);
  if (sop.success) lines.push("", "## Success criteria", "", sop.success);
  return lines.join("\n");
}
