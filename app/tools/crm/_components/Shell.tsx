"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * CRM Shell — sidebar nav + top bar + outlet.
 *
 * Phase 1 deliverable: navigation only, with empty-state placeholders for
 * each section. Phase 2 agents replace the inner surfaces (`renderSection`
 * branch contents) but keep this component's section state + nav contract
 * intact. The shell also exposes `section` and a `setSection` setter the
 * top-bar "+ New" dropdown can use to jump into create flows.
 *
 * Layout
 * ──────
 *  ┌──────────┬────────────────────────────────────────┐
 *  │ sidebar  │ topbar (workspace pill, search, + New) │
 *  │          ├────────────────────────────────────────┤
 *  │  nav     │                                        │
 *  │  rows    │             section outlet             │
 *  │          │                                        │
 *  └──────────┴────────────────────────────────────────┘
 *
 * Mobile (width < 720px): sidebar collapses behind a hamburger drawer;
 * search collapses behind a search button.
 *
 * Phase 2C wires the remaining sections (activities, reports, settings)
 * and adds a Settings sub-router (custom-fields / permissions / saved-views).
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/lib/workspaces/client";
import { prefetch as prefetchUrl } from "@/lib/cache/swr";
import type { CrmSection, CrmSectionMeta } from "../types";
import type { NativeAppProps } from "../../_data/tools-list";
import PipelineView from "./PipelineView";
import DealsListView from "./DealsListView";
import LeadsView from "./LeadsView";
import ContactsView from "./ContactsView";
import CompaniesView from "./CompaniesView";
import InventoryView from "./InventoryView";
import ActivitiesView from "./ActivitiesView";
import ReportsView from "./ReportsView";
import CustomFieldsAdmin from "./CustomFieldsAdmin";
import PermissionsAdmin from "./PermissionsAdmin";
import SavedViewsManager from "./SavedViewsManager";
import TemplatePicker from "./TemplatePicker";
import LeadSourcesAdmin from "./LeadSourcesAdmin";
import BoardsListView from "./BoardsListView";
import TemplatesView from "./TemplatesView";
import RemindersView from "./RemindersView";
import TerritoriesView from "./TerritoriesView";
import FormBuilderView from "./FormBuilderView";
import AgentChatScope from "../../_components/agent/AgentChatScope";
import { useCrmTemplate } from "./useCrmTemplate";
import { CRM_TEMPLATES } from "../_templates/registry";

const NAV_ITEMS: CrmSectionMeta[] = [
  { key: "pipeline", label: "Pipeline", icon: "kanban" },
  { key: "deals", label: "Deals", icon: "briefcase" },
  { key: "leads", label: "Leads", icon: "funnel" },
  { key: "contacts", label: "Contacts", icon: "users" },
  { key: "companies", label: "Companies", icon: "building" },
  { key: "inventory", label: "Inventory", icon: "layers" },
  { key: "boards", label: "Boards", icon: "kanban" },
  { key: "activities", label: "Activities", icon: "clock" },
  { key: "templates", label: "Templates", icon: "mail" },
  { key: "reminders", label: "Reminders", icon: "bell" },
  { key: "territories", label: "Territories", icon: "map" },
  { key: "forms", label: "Forms", icon: "form" },
  { key: "reports", label: "Reports", icon: "chart" },
  { key: "settings", label: "Settings", icon: "lock" },
];

const QUICK_CREATE: { key: string; label: string; section: CrmSection }[] = [
  { key: "contact", label: "New contact", section: "contacts" },
  { key: "company", label: "New company", section: "companies" },
  { key: "deal", label: "New deal", section: "deals" },
  { key: "lead", label: "New lead", section: "leads" },
  { key: "inventory", label: "New inventory item", section: "inventory" },
  { key: "activity", label: "New activity", section: "activities" },
];

const SIDEBAR_WIDTH = 220;
const SIDEBAR_COLLAPSED = 56;
const MOBILE_BREAKPOINT = 720;

