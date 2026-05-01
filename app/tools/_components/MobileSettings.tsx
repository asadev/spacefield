"use client";

/* MobileSettings — iOS-style list-of-sections settings UI for the mobile
 * shell. On <md viewports, this replaces the desktop SettingsPanel.
 *
 * Design:
 *   - Top bar with title + back chevron when inside a sub-screen.
 *   - Sections grouped into rounded cards with hairline dividers between
 *     rows. Tapping a row pushes a sub-screen.
 *   - Sub-screens slide in from the right (matches iOS Settings).
 *
 * Reuses ProfilePane / WorkspacesPane verbatim — they already adapt to
 * narrow widths because they're built with grid-cols-1 / sm:grid-cols-2.
 * For Appearance we re-implement the rows so the controls are mobile-
 * friendly (toggles + radio pills are easier on touch than a sidebar).
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { useDesktopSounds } from "./useDesktopSounds";
import { useIconStyle } from "./useIconStyle";
import { ICON_STYLES } from "./icon-styles";
import { useActiveWidgets, WIDGET_REGISTRY } from "./Widgets";
import ProfilePane from "./ProfilePane";
import WorkspacesPane from "./WorkspacesPane";
import WorkspaceScopedSection from "./workspace-settings/WorkspaceScopedSection";
import { useWorkspaces } from "./useWorkspaces";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export type MobileSettingsSection =
  | "profile"
  | "workspaces"
  | "ai"
  | "appearance"
  | "dock"
  | "widgets"
  | "notifications"
  | "sounds"
  | "account"
  | "about";

interface Props {
  open: boolean;
  initialSection?: MobileSettingsSection;
  onClose: () => void;
}

interface SectionDef {
  id: MobileSettingsSection;
  label: string;
  hint: string;
  iconPath: string;
}

// Single-pane SVG paths so we don't pull TOOL_ICONS in for one glyph each.
const ICON = {
  user: "M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.24-8 5v3h16v-3c0-2.76-3.58-5-8-5z",
  grid: "M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z",
  palette:
    "M12 2a10 10 0 100 20 2 2 0 001.6-3.2c-.4-.5-.4-1.3 0-1.8A2 2 0 0115.2 16H17a5 5 0 005-5 9 9 0 00-10-9z",
  dock: "M5 5h2v2H5V5zm6 0h2v2h-2V5zm6 0h2v2h-2V5zM5 11h2v2H5v-2zm6 0h2v2h-2v-2zm6 0h2v2h-2v-2zM5 17h2v2H5v-2zm6 0h2v2h-2v-2zm6 0h2v2h-2v-2z",
  widget: "M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z",
  bell: "M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9zm4 13a2 2 0 004 0h-4z",
  spark:
    "M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4L12 2zM5 17l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2zm14-3l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z",
  speaker:
    "M3 9v6h4l5 4V5L7 9H3zm12 1.5a3 3 0 010 3v-3zm0-3.5a6 6 0 010 10v-2a4 4 0 000-6V7z",
  account:
    "M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm2 0v10h14V7H5z",
  info: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 5a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5zm1.25 11h-2.5v-7h2.5v7z",
};

const SECTIONS: SectionDef[] = [
  { id: "profile", label: "Profile", hint: "Name, photo, bio, socials", iconPath: ICON.user },
  { id: "workspaces", label: "Workspaces", hint: "Members, roles, invites", iconPath: ICON.grid },
  {
    id: "ai",
    label: "AI Assistant",
    hint: "Persona, credits, WhatsApp + Telegram",
    iconPath: ICON.spark,
  },
  { id: "appearance", label: "Appearance", hint: "Theme, icon style", iconPath: ICON.palette },
  { id: "dock", label: "Dock", hint: "Pinned apps", iconPath: ICON.dock },
  { id: "widgets", label: "Widgets", hint: "Live tiles", iconPath: ICON.widget },
  { id: "notifications", label: "Notifications", hint: "What you see", iconPath: ICON.bell },
  { id: "sounds", label: "Sounds", hint: "Taps and chimes", iconPath: ICON.speaker },
  { id: "account", label: "Account", hint: "Sign-in, password", iconPath: ICON.account },
  { id: "about", label: "About", hint: "Version, links", iconPath: ICON.info },
];

export default function MobileSettings({ open, initialSection = "profile", onClose }: Props) {
  const [section, setSection] = useState<MobileSettingsSection | null>(null);
  useEffect(() => {
    if (!open) return;
    setSection(initialSection);
  }, [open, initialSection]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc to close (plays nice with desktop browsers in mobile dev).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (section) setSection(null);
        else onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, section]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[85] bg-app text-app"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
        >
          {/* Root list */}
          <motion.div
            initial={{ x: 0 }}
            animate={{ x: section ? "-30%" : 0 }}
            transition={{ type: "tween", ease: EASE, duration: 0.28 }}
            className="absolute inset-0 flex flex-col"
          >
            <MobileNavBar title="Settings" onBack={onClose} backLabel="Done" />
            <div className="flex-1 overflow-y-auto px-4 pb-12 pt-3">
              <SectionGroup>
                {SECTIONS.map((s) => (
                  <SectionRow
                    key={s.id}
                    label={s.label}
                    hint={s.hint}
                    iconPath={s.iconPath}
                    onClick={() => setSection(s.id)}
                  />
                ))}
              </SectionGroup>
            </div>
          </motion.div>

          {/* Sub-screen — slides in from the right */}
          <AnimatePresence>
            {section && (
              <motion.div
                key={section}
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "tween", ease: EASE, duration: 0.3 }}
                className="absolute inset-0 flex flex-col bg-app"
              >
                <MobileNavBar
                  title={SECTIONS.find((s) => s.id === section)?.label ?? "Settings"}
                  onBack={() => setSection(null)}
                  backLabel="Settings"
                />
                <div className="flex-1 overflow-y-auto px-4 pb-12 pt-3">
                  {section === "profile" && (
                    <div className="rounded-2xl border border-app bg-app-elevated p-1">
                      <ProfilePane />
                    </div>
                  )}
                  {section === "workspaces" && (
                    <div className="rounded-2xl border border-app bg-app-elevated p-1">
                      <WorkspacesPane />
                    </div>
                  )}
                  {section === "ai" && (
                    <div className="rounded-2xl border border-app bg-app-elevated p-3">
                      <WorkspaceScopedSection section="ai" />
                    </div>
                  )}
                  {section === "appearance" && <AppearanceSection />}
                  {section === "dock" && <DockSection />}
                  {section === "widgets" && <WidgetsSection />}
                  {section === "notifications" && <NotificationsSection />}
                  {section === "sounds" && <SoundsSection />}
                  {section === "account" && <AccountSection />}
                  {section === "about" && <AboutSection />}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ──────────── Layout primitives ──────────── */

