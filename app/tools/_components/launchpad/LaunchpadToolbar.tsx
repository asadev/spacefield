"use client";

/* LaunchpadToolbar — the row beneath the title bar.
 *
 * Layout (left → right):
 *   ◀ ▶ history arrows · centered title · Preview · Connect · View pill ·
 *   Group · Share · Action (…) · Search field
 *
 * Every control here is wired to real behavior. The Group / Share /
 * Action buttons trigger callbacks the parent uses to open menus, copy
 * a link to the clipboard, run a refresh, etc.
 */

import { forwardRef } from "react";
import type {
  LaunchpadGroupMode,
  LaunchpadViewMode,
} from "./useLaunchpadView";

interface Props {
  title: string;
  query: string;
  onQuery: (q: string) => void;
  searchInputRef?: React.Ref<HTMLInputElement>;

  view: LaunchpadViewMode;
  onView: (v: LaunchpadViewMode) => void;

  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;

  previewOpen: boolean;
  onTogglePreview: () => void;
  onConnect: () => void;
  /** Optional Upload button — shown when a workspace pane (Home /
   * Downloads / Documents / Favorites) is active. Hidden when no
   * workspace context exists or the active location is Applications. */
  onUpload?: () => void;

  group: LaunchpadGroupMode;
  groupMenuOpen: boolean;
  onToggleGroupMenu: () => void;
  onShare: () => void;
  actionMenuOpen: boolean;
  onToggleActionMenu: () => void;
  /** Optional slot rendered between Action menu and the search field
   *  — used to host the per-app AI assistant button. */
  aiSlot?: React.ReactNode;

  /* Mobile-only props ------------------------------------------------ */
  /** When true, the toolbar collapses to a compact mobile layout: back
   * button + title + view toggle + search/menu icons. Group, Action,
   * Share, Connect, Preview, Upload, and the persistent search field
   * are hidden — they live in the drawer or the action sheet on
   * mobile. */
  compact?: boolean;
  /** Mobile back button — closes the Launchpad and returns to the
   * MobileShell home screen. */
  onCloseMobile?: () => void;
  /** Toggles the mobile drawer that hosts the sidebar. */
  onToggleMobileMenu?: () => void;
  mobileMenuOpen?: boolean;
  /** When true, the mobile toolbar swaps the title row for an inline
   * full-width search field. Tapping the search icon flips this. */
  mobileSearchOpen?: boolean;
  onToggleMobileSearch?: () => void;
}