type SettingsSub =
  | "template"
  | "custom-fields"
  | "permissions"
  | "saved-views"
  | "lead-sources";

// Tiny inline icon set — same SVG path family as TOOL_ICONS so the shell
// renders without a separate icon registry import. Keeps Phase 1 surface
// minimal; Phase 2 may swap to TOOL_ICONS when it brings full picker UIs.
const ICONS: Record<string, string> = {
  kanban: "M3 4h18v2H3V4zm1 4h4v12H4V8zm6 0h4v8h-4V8zm6 0h4v10h-4V8z",
  briefcase:
    "M10 2h4a2 2 0 012 2v2h4a2 2 0 012 2v11a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h4V4a2 2 0 012-2zm0 4h4V4h-4v2zM4 8v4h16V8H4zm0 6v5h16v-5h-6v2h-4v-2H4z",
  funnel:
    "M3 4h18l-7 9v7l-4-2v-5L3 4zm3.1 2l5 6.5v5l2 1v-6l5-6.5H6.1z",
  users:
    "M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.24-8 5v3h16v-3c0-2.76-3.58-5-8-5z",
  building:
    "M5 3h14v18H5V3zm2 2v3h3V5H7zm5 0v3h3V5h-3zm5 0v3h2V5h-2zM7 10v3h3v-3H7zm5 0v3h3v-3h-3zm5 0v3h2v-3h-2zM7 15v3h3v-3H7zm5 0v3h3v-3h-3zm5 0v3h2v-3h-2z",
  layers:
    "M12 2L2 7l10 5 10-5-10-5zm0 2.2L18.5 7 12 10.3 5.5 7 12 4.2zM2 12l10 5 10-5-2-1-8 4-8-4-2 1zm0 5l10 5 10-5-2-1-8 4-8-4-2 1z",
  clock:
    "M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm1 3h-2v6l4.5 2.7 1-1.6-3.5-2.1V7z",
  chart:
    "M4 20h16v-2H4v2zM6 16h2v-6H6v6zm4 0h2V6h-2v10zm4 0h2v-4h-2v4zm4 0h2V10h-2v6z",
  lock: "M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2v-9a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm0 2a3 3 0 013 3v3H9V7a3 3 0 013-3zM6 12h12v9H6v-9zm6 2a2 2 0 00-1 3.7V20h2v-2.3A2 2 0 0012 14z",
  search:
    "M10 2a8 8 0 105.3 14L21 21.6l1.4-1.4-5.6-5.6A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z",
  plus: "M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z",
  menu: "M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z",
  close:
    "M6.4 4.95L4.95 6.4 10.6 12l-5.65 5.6 1.45 1.45L12 13.4l5.6 5.65 1.45-1.45L13.4 12l5.65-5.6L17.6 4.95 12 10.6 6.4 4.95z",
  user: "M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.24-8 5v3h16v-3c0-2.76-3.58-5-8-5z",
  mail: "M3 5h18a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1zm1 2.4V18h16V7.4l-8 5.6-8-5.6zM4.7 6L12 11l7.3-5H4.7z",
  bell: "M12 2a6 6 0 016 6v3.7l1.7 3.4A1 1 0 0118.8 17H5.2a1 1 0 01-.9-1.4L6 11.7V8a6 6 0 016-6zm0 2a4 4 0 00-4 4v4l-1.4 3h10.8L16 12V8a4 4 0 00-4-4zm-2 15h4a2 2 0 11-4 0z",
  map: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zm2 1.6V19l4-2V5.6l-4 2zm6-2v11.4l4 2V7.6l-4-2zm6 2V19l4-2V5.6l-4 2z",
  form: "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm0 2v14h14V5H5zm2 2h10v2H7V7zm0 4h10v2H7v-2zm0 4h6v2H7v-2z",
};

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const path = ICONS[name] ?? ICONS.menu;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function EmptyState({
  section,
  width,
}: {
  section: CrmSection;
  width: number;
}) {
  const compact = width < MOBILE_BREAKPOINT;
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-app p-6"
      style={{ minHeight: 0 }}
    >
      <div
        className="w-full rounded-xl border border-app bg-app-elevated p-6"
        style={{ maxWidth: compact ? "100%" : 480 }}
      >
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
          crm.{section}
        </div>
        <h2 className="mt-2 text-lg font-semibold text-app">
          Section not wired
        </h2>
        <p className="mt-2 text-sm text-secondary">
          This section has no implementation yet.
        </p>
      </div>
    </div>
  );
}

