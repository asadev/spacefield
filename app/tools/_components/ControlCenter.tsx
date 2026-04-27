"use client";

/* ControlCenter — slide-down quick-settings panel.
 *
 * Layout:
 *   - Desktop: 320 px wide card anchored to the top-right under the
 *     top-bar (~h-8). Drops in with a subtle scale/opacity.
 *   - Mobile:  full-width sheet that slides down from the status bar.
 *
 * Sections:
 *   1. Theme (Light / Dark / Auto-system / Auto-schedule, segmented)
 *      + cutoff-time inputs when Auto-schedule is selected.
 *   2. Focus / Do-Not-Disturb — primary toggle + quick durations.
 *   3. Sound — master mute toggle (calls existing useDesktopSounds API).
 *   4. Accent color — 6 swatches + custom hex.
 *   5. Quick links — Settings / Workspaces / Sign out.
 *   6. Footer — version + brand.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/components/ThemeProvider";
import packageJson from "../../../package.json";
import { useAuth } from "./useAuth";
import { useAutoTheme } from "./useAutoTheme";
import { useDesktopSounds } from "./useDesktopSounds";
import { useFocusMode } from "./useFocusMode";
import { useWorkspaceKey } from "./useWorkspaces";

const ACCENT_STORAGE_SUFFIX = "tools-desktop-accent-v1";

const ACCENT_SWATCHES: { id: string; label: string; swatch: string }[] = [
  { id: "violet", label: "Violet", swatch: "#7c3aed" },
  { id: "blue", label: "Blue", swatch: "#2563eb" },
  { id: "teal", label: "Teal", swatch: "#0d9488" },
  { id: "amber", label: "Amber", swatch: "#d97706" },
  { id: "rose", label: "Rose", swatch: "#e11d48" },
  { id: "slate", label: "Slate", swatch: "#475569" },
];

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Desktop OR mobile placement strategy. Defaults to desktop. */
  placement?: "desktop" | "mobile";
  /** Open Settings → Appearance / Workspaces. The full Settings panel
   * lives in Desktop.tsx; we ask the parent to surface it. */
  onOpenSettings?: () => void;
  onOpenWorkspaces?: () => void;
}

export default function ControlCenter({
  open,
  onClose,
  placement = "desktop",
  onOpenSettings,
  onOpenWorkspaces,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — transparent click-catcher */}
          <motion.button
            type="button"
            aria-label="Close Control Center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-[78] cursor-default"
            style={{ background: "transparent" }}
          />
          {placement === "mobile" ? (
            <MobilePanel onClose={onClose} onOpenSettings={onOpenSettings} onOpenWorkspaces={onOpenWorkspaces} />
          ) : (
            <DesktopPanel onClose={onClose} onOpenSettings={onOpenSettings} onOpenWorkspaces={onOpenWorkspaces} />
          )}
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ─── Desktop placement: top-right under the 32px topbar ─── */

function DesktopPanel({
  onClose,
  onOpenSettings,
  onOpenWorkspaces,
}: {
  onClose: () => void;
  onOpenSettings?: () => void;
  onOpenWorkspaces?: () => void;
}) {
  return (
    <motion.aside
      key="desktop-panel"
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 360, damping: 32 }}
      data-control-center
      role="dialog"
      aria-label="Control Center"
      className="fixed right-2 top-9 z-[79] w-[320px] overflow-hidden rounded-2xl border border-app bg-app-elevated/95 shadow-2xl backdrop-blur-2xl"
    >
      <Body
        onClose={onClose}
        onOpenSettings={onOpenSettings}
        onOpenWorkspaces={onOpenWorkspaces}
      />
    </motion.aside>
  );
}

/* ─── Mobile placement: slide down full-width from status bar ─── */