export default function LaunchpadToolbar({
  title,
  query,
  onQuery,
  searchInputRef,
  view,
  onView,
  canBack,
  canForward,
  onBack,
  onForward,
  previewOpen,
  onTogglePreview,
  onConnect,
  onUpload,
  group,
  groupMenuOpen,
  onToggleGroupMenu,
  onShare,
  actionMenuOpen,
  onToggleActionMenu,
  aiSlot,
  compact = false,
  onCloseMobile,
  onToggleMobileMenu,
  mobileMenuOpen = false,
  mobileSearchOpen = false,
  onToggleMobileSearch,
}: Props) {
  if (compact) {
    return (
      <div
        data-no-drag
        // Safe-area top padding lets the toolbar clear the notch on
        // mobile devices that report a non-zero env(safe-area-inset-top).
        className="relative flex h-14 shrink-0 items-center gap-1 border-b border-app/50 bg-app-elevated px-2"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        {mobileSearchOpen ? (
          <>
            <ToolbarBtn
              aria-label="Close search"
              onClick={() => {
                onQuery("");
                onToggleMobileSearch?.();
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5" />
                <path d="M12 5l-7 7 7 7" />
              </svg>
            </ToolbarBtn>
            <div className="relative flex-1">
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <SearchInput
                ref={searchInputRef}
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                className="h-9 w-full rounded-md border border-app bg-app pl-7 pr-2 text-[14px] text-app placeholder:text-muted focus:border-tool-accent focus:outline-none"
              />
            </div>
          </>
        ) : (
          <>
            {/* Back / close-Launchpad — returns to the MobileShell home. */}
            <ToolbarBtn
              aria-label="Close"
              onClick={onCloseMobile}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5" />
                <path d="M12 5l-7 7 7 7" />
              </svg>
            </ToolbarBtn>

            {/* Hamburger toggles the sidebar drawer. */}
            <ToolbarBtn
              aria-label={mobileMenuOpen ? "Hide menu" : "Show menu"}
              onClick={onToggleMobileMenu}
              active={mobileMenuOpen}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </ToolbarBtn>

            <div className="ml-1 flex-1 truncate text-[15px] font-semibold text-app">
              {title}
            </div>

            {/* Compact 2-segment view toggle — Icon vs List. Column /
             * Gallery don't make sense on a 375px viewport. If the
             * persisted view is column or gallery we still render
             * Icon/List as the only options; the view stays whatever
             * the user picked. */}
            <div
              className="flex items-center overflow-hidden rounded-md border border-app bg-app text-secondary"
              role="group"
              aria-label="View"
            >
              <ViewSegment active={view === "icon"} onClick={() => onView("icon")} aria-label="Icon view">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </ViewSegment>
              <ViewSegment active={view === "list"} onClick={() => onView("list")} aria-label="List view">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </ViewSegment>
            </div>

            {/* Search — taps swap the toolbar for a full-width input. */}
            <ToolbarBtn aria-label="Search" onClick={onToggleMobileSearch}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </ToolbarBtn>

            {/* Upload — only when the active location accepts uploads. */}
            {onUpload && (
              <ToolbarBtn aria-label="Upload" onClick={onUpload}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 19V5" />
                  <path d="M5 12l7-7 7 7" />
                  <path d="M5 21h14" />
                </svg>
              </ToolbarBtn>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div
      data-no-drag
      // Liquid Glass — slightly more opaque than the body so buttons
      // stay legible while wallpaper still bleeds through.
      className="relative flex h-12 items-center gap-2 border-b border-app/50 bg-app-elevated/70 px-3 backdrop-blur-2xl"
    >
      {/* Specular highlight on the toolbar's top edge */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.06) 100%)",
        }}
      />
      {/* Back / Forward */}
      <div className="flex items-center gap-0.5">
        <ToolbarBtn aria-label="Back" disabled={!canBack} onClick={onBack}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </ToolbarBtn>
        <ToolbarBtn aria-label="Forward" disabled={!canForward} onClick={onForward}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </ToolbarBtn>
      </div>

      {/* Centered title */}
      <div className="ml-2 flex-1 truncate text-[13px] font-semibold text-app">
        {title}
      </div>

      {/* Preview toggle */}
      <ToolbarBtn
        aria-label={previewOpen ? "Hide preview" : "Show preview"}
        title={previewOpen ? "Hide preview" : "Show preview"}
        onClick={onTogglePreview}
        active={previewOpen}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M15 4v16" />
        </svg>
      </ToolbarBtn>

      {/* Connect → opens workspace switcher */}
      <ToolbarBtn aria-label="Connect" title="Switch workspace" onClick={onConnect}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="12" r="3" />
          <path d="M9 12h6" />
        </svg>
      </ToolbarBtn>

      {/* Upload — only available when a workspace file pane is active */}
      {onUpload && (
        <ToolbarBtn aria-label="Upload" title="Upload files" onClick={onUpload}>
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 19V5" />
            <path d="M5 12l7-7 7 7" />
            <path d="M5 21h14" />
          </svg>
        </ToolbarBtn>
      )}

      {/* View pill — 4 segments */}
      <div
        className="flex items-center gap-0 overflow-hidden rounded-md border border-app bg-app text-secondary"
        role="group"
        aria-label="View"
      >
        <ViewSegment active={view === "icon"} onClick={() => onView("icon")} aria-label="Icon view">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </ViewSegment>
        <ViewSegment active={view === "list"} onClick={() => onView("list")} aria-label="List view">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </ViewSegment>
        <ViewSegment active={view === "column"} onClick={() => onView("column")} aria-label="Column view">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
            <rect x="3" y="3" width="5" height="18" rx="1" />
            <rect x="10" y="3" width="5" height="18" rx="1" />
            <rect x="17" y="3" width="4" height="18" rx="1" />
          </svg>
        </ViewSegment>
        <ViewSegment active={view === "gallery"} onClick={() => onView("gallery")} aria-label="Gallery view">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="6" y="4" width="12" height="11" rx="1" />
            <rect x="3" y="17" width="4" height="3" rx="0.5" />
            <rect x="10" y="17" width="4" height="3" rx="0.5" />
            <rect x="17" y="17" width="4" height="3" rx="0.5" />
          </svg>
        </ViewSegment>
      </div>

      {/* Group menu trigger */}
      <ToolbarBtn
        aria-label="Group"
        aria-haspopup="menu"
        aria-expanded={groupMenuOpen}
        title={group === "none" ? "Group by…" : `Grouped by ${group}`}
        onClick={onToggleGroupMenu}
        active={groupMenuOpen || group !== "none"}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="4" width="7" height="7" rx="1" />
          <rect x="13" y="4" width="7" height="7" rx="1" />
          <rect x="4" y="13" width="16" height="7" rx="1" />
        </svg>
      </ToolbarBtn>

      {/* Share */}
      <ToolbarBtn aria-label="Share" title="Share Spacefield link" onClick={onShare}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12" />
          <path d="M8 7l4-4 4 4" />
          <path d="M5 14v5h14v-5" />
        </svg>
      </ToolbarBtn>

      {/* Action menu */}
      <ToolbarBtn
        aria-label="Action"
        aria-haspopup="menu"
        aria-expanded={actionMenuOpen}
        title="More"
        onClick={onToggleActionMenu}
        active={actionMenuOpen}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
          <circle cx="6" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="18" cy="12" r="1.5" />
        </svg>
      </ToolbarBtn>

      {aiSlot}

      {/* Search */}
      <div className="relative ml-1">
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <SearchInput
          ref={searchInputRef}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
    </div>
  );
}

interface ToolbarBtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

function ToolbarBtn({ active, className, children, ...rest }: ToolbarBtnProps) {
  const base =
    "flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const tone = active
    ? "bg-tool-accent-soft text-tool-accent"
    : "hover:bg-surface hover:text-app";
  return (
    <button type="button" className={`${base} ${tone} ${className ?? ""}`} {...rest}>
      {children}
    </button>
  );
}

function ViewSegment({
  active,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      className={
        "flex h-7 w-8 items-center justify-center transition-colors " +
        (active
          ? "bg-tool-accent text-white"
          : "text-secondary hover:bg-surface hover:text-app")
      }
      {...rest}
    >
      {children}
    </button>
  );
}

const SearchInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function SearchInput(props, ref) {
  return (
    <input
      ref={ref}
      type="text"
      placeholder="Search"
      className="h-7 w-44 rounded-md border border-app bg-app pl-7 pr-2 text-[12px] text-app placeholder:text-muted focus:outline-none focus:border-tool-accent"
      {...props}
    />
  );
});
