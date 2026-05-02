"use client";

/* WorkspaceTemplates — preset bundles of installed tools + dock pin order
 * applied immediately after a workspace is created.
 *
 * Why this lives in the same module as the picker UI: the dialog needs
 * the template metadata to render the cards, and useWorkspaces needs
 * applyTemplate() to write to localStorage right after createWorkspace.
 * Keeping them together avoids two consumers drifting on the same
 * constants.
 *
 * Usage:
 *   const { templates } = WORKSPACE_TEMPLATES;
 *   <TemplatePicker selected={key} onSelect={setKey} />
 *
 *   // After creating a workspace:
 *   applyWorkspaceTemplate(workspaceId, templateKey);
 */

import { workspaceKey } from "./useWorkspaces";

export type TemplateKey =
  | "real-estate"
  | "marketing"
  | "finance-ops"
  | "personal";

export interface WorkspaceTemplate {
  key: TemplateKey;
  name: string;
  description: string;
  /** Pretty default workspace name when this template is picked. */
  defaultWorkspaceName: string;
  /** Tool slugs to install (drives Tool list + Launchpad). */
  install: string[];
  /** Pinned dock order — must be a subset (or equal) of install. */
  dock: string[];
}

export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
  {
    key: "real-estate",
    name: "Real Estate Agent",
    description:
      "Valuation, scoring, ROI math, posters, offer letters — everything for selling property.",
    defaultWorkspaceName: "Real Estate",
    install: [
      "investment-advisor",
      "property-valuation",
      "deal-scoring",
      "mortgage-calculator",
      "roi-calculator",
      "market-pulse",
      "property-comparison",
      "sales-offer-generator",
      "property-poster-creator",
      // (Files Manager retired Round D — Launchpad covers files now.)
      "documents",
    ],
    dock: [
      "property-valuation",
      "deal-scoring",
      "market-pulse",
      "property-comparison",
      "sales-offer-generator",
      "property-poster-creator",
      "documents",
    ],
  },
  {
    key: "marketing",
    name: "Marketing Team",
    description:
      "Briefs, headlines, SEO, A/B testing, ad budgets, email ROI — campaign kit.",
    defaultWorkspaceName: "Marketing",
    install: [
      "content-brief-builder",
      "headline-analyzer",
      "seo-meta-tags",
      "ab-test-sample-size",
      "ad-budget-allocator",
      "email-roi",
      "engagement-rate",
      // (Files Manager retired Round D — Launchpad covers files now.)
      "documents",
      "sheets",
    ],
    dock: [
      "content-brief-builder",
      "headline-analyzer",
      "seo-meta-tags",
      "ab-test-sample-size",
      "email-roi",
      "documents",
      "sheets",
    ],
  },
  {
    key: "finance-ops",
    name: "Finance / Operations",
    description:
      "Loan, NPV/IRR, cash burn, runway scenarios — running the numbers.",
    defaultWorkspaceName: "Finance",
    install: [
      "npv-irr",
      "cash-burn-runway",
      "runway-scenarios",
      // (Files Manager retired Round D — Launchpad covers files now.)
      "sheets",
      "documents",
    ],
    dock: [
      "npv-irr",
      "cash-burn-runway",
      "runway-scenarios",
      "sheets",
      "documents",
    ],
  },
  {
    key: "personal",
    name: "Personal / Empty",
    // (Files Manager retired Round D — Launchpad covers files now.)
    description:
      "Bare workspace — just Documents and the Launchpad. Build it your way.",
    defaultWorkspaceName: "Personal",
    install: ["documents"],
    dock: ["documents"],
  },
];

const INSTALL_SUFFIX = "tools-desktop-install-v1";
const DOCK_SUFFIX = "tools-desktop-dock-order-v1";

interface InstallState {
  onboarded: boolean;
  profession: string | null;
  installed: string[];
}

/**
 * Apply a template to a freshly-created workspace. Writes the install +
 * dock-order localStorage keys for that workspace's namespace so when the
 * Desktop remounts on activeId change, the new workspace's hooks read
 * the preset state immediately. Marks the workspace as onboarded so the
 * Onboarding overlay doesn't pop.
 *
 * No-op for "personal" (the existing default behaviour) but we still mark
 * it onboarded because the user just made a deliberate choice to skip the
 * profession picker.
 */
export function applyWorkspaceTemplate(
  workspaceId: string,
  templateKey: TemplateKey
): void {
  if (typeof window === "undefined") return;
  const template = WORKSPACE_TEMPLATES.find((t) => t.key === templateKey);
  if (!template) return;

  const installState: InstallState = {
    onboarded: true,
    profession: templateKey,
    installed: [...new Set(template.install)],
  };

  try {
    window.localStorage.setItem(
      workspaceKey(workspaceId, INSTALL_SUFFIX),
      JSON.stringify(installState)
    );
    // Dock order — only include slugs that are also installed. The dock
    // gracefully filters absent slugs but writing them through is wasteful.
    const installSet = new Set(installState.installed);
    const dockSlugs = template.dock.filter((s) => installSet.has(s));
    window.localStorage.setItem(
      workspaceKey(workspaceId, DOCK_SUFFIX),
      JSON.stringify(dockSlugs)
    );
  } catch {
    /* localStorage quota — silent. The workspace will still load
     * (sans template) so the user keeps moving. */
  }
}

/**
 * Tiny visual card grid for the Create-Workspace dialog. Selection sets a
 * key the parent uses to call applyWorkspaceTemplate after creation.
 * Stays presentational on purpose so it can be reused on the welcome
 * screen later.
 */
export function TemplatePicker({
  selected,
  onSelect,
}: {
  selected: TemplateKey;
  onSelect: (key: TemplateKey) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {WORKSPACE_TEMPLATES.map((t) => {
        const active = selected === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(t.key)}
            aria-pressed={active}
            className={
              "flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors " +
              (active
                ? "border-tool-accent bg-tool-accent-soft"
                : "border-app bg-app hover:bg-surface")
            }
          >
            <div
              className={
                "text-[0.78rem] font-semibold " +
                (active ? "text-tool-accent" : "text-app")
              }
            >
              {t.name}
            </div>
            <div className="text-[0.68rem] leading-snug text-secondary">
              {t.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}
