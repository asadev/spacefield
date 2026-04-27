"use client";

/* MobileShell — iOS-style chrome rendered in place of the desktop OS when
 * the viewport is below the md breakpoint (768px).
 *
 * Behavioural contract:
 *   - Consumes the SAME hooks as DesktopApp (useWindowManager,
 *     useInstalledTools, useDockOrder, useAuth, useWorkspaces, useTheme),
 *     so workspaces / installed tools / open windows stay in sync if the
 *     user resizes from mobile to desktop and back.
 *   - One open window at a time is "active" (the window with the highest
 *     z). Other open windows live in the app switcher card stack but
 *     don't render until tapped.
 *   - The bottom dock has the four most recently-opened pinned tools +
 *     an "All apps" overflow button. The full home grid still shows
 *     every installed tool, paged 4 columns × 6 rows.
 *
 * What we deliberately DON'T do here:
 *   - Re-implement window dragging / resizing (irrelevant on mobile).
 *   - Fight the touch event system (we use plain taps + framer-motion
 *     drag for the bottom-sheets).
 *   - Expose multi-window snap. iOS doesn't have it; we don't either.
 */

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { useTheme } from "@/components/ThemeProvider";
import { TOOL_ICONS, TOOLS, toolBySlug, type NativeAppProps } from "../_data/tools-list";
import DesktopBackground from "./DesktopBackground";
import MobileSheet, { SheetList, SheetRow } from "./MobileSheet";
// Re-exports — MobileShell consumers used to import these primitives from
// here. They now live in MobileSheet so RE apps can share them. We keep
// the old names alive so nothing else has to move.
const BottomSheet = MobileSheet;
export { BottomSheet, SheetList, SheetRow };
import { useAuth } from "./useAuth";
import { useDockBadges } from "./useDockBadges";
import { useDockOrder } from "./useDockOrder";
import { useInstalledTools } from "./useInstalledTools";
import { usePendingInvites } from "./usePendingInvites";
import { useWindowManager, type WindowState } from "./useWindowManager";
import { useWorkspaces } from "./useWorkspaces";
import { useWorkspaceRole } from "./useWorkspaceRole";
import { useWorkspaceSync } from "./useWorkspaceSync";
import { useDesktopShell, DesktopShellProvider } from "./DesktopShellContext";
import AmbientSounds from "./AmbientSounds";
import ControlCenter from "./ControlCenter";
import CreateWorkspaceDialog from "./CreateWorkspaceDialog";
import ScreenshotCapture from "./ScreenshotCapture";
import SignInDialog from "./SignInDialog";
import Onboarding from "./Onboarding";
import MobileSettings from "./MobileSettings";
import MobileNotifications from "./MobileNotifications";

