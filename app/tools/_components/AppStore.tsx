"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
}

const ACCENT_BG: Partial<Record<ToolCategoryKey, string>> = {
  // Real estate
  intelligence: "bg-purple-500/15 text-purple-600",
  calculators: "bg-blue-500/15 text-blue-600",
  investment: "bg-emerald-500/15 text-emerald-600",
  research: "bg-amber-500/15 text-amber-600",
  compliance: "bg-rose-500/15 text-rose-600",
  agent: "bg-cyan-500/15 text-cyan-600",
  // Cross-industry (solutions)
  productivity: "bg-sky-500/15 text-sky-600",
  finance: "bg-emerald-500/15 text-emerald-600",
  hr: "bg-fuchsia-500/15 text-fuchsia-600",
  marketing: "bg-pink-500/15 text-pink-600",
  sales: "bg-orange-500/15 text-orange-600",
  legal: "bg-slate-500/15 text-slate-600",
  data: "bg-indigo-500/15 text-indigo-600",
  design: "bg-teal-500/15 text-teal-600",
  support: "bg-lime-500/15 text-lime-600",
  growth: "bg-violet-500/15 text-violet-600",
  content: "bg-yellow-500/15 text-yellow-600",
  crm: "bg-cyan-500/15 text-cyan-600",
};

const DEFAULT_ACCENT = "bg-surface-strong text-app";

