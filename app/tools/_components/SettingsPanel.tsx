"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { TOOL_ICONS } from "../_data/tools-list";
import { ICON_STYLES, type IconStyleId } from "./icon-styles";
import { useIconStyle } from "./useIconStyle";
import { useDesktopSounds } from "./useDesktopSounds";
import { WIDGET_REGISTRY, useActiveWidgets } from "./Widgets";
import { useHotCornersEnabled } from "./HotCorners";
import { useWorkspaceKey } from "./useWorkspaces";
import ProfilePane from "./ProfilePane";

/* SettingsPanel — single-pane macOS-style System Settings clone.
 *
 * Sidebar on the left lists every section; the right pane swaps content
 * for the active section. All state lives in localStorage via existing
 * hooks (useIconStyle / useDesktopSounds / useActiveWidgets) so we
 * deliberately don't add a new persistence layer here.
 *
 * Hot Corners and Accent Color are scaffolded as local-state
 * placeholders — when those agents land they'll swap in real hooks
 * without changing this surface. */

type SectionId =
  | "profile"
  | "appearance"
  | "dock"
  | "widgets"
  | "sounds"
  | "hot-corners"
  | "keyboard"
  | "reset";

interface SectionDef {
  id: SectionId;
  label: string;
  description: string;
  iconPath: string;
}

const SECTIONS: SectionDef[] = [
  {
    id: "profile",
    label: "Profile",
    description: "Username, name, designation, bio, social links, account.",
    iconPath: TOOL_ICONS.users,
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme, wallpaper, icons, accent.",
    iconPath: TOOL_ICONS.palette,
  },
  {
    id: "dock",
    label: "Dock",
    description: "What's pinned and how it shows up.",
    iconPath: TOOL_ICONS.dots9,
  },
  {
    id: "widgets",
    label: "Widgets",
    description: "Live tiles on your desktop.",
    iconPath: TOOL_ICONS.dashboard,
  },
  {
    id: "sounds",
    label: "Sounds",
    description: "UI feedback and chimes.",
    iconPath: TOOL_ICONS.bell,
  },
  {
    id: "hot-corners",
    label: "Hot corners",
    description: "Toss the cursor into a corner to trigger an action.",
    iconPath: TOOL_ICONS.grid,
  },
  {
    id: "keyboard",
    label: "Keyboard",
    description: "Shortcuts you can press anywhere on the desktop.",
    iconPath: TOOL_ICONS.code,
  },
  {
    id: "reset",
    label: "Reset",
    description: "Wipe and start over.",
    iconPath: TOOL_ICONS.refresh,
  },
];

/* ───────── Accent color (scaffolded — actual theming lives in CSS tokens
 *           and will be wired up when the accent-token agent lands). */

type AccentId = "violet" | "blue" | "teal" | "amber" | "rose";

const ACCENT_STORAGE_SUFFIX = "tools-desktop-accent-v1";
const ACCENT_DEFAULT: AccentId = "violet";

const ACCENTS: { id: AccentId; label: string; swatch: string }[] = [
  { id: "violet", label: "Violet", swatch: "#7c3aed" },
  { id: "blue", label: "Blue", swatch: "#2563eb" },
  { id: "teal", label: "Teal", swatch: "#0d9488" },
  { id: "amber", label: "Amber", swatch: "#d97706" },
  { id: "rose", label: "Rose", swatch: "#e11d48" },
];

/* ───────── Hot Corners (scaffolded — will route to real handlers once
 *           the HotCorners agent lands). */

type CornerAction =
  | "none"
  | "launchpad"
  | "notifications"
  | "mission-control"
  | "show-desktop";
type CornerId = "tl" | "tr" | "bl" | "br";

/* HotCorners.tsx owns "tools-desktop-hot-corners-v1" for the enabled flag
 * (now exposed as useHotCornersEnabled hook). Per-corner action mapping
 * lives under its own (also workspace-scoped) suffix. */
const CORNER_ACTIONS_STORAGE_SUFFIX = "tools-desktop-hot-corner-actions-v1";

interface HotCornersConfig {
  enabled: boolean;
  corners: Record<CornerId, CornerAction>;
}

