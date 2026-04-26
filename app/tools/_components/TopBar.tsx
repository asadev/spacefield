"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { WindowState } from "./useWindowManager";
import { useWorkspaces } from "./useWorkspaces";

/* Auth in spacefield is opt-in / not yet wired. Minimal user shape so
 * the avatar / email row can render if a user does sign in later,
 * without depending on @supabase/supabase-js types. */
type User = {
  email?: string | null;
  user_metadata?: {
    full_name?: string | null;
    name?: string | null;
    avatar_url?: string | null;
    custom_avatar_url?: string | null;
  } | null;
};

interface Props {
  user: User | null;
  windows: WindowState[];
  onLaunchpad: () => void;
  onStore: () => void;
  onCustomizeDock: () => void;
  onCustomizeWidgets: () => void;
  onCustomizeWallpaper: () => void;
  onCustomizeIconStyle: () => void;
  onToggleSounds: () => void;
  soundsMuted: boolean;
  onOpenNotifications: () => void;
  notificationsOpen: boolean;
  onMissionControl: () => void;
  onOpenSettings: () => void;
  onCloseAll: () => void;
  onMinimizeAll: () => void;
  onResetWorkspace: () => void;
  onFocusWindow: (id: string) => void;
  onSignOut: () => void;
  onSignIn?: () => void;
  theme: "light" | "dark" | null;
  onToggleTheme: () => void;
  onCreateWorkspace: () => void;
}

/* Apple-style menu bar across the very top of /tools.
 * Left: app icon + dropdown menus (relevant to our product, not a literal
 * copy of macOS's File/Edit).
 * Right: search + clock + notifications + profile avatar dropdown. */