const STATUS_BAR_HEIGHT = 44;
const HOME_INDICATOR_HEIGHT = 24;
const DOCK_HEIGHT = 96;
const PAGE_SIZE = 24; // 4 columns x 6 rows
const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function MobileShell() {
  const { user, signOut } = useAuth();
  const { workspaces, activeId, switchWorkspace } = useWorkspaces();
  const { canAdmin } = useWorkspaceRole();
  const { resolved } = useTheme();
  // Pending workspace invites — drives the red dot on the status-bar bell.
  const { count: pendingInviteCount, refresh: refreshPendingInvites } =
    usePendingInvites();
  const {
    windows,
    hydrated: windowsHydrated,
    open,
    close,
    closeAll,
    minimize,
    focus,
  } = useWindowManager();
  const {
    hydrated: installHydrated,
    onboarded,
    installed,
    installedTools,
    isInstalled,
    install,
    uninstall,
    completeOnboarding,
  } = useInstalledTools();
  const { pinnedSlugs } = useDockOrder();
  // Match DesktopApp — keeps cloud sync flowing on mobile too.
  useWorkspaceSync();

  // Panels — only one open at once.
  const [signInOpen, setSignInOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    | "profile"
    | "workspaces"
    | "appearance"
    | "dock"
    | "widgets"
    | "notifications"
    | "sounds"
    | "account"
    | "about"
  >("profile");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [controlCenterOpen, setControlCenterOpen] = useState(false);
  const [appSwitcherOpen, setAppSwitcherOpen] = useState(false);
  const [allAppsOpen, setAllAppsOpen] = useState(false);

  // Open windows — pick the topmost (highest z, not minimized) as active.
  const activeWindow = useMemo<WindowState | null>(() => {
    const live = windows.filter((w) => !w.minimized);
    if (live.length === 0) return null;
    return [...live].sort((a, b) => b.z - a.z)[0] ?? null;
  }, [windows]);

  // Viewport — drives the active app's rendered size.
  const [vp, setVp] = useState<{ w: number; h: number }>(() => ({
    w: typeof window === "undefined" ? 390 : window.innerWidth,
    h: typeof window === "undefined" ? 844 : window.innerHeight,
  }));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () =>
      setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const handleOpenTool = useCallback(
    (slug: string, title: string, params?: Record<string, unknown>) => {
      if (!isInstalled(slug)) install(slug);
      // Close any open sheet so the new app comes to the front.
      setSettingsOpen(false);
      setNotificationsOpen(false);
      setControlCenterOpen(false);
      setAppSwitcherOpen(false);
      setAllAppsOpen(false);
      setUserMenuOpen(false);
      setWorkspaceMenuOpen(false);
      open(slug, title, params);
    },
    [isInstalled, install, open]
  );

  // Shell API — same shape native apps already expect on desktop. Crucially
  // openApp + closeWindow work identically here so no app needs to know it's
  // running in a mobile shell.
  const shellApi = useMemo(
    () => ({
      openApp: (slug: string, params?: Record<string, unknown>) => {
        const tool = toolBySlug(slug);
        handleOpenTool(slug, tool?.title ?? slug, params);
      },
      closeWindow: (id?: string) => {
        if (id) close(id);
        else if (activeWindow) close(activeWindow.id);
      },
      resolved,
    }),
    [handleOpenTool, close, activeWindow, resolved]
  );

  // Cross-tool navigation messages from iframes (same handler as Desktop).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; slug?: string; title?: string } | null;
      if (!data || data.type !== "tools-open" || !data.slug) return;
      const tool = toolBySlug(data.slug);
      handleOpenTool(data.slug, tool?.title ?? data.title ?? data.slug);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [handleOpenTool]);

  const goHome = useCallback(() => {
    if (activeWindow) {
      // iOS-style "home" — minimize the active window so the home screen
      // shows. The window is still alive in the switcher.
      minimize(activeWindow.id);
    }
  }, [activeWindow, minimize]);

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    await signOut();
  };

  const openSettings = (section: typeof settingsSection = "profile") => {
    setSettingsSection(section);
    setSettingsOpen(true);
    setUserMenuOpen(false);
  };

  // Pinned-on-mobile is the first 4 pinned, then the "All apps" launcher.
  const dockPinnedSlugs = useMemo(() => {
    const valid = pinnedSlugs.filter((s) => installed.includes(s));
    return valid.slice(0, 4);
  }, [pinnedSlugs, installed]);

  const dockTools = useMemo(
    () => dockPinnedSlugs.map((s) => toolBySlug(s)).filter(Boolean) as Array<NonNullable<ReturnType<typeof toolBySlug>>>,
    [dockPinnedSlugs]
  );

  const showOnboarding = installHydrated && !onboarded;
  const activeWorkspace = workspaces.find((w) => w.id === activeId);

  return (
    <DesktopShellProvider api={shellApi}>
      <div
        data-mobile-shell
        className="relative h-[100dvh] w-screen overflow-hidden bg-app text-app"
      >
        <DesktopBackground />

        {/* Status bar — mobile chrome top */}
        <MobileStatusBar
          workspaceName={activeWorkspace?.name ?? "Personal"}
          onWorkspaceTap={() => setWorkspaceMenuOpen(true)}
          onAvatarTap={() => setUserMenuOpen(true)}
          onNotificationsTap={() => {
            // Refresh pending-invite count when the user opens the panel
            // — they're about to act on it; sync immediately so the badge
            // disappears as soon as they accept/decline.
            refreshPendingInvites();
            setNotificationsOpen(true);
          }}
          onControlCenterTap={() => setControlCenterOpen(true)}
          pendingInviteCount={pendingInviteCount}
          user={user}
        />

        {/* Home screen — installed tools paged */}
        {windowsHydrated && installHydrated && onboarded && (
          <MobileHome
            tools={installedTools}
            onOpenTool={handleOpenTool}
            onUninstall={uninstall}
            onAllApps={() => setAllAppsOpen(true)}
          />
        )}

        {/* Active app — fills viewport minus status bar */}
        <AnimatePresence>
          {activeWindow && (
            <MobileAppHost
              key={activeWindow.id}
              win={activeWindow}
              vp={vp}
              resolved={resolved}
              onClose={() => close(activeWindow.id)}
              onHome={goHome}
              onAppSwitcher={() => setAppSwitcherOpen(true)}
              shellApi={shellApi}
            />
          )}
        </AnimatePresence>

        {/* Dock — 4 pinned + All Apps overflow */}
        {windowsHydrated && installHydrated && onboarded && !activeWindow && (
          <MobileDock
            tools={dockTools}
            onOpenTool={handleOpenTool}
            onAllApps={() => setAllAppsOpen(true)}
          />
        )}

        {/* Onboarding overlay (uses existing component — already responsive) */}
        <Onboarding
          open={showOnboarding}
          onComplete={(profession, installedSlugs) => {
            completeOnboarding(profession, installedSlugs);
          }}
        />

        {/* All-apps overlay — full grid of installed + uninstalled */}
        <AllAppsSheet
          open={allAppsOpen}
          installed={installed}
          onInstall={install}
          onUninstall={uninstall}
          onOpenTool={handleOpenTool}
          onClose={() => setAllAppsOpen(false)}
          canAdmin={canAdmin}
        />

        {/* App switcher — open windows as horizontally-scrolling cards */}
        <AppSwitcher
          open={appSwitcherOpen}
          windows={windows}
          onClose={() => setAppSwitcherOpen(false)}
          onFocus={(id) => {
            focus(id);
            setAppSwitcherOpen(false);
          }}
          onCloseWindow={(id) => close(id)}
          onCloseAll={() => {
            closeAll();
            setAppSwitcherOpen(false);
          }}
        />

        {/* User sheet (avatar tap) */}
        <UserSheet
          open={userMenuOpen}
          user={user}
          workspaceName={activeWorkspace?.name ?? "Personal"}
          onClose={() => setUserMenuOpen(false)}
          onProfile={() => openSettings("profile")}
          onSettings={() => openSettings("appearance")}
          onSwitchWorkspace={() => {
            setUserMenuOpen(false);
            setWorkspaceMenuOpen(true);
          }}
          onSignIn={() => {
            setUserMenuOpen(false);
            setSignInOpen(true);
          }}
          onSignOut={handleSignOut}
        />

        {/* Workspace switcher sheet */}
        <WorkspaceSheet
          open={workspaceMenuOpen}
          workspaces={workspaces}
          activeId={activeId}
          onClose={() => setWorkspaceMenuOpen(false)}
          onSwitch={(id) => {
            switchWorkspace(id);
            setWorkspaceMenuOpen(false);
          }}
          onCreate={() => {
            setWorkspaceMenuOpen(false);
            setCreateWorkspaceOpen(true);
          }}
          onManage={() => {
            setWorkspaceMenuOpen(false);
            openSettings("workspaces");
          }}
        />

        {/* Notifications sheet (top slide-down) */}
        <MobileNotifications
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
        />

        {/* Settings — full-screen mobile UI */}
        <MobileSettings
          open={settingsOpen}
          initialSection={settingsSection}
          onClose={() => setSettingsOpen(false)}
        />

        {/* Sign-in (component handles mobile bottom-sheet layout itself) */}
        <SignInDialog
          open={signInOpen}
          onClose={() => setSignInOpen(false)}
        />

        {/* Create workspace dialog */}
        <CreateWorkspaceDialog
          open={createWorkspaceOpen}
          onClose={() => setCreateWorkspaceOpen(false)}
        />

        {/* Control Center — slides down from the status bar on mobile.
          * Same component as desktop, different placement strategy. */}
        <ControlCenter
          open={controlCenterOpen}
          onClose={() => setControlCenterOpen(false)}
          placement="mobile"
          onOpenSettings={() => openSettings("appearance")}
          onOpenWorkspaces={() => openSettings("workspaces")}
        />

        {/* Ambient sound mixer — same component the desktop mounts.
         * Control Center can dispatch `spacefield:ambient-toggle` to
         * surface its panel. */}
        <AmbientSounds />

        {/* Screenshot capture (⌘⇧3 / ⌘⇧4) — handy on iPad keyboards. */}
        <ScreenshotCapture />
      </div>
    </DesktopShellProvider>
  );
}

