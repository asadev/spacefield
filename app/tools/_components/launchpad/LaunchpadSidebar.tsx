"use client";

/* LaunchpadSidebar — Finder-style left rail.
 *
 * Sections:
 *   Recents     → top, flat list (Recents, Shared)
 *   Locations   → workspaces (one row per team workspace)
 *   Favorites   → Applications (default), Downloads, Documents, Desktop
 *   Tags        → static colored dots for v1 (Red / Orange / ...)
 *
 * Selection state is driven from the parent — clicking a row calls
 * `onSelect(loc)` and the parent updates `useLaunchpadView`'s history.
 */

import { useMemo } from "react";
import {
  type LaunchpadLocation,
  locationKey,
} from "./useLaunchpadView";
import type { Workspace } from "../useWorkspaces";

const TAGS: Array<{ id: string; label: string; color: string }> = [
  { id: "red", label: "Red", color: "#ff5f57" },
  { id: "orange", label: "Orange", color: "#ff9f0a" },
  { id: "yellow", label: "Yellow", color: "#ffd60a" },
  { id: "green", label: "Green", color: "#30d158" },
  { id: "blue", label: "Blue", color: "#0a84ff" },
  { id: "purple", label: "Purple", color: "#bf5af2" },
  { id: "gray", label: "Gray", color: "#8e8e93" },
];

interface Props {
  current: LaunchpadLocation;
  onSelect: (loc: LaunchpadLocation) => void;
  workspaces: Workspace[];
  activeWorkspaceId: string;
}

export default function LaunchpadSidebar({
  current,
  onSelect,
  workspaces,
  activeWorkspaceId,
}: Props) {
  const currentKey = useMemo(() => locationKey(current), [current]);

  return (
    <nav
      aria-label="Launchpad sidebar"
      className="flex h-full w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r border-app bg-app py-3 text-sm"
    >
      {/* Recents */}
      <Section title="Favorites">
        <Row
          icon={<ClockIcon />}
          label="Recents"
          selected={currentKey === "recents"}
          onClick={() => onSelect({ kind: "recents" })}
        />
        <Row
          icon={<UsersIcon />}
          label="Shared"
          selected={currentKey === "shared"}
          onClick={() => onSelect({ kind: "shared" })}
          comingSoon
        />
        <Row
          icon={<GridIcon />}
          label="Applications"
          selected={currentKey === "applications"}
          onClick={() => onSelect({ kind: "applications" })}
        />
        <Row
          icon={<DownloadIcon />}
          label="Downloads"
          selected={currentKey === "downloads"}
          onClick={() => onSelect({ kind: "downloads" })}
          comingSoon
        />
        <Row
          icon={<DocIcon />}
          label="Documents"
          selected={currentKey === "documents"}
          onClick={() => onSelect({ kind: "documents" })}
          comingSoon
        />
        <Row
          icon={<DesktopIcon />}
          label="Desktop"
          selected={currentKey === "desktop"}
          onClick={() => onSelect({ kind: "desktop" })}
        />
      </Section>

      {/* Locations — workspaces */}
      <Section title="Locations">
        {workspaces.length === 0 ? (
          <div className="px-3 py-1 text-xs text-muted">No workspaces</div>
        ) : (
          workspaces.map((w) => (
            <Row
              key={w.id}
              icon={<DiskIcon />}
              label={w.name}
              selected={currentKey === `workspace:${w.id}`}
              badge={w.id === activeWorkspaceId ? "Active" : undefined}
              onClick={() => onSelect({ kind: "workspace", id: w.id })}
            />
          ))
        )}
      </Section>

      {/* Tags */}
      <Section title="Tags">
        {TAGS.map((t) => (
          <Row
            key={t.id}
            icon={
              <span
                aria-hidden="true"
                className="block h-3 w-3 rounded-full"
                style={{ background: t.color }}
              />
            }
            label={t.label}
            selected={currentKey === `tag:${t.id}`}
            onClick={() => onSelect({ kind: "tag", id: t.id })}
            comingSoon
          />
        ))}
      </Section>
    </nav>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
        {title}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function Row({
  icon,
  label,
  selected,
  badge,
  comingSoon,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  badge?: string;
  comingSoon?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={comingSoon ? "Coming soon" : undefined}
      className={
        "mx-1 flex items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors " +
        (selected
          ? "bg-tool-accent text-white"
          : "text-app hover:bg-surface")
      }
    >
      <span className="flex h-4 w-4 items-center justify-center text-secondary [.bg-tool-accent_&]:text-white">
        {icon}
      </span>
      <span className="truncate flex-1">{label}</span>
      {badge && (
        <span className="rounded bg-surface px-1.5 text-[10px] uppercase tracking-wide text-muted [.bg-tool-accent_&]:bg-white/20 [.bg-tool-accent_&]:text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

/* Icons — tiny inline SVGs so we don't drag in another dep. Stroked, 16px,
 * `currentColor` so the selected-row white text propagates. */

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3 3-5 6-5s6 2 6 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15 20c0-2.4 2-4 4-4" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
    </svg>
  );
}
function DesktopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M9 21h6M12 17v4" />
    </svg>
  );
}
function DiskIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="8" ry="2.5" />
      <path d="M4 6v12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V6" />
      <path d="M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5" />
    </svg>
  );
}
