"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Answers {
  role: string;
  teamSize: string;
  leadHandling: string[];
  responseTime: string;
  tools: string[];
  bottleneck: string;
  budget: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  whatsappPreferred: boolean;
}

const defaultAnswers: Answers = {
  role: "",
  teamSize: "",
  leadHandling: [],
  responseTime: "",
  tools: [],
  bottleneck: "",
  budget: "",
  name: "",
  company: "",
  email: "",
  phone: "",
  whatsappPreferred: false,
};

/* ------------------------------------------------------------------ */
/*  Step definitions                                                   */
/* ------------------------------------------------------------------ */

const TOTAL_STEPS = 8;

const roleOptions = [
  {
    icon: (
      <svg className="w-5 h-5 text-gray-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="7" width="14" height="11" rx="1" />
        <rect x="7" y="3" width="6" height="4" rx="0.5" />
        <line x1="7" y1="11" x2="7" y2="18" />
        <line x1="13" y1="11" x2="13" y2="18" />
        <line x1="3" y1="11" x2="17" y2="11" />
      </svg>
    ),
    label: "Brokerage Owner / CEO",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-gray-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 14 7 8 11 12 17 4" />
        <line x1="3" y1="17" x2="3" y2="4" />
        <line x1="3" y1="17" x2="17" y2="17" />
      </svg>
    ),
    label: "Operations Manager",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-gray-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="16" height="11" rx="1.5" />
        <path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3h3A1.5 1.5 0 0 1 13 4.5V6" />
      </svg>
    ),
    label: "Sales / Team Lead",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-gray-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="10" r="3" />
        <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" />
      </svg>
    ),
    label: "Marketing / Tech Manager",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-gray-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 18V8l3-5h2l-1 5h3l1-5h2l-1 5" />
        <line x1="13" y1="8" x2="13" y2="18" />
        <line x1="4" y1="8" x2="17" y2="8" />
        <line x1="2" y1="18" x2="18" y2="18" />
      </svg>
    ),
    label: "Developer Sales Team",
  },
];

const teamSizeOptions = ["1-5 agents", "6-15 agents", "16-30 agents", "30+ agents"];

const leadHandlingOptions = [
  "Manual assignment from portals (Bayut, PF)",
  "WhatsApp groups",
  "CRM auto-routing",
  "Excel / Google Sheets",
  "respond.io or similar",
  "We don't have a system",
];

const responseTimeOptions = [
  "Under 5 minutes",
  "5-30 minutes",
  "30 min - 2 hours",
  "2+ hours",
  "We don't track this",
];

const toolOptions = [
  "WhatsApp Business",
  "Bayut/PF CRM",
  "Google Sheets",
  "Make.com/Zapier",
  "respond.io",
  "HubSpot/Salesforce",
  "PandaDoc",
  "Custom CRM",
  "None of these",
];

const bottleneckOptions = [
  "Lead response time",
  "Manual data entry / copy-paste",
  "Inventory management across sources",
  "Broadcasting to groups",
  "Generating sales offers / documents",
  "Reporting and analytics",
  "Everything feels manual",
];

const budgetOptions = [
  "Under AED 500",
  "AED 500 - 1,500",
  "AED 1,500 - 5,000",
  "AED 5,000+",
  "Not sure yet",
];

/* ------------------------------------------------------------------ */
/*  Score Calculation                                                   */
/* ------------------------------------------------------------------ */

function calculateScore(a: Answers): number {
  let score = 0;

  // Lead handling (0-25)
  const leadScore: Record<string, number> = {
    "CRM auto-routing": 25,
    "respond.io or similar": 20,
    "WhatsApp groups": 10,
    "Excel / Google Sheets": 8,
    "Manual assignment from portals (Bayut, PF)": 5,
    "We don't have a system": 0,
  };
  if (a.leadHandling.length > 0) {
    const best = Math.max(...a.leadHandling.map((h) => leadScore[h] ?? 5));
    score += best;
  }

  // Response time (0-25)
  const rtScore: Record<string, number> = {
    "Under 5 minutes": 25,
    "5-30 minutes": 18,
    "30 min - 2 hours": 10,
    "2+ hours": 4,
    "We don't track this": 2,
  };
  score += rtScore[a.responseTime] ?? 0;

  // Tools (0-30)
  const modernTools = ["Make.com/Zapier", "respond.io", "HubSpot/Salesforce", "PandaDoc", "Custom CRM"];
  const basicTools = ["WhatsApp Business", "Bayut/PF CRM", "Google Sheets"];
  let toolScore = 0;
  a.tools.forEach((t) => {
    if (modernTools.includes(t)) toolScore += 6;
    else if (basicTools.includes(t)) toolScore += 3;
  });
  score += Math.min(toolScore, 30);

  // Bottleneck penalty (0-20, inverted)
  const bnScore: Record<string, number> = {
    "Everything feels manual": 0,
    "Lead response time": 8,
    "Manual data entry / copy-paste": 6,
    "Inventory management across sources": 10,
    "Broadcasting to groups": 12,
    "Generating sales offers / documents": 14,
    "Reporting and analytics": 16,
  };
  score += bnScore[a.bottleneck] ?? 10;

  return Math.min(Math.max(Math.round(score), 0), 100);
}

