"use client";

/* AppStore — industry-standard app-store experience.
 *
 * Two views in one modal:
 *   1. BROWSE — featured carousel up top, category rail, grid of app
 *      cards. Click any card → opens DETAIL view.
 *   2. DETAIL — slide-in product page for one app: big icon, title,
 *      category, full description, what's-included list, primary
 *      install/open CTA, secondary uninstall. Back arrow returns to
 *      browse and remembers scroll position.
 *
 * Modeled on the Mac/iOS App Store. The whole modal is one mounted
 * tree so opening a detail page is just a state toggle (no remount,
 * no double fetch of availability data).
 */

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  TOOL_CATEGORIES,
  TOOL_ICONS,
  TOOLS,
  type ToolCategoryKey,
} from "../_data/tools-list";
import AppIcon, { hasAppIcon } from "./AppIcon";
import { useWorkspaces } from "./useWorkspaces";

type ToolAvailability =
  | "allowed"
  | "disabled"
  | "tier_locked"
  | "workspace_blocked";

interface Props {
  open: boolean;
  onClose: () => void;
  isInstalled: (slug: string) => boolean;
  onInstall: (slug: string) => void;
  onUninstall: (slug: string) => void;
  onOpenTool: (slug: string, title: string) => void;
  canInstall: boolean;
  canUninstall: boolean;
}

/* Per-category accent for badges / fallback icon backgrounds. */
const ACCENT_BG: Partial<Record<ToolCategoryKey, string>> = {
  intelligence: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
  calculators: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  investment: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  research: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  compliance: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  agent: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300",
  productivity: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  finance: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  hr: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300",
  marketing: "bg-pink-500/15 text-pink-600 dark:text-pink-300",
  sales: "bg-orange-500/15 text-orange-600 dark:text-orange-300",
  legal: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  data: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
  design: "bg-teal-500/15 text-teal-600 dark:text-teal-300",
  support: "bg-lime-500/15 text-lime-700 dark:text-lime-300",
  growth: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  content: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  crm: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300",
};
const DEFAULT_ACCENT = "bg-surface-strong text-app";

interface ToolEntry {
  slug: string;
  title: string;
  description: string;
  category: ToolCategoryKey;
  icon: keyof typeof TOOL_ICONS;
  topRated?: boolean;
}

