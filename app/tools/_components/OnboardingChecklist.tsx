"use client";

/* OnboardingChecklist — small floating "finish setting up" card anchored
 * at the bottom-LEFT of the desktop home (the bottom-RIGHT corner is
 * already taken by AgentChatLauncher).
 *
 * Behaviour:
 *   - Hidden when the user is signed out.
 *   - Hidden when every task is complete (writes a permanent
 *     `tools-desktop-onboarding-complete-v1` flag once, then never
 *     re-fetches the profile).
 *   - X button stashes a `tools-desktop-onboarding-dismissed-until-v1`
 *     timestamp 24h in the future, hides the widget, and ignores
 *     anything else until that timestamp passes.
 *   - On first mount, the widget waits 30 seconds before fading in so a
 *     returning user isn't immediately interrupted.
 *   - Re-evaluates state whenever the desktop dispatches the custom
 *     `tools-desktop-onboarding-refresh` event (other panes ping this
 *     after they save a profile field, install an app, change wallpaper
 *     etc.).
 *   - Clicking an incomplete row fires a CustomEvent
 *     `tools-desktop-onboarding-action` with `{ taskId }` so the
 *     Desktop / shell can route the user to the right surface. The
 *     widget itself doesn't navigate.
 *
 * The card sits at z-30 — same band as AgentChatLauncher and Dock so
 * it doesn't fight with windows / overlays.
 */

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import { useInstalledTools } from "./useInstalledTools";
import { useWorkspaceKey } from "./useWorkspaces";

const COMPLETE_KEY = "tools-desktop-onboarding-complete-v1";
const DISMISSED_UNTIL_KEY = "tools-desktop-onboarding-dismissed-until-v1";
const WALLPAPER_SUFFIX = "tools-desktop-wallpaper-v1";
const ACCENT_SUFFIX = "tools-desktop-accent-v1";
const DEFAULT_WALLPAPER_ID = "pair:aurora";
const DEFAULT_ACCENT_ID = "violet";
const FIRST_MOUNT_DELAY_MS = 30_000;
const DISMISSAL_WINDOW_MS = 24 * 60 * 60 * 1000;
const REFRESH_EVENT = "tools-desktop-onboarding-refresh";
const ACTION_EVENT = "tools-desktop-onboarding-action";

type TaskId =
  | "avatar"
  | "username"
  | "fullName"
  | "bio"
  | "wallpaper"
  | "installApp"
  | "accent";

interface TaskDef {
  id: TaskId;
  label: string;
  hint: string;
}

const TASKS: TaskDef[] = [
  {
    id: "avatar",
    label: "Upload profile photo",
    hint: "Drop a photo into Profile settings",
  },
  {
    id: "username",
    label: "Set a username",
    hint: "Pick a handle people can find you by",
  },
  {
    id: "fullName",
    label: "Add your name",
    hint: "Show up as a real person on shared workspaces",
  },
  {
    id: "bio",
    label: "Add a short bio",
    hint: "One line about what you do",
  },
  {
    id: "wallpaper",
    label: "Choose a wallpaper",
    hint: "Make the desktop feel like yours",
  },
  {
    id: "installApp",
    label: "Install your first app",
    hint: "Open the App Store and pick a tool",
  },
  {
    id: "accent",
    label: "Pick your accent color",
    hint: "Set the highlight tone in Settings → Appearance",
  },
];

interface ProfileState {
  avatar_url: string | null;
  username: string | null;
  full_name: string | null;
  bio: string | null;
}

const EMPTY_PROFILE: ProfileState = {
  avatar_url: null,
  username: null,
  full_name: null,
  bio: null,
};

function readWallpaperPicked(storageKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return false;
    return raw !== DEFAULT_WALLPAPER_ID;
  } catch {
    return false;
  }
}

function readAccentPicked(storageKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return false;
    return raw !== DEFAULT_ACCENT_ID;
  } catch {
    return false;
  }
}

function readBoolFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeBoolFlag(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(key, "true");
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* quota / private mode — silently ignore */
  }
}

function readDismissedUntil(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(DISMISSED_UNTIL_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeDismissedUntil(ts: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISSED_UNTIL_KEY, String(ts));
  } catch {
    /* ignore */
  }
}

