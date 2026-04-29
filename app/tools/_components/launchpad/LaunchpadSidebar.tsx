"use client";

/* LaunchpadSidebar — Finder-style left rail.
 *
 * Sections (matches Asad's 2026-04-29 spec):
 *
 *   Workspace   → a single non-clickable header showing the active
 *                 workspace's name + colour dot. Hovering surfaces a
 *                 "Switch" affordance when the user has more than one
 *                 workspace; clicking it fires `onConnect`.
 *
 *   Locations   → Recents · Shared · Home · Applications.
 *
 *   Favorites   → Downloads · Documents · then one row per starred
 *                 file (up to 10). When the user has more than 10
 *                 starred files we show a "Show all favorites" link
 *                 that opens the dedicated `favorites` location.
 *
 * The Tags section from the previous version is gone. Every row in
 * here is wired to a real handler in the parent — no "Coming soon"
 * stubs.
 *
 * Liquid Glass styling: the sidebar has a translucent background +
 * heavy backdrop-blur so the desktop wallpaper bleeds through, plus a
 * 1px specular highlight on the top edge and a soft inner shadow on
 * the right edge for depth.
 */

import { useMemo } from "react";
import {
  type LaunchpadLocation,
  locationKey,
} from "./useLaunchpadView";
import type { Workspace } from "../useWorkspaces";
import {
  fileKind,
  type LaunchpadFile,
  type LaunchpadFileKind,
} from "./launchpadFiles";

interface Props {
  current: LaunchpadLocation;
  onSelect: (loc: LaunchpadLocation) => void;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  /** Opens the workspace switcher — shown via the hover "Switch" pill
   *  on the workspace header when the user has multiple workspaces. */
  onSwitchWorkspace?: () => void;
  /** Starred files for the current workspace. Sorted newest-first by
   *  the parent. */
  favorites: LaunchpadFile[];
  /** Right-click handler for a starred-file row — same shape as the
   *  main pane's. */
  onFavoriteContext: (e: React.MouseEvent, file: LaunchpadFile) => void;
  /** Click handler for a starred-file row — opens via the parent. */
  onFavoriteOpen: (file: LaunchpadFile) => void;
  /** Optional footer slot — used for the storage usage bar. Lives at
   *  the bottom of the sidebar, sticky-anchored. */
  footer?: React.ReactNode;
  /** When true, the sidebar widens its rows + bumps text size so it
   * fits a touch viewport (the Launchpad's mobile drawer). It also
   * fills its parent (no fixed 14rem width — the parent picks the
   * width). Desktop renders a fixed 14rem rail. */
  compact?: boolean;
}

const FAVORITES_INLINE_LIMIT = 10;

