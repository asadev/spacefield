"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "@/components/ThemeProvider";
import { TOOLS, toolBySlug, type ToolItem } from "../_data/tools-list";
import { DesktopShellProvider } from "./DesktopShellContext";
/* Mobile-perf (Wave 4 Z2): AmbientSounds, ScreenshotCapture, and
 * Onboarding are all below-the-fold for first paint on the desktop
 * shell. AmbientSounds doesn't render anything until the user enables
 * a track; ScreenshotCapture only mounts an event listener for the
 * Cmd-Shift-3/4 hotkeys; Onboarding is gated on `showOnboarding`. Defer
 * all three so they don't widen the cold-load JS for the OS shell. The
 * Cmd-Shift hotkeys are still captured because ScreenshotCapture mounts
 * within ~1 RAF of hydration — the user can't hit them earlier. */
const AmbientSounds = dynamic(() => import("./AmbientSounds"), {
  ssr: false,
  loading: () => null,
});
const ScreenshotCapture = dynamic(() => import("./ScreenshotCapture"), {
  ssr: false,
  loading: () => null,
});
const Onboarding = dynamic(() => import("./Onboarding"), {
  ssr: false,
  loading: () => null,
});
import AppStore from "./AppStore";
import ControlCenter from "./ControlCenter";
import DesktopBackground from "./DesktopBackground";
import Dock from "./Dock";
import Launchpad, { type LaunchpadIntent } from "./Launchpad";
import MissionControl from "./MissionControl";
import MobileShell from "./MobileShell";
import NotificationCenter from "./NotificationCenter";
import SnapPreview from "./SnapPreview";
import TopBar from "./TopBar";
import {
  checkToolAvailability,
  useInstalledTools,
} from "./useInstalledTools";
import { useDockOrder } from "./useDockOrder";
import DockCustomizer from "./DockCustomizer";
import IconStylePicker from "./IconStylePicker";
import SettingsPanel from "./SettingsPanel";
import Widgets from "./Widgets";
import WidgetGallery from "./WidgetGallery";
import HomeApps from "./HomeApps";
import HomeFiles from "./HomeFiles";
import { useHomeApps } from "./useHomeApps";
import { readAppDragPayload, type AppDragPayload } from "./appDrag";
import WallpaperPicker from "./WallpaperPicker";
import Window from "./Window";
import AppSwitcher from "./AppSwitcher";
import SavedLayouts from "./SavedLayouts";
import PiPManager from "./PiPManager";
import { useRecents } from "./useRecents";
import { useIsMobile } from "./useIsMobile";
import { useWindowManager } from "./useWindowManager";
import { useDesktopSounds } from "./useDesktopSounds";
import { useWorkspaceKey, useWorkspaces, WorkspaceProvider } from "./useWorkspaces";
import CreateWorkspaceDialog from "./CreateWorkspaceDialog";
import SignInDialog from "./SignInDialog";
import Spotlight from "./Spotlight";
import ClipboardHistory from "./ClipboardHistory";
import QuickNote from "./QuickNote";
import EasterEggs from "./EasterEggs";
import AgentChatLauncher from "./agent/AgentChatLauncher";
import OnboardingChecklist from "./OnboardingChecklist";
import { AuthProvider, useAuth } from "./useAuth";
import { useWorkspaceSync } from "./useWorkspaceSync";
import { useWorkspaceRole } from "./useWorkspaceRole";
import { useWorkspace as useTeamWorkspace } from "@/lib/workspaces/client";

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
  const { activeId, hydrated, workspaces } = useWorkspaces();
  const isMobile = useIsMobile();
  if (!hydrated) {
    // Avoid mounting hooks against an empty workspace id during the brief
    // window before WorkspaceProvider hydrates from localStorage.
    return <div className="fixed inset-0 bg-app" aria-hidden="true" />;
  }
  // No workspaces (user just deleted them all, or signed in fresh and
  // the cloud reconcile pulled an empty list). Show a focused "create
  // your first workspace" prompt instead of mounting a desktop against
  // an empty namespace.
  if (workspaces.length === 0 || !activeId) {
    return <NoWorkspacesScreen />;
  }
  // Mobile shell — iOS-style chrome on <md viewports. Same workspace key,
  // same window manager, same installed-tools storage. Keyed on activeId
  // so the shell remounts on workspace switch (matches DesktopApp).
  if (isMobile) {
    return <MobileShell key={`mobile-${activeId}`} />;
  }
  return <DesktopApp key={activeId} />;
}

