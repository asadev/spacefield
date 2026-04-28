"use client";

/* LaunchpadToolbar — the row beneath the title bar.
 *
 * Layout (left → right):
 *   ◀ ▶ history arrows · centered title · Preview · Connect · View pill ·
 *   Group · Share · Action (…) · Search field
 *
 * Most right-side affordances are visual-only stubs for v1 (Group / Share
 * / Action). They're styled like Finder's so the window reads correctly,
 * but clicking them surfaces a friendly "coming soon" tooltip. The View
 * pill and Preview / Connect / Search are wired to real behavior.
 */

import type { LaunchpadViewMode } from "./useLaunchpadView";

interface Props {
  title: string;
  query: string;
  onQuery: (q: string) => void;

  view: LaunchpadViewMode;
  onView: (v: LaunchpadViewMode) => void;

  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;

  previewOpen: boolean;
  onTogglePreview: () => void;
  onConnect: () => void;
}

export default function LaunchpadToolbar({
  title,
  query,
  onQuery,
  view,
  onView,
  canBack,
  canForward,
  onBack,
  onForward,
  previewOpen,
  onTogglePreview,
  onConnect,
}: Props) {
  return (
    <div
      data-no-drag
      className="flex h-12 items-center gap-2 border-b border-app bg-app-elevated px-3"
    >
      {/* Back / Forward */}
      <div className="flex items-center gap-0.5">
        <ToolbarBtn
          aria-label="Back"
          disabled={!canBack}
          onClick={onBack}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </ToolbarBtn>
        <ToolbarBtn
          aria-label="Forward"
          disabled={!canForward}
          onClick={onForward}
        >
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

      {/* View pill — 4 segments */}
      <div
        className="flex items-center gap-0 overflow-hidden rounded-md border border-app bg-app text-secondary"
        role="group"
        aria-label="View"
      >
        <ViewSegment
          active={view === "icon"}
          onClick={() => onView("icon")}
          aria-label="Icon view"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </ViewSegment>
        <ViewSegment
          active={view === "list"}
          onClick={() => onView("list")}
          aria-label="List view"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </ViewSegment>
        <ViewSegment
          active={view === "column"}
          onClick={() => onView("column")}
          aria-label="Column view"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
            <rect x="3" y="3" width="5" height="18" rx="1" />
            <rect x="10" y="3" width="5" height="18" rx="1" />
            <rect x="17" y="3" width="4" height="18" rx="1" />
          </svg>
        </ViewSegment>
        <ViewSegment
          active={view === "gallery"}
          onClick={() => onView("gallery")}
          aria-label="Gallery view"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="6" y="4" width="12" height="11" rx="1" />
            <rect x="3" y="17" width="4" height="3" rx="0.5" />
            <rect x="10" y="17" width="4" height="3" rx="0.5" />
            <rect x="17" y="17" width="4" height="3" rx="0.5" />
          </svg>
        </ViewSegment>
      </div>

      {/* Group / Share / Action — visual only for v1 */}
      <ToolbarBtn aria-label="Group" title="Coming soon" disabled>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="4" width="7" height="7" rx="1" />
          <rect x="13" y="4" width="7" height="7" rx="1" />
          <rect x="4" y="13" width="16" height="7" rx="1" />
        </svg>
      </ToolbarBtn>
      <ToolbarBtn aria-label="Share" title="Coming soon" disabled>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12" />
          <path d="M8 7l4-4 4 4" />
          <path d="M5 14v5h14v-5" />
        </svg>
      </ToolbarBtn>
      <ToolbarBtn aria-label="Action" title="Coming soon" disabled>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
          <circle cx="6" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="18" cy="12" r="1.5" />
        </svg>
      </ToolbarBtn>

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
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search"
          className="h-7 w-44 rounded-md border border-app bg-app pl-7 pr-2 text-[12px] text-app placeholder:text-muted focus:outline-none focus:border-tool-accent"
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
