"use client";

import {
  useState,
  useEffect,
  useRef,
  Suspense,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import {
  TOOL_CATEGORIES,
  TOOLS,
  type ToolCategoryKey,
  type ToolCategory,
} from "../_data/tools-list";

const COLLAPSED = 64;
const EXPANDED = 260;

function getActiveSlug(pathname: string): string | null {
  const m = pathname.match(/^\/tools\/([^/?#]+)/);
  return m ? m[1] : null;
}

function Glyph({ d, size = 18, className = "" }: { d: string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/* ───────────── Profile ───────────── */

function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  return { user, loaded, supabase };
}

function Avatar({ user, size = 36 }: { user: User | null; size?: number }) {
  const src =
    user?.user_metadata?.custom_avatar_url ||
    user?.user_metadata?.avatar_url ||
    null;
  const initial = user
    ? (
        user.user_metadata?.full_name?.[0] ||
        user.user_metadata?.name?.[0] ||
        user.email?.[0] ||
        "U"
      ).toUpperCase()
    : null;

  return (
    <span
      className="inline-flex items-center justify-center overflow-hidden rounded-full border border-app bg-surface-strong text-app text-sm font-medium"
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Profile" className="h-full w-full object-cover" />
      ) : initial ? (
        initial
      ) : (
        <Glyph
          d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.24-8 5v3h16v-3c0-2.76-3.58-5-8-5z"
          size={Math.round(size * 0.55)}
          className="opacity-70"
        />
      )}
    </span>
  );
}

function ProfileMenu({
  user,
  supabase,
  onClose,
  anchorLeft,
}: {
  user: User | null;
  supabase: ReturnType<typeof createClient>;
  onClose: () => void;
  anchorLeft: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed bottom-[72px] z-50 w-56 rounded-xl border border-app bg-app-elevated p-1.5 shadow-menu"
      style={{ left: anchorLeft }}
    >
      {user ? (
        <>
          <div className="px-3 py-2 border-b border-app mb-1">
            <div className="truncate text-sm font-medium text-app">
              {user.user_metadata?.full_name || user.user_metadata?.name || "Signed in"}
            </div>
            <div className="truncate text-xs text-muted">{user.email}</div>
          </div>
          <Link href="/" onClick={onClose} className="block rounded-md px-3 py-2 text-sm text-secondary hover:bg-surface hover:text-app transition-colors" role="menuitem">Workspace</Link>
          <Link href="/" onClick={onClose} className="block rounded-md px-3 py-2 text-sm text-secondary hover:bg-surface hover:text-app transition-colors" role="menuitem">Back to site</Link>
          <button type="button" onClick={handleSignOut} className="mt-1 block w-full rounded-md px-3 py-2 text-left text-sm text-secondary hover:bg-surface hover:text-app transition-colors" role="menuitem">
            Sign out
          </button>
        </>
      ) : (
        <>
          <Link href="/signin" onClick={onClose} className="block rounded-md px-3 py-2 text-sm font-medium text-app hover:bg-surface transition-colors" role="menuitem">Sign in</Link>
          <Link href="/" onClick={onClose} className="block rounded-md px-3 py-2 text-sm text-secondary hover:bg-surface hover:text-app transition-colors" role="menuitem">Back to site</Link>
        </>
      )}
    </div>
  );
}

/* ───────────── Sidebar ───────────── */

function Toggle({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
      aria-expanded={expanded}
      className="flex h-10 w-10 items-center justify-center rounded-lg text-secondary hover:bg-surface hover:text-app transition-colors"
    >
      {/* hamburger when collapsed, double-chevron-left when expanded */}
      {expanded ? (
        <Glyph d="M15 18l-6-6 6-6v12zm-6 0H7V6h2v12z" />
      ) : (
        <Glyph d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
      )}
    </button>
  );
}

function CategoryIconOnly({
  cat,
  active,
  onClick,
}: {
  cat: ToolCategory;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={cat.label}
      title={cat.label}
      className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
        active ? "bg-surface-strong text-app" : "text-secondary hover:bg-surface hover:text-app"
      }`}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-accent"
        />
      )}
      <Glyph d={cat.icon} />
    </button>
  );
}

function Sidebar({
  activeSlug,
  activeCategoryKey,
  expanded,
  onToggle,
  onExpand,
  onNavigate,
}: {
  activeSlug: string | null;
  activeCategoryKey: ToolCategoryKey | null;
  expanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onNavigate?: () => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState(12);
  const profileBtnRef = useRef<HTMLButtonElement>(null);
  const { user, supabase } = useUser();

  const openProfile = () => {
    const rect = profileBtnRef.current?.getBoundingClientRect();
    if (rect) setProfileAnchor(rect.left);
    setProfileOpen(true);
  };

  return (
    <div
      className="flex h-full flex-col bg-app"
      style={{ width: expanded ? EXPANDED : COLLAPSED }}
    >
      {/* Top: toggle (+ label when expanded) */}
      <div className={`flex items-center ${expanded ? "justify-between px-3" : "justify-center"} py-3`}>
        <Toggle expanded={expanded} onClick={onToggle} />
        {expanded && (
          <span className="mr-2 text-sm font-semibold text-app">Tools</span>
        )}
      </div>

      {/* Middle: categories + tools */}
      <nav aria-label="Tool categories" className="flex-1 overflow-y-auto pb-2">
        {expanded ? (
          <div className="px-3 space-y-4">
            {TOOL_CATEGORIES.map((cat) => {
              const tools = TOOLS.filter((t) => t.category === cat.key);
              return (
                <div key={cat.key}>
                  <div className="flex items-center gap-2 px-2 py-1">
                    <Glyph d={cat.icon} size={14} className="text-muted" />
                    <span className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-muted">
                      {cat.short}
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {tools.map((t) => {
                      const active = activeSlug === t.slug;
                      return (
                        <li key={t.slug}>
                          <Link
                            href={`/tools/${t.slug}`}
                            onClick={onNavigate}
                            className={`block truncate rounded-md px-2.5 py-1.5 text-[0.825rem] transition-colors ${
                              active
                                ? "bg-surface-strong text-app font-medium"
                                : "text-secondary hover:bg-surface hover:text-app"
                            }`}
                          >
                            {t.title}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 px-2">
            {TOOL_CATEGORIES.map((cat) => (
              <CategoryIconOnly
                key={cat.key}
                cat={cat}
                active={activeCategoryKey === cat.key}
                onClick={onExpand}
              />
            ))}
          </div>
        )}
      </nav>

      {/* Profile footer */}
      <div className={`relative ${expanded ? "p-3" : "flex justify-center py-3"}`}>
        {profileOpen && (
          <ProfileMenu
            user={user}
            supabase={supabase}
            onClose={() => setProfileOpen(false)}
            anchorLeft={profileAnchor}
          />
        )}
        {expanded && user ? (
          <button
            ref={profileBtnRef}
            type="button"
            onClick={openProfile}
            aria-label="Open profile menu"
            aria-expanded={profileOpen}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface transition-colors"
          >
            <Avatar user={user} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-app">
                {user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0]}
              </span>
              <span className="block truncate text-[0.7rem] text-muted">
                {user.email}
              </span>
            </span>
          </button>
        ) : (
          <button
            ref={profileBtnRef}
            type="button"
            onClick={openProfile}
            aria-label="Open profile menu"
            aria-expanded={profileOpen}
            className={`flex items-center justify-center rounded-full hover:opacity-90 transition-opacity ${
              expanded ? "h-9 w-9 ml-1" : ""
            }`}
          >
            <Avatar user={user} size={36} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────────── Shell wrapper ───────────── */

export default function ToolsShell({ children }: { children: ReactNode }) {
  // useSearchParams requires a Suspense boundary during static generation,
  // per Next App Router. Wrap the actual shell in Suspense here.
  return (
    <Suspense fallback={<>{children}</>}>
      <ToolsShellInner>{children}</ToolsShellInner>
    </Suspense>
  );
}

function ToolsShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/tools";
  const searchParams = useSearchParams();
  const activeSlug = getActiveSlug(pathname);
  const activeTool = activeSlug ? TOOLS.find((t) => t.slug === activeSlug) : undefined;
  const activeCategoryKey = activeTool?.category ?? null;

  // Frame mode (iframe inside desktop workspace): drop sidebar/dock entirely
  // so the tool renders as bare content inside the window chrome.
  // Also suppresses the shell on the /tools index route — Desktop owns it.
  const isFrame = searchParams?.get("frame") === "1";
  const isIndex = pathname === "/tools" || pathname === "/tools/";
  if (isFrame || isIndex) {
    return <>{children}</>;
  }

  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-app">
      {/* Desktop */}
      <div className="hidden lg:block">
        <div
          className="fixed left-0 top-0 bottom-0 z-30"
          style={{ width: expanded ? EXPANDED : COLLAPSED }}
        >
          <Sidebar
            activeSlug={activeSlug}
            activeCategoryKey={activeCategoryKey}
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
            onExpand={() => setExpanded(true)}
          />
        </div>
        <div
          className="min-h-screen bg-app-elevated rounded-tl-2xl"
          style={{ marginLeft: expanded ? EXPANDED : COLLAPSED }}
        >
          {children}
        </div>
      </div>

      {/* Mobile */}
      <div className="lg:hidden">
        <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-app bg-app-elevated px-3 py-2.5">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open tools menu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-app hover:bg-surface"
          >
            <Glyph d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
          </button>
          <span className="text-sm font-semibold text-app">
            {activeTool ? activeTool.title : "Tools"}
          </span>
        </div>
        <div className="bg-app-elevated min-h-screen">{children}</div>

        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/60"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <div
              className="fixed inset-y-0 left-0 z-50"
              style={{ width: EXPANDED }}
            >
              <Sidebar
                activeSlug={activeSlug}
                activeCategoryKey={activeCategoryKey}
                expanded
                onToggle={() => setMobileOpen(false)}
                onExpand={() => {}}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
