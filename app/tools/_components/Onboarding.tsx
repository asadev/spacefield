"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspaces/client";
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
import { templateForProfession } from "../crm/_templates/registry";
import IndustryCardGrid from "./workspace-settings/IndustryCardGrid";
import {
  ALL_INDUSTRIES as BUSINESS_INDUSTRIES,
} from "@/lib/industry/registry";
import { getIndustryConfig } from "@/lib/industry/registry-helpers";
import type { Industry as BusinessIndustry } from "@/lib/industry/types";

interface Props {
  open: boolean;
  onComplete: (profession: ProfessionKey, installed: string[]) => void;
}

/* Map a business-industry slug (lib/industry) onto the legacy
 * onboarding IndustryKey used for role filtering. The legacy enum only
 * has a few buckets, so most business industries collapse to "other"
 * (which surfaces the generalist set of roles + tools). RE is the only
 * one that survives end-to-end since the product started there.
 *
 * When we add new buckets to PROFESSIONS / INDUSTRIES, extend this map. */
function legacyIndustryFor(business: BusinessIndustry): IndustryKey {
  switch (business) {
    case "real_estate":
      return "real-estate";
    case "marketing_agency":
      return "marketing";
    case "professional_services":
      return "consulting";
    case "clothing_retail":
    case "beauty":
    case "retail_general":
      return "sales";
    case "coworking":
    case "salon":
    case "restaurant":
    case "gym":
    case "fitness":
    case "automotive":
    case "education":
    case "healthcare":
    case "hospitality":
    case "generic":
    default:
      return "other";
  }
}

/* Persist the workspace's business industry to public.workspaces.industry.
 * Fire-and-forget — onboarding never blocks on the network call. If the
 * workspace hasn't been materialized yet (personal-only flow), this
 * silently no-ops. The user can change it later from
 * Settings → Industry. */
async function persistBusinessIndustry(
  workspaceId: string,
  industry: BusinessIndustry
): Promise<void> {
  if (!workspaceId) return;
  try {
    await fetch("/api/workspaces/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ workspaceId, industry }),
    });
  } catch {
    /* swallow — Settings → Industry is the manual fallback. */
  }
}

/* Fire-and-forget: if the chosen profession matches a CRM template and
 * the workspace doesn't already have a template applied, POST the apply.
 * Any failure (no workspace, network, RLS) is swallowed so onboarding
 * never blocks on this. The picker in Settings → Template is always
 * available as a manual fallback. */
async function maybeAutoApplyTemplate(
  workspaceId: string,
  profession: string
): Promise<void> {
  if (!workspaceId) return;
  const tpl = templateForProfession(profession);
  if (!tpl) return;
  try {
    const r = await fetch(
      `/api/crm/templates/current?workspace_id=${workspaceId}`,
      { credentials: "include" }
    );
    if (r.ok) {
      const j = (await r.json()) as { template_id: string | null };
      if (j.template_id) return; // already applied — respect prior choice
    }
    await fetch("/api/crm/templates/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        workspace_id: workspaceId,
        template_id: tpl.id,
      }),
    });
  } catch {
    // Silent — picker is the manual fallback.
  }
}

type Step =
  | "welcome"
  | "business"
  | "industry"
  | "profession"
  | "tools"
  | "done";