/* ──────────── Status bar ──────────── */

function MobileStatusBar({
  workspaceName,
  onWorkspaceTap,
  onAvatarTap,
  onNotificationsTap,
  onControlCenterTap,
  pendingInviteCount,
  user,
}: {
  workspaceName: string;
  onWorkspaceTap: () => void;
  onAvatarTap: () => void;
  onNotificationsTap: () => void;
  onControlCenterTap: () => void;
  pendingInviteCount: number;
  user: ReturnType<typeof useAuth>["user"];
}) {
  const [time, setTime] = useState<string>(() => formatTime(new Date()));
  useEffect(() => {
    const tick = () => setTime(formatTime(new Date()));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  const avatarUrl =
    (user?.user_metadata?.custom_avatar_url as string | undefined) ??
    (user?.user_metadata?.avatar_url as string | undefined) ??
    null;
  const avatarInitial = (
    user?.user_metadata?.full_name?.[0] ??
    user?.user_metadata?.name?.[0] ??
    user?.email?.[0] ??
    "U"
  ).toString().toUpperCase();

  return (
    <div
      className="pointer-events-auto fixed inset-x-0 top-0 z-30 flex items-center justify-between px-4 text-app"
      style={{ height: STATUS_BAR_HEIGHT }}
    >
      <span className="text-[13px] font-semibold tabular-nums">{time}</span>
      <button
        type="button"
        onClick={onWorkspaceTap}
        className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-secondary transition-colors active:bg-surface"
        aria-label={`Workspace: ${workspaceName}. Tap to switch.`}
      >
        {workspaceName}
      </button>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onControlCenterTap}
          aria-label="Open Control Center"
          className="flex h-11 w-11 -mr-2 items-center justify-center rounded-full text-app transition-colors active:bg-surface"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="4" y1="6" x2="14" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="11" y2="18" />
            <circle cx="17" cy="6" r="2" fill="currentColor" />
            <circle cx="14" cy="18" r="2" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onNotificationsTap}
          aria-label={
            pendingInviteCount > 0
              ? `Notifications (${pendingInviteCount} pending invite${pendingInviteCount === 1 ? "" : "s"})`
              : "Notifications"
          }
          className="relative flex h-7 w-7 items-center justify-center rounded-full text-app transition-colors active:bg-surface"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 003.4 0" />
          </svg>
          {pendingInviteCount > 0 && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-[color:var(--bg)]"
            />
          )}
        </button>
        <button
          type="button"
          onClick={onAvatarTap}
          aria-label="User menu"
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-tool-accent text-[11px] font-semibold text-white ring-1 ring-white/20 transition-transform active:scale-95"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            avatarInitial
          )}
        </button>
      </div>
    </div>
  );
}

