"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { TOOLS, toolBySlug, type ToolItem } from "../_data/tools-list";
import { DesktopShellProvider } from "./DesktopShellContext";
import AppStore from "./AppStore";
import DesktopBackground from "./DesktopBackground";
import Dock from "./Dock";
import Launchpad from "./Launchpad";
import MissionControl from "./MissionControl";
import NotificationCenter from "./NotificationCenter";
import Onboarding from "./Onboarding";
import SnapPreview from "./SnapPreview";
import TopBar from "./TopBar";
import { useInstalledTools } from "./useInstalledTools";
import { useDockOrder } from "./useDockOrder";
import DockCustomizer from "./DockCustomizer";
import IconStylePicker from "./IconStylePicker";
import SettingsPanel from "./SettingsPanel";
import Widgets from "./Widgets";
import WidgetGallery from "./WidgetGallery";
import WallpaperPicker from "./WallpaperPicker";
import Window from "./Window";
import { useWindowManager } from "./useWindowManager";
import { useDesktopSounds } from "./useDesktopSounds";
import { useWorkspaceKey, useWorkspaces, WorkspaceProvider } from "./useWorkspaces";
import CreateWorkspaceDialog from "./CreateWorkspaceDialog";
import SignInDialog from "./SignInDialog";
import { AuthProvider, useAuth } from "./useAuth";
import { useWorkspaceSync } from "./useWorkspaceSync";

/* The exported default is the WorkspaceProvider + a key-based remount
 * gate. When the user switches workspace, activeId changes, the inner
 * DesktopApp remounts, and every hook re-reads storage from the new
 * namespace. No surgery needed in individual hooks. */
export default function Desktop() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <DesktopGate />
      </WorkspaceProvider>
    </AuthProvider>
  );
}

function DesktopGate() {
  const { activeId, hydrated } = useWorkspaces();
  if (!hydrated) {
    // Avoid mounting hooks against an empty workspace id during the brief
    // window before WorkspaceProvider hydrates from localStorage.
    return <div className="fixed inset-0 bg-app" aria-hidden="true" />;
  }
  return <DesktopApp key={activeId} />;
}