export default function LaunchpadSidebar({
  current,
  onSelect,
  workspaces,
  activeWorkspaceId,
  onSwitchWorkspace,
  favorites,
  onFavoriteContext,
  onFavoriteOpen,
  footer,
  compact = false,
}: Props) {
  const currentKey = useMemo(() => locationKey(current), [current]);
  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId]
  );

  const inlineFavorites = favorites.slice(0, FAVORITES_INLINE_LIMIT);
  const hasMoreFavorites = favorites.length > FAVORITES_INLINE_LIMIT;

  return (
    <nav
      aria-label="Launchpad sidebar"
      // Liquid Glass — translucent so the wallpaper bleeds through.
      // Specular highlight is added via the ::before pseudo on the
      // wrapper div below; soft inner shadow on the right edge gives
      // the sidebar a sense of depth.
      //
      // On compact (mobile drawer) we drop the fixed 14rem width so the
      // parent drawer can pick a touch-friendly width, and we lose the
      // backdrop blur (the drawer already sits on a solid panel).
      className={
        compact
          ? "relative flex h-full w-full shrink-0 flex-col border-r border-app/40 bg-app-elevated text-base"
          : "relative flex h-full w-56 shrink-0 flex-col border-r border-app/40 bg-app/40 text-sm backdrop-blur-xl"
      }
      style={
        compact
          ? { paddingTop: "env(safe-area-inset-top, 0px)" }
          : { boxShadow: "inset -1px 0 0 0 rgb(0 0 0 / 0.04)" }
      }
    >
      {/* Top specular highlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.06) 100%)",
        }}
      />
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto py-3">

      {/* Workspace header — non-navigable. Shows the current workspace
       *  name + a tiny colour dot derived from the workspace id. The
       *  hover-only "Switch" button reuses the parent's onConnect. */}
      <Section title="Workspace">
        <WorkspaceHeader
          workspace={activeWorkspace}
          showSwitch={workspaces.length > 1 && Boolean(onSwitchWorkspace)}
          onSwitch={onSwitchWorkspace}
        />
      </Section>

      <Section title="Locations">
        <Row
          icon={<ClockIcon />}
          label="Recents"
          selected={currentKey === "recents"}
          onClick={() => onSelect({ kind: "recents" })}
          compact={compact}
        />
        <Row
          icon={<UsersIcon />}
          label="Shared"
          selected={currentKey === "shared"}
          onClick={() => onSelect({ kind: "shared" })}
          compact={compact}
        />
        <Row
          icon={<TrashIcon />}
          label="Trash"
          selected={currentKey === "trash"}
          onClick={() => onSelect({ kind: "trash" })}
          compact={compact}
        />
        <Row
          icon={<HomeIcon />}
          label="Home"
          selected={currentKey === "home"}
          onClick={() => onSelect({ kind: "home" })}
          compact={compact}
        />
        <Row
          icon={<GridIcon />}
          label="Applications"
          selected={currentKey === "applications"}
          onClick={() => onSelect({ kind: "applications" })}
          compact={compact}
        />
      </Section>

      <Section title="Favorites">
        <Row
          icon={<DownloadIcon />}
          label="Downloads"
          selected={currentKey === "downloads"}
          onClick={() => onSelect({ kind: "downloads" })}
          compact={compact}
        />
        <Row
          icon={<DocIcon />}
          label="Documents"
          selected={currentKey === "documents"}
          onClick={() => onSelect({ kind: "documents" })}
          compact={compact}
        />

        {inlineFavorites.map((f) => (
          <Row
            key={f.id}
            icon={<KindMiniGlyph kind={fileKind(f)} />}
            label={f.name}
            selected={currentKey === `favorite-file:${f.id}`}
            onClick={() => onFavoriteOpen(f)}
            onContextMenu={(e) => onFavoriteContext(e, f)}
            compact={compact}
          />
        ))}

        {hasMoreFavorites && (
          <button
            type="button"
            onClick={() => onSelect({ kind: "favorites" })}
            aria-current={currentKey === "favorites" ? "page" : undefined}
            className={
              "mx-1 flex items-center gap-2 rounded-md text-left transition-colors " +
              (compact
                ? "px-3 py-2.5 text-[14px] "
                : "px-2 py-1 text-[12px] ") +
              (currentKey === "favorites"
                ? "bg-tool-accent text-white shadow-sm"
                : "text-secondary hover:bg-surface hover:text-app")
            }
          >
            <span
              className={
                "flex h-4 w-4 items-center justify-center " +
                (currentKey === "favorites" ? "text-white" : "")
              }
            >
              <StarIcon />
            </span>
            <span className="truncate flex-1">Show all favorites</span>
            <span
              className={
                "text-[10px] " +
                (currentKey === "favorites"
                  ? "text-white/80"
                  : "text-muted")
              }
            >
              {favorites.length}
            </span>
          </button>
        )}
      </Section>
      </div>
      {footer && <div className="shrink-0">{footer}</div>}
    </nav>
  );
}

/* --- Workspace header ---------------------------------------------- */