function formatTime(d: Date): string {
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

/* ──────────── Home grid ──────────── */

function MobileHome({
  tools,
  onOpenTool,
  onUninstall,
  onAllApps,
}: {
  tools: ReturnType<typeof useInstalledTools>["installedTools"];
  onOpenTool: (slug: string, title: string) => void;
  onUninstall: (slug: string) => void;
  onAllApps: () => void;
}) {
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const editTimeoutRef = useRef<number | null>(null);

  const pages = useMemo(() => {
    const chunks: typeof tools[] = [];
    for (let i = 0; i < tools.length; i += PAGE_SIZE) {
      chunks.push(tools.slice(i, i + PAGE_SIZE));
    }
    if (chunks.length === 0) chunks.push([]);
    return chunks;
  }, [tools]);

  const onPanEnd = (_: unknown, info: PanInfo) => {
    const threshold = 60;
    if (info.offset.x < -threshold && page < pages.length - 1) {
      setPage(page + 1);
    } else if (info.offset.x > threshold && page > 0) {
      setPage(page - 1);
    }
  };

  const startEditing = () => {
    if (editTimeoutRef.current) window.clearTimeout(editTimeoutRef.current);
    editTimeoutRef.current = window.setTimeout(() => {
      setEditing(true);
    }, 500);
  };

  const cancelEditing = () => {
    if (editTimeoutRef.current) {
      window.clearTimeout(editTimeoutRef.current);
      editTimeoutRef.current = null;
    }
  };

  // Tap outside while editing → exit edit mode (iOS jiggle behaviour).
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditing(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing]);

  return (
    <div
      className="absolute inset-0 z-10 overflow-hidden"
      style={{
        paddingTop: STATUS_BAR_HEIGHT,
        paddingBottom: DOCK_HEIGHT + HOME_INDICATOR_HEIGHT,
      }}
    >
      <motion.div
        className="flex h-full w-full touch-pan-y"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onPanEnd={onPanEnd}
        animate={{ x: -page * 100 + "%" }}
        transition={{ type: "tween", ease: EASE, duration: 0.28 }}
        style={{ width: `${pages.length * 100}%` }}
      >
        {pages.map((items, pageIdx) => (
          <div
            key={pageIdx}
            className="grid h-full w-full shrink-0 grid-cols-4 content-start gap-y-5 px-5 pt-4"
            style={{ width: `${100 / pages.length}%` }}
          >
            {items.map((t) => (
              <HomeIcon
                key={t.slug}
                title={t.title}
                iconKey={t.icon}
                editing={editing}
                onTap={() => {
                  if (editing) {
                    setEditing(false);
                    return;
                  }
                  cancelEditing();
                  onOpenTool(t.slug, t.title);
                }}
                onPressStart={() => startEditing()}
                onPressEnd={cancelEditing}
                onUninstall={() => onUninstall(t.slug)}
              />
            ))}
            {/* Empty state on first page when no tools installed */}
            {pageIdx === 0 && items.length === 0 && (
              <div className="col-span-4 flex flex-col items-center gap-3 pt-12 text-center">
                <p className="text-sm text-secondary">No apps yet.</p>
                <button
                  type="button"
                  onClick={onAllApps}
                  className="rounded-full bg-tool-accent px-4 py-2 text-sm font-medium text-white transition-opacity active:opacity-80"
                >
                  Browse the App Store
                </button>
              </div>
            )}
          </div>
        ))}
      </motion.div>

      {/* Page dots */}
      {pages.length > 1 && (
        <div
          className="absolute inset-x-0 flex justify-center gap-1.5"
          style={{ bottom: DOCK_HEIGHT + HOME_INDICATOR_HEIGHT + 6 }}
        >
          {pages.map((_, i) => (
            <button
              type="button"
              key={i}
              aria-label={`Go to page ${i + 1}`}
              onClick={() => setPage(i)}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i === page ? "bg-app" : "bg-app/40"
              }`}
            />
          ))}
        </div>
      )}

      {editing && (
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="absolute right-4 z-20 rounded-full bg-app-elevated px-3 py-1 text-xs font-medium text-app shadow"
          style={{ top: STATUS_BAR_HEIGHT + 8 }}
        >
          Done
        </button>
      )}
    </div>
  );
}

function HomeIcon({
  title,
  iconKey,
  editing,
  onTap,
  onPressStart,
  onPressEnd,
  onUninstall,
}: {
  title: string;
  iconKey: keyof typeof TOOL_ICONS;
  editing: boolean;
  onTap: () => void;
  onPressStart: () => void;
  onPressEnd: () => void;
  onUninstall: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <motion.button
        type="button"
        onClick={onTap}
        onPointerDown={onPressStart}
        onPointerUp={onPressEnd}
        onPointerCancel={onPressEnd}
        animate={editing ? { rotate: [0, -1.5, 1.5, -1.5, 0] } : { rotate: 0 }}
        transition={
          editing
            ? { duration: 0.4, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.2 }
        }
        whileTap={{ scale: 0.92 }}
        aria-label={title}
        className="relative flex h-16 w-16 items-center justify-center rounded-[20px] bg-tool-accent-soft text-tool-accent shadow-sm ring-1 ring-inset ring-tool-accent/20"
      >
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d={TOOL_ICONS[iconKey] ?? TOOL_ICONS.home} />
        </svg>
        {editing && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUninstall();
            }}
            aria-label={`Uninstall ${title}`}
            className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-app-elevated text-app shadow ring-1 ring-app"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
            </svg>
          </button>
        )}
      </motion.button>
      <span className="line-clamp-1 max-w-full text-center text-[10px] font-medium leading-tight text-app">
        {title}
      </span>
    </div>
  );
}

/* ──────────── Dock ──────────── */

function MobileDock({
  tools,
  onOpenTool,
  onAllApps,
}: {
  tools: Array<NonNullable<ReturnType<typeof toolBySlug>>>;
  onOpenTool: (slug: string, title: string) => void;
  onAllApps: () => void;
}) {
  const { getCount } = useDockBadges();
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center"
      style={{
        height: DOCK_HEIGHT + HOME_INDICATOR_HEIGHT,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="pointer-events-auto mx-3 mb-4 flex w-full max-w-md items-center justify-around gap-2 rounded-[28px] border border-app bg-app-elevated/90 px-3 py-2 shadow-2xl backdrop-blur-xl">
        {tools.map((t) => (
          <DockIcon
            key={t.slug}
            title={t.title}
            iconKey={t.icon}
            onTap={() => onOpenTool(t.slug, t.title)}
            badge={getCount(t.slug)}
          />
        ))}
        <DockIcon
          title="All apps"
          iconKey="dots9"
          onTap={onAllApps}
        />
      </div>
      <HomeIndicator />
    </div>
  );
}

function HomeIndicator() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex justify-center"
      style={{ bottom: 6 }}
    >
      <div className="h-[5px] w-[140px] rounded-full bg-app/60" />
    </div>
  );
}

function DockIcon({
  title,
  iconKey,
  onTap,
  badge,
}: {
  title: string;
  iconKey: keyof typeof TOOL_ICONS;
  onTap: () => void;
  /** Optional notification count — renders a small red bubble if > 0. */
  badge?: number;
}) {
  return (
    <motion.button
      type="button"
      onClick={onTap}
      whileTap={{ scale: 0.9 }}
      aria-label={
        badge && badge > 0 ? `${title} (${badge} notifications)` : title
      }
      className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-tool-accent-soft text-tool-accent ring-1 ring-inset ring-tool-accent/20"
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d={TOOL_ICONS[iconKey] ?? TOOL_ICONS.home} />
      </svg>
      {badge !== undefined && badge > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-app-elevated"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </motion.button>
  );
}

/* ──────────── Active app host ──────────── */

const lazyCache = new Map<string, ComponentType<NativeAppProps>>();

function MobileAppHost({
  win,
  vp,
  resolved,
  onClose,
  onHome,
  onAppSwitcher,
  shellApi,
}: {
  win: WindowState;
  vp: { w: number; h: number };
  resolved: "dark" | "light";
  onClose: () => void;
  onHome: () => void;
  onAppSwitcher: () => void;
  shellApi: ReturnType<typeof useDesktopShell>;
}) {
  const tool = useMemo(() => toolBySlug(win.slug), [win.slug]);
  const dragY = useMotionValue(0);
  const opacity = useTransform(dragY, [0, 200], [1, 0.6]);
  const scale = useTransform(dragY, [0, 200], [1, 0.92]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) {
      onHome();
    } else {
      // Spring back — handled by motion's animate
      dragY.set(0);
    }
  };

  const innerHeight = vp.h - STATUS_BAR_HEIGHT;
  const innerWidth = vp.w;

  let App = lazyCache.get(win.slug);
  if (!App && tool?.app) {
    App = lazy(tool.app);
    lazyCache.set(win.slug, App);
  }

  const iframeSrc = useMemo(() => {
    if (tool?.app) return null;
    const base = tool?.route ?? `/tools/${win.slug}`;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}frame=1&theme=${resolved}`;
  }, [tool, win.slug, resolved]);

  return (
    <motion.div
      key={win.id}
      initial={{ opacity: 0, scale: 0.94, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: 16 }}
      transition={{ type: "tween", ease: EASE, duration: 0.28 }}
      className="absolute inset-x-0 z-30 overflow-hidden bg-app"
      style={{
        top: STATUS_BAR_HEIGHT,
        height: innerHeight,
        opacity,
        scale,
      }}
    >
      {/* App-level top affordance — drag handle + close + switcher */}
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 240 }}
        dragElastic={0.4}
        onDrag={(_, info) => dragY.set(Math.max(0, info.offset.y))}
        onDragEnd={onDragEnd}
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-1.5"
        style={{ touchAction: "none" }}
      >
        <button
          type="button"
          onClick={onHome}
          aria-label="Home"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-app-elevated/80 text-app backdrop-blur active:bg-surface"
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
            <path d="M6 9l6-6 6 6" />
          </svg>
        </button>
        <span className="rounded-full bg-app-elevated/70 px-2.5 py-0.5 text-[11px] font-medium text-app backdrop-blur">
          {win.title}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onAppSwitcher}
            aria-label="Open app switcher"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-app-elevated/80 text-app backdrop-blur active:bg-surface"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-app-elevated/80 text-app backdrop-blur active:bg-surface"
          >
            <svg
              width="13"
              height="13"
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
      </motion.div>

      {/* App body — native React component or iframe fallback */}
      <div className="absolute inset-0">
        {tool?.app && App ? (
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                Loading…
              </div>
            }
          >
            <App
              windowId={win.id}
              width={innerWidth}
              height={innerHeight}
              initialParams={win.initialParams}
              initialParamsKey={win.initialParamsKey}
              resolved={resolved}
              openApp={shellApi.openApp}
              closeWindow={onClose}
            />
          </Suspense>
        ) : iframeSrc ? (
          <iframe
            src={iframeSrc}
            title={win.title}
            className="h-full w-full border-0"
            style={{ colorScheme: "light dark", backgroundColor: "var(--bg)" }}
          />
        ) : null}
      </div>
    </motion.div>
  );
}

