"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   WhatsApp — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Multi-tenant Evolution-gateway frontend. Gates on:
    • signed-in user
    • a "team" workspace (Evolution instances are workspace-scoped)
    • the `whatsapp` app being enabled on this workspace (Pro-tier feature
      registered by Agent A's app_registry seed). When the gate fails the
      shell shows an upgrade CTA — never crashes.

   Layout
   ──────
    ┌────────────────────────────────────────────────────────┐
    │ Tabs: Connection · Conversations · Groups · Lists ···  │
    ├────────────────────────────────────────────────────────┤
    │                                                        │
    │             selected tab outlet                        │
    │                                                        │
    └────────────────────────────────────────────────────────┘
   Mobile (<720px): tabs become a horizontal scroll strip.
═══════════════════════════════════════════════════════════════════════════ */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspaces/client";
import type { NativeAppProps } from "../_data/tools-list";
import ConnectionTab from "./_components/ConnectionTab";
import ConversationsTab from "./_components/ConversationsTab";
import GroupsTab from "./_components/GroupsTab";
import ListsTab from "./_components/ListsTab";
import SendHistoryTab from "./_components/SendHistoryTab";
import JobsTab from "./_components/JobsTab";
import WhatsAppGate from "./_components/WhatsAppGate";

// Wave-3 panels are lazy-loaded so the heavier broadcast composer / segment
// builder / automation editors stay out of the initial WhatsApp chunk and the
// webpack compile stays under Vercel's 8GB build ceiling (OOM guard).
const PanelLoading = () => (
  <div className="flex h-full w-full items-center justify-center bg-app">
    <div className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-faint">
      loading…
    </div>
  </div>
);
const BroadcastsPanel = dynamic(() => import("./_components/BroadcastsPanel"), {
  ssr: false,
  loading: PanelLoading,
});
const AutomationPanel = dynamic(() => import("./_components/AutomationPanel"), {
  ssr: false,
  loading: PanelLoading,
});
// Wave-4 panels — also lazy so the analytics dashboards / macros editor stay
// out of the initial chunk (Vercel 8GB build-OOM guard).
const AnalyticsPanel = dynamic(() => import("./_components/AnalyticsPanel"), {
  ssr: false,
  loading: PanelLoading,
});
const MacrosPanel = dynamic(() => import("./_components/MacrosPanel"), {
  ssr: false,
  loading: PanelLoading,
});
const SearchPanel = dynamic(() => import("./_components/SearchPanel"), {
  ssr: false,
  loading: PanelLoading,
});
// Wave-5 panels — all lazy (rare/heavy; protects the 8GB build ceiling).
const WorkflowsPanel = dynamic(() => import("./_components/WorkflowsPanel"), {
  ssr: false,
  loading: PanelLoading,
});
const ProductsPanel = dynamic(() => import("./_components/ProductsPanel"), {
  ssr: false,
  loading: PanelLoading,
});
const StatusPanel = dynamic(() => import("./_components/StatusPanel"), {
  ssr: false,
  loading: PanelLoading,
});
const TeamPanel = dynamic(() => import("./_components/TeamPanel"), {
  ssr: false,
  loading: PanelLoading,
});
// Bell is light but client-only; lazy keeps it off SSR.
const NotificationBell = dynamic(() => import("./_components/NotificationBell"), {
  ssr: false,
});

const MOBILE_BREAKPOINT = 720;

type WaTabKey =
  | "connection"
  | "conversations"
  | "search"
  | "groups"
  | "broadcasts"
  | "automation"
  | "workflows"
  | "products"
  | "status"
  | "team"
  | "macros"
  | "analytics"
  | "lists"
  | "history"
  | "jobs";

interface WaTabMeta {
  key: WaTabKey;
  label: string;
}

const TABS: WaTabMeta[] = [
  { key: "connection", label: "Connection" },
  { key: "conversations", label: "Conversations" },
  { key: "search", label: "Search" },
  { key: "groups", label: "Groups" },
  { key: "broadcasts", label: "Broadcasts" },
  { key: "automation", label: "Automation" },
  { key: "workflows", label: "Workflows" },
  { key: "status", label: "Status" },
  { key: "products", label: "Products" },
  { key: "macros", label: "Macros" },
  { key: "analytics", label: "Analytics" },
  { key: "lists", label: "Lists" },
  { key: "history", label: "Send history" },
  { key: "jobs", label: "Jobs" },
  { key: "team", label: "Team" },
];

const TAB_BY_KEY: Record<WaTabKey, WaTabMeta> = TABS.reduce(
  (acc, t) => {
    acc[t.key] = t;
    return acc;
  },
  {} as Record<WaTabKey, WaTabMeta>,
);

// Left-sidebar groupings (purely cosmetic — every tab still ships).
const TAB_GROUPS: Array<{ heading: string; keys: WaTabKey[] }> = [
  {
    heading: "Inbox",
    keys: ["connection", "conversations", "search", "groups"],
  },
  {
    heading: "Outreach",
    keys: ["broadcasts", "automation", "workflows", "status"],
  },
  { heading: "Catalog", keys: ["products", "macros"] },
  {
    heading: "Insights",
    keys: ["analytics", "lists", "history", "jobs", "team"],
  },
];

export default function WhatsAppApp({ width, initialParams }: NativeAppProps) {
  const initialTab = useMemo<WaTabKey>(() => {
    const raw = initialParams?.tab;
    if (typeof raw === "string" && TABS.some((t) => t.key === raw)) {
      return raw as WaTabKey;
    }
    return "connection";
  }, [initialParams]);

  const [tab, setTab] = useState<WaTabKey>(initialTab);
  const { current, signedIn, loading } = useWorkspace();
  const workspaceId = current.kind === "team" ? current.id : "";
  const workspaceName = current.kind === "team" ? current.name : "";
  const compact = width < MOBILE_BREAKPOINT;

  // Re-sync tab when openApp pushes a new initialParamsKey
  useEffect(() => {
    if (initialTab !== tab) setTab(initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-app p-6">
        <div className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-faint">
          loading workspace…
        </div>
      </div>
    );
  }

  if (!signedIn || !workspaceId) {
    return (
      <WhatsAppGate
        reason={signedIn ? "no-workspace" : "signed-out"}
        compact={compact}
      />
    );
  }

  return (
    <div className="wa-shell flex h-full flex-row bg-app">
      <aside
        className={`flex shrink-0 flex-col overflow-y-auto border-r border-app bg-app-elevated ${
          compact ? "w-40" : "w-48"
        }`}
        aria-label="WhatsApp sections"
      >
        {/* workspace header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-app px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-app">
            {workspaceName || "WhatsApp"}
          </span>
          <NotificationBell />
        </div>

        {/* vertical tab nav */}
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 p-2">
          {TAB_GROUPS.map((group) => (
            <div key={group.heading} className="mb-1">
              <div className="px-3 pb-1 pt-2 text-[0.6rem] font-medium uppercase tracking-[0.14em] text-faint">
                {group.heading}
              </div>
              {group.keys.map((key) => {
                const meta = TAB_BY_KEY[key];
                const active = key === tab;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                      active
                        ? "bg-tool-accent-soft font-medium text-tool-accent"
                        : "text-secondary hover:bg-surface hover:text-app"
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "connection" && (
          <ConnectionTab workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "conversations" && (
          <ConversationsTab workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "search" && (
          <SearchPanel workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "broadcasts" && (
          <BroadcastsPanel workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "automation" && (
          <AutomationPanel workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "workflows" && (
          <WorkflowsPanel workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "products" && (
          <ProductsPanel workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "status" && (
          <StatusPanel workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "macros" && (
          <MacrosPanel workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "groups" && (
          <GroupsTab workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "team" && (
          <TeamPanel workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "analytics" && (
          <AnalyticsPanel workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "lists" && (
          <ListsTab workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "history" && (
          <SendHistoryTab workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "jobs" && (
          <JobsTab workspaceId={workspaceId} compact={compact} />
        )}
      </div>
    </div>
  );
}
