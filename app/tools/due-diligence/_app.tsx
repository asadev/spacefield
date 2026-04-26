"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Due Diligence Checklist — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Receives NativeAppProps from the workspace Window. No iframe, no AuthGate,
   no PageHeader, no back-links, no ToolRecommendations, no bespoke macOS
   chrome. Width-driven layout (collapses dense rows / hero stats below the
   720 / 560 / 480 thresholds). All checklist data, scoring, persistence,
   and XP-on-100% logic preserved verbatim from page.tsx.
═══════════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { awardXP } from "@/lib/xp-actions";
import {
  CHECKLISTS,
  PROPERTY_TYPES,
  CATEGORY_META,
  type PropertyType,
  type Category,
  type ChecklistItem,
} from "@/lib/due-diligence-data";
import type { NativeAppProps } from "../_data/tools-list";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

const STORAGE_KEY = "dd-checklist-state-v1";
const CATEGORY_ORDER: Category[] = ["legal", "financial", "physical", "operational"];

type RiskTone = "blocker" | "warning" | "note";

const PRIORITY_RISK: Record<string, { tone: RiskTone; label: string }> = {
  critical: { tone: "blocker", label: "Critical" },
  important: { tone: "warning", label: "Important" },
  recommended: { tone: "note", label: "Recommended" },
};

function riskChipClass(tone: RiskTone): string {
  switch (tone) {
    case "blocker":
      return "border-rose-500/30 bg-rose-500/10 text-rose-500 dark:text-rose-400";
    case "warning":
      return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "note":
    default:
      return "border-tool-accent/30 bg-tool-accent-soft text-tool-accent";
  }
}

interface SavedState {
  type: PropertyType;
  checked: Record<string, boolean>;
}