function workspaceColor(id: string): string {
  // Hash the id to a hue; saturation/light kept gentle so the dot fits
  // the rest of the chrome. Stable across loads because it's pure.
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 60% 55%)`;
}

function WorkspaceHeader({
  workspace,
  showSwitch,
  onSwitch,
}: {
  workspace: Workspace | null;
  showSwitch: boolean;
  onSwitch?: () => void;
}) {
  if (!workspace) {
    return (
      <div className="mx-1 px-2 py-1 text-[12px] text-muted">No workspace</div>
    );
  }
  const dot = workspaceColor(workspace.id);
  return (
    <div
      className="group relative mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-app"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
        boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.06)",
      }}
    >
      <span
        aria-hidden="true"
        className="block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
        style={{ background: dot }}
      />
      <span className="truncate flex-1 font-medium">{workspace.name}</span>
      {showSwitch && onSwitch && (
        <button
          type="button"
          onClick={onSwitch}
          title="Switch workspace"
          className="rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-secondary opacity-0 transition-opacity hover:text-app group-hover:opacity-100 focus:opacity-100"
        >
          Switch
        </button>
      )}
    </div>
  );
}

/* --- Section + Row primitives -------------------------------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="mx-1 mb-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted"
        style={{
          // Tiny inset glass tint — visible only over a wallpaper.
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 100%)",
        }}
      >
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
  onClick,
  onContextMenu,
  compact = false,
}: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  badge?: string;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  compact?: boolean;
}) {
  /* Selected state styling.
   *
   * Earlier iterations relied on Tailwind's arbitrary parent-selector
   * variant `[.bg-tool-accent_&]:text-white` to flip the icon + badge
   * colors when the row was selected. That variant doesn't resolve
   * reliably under Tailwind v4 — symptom: on a selected row, the icon
   * stayed `text-secondary` (a low-contrast gray) on the violet
   * `bg-tool-accent` background, making the row's icon look
   * invisible. Switching to explicit conditional classes pegged to
   * the `selected` prop makes the contrast loud and obvious. */
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-current={selected ? "page" : undefined}
      className={
        "mx-1 flex items-center gap-2 rounded-md text-left transition-colors " +
        (compact
          ? "px-3 py-2.5 text-[15px] "
          : "px-2 py-1 text-[13px] ") +
        (selected
          ? "bg-tool-accent text-white shadow-sm"
          : "text-app hover:bg-surface")
      }
    >
      <span
        className={
          "flex items-center justify-center " +
          (selected ? "text-white " : "text-secondary ") +
          (compact ? "h-5 w-5" : "h-4 w-4")
        }
      >
        {icon}
      </span>
      <span className="truncate flex-1">{label}</span>
      {badge && (
        <span
          className={
            "rounded px-1.5 text-[10px] uppercase tracking-wide " +
            (selected
              ? "bg-white/25 text-white"
              : "bg-surface text-muted")
          }
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/* --- Icons ---------------------------------------------------------- */

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
function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
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
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <path d="M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l2.9 6 6.6.8-4.8 4.6 1.2 6.6L12 17.8 6.1 21l1.2-6.6L2.5 9.8 9.1 9z" />
    </svg>
  );
}

/* Small per-kind glyph used by the inline favorite rows. */
function KindMiniGlyph({ kind }: { kind: LaunchpadFileKind }) {
  const path =
    kind === "document"
      ? "M7 3h7l4 4v14H7z"
      : kind === "sheet"
        ? "M4 5h16v14H4z M4 10h16 M4 15h16 M9 5v14 M14 5v14"
        : kind === "image"
          ? "M4 5h16v14H4z M4 16l4-4 3 3 5-5 4 4"
          : kind === "video"
            ? "M4 5h12v14H4z M16 9l4-2v10l-4-2z"
            : kind === "audio"
              ? "M9 18V6l10-2v12"
              : kind === "archive"
                ? "M4 5h16v14H4z M12 5v14"
                : "M7 3h10l3 3v15H7z";
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