/* ──────────── App switcher (card stack) ──────────── */

function AppSwitcher({
  open,
  windows,
  onClose,
  onFocus,
  onCloseWindow,
  onCloseAll,
}: {
  open: boolean;
  windows: WindowState[];
  onClose: () => void;
  onFocus: (id: string) => void;
  onCloseWindow: (id: string) => void;
  onCloseAll: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[70] bg-app/85 backdrop-blur-xl"
        >
          <div className="absolute inset-0 flex flex-col">
            <div className="flex items-center justify-between px-5 pt-12 pb-3">
              <span className="text-base font-semibold text-app">Open apps</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-app bg-app-elevated text-app transition-colors active:bg-surface"
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
            <div className="flex-1 overflow-x-auto overflow-y-hidden px-5 pb-6">
              {windows.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-secondary">
                  No apps open.
                </div>
              ) : (
                <div className="flex h-full items-center gap-3">
                  {windows.map((w) => {
                    const tool = toolBySlug(w.slug);
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => onFocus(w.id)}
                        className="relative flex h-[60vh] w-[68vw] max-w-[320px] shrink-0 flex-col overflow-hidden rounded-[28px] border border-app bg-app-elevated text-left shadow-2xl transition-transform active:scale-[0.98]"
                      >
                        <div className="flex items-center gap-2 border-b border-app px-4 py-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tool-accent-soft text-tool-accent">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d={TOOL_ICONS[tool?.icon ?? "home"] ?? TOOL_ICONS.home} />
                            </svg>
                          </span>
                          <span className="flex-1 truncate text-sm font-medium text-app">
                            {w.title}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCloseWindow(w.id);
                            }}
                            aria-label={`Close ${w.title}`}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-secondary active:bg-surface"
                          >
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
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex-1 bg-app p-4 text-xs text-secondary">
                          Tap to switch back to {w.title}.
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {windows.length > 0 && (
              <div className="border-t border-app bg-app-elevated px-5 py-3 text-center">
                <button
                  type="button"
                  onClick={onCloseAll}
                  className="text-sm font-medium text-rose-500 active:opacity-70"
                >
                  Close all
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ──────────── All apps overlay ──────────── */

function AllAppsSheet({
  open,
  installed,
  onInstall,
  onUninstall,
  onOpenTool,
  onClose,
  canAdmin,
}: {
  open: boolean;
  installed: string[];
  onInstall: (slug: string) => void;
  onUninstall: (slug: string) => void;
  onOpenTool: (slug: string, title: string) => void;
  onClose: () => void;
  canAdmin: boolean;
}) {
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return TOOLS;
    return TOOLS.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query)
    );
  }, [q]);

  return (
    <BottomSheet open={open} onClose={onClose} title="All apps">
      <div className="px-5 pb-3">
        <input
          type="search"
          placeholder="Search apps"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-xl border border-app bg-app px-4 py-3 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
        />
      </div>
      <div className="grid grid-cols-4 gap-y-5 px-5 pb-8">
        {list.map((t) => {
          const isOn = installed.includes(t.slug);
          return (
            <div key={t.slug} className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (isOn) {
                    onOpenTool(t.slug, t.title);
                    onClose();
                  } else if (canAdmin) {
                    onInstall(t.slug);
                  }
                }}
                aria-label={t.title}
                className="relative flex h-16 w-16 items-center justify-center rounded-[20px] bg-tool-accent-soft text-tool-accent ring-1 ring-inset ring-tool-accent/20 active:scale-95"
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d={TOOL_ICONS[t.icon] ?? TOOL_ICONS.home} />
                </svg>
                {!isOn && canAdmin && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-app-elevated text-app shadow ring-1 ring-app">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                )}
              </button>
              <span className="line-clamp-1 max-w-[68px] text-center text-[10px] text-app">
                {t.title}
              </span>
              {isOn && (
                <button
                  type="button"
                  onClick={() => onUninstall(t.slug)}
                  className="text-[9px] uppercase tracking-[0.12em] text-muted active:text-app"
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
}

/* ──────────── User sheet ──────────── */

function UserSheet({
  open,
  user,
  workspaceName,
  onClose,
  onProfile,
  onSettings,
  onSwitchWorkspace,
  onSignIn,
  onSignOut,
}: {
  open: boolean;
  user: ReturnType<typeof useAuth>["user"];
  workspaceName: string;
  onClose: () => void;
  onProfile: () => void;
  onSettings: () => void;
  onSwitchWorkspace: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const avatarUrl =
    (user?.user_metadata?.custom_avatar_url as string | undefined) ??
    (user?.user_metadata?.avatar_url as string | undefined) ??
    null;
  return (
    <BottomSheet open={open} onClose={onClose} title="Account">
      <div className="px-5 pb-6">
        <div className="flex items-center gap-3 rounded-2xl border border-app bg-app p-4">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-tool-accent text-base font-semibold text-white">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : user ? (
              (
                user.user_metadata?.full_name?.[0] ??
                user.user_metadata?.name?.[0] ??
                user.email?.[0] ??
                "U"
              ).toString().toUpperCase()
            ) : (
              "?"
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-app">
              {user
                ? user.user_metadata?.full_name ??
                  user.user_metadata?.name ??
                  user.email?.split("@")[0]
                : "Signed out"}
            </div>
            <div className="truncate text-xs text-muted">
              {user?.email ?? "Sign in to sync across devices"}
            </div>
          </div>
        </div>

        <SheetList>
          <SheetRow label="Workspace" trailing={workspaceName} onClick={onSwitchWorkspace} />
          {user && <SheetRow label="Profile" onClick={onProfile} />}
          <SheetRow label="Settings" onClick={onSettings} />
        </SheetList>

        {user ? (
          <button
            type="button"
            onClick={onSignOut}
            className="mt-4 w-full rounded-xl border border-app bg-app py-3 text-sm font-medium text-rose-500 transition-colors active:bg-surface"
          >
            Sign out
          </button>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="mt-4 w-full rounded-xl bg-tool-accent py-3 text-sm font-semibold text-white transition-opacity active:opacity-80"
          >
            Sign in
          </button>
        )}
      </div>
    </BottomSheet>
  );
}

/* ──────────── Workspace sheet ──────────── */

function WorkspaceSheet({
  open,
  workspaces,
  activeId,
  onClose,
  onSwitch,
  onCreate,
  onManage,
}: {
  open: boolean;
  workspaces: ReturnType<typeof useWorkspaces>["workspaces"];
  activeId: string;
  onClose: () => void;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onManage: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Workspaces">
      <div className="px-5 pb-6">
        <SheetList>
          {workspaces.map((w) => (
            <SheetRow
              key={w.id}
              label={w.name}
              onClick={() => onSwitch(w.id)}
              trailing={
                w.id === activeId ? (
                  <span className="text-tool-accent">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  </span>
                ) : undefined
              }
            />
          ))}
        </SheetList>
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 w-full rounded-xl bg-tool-accent py-3 text-sm font-semibold text-white transition-opacity active:opacity-80"
        >
          Create workspace
        </button>
        <button
          type="button"
          onClick={onManage}
          className="mt-2 w-full rounded-xl border border-app bg-app py-3 text-sm font-medium text-app transition-colors active:bg-surface"
        >
          Manage workspaces
        </button>
      </div>
    </BottomSheet>
  );
}

/* ──────────── Bottom-sheet primitive (BottomSheet/SheetList/SheetRow)
 *  is implemented in ./MobileSheet.tsx and re-exported at the top of this
 *  file so existing imports from "./MobileShell" continue to work. The
 *  primitive lives in its own file so individual RE apps can use it
 *  without pulling in the entire shell. ──────────── */