function DesktopApp() {
  const {
    windows,
    hydrated: windowsHydrated,
    open,
    close,
    closeAll,
    minimize,
    minimizeAll,
    focus,
    toggleMaximize,
    move,
    resize,
    snap,
    unsnap,
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
    resetOnboarding,
  } = useInstalledTools();

  const {
    pinnedSlugs,
    setPinnedSlugs,
    togglePin,
    movePin,
    resetToDefault: resetDockToDefault,
  } = useDockOrder();

  const [launchpadOpen, setLaunchpadOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [dockCustomizerOpen, setDockCustomizerOpen] = useState(false);
  const [widgetGalleryOpen, setWidgetGalleryOpen] = useState(false);
  const [wallpaperPickerOpen, setWallpaperPickerOpen] = useState(false);
  const [iconStylePickerOpen, setIconStylePickerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [missionControlOpen, setMissionControlOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const { user: authUser, signOut: authSignOut } = useAuth();
  useWorkspaceSync();
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const { resolved } = useTheme();
  const sounds = useDesktopSounds();

  useEffect(() => {
    const read = () =>
      setTheme(
        (document.documentElement.getAttribute("data-theme") as
          | "light"
          | "dark"
          | null) ?? "dark"
      );
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

  // ⌘K / Ctrl-K toggles Launchpad. ⌘, opens Settings (macOS standard).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setLaunchpadOpen((v) => !v);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((v) => !v);
        return;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // F3 OR ⌘↑ toggles Mission Control (window exposé). F3 is the macOS
  // standard; ⌘↑ is a friendly fallback for keyboards where F3 is bound
  // to brightness/media. We don't trap the event when typing inside an
  // input/textarea so users can still press ↑ in form fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const editable =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      const isF3 = e.key === "F3";
      const isCmdUp =
        (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === "ArrowUp";
      if (editable && !isF3) return;
      if (isF3 || isCmdUp) {
        e.preventDefault();
        setMissionControlOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Installed tools that are in the pinned-priority list, in that order.
  // Pinned order is now user-customizable via useDockOrder.
  const pinned: ToolItem[] = useMemo(() => {
    return pinnedSlugs
      .map((slug) => (installed.includes(slug) ? toolBySlug(slug) : null))
      .filter(Boolean) as ToolItem[];
  }, [installed, pinnedSlugs]);

  // Installed tools NOT in the pinned list — shown after the divider
  const extraInstalled: ToolItem[] = useMemo(() => {
    const pinSet = new Set(pinnedSlugs);
    return installedTools.filter((t) => !pinSet.has(t.slug));
  }, [installedTools, pinnedSlugs]);

  const handleOpenTool = (
    slug: string,
    title: string,
    params?: Record<string, unknown>,
  ) => {
    // Auto-install if user opens a tool from the Store
    if (!isInstalled(slug)) install(slug);
    open(slug, title, params);
    sounds.tap();
  };

  // Shell API exposed to native apps via DesktopShellContext. openApp lets
  // any tool launch / focus another tool with intent params (e.g. opening
  // Listings pre-selected). closeWindow closes the focused window or by id.
  const shellApi = useMemo(
    () => ({
      openApp: (slug: string, params?: Record<string, unknown>) => {
        const tool = toolBySlug(slug);
        handleOpenTool(slug, tool?.title ?? slug, params);
      },
      closeWindow: (id?: string) => {
        if (id) close(id);
        else if (windows.length > 0) {
          const top = [...windows].sort((a, b) => b.z - a.z)[0];
          close(top.id);
        }
      },
      resolved,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [installed, windows, resolved]
  );

  // Listen for tool-to-tool navigation requests from inside iframes.
  // The framed inner page (themeInitScript) intercepts clicks on links
  // to other tools and posts here instead of navigating in-place.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installed]);

  const handleSignOut = async () => {
    await authSignOut();
  };

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {}
    setTheme(next);
  };

  const handleUninstall = (slug: string) => {
    // Close any open window of this tool too
    const openWin = windows.find((w) => w.slug === slug);
    if (openWin) close(openWin.id);
    // Drop from pinned dock order so we don't render a phantom slot.
    if (pinnedSlugs.includes(slug)) {
      setPinnedSlugs(pinnedSlugs.filter((s) => s !== slug));
    }
    uninstall(slug);
    sounds.tap();
  };

  // Wrappers for sound feedback on key UI events. We deliberately avoid
  // wrapping `open` itself — opening a tool from the dock plays a tap, but
  // the cross-app `openApp` shell call (used by tools navigating to other
  // tools) stays silent to avoid double-tap.
  const handleInstall = (slug: string) => {
    install(slug);
    sounds.tap();
  };

  const handleCloseWindow = (id: string) => {
    close(id);
    sounds.tap();
  };

  const openLaunchpad = () => {
    setLaunchpadOpen(true);
    sounds.tap();
  };

  const openStore = () => {
    setStoreOpen(true);
    sounds.tap();
  };

  const WINDOWS_V1_KEY = useWorkspaceKey("tools-desktop-windows-v1");
  const WIDGETS_V2_KEY = useWorkspaceKey("tools-desktop-widgets-v2");

  const handleResetWorkspace = () => {
    closeAll();
    resetOnboarding();
    try {
      localStorage.removeItem(WINDOWS_V1_KEY);
      localStorage.removeItem(WIDGETS_V2_KEY);
    } catch {}
  };

  const hasWindows = windows.length > 0;
  const showOnboarding = installHydrated && !onboarded;

  // Pinned for dock prop needs to include BOTH pinned + extra installed
  // as "pinned" for simpler Dock rendering — Dock already treats extras
  // separately via the windows param. Here we just feed all installed
  // tools in priority order. Non-pinned installed tools go to the
  // "extraOpen" bucket only when a window is open; otherwise they show
  // alongside pinned. So the simplest approach: merge them for dock.
  const dockPinned = [...pinned, ...extraInstalled];

  return (
    <DesktopShellProvider api={shellApi}>
    <div data-tools-desktop className="relative h-[100dvh] w-screen overflow-hidden">
      <DesktopBackground />

      <TopBar
        user={authUser}
        onSignIn={() => setSignInOpen(true)}
        windows={windows}
        onLaunchpad={openLaunchpad}
        onStore={openStore}
        onCustomizeDock={() => setDockCustomizerOpen(true)}
        onCustomizeWidgets={() => setWidgetGalleryOpen(true)}
        onCustomizeWallpaper={() => setWallpaperPickerOpen(true)}
        onCustomizeIconStyle={() => setIconStylePickerOpen(true)}
        onCloseAll={closeAll}
        onMinimizeAll={minimizeAll}
        onResetWorkspace={handleResetWorkspace}
        onFocusWindow={focus}
        onSignOut={handleSignOut}
        theme={theme}
        onToggleTheme={toggleTheme}
        soundsMuted={sounds.muted}
        onToggleSounds={sounds.toggleMute}
        onOpenNotifications={() => setNotificationsOpen((v) => !v)}
        notificationsOpen={notificationsOpen}
        onMissionControl={() => setMissionControlOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onCreateWorkspace={() => setCreateWorkspaceOpen(true)}
      />

      {/* Onboarding takes priority when incomplete */}
      <Onboarding
        open={showOnboarding}
        onComplete={(profession, installedSlugs) => {
          completeOnboarding(profession, installedSlugs);
        }}
      />

      {/* Widgets — always present once onboarded, like macOS desktop widgets.
       * They sit behind windows (z-10 vs z-20) so they're never in the way,
       * but they remain draggable/resizable wherever they're not covered. */}
      {windowsHydrated && onboarded && (
        <Widgets onOpenTool={handleOpenTool} />
      )}

      {/* Empty-state hint — only shown when there are no windows.
        * Text floats directly on the wallpaper (which is theme-independent
        * — could be a dark gradient, a photo, or an interactive canvas).
        * Using theme tokens (text-app/text-secondary) breaks readability
        * when the user is in light mode but has chosen a dark wallpaper:
        * dark theme text on dark wallpaper = invisible. So this hint
        * always renders light + drop-shadow regardless of theme. */}
      {windowsHydrated && onboarded && windows.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-8 text-center [text-shadow:0_2px_8px_rgba(0,0,0,0.6)]">
          <h1
            className="text-3xl font-bold tracking-tight sm:text-5xl"
            style={{ color: "#ffffff" }}
          >
            What do you want to work on?
          </h1>
          <p
            className="mt-3 max-w-xl text-sm sm:text-base"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            Pick a tool from the dock, or press{" "}
            <kbd
              className="rounded px-1.5 py-0.5 text-[0.7rem] font-mono"
              style={{
                color: "#ffffff",
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(255,255,255,0.30)",
              }}
            >
              ⌘ K
            </kbd>{" "}
            for all your tools.{" "}
            <button
              type="button"
              onClick={openStore}
              className="pointer-events-auto underline underline-offset-2"
              style={{ color: "rgba(255,255,255,0.85)" }}
            >
              Browse the Store
            </button>{" "}
            for more.
          </p>
        </div>
      )}

      {/* Edge-snap zone preview — rendered above the desktop background but
       * below the windows so the dragging window stays on top. Only visible
       * while a title-bar drag's cursor is in a snap zone. */}
      <div className="pointer-events-none absolute inset-0 z-40">
        <SnapPreview />
      </div>

      {/* Windows — wrapper is pointer-events-none so the container itself
       * doesn't block widget clicks at z=10-13 when no windows exist.
       * Each Window opts back in via its own motion.div which sets
       * pointer-events explicitly. */}
      <div className="pointer-events-none absolute inset-0 z-20">
        <AnimatePresence>
          {windows.map((w) => (
            <Window
              key={w.id}
              win={w}
              onClose={() => handleCloseWindow(w.id)}
              onMinimize={() => minimize(w.id)}
              onMaximize={() => toggleMaximize(w.id)}
              onFocus={() => focus(w.id)}
              onMove={(x, y) => move(w.id, x, y)}
              onResize={(ww, hh) => resize(w.id, ww, hh)}
              onSnap={(x, y, ww, hh) => snap(w.id, x, y, ww, hh)}
              onUnsnap={(x, y) => unsnap(w.id, x, y)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Launchpad — shows installed tools */}
      <Launchpad
        open={launchpadOpen}
        onClose={() => setLaunchpadOpen(false)}
        onOpenTool={handleOpenTool}
        onUninstall={handleUninstall}
        onStore={openStore}
        items={installedTools}
      />

      {/* App Store — browse all, install / uninstall */}
      <AppStore
        open={storeOpen}
        onClose={() => setStoreOpen(false)}
        isInstalled={isInstalled}
        onInstall={handleInstall}
        onUninstall={handleUninstall}
        onOpenTool={handleOpenTool}
      />

      {/* Dock — always visible at the back layer (z-[1]). Any window covers it. */}
      <Dock
        pinned={dockPinned}
        windows={windows}
        onLaunchpad={openLaunchpad}
        onStore={openStore}
        onOpenTool={handleOpenTool}
        onFocusWindow={focus}
        onUninstall={handleUninstall}
      />

      {/* Dock Customizer — reorder + pin/unpin */}
      <DockCustomizer
        open={dockCustomizerOpen}
        onClose={() => setDockCustomizerOpen(false)}
        installedTools={installedTools}
        pinnedSlugs={pinnedSlugs}
        setPinnedSlugs={setPinnedSlugs}
        togglePin={togglePin}
        movePin={movePin}
        resetToDefault={resetDockToDefault}
      />

      {/* Widget Gallery — pick which desktop widgets are visible */}
      <WidgetGallery
        open={widgetGalleryOpen}
        onClose={() => setWidgetGalleryOpen(false)}
      />

      {/* Wallpaper Picker — choose desktop background */}
      <WallpaperPicker
        open={wallpaperPickerOpen}
        onClose={() => setWallpaperPickerOpen(false)}
      />

      {/* Icon Style Picker — pick how dock + Launchpad icons render */}
      <IconStylePicker
        open={iconStylePickerOpen}
        onClose={() => setIconStylePickerOpen(false)}
      />

      {/* Notification Center — right-side slide-in panel toggled from TopBar */}
      <NotificationCenter
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />

      {/* Mission Control — F3 / ⌘↑ / TopBar Window menu. Stylised cards
       * for every open window; click to focus, Esc to dismiss. */}
      <MissionControl
        open={missionControlOpen}
        windows={windows}
        onFocus={focus}
        onCloseWindow={handleCloseWindow}
        onCloseAll={closeAll}
        onClose={() => setMissionControlOpen(false)}
      />

      {/* Settings — unified macOS-style System Settings clone. ⌘, opens it.
       * Each section reads/writes its own localStorage key via existing
       * hooks (useIconStyle, useDesktopSounds, useActiveWidgets, etc). */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenWallpaper={() => setWallpaperPickerOpen(true)}
        onOpenDockCustomizer={() => setDockCustomizerOpen(true)}
        onOpenWidgetGallery={() => setWidgetGalleryOpen(true)}
        onResetWorkspace={handleResetWorkspace}
      />

      {/* Floating "+ Widgets" button — bottom-right, tucked above the
       * always-visible dock so they don't fight visually. Sits at z-[1]
       * alongside the dock as a back-layer affordance; only shows when no
       * windows are open, so we don't need to worry about windows covering
       * it (they sit at z-10+ when present and would correctly overlap). */}
      {windowsHydrated && onboarded && !hasWindows && (
        <button
          type="button"
          onClick={() => setWidgetGalleryOpen(true)}
          aria-label="Add widget"
          title="Add widget"
          className="fixed bottom-32 right-6 z-[1] inline-flex items-center gap-1.5 rounded-full border border-app bg-app-elevated/80 px-3 py-1.5 text-[0.72rem] font-medium text-app shadow-lg backdrop-blur-xl transition-colors hover:bg-surface"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Widgets
        </button>
      )}

      {/* Create-Workspace dialog — opened from TopBar File menu */}
      <CreateWorkspaceDialog
        open={createWorkspaceOpen}
        onClose={() => setCreateWorkspaceOpen(false)}
      />

      {/* Sign-in dialog — opened from TopBar avatar / "Sign in" item */}
      <SignInDialog
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
      />
    </div>
    </DesktopShellProvider>
  );
}