export default function DueDiligenceApp(props: NativeAppProps) {
  const { width } = props;
  // Width-driven breakpoints — same idea as deal-scoring/_app.tsx.
  const isNarrow = width < 720;
  const isCompact = width < 560;
  const isUltra = width < 480;

  const [type, setType] = useState<PropertyType>("ready-apartment");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedState;
        if (parsed.type) setType(parsed.type);
        if (parsed.checked) setChecked(parsed.checked);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Persist
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ type, checked } satisfies SavedState)
      );
    } catch {
      /* ignore */
    }
  }, [type, checked, hydrated]);

  const items = CHECKLISTS[type];

  const grouped = useMemo(() => {
    const g: Record<Category, ChecklistItem[]> = {
      legal: [],
      financial: [],
      physical: [],
      operational: [],
    };
    for (const item of items) g[item.category].push(item);
    return g;
  }, [items]);

  const totalCount = items.length;
  const doneCount = items.filter((i) => checked[i.id]).length;
  const progressPct = totalCount === 0 ? 0 : (doneCount / totalCount) * 100;

  // Summary dashboard stats
  const criticalItems = items.filter((i) => i.priority === "critical");
  const criticalRemaining = criticalItems.filter((i) => !checked[i.id]).length;
  const uncheckedItems = items.filter((i) => !checked[i.id]);
  const estimatedDaysRemaining = uncheckedItems.reduce(
    (sum, i) => sum + i.estimatedDays,
    0
  );

  // Award XP once when checklist hits 100% (only after hydration to avoid mount-time award)
  useEffect(() => {
    if (!hydrated) return;
    if (totalCount > 0 && doneCount === totalCount) {
      awardXP("tool_use", "tool", "due-diligence").catch(() => {});
    }
  }, [doneCount, totalCount, hydrated]);

  const toggle = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const resetAll = () => {
    setChecked({});
    setCollapsedCats({});
  };

  const toggleCategory = (cat: Category) => {
    setCollapsedCats((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const changeType = (t: PropertyType) => {
    setType(t);
    setChecked({});
  };

  const activeType = PROPERTY_TYPES.find((p) => p.value === type)!;
  const isComplete = doneCount === totalCount && totalCount > 0;

  return (
    <div
      data-tool-theme="intelligence"
      data-tool="due-diligence"
      className="h-full w-full overflow-y-auto bg-app text-app"
    >
      <div className="px-5 py-5 sm:px-6">
        {/* ───── PROPERTY TYPE SELECTOR ───── */}
        <div className="rounded-xl border border-app bg-app-elevated p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[0.6rem] uppercase tracking-[0.25em] text-muted">
              Property Type
            </p>
            <span className="text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
              ● scope
            </span>
          </div>
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: isUltra
                ? "1fr"
                : isCompact
                  ? "repeat(2, minmax(0, 1fr))"
                  : isNarrow
                    ? "repeat(3, minmax(0, 1fr))"
                    : "repeat(5, minmax(0, 1fr))",
            }}
          >
            {PROPERTY_TYPES.map((pt) => {
              const active = type === pt.value;
              return (
                <button
                  key={pt.value}
                  type="button"
                  onClick={() => changeType(pt.value)}
                  className={`rounded-lg border px-3 py-3 text-left text-[0.7rem] uppercase tracking-[0.12em] transition-all duration-200 ${
                    active
                      ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                      : "border-app bg-app text-secondary hover:border-tool-accent/40 hover:text-app"
                  }`}
                >
                  {pt.label}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            {activeType.description}
          </p>
        </div>

        {/* ───── PROGRESS HERO ───── */}
        <motion.div
          key={`hero-pct-${type}-${doneCount}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease }}
          className="mt-5 rounded-2xl border border-tool-accent/30 bg-tool-accent-soft p-5"
        >
          <div
            className={
              isCompact
                ? "flex flex-col gap-3"
                : "flex items-center justify-between gap-5"
            }
          >
            <div className="min-w-0">
              <p className="text-[0.6rem] uppercase tracking-[0.25em] text-tool-accent">
                Completion
              </p>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-5xl font-semibold tracking-tight tabular-nums text-tool-accent">
                  {totalCount === 0 ? 0 : Math.round(progressPct)}
                </span>
                <span className="text-lg font-medium text-tool-accent/70">
                  %
                </span>
              </div>
              <p className="mt-0.5 text-xs text-secondary tabular-nums">
                {doneCount} / {totalCount} checks complete
              </p>
            </div>
            <div className={isCompact ? "w-full" : "flex-1 max-w-[420px]"}>
              <div className="h-1.5 overflow-hidden rounded-full bg-app">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.6, ease }}
                  className="h-full rounded-full bg-tool-accent"
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* ───── SUMMARY DASHBOARD ───── */}
        <motion.div
          key={`summary-${type}-${doneCount}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
          className="mt-5 grid gap-3"
          style={{
            gridTemplateColumns: isCompact
              ? "1fr"
              : "repeat(3, minmax(0, 1fr))",
          }}
        >
          <SummaryStat
            label="Critical Remaining"
            value={String(criticalRemaining)}
            tone={criticalRemaining > 0 ? "blocker" : "ok"}
          />
          <SummaryStat
            label="Est. Days to Complete"
            value={String(estimatedDaysRemaining)}
            tone="neutral"
          />
          <SummaryStat
            label="Items Checked"
            value={`${doneCount}/${totalCount}`}
            tone={isComplete ? "ok" : "neutral"}
          />
        </motion.div>

        {/* ───── ACTION BAR ───── */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3.5 py-2 text-[0.6rem] uppercase tracking-[0.2em] text-secondary transition-all hover:border-tool-accent/40 hover:text-app"
          >
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            Reset Checklist
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3.5 py-2 text-[0.6rem] uppercase tracking-[0.2em] text-white shadow-sm transition-all hover:opacity-95"
          >
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print / Export
          </button>
        </div>

        {/* ───── COMPLETION BANNER ───── */}
        <AnimatePresence>
          {isComplete && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.45, ease }}
              className="mt-6 rounded-xl border border-tool-accent/30 bg-tool-accent-soft p-5"
            >
              <div
                className={
                  isCompact
                    ? "flex flex-col gap-3"
                    : "flex items-center gap-4"
                }
              >
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-tool-accent/40 bg-tool-accent text-white">
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-tool-accent">
                    Due Diligence Complete
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-secondary">
                    All {totalCount} items have been checked. You are ready to
                    proceed with confidence.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetAll}
                  className="rounded-lg border border-tool-accent/30 bg-app-elevated px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent transition-all hover:bg-tool-accent hover:text-white"
                >
                  Reset
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ───── CATEGORY ACCORDIONS ───── */}
        <div className="mt-8 space-y-4">
          {CATEGORY_ORDER.map((cat, ci) => {
            const list = grouped[cat];
            if (list.length === 0) return null;
            const catDone = list.filter((i) => checked[i.id]).length;
            const catComplete = catDone === list.length;
            const collapsed = !!collapsedCats[cat];
            return (
              <motion.div
                key={`${type}-${cat}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: ci * 0.06, ease }}
                className={`overflow-hidden rounded-xl border transition-colors ${
                  collapsed
                    ? "border-app bg-app-elevated"
                    : "border-tool-accent/30 bg-tool-accent-soft"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <svg
                      className={`h-4 w-4 flex-shrink-0 text-tool-accent transition-transform duration-200 ${
                        collapsed ? "-rotate-90" : "rotate-0"
                      }`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                    <div className="min-w-0">
                      <p className="text-[0.65rem] uppercase tracking-[0.22em] text-tool-accent">
                        {CATEGORY_META[cat].label}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-secondary">
                        {CATEGORY_META[cat].description}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-[0.6rem] uppercase tracking-[0.15em] tabular-nums ${
                      catComplete
                        ? "border-tool-accent bg-tool-accent text-white"
                        : "border-app bg-app text-secondary"
                    }`}
                  >
                    {catDone}/{list.length}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 px-3 pb-3">
                        {list.map((item) => {
                          const isChecked = !!checked[item.id];
                          const risk = PRIORITY_RISK[item.priority];
                          return (
                            <ChecklistRow
                              key={item.id}
                              item={item}
                              isChecked={isChecked}
                              risk={risk}
                              onToggle={() => toggle(item.id)}
                            />
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* ───── CROSS-TOOL JUMPS (in-workspace via openApp) ───── */}
        <div
          className="mt-10 grid gap-3"
          style={{
            gridTemplateColumns: isCompact
              ? "1fr"
              : "repeat(2, minmax(0, 1fr))",
          }}
        >
          <button
            type="button"
            onClick={() => props.openApp("golden-visa-checker")}
            className="group flex items-center justify-between gap-4 rounded-xl border border-app bg-app-elevated p-5 text-left transition-all hover:border-tool-accent/40"
          >
            <div className="min-w-0">
              <p className="text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
                Next Step
              </p>
              <p className="mt-1 text-sm font-medium text-app">
                Check your Golden Visa eligibility
              </p>
            </div>
            <span className="flex-shrink-0 text-tool-accent transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </button>
          <button
            type="button"
            onClick={() => props.openApp("deal-scoring")}
            className="group flex items-center justify-between gap-4 rounded-xl border border-app bg-app-elevated p-5 text-left transition-all hover:border-tool-accent/40"
          >
            <div className="min-w-0">
              <p className="text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
                Next Step
              </p>
              <p className="mt-1 text-sm font-medium text-app">
                Score this deal before buying
              </p>
            </div>
            <span className="flex-shrink-0 text-tool-accent transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───── Summary Stat Card ───── */
function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "blocker" | "neutral";
}) {
  const valueClass =
    tone === "blocker"
      ? "text-rose-500 dark:text-rose-400"
      : tone === "ok"
        ? "text-tool-accent"
        : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4 transition-colors">
      <p className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

/* ───── Checklist Row ───── */
function ChecklistRow({
  item,
  isChecked,
  risk,
  onToggle,
}: {
  item: ChecklistItem;
  isChecked: boolean;
  risk: { tone: RiskTone; label: string };
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`group flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-all duration-200 ${
        isChecked
          ? "border-tool-accent/30 bg-tool-accent-soft"
          : "border-app bg-app-elevated hover:border-tool-accent/30"
      }`}
    >
      {/* Tool-accent checkbox */}
      <span
        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-all duration-200 ${
          isChecked
            ? "border-tool-accent bg-tool-accent text-white"
            : "border-app bg-app group-hover:border-tool-accent/50"
        }`}
        aria-hidden
      >
        {isChecked && (
          <svg
            className="h-3 w-3"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="2 6 5 9 10 3" />
          </svg>
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={`text-sm font-medium transition-colors ${
              isChecked ? "text-secondary line-through" : "text-app"
            }`}
          >
            {item.title}
          </p>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.15em] ${riskChipClass(
              risk.tone
            )}`}
          >
            {risk.label}
          </span>
          <span className="text-[0.55rem] uppercase tracking-[0.1em] text-muted tabular-nums">
            ~{item.estimatedDays}d
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-secondary">
          <span className="uppercase tracking-[0.15em] text-muted">Why: </span>
          {item.why}
        </p>
      </div>
    </button>
  );
}