function WorkspaceRequired({
  section,
  signedIn,
}: {
  section: CrmSection;
  signedIn: boolean;
}) {
  const { loading } = useWorkspace();

  /* The lib's useWorkspace auto-promotes the desktop's active workspace
   * to a team selection on load, so this gate only fires for two narrow
   * cases:
   *   1. Auth is still resolving (signed-out check or list still
   *      loading) — show a quiet placeholder.
   *   2. The user is signed out — show the sign-in prompt. */
  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-app p-6">
        <div className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-faint">
          loading workspace…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-app p-6">
      <div className="w-full max-w-md rounded-xl border border-dashed border-app bg-app-elevated p-6 text-center">
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
          crm.{section}
        </div>
        <h2 className="mt-2 text-lg font-semibold text-app">
          {signedIn ? "Workspace not ready" : "Sign in to use the CRM"}
        </h2>
        <p className="mt-2 text-sm text-secondary">
          {signedIn
            ? "We couldn't load your workspace. Try refreshing the page — if it persists, your account may have lost membership on this workspace."
            : "Sign in to load this workspace's CRM records."}
        </p>
      </div>
    </div>
  );
}

function SettingsSurface({
  sub,
  onSub,
  width,
}: {
  sub: SettingsSub;
  onSub: (s: SettingsSub) => void;
  width: number;
}) {
  const tabs: { key: SettingsSub; label: string }[] = [
    { key: "template", label: "Template" },
    { key: "custom-fields", label: "Custom fields" },
    { key: "lead-sources", label: "Lead sources" },
    { key: "permissions", label: "Permissions" },
    { key: "saved-views", label: "Saved views" },
  ];
  const compact = width < MOBILE_BREAKPOINT;
  return (
    <div className="flex h-full flex-col bg-app">
      <nav
        aria-label="Settings sub-sections"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-app bg-app-elevated px-2 py-1.5"
      >
        {tabs.map((t) => {
          const active = t.key === sub;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onSub(t.key)}
              className={`rounded-md border px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                active
                  ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                  : "border-transparent text-secondary hover:bg-surface hover:text-app"
              }`}
            >
              {compact ? t.label.split(" ")[0] : t.label}
            </button>
          );
        })}
      </nav>
      <div className="min-h-0 flex-1">
        {sub === "template" && <TemplatePicker />}
        {sub === "custom-fields" && <CustomFieldsAdmin />}
        {sub === "lead-sources" && <LeadSourcesAdmin />}
        {sub === "permissions" && <PermissionsAdmin />}
        {sub === "saved-views" && <SavedViewsManager />}
      </div>
    </div>
  );
}

// ── Shell ───────────────────────────────────────────────────────────────

