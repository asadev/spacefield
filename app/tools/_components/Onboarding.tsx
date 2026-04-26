"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  TOOL_CATEGORIES,
  TOOL_ICONS,
  TOOLS,
} from "../_data/tools-list";
import {
  PROFESSIONS,
  professionsByIndustry,
  type ProfessionKey,
} from "../_data/professions";
import {
  INDUSTRIES,
  DEFAULT_INDUSTRY,
  type IndustryKey,
} from "../_data/industries";

interface Props {
  open: boolean;
  onComplete: (profession: ProfessionKey, installed: string[]) => void;
}

type Step = "welcome" | "industry" | "profession" | "tools" | "done";

export default function Onboarding({ open, onComplete }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  // Pre-select Real Estate — product started as an RE workspace and most
  // visitors still fit that persona. Other industries are one click away.
  const [industry, setIndustry] = useState<IndustryKey>(DEFAULT_INDUSTRY);
  const [profession, setProfession] = useState<ProfessionKey | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handlePickIndustry = (key: IndustryKey) => {
    setIndustry(key);
    setStep("profession");
  };

  const handlePickProfession = (key: ProfessionKey) => {
    setProfession(key);
    const p = PROFESSIONS.find((x) => x.key === key);
    // "everything" and "generalist" both mean: give me the broad starter set
    const isExploring = !p || key === "everything" || key === "generalist";
    const initial = isExploring
      ? TOOLS.filter((t) => t.topRated).map((t) => t.slug)
      : p.preinstalled;
    setSelected(new Set(initial));
    setStep("tools");
  };

  const toggle = (slug: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const finish = () => {
    setStep("done");
    setTimeout(() => {
      onComplete(profession ?? "everything", Array.from(selected));
    }, 900);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          role="dialog"
          aria-label="Set up your workspace"
        >
          <div
            className="absolute inset-0 backdrop-blur-2xl"
            style={{ background: "rgba(15, 23, 42, 0.55)" }}
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="relative z-10 flex h-[min(86vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-app bg-app-elevated shadow-2xl"
          >
            <AnimatePresence mode="wait">
              {step === "welcome" && (
                <StepWelcome
                  key="welcome"
                  onStart={() => setStep("industry")}
                />
              )}
              {step === "industry" && (
                <StepIndustry
                  key="industry"
                  selected={industry}
                  onBack={() => setStep("welcome")}
                  onPick={handlePickIndustry}
                />
              )}
              {step === "profession" && (
                <StepProfession
                  key="profession"
                  industry={industry}
                  onBack={() => setStep("industry")}
                  onPick={handlePickProfession}
                />
              )}
              {step === "tools" && profession && (
                <StepTools
                  key="tools"
                  profession={profession}
                  selected={selected}
                  onToggle={toggle}
                  onBack={() => setStep("profession")}
                  onFinish={finish}
                  onSelectAll={() => setSelected(new Set(TOOLS.map((t) => t.slug)))}
                  onSelectNone={() => setSelected(new Set())}
                />
              )}
              {step === "done" && <StepDone key="done" />}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ───────── Steps ───────── */

function StepWelcome({ onStart }: { onStart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-1 flex-col items-center justify-center p-10 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-strong text-app">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d={TOOL_ICONS.compass} />
        </svg>
      </div>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-app sm:text-4xl">
        Set up your workspace
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-secondary">
        Pick your industry and role, install the tools that fit, and you&apos;re ready.
        You can always add or remove tools later from the Store.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="mt-8 inline-flex items-center gap-2 rounded-lg bg-app px-5 py-2.5 text-sm font-medium text-app hover:opacity-90 transition-opacity"
      >
        Start
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </motion.div>
  );
}

function StepIndustry({
  selected,
  onBack,
  onPick,
}: {
  selected: IndustryKey;
  onBack: () => void;
  onPick: (k: IndustryKey) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2 }}
      className="flex flex-1 flex-col overflow-hidden"
    >
      <Header
        title="What industry are you in?"
        subtitle="We'll tailor the role options and preinstall the right tools. Real Estate is selected by default."
        onBack={onBack}
      />
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {INDUSTRIES.map((ind) => {
            const isPre = ind.key === selected;
            return (
              <button
                key={ind.key}
                type="button"
                onClick={() => onPick(ind.key)}
                className={`group flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                  isPre
                    ? "border-app-hover bg-app shadow-card"
                    : "border-app bg-app hover:border-app-hover hover:shadow-card"
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    isPre ? "bg-white text-black" : "bg-surface-strong text-app"
                  }`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d={TOOL_ICONS[ind.icon]} />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="block text-sm font-semibold text-app">
                      {ind.label}
                    </span>
                    {isPre && (
                      <span className="rounded-full border border-app bg-surface px-1.5 py-0.5 text-[0.55rem] font-medium uppercase tracking-[0.15em] text-muted">
                        Default
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                    {ind.tagline}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

function StepProfession({
  industry,
  onBack,
  onPick,
}: {
  industry: IndustryKey;
  onBack: () => void;
  onPick: (k: ProfessionKey) => void;
}) {
  // Filter roles by industry. If none are defined for an industry (unlikely),
  // fall back to the RE roles so the flow never dead-ends.
  const roles = useMemo(() => {
    const list = professionsByIndustry(industry);
    if (list.length > 0) return list;
    return PROFESSIONS.filter((p) => p.industry === "real-estate");
  }, [industry]);

  // Every industry gets a "just exploring" fallback. RE uses `everything`;
  // others use `generalist`. If neither is present for this industry, we
  // synthesize one on the fly pointing at `generalist`.
  const hasExploring = roles.some(
    (r) => r.key === "everything" || r.key === "generalist"
  );
  const fallbackRoles = hasExploring
    ? roles
    : [
        ...roles,
        PROFESSIONS.find((p) => p.key === "generalist")!,
      ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2 }}
      className="flex flex-1 flex-col overflow-hidden"
    >
      <Header title="What do you do?" subtitle="We'll preinstall tools that fit." onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fallbackRoles.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onPick(p.key)}
              className="group flex items-start gap-3 rounded-xl border border-app bg-app p-4 text-left transition-all hover:border-app-hover hover:shadow-card"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-strong text-app">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d={TOOL_ICONS[p.icon]} />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-app">{p.label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                  {p.tagline}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function StepTools({
  profession,
  selected,
  onToggle,
  onBack,
  onFinish,
  onSelectAll,
  onSelectNone,
}: {
  profession: ProfessionKey;
  selected: Set<string>;
  onToggle: (slug: string) => void;
  onBack: () => void;
  onFinish: () => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}) {
  const grouped = useMemo(() => {
    const byCat: Record<string, typeof TOOLS> = {};
    for (const t of TOOLS) {
      (byCat[t.category] ||= []).push(t);
    }
    return byCat;
  }, []);

  const p = PROFESSIONS.find((x) => x.key === profession);
  const isExploring = profession === "everything" || profession === "generalist";
  const preCount = p && !isExploring ? p.preinstalled.length : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2 }}
      className="flex flex-1 flex-col overflow-hidden"
    >
      <Header
        title="Pick your tools"
        subtitle={
          preCount > 0
            ? `${preCount} recommended for ${p?.label.toLowerCase()}. Adjust as you like.`
            : "Pick any tools to install. You can add more later."
        }
        onBack={onBack}
        right={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSelectAll}
              className="rounded-md border border-app bg-surface px-2.5 py-1 text-[0.7rem] text-secondary hover:text-app"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={onSelectNone}
              className="rounded-md border border-app bg-surface px-2.5 py-1 text-[0.7rem] text-secondary hover:text-app"
            >
              Clear
            </button>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto px-6 pb-4">
        {TOOL_CATEGORIES.map((cat) => {
          const items = grouped[cat.key] || [];
          if (items.length === 0) return null;
          return (
            <div key={cat.key} className="mt-5 first:mt-2">
              <div className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                {cat.label}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {items.map((t) => {
                  const on = selected.has(t.slug);
                  return (
                    <button
                      key={t.slug}
                      type="button"
                      onClick={() => onToggle(t.slug)}
                      className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                        on
                          ? "border-app-hover bg-app shadow-card"
                          : "border-app bg-app hover:border-app-hover"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          on ? "bg-white text-black" : "bg-surface-strong text-app"
                        }`}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d={TOOL_ICONS[t.icon] ?? TOOL_ICONS.home} />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-app">{t.title}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-1 block text-[11px] text-muted">
                          {t.description}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          on ? "border-app-hover bg-white text-black" : "border-app text-app"
                        }`}
                      >
                        {on && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12l5 5L20 7" />
                          </svg>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-app bg-app-elevated px-6 py-3">
        <span className="text-xs text-muted">{selected.size} selected</span>
        <button
          type="button"
          onClick={onFinish}
          disabled={selected.size === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-app px-5 py-2 text-sm font-medium text-app transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Install {selected.size} tool{selected.size === 1 ? "" : "s"}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}

function StepDone() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-1 flex-col items-center justify-center p-10 text-center"
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12l5 5L20 7" />
        </svg>
      </motion.div>
      <h2 className="mt-6 text-2xl font-semibold tracking-tight text-app">
        Your workspace is ready
      </h2>
      <p className="mt-2 text-sm text-muted">Opening now…</p>
    </motion.div>
  );
}

/* ───────── Shared header ───────── */

function Header({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-app bg-app-elevated px-6 py-4">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-app text-secondary hover:text-app hover:bg-surface transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-semibold text-app">{title}</div>
        {subtitle && <div className="mt-0.5 text-xs text-muted">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}