export default function Onboarding({ open, onComplete }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  // Pre-select Real Estate — product started as an RE workspace and most
  // visitors still fit that persona. Other industries are one click away.
  const [industry, setIndustry] = useState<IndustryKey>(DEFAULT_INDUSTRY);
  /* Business industry (public.workspaces.industry — see lib/industry).
   * Required for new workspaces (the brief), but null-permissive on
   * legacy ones. We start with null; the "business" step is required
   * before continuing. */
  const [businessIndustry, setBusinessIndustry] =
    useState<BusinessIndustry | null>(null);
  const [profession, setProfession] = useState<ProfessionKey | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Active team workspace id, used to fire the CRM template auto-apply
  // after the user finishes onboarding. Personal workspaces don't get a
  // template (the apply API rejects non-team workspaces with no member row).
  const { current: activeWorkspace } = useWorkspace();

  const handlePickBusinessIndustry = (key: BusinessIndustry) => {
    setBusinessIndustry(key);
    // Persist immediately. Don't block the UI on the network.
    // Removed the `kind === "team"` guard (was dropping the industry
    // pick on the floor for solo users whose first workspace is
    // "personal" by default). The /api/workspaces/update endpoint
    // accepts industry for any workspace kind. Caught 2026-05-27 by
    // Agent M's verification — onboarding flow looked correct but
    // value never reached the DB for ~all new signups.
    if (activeWorkspace?.id) {
      void persistBusinessIndustry(activeWorkspace.id, key);
    }
    // Pre-select the matching legacy industry for the next step so the
    // role list is already filtered correctly.
    setIndustry(legacyIndustryFor(key));
    setStep("industry");
  };

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
    // Union the business-industry's recommendedApps with the role's
    // preinstall list — both are signals about what the user actually
    // needs, and pre-checking is reversible (the user can uncheck in the
    // tools step). Tool slugs are filtered to those that actually exist
    // in TOOLS so we don't pre-check ghost apps.
    const businessRecs =
      businessIndustry !== null
        ? getIndustryConfig(businessIndustry).recommendedApps
        : [];
    const allKnownSlugs = new Set(TOOLS.map((t) => t.slug));
    const merged = new Set<string>(initial);
    for (const slug of businessRecs) if (allKnownSlugs.has(slug)) merged.add(slug);
    setSelected(merged);
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
    const finalProfession: ProfessionKey = profession ?? "everything";
    // Fire the auto-apply in the background — never block the UI on it.
    if (activeWorkspace.kind === "team") {
      void maybeAutoApplyTemplate(activeWorkspace.id, finalProfession);
    }
    setTimeout(() => {
      onComplete(finalProfession, Array.from(selected));
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
            className="sf-glass-window relative z-10 flex h-[min(86vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
          >
            <AnimatePresence mode="wait">
              {step === "welcome" && (
                <StepWelcome
                  key="welcome"
                  onStart={() => setStep("business")}
                />
              )}
              {step === "business" && (
                <StepBusinessIndustry
                  key="business"
                  selected={businessIndustry}
                  onBack={() => setStep("welcome")}
                  onPick={handlePickBusinessIndustry}
                />
              )}
              {step === "industry" && (
                <StepIndustry
                  key="industry"
                  selected={industry}
                  onBack={() => setStep("business")}
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

function StepBusinessIndustry({
  selected,
  onBack,
  onPick,
}: {
  selected: BusinessIndustry | null;
  onBack: () => void;
  onPick: (k: BusinessIndustry) => void;
}) {
  // The brief recommends a follow-up "want us to install the recommended
  // apps?" prompt. We surface the list inline once a pick is made — no
  // auto-install (user stays in control). Picking the same card again
  // (or any other card) commits the choice and advances.
  const recommended = selected ? getIndustryConfig(selected) : null;
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2 }}
      className="flex flex-1 flex-col overflow-hidden"
    >
      <Header
        title="What kind of business is this for?"
        subtitle="We'll pick the right templates, pipelines, and tool recommendations. You can change this anytime in Settings → Industry."
        onBack={onBack}
      />
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <IndustryCardGrid
          selected={selected}
          onPick={onPick}
        />
        {recommended && recommended.recommendedApps.length > 0 && (
          <div className="mt-5 rounded-xl border border-tool-accent-soft bg-tool-accent-soft px-4 py-3">
            <div className="text-xs font-semibold text-app">
              Recommended for {recommended.label}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              We&apos;ll suggest these apps in the next step — install
              whichever you want.
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {recommended.recommendedApps.map((slug) => (
                <span
                  key={slug}
                  className="rounded-md border border-app bg-app px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-secondary"
                >
                  {slug.replace(/-/g, " ")}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* The industry-step header used by StepBusinessIndustry + StepIndustry. */

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