export default function Shell({ width, initialParams, openApp }: NativeAppProps) {
  const initialSection =
    typeof initialParams?.section === "string" &&
    NAV_ITEMS.some((n) => n.key === initialParams.section)
      ? (initialParams.section as CrmSection)
      : "pipeline";
  const [section, setSection] = useState<CrmSection>(initialSection);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [settingsSub, setSettingsSub] = useState<SettingsSub>(() => {
    const sub = initialParams?.settings;
    if (
      sub === "template" ||
      sub === "custom-fields" ||
      sub === "permissions" ||
      sub === "saved-views" ||
      sub === "lead-sources"
    ) {
      return sub;
    }
    return "template";
  });
  const createRef = useRef<HTMLDivElement | null>(null);

  const { current, signedIn } = useWorkspace();
  const workspaceLabel =
    current.kind === "team" ? current.name : "loading…";
  const wsId = current.kind === "team" ? current.id : "";

  /* Section-label overrides driven by the active CRM template. The hook
   * reads `workspace_state[crm:template-id]` and resolves to a sectionLabels
   * map (or undefined when no template is applied). Sidebar nav + view
   * titles read from this so a real-estate workspace shows "Properties"
   * instead of "Inventory" without changing the underlying section keys. */
  const { current: activeTemplateId } = useCrmTemplate(wsId);
  const sectionLabels = activeTemplateId
    ? CRM_TEMPLATES[activeTemplateId]?.sectionLabels ?? null
    : null;
  const labelFor = (key: CrmSection, fallback: string): string =>
    sectionLabels?.[key] ?? fallback;

  /* Pre-warm the cache for a section's main GET endpoint when the user
   * hovers its sidebar nav item. By the time the click fires, the
   * cachedFetch inside the view already has data (or is in flight),
   * making the section transition feel instant. */
  const prefetchSection = (key: CrmSection) => {
    if (!wsId) return;
    switch (key) {
      case "pipeline":
        prefetchUrl(`/api/crm/pipelines?workspace_id=${wsId}`);
        break;
      case "deals":
        prefetchUrl(`/api/crm/deals?workspace_id=${wsId}&limit=200`);
        break;
      case "leads":
        prefetchUrl(`/api/crm/leads?workspace_id=${wsId}&limit=200`);
        break;
      case "contacts":
        prefetchUrl(`/api/crm/contacts?workspace_id=${wsId}&limit=200`);
        break;
      case "companies":
        prefetchUrl(`/api/crm/companies?workspace_id=${wsId}&limit=200`);
        break;
      case "inventory":
        prefetchUrl(`/api/crm/inventory?workspace_id=${wsId}&limit=200`);
        break;
      case "boards":
        prefetchUrl(`/api/crm/boards?workspace_id=${wsId}`);
        break;
      case "activities":
        prefetchUrl(
          `/api/crm/activities/?workspace_id=${wsId}&limit=500`
        );
        break;
      default:
        break;
    }
  };

  const compact = width < MOBILE_BREAKPOINT;

  // Close the create-menu when clicking outside.
  useEffect(() => {
    if (!createOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (createRef.current && !createRef.current.contains(e.target as Node)) {
        setCreateOpen(false);
      }
    };
    window.addEventListener("mousedown", onDocClick);
    return () => window.removeEventListener("mousedown", onDocClick);
  }, [createOpen]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!compact) setDrawerOpen(false);
  }, [compact]);

  const sidebarWidth = compact ? 0 : SIDEBAR_WIDTH;
  const showCollapsedSidebar = !compact && width < 960;
  const effectiveSidebarWidth = showCollapsedSidebar
    ? SIDEBAR_COLLAPSED
    : sidebarWidth;

  const sidebar = useMemo(
    () => (
      <nav
        aria-label="CRM sections"
        className="flex h-full flex-col border-r border-app bg-app-elevated"
        style={{ width: effectiveSidebarWidth || SIDEBAR_WIDTH }}
      >
        <div
          className="flex items-center gap-2 border-b border-app px-3 py-3"
          style={{ minHeight: 48 }}
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-tool-accent bg-tool-accent-soft text-tool-accent">
            <Icon name="briefcase" size={14} />
          </span>
          {!showCollapsedSidebar && (
            <span className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-app">
              CRM
            </span>
          )}
        </div>
        <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => {
            const active = item.key === section;
            const renderedLabel = labelFor(item.key, item.label);
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => {
                    setSection(item.key);
                    if (compact) setDrawerOpen(false);
                  }}
                  onPointerEnter={() => prefetchSection(item.key)}
                  onFocus={() => prefetchSection(item.key)}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                    active
                      ? "border border-tool-accent bg-tool-accent-soft text-tool-accent"
                      : "border border-transparent text-secondary hover:bg-surface hover:text-app"
                  }`}
                  title={renderedLabel}
                >
                  <Icon name={item.icon} size={16} />
                  {!showCollapsedSidebar && (
                    <span className="truncate">{renderedLabel}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-app px-3 py-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
          {!showCollapsedSidebar && <span>Phase 2C · meta layer</span>}
        </div>
      </nav>
    ),
    [
      section,
      compact,
      showCollapsedSidebar,
      effectiveSidebarWidth,
      wsId,
      sectionLabels,
    ]
  );

  return (
    <div
      data-tool-theme="crm"
      data-tool="crm"
      className="flex h-full w-full flex-col overflow-hidden bg-app text-app"
    >
      {/* ── top bar ───────────────────────────────────────────────────── */}
      <header
        className="flex shrink-0 items-center gap-2 border-b border-app bg-app px-3 py-2"
        style={{ minHeight: 48 }}
      >
        {compact && (
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-app text-secondary hover:text-app"
          >
            <Icon name={drawerOpen ? "close" : "menu"} size={16} />
          </button>
        )}

        <span className="rounded-md border border-app bg-app-elevated px-2 py-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-secondary">
          {workspaceLabel}
        </span>

        <div className="relative ml-1 hidden flex-1 items-center md:flex">
          <span
            className="pointer-events-none absolute left-2 text-faint"
            aria-hidden="true"
          >
            <Icon name="search" size={14} />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search across CRM…"
            className="w-full rounded-md border border-app bg-app-elevated py-1.5 pl-7 pr-3 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
          />
        </div>

        {compact && <div className="flex-1" />}

        {wsId && (
          <AgentChatScope
            workspaceId={wsId}
            scope="crm"
            variant="compact"
            title="Ask the CRM assistant"
          />
        )}

        <div className="relative" ref={createRef}>
          <button
            type="button"
            onClick={() => setCreateOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={createOpen}
            className="inline-flex items-center gap-1.5 rounded-md bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] transition-opacity hover:opacity-90"
            style={{ color: "var(--bg)" }}
          >
            <Icon name="plus" size={12} />
            New
          </button>
          {createOpen && (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-md border border-app bg-app-elevated shadow-lg"
            >
              {QUICK_CREATE.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSection(item.section);
                    setCreateOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-secondary hover:bg-surface hover:text-app"
                >
                  <span>{item.label}</span>
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
                    {item.section}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-app bg-app-elevated text-secondary"
          aria-label={signedIn ? "Signed in" : "Signed out"}
          title={signedIn ? "Signed in" : "Signed out"}
        >
          <Icon name="user" size={14} />
        </span>
      </header>

      {/* ── body: sidebar + outlet ───────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {!compact && sidebar}

        {/* Mobile drawer */}
        {compact && drawerOpen && (
          <>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 z-20 bg-black/40"
            />
            <div
              className="absolute left-0 top-0 z-30 h-full"
              style={{ width: SIDEBAR_WIDTH }}
            >
              {sidebar}
            </div>
          </>
        )}

        <main
          className="relative flex-1 overflow-hidden"
          style={{ minWidth: 0 }}
        >
          {(() => {
            const workspaceId = current.kind === "team" ? current.id : "";
            // Every record-driven section needs a team workspace. The
            // settings/reports surfaces are static enough to render even
            // without one, so we exempt them.
            const NEEDS_WORKSPACE = new Set([
              "pipeline","deals","leads","contacts","companies","inventory",
              "boards","activities","templates","reminders","forms",
            ]);
            const hasWorkspace = Boolean(signedIn && workspaceId);
            const showGate = NEEDS_WORKSPACE.has(section) && !hasWorkspace;

            if (showGate) {
              // Active workspace-gated section without a workspace — render
              // ONLY the gate. Don't pre-mount data sections; they have
              // nothing to load yet.
              return <WorkspaceRequired section={section} signedIn={signedIn} />;
            }

            // Render-all-keep-alive pattern: every section mounts on CRM
            // open, fires its own data fetches in parallel, then stays
            // mounted. Tab switches are instant because target sections are
            // already rendered with data — we just toggle visibility.
            //
            // Workspace-gated sections only mount when workspace is set
            // (avoids fetches that would 404 / RLS-block). Settings/reports
            // mount unconditionally.
            const Pane = ({
              active,
              children,
            }: { active: boolean; children: React.ReactNode }) => (
              <div
                className="absolute inset-0 overflow-auto"
                style={{ display: active ? undefined : "none" }}
                aria-hidden={!active}
              >
                {children}
              </div>
            );

            return (
              <>
                {hasWorkspace ? (
                  <>
                    <Pane active={section === "pipeline"}>
                      <PipelineView
                        width={width}
                        search={search}
                        onSearchChange={setSearch}
                      />
                    </Pane>
                    <Pane active={section === "deals"}>
                      <DealsListView
                        width={width}
                        search={search}
                        onSearchChange={setSearch}
                        goToPipeline={() => setSection("pipeline")}
                      />
                    </Pane>
                    <Pane active={section === "leads"}>
                      <LeadsView
                        width={width}
                        search={search}
                        onSearchChange={setSearch}
                      />
                    </Pane>
                    <Pane active={section === "contacts"}>
                      <ContactsView
                        workspaceId={workspaceId}
                        workspaceLabel={workspaceLabel}
                        width={width}
                        openApp={openApp}
                      />
                    </Pane>
                    <Pane active={section === "companies"}>
                      <CompaniesView
                        workspaceId={workspaceId}
                        workspaceLabel={workspaceLabel}
                        width={width}
                        openApp={openApp}
                      />
                    </Pane>
                    <Pane active={section === "inventory"}>
                      <InventoryView
                        workspaceId={workspaceId}
                        workspaceLabel={workspaceLabel}
                        width={width}
                        openApp={openApp}
                      />
                    </Pane>
                    <Pane active={section === "boards"}>
                      <BoardsListView
                        workspaceId={workspaceId}
                        workspaceLabel={workspaceLabel}
                      />
                    </Pane>
                    <Pane active={section === "activities"}>
                      <ActivitiesView />
                    </Pane>
                    <Pane active={section === "templates"}>
                      <TemplatesView
                        workspaceId={workspaceId}
                        workspaceLabel={workspaceLabel}
                        width={width}
                      />
                    </Pane>
                    <Pane active={section === "reminders"}>
                      <RemindersView
                        workspaceId={workspaceId}
                        workspaceLabel={workspaceLabel}
                        width={width}
                      />
                    </Pane>
                    <Pane active={section === "forms"}>
                      <FormBuilderView
                        workspaceId={workspaceId}
                        workspaceLabel={workspaceLabel}
                        width={width}
                      />
                    </Pane>
                  </>
                ) : null}

                {/* Sections that don't require workspace — always mounted. */}
                <Pane active={section === "territories"}>
                  <TerritoriesView width={width} />
                </Pane>
                <Pane active={section === "reports"}>
                  <ReportsView onJump={(s) => setSection(s)} />
                </Pane>
                <Pane active={section === "settings"}>
                  <SettingsSurface
                    sub={settingsSub}
                    onSub={setSettingsSub}
                    width={width}
                  />
                </Pane>

                {/* Fallback for unknown sections */}
                {!NEEDS_WORKSPACE.has(section) &&
                section !== "territories" &&
                section !== "reports" &&
                section !== "settings" ? (
                  <EmptyState section={section} width={width} />
                ) : null}
              </>
            );
          })()}
        </main>
      </div>
    </div>
  );
}
