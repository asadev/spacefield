import Link from "next/link";

/**
 * Tab strip for the per-workspace admin page. Tabs are URL-driven
 * (?tab=…) so RSC re-renders on switch — no client state, no flicker.
 *
 * The "active" pill matches the same ring + accent treatment used in
 * other admin areas (audit, apps, agents).
 */

export type WorkspaceTabId =
  | "profile"
  | "members"
  | "tier"
  | "apps"
  | "domains"
  | "agents"
  | "activity";

export const WORKSPACE_TABS: ReadonlyArray<{
  id: WorkspaceTabId;
  label: string;
}> = [
  { id: "profile", label: "Profile" },
  { id: "members", label: "Members" },
  { id: "tier", label: "Tier & storage" },
  { id: "apps", label: "Apps & Features" },
  { id: "domains", label: "Domains" },
  { id: "agents", label: "Agents" },
  { id: "activity", label: "Activity" },
];

export function isTabId(value: string | undefined): value is WorkspaceTabId {
  return WORKSPACE_TABS.some((t) => t.id === value);
}

export function pickTab(value: string | undefined): WorkspaceTabId {
  return isTabId(value) ? value : "profile";
}

export function WorkspaceTabs({
  workspaceId,
  active,
}: {
  workspaceId: string;
  active: WorkspaceTabId;
}) {
  return (
    <nav
      role="tablist"
      aria-label="Workspace sections"
      className="flex flex-wrap items-center gap-1 rounded-xl border border-app bg-app-elevated p-1"
    >
      {WORKSPACE_TABS.map((t) => {
        const href =
          t.id === "profile"
            ? `/admin/workspaces/${workspaceId}`
            : `/admin/workspaces/${workspaceId}?tab=${t.id}`;
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={
              isActive
                ? "rounded-lg bg-tool-accent-soft px-3 py-1.5 text-xs font-medium text-tool-accent"
                : "rounded-lg px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-app hover:text-app"
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/* ─────────────────────── small reusable bits ─────────────────────── */

/** Standard "no rows" placeholder we use across tabs. */
export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-muted">
      {children}
    </div>
  );
}

/** Pretty wrapper for the "section card" boxes inside tabs. */
export function SectionCard({
  title,
  hint,
  right,
  children,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-app bg-app-elevated p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-app">{title}</h2>
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        </div>
        {right}
      </header>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* ─────────────────────── shared types ─────────────────────── */

export const PERMISSION_MODES = ["allow", "confirm", "deny"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const VOICE_TONES = [
  "friendly",
  "formal",
  "casual",
  "direct",
  "playful",
] as const;
export type VoiceTone = (typeof VOICE_TONES)[number];

/** Skill catalog mirror — hard-coded list of every skill id that exists in
 *  lib/agent/skills/index.ts. The agent_permissions matrix renders one
 *  row per id. Keep this in sync with ALL_SKILLS. */
export const ALL_SKILL_IDS: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
}> = [
  {
    id: "workspace",
    label: "Workspace",
    description: "Members, settings, branding lookups.",
  },
  {
    id: "crm.contacts",
    label: "CRM Contacts",
    description: "Search, create, update people.",
  },
  {
    id: "crm.companies",
    label: "CRM Companies",
    description: "Search, create, update companies.",
  },
  {
    id: "crm.deals",
    label: "CRM Deals",
    description: "Pipeline reads + writes.",
  },
  {
    id: "crm.leads",
    label: "CRM Leads",
    description: "Inbound lead triage.",
  },
  {
    id: "crm.activities",
    label: "CRM Activities",
    description: "Tasks, notes, calls, emails on records.",
  },
  {
    id: "files",
    label: "Files",
    description: "Search, rename, soft-delete files.",
  },
  {
    id: "boards",
    label: "Boards",
    description: "Kanban + tasks across boards.",
  },
  {
    id: "apps",
    label: "Apps",
    description: "List + install/uninstall apps in the workspace.",
  },
  {
    id: "meta",
    label: "Meta",
    description: "Help, balance, capabilities (always 'allow').",
  },
];
