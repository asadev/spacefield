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

const MOBILE_BREAKPOINT = 720;

type WaTabKey =
  | "connection"
  | "conversations"
  | "groups"
  | "broadcasts"
  | "automation"
  | "lists"
  | "history"
  | "jobs";

interface WaTabMeta {
  key: WaTabKey;
  label: string;
  short: string;
}

const TABS: WaTabMeta[] = [
  { key: "connection", label: "Connection", short: "Connect" },
  { key: "conversations", label: "Conversations", short: "Chats" },
  { key: "broadcasts", label: "Broadcasts", short: "Blast" },
  { key: "automation", label: "Automation", short: "Auto" },
  { key: "groups", label: "Groups", short: "Groups" },
  { key: "lists", label: "Lists", short: "Lists" },
  { key: "history", label: "Send history", short: "History" },
  { key: "jobs", label: "Jobs", short: "Jobs" },
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
    <div className="flex h-full flex-col bg-app">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-app bg-app-elevated px-3 py-2">
        <nav
          aria-label="WhatsApp sections"
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
        >
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-md border px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  active
                    ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                    : "border-transparent text-secondary hover:bg-surface hover:text-app"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {compact ? t.short : t.label}
              </button>
            );
          })}
        </nav>
        {!compact && workspaceName ? (
          <div className="shrink-0 truncate font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
            {workspaceName}
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1">
        {tab === "connection" && (
          <ConnectionTab workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "conversations" && (
          <ConversationsTab workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "broadcasts" && (
          <BroadcastsPanel workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "automation" && (
          <AutomationPanel workspaceId={workspaceId} compact={compact} />
        )}
        {tab === "groups" && (
          <GroupsTab workspaceId={workspaceId} compact={compact} />
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