export default function AppStore({
  open,
  onClose,
  isInstalled,
  onInstall,
  onUninstall,
  onOpenTool,
  canInstall,
  canUninstall,
}: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ToolCategoryKey | "all">("all");
  const [detailSlug, setDetailSlug] = useState<string | null>(null);
  const { activeId } = useWorkspaces();
  const [availability, setAvailability] = useState<
    Record<string, ToolAvailability>
  >({});
  const browseScrollRef = useRef<HTMLDivElement>(null);
  const lastScrollRef = useRef<number>(0);

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setQ("");
      setFilter("all");
      setDetailSlug(null);
    }
  }, [open]);

  // Esc closes (or backs out of detail).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (detailSlug) setDetailSlug(null);
        else onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, detailSlug]);

  // Pull per-tool availability from the gating endpoint when the store
  // opens. Failures fall back to "allowed" — the install path also
  // pre-flights the same RPC server-side, so a stale client view can't
  // sneak through a disabled or tier-locked tool.
  useEffect(() => {
    if (!open || !activeId) return;
    let cancelled = false;
    const slugs = TOOLS.map((t) => t.slug);
    fetch("/api/tools/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: activeId, slugs }),
    })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as {
          availability?: Record<string, ToolAvailability>;
        };
      })
      .then((json) => {
        if (cancelled) return;
        if (json && json.availability) setAvailability(json.availability);
      })
      .catch(() => {
        /* leave map empty — defaults to "allowed" */
      });
    return () => {
      cancelled = true;
    };
  }, [open, activeId]);

  const availabilityFor = (slug: string): ToolAvailability =>
    availability[slug] ?? "allowed";

  const tools = useMemo<ToolEntry[]>(() => {
    let list: ToolEntry[] =
      filter === "all" ? TOOLS : TOOLS.filter((t) => t.category === filter);
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
      );
    }
    return list;
  }, [q, filter]);

  const featured = useMemo<ToolEntry[]>(
    () => TOOLS.filter((t) => t.topRated).slice(0, 6),
    []
  );

  const detailEntry = useMemo<ToolEntry | null>(
    () => (detailSlug ? TOOLS.find((t) => t.slug === detailSlug) ?? null : null),
    [detailSlug]
  );

  const openDetail = (slug: string) => {
    if (browseScrollRef.current) {
      lastScrollRef.current = browseScrollRef.current.scrollTop;
    }
    setDetailSlug(slug);
  };
  const closeDetail = () => {
    setDetailSlug(null);
    // Restore scroll position after the browse view re-renders.
    requestAnimationFrame(() => {
      if (browseScrollRef.current) {
        browseScrollRef.current.scrollTop = lastScrollRef.current;
      }
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[80]"
          role="dialog"
          aria-label="App Store"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div
            className="absolute inset-0 backdrop-blur-xl"
            style={{ background: "rgba(15, 23, 42, 0.45)" }}
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="sf-glass-window relative z-10 mx-auto flex h-[min(88vh,800px)] w-[min(96vw,1080px)] flex-col overflow-hidden rounded-2xl"
            style={{ marginTop: "5vh" }}
          >
            {/* Title bar */}
            <div className="sf-glass-titlebar relative flex items-center gap-3 px-5 py-3.5">
              {detailEntry ? (
                <button
                  type="button"
                  onClick={closeDetail}
                  className="flex h-8 items-center gap-1.5 rounded-md border border-app bg-surface px-2.5 text-[0.72rem] text-secondary transition-colors hover:bg-app hover:text-app"
                  aria-label="Back to browse"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Discover
                </button>
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-strong text-app">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d={TOOL_ICONS.dots9} />
                  </svg>
                </div>
              )}
              <div className="flex-1">
                <div className="text-base font-semibold text-app">
                  {detailEntry ? detailEntry.title : "App Store"}
                </div>
                <div className="text-[11px] text-muted">
                  {detailEntry
                    ? categoryLabel(detailEntry.category)
                    : "Install what your workspace needs. Uninstall anytime."}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close store"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-app text-secondary transition-colors hover:bg-surface hover:text-app"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body — browse and detail are siblings; detail slides in
                from the right when active. */}
            <div className="relative flex-1 overflow-hidden">
              {/* BROWSE pane */}
              <motion.div
                animate={{ x: detailEntry ? -32 : 0, opacity: detailEntry ? 0.4 : 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 32 }}
                className="absolute inset-0 flex flex-col"
                aria-hidden={detailEntry ? "true" : undefined}
                style={{ pointerEvents: detailEntry ? "none" : "auto" }}
              >
                {/* Search */}
                <div className="border-b border-app bg-app-elevated/70 px-5 py-3 backdrop-blur-xl">
                  <div className="relative">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="M21 21l-4.35-4.35" />
                    </svg>
                    <input
                      type="text"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search Space Field…"
                      className="w-full rounded-lg border border-app bg-app py-2 pl-9 pr-3 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
                    />
                  </div>
                  {/* Category rail — horizontal scroll on small screens */}
                  <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <FilterPill
                      active={filter === "all"}
                      onClick={() => setFilter("all")}
                    >
                      All
                    </FilterPill>
                    {TOOL_CATEGORIES.map((c) => (
                      <FilterPill
                        key={c.key}
                        active={filter === c.key}
                        onClick={() => setFilter(c.key)}
                      >
                        {c.short}
                      </FilterPill>
                    ))}
                  </div>
                </div>

                {/* Scrollable content */}
                <div
                  ref={browseScrollRef}
                  className="flex-1 overflow-y-auto px-5 pb-8 pt-5"
                >
                  {/* Featured (only when no search/filter) */}
                  {filter === "all" && !q.trim() && featured.length > 0 && (
                    <section className="mb-7">
                      <SectionHeader
                        title="Featured"
                        subtitle="Hand-picked apps worth trying first"
                      />
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        {featured.map((t) => (
                          <FeatureCard
                            key={t.slug}
                            tool={t}
                            installed={isInstalled(t.slug)}
                            availability={availabilityFor(t.slug)}
                            canInstall={canInstall}
                            onClick={() => openDetail(t.slug)}
                            onInstall={() => onInstall(t.slug)}
                            onOpen={() => onOpenTool(t.slug, t.title)}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Grid of all matching tools */}
                  <section>
                    <SectionHeader
                      title={
                        filter === "all"
                          ? q.trim()
                            ? `Results for "${q.trim()}"`
                            : "All apps"
                          : categoryLabel(filter)
                      }
                      subtitle={`${tools.length} ${tools.length === 1 ? "app" : "apps"}`}
                    />
                    <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {tools.map((t) => (
                        <AppCard
                          key={t.slug}
                          tool={t}
                          installed={isInstalled(t.slug)}
                          availability={availabilityFor(t.slug)}
                          canInstall={canInstall}
                          onClick={() => openDetail(t.slug)}
                        />
                      ))}
                      {tools.length === 0 && (
                        <div className="col-span-full rounded-xl border border-dashed border-app bg-app-elevated/40 px-6 py-10 text-center text-sm text-muted">
                          No apps match that search. Try a different keyword.
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </motion.div>

              {/* DETAIL pane */}
              <AnimatePresence>
                {detailEntry && (
                  <motion.div
                    key={detailEntry.slug}
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", stiffness: 320, damping: 34 }}
                    className="absolute inset-0 flex flex-col bg-app-elevated"
                  >
                    <DetailView
                      tool={detailEntry}
                      installed={isInstalled(detailEntry.slug)}
                      availability={availabilityFor(detailEntry.slug)}
                      canInstall={canInstall}
                      canUninstall={canUninstall}
                      onInstall={() => onInstall(detailEntry.slug)}
                      onUninstall={() => onUninstall(detailEntry.slug)}
                      onOpen={() =>
                        onOpenTool(detailEntry.slug, detailEntry.title)
                      }
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─────────── Card variants ─────────── */

interface CardProps {
  tool: ToolEntry;
  installed: boolean;
  availability: ToolAvailability;
  canInstall: boolean;
  onClick: () => void;
}

interface FeatureCardProps extends CardProps {
  onInstall: () => void;
  onOpen: () => void;
}

/* Compact card — used in the main grid. Click anywhere opens detail. */
function AppCard({ tool, installed, availability, canInstall, onClick }: CardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-start gap-3 rounded-xl border border-app bg-app p-3 text-left transition-all hover:border-tool-accent hover:shadow-card focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
    >
      <ToolIcon
        slug={tool.slug}
        category={tool.category}
        iconKey={tool.icon}
        title={tool.title}
        size={48}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[0.85rem] font-semibold text-app">
            {tool.title}
          </span>
          {tool.topRated && <FeaturedDot />}
        </div>
        <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">
          {tool.description}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <CategoryChip category={tool.category} />
          <StatusPill
            installed={installed}
            availability={availability}
            canInstall={canInstall}
            compact
          />
        </div>
      </div>
    </button>
  );
}

/* Featured card — taller, more visual, in the top section. */
function FeatureCard({
  tool,
  installed,
  availability,
  canInstall,
  onClick,
  onInstall,
  onOpen,
}: FeatureCardProps) {
  const canOpen = installed && availability === "allowed";
  return (
    <div className="group flex items-center gap-4 rounded-2xl border border-app bg-gradient-to-br from-app to-app-elevated p-4 shadow-card transition-all hover:border-tool-accent hover:shadow-lg">
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 items-center gap-4 text-left focus:outline-none"
      >
        <ToolIcon
          slug={tool.slug}
          category={tool.category}
          iconKey={tool.icon}
          title={tool.title}
          size={64}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-tool-accent">
            Featured · {categoryLabel(tool.category)}
          </div>
          <div className="mt-1 truncate text-base font-semibold text-app">
            {tool.title}
          </div>
          <div className="mt-1 line-clamp-2 text-[12px] leading-snug text-secondary">
            {tool.description}
          </div>
        </div>
      </button>
      <div className="shrink-0">
        {canOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="rounded-full bg-app-elevated px-4 py-1.5 text-[0.72rem] font-semibold text-app shadow-sm ring-1 ring-inset ring-app transition-all hover:ring-tool-accent"
          >
            Open
          </button>
        ) : (
          <InstallButton
            availability={canInstall ? availability : "permission_denied"}
            onInstall={onInstall}
            variant="featured"
          />
        )}
      </div>
    </div>
  );
}

/* ─────────── Detail (product) view ─────────── */

interface DetailProps {
  tool: ToolEntry;
  installed: boolean;
  availability: ToolAvailability;
  canInstall: boolean;
  canUninstall: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onOpen: () => void;
}

function DetailView({
  tool,
  installed,
  availability,
  canInstall,
  canUninstall,
  onInstall,
  onUninstall,
  onOpen,
}: DetailProps) {
  const canOpen = installed && availability === "allowed";
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Hero */}
      <div className="border-b border-app bg-gradient-to-br from-app-elevated to-app px-7 py-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
          <ToolIcon
            slug={tool.slug}
            category={tool.category}
            iconKey={tool.icon}
            title={tool.title}
            size={120}
            cornerPct={26}
          />
          <div className="min-w-0 flex-1">
            <div className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-tool-accent">
              {categoryLabel(tool.category)}
              {tool.topRated && <span className="ml-2 text-amber-500">★ Featured</span>}
            </div>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-app">
              {tool.title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-secondary">
              {tool.description}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {canOpen ? (
                <>
                  <button
                    type="button"
                    onClick={onOpen}
                    className="rounded-full bg-tool-accent px-6 py-2 text-[0.78rem] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                  >
                    Open
                  </button>
                  {canUninstall && (
                    <button
                      type="button"
                      onClick={onUninstall}
                      className="rounded-full border border-app bg-app px-4 py-2 text-[0.72rem] font-medium text-secondary transition-colors hover:text-app"
                    >
                      Remove
                    </button>
                  )}
                </>
              ) : (
                <InstallButton
                  availability={canInstall ? availability : "permission_denied"}
                  onInstall={onInstall}
                  variant="hero"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Info strip — tries to mirror the iOS App Store metadata row */}
      <div className="grid grid-cols-2 gap-4 border-b border-app px-7 py-4 text-center sm:grid-cols-4">
        <InfoCell label="Category" value={categoryLabel(tool.category)} />
        <InfoCell label="Price" value="Included" />
        <InfoCell
          label="Status"
          value={installed ? "Installed" : "Not installed"}
        />
        <InfoCell label="Workspace" value="Per-workspace" />
      </div>

      {/* Description / overview */}
      <div className="grid grid-cols-1 gap-7 px-7 py-7 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <SectionHeader title="About this app" />
          <p className="mt-3 text-sm leading-relaxed text-secondary whitespace-pre-line">
            {expandedDescription(tool)}
          </p>
        </section>

        <aside className="space-y-4">
          <div>
            <SectionHeader title="Information" />
            <dl className="mt-3 space-y-2.5 text-[12px]">
              <InfoRow label="Slug" value={tool.slug} mono />
              <InfoRow label="Category" value={categoryLabel(tool.category)} />
              <InfoRow
                label="Availability"
                value={
                  availability === "allowed"
                    ? "Installable"
                    : availability === "tier_locked"
                      ? "Plan upgrade required"
                      : availability === "workspace_blocked"
                        ? "Blocked in this workspace"
                        : "Currently unavailable"
                }
              />
              <InfoRow
                label="Permissions"
                value={canInstall ? "You can install" : "Admin install only"}
              />
            </dl>
          </div>

          {availability === "tier_locked" && (
            <div className="rounded-xl border border-tool-accent-soft bg-tool-accent-soft/50 p-4">
              <div className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
                Plan upgrade
              </div>
              <p className="mt-1.5 text-[12px] leading-snug text-app">
                This app is included in higher tiers. Upgrade to install.
              </p>
              <Link
                href="/pricing"
                className="mt-3 inline-block rounded-full bg-tool-accent px-4 py-1.5 text-[0.7rem] font-semibold text-white"
              >
                See plans
              </Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ─────────── Install button states ─────────── */

function InstallButton({
  availability,
  onInstall,
  variant = "card",
}: {
  availability: ToolAvailability | "permission_denied";
  onInstall: () => void;
  variant?: "card" | "featured" | "hero";
}) {
  const cls =
    variant === "hero"
      ? "rounded-full px-6 py-2 text-[0.78rem] font-semibold transition-opacity"
      : variant === "featured"
        ? "rounded-full px-4 py-1.5 text-[0.72rem] font-semibold transition-opacity"
        : "rounded-full px-3 py-1 text-[0.7rem] font-semibold transition-opacity";

  if (availability === "allowed") {
    return (
      <button
        type="button"
        onClick={onInstall}
        className={`${cls} bg-tool-accent text-white shadow-sm hover:opacity-90`}
      >
        Get
      </button>
    );
  }
  if (availability === "tier_locked") {
    return (
      <Link
        href="/pricing"
        className={`${cls} bg-tool-accent-soft text-tool-accent ring-1 ring-inset ring-tool-accent/30 hover:opacity-90`}
      >
        Upgrade
      </Link>
    );
  }
  if (availability === "workspace_blocked") {
    return (
      <span
        className={`${cls} cursor-not-allowed bg-surface text-muted opacity-80`}
        aria-disabled="true"
      >
        Blocked here
      </span>
    );
  }
  if (availability === "permission_denied") {
    return (
      <span
        className={`${cls} cursor-not-allowed bg-surface text-muted opacity-80`}
        aria-disabled="true"
      >
        Ask admin
      </span>
    );
  }
  return (
    <span
      className={`${cls} cursor-not-allowed bg-surface text-faint opacity-70`}
      aria-disabled="true"
    >
      Unavailable
    </span>
  );
}

/* Compact pill on grid cards — matches the iOS App Store right-edge button. */
function StatusPill({
  installed,
  availability,
  canInstall,
  compact,
}: {
  installed: boolean;
  availability: ToolAvailability;
  canInstall: boolean;
  compact?: boolean;
}) {
  const base = compact
    ? "rounded-full px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em]"
    : "rounded-full px-3 py-1 text-[0.7rem] font-semibold";
  if (installed && availability === "allowed") {
    return (
      <span className={`${base} bg-emerald-500/10 text-emerald-600 dark:text-emerald-300`}>
        Installed
      </span>
    );
  }
  if (availability === "tier_locked") {
    return (
      <span className={`${base} bg-tool-accent-soft text-tool-accent`}>Upgrade</span>
    );
  }
  if (availability === "workspace_blocked") {
    return <span className={`${base} bg-surface text-muted`}>Blocked</span>;
  }
  if (!canInstall) {
    return <span className={`${base} bg-surface text-muted`}>Locked</span>;
  }
  return (
    <span className={`${base} bg-tool-accent text-white`}>
      {compact ? "Get" : "Get free"}
    </span>
  );
}

/* ─────────── Misc UI bits ─────────── */

function ToolIcon({
  slug,
  category,
  iconKey,
  title,
  size,
  cornerPct = 24,
}: {
  slug: string;
  category: ToolCategoryKey;
  iconKey: keyof typeof TOOL_ICONS;
  title: string;
  size: number;
  cornerPct?: number;
}) {
  if (hasAppIcon(slug)) {
    return (
      <AppIcon
        slug={slug}
        size={size}
        cornerPct={cornerPct}
        mono
        flatShadow={size < 80}
        label={title}
      />
    );
  }
  const accent = ACCENT_BG[category] ?? DEFAULT_ACCENT;
  return (
    <span
      className={`flex shrink-0 items-center justify-center ${accent}`}
      style={{ width: size, height: size, borderRadius: (cornerPct / 100) * size }}
      aria-label={title}
    >
      <svg
        width={size * 0.42}
        height={size * 0.42}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d={TOOL_ICONS[iconKey] ?? TOOL_ICONS.home} />
      </svg>
    </span>
  );
}

function CategoryChip({ category }: { category: ToolCategoryKey }) {
  return (
    <span className="rounded-full bg-surface px-2 py-0.5 text-[0.58rem] font-medium uppercase tracking-[0.12em] text-muted">
      {categoryLabel(category)}
    </span>
  );
}

function FeaturedDot() {
  return (
    <span
      aria-label="Featured"
      title="Featured"
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
    />
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-[0.7rem] font-medium transition-colors ${
        active
          ? "border border-tool-accent bg-tool-accent text-white"
          : "border border-app bg-surface text-secondary hover:border-app-hover hover:text-app"
      }`}
    >
      {children}
    </button>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[1rem] font-semibold tracking-tight text-app">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-faint">
        {label}
      </div>
      <div className="mt-1 truncate text-[12px] font-medium text-app">{value}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd
        className={`truncate text-app ${mono ? "font-mono text-[11px]" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function categoryLabel(key: ToolCategoryKey): string {
  return TOOL_CATEGORIES.find((c) => c.key === key)?.label ?? String(key);
}

/* The catalog only carries a one-line description per tool. Until we
 * author proper long-form copy, expand the line into a 2–3 paragraph
 * "About" body so the detail view doesn't feel empty. Pure UI text;
 * no truth claims invented. */
function expandedDescription(tool: ToolEntry): string {
  const cat = categoryLabel(tool.category).toLowerCase();
  return [
    tool.description,
    `${tool.title} lives inside Space Field as a native app — no separate sign-in, no embed, no extra tab. Open it from the Launchpad or pin it to the dock; it shares files, workspace state, and AI access with everything else you've installed.`,
    `Categorised under ${cat}. Install once per workspace; uninstall any time without losing your data — your workspace's stored content is preserved between installs.`,
  ].join("\n\n");
}