function getScoreLabel(score: number): { label: string; color: string } {
  if (score <= 25) return { label: "Critical — Your competitors are already automating", color: "#ef4444" };
  if (score <= 50) return { label: "Getting Started — Big gains available", color: "#f59e0b" };
  if (score <= 75) return { label: "Progressing — Room to optimize", color: "#3b82f6" };
  return { label: "Advanced — Let's fine-tune", color: "#22c55e" };
}

function getRecommendations(a: Answers): { title: string; desc: string }[] {
  const recs: { title: string; desc: string }[] = [];

  if (["30 min - 2 hours", "2+ hours", "We don't track this"].includes(a.responseTime)) {
    recs.push({ title: "AI Lead Response", desc: "Auto-reply and match leads to the right agent within 90 seconds of inquiry." });
  }
  if (a.leadHandling.includes("Excel / Google Sheets") || a.leadHandling.includes("Manual assignment from portals (Bayut, PF)")) {
    recs.push({ title: "Unified Dashboard", desc: "Connect all inventory sources and lead portals in real-time — no more spreadsheet juggling." });
  }
  if (a.bottleneck === "Broadcasting to groups" || a.leadHandling.includes("WhatsApp groups")) {
    recs.push({ title: "Smart Broadcasting", desc: "One-click broadcast to all channels with AI-powered formatting and scheduling." });
  }
  if (!a.tools.includes("HubSpot/Salesforce") && !a.tools.includes("Custom CRM") && !a.tools.includes("Bayut/PF CRM")) {
    recs.push({ title: "CRM Integration", desc: "Route leads automatically to the right agent based on language, area, and availability." });
  }
  if (a.bottleneck === "Generating sales offers / documents" || !a.tools.includes("PandaDoc")) {
    recs.push({ title: "Document Automation", desc: "Generate professional branded offers and proposals instantly from your inventory data." });
  }
  if (a.bottleneck === "Manual data entry / copy-paste") {
    recs.push({ title: "Data Sync Automation", desc: "Eliminate copy-paste with automated data flows between your portals, CRM, and sheets." });
  }
  if (a.bottleneck === "Reporting and analytics") {
    recs.push({ title: "Live Analytics Dashboard", desc: "Real-time performance tracking across all agents, campaigns, and lead sources." });
  }
  if (a.bottleneck === "Everything feels manual") {
    recs.push({ title: "Full Automation Audit", desc: "Map every manual process and build an automation roadmap — biggest ROI first." });
  }

  return recs.slice(0, 4);
}

/* ------------------------------------------------------------------ */
/*  Animated Score Circle                                              */
/* ------------------------------------------------------------------ */