export default function OnboardingChecklist() {
  const { user, hydrated: authHydrated, enabled: supabaseEnabled } = useAuth();
  const { installed } = useInstalledTools();
  const wallpaperKey = useWorkspaceKey(WALLPAPER_SUFFIX);
  const accentKey = useWorkspaceKey(ACCENT_SUFFIX);

  const [profile, setProfile] = useState<ProfileState>(EMPTY_PROFILE);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [completedFlag, setCompletedFlag] = useState<boolean>(() =>
    readBoolFlag(COMPLETE_KEY),
  );
  const [dismissedUntil, setDismissedUntil] = useState<number>(() =>
    readDismissedUntil(),
  );
  const [now, setNow] = useState<number>(() => Date.now());
  const [delayElapsed, setDelayElapsed] = useState(false);
  // Bumping `refreshTick` triggers a re-read of profile + storage flags.
  // Used by the custom-event listener so other panes can ping the widget
  // after they update e.g. the avatar URL or pick a wallpaper.
  const [refreshTick, setRefreshTick] = useState(0);

  // First-mount delay so a returning user isn't punched in the face by
  // the widget. Hidden completely until the timer fires.
  useEffect(() => {
    const t = window.setTimeout(() => setDelayElapsed(true), FIRST_MOUNT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  // Profile fetch — re-runs on user / workspace switch / refresh ping.
  useEffect(() => {
    if (!supabaseEnabled) {
      setProfile(EMPTY_PROFILE);
      setProfileLoaded(true);
      return;
    }
    if (!user) {
      setProfile(EMPTY_PROFILE);
      setProfileLoaded(false);
      return;
    }
    // Skip the round-trip entirely once everything's done.
    if (completedFlag) {
      setProfileLoaded(true);
      return;
    }
    let cancelled = false;
    const supabase = getSupabase();
    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("avatar_url, username, full_name, bio")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        const next: ProfileState =
          (data as ProfileState | null) ?? EMPTY_PROFILE;
        setProfile(next);
      } catch {
        if (!cancelled) setProfile(EMPTY_PROFILE);
      } finally {
        if (!cancelled) setProfileLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabaseEnabled, user, completedFlag, refreshTick]);

  // External refresh ping. Re-reads the dismissal timestamp + bumps
  // refreshTick so the profile re-fetches. Other panes call this after
  // they save a field so the user sees the row tick over without a
  // page reload.
  useEffect(() => {
    const onRefresh = () => {
      setCompletedFlag(readBoolFlag(COMPLETE_KEY));
      setDismissedUntil(readDismissedUntil());
      setNow(Date.now());
      setRefreshTick((x) => x + 1);
    };
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
  }, []);

  // Compute completion per task on every render (cheap).
  const completion = useMemo(() => {
    const wallpaperDone = readWallpaperPicked(wallpaperKey);
    const accentDone = readAccentPicked(accentKey);
    const map: Record<TaskId, boolean> = {
      avatar: !!profile.avatar_url && profile.avatar_url.length > 0,
      username: !!profile.username && profile.username.length > 0,
      fullName: !!profile.full_name && profile.full_name.length > 0,
      bio: !!profile.bio && profile.bio.length > 0,
      wallpaper: wallpaperDone,
      installApp: installed.length > 0,
      accent: accentDone,
    };
    return map;
    // refreshTick is included so an external ping re-reads localStorage flags.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, installed, wallpaperKey, accentKey, refreshTick]);

  const completedCount = useMemo(
    () => TASKS.reduce((acc, t) => acc + (completion[t.id] ? 1 : 0), 0),
    [completion],
  );
  const allDone = completedCount === TASKS.length;

  // Latch the permanent completion flag the moment all tasks tick over.
  // After this fires the widget will never query the profile again.
  useEffect(() => {
    if (allDone && !completedFlag) {
      writeBoolFlag(COMPLETE_KEY, true);
      setCompletedFlag(true);
    }
  }, [allDone, completedFlag]);

  const handleDismiss = useCallback(() => {
    const until = Date.now() + DISMISSAL_WINDOW_MS;
    writeDismissedUntil(until);
    setDismissedUntil(until);
  }, []);

  const handleTaskClick = useCallback(
    (taskId: TaskId) => {
      if (completion[taskId]) return;
      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent(ACTION_EVENT, { detail: { taskId } }),
      );
    },
    [completion],
  );

  // Visibility gate. We render nothing in any of the following cases:
  //   - Auth still hydrating (avoid a flash for signed-in users).
  //   - User signed out.
  //   - Permanent completion flag set.
  //   - Dismissal timestamp still in the future.
  //   - First-mount 30s grace window not yet elapsed.
  //   - Profile fetch hasn't completed (otherwise we'd briefly render
  //     "0 / 7" for someone whose profile is fully populated).
  //   - Every task is currently complete.
  if (!authHydrated) return null;
  if (!user) return null;
  if (completedFlag) return null;
  if (dismissedUntil > now) return null;
  if (!delayElapsed) return null;
  if (!profileLoaded) return null;
  if (allDone) return null;

  const progressPct = Math.round((completedCount / TASKS.length) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      role="region"
      aria-label="Finish setting up your profile"
      className="pointer-events-auto fixed bottom-6 left-6 z-30 w-[340px] overflow-hidden rounded-2xl border border-app bg-app-elevated shadow-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
            Get started
          </span>
          <span className="text-[13px] font-semibold text-app">
            Finish setting up
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[11px] font-medium text-tool-accent">
            {completedCount} / {TASKS.length}
          </span>
          <button
            type="button"
            aria-label="Dismiss for now"
            onClick={handleDismiss}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-app hover:text-app"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mx-4 h-1 overflow-hidden rounded-full bg-app">
        <div
          className="h-full bg-tool-accent transition-[width] duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Task list */}
      <ul className="px-2 py-2">
        {TASKS.map((task) => {
          const done = completion[task.id];
          return (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => handleTaskClick(task.id)}
                disabled={done}
                aria-label={done ? `${task.label} (done)` : task.label}
                className={`group flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                  done
                    ? "cursor-default opacity-70"
                    : "hover:bg-app focus:bg-app focus:outline-none"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors ${
                    done
                      ? "bg-tool-accent text-white"
                      : "border border-app text-transparent group-hover:border-tool-accent"
                  }`}
                >
                  {done && (
                    <svg
                      viewBox="0 0 24 24"
                      width="10"
                      height="10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className="flex flex-1 flex-col">
                  <span
                    className={`text-[13px] leading-snug ${
                      done ? "text-secondary line-through" : "text-app"
                    }`}
                  >
                    {task.label}
                  </span>
                  {!done && (
                    <span className="text-[11px] leading-snug text-secondary">
                      {task.hint}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}