function MobilePanel({
  onClose,
  onOpenSettings,
  onOpenWorkspaces,
}: {
  onClose: () => void;
  onOpenSettings?: () => void;
  onOpenWorkspaces?: () => void;
}) {
  return (
    <motion.aside
      key="mobile-panel"
      initial={{ y: "-100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "-100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.2}
      onDragEnd={(_, info) => {
        if (info.offset.y < -80 || info.velocity.y < -500) onClose();
      }}
      data-control-center
      role="dialog"
      aria-label="Control Center"
      className="fixed inset-x-0 top-0 z-[79] mx-2 mt-2 overflow-hidden rounded-2xl border border-app bg-app-elevated/95 shadow-2xl backdrop-blur-2xl"
      style={{ touchAction: "pan-y" }}
    >
      <div
        className="flex justify-center pt-2"
        aria-hidden="true"
      >
        <span className="h-1 w-10 rounded-full bg-app/40" />
      </div>
      <Body
        onClose={onClose}
        onOpenSettings={onOpenSettings}
        onOpenWorkspaces={onOpenWorkspaces}
      />
    </motion.aside>
  );
}

/* ─── Shared body ─── */

function Body({
  onClose,
  onOpenSettings,
  onOpenWorkspaces,
}: {
  onClose: () => void;
  onOpenSettings?: () => void;
  onOpenWorkspaces?: () => void;
}) {
  const { theme: rawTheme, setTheme } = useTheme();
  const auto = useAutoTheme();
  const focus = useFocusMode();
  const sounds = useDesktopSounds();
  const auth = useAuth();

  // Segmented theme picker — extends the existing 3-mode ThemeProvider with
  // a fourth "schedule" virtual mode powered by useAutoTheme.
  const themeMode: "light" | "dark" | "system" | "schedule" = auto.schedule
    .enabled
    ? "schedule"
    : rawTheme;

  const handleThemeChange = (next: typeof themeMode) => {
    if (next === "schedule") {
      auto.setEnabled(true);
      return;
    }
    if (auto.schedule.enabled) auto.setEnabled(false);
    setTheme(next);
  };

  return (
    <div className="flex max-h-[calc(100dvh-3rem)] flex-col gap-4 overflow-y-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
          Control Center
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-app text-secondary transition-colors hover:bg-surface hover:text-app"
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

      {/* Theme */}
      <Section label="Theme">
        <Segmented<"light" | "dark" | "system" | "schedule">
          value={themeMode}
          onChange={handleThemeChange}
          options={[
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
            { id: "system", label: "Auto" },
            { id: "schedule", label: "Schedule" },
          ]}
        />
        {themeMode === "schedule" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <TimeField
              label="Light from"
              value={auto.schedule.lightStart}
              onChange={auto.setLightStart}
            />
            <TimeField
              label="Dark from"
              value={auto.schedule.darkStart}
              onChange={auto.setDarkStart}
            />
          </div>
        )}
      </Section>

      {/* Focus / DnD */}
      <Section label="Focus">
        <button
          type="button"
          onClick={() => {
            if (focus.active) focus.disable();
            else focus.enable("until-toggle");
          }}
          className={`flex h-11 w-full items-center justify-between rounded-xl px-4 text-sm font-medium transition-colors ${
            focus.active
              ? "bg-tool-accent text-white"
              : "border border-app bg-app text-app hover:bg-surface"
          }`}
          aria-pressed={focus.active}
        >
          <span className="flex items-center gap-2">
            <MoonIcon />
            Do Not Disturb
          </span>
          <span className="text-[0.7rem] opacity-80">
            {focus.active ? focusLabel(focus.mode, focus.endsAt) : "Off"}
          </span>
        </button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <DurationButton
            label="15 min"
            onClick={() => focus.enable(15)}
            active={focus.active && focus.mode === "until-time" && minutesLeft(focus.endsAt) <= 15}
          />
          <DurationButton
            label="1 hour"
            onClick={() => focus.enable(60)}
            active={focus.active && focus.mode === "until-time" && minutesLeft(focus.endsAt) > 15 && minutesLeft(focus.endsAt) <= 60}
          />
          <DurationButton
            label="Until tomorrow"
            onClick={() => focus.enable(minutesUntilTomorrow())}
            active={focus.active && focus.mode === "until-time" && minutesLeft(focus.endsAt) > 60}
          />
          <DurationButton
            label="Until I turn off"
            onClick={() => focus.enable("until-toggle")}
            active={focus.active && focus.mode === "until-toggle"}
          />
        </div>
      </Section>

      {/* Sound */}
      <Section label="Sound">
        <button
          type="button"
          onClick={sounds.toggleMute}
          className="flex h-11 w-full items-center justify-between rounded-xl border border-app bg-app px-4 text-sm font-medium text-app transition-colors hover:bg-surface"
          aria-pressed={!sounds.muted}
        >
          <span className="flex items-center gap-2">
            {sounds.muted ? <MutedIcon /> : <SoundIcon />}
            {sounds.muted ? "Sound is muted" : "Sound is on"}
          </span>
          <span className="text-[0.7rem] text-secondary">
            {sounds.muted ? "Tap to unmute" : "Tap to mute"}
          </span>
        </button>
      </Section>

      {/* Accent */}
      <Section label="Accent">
        <AccentSwatches />
      </Section>

      {/* Quick links */}
      <Section label="Quick">
        <div className="grid grid-cols-2 gap-2">
          <QuickButton
            label="Settings"
            onClick={() => {
              onOpenSettings?.();
              onClose();
            }}
          />
          <QuickButton
            label="Workspaces"
            onClick={() => {
              onOpenWorkspaces?.();
              onClose();
            }}
          />
          {auth.user ? (
            <QuickButton
              label="Sign out"
              tone="danger"
              onClick={async () => {
                onClose();
                await auth.signOut();
              }}
            />
          ) : null}
        </div>
      </Section>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-app pt-3 text-[0.65rem] text-faint">
        <span>Spacefield</span>
        <span className="tabular-nums">v{packageJson.version}</span>
      </div>
    </div>
  );
}