const HOT_CORNERS_DEFAULT: HotCornersConfig = {
  enabled: false,
  corners: {
    tl: "launchpad",
    tr: "notifications",
    bl: "mission-control",
    br: "show-desktop",
  },
};

const CORNER_ACTIONS: { id: CornerAction; label: string }[] = [
  { id: "none", label: "None" },
  { id: "launchpad", label: "Launchpad" },
  { id: "notifications", label: "Notifications" },
  { id: "mission-control", label: "Mission Control" },
  { id: "show-desktop", label: "Show Desktop" },
];

const CORNER_LABELS: Record<CornerId, string> = {
  tl: "Top left",
  tr: "Top right",
  bl: "Bottom left",
  br: "Bottom right",
};

function loadAccent(storageKey: string): AccentId {
  if (typeof window === "undefined") return ACCENT_DEFAULT;
  try {
    const v = localStorage.getItem(storageKey);
    if (v && ACCENTS.some((a) => a.id === v)) return v as AccentId;
  } catch {}
  return ACCENT_DEFAULT;
}

function saveAccent(storageKey: string, id: AccentId) {
  try {
    localStorage.setItem(storageKey, id);
  } catch {}
}

function loadCornerActions(storageKey: string): Record<CornerId, CornerAction> {
  if (typeof window === "undefined") return HOT_CORNERS_DEFAULT.corners;
  let corners = HOT_CORNERS_DEFAULT.corners;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      corners = {
        tl: isCornerAction(parsed.tl) ? parsed.tl : corners.tl,
        tr: isCornerAction(parsed.tr) ? parsed.tr : corners.tr,
        bl: isCornerAction(parsed.bl) ? parsed.bl : corners.bl,
        br: isCornerAction(parsed.br) ? parsed.br : corners.br,
      };
    }
  } catch {}
  return corners;
}

function isCornerAction(v: unknown): v is CornerAction {
  return (
    v === "none" ||
    v === "launchpad" ||
    v === "notifications" ||
    v === "mission-control" ||
    v === "show-desktop"
  );
}

function saveCornerActions(storageKey: string, corners: Record<CornerId, CornerAction>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(corners));
  } catch {}
}

/* ───────── Shortcut catalog (read-only display) ───────── */

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "⌘ K", label: "Open Launchpad / search tools" },
  { keys: "⌘ ,", label: "Open Settings" },
  { keys: "Esc", label: "Close any modal" },
  { keys: "⌘ W", label: "Close focused window" },
  { keys: "⌘ M", label: "Minimize focused window" },
];

/* ───────── Component ───────── */

interface Props {
  open: boolean;
  onClose: () => void;
  theme: "light" | "dark" | null;
  onToggleTheme: () => void;
  onOpenWallpaper: () => void;
  onOpenDockCustomizer: () => void;
  onOpenWidgetGallery: () => void;
  onResetWorkspace: () => void;
  /** Section to land on whenever the panel is opened. Defaults to "profile". */
  initialSection?: SectionId;
}