export default function TopBar({
  user,
  windows,
  onLaunchpad,
  onStore,
  onCustomizeDock,
  onCustomizeWidgets,
  onCustomizeWallpaper,
  onCustomizeIconStyle,
  onToggleSounds,
  soundsMuted,
  onOpenNotifications,
  notificationsOpen,
  onMissionControl,
  onOpenSettings,
  onCloseAll,
  onMinimizeAll,
  onResetWorkspace,
  onFocusWindow,
  onSignOut,
  onSignIn,
  theme,
  onToggleTheme,
  onCreateWorkspace,
}: Props) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const { workspaces, activeId: activeWorkspaceId, switchWorkspace: onSwitchWorkspace } =
    useWorkspaces();

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      // Ignore clicks inside the bar OR inside any portaled topbar dropdown
      // (they live at <body> level via createPortal so they're not children
      // of barRef).
      if (barRef.current?.contains(target)) return;
      const el = target as HTMLElement;
      if (el.closest?.("[data-topbar-portal]")) return;
      setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const clockText = now
    ? now.toLocaleString("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "";

  const avatarUrl =
    (user?.user_metadata?.custom_avatar_url as string | undefined) ||
    (user?.user_metadata?.avatar_url as string | undefined) ||
    null;
  const avatarInitial = user
    ? (
        user.user_metadata?.full_name?.[0] ||
        user.user_metadata?.name?.[0] ||
        user.email?.[0] ||
        "U"
      ).toUpperCase()
    : null;

  return (
    <div
      ref={barRef}
      className="fixed inset-x-0 top-0 z-[1] flex h-8 items-center gap-1 bg-app-elevated/70 px-2 text-[0.72rem] backdrop-blur-xl"
    >
      {/* Mobile-only trigger. On <sm screens File/Window/View/Help don't
       * fit horizontally, so we collapse them behind a single button that
       * opens the same menus as a vertical stack. The menu primitives
       * already portal their dropdowns out of the topbar's stacking
       * context, so the same Menu components work for both layouts —
       * we just gate them with sm:flex / hidden on the desktop row. */}
      <button
        type="button"
        onClick={() => setOpenMenu(openMenu === "mobile" ? null : "mobile")}
        aria-label="Open menu"
        title="Menu"
        className="flex h-6 w-6 items-center justify-center rounded text-app hover:bg-surface transition-colors sm:hidden"
        data-topbar-menu-label
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Spacefield wordmark — small label, never linked anywhere
       * (this site IS the workspace; nothing to "go back" to). */}
      <span
        aria-label="Space Field"
        className="ml-1 mr-1 hidden select-none text-[0.72rem] font-semibold tracking-tight text-app sm:inline"
      >
        Space Field
      </span>

      {/* Desktop menu row — hidden on mobile, replaced by the hamburger. */}
      <div className="hidden items-center gap-1 sm:flex">
      <Menu id="file" open={openMenu} onOpen={setOpenMenu} label="File">
        {/* Workspace switcher — list of workspaces with active checkmark,
          * plus "New Workspace…" entry to create a new one. */}
        <div className="px-2 py-1 text-[0.6rem] uppercase tracking-[0.14em] text-muted">
          Workspaces
        </div>
        {workspaces.map((w) => {
          const isActive = w.id === activeWorkspaceId;
          return (
            <MenuItem
              key={w.id}
              onClick={() => {
                setOpenMenu(null);
                if (!isActive) onSwitchWorkspace(w.id);
              }}
              icon={
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{ opacity: isActive ? 1 : 0 }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              }
            >
              {w.name}
            </MenuItem>
          );
        })}
        <MenuItem
          onClick={() => {
            setOpenMenu(null);
            onCreateWorkspace();
          }}
          icon={
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          }
        >
          New Workspace…
        </MenuItem>
        <MenuDivider />
        <MenuItem
          onClick={() => {
            setOpenMenu(null);
            onLaunchpad();
          }}
          shortcut="⌘K"
        >
          Open tool…
        </MenuItem>
        <MenuItem
          onClick={() => {
            setOpenMenu(null);
            onStore();
          }}
        >
          Tool Store…
        </MenuItem>
        <MenuDivider />
        <MenuItem
          onClick={() => {
            setOpenMenu(null);
            onOpenSettings();
          }}
          shortcut="⌘,"
          icon={<TopBarGearIcon />}
        >
          Settings…
        </MenuItem>
        <MenuDivider />
        <MenuItem
          onClick={() => {
            setOpenMenu(null);
            onCloseAll();
          }}
          disabled={windows.length === 0}
        >
          Close all windows
        </MenuItem>
        <MenuItem
          onClick={() => {
            setOpenMenu(null);
            onResetWorkspace();
          }}
        >
          Reset workspace
        </MenuItem>
      </Menu>

      <Menu id="window" open={openMenu} onOpen={setOpenMenu} label="Window">
        <MenuItem
          onClick={() => {
            setOpenMenu(null);
            onMissionControl();
          }}
          shortcut="F3"
        >
          Show all windows…
        </MenuItem>
        <MenuItem
          onClick={() => {
            setOpenMenu(null);
            onMinimizeAll();
          }}
          disabled={windows.length === 0}
        >
          Minimize all
        </MenuItem>
        {windows.length > 0 && <MenuDivider />}
        {windows.map((w) => (
          <MenuItem
            key={w.id}
            onClick={() => {
              setOpenMenu(null);
              onFocusWindow(w.id);
            }}
          >
            <span className="flex items-center gap-2">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  w.minimized ? "bg-muted" : "bg-emerald-500"
                }`}
                aria-hidden="true"
              />
              {w.title}
            </span>
          </MenuItem>
        ))}
      </Menu>

      <Menu id="view" open={openMenu} onOpen={setOpenMenu} label="View">
        <MenuItem
          onClick={() => {
            setOpenMenu(null);
            onCustomizeWallpaper();
          }}
        >
          Wallpaper…
        </MenuItem>
        <MenuItem
          onClick={() => {
            setOpenMenu(null);
            onCustomizeIconStyle();
          }}
        >
          Icon style…
        </MenuItem>
        <MenuItem
          onClick={() => {
            setOpenMenu(null);
            onCustomizeDock();
          }}
        >
          Customize Dock…
        </MenuItem>
        <MenuItem
          onClick={() => {
            setOpenMenu(null);
            onCustomizeWidgets();
          }}
        >
          Add Widget…
        </MenuItem>
        <MenuDivider />
        <MenuItem
          onClick={() => {
            setOpenMenu(null);
            onToggleSounds();
          }}
        >
          Sounds: {soundsMuted ? "Off" : "On"}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setOpenMenu(null);
            onToggleTheme();
          }}
        >
          Switch to {theme === "light" ? "dark" : "light"}
        </MenuItem>
      </Menu>

      <Menu id="help" open={openMenu} onOpen={setOpenMenu} label="Help">
        <MenuLink href="/about">About</MenuLink>
        <MenuLink href="/network">Broker network</MenuLink>
        <MenuLink href="/learn">Courses</MenuLink>
      </Menu>
      </div>

      {/* Mobile menu — flat list of every action. Portaled out via the
       * Menu primitive so it floats above the back-layer topbar. */}
      {openMenu === "mobile" && (
        <MobilePopover onClose={() => setOpenMenu(null)}>
          <MobileSection label="File">
            <MobileItem onClick={() => { setOpenMenu(null); onCreateWorkspace(); }}>New Workspace…</MobileItem>
            <MobileItem onClick={() => { setOpenMenu(null); onLaunchpad(); }}>Open tool…</MobileItem>
            <MobileItem onClick={() => { setOpenMenu(null); onStore(); }}>Tool Store…</MobileItem>
            <MobileItem onClick={() => { setOpenMenu(null); onOpenSettings(); }}>Settings…</MobileItem>
            <MobileItem onClick={() => { setOpenMenu(null); onCloseAll(); }} disabled={windows.length === 0}>Close all windows</MobileItem>
            <MobileItem onClick={() => { setOpenMenu(null); onResetWorkspace(); }}>Reset workspace</MobileItem>
          </MobileSection>
          <MobileSection label="Window">
            <MobileItem onClick={() => { setOpenMenu(null); onMinimizeAll(); }} disabled={windows.length === 0}>Minimize all</MobileItem>
            <MobileItem onClick={() => { setOpenMenu(null); onMissionControl(); }}>Mission Control</MobileItem>
          </MobileSection>
          <MobileSection label="View">
            <MobileItem onClick={() => { setOpenMenu(null); onCustomizeWallpaper(); }}>Wallpaper…</MobileItem>
            <MobileItem onClick={() => { setOpenMenu(null); onCustomizeIconStyle(); }}>Icon style…</MobileItem>
            <MobileItem onClick={() => { setOpenMenu(null); onCustomizeWidgets(); }}>Add widgets…</MobileItem>
            <MobileItem onClick={() => { setOpenMenu(null); onCustomizeDock(); }}>Customize dock…</MobileItem>
            <MobileItem onClick={() => { setOpenMenu(null); onToggleTheme(); }}>{theme === "light" ? "Switch to dark" : "Switch to light"}</MobileItem>
            <MobileItem onClick={() => { setOpenMenu(null); onToggleSounds(); }}>{soundsMuted ? "Unmute sounds" : "Mute sounds"}</MobileItem>
          </MobileSection>
          <MobileSection label="Account">
            {user ? (
              <>
                <div className="flex items-center gap-3 rounded px-2 py-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-tool-accent-soft text-sm font-semibold text-tool-accent">
                    {(user.user_metadata?.full_name?.[0] ||
                      user.user_metadata?.name?.[0] ||
                      user.email?.[0] ||
                      "?").toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-app">
                      {user.user_metadata?.full_name ||
                        user.user_metadata?.name ||
                        user.email?.split("@")[0]}
                    </div>
                    <div className="truncate text-[11px] text-muted">
                      {user.email}
                    </div>
                  </div>
                </div>
                <a
                  href="/profile"
                  className="flex w-full items-center rounded px-2 py-2 text-left text-sm text-app transition-colors hover:bg-surface"
                  role="menuitem"
                >
                  Profile
                </a>
                <MobileItem onClick={() => { setOpenMenu(null); onSignOut(); }}>Sign out</MobileItem>
              </>
            ) : (
              <MobileItem
                onClick={() => {
                  setOpenMenu(null);
                  if (onSignIn) onSignIn();
                }}
                disabled={!onSignIn}
              >
                Sign in
              </MobileItem>
            )}
          </MobileSection>
        </MobilePopover>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right cluster */}
      {/* Spotlight-style search — opens Launchpad */}
      <button
        type="button"
        onClick={onLaunchpad}
        aria-label="Search tools"
        title="Search tools (⌘K)"
        className="flex h-6 w-6 items-center justify-center rounded text-app hover:bg-surface transition-colors"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </button>

      <span className="hidden sm:inline text-app text-[0.72rem] tabular-nums">
        {clockText}
      </span>

      {/* Notifications bell — panel itself is rendered by the parent
       * (NotificationCenter) so it can live above other overlays. */}
      <button
        type="button"
        onClick={onOpenNotifications}
        aria-label="Notifications"
        aria-expanded={notificationsOpen}
        title="Notifications"
        className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
          notificationsOpen ? "bg-surface-strong text-app" : "text-app hover:bg-surface"
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 003.4 0" />
        </svg>
      </button>

      {/* Profile menu */}
      <Menu
        id="profile"
        open={openMenu}
        onOpen={setOpenMenu}
        align="right"
        label={
          <span
            className="inline-flex items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold ring-1 ring-white/30 h-7 w-7 sm:h-6 sm:w-6"
            style={{
              backgroundColor: user
                ? "var(--accent)"
                : "rgba(255,255,255,0.18)",
              color: user ? "#ffffff" : "rgba(255,255,255,0.95)",
            }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : avatarInitial ? (
              avatarInitial
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.24-8 5v3h16v-3c0-2.76-3.58-5-8-5z" />
              </svg>
            )}
          </span>
        }
      >
        {user ? (
          <>
            <div className="px-3 py-2 border-b border-app mb-1">
              <div className="truncate text-sm font-medium text-app">
                {user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0]}
              </div>
              <div className="truncate text-[11px] text-muted">{user.email}</div>
            </div>
            <MenuLink href="/profile">Profile</MenuLink>
            <MenuDivider />
            <MenuItem
              onClick={() => {
                setOpenMenu(null);
                onSignOut();
              }}
            >
              Sign out
            </MenuItem>
          </>
        ) : (
          <>
            {onSignIn ? (
              <MenuItem
                onClick={() => {
                  setOpenMenu(null);
                  onSignIn();
                }}
              >
                Sign in
              </MenuItem>
            ) : (
              <MenuLink href="/auth/sign-in">Sign in</MenuLink>
            )}
          </>
        )}
      </Menu>
    </div>
  );
}

/* ───────────── Menu primitives ───────────── */

function Menu({
  id,
  open,
  onOpen,
  label,
  children,
  align = "left",
}: {
  id: string;
  open: string | null;
  onOpen: (v: string | null) => void;
  label: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const isOpen = open === id;
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    if (align === "right") {
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    } else {
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [isOpen, align]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => onOpen(isOpen ? null : id)}
        onMouseEnter={() => {
          if (open && open !== id) onOpen(id);
        }}
        data-topbar-menu-label
        className={`flex h-6 items-center gap-1 rounded px-2 transition-colors ${
          isOpen
            ? "bg-surface-strong text-app"
            : "text-app hover:bg-surface"
        }`}
      >
        {label}
      </button>
      {isOpen && pos && mounted && createPortal(
        <div
          role="menu"
          data-topbar-portal=""
          className="fixed z-[60] min-w-[180px] rounded-lg border border-app bg-app-elevated p-1 shadow-menu"
          style={{
            top: pos.top,
            left: pos.left,
            right: pos.right,
          }}
        >
          {children}
        </div>,
        document.body
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  shortcut,
  disabled,
  icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  shortcut?: string;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-between gap-6 rounded px-2 py-1.5 text-left text-[0.8rem] transition-colors ${
        disabled
          ? "cursor-not-allowed text-faint"
          : "text-secondary hover:bg-surface hover:text-app"
      }`}
      role="menuitem"
    >
      <span className="flex flex-1 items-center gap-2 truncate">
        {icon && <span className="shrink-0 text-current">{icon}</span>}
        <span className="truncate">{children}</span>
      </span>
      {shortcut && <span className="text-[0.7rem] text-faint">{shortcut}</span>}
    </button>
  );
}

/* Inline gear glyph for menu items. Stays small enough to sit comfortably
 * next to the label text. */
function TopBarGearIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function MenuLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="block rounded px-2 py-1.5 text-[0.8rem] text-secondary hover:bg-surface hover:text-app transition-colors"
      role="menuitem"
    >
      {children}
    </Link>
  );
}

function MenuDivider() {
  return <div className="my-1 h-px bg-app" aria-hidden="true" />;
}

/* ───────────── Mobile menu primitives ─────────────
 * Portaled flat list of every action when the hamburger is tapped.
 * Sits above the back-layer topbar/dock with z-[60]. */

function MobilePopover({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div
      data-topbar-portal=""
      className="fixed inset-x-0 top-8 z-[60] mx-2 max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-xl border border-app bg-app-elevated p-2 shadow-2xl sm:hidden"
      role="menu"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close menu"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded text-secondary hover:bg-surface hover:text-app transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      {children}
    </div>,
    document.body
  );
}

function MobileSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="px-2 pb-1 pt-1 text-[0.6rem] uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function MobileItem({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center rounded px-2 py-2 text-left text-sm text-app transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
      role="menuitem"
    >
      {children}
    </button>
  );
}