function ScoreCircle({ score, color }: { score: number; color: string }) {
  const [displayScore, setDisplayScore] = useState(0);
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const progress = (displayScore / 100) * circumference;

  useEffect(() => {
    let frame: number;
    const duration = 1500;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayScore(Math.round(eased * score));
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  return (
    <div className="relative mx-auto h-48 w-48">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="color-mix(in srgb, var(--text) 8%, transparent)" strokeWidth="8" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          style={{ transition: "stroke-dashoffset 0.05s linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold text-white">{displayScore}</span>
        <span className="text-xs text-gray-400">/ 100</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function OptionCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border px-5 py-4 text-left text-sm transition-all duration-200 ${
        selected
          ? "border-white/30 bg-white/[0.10] text-white"
          : "border-white/[0.10] bg-white/[0.05] text-gray-300 hover:border-white/[0.16] hover:bg-white/[0.07]"
      }`}
    >
      {children}
    </button>
  );
}

function MultiOptionCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left text-sm transition-all duration-200 ${
        selected
          ? "border-white/30 bg-white/[0.10] text-white"
          : "border-white/[0.10] bg-white/[0.05] text-gray-300 hover:border-white/[0.16] hover:bg-white/[0.07]"
      }`}
    >
      <span className="flex items-center gap-2">
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] transition-colors ${
            selected ? "border-white/40 bg-white/20 text-white" : "border-white/20"
          }`}
        >
          {selected && "✓"}
        </span>
        {children}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function AuditForm() {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [answers, setAnswers] = useState<Answers>(defaultAnswers);
  const [showResults, setShowResults] = useState(false);
  const [ctaClicked, setCtaClicked] = useState(false);

  const canProceed = (): boolean => {
    switch (step) {
      case 1: return answers.role !== "";
      case 2: return answers.teamSize !== "";
      case 3: return answers.leadHandling.length > 0;
      case 4: return answers.responseTime !== "";
      case 5: return answers.tools.length > 0;
      case 6: return answers.bottleneck !== "";
      case 7: return answers.budget !== "";
      case 8: return answers.name !== "" && answers.company !== "" && answers.email !== "";
      default: return false;
    }
  };

  const next = () => {
    if (!canProceed()) return;
    if (step === TOTAL_STEPS) {
      setShowResults(true);
      return;
    }
    setDirection(1);
    setStep((s) => s + 1);
  };

  const back = () => {
    if (step === 1) return;
    setDirection(-1);
    setStep((s) => s - 1);
  };

  const toggleMulti = (key: "leadHandling" | "tools", value: string) => {
    setAnswers((prev) => {
      const arr = prev[key];
      return { ...prev, [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  };

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -80 : 80, opacity: 0 }),
  };

  /* ---------- Results ---------- */

  if (showResults) {
    const score = calculateScore(answers);
    const { label, color } = getScoreLabel(score);
    const recs = getRecommendations(answers);

    return (
      <section id="audit" className="relative py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            {/* Score */}
            <div className="mb-4 text-center">
              <p className="mb-1 text-xs font-medium uppercase tracking-widest text-gray-500">Your Automation Score</p>
              <ScoreCircle score={score} color={color} />
              <p className="mt-4 text-sm font-medium" style={{ color }}>
                {label}
              </p>
            </div>

            {/* Recommendations */}
            <div className="mt-12">
              <h3 className="mb-6 text-center text-lg font-semibold text-white">Personalized Recommendations</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {recs.map((r, i) => (
                  <motion.div
                    key={r.title}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.12, duration: 0.5 }}
                    className="rounded-xl border border-white/[0.10] bg-white/[0.05] p-5"
                  >
                    <h4 className="mb-1 text-sm font-semibold text-white">{r.title}</h4>
                    <p className="text-xs leading-relaxed text-gray-400">{r.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="mt-12 text-center">
              {ctaClicked ? (
                <motion.p
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-sm font-medium text-green-400"
                >
                  <svg className="mr-1.5 inline-block w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 8.5 6.5 12 13 4" /></svg>
                  We&apos;ll send your detailed report within 24 hours
                </motion.p>
              ) : (
                <button
                  onClick={() => setCtaClicked(true)}
                  className="rounded-xl border border-white/10 bg-white/[0.09] px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-white/[0.14]"
                >
                  Get Your Full Audit Report
                </button>
              )}
            </div>
          </motion.div>
        </div>
      </section>
    );
  }

  /* ---------- Step Content ---------- */

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div>
            <h3 className="mb-6 text-lg font-semibold text-white">What&apos;s your role?</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {roleOptions.map((o) => (
                <OptionCard key={o.label} selected={answers.role === o.label} onClick={() => setAnswers((p) => ({ ...p, role: o.label }))}>
                  <span className="mr-2.5 flex shrink-0">{o.icon}</span>
                  {o.label}
                </OptionCard>
              ))}
            </div>
          </div>
        );
      case 2:
        return (
          <div>
            <h3 className="mb-6 text-lg font-semibold text-white">How many agents in your team?</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {teamSizeOptions.map((o) => (
                <OptionCard key={o} selected={answers.teamSize === o} onClick={() => setAnswers((p) => ({ ...p, teamSize: o }))}>
                  {o}
                </OptionCard>
              ))}
            </div>
          </div>
        );
      case 3:
        return (
          <div>
            <h3 className="mb-2 text-lg font-semibold text-white">How do you currently handle incoming leads?</h3>
            <p className="mb-6 text-xs text-gray-500">Select all that apply</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {leadHandlingOptions.map((o) => (
                <MultiOptionCard key={o} selected={answers.leadHandling.includes(o)} onClick={() => toggleMulti("leadHandling", o)}>
                  {o}
                </MultiOptionCard>
              ))}
            </div>
          </div>
        );
      case 4:
        return (
          <div>
            <h3 className="mb-6 text-lg font-semibold text-white">How long does it take to respond to a new lead?</h3>
            <div className="grid gap-3">
              {responseTimeOptions.map((o) => (
                <OptionCard key={o} selected={answers.responseTime === o} onClick={() => setAnswers((p) => ({ ...p, responseTime: o }))}>
                  {o}
                </OptionCard>
              ))}
            </div>
          </div>
        );
      case 5:
        return (
          <div>
            <h3 className="mb-2 text-lg font-semibold text-white">Which tools do you currently use?</h3>
            <p className="mb-6 text-xs text-gray-500">Select all that apply</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {toolOptions.map((o) => (
                <MultiOptionCard key={o} selected={answers.tools.includes(o)} onClick={() => toggleMulti("tools", o)}>
                  {o}
                </MultiOptionCard>
              ))}
            </div>
          </div>
        );
      case 6:
        return (
          <div>
            <h3 className="mb-6 text-lg font-semibold text-white">What&apos;s your biggest operational bottleneck?</h3>
            <div className="grid gap-3">
              {bottleneckOptions.map((o) => (
                <OptionCard key={o} selected={answers.bottleneck === o} onClick={() => setAnswers((p) => ({ ...p, bottleneck: o }))}>
                  {o}
                </OptionCard>
              ))}
            </div>
          </div>
        );
      case 7:
        return (
          <div>
            <h3 className="mb-6 text-lg font-semibold text-white">Monthly budget for automation tools?</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {budgetOptions.map((o) => (
                <OptionCard key={o} selected={answers.budget === o} onClick={() => setAnswers((p) => ({ ...p, budget: o }))}>
                  {o}
                </OptionCard>
              ))}
            </div>
          </div>
        );
      case 8:
        return (
          <div>
            <h3 className="mb-6 text-lg font-semibold text-white">Let&apos;s build your report</h3>
            <div className="grid gap-4">
              <div>
                <label className="mb-1.5 block text-xs text-gray-400">Name *</label>
                <input
                  type="text"
                  value={answers.name}
                  onChange={(e) => setAnswers((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-lg border border-white/[0.12] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-white/[0.25]"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-gray-400">Company Name *</label>
                <input
                  type="text"
                  value={answers.company}
                  onChange={(e) => setAnswers((p) => ({ ...p, company: e.target.value }))}
                  className="w-full rounded-lg border border-white/[0.12] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-white/[0.25]"
                  placeholder="Company name"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-gray-400">Email *</label>
                <input
                  type="email"
                  value={answers.email}
                  onChange={(e) => setAnswers((p) => ({ ...p, email: e.target.value }))}
                  className="w-full rounded-lg border border-white/[0.12] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-white/[0.25]"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-gray-400">Phone (optional)</label>
                <input
                  type="tel"
                  value={answers.phone}
                  onChange={(e) => setAnswers((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full rounded-lg border border-white/[0.12] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-white/[0.25]"
                  placeholder="+971 50 000 0000"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAnswers((p) => ({ ...p, whatsappPreferred: !p.whatsappPreferred }))}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    answers.whatsappPreferred ? "bg-green-500/60" : "bg-white/[0.12]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      answers.whatsappPreferred ? "translate-x-5" : ""
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-400">WhatsApp preferred?</span>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <section id="audit" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-2xl px-6">
        {/* Section header */}
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-gray-500">Free Audit</p>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            How Automated Is Your Operation?
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-gray-400">
            Answer 8 questions. Get your automation score and personalized recommendations.
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-10 h-0.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <motion.div
            className="h-full rounded-full bg-white/30"
            initial={false}
            animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          />
        </div>

        {/* Step indicator */}
        <p className="mb-6 text-xs text-gray-500">
          Step {step} of {TOTAL_STEPS}
        </p>

        {/* Animated step content */}
        <div className="relative min-h-[320px]">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="mt-10 flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={back}
              className="rounded-lg border border-white/10 bg-white/[0.05] px-5 py-2.5 text-sm text-gray-400 transition-colors hover:bg-white/[0.09] hover:text-white"
            >
              ← Back
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={next}
            disabled={!canProceed()}
            className={`rounded-lg border px-6 py-2.5 text-sm font-medium transition-all ${
              canProceed()
                ? "border-white/10 bg-white/[0.09] text-white hover:bg-white/[0.14]"
                : "cursor-not-allowed border-white/[0.06] bg-white/[0.03] text-gray-600"
            }`}
          >
            {step === TOTAL_STEPS ? "See My Score →" : "Continue →"}
          </button>
        </div>
      </div>
    </section>
  );
}