export default function SettingsPanel({
  open,
  onClose,
  theme,
  onToggleTheme,
  onOpenWallpaper,
  onOpenDockCustomizer,
  onOpenWidgetGallery,
  onResetWorkspace,
  initialSection = "profile",
}: Props) {
  const [section, setSection] = useState<SectionId>(initialSection);

  // When the panel is re-opened with a different initialSection, jump
  // to that section (e.g. clicking Profile opens Settings → Profile).
  useEffect(() => {
    if (open) setSection(initialSection);
  }, [open, initialSection]);
  const { style: iconStyle, setStyle: setIconStyle } = useIconStyle();
  const sounds = useDesktopSounds();
  const { active: activeWidgets, remove: removeWidget } = useActiveWidgets();

  const ACCENT_STORAGE_KEY = useWorkspaceKey(ACCENT_STORAGE_SUFFIX);
  const CORNER_ACTIONS_STORAGE_KEY = useWorkspaceKey(CORNER_ACTIONS_STORAGE_SUFFIX);
  const WINDOWS_KEY = useWorkspaceKey("tools-desktop-windows-v2");
  const WINDOWS_V1_KEY = useWorkspaceKey("tools-desktop-windows-v1");
  const WIDGETS_V3_KEY = useWorkspaceKey("tools-desktop-widgets-v3");
  const WIDGETS_V2_KEY = useWorkspaceKey("tools-desktop-widgets-v2");
  const DOCK_KEY = useWorkspaceKey("tools-desktop-dock-order-v1");
  const [hotCornersEnabled, setHotCornersEnabledFlag] = useHotCornersEnabled();

  const [accent, setAccentState] = useState<AccentId>(ACCENT_DEFAULT);
  const [hotCorners, setHotCornersState] =
    useState<HotCornersConfig>(HOT_CORNERS_DEFAULT);

  // Hydrate scaffolded settings from localStorage on open
  useEffect(() => {
    if (!open) return;
    setAccentState(loadAccent(ACCENT_STORAGE_KEY));
    setHotCornersState({
      enabled: hotCornersEnabled,
      corners: loadCornerActions(CORNER_ACTIONS_STORAGE_KEY),
    });
  }, [open, ACCENT_STORAGE_KEY, CORNER_ACTIONS_STORAGE_KEY, hotCornersEnabled]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const setAccent = (id: AccentId) => {
    setAccentState(id);
    saveAccent(ACCENT_STORAGE_KEY, id);
  };

  const updateHotCorners = (
    next: HotCornersConfig | ((prev: HotCornersConfig) => HotCornersConfig)
  ) => {
    setHotCornersState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      // Enabled flag flows through the hook (keeps in-page listener in sync).
      if (resolved.enabled !== prev.enabled) {
        setHotCornersEnabledFlag(resolved.enabled);
      }
      saveCornerActions(CORNER_ACTIONS_STORAGE_KEY, resolved.corners);
      return resolved;
    });
  };

  const handleResetCache = () => {
    try {
      // Window positions, widget rectangles, dock order. The underlying
      // hooks won't pick this up until next mount — we hint with a tap and
      // let the user reload if they want the dock/widgets to immediately
      // snap back to defaults. Workspace-scoped keys.
      localStorage.removeItem(WINDOWS_KEY);
      localStorage.removeItem(WINDOWS_V1_KEY);
      localStorage.removeItem(WIDGETS_V3_KEY);
      localStorage.removeItem(WIDGETS_V2_KEY);
      localStorage.removeItem(DOCK_KEY);
    } catch {}
    sounds.tap();
  };

  const widgetMetaById = useMemo(
    () => Object.fromEntries(WIDGET_REGISTRY.map((w) => [w.id, w])),
    []
  );

  const activeSection = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

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
          aria-label="Settings"
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
            className="relative z-10 mx-auto flex h-[min(90vh,560px)] w-[min(94vw,720px)] flex-col overflow-hidden rounded-2xl border border-app bg-app-elevated shadow-2xl"
            style={{ marginTop: "8vh" }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-app bg-app-elevated px-5 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-strong text-app">
                <GearIcon size={16} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-app">Settings</div>
                <div className="text-[11px] text-muted">
                  {activeSection.description}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close settings"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-app text-secondary hover:bg-surface hover:text-app transition-colors"
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

            {/* Body — sidebar + pane */}
            <div className="grid flex-1 grid-cols-[200px_1fr] overflow-hidden">
              {/* Sidebar */}
              <nav
                aria-label="Settings sections"
                className="flex min-h-0 flex-col overflow-y-auto border-r border-app bg-surface/40 p-2"
              >
                {SECTIONS.map((s) => {
                  const active = s.id === section;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSection(s.id)}
                      aria-current={active ? "page" : undefined}
                      className={`mb-0.5 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[0.78rem] transition-colors ${
                        active
                          ? "bg-surface-strong text-app"
                          : "text-secondary hover:bg-surface hover:text-app"
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                          active
                            ? "bg-app text-app"
                            : "bg-surface text-secondary"
                        }`}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d={s.iconPath} />
                        </svg>
                      </span>
                      <span className="truncate">{s.label}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Pane */}
              <div className="min-h-0 overflow-y-auto px-6 py-5">
                {section === "profile" && <ProfilePane />}
                {section === "appearance" && (
                  <AppearancePane
                    theme={theme}
                    onToggleTheme={onToggleTheme}
                    iconStyle={iconStyle}
                    onPickIconStyle={setIconStyle}
                    accent={accent}
                    onPickAccent={setAccent}
                    onOpenWallpaper={onOpenWallpaper}
                  />
                )}
                {section === "dock" && (
                  <DockPane onOpenDockCustomizer={onOpenDockCustomizer} />
                )}
                {section === "widgets" && (
                  <WidgetsPane
                    activeWidgets={activeWidgets}
                    widgetMetaById={widgetMetaById}
                    onOpenWidgetGallery={onOpenWidgetGallery}
                    onRemove={removeWidget}
                  />
                )}
                {section === "sounds" && (
                  <SoundsPane
                    muted={sounds.muted}
                    onToggleMute={sounds.toggleMute}
                    volume={sounds.volume}
                    onSetVolume={sounds.setVolume}
                    onTest={sounds.chime}
                  />
                )}
                {section === "hot-corners" && (
                  <HotCornersPane
                    cfg={hotCorners}
                    onUpdate={updateHotCorners}
                  />
                )}
                {section === "keyboard" && <KeyboardPane />}
                {section === "reset" && (
                  <ResetPane
                    onResetWorkspace={() => {
                      onResetWorkspace();
                      onClose();
                    }}
                    onClearCache={handleResetCache}
                  />
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ───────── Sub-panes ───────── */

function PaneHeader({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-app">{title}</h2>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-app py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-[0.8rem] font-medium text-app">{label}</div>
        {description && (
          <div className="mt-0.5 text-[11px] text-muted">{description}</div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function PaneButton({
  onClick,
  children,
  variant = "default",
}: {
  onClick: () => void;
  children: ReactNode;
  variant?: "default" | "danger";
}) {
  const cls =
    variant === "danger"
      ? "rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-[0.72rem] font-medium text-rose-600 transition-colors hover:bg-rose-500/20"
      : "rounded-md border border-app bg-surface px-3 py-1.5 text-[0.72rem] font-medium text-app transition-colors hover:bg-surface-strong";
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

/* Compact radio pill list — keyboard-navigable buttons. */
function RadioPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={`rounded-full px-3 py-1 text-[0.72rem] transition-colors ${
              active
                ? "border border-app-hover bg-app text-app"
                : "border border-app bg-surface text-secondary hover:text-app"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        on ? "bg-tool-accent" : "bg-surface-strong"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/* Appearance ----------------------------------------------------------- */

function AppearancePane({
  theme,
  onToggleTheme,
  iconStyle,
  onPickIconStyle,
  accent,
  onPickAccent,
  onOpenWallpaper,
}: {
  theme: "light" | "dark" | null;
  onToggleTheme: () => void;
  iconStyle: IconStyleId;
  onPickIconStyle: (id: IconStyleId) => void;
  accent: AccentId;
  onPickAccent: (id: AccentId) => void;
  onOpenWallpaper: () => void;
}) {
  return (
    <div>
      <PaneHeader
        title="Appearance"
        hint="Theme, wallpaper, icon style, accent. Saved on this device."
      />

      <Row
        label="Theme"
        description={
          theme === "light"
            ? "Light surfaces, dark text."
            : "Dark surfaces, light text."
        }
      >
        <RadioPills
          value={theme === "light" ? "light" : "dark"}
          onChange={(v) => {
            if (v === "light" && theme !== "light") onToggleTheme();
            if (v === "dark" && theme !== "dark") onToggleTheme();
          }}
          options={[
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
          ]}
        />
      </Row>

      <Row
        label="Wallpaper"
        description="Pick a gradient, photo, or live scene."
      >
        <PaneButton onClick={onOpenWallpaper}>Choose…</PaneButton>
      </Row>

      <Row
        label="Icon style"
        description="How dock and Launchpad icons render."
      >
        <RadioPills
          value={iconStyle}
          onChange={onPickIconStyle}
          options={ICON_STYLES.map((s) => ({ id: s.id, label: s.name }))}
        />
      </Row>

      <Row
        label="Accent color"
        description="Will theme buttons, focus rings, and active highlights once the accent token agent ships."
      >
        <div className="flex items-center gap-1.5">
          {ACCENTS.map((a) => {
            const active = a.id === accent;
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={a.label}
                onClick={() => onPickAccent(a.id)}
                title={a.label}
                className={`flex h-6 w-6 items-center justify-center rounded-full transition-transform ${
                  active ? "scale-110 ring-2 ring-app-hover" : "hover:scale-105"
                }`}
                style={{ background: a.swatch }}
              >
                {active && (
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </Row>
    </div>
  );
}

/* Dock ---------------------------------------------------------------- */

function DockPane({
  onOpenDockCustomizer,
}: {
  onOpenDockCustomizer: () => void;
}) {
  // "Show on hover only" is wired but disabled — the dock is always
  // visible today; keep the control here so the surface is settled and
  // we can flip the behavior when it lands.
  const [hoverOnly, setHoverOnly] = useState(false);

  return (
    <div>
      <PaneHeader
        title="Dock"
        hint="Reorder, pin, and unpin tools. Visibility behavior coming soon."
      />

      <Row
        label="Customize dock"
        description="Drag, pin, and unpin the tools that live on the dock."
      >
        <PaneButton onClick={onOpenDockCustomizer}>Customize…</PaneButton>
      </Row>

      <Row
        label="Show on hover only"
        description="Hide the dock until the cursor reaches the bottom edge. Currently always visible — this toggle is reserved."
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-faint">
            Soon
          </span>
          <Toggle
            on={hoverOnly}
            onChange={() => setHoverOnly((v) => !v)}
            label="Show on hover only"
          />
        </div>
      </Row>
    </div>
  );
}

/* Widgets ------------------------------------------------------------- */

function WidgetsPane({
  activeWidgets,
  widgetMetaById,
  onOpenWidgetGallery,
  onRemove,
}: {
  activeWidgets: string[];
  widgetMetaById: Record<string, { name: string; description: string; iconKey: keyof typeof TOOL_ICONS }>;
  onOpenWidgetGallery: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <PaneHeader
        title="Widgets"
        hint="Live tiles you can position anywhere on the desktop."
      />

      <Row
        label="Add widget"
        description="Browse the gallery and add live snapshots to your desktop."
      >
        <PaneButton onClick={onOpenWidgetGallery}>Add widget…</PaneButton>
      </Row>

      <div className="mt-4">
        <div className="mb-2 text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
          Active widgets
        </div>
        {activeWidgets.length === 0 ? (
          <div className="rounded-md border border-app bg-surface px-3 py-4 text-center text-[11px] text-muted">
            No widgets on the desktop. Add one from the gallery.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {activeWidgets.map((id) => {
              const meta = widgetMetaById[id];
              if (!meta) return null;
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-md border border-app bg-app p-2"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-strong text-app">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d={TOOL_ICONS[meta.iconKey] ?? TOOL_ICONS.home} />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[0.78rem] font-medium text-app">
                      {meta.name}
                    </div>
                    <div className="truncate text-[10px] text-muted">
                      {meta.description}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(id)}
                    className="rounded-md border border-app bg-surface px-2 py-1 text-[0.68rem] text-secondary transition-colors hover:text-app"
                  >
                    Hide
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* Sounds -------------------------------------------------------------- */

function SoundsPane({
  muted,
  onToggleMute,
  volume,
  onSetVolume,
  onTest,
}: {
  muted: boolean;
  onToggleMute: () => void;
  volume: number;
  onSetVolume: (v: number) => void;
  onTest: () => void;
}) {
  return (
    <div>
      <PaneHeader
        title="Sounds"
        hint="Tap and chime feedback for clicks, opens, and notifications."
      />

      <Row
        label="Mute UI sounds"
        description="Silence taps and chimes globally."
      >
        <Toggle on={muted} onChange={onToggleMute} label="Mute UI sounds" />
      </Row>

      <Row
        label="Volume"
        description={`${Math.round(volume * 100)}% of master.`}
      >
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => onSetVolume(Number(e.target.value) / 100)}
          aria-label="UI sound volume"
          className="w-32 accent-[var(--tool-accent,#7c3aed)]"
          disabled={muted}
        />
      </Row>

      <Row
        label="Test sound"
        description="Plays the chime so you can pick a comfortable level."
      >
        <PaneButton onClick={onTest}>Play chime</PaneButton>
      </Row>
    </div>
  );
}

/* Hot corners --------------------------------------------------------- */

function HotCornersPane({
  cfg,
  onUpdate,
}: {
  cfg: HotCornersConfig;
  onUpdate: (
    next: HotCornersConfig | ((prev: HotCornersConfig) => HotCornersConfig)
  ) => void;
}) {
  return (
    <div>
      <PaneHeader
        title="Hot corners"
        hint="Trigger an action by sliding the cursor into a screen corner. Wired into preferences — handlers ship with the HotCorners agent."
      />

      <Row
        label="Enable hot corners"
        description="Turns the four corners into trigger zones."
      >
        <Toggle
          on={cfg.enabled}
          onChange={() =>
            onUpdate((prev) => ({ ...prev, enabled: !prev.enabled }))
          }
          label="Enable hot corners"
        />
      </Row>

      <div className={`mt-4 ${cfg.enabled ? "" : "opacity-60"}`}>
        <div className="mb-2 text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
          Per-corner action
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(CORNER_LABELS) as CornerId[]).map((corner) => (
            <label
              key={corner}
              className="flex items-center justify-between gap-2 rounded-md border border-app bg-app p-2"
            >
              <span className="text-[0.78rem] text-app">
                {CORNER_LABELS[corner]}
              </span>
              <select
                value={cfg.corners[corner]}
                disabled={!cfg.enabled}
                onChange={(e) =>
                  onUpdate((prev) => ({
                    ...prev,
                    corners: {
                      ...prev.corners,
                      [corner]: e.target.value as CornerAction,
                    },
                  }))
                }
                aria-label={`${CORNER_LABELS[corner]} corner action`}
                className="rounded-md border border-app bg-surface px-2 py-1 text-[0.72rem] text-app focus:outline-none focus:border-app-hover disabled:cursor-not-allowed"
              >
                {CORNER_ACTIONS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Keyboard ------------------------------------------------------------ */

function KeyboardPane() {
  return (
    <div>
      <PaneHeader
        title="Keyboard"
        hint="Global shortcuts. Custom bindings coming soon."
      />

      <ul className="space-y-1.5">
        {SHORTCUTS.map((s) => (
          <li
            key={s.label}
            className="flex items-center justify-between gap-3 rounded-md border border-app bg-app px-3 py-2"
          >
            <span className="text-[0.78rem] text-app">{s.label}</span>
            <kbd className="rounded-md border border-app bg-surface px-2 py-0.5 font-mono text-[0.72rem] text-secondary">
              {s.keys}
            </kbd>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex justify-end">
        <PaneButton
          onClick={() => {
            // Placeholder — current shortcut catalog is hard-coded in
            // Desktop.tsx, so "reset" is a no-op until rebinding ships.
          }}
        >
          Reset all
        </PaneButton>
      </div>
    </div>
  );
}

/* Reset --------------------------------------------------------------- */

function ResetPane({
  onResetWorkspace,
  onClearCache,
}: {
  onResetWorkspace: () => void;
  onClearCache: () => void;
}) {
  return (
    <div>
      <PaneHeader
        title="Reset"
        hint="Destructive actions. Each one is local to this device."
      />

      <Row
        label="Clear cache"
        description="Wipes window positions, dock order, and widget rectangles. Your installed tools and preferences stay."
      >
        <PaneButton onClick={onClearCache}>Clear cache</PaneButton>
      </Row>

      <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
        <div className="text-[0.78rem] font-semibold text-rose-600">
          Danger zone
        </div>
        <div className="mt-1 text-[11px] text-muted">
          Resetting the workspace closes every window, removes installed
          tools, and re-runs onboarding the next time you visit /tools.
        </div>
        <div className="mt-3 flex justify-end">
          <PaneButton variant="danger" onClick={onResetWorkspace}>
            Reset workspace
          </PaneButton>
        </div>
      </div>
    </div>
  );
}

/* ───────── Gear glyph (custom — no entry in TOOL_ICONS) ───────── */

export function GearIcon({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}