function MobileNavBar({
  title,
  onBack,
  backLabel,
}: {
  title: string;
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <div
      className="sf-glass-titlebar flex items-center justify-between px-4"
      style={{ paddingTop: "env(safe-area-inset-top, 12px)", height: "calc(56px + env(safe-area-inset-top, 0px))" }}
    >
      <button
        type="button"
        onClick={onBack}
        className="flex h-9 items-center gap-1 rounded-md px-2 text-[15px] text-tool-accent transition-colors active:bg-surface"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        {backLabel && <span>{backLabel}</span>}
      </button>
      <div className="text-base font-semibold text-app">{title}</div>
      <div className="w-16" aria-hidden="true" />
    </div>
  );
}

function SectionGroup({ children }: { children: ReactNode }) {
  return (
    <div className="sf-glass mb-4 overflow-hidden rounded-2xl divide-y divide-[color:var(--border)]">
      {children}
    </div>
  );
}

function SectionRow({
  label,
  hint,
  iconPath,
  onClick,
}: {
  label: string;
  hint?: string;
  iconPath: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-surface"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tool-accent-soft text-tool-accent">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d={iconPath} />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-app">{label}</span>
        {hint && <span className="mt-0.5 block text-[12px] text-muted">{hint}</span>}
      </span>
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
        className="text-faint"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

function ListRow({
  label,
  description,
  trailing,
  onClick,
}: {
  label: string;
  description?: string;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors active:bg-surface"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] text-app">{label}</span>
        {description && <span className="mt-0.5 block text-[11px] text-muted">{description}</span>}
      </span>
      <span className="shrink-0">{trailing}</span>
    </button>
  );
}

function MobileToggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      className={`relative inline-flex h-7 w-11 items-center rounded-full transition-colors ${
        on ? "bg-tool-accent" : "bg-surface-strong"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function MobilePillGroup<T extends string>({
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
            className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
              active
                ? "border-tool-accent bg-tool-accent text-white"
                : "border-app bg-app text-secondary active:bg-surface"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ──────────── Sections ──────────── */

function AppearanceSection() {
  const { resolved, theme, setTheme } = useTheme();
  const { style: iconStyle, setStyle: setIconStyle } = useIconStyle();

  return (
    <>
      <SectionGroup>
        <ListRow
          label="Theme"
          description={resolved === "light" ? "Light surfaces, dark text." : "Dark surfaces, light text."}
          trailing={
            <MobilePillGroup
              value={theme}
              onChange={(v) => setTheme(v)}
              options={[
                { id: "system", label: "Auto" },
                { id: "light", label: "Light" },
                { id: "dark", label: "Dark" },
              ]}
            />
          }
        />
        <ListRow
          label="Icon style"
          description="How app icons render."
          trailing={
            <MobilePillGroup
              value={iconStyle}
              onChange={setIconStyle}
              options={ICON_STYLES.map((s) => ({ id: s.id, label: s.name }))}
            />
          }
        />
      </SectionGroup>
      <p className="px-4 text-[12px] text-muted">
        Wallpaper picker is desktop-only. Theme and icon style apply across both shells.
      </p>
    </>
  );
}

function DockSection() {
  return (
    <>
      <SectionGroup>
        <div className="px-4 py-3 text-[13px] text-secondary">
          Tap and hold an app on the home screen to enter edit mode. The first four pinned apps appear in the dock.
        </div>
      </SectionGroup>
    </>
  );
}

function WidgetsSection() {
  const { active, remove } = useActiveWidgets();
  const meta = useMemo(
    () => Object.fromEntries(WIDGET_REGISTRY.map((w) => [w.id, w])),
    []
  );
  return (
    <>
      <p className="mb-2 px-4 text-[12px] text-muted">
        Widgets are visible on the desktop shell. Manage what shows up here.
      </p>
      <SectionGroup>
        {active.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-muted">No widgets active.</div>
        ) : (
          active.map((id) => {
            const w = meta[id];
            if (!w) return null;
            return (
              <ListRow
                key={id}
                label={w.name}
                description={w.description}
                trailing={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(id);
                    }}
                    className="rounded-md border border-app bg-app px-3 py-1 text-[12px] text-secondary active:bg-surface"
                  >
                    Hide
                  </button>
                }
              />
            );
          })
        )}
      </SectionGroup>
    </>
  );
}

function NotificationsSection() {
  return (
    <>
      <SectionGroup>
        <div className="px-4 py-3 text-[13px] text-secondary">
          Tap the bell in the status bar to view your latest notifications.
        </div>
      </SectionGroup>
    </>
  );
}

function SoundsSection() {
  const sounds = useDesktopSounds();
  return (
    <>
      <SectionGroup>
        <ListRow
          label="Mute UI sounds"
          description="Silence taps and chimes."
          trailing={<MobileToggle on={sounds.muted} onChange={sounds.toggleMute} />}
        />
        <ListRow
          label="Volume"
          description={`${Math.round(sounds.volume * 100)}% of master`}
          trailing={
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(sounds.volume * 100)}
              onChange={(e) => sounds.setVolume(Number(e.target.value) / 100)}
              aria-label="Volume"
              className="w-28 accent-[var(--tool-accent,#7c3aed)]"
              disabled={sounds.muted}
            />
          }
        />
        <ListRow
          label="Test sound"
          description="Plays the chime."
          trailing={
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                sounds.chime();
              }}
              className="rounded-md border border-app bg-app px-3 py-1 text-[12px] text-app active:bg-surface"
            >
              Play
            </button>
          }
        />
      </SectionGroup>
    </>
  );
}

function AccountSection() {
  const { workspaces } = useWorkspaces();
  return (
    <>
      <SectionGroup>
        <div className="px-4 py-3 text-[13px] text-secondary">
          Manage your sign-in and password under <strong>Profile</strong>. {workspaces.length} workspace
          {workspaces.length === 1 ? "" : "s"} on this account.
        </div>
      </SectionGroup>
    </>
  );
}

function AboutSection() {
  return (
    <>
      <SectionGroup>
        <ListRow label="Version" trailing={<span className="text-[13px] text-secondary">1.0</span>} />
        <ListRow label="Privacy" trailing={<a href="/privacy" className="text-tool-accent text-[13px]">Open</a>} />
        <ListRow label="Terms" trailing={<a href="/terms" className="text-tool-accent text-[13px]">Open</a>} />
        <ListRow label="Contact" trailing={<a href="/contact" className="text-tool-accent text-[13px]">Open</a>} />
      </SectionGroup>
      <p className="px-4 text-[11px] text-muted">
        Space Field — a desktop OS for the web. Local first, yours always.
      </p>
    </>
  );
}