function NoWorkspacesScreen() {
  const [createOpen, setCreateOpen] = useState(true);
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-app p-6">
      <div className="max-w-sm rounded-2xl border border-app bg-app-elevated p-6 text-center shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-tool-accent-soft text-tool-accent">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 10h18" />
            <path d="M9 14h6" />
          </svg>
        </div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight text-app">
          No workspaces yet
        </h1>
        <p className="mt-1 text-sm text-secondary">
          A workspace holds your dock, widgets, wallpaper, and the apps you
          install. Create one to get started.
        </p>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="mt-5 rounded-lg bg-tool-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Create workspace
        </button>
      </div>
      <CreateWorkspaceDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}

function DesktopApp() {
  const { activeId } = useWorkspaces();
  const {
    windows,
    hydrated: windowsHydrated,
    open,
    close,
    closeAll,
    closeAllOfSlug,
    minimize,
    minimizeAll,
    focus,
    toggleMaximize,
    move,
    resize,
    snap,
    unsnap,
    pinWindow,
    unpinWindow,
  } = useWindowManager();

  // Cross-app history — auto-records every tool open and exposes a hook
  // for other surfaces (Spotlight, Files Manager) to consume.
  const { record: recordRecent } = useRecents();

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

  const {
    setPosition: setHomeAppPosition,
    remove: removeHomeApp,
  } = useHomeApps();

  /* Cross-zone app move coordinator. The three zones (Launchpad / Dock /
   * Home) each persist into their own storage key, so a "move" is really
   * a delete-from-source + add-to-target. Apps stay installed in all
   * cases — Launchpad just shows the installed set unfiltered, so dropping
   * onto Launchpad cleanly equates to "remove the shortcut from wherever
   * it lived." */
  const moveAppToDock = (payload: AppDragPayload, atIndex?: number) => {
    if (!isInstalled(payload.slug)) install(payload.slug);
    if (payload.fromZone === "home") removeHomeApp(payload.slug);
    const without = pinnedSlugs.filter((s) => s !== payload.slug);
    const insertAt = typeof atIndex === "number"
      ? Math.max(0, Math.min(atIndex, without.length))
      : without.length;
    const next = without.slice();
    next.splice(insertAt, 0, payload.slug);
    setPinnedSlugs(next);
  };

  const moveAppToHome = (payload: AppDragPayload, x: number, y: number) => {
    if (!isInstalled(payload.slug)) install(payload.slug);
    if (payload.fromZone === "dock") {
      setPinnedSlugs(pinnedSlugs.filter((s) => s !== payload.slug));
    }
    setHomeAppPosition(payload.slug, x, y);
  };

  const moveAppToLaunchpad = (payload: AppDragPayload) => {
    if (payload.fromZone === "dock") {
      setPinnedSlugs(pinnedSlugs.filter((s) => s !== payload.slug));
    } else if (payload.fromZone === "home") {
      removeHomeApp(payload.slug);
    }
  };

  const [launchpadOpen, setLaunchpadOpen] = useState(false);
  /* Intent fed into <Launchpad>. Bumping `launchpadIntentKey` re-applies
   * the same intent (so callers can re-trigger Reveal on the same file).
   *
   * Historical: this is the new home for openApp("files-manager", { fileId })
   * call sites — the standalone Files Manager tool was retired and the
   * Launchpad now serves every file-management surface. */
  const [launchpadIntent, setLaunchpadIntent] = useState<LaunchpadIntent>({
    kind: "applications",
  });
  const [launchpadIntentKey, setLaunchpadIntentKey] = useState(0);
  const [storeOpen, setStoreOpen] = useState(false);
  const [dockCustomizerOpen, setDockCustomizerOpen] = useState(false);
  const [widgetGalleryOpen, setWidgetGalleryOpen] = useState(false);
  const [wallpaperPickerOpen, setWallpaperPickerOpen] = useState(false);
  const [iconStylePickerOpen, setIconStylePickerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [controlCenterOpen, setControlCenterOpen] = useState(false);
  const [missionControlOpen, setMissionControlOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    | "profile"
    | "workspaces"
    | "appearance"
    | "dock"
    | "widgets"
    | "sounds"
    | "hot-corners"
    | "keyboard"
    | "reset"
  >("profile");
  const openWorkspacesSection = () => {
    setSettingsSection("workspaces");
    setSettingsOpen(true);
  };

  const openSettings = (section: typeof settingsSection = "appearance") => {
    setSettingsSection(section);
    setSettingsOpen(true);
  };
  const openProfile = () => {
    setSettingsSection("profile");
    setSettingsOpen(true);
  };
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const { user: authUser, signOut: authSignOut } = useAuth();
  useWorkspaceSync();
  const {
    canInstallApps,
    canUninstallApps,
    hydrated: roleHydrated,
  } = useWorkspaceRole();
  const teamWorkspace = useTeamWorkspace();
  const teamWorkspaceId =
    teamWorkspace.current.kind === "team" ? teamWorkspace.current.id : null;
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

  // Spotlight dispatches synthetic events for cross-component actions
  // (open profile, create workspace, sign out, open settings) instead of
  // taking direct callback props — the Spotlight component lives outside
  // DesktopApp's prop tree. We listen here and call the right handler
  // so those Spotlight result rows actually do something.
  useEffect(() => {
    const onOpenProfile = () => openProfile();
    const onOpenSettings = () => openSettings();
    const onCreateWorkspace = () => setCreateWorkspaceOpen(true);
    const onSignOut = () => {
      void authSignOut();
    };
    // Onboarding checklist row clicks fire CustomEvent
    // 'tools-desktop-onboarding-action' with detail.taskId — route
    // each task to the right surface.
    const onOnboardingAction = (e: Event) => {
      const detail = (e as CustomEvent<{ taskId?: string }>).detail;
      const id = detail?.taskId;
      if (!id) return;
      switch (id) {
        case "avatar":
        case "username":
        case "fullName":
        case "bio":
          openProfile();
          break;
        case "wallpaper":
          setWallpaperPickerOpen(true);
          break;
        case "installApp":
          setStoreOpen(true);
          break;
        case "accent":
          openSettings("appearance");
          break;
      }
    };
    window.addEventListener("spotlight:open-profile", onOpenProfile);
    window.addEventListener("spotlight:open-settings", onOpenSettings);
    window.addEventListener("spotlight:create-workspace", onCreateWorkspace);
    window.addEventListener("spotlight:sign-out", onSignOut);
    window.addEventListener("tools-desktop-onboarding-action", onOnboardingAction);
    return () => {
      window.removeEventListener("spotlight:open-profile", onOpenProfile);
      window.removeEventListener("spotlight:open-settings", onOpenSettings);
      window.removeEventListener("spotlight:create-workspace", onCreateWorkspace);
      window.removeEventListener("spotlight:sign-out", onSignOut);
      window.removeEventListener("tools-desktop-onboarding-action", onOnboardingAction);
    };
    // openProfile / openSettings are stable closures over setSettings*; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSignOut]);

  // ⌘K / Ctrl-K toggles Launchpad. ⌘, opens Settings (macOS standard).
  // ⌘⇧A also toggles Launchpad — matches the Finder "Applications" jump
  // shortcut and the spec for the Finder-style window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setLaunchpadOpen((v) => !v);
        return;
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "a"
      ) {
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

  // Invite link handler: when the user lands at /?invite=<id>, jump
  // straight into Settings → Workspaces so the pending-invite list +
  // accept/decline buttons are visible. Email links from the workspace
  // invite flow point at this URL pattern. We strip the param from the
  // address bar afterwards so a refresh doesn't re-trigger.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const inviteId = params.get("invite");
    if (!inviteId) return;
    // Defer one tick so the rest of DesktopApp finishes mounting (the
    // SettingsPanel's WorkspacesPane queries for invites on mount).
    const t = window.setTimeout(() => {
      setSettingsSection("workspaces");
      setSettingsOpen(true);
    }, 60);
    // Clean the URL so subsequent reloads don't repeat the action.
    params.delete("invite");
    const next =
      window.location.pathname +
      (params.toString() ? `?${params.toString()}` : "") +
      window.location.hash;
    window.history.replaceState({}, "", next);
    return () => window.clearTimeout(t);
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
    // Special slug: "launchpad" isn't a tool, it's the system-level
    // Finder window. We resolve openApp("launchpad", { fileId }) by
    // setting an intent + opening the Launchpad rather than spawning a
    // tool window. Replaces openApp("files-manager", { fileId }) since
    // Files Manager was retired (Round D).
    if (slug === "launchpad") {
      const fileId =
        params && typeof params.fileId === "string" ? params.fileId : undefined;
      const requestedKind =
        params && typeof params.location === "string" ? params.location : null;
      const next: LaunchpadIntent =
        requestedKind === "trash"
          ? { kind: "trash" }
          : fileId || requestedKind === "home"
            ? { kind: "home", fileId }
            : { kind: "applications" };
      setLaunchpadIntent(next);
      setLaunchpadIntentKey((k) => k + 1);
      setLaunchpadOpen(true);
      sounds.tap();
      return;
    }
    void (async () => {
      const verdict = await checkToolAvailability(activeId, slug);
      if (verdict !== "allowed") {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("tools:install-blocked", {
              detail: { slug, reason: verdict },
            })
          );
        }
        return;
      }
      if (!isInstalled(slug) && !canInstallApps) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("tools:install-blocked", {
              detail: { slug, reason: "permission_denied" },
            })
          );
        }
        return;
      }
      // Auto-install if user opens a tool from the Store or a cross-app CTA.
      if (!isInstalled(slug)) install(slug);
      // Close any open modal/overlay so the new window comes to the front
      // instead of opening behind Settings / Launchpad / AppStore /
      // Notifications / Mission Control / Wallpaper / etc.
      setSettingsOpen(false);
      setLaunchpadOpen(false);
      setStoreOpen(false);
      setNotificationsOpen(false);
      setMissionControlOpen(false);
      setDockCustomizerOpen(false);
      setWidgetGalleryOpen(false);
      setWallpaperPickerOpen(false);
      setIconStylePickerOpen(false);
      setSignInOpen(false);
      setCreateWorkspaceOpen(false);
      open(slug, title, params);
      recordRecent({ kind: "tool", slug });
      sounds.tap();
    })();
  };

  // Direct tool URLs are not standalone app runtimes anymore. Middleware
  // rewrites legacy /tools/<slug> and /solutions/tools/<slug> visits to
  // /?app=<slug>; the shell consumes that intent here, then opens the app
  // through the same permission-gated path as Dock/Launchpad/App Store.
  const shellIntentHandledRef = useRef(false);
  useEffect(() => {
    if (shellIntentHandledRef.current) return;
    if (!installHydrated || !roleHydrated) return;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("app");
    if (!slug) return;

    shellIntentHandledRef.current = true;
    params.delete("app");
    const next =
      window.location.pathname +
      (params.toString() ? `?${params.toString()}` : "") +
      window.location.hash;
    window.history.replaceState({}, "", next);

    if (slug === "launchpad") {
      handleOpenTool("launchpad", "Launchpad");
      return;
    }
    const tool = toolBySlug(slug);
    if (tool) handleOpenTool(tool.slug, tool.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installHydrated, roleHydrated]);

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
  // Params are forwarded so e.g. ScreenshotCapture's "Open in Files"
  // button can pass { location, fileId } to the Launchpad.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as
        | {
            type?: string;
            slug?: string;
            title?: string;
            params?: Record<string, unknown>;
          }
        | null;
      if (!data || data.type !== "tools-open" || !data.slug) return;
      const tool = toolBySlug(data.slug);
      handleOpenTool(
        data.slug,
        tool?.title ?? data.title ?? data.slug,
        data.params
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installed]);

  const handleSignOut = async () => {
    await authSignOut();
  };

  /* Toggle cycles: system → light → dark → system. Default is system
   * (follows OS) so dark/light flips with the OS unless the user has
   * explicitly picked one. The cycle returns to system on the third
   * click so users can always get back to auto. */
  const toggleTheme = () => {
    const stored =
      typeof window !== "undefined"
        ? (localStorage.getItem("theme") as "light" | "dark" | "system" | null)
        : null;
    const current = stored ?? "system";
    const next: "light" | "dark" | "system" =
      current === "system" ? "light" : current === "light" ? "dark" : "system";

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("theme", next);
      } catch {}
      // Resolve "system" against current OS preference for the data-theme attr.
      const resolved =
        next === "system"
          ? window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark"
          : next;
      document.documentElement.setAttribute("data-theme", resolved);
      // Notify other listeners (Theme picker, system-mode hook).
      window.dispatchEvent(
        new StorageEvent("storage", { key: "theme", newValue: next })
      );
      setTheme(resolved);
    }
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
    <div
      data-tools-desktop
      data-drop-target="home-files"
      className="relative h-[100dvh] w-screen overflow-hidden"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-spacefield-app")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(e) => {
        const payload = readAppDragPayload(e.dataTransfer);
        if (!payload) return;
        // Skip drops that already had a closer drop target (Dock /
        // Launchpad). Their handlers call preventDefault + stopPropagation
        // earlier in the bubbling chain — by the time we get here the
        // event was for the desktop home itself.
        if (e.defaultPrevented) return;
        e.preventDefault();
        // Drop coords relative to the desktop. Center the icon (HOME_APP_TILE_W
        // is 88) under the cursor so the drop point feels like the icon's
        // center, not its top-left corner.
        const HOME_APP_TILE_W = 88;
        const HOME_APP_ICON_SIZE = 64;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = Math.max(8, e.clientX - rect.left - HOME_APP_TILE_W / 2);
        const y = Math.max(40, e.clientY - rect.top - HOME_APP_ICON_SIZE / 2);
        moveAppToHome(payload, x, y);
      }}
    >
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
        onOpenSettings={() => openSettings("appearance")}
        onOpenProfile={openProfile}
        onCreateWorkspace={() => setCreateWorkspaceOpen(true)}
        onOpenControlCenter={() => setControlCenterOpen((v) => !v)}
        canAdmin={canInstallApps || canUninstallApps}
      />

      {/* Onboarding takes priority when incomplete */}
      <Onboarding
        open={showOnboarding}
        onComplete={(profession, installedSlugs) => {
          completeOnboarding(profession, installedSlugs);
        }}
      />

      {/* Widgets — desktop-only. On mobile (<sm) widgets overflow into
       * the dock and topbar areas because their default rects are sized
       * for a wide canvas; hide them entirely on small screens. Users
       * can still re-enable them on a larger window. */}
      {windowsHydrated && onboarded && (
        <div className="hidden sm:contents">
          <Widgets onOpenTool={handleOpenTool} />
          {/* Home app shortcuts — free-positioned, dragged in from
           * Launchpad / Dock or repositioned within Home. */}
          <HomeApps onOpenTool={handleOpenTool} />
          {/* Home file shortcuts — pinned via Files Manager drag-drop. */}
          <HomeFiles
            onOpenFile={(fileId, params) => {
              // Files Manager retirement (Round D): when the home-pinned
              // file has no dedicated editor, defer to the Launchpad on
              // Home with the file focused. Historical fallback used to
              // be openApp("files-manager", { fileId }).
              const slug = params.editorSlug ?? "launchpad";
              const tool = toolBySlug(slug);
              handleOpenTool(slug, tool?.title ?? "Launchpad", { fileId });
            }}
          />
        </div>
      )}

      {/* Empty-state hint removed per design — the workspace home is
        * just wallpaper + dock + widgets (cleaner, more macOS-like).
        * Users discover Launchpad via ⌘K or the dock's launcher icon. */}

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
              onUnpin={() => unpinWindow(w.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Launchpad — Finder-style movable window */}
      <Launchpad
        open={launchpadOpen}
        onClose={() => setLaunchpadOpen(false)}
        onOpenTool={handleOpenTool}
        onUninstall={canUninstallApps ? handleUninstall : undefined}
        onStore={canInstallApps || canUninstallApps ? openStore : undefined}
        items={installedTools}
        onAppDroppedOnLaunchpad={moveAppToLaunchpad}
        onConnect={openWorkspacesSection}
        onTogglePin={togglePin}
        isPinned={(slug) => pinnedSlugs.includes(slug)}
        intent={launchpadIntent}
        intentKey={launchpadIntentKey}
      />

      {/* App Store — browse all, install / uninstall */}
      <AppStore
        open={storeOpen}
        onClose={() => setStoreOpen(false)}
        isInstalled={isInstalled}
        onInstall={handleInstall}
        onUninstall={handleUninstall}
        onOpenTool={handleOpenTool}
        canInstall={canInstallApps}
        canUninstall={canUninstallApps}
      />

      {/* Dock — always visible at the back layer (z-[1]). Any window covers it. */}
      <Dock
        pinned={dockPinned}
        windows={windows}
        onLaunchpad={openLaunchpad}
        onStore={canInstallApps || canUninstallApps ? openStore : undefined}
        onOpenTool={handleOpenTool}
        onFocusWindow={focus}
        onUninstall={canUninstallApps ? handleUninstall : undefined}
        onAppDroppedOnDock={moveAppToDock}
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
        initialSection={settingsSection}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenWallpaper={() => setWallpaperPickerOpen(true)}
        onOpenDockCustomizer={() => setDockCustomizerOpen(true)}
        onOpenWidgetGallery={() => setWidgetGalleryOpen(true)}
        onResetWorkspace={handleResetWorkspace}
      />

      {/* Removed: floating "+ Widgets" button. Widget management lives
        * in TopBar → View → Add Widget (desktop) and the mobile menu. */}

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

      {/* ⌘Tab / Ctrl-Tab application switcher — overlay rendered above all
        * windows; cycles through windows by most-recently-focused. */}
      <AppSwitcher windows={windows} onFocus={focus} />

      {/* Saved window layouts — ⌘⇧L toggles. Captures + restores the full
        * arrangement of windows (slug + bounds + initialParams). */}
      <SavedLayouts windows={windows} closeAll={closeAll} open={open} />

      {/* Picture-in-picture + close-window keyboard shortcuts. Renders
        * nothing visible — pure keyboard controller. */}
      <PiPManager
        windows={windows}
        pinWindow={pinWindow}
        unpinWindow={unpinWindow}
        close={close}
        closeAll={closeAll}
        closeAllOfSlug={closeAllOfSlug}
      />

      {/* Control Center — slide-down quick-settings panel (theme, focus,
        * sound, accent, quick links). Triggered from the topbar. */}
      <ControlCenter
        open={controlCenterOpen}
        onClose={() => setControlCenterOpen(false)}
        placement="desktop"
        onOpenSettings={() => openSettings("appearance")}
        onOpenWorkspaces={openWorkspacesSection}
      />

      {/* Shell overlays (Agent 3): universal spotlight, clipboard manager,
        * quick note, and small easter eggs. Each component installs its own
        * keyboard listeners and renders nothing until triggered. */}
      <Spotlight />
      <ClipboardHistory />
      <QuickNote />
      <EasterEggs />

      {/* AI agent launcher (Phase 2) — bottom-left floating button +
       *  chat panel. Only mounts after onboarding so first-run users
       *  finish setup without a popup in their face. Requires a team
       *  workspace selection (the dispatch endpoint reads workspace_id). */}
      {windowsHydrated && onboarded && teamWorkspaceId && (
        <AgentChatLauncher
          workspaceId={teamWorkspaceId}
          installedAppSlugs={installed}
        />
      )}

      {/* Onboarding checklist — bottom-LEFT floating "finish setting up"
       * card. Only renders for signed-in users with at least one
       * outstanding task. The widget self-gates on auth, completion flag,
       * dismissal timestamp, and a 30-second first-mount grace window;
       * mounting it unconditionally here is safe. */}
      {windowsHydrated && onboarded && <OnboardingChecklist />}

      {/* Ambient sound mixer — floating button + panel. AudioContext is
       * lazily created only after the user clicks a track on. Other UI
       * (Control Center) can open the panel by dispatching the
       * `spacefield:ambient-toggle` window event. */}
      <AmbientSounds />

      {/* Screenshot capture — ⌘⇧3 (full viewport) / ⌘⇧4 (rectangle).
       * Saves PNGs into Files Manager via /api/files/save-content. */}
      <ScreenshotCapture />
    </div>
    </DesktopShellProvider>
  );
}