/* ─── Accent swatches with hex input ─── */

function AccentSwatches() {
  const KEY = useWorkspaceKey(ACCENT_STORAGE_SUFFIX);
  const [value, setValue] = useState<string>("");
  const [hexInput, setHexInput] = useState<string>("");

  // Hydrate on mount
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY) ?? "";
      setValue(v);
      if (v.startsWith("#")) setHexInput(v);
    } catch {
      /* ignore */
    }
  }, [KEY]);

  const pick = (id: string) => {
    setValue(id);
    try {
      localStorage.setItem(KEY, id);
      window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: id }));
    } catch {
      /* ignore */
    }
  };

  const submitHex = () => {
    if (!HEX_RE.test(hexInput)) return;
    pick(hexInput);
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        {ACCENT_SWATCHES.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => pick(a.id)}
            aria-label={a.label}
            title={a.label}
            className={`h-8 w-8 shrink-0 rounded-full ring-2 transition-all ${
              value === a.id
                ? "ring-tool-accent scale-110"
                : "ring-transparent hover:scale-105"
            }`}
            style={{ background: a.swatch }}
          />
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <input
          type="text"
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitHex();
          }}
          placeholder="#7c3aed"
          spellCheck={false}
          className="flex-1 rounded-md border border-app bg-app px-2 py-1.5 text-[0.7rem] font-mono text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={submitHex}
          disabled={!HEX_RE.test(hexInput)}
          className="rounded-md bg-tool-accent px-3 py-1.5 text-[0.7rem] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

/* ─── Primitives ─── */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[0.6rem] uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
      {children}
    </div>
  );
}

interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
}) {
  return (
    <div className="flex w-full overflow-hidden rounded-xl border border-app bg-app p-0.5">
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={active}
            className={`flex-1 rounded-lg px-2 py-1.5 text-[0.7rem] font-medium transition-colors ${
              active
                ? "bg-tool-accent text-white shadow-sm"
                : "text-secondary hover:text-app"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.6rem] uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-app bg-app px-2 py-1.5 text-[0.75rem] tabular-nums text-app focus:border-tool-accent focus:outline-none"
      />
    </label>
  );
}

function DurationButton({
  label,
  onClick,
  active,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[44px] items-center justify-center rounded-lg px-2 text-[0.72rem] font-medium transition-colors ${
        active
          ? "bg-tool-accent-soft text-tool-accent ring-1 ring-tool-accent/40"
          : "border border-app bg-app text-app hover:bg-surface"
      }`}
    >
      {label}
    </button>
  );
}

function QuickButton({
  label,
  onClick,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[44px] items-center justify-center rounded-lg border px-2 text-[0.75rem] font-medium transition-colors ${
        tone === "danger"
          ? "border-app bg-app text-rose-500 hover:bg-surface"
          : "border-app bg-app text-app hover:bg-surface"
      }`}
    >
      {label}
    </button>
  );
}

/* ─── Helpers + icons ─── */

function focusLabel(mode: ReturnType<typeof useFocusMode>["mode"], endsAt: number | null): string {
  if (mode === "until-toggle") return "On";
  if (mode === "until-time" && endsAt !== null) {
    const mins = Math.max(0, Math.round((endsAt - Date.now()) / 60_000));
    if (mins < 60) return `${mins}m left`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h left` : `${h}h ${m}m left`;
  }
  return "On";
}

function minutesLeft(endsAt: number | null): number {
  if (endsAt === null) return Infinity;
  return Math.max(0, Math.round((endsAt - Date.now()) / 60_000));
}

function minutesUntilTomorrow(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(7, 0, 0, 0); // Default "tomorrow morning" cutoff.
  return Math.max(60, Math.round((tomorrow.getTime() - now.getTime()) / 60_000));
}

function MoonIcon() {
  return (
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
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

function SoundIcon() {
  return (
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
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 010 14.14" />
      <path d="M15.54 8.46a5 5 0 010 7.07" />
    </svg>
  );
}

function MutedIcon() {
  return (
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
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}