export default function AppStore({
  open,
  onClose,
  isInstalled,
  onInstall,
  onUninstall,
  onOpenTool,
}: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ToolCategoryKey | "all">("all");
  const { activeId } = useWorkspaces();
  const [availability, setAvailability] = useState<
    Record<string, ToolAvailability>
  >({});

  useEffect(() => {
    if (!open) {
      setQ("");
      setFilter("all");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Pull per-tool availability from the gating endpoint when the store
  // opens. Failures fall back to "allowed" — the install path also
  // pre-flights the same RPC server-side, so a stale client view can't
  // sneak through a disabled or tier-locked tool. Empty `activeId`
  // means we haven't hydrated a workspace yet; skip until we have one.
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
        if (json && json.availability) {
          setAvailability(json.availability);
        }
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

  const tools = useMemo(() => {
    let list = filter === "all" ? TOOLS : TOOLS.filter((t) => t.category === filter);
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

  const featured = useMemo(() => TOOLS.filter((t) => t.topRated).slice(0, 4), []);

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
          aria-label="Tool Store"
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
            className="relative z-10 mx-auto flex h-[min(86vh,760px)] max-w-5xl flex-col overflow-hidden rounded-2xl border border-app bg-app-elevated shadow-2xl"
            style={{ marginTop: "7vh" }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-app bg-app-elevated px-6 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-strong text-app">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d={TOOL_ICONS.dots9} />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-base font-semibold text-app">Tool Store</div>
                <div className="text-[11px] text-muted">
                  Install what you need. Uninstall anytime from the dock or Launchpad.
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close store"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-app text-secondary hover:bg-surface hover:text-app transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search + filters */}
            <div className="border-b border-app bg-app-elevated px-6 py-3">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search tools in the store…"
                className="w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-faint focus:outline-none focus:border-app-hover"
              />
              <div className="mt-3 flex flex-wrap gap-1.5">
                <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
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

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {filter === "all" && !q.trim() && (
                <section className="mb-6">
                  <div className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                    Featured
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {featured.map((t) => (
                      <FeatureRow
                        key={t.slug}
                        slug={t.slug}
                        title={t.title}
                        description={t.description}
                        category={t.category}
                        iconKey={t.icon}
                        installed={isInstalled(t.slug)}
                        availability={availabilityFor(t.slug)}
                        onInstall={() => onInstall(t.slug)}
                        onUninstall={() => onUninstall(t.slug)}
                        onOpen={() => onOpenTool(t.slug, t.title)}
                      />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
                  {filter === "all" ? "All tools" : TOOL_CATEGORIES.find((c) => c.key === filter)?.label}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {tools.map((t) => (
                    <StoreRow
                      key={t.slug}
                      slug={t.slug}
                      title={t.title}
                      description={t.description}
                      category={t.category}
                      iconKey={t.icon}
                      installed={isInstalled(t.slug)}
                      availability={availabilityFor(t.slug)}
                      onInstall={() => onInstall(t.slug)}
                      onUninstall={() => onUninstall(t.slug)}
                      onOpen={() => onOpenTool(t.slug, t.title)}
                    />
                  ))}
                  {tools.length === 0 && (
                    <div className="col-span-full py-10 text-center text-sm text-muted">
                      No tools match that search.
                    </div>
                  )}
                </div>
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ───────── Row variants ───────── */

interface RowProps {
  slug: string;
  title: string;
  description: string;
  category: ToolCategoryKey;
  iconKey: keyof typeof TOOL_ICONS;
  installed: boolean;
  availability: ToolAvailability;
  onInstall: () => void;
  onUninstall: () => void;
  onOpen: () => void;
}

function StoreRow({
  slug,
  title,
  description,
  category,
  iconKey,
  installed,
  availability,
  onInstall,
  onUninstall,
  onOpen,
}: RowProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-app bg-app p-3 transition-colors hover:border-app-hover">
      {hasAppIcon(slug) ? (
        <AppIcon slug={slug} size={40} cornerPct={24} mono flatShadow label={title} />
      ) : (
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${ACCENT_BG[category] ?? DEFAULT_ACCENT}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d={TOOL_ICONS[iconKey] ?? TOOL_ICONS.home} />
          </svg>
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-app">{title}</div>
        <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">{description}</div>
        <div className="mt-2 flex items-center gap-2">
          {installed ? (
            <>
              <button
                type="button"
                onClick={onOpen}
                className="rounded-md bg-app px-2.5 py-1 text-[0.7rem] font-medium text-app hover:opacity-90 transition-opacity"
              >
                Open
              </button>
              <button
                type="button"
                onClick={onUninstall}
                className="rounded-md border border-app bg-surface px-2.5 py-1 text-[0.7rem] text-secondary hover:text-app transition-colors"
              >
                Uninstall
              </button>
            </>
          ) : (
            <InstallControl availability={availability} onInstall={onInstall} />
          )}
        </div>
      </div>
    </div>
  );
}

function FeatureRow(props: RowProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-app bg-app p-4 shadow-card">
      {hasAppIcon(props.slug) ? (
        <AppIcon
          slug={props.slug}
          size={48}
          cornerPct={24}
          mono
          label={props.title}
        />
      ) : (
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${ACCENT_BG[props.category] ?? DEFAULT_ACCENT}`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d={TOOL_ICONS[props.iconKey] ?? TOOL_ICONS.home} />
          </svg>
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-app">{props.title}</div>
        <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">{props.description}</div>
      </div>
      {props.installed ? (
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            type="button"
            onClick={props.onOpen}
            className="rounded-full bg-app px-3 py-1 text-[0.7rem] font-medium text-app hover:opacity-90 transition-opacity"
          >
            Open
          </button>
          <button
            type="button"
            onClick={props.onUninstall}
            className="text-[0.65rem] text-muted hover:text-app"
          >
            Uninstall
          </button>
        </div>
      ) : (
        <div className="shrink-0">
          <InstallControl
            availability={props.availability}
            onInstall={props.onInstall}
            variant="featured"
          />
        </div>
      )}
    </div>
  );
}

/* ───────── Install / gated CTA ───────── */

function InstallControl({
  availability,
  onInstall,
  variant = "row",
}: {
  availability: ToolAvailability;
  onInstall: () => void;
  variant?: "row" | "featured";
}) {
  const baseRow =
    "rounded-md px-2.5 py-1 text-[0.7rem] font-medium transition-opacity";
  const baseFeatured =
    "rounded-full px-4 py-1.5 text-[0.72rem] font-medium transition-opacity";
  const base = variant === "featured" ? baseFeatured : baseRow;

  if (availability === "allowed") {
    return (
      <button
        type="button"
        onClick={onInstall}
        className={`${base} bg-app text-app hover:opacity-90`}
      >
        Get
      </button>
    );
  }

  if (availability === "tier_locked") {
    return (
      <Link
        href="/pricing"
        className={`${base} bg-tool-accent-soft text-tool-accent hover:opacity-90`}
      >
        Upgrade to install
      </Link>
    );
  }

  if (availability === "workspace_blocked") {
    return (
      <span
        className={`${base} cursor-not-allowed bg-surface text-muted opacity-80`}
        aria-disabled="true"
      >
        Not enabled for this workspace
      </span>
    );
  }

  // disabled
  return (
    <span
      className={`${base} cursor-not-allowed bg-surface text-faint opacity-70`}
      aria-disabled="true"
    >
      Unavailable
    </span>
  );
}

/* ───────── Filter pill ───────── */

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
      className={`rounded-full px-3 py-1 text-[0.7rem] transition-colors ${
        active
          ? "border border-app-hover bg-app text-app"
          : "border border-app bg-surface text-secondary hover:text-app"
      }`}
    >
      {children}
    </button>
  );
}
