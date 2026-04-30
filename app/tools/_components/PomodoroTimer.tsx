"use client";

/* PomodoroTimer — top-bar work/break timer with persistence.
 *
 * Renders TWO things:
 *   1. A trigger button (icon + optional MM:SS readout) suitable for the
 *      top-bar's right cluster.
 *   2. A popover (anchored under the trigger) with presets, controls,
 *      and the current cycle count.
 *
 * Persistence:
 *   - Workspace-scoped under `tools-desktop-pomodoro-v1`.
 *   - Stores the current phase, durations, started-at, paused-at, paused
 *     elapsed, and the completed cycle count. So a refresh mid-cycle
 *     resumes the timer at the same offset.
 *
 * On expiry:
 *   - Plays the existing chime via `useDesktopSounds` (which already
 *     respects mute + DnD).
 *   - Surfaces a transient toast under the top-bar saying "Pomodoro
 *     complete — break time" / "Break over — back to work". The toast
 *     itself is suppressed when DnD is active. Cycle count advances on
 *     every completed work phase.
 */

import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isFocusActive } from "./useFocusMode";
import { useDesktopSounds } from "./useDesktopSounds";
import { useWorkspaceKey } from "./useWorkspaces";

const STORAGE_SUFFIX = "tools-desktop-pomodoro-v1";

type Phase = "idle" | "work" | "break";

interface PomodoroState {
  phase: Phase;
  workMinutes: number;
  breakMinutes: number;
  /** Epoch ms when the current phase was started. null when idle. */
  startedAt: number | null;
  /** Total ms accumulated while paused for the current phase. */
  pausedElapsed: number;
  /** Epoch ms when the current pause began. null when running. */
  pausedAt: number | null;
  /** Number of completed work phases in the active session. */
  cycles: number;
}

const DEFAULT_STATE: PomodoroState = {
  phase: "idle",
  workMinutes: 25,
  breakMinutes: 5,
  startedAt: null,
  pausedElapsed: 0,
  pausedAt: null,
  cycles: 0,
};

const WORK_PRESETS = [
  { minutes: 25, label: "25 min" },
  { minutes: 50, label: "50 min" },
  { minutes: 90, label: "90 min" },
];

const BREAK_PRESETS = [
  { minutes: 5, label: "5 min" },
  { minutes: 15, label: "15 min" },
];

function readState(key: string): PomodoroState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<PomodoroState>;
    return {
      phase:
        parsed.phase === "work" || parsed.phase === "break" ? parsed.phase : "idle",
      workMinutes:
        typeof parsed.workMinutes === "number" && parsed.workMinutes > 0
          ? Math.min(180, parsed.workMinutes)
          : DEFAULT_STATE.workMinutes,
      breakMinutes:
        typeof parsed.breakMinutes === "number" && parsed.breakMinutes > 0
          ? Math.min(60, parsed.breakMinutes)
          : DEFAULT_STATE.breakMinutes,
      startedAt:
        typeof parsed.startedAt === "number" && Number.isFinite(parsed.startedAt)
          ? parsed.startedAt
          : null,
      pausedElapsed:
        typeof parsed.pausedElapsed === "number" && parsed.pausedElapsed >= 0
          ? parsed.pausedElapsed
          : 0,
      pausedAt:
        typeof parsed.pausedAt === "number" && Number.isFinite(parsed.pausedAt)
          ? parsed.pausedAt
          : null,
      cycles:
        typeof parsed.cycles === "number" && parsed.cycles >= 0
          ? parsed.cycles
          : 0,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeState(key: string, state: PomodoroState) {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function phaseDurationMs(state: PomodoroState): number {
  if (state.phase === "work") return state.workMinutes * 60_000;
  if (state.phase === "break") return state.breakMinutes * 60_000;
  return 0;
}

function elapsedMs(state: PomodoroState, now: number): number {
  if (state.phase === "idle" || state.startedAt === null) return 0;
  const base = now - state.startedAt - state.pausedElapsed;
  if (state.pausedAt !== null) {
    return base - (now - state.pausedAt);
  }
  return base;
}

function formatMMSS(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export interface PomodoroTimerProps {
  /** Hook the popover anchor point off this. */
  buttonClassName?: string;
}

export default function PomodoroTimer({
  buttonClassName,
}: PomodoroTimerProps) {
  const STORAGE_KEY = useWorkspaceKey(STORAGE_SUFFIX);
  const sounds = useDesktopSounds();
  const [state, setState] = useState<PomodoroState>(DEFAULT_STATE);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const lastTickRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Hydrate once workspace context is ready.
  useEffect(() => {
    setState(readState(STORAGE_KEY));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setState(readState(STORAGE_KEY));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [STORAGE_KEY]);

  const persist = useCallback(
    (next: PomodoroState) => {
      setState(next);
      writeState(STORAGE_KEY, next);
    },
    [STORAGE_KEY],
  );

  // Tick once per second when a phase is active and not paused.
  useEffect(() => {
    if (state.phase === "idle") return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [state.phase]);

  // Position the popover under the trigger when opening.
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    const onResize = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  // Click-outside / Esc to close popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (btnRef.current?.contains(t)) return;
      if (t.closest?.("[data-pomodoro-popover]")) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const showToast = useCallback((msg: string) => {
    if (isFocusActive()) return;
    setToast(msg);
    window.setTimeout(() => {
      setToast((t) => (t === msg ? null : t));
    }, 4000);
  }, []);

  // Phase-expiry detection. We compute remaining ms each render; when it
  // hits 0 while a phase is running, advance.
  const total = phaseDurationMs(state);
  const elapsed = state.phase === "idle" ? 0 : elapsedMs(state, now);
  const remaining = state.phase === "idle" ? 0 : Math.max(0, total - elapsed);

  useEffect(() => {
    if (state.phase === "idle") return;
    if (state.pausedAt !== null) return;
    if (remaining > 0) return;
    // Avoid double-advance from rapid renders — debounce on tick id.
    if (lastTickRef.current === state.startedAt) return;
    lastTickRef.current = state.startedAt ?? 0;

    sounds.chime();
    if (state.phase === "work") {
      const next: PomodoroState = {
        ...state,
        phase: "break",
        startedAt: Date.now(),
        pausedElapsed: 0,
        pausedAt: null,
        cycles: state.cycles + 1,
      };
      persist(next);
      showToast("Pomodoro complete — break time");
    } else {
      const next: PomodoroState = {
        ...state,
        phase: "work",
        startedAt: Date.now(),
        pausedElapsed: 0,
        pausedAt: null,
      };
      persist(next);
      showToast("Break over — back to work");
    }
  }, [remaining, state, sounds, persist, showToast]);

  /* ─── Controls ─── */

  const startWork = useCallback(
    (minutes: number) => {
      const next: PomodoroState = {
        ...state,
        phase: "work",
        workMinutes: minutes,
        startedAt: Date.now(),
        pausedElapsed: 0,
        pausedAt: null,
      };
      persist(next);
    },
    [state, persist],
  );

  const startBreak = useCallback(
    (minutes: number) => {
      const next: PomodoroState = {
        ...state,
        phase: "break",
        breakMinutes: minutes,
        startedAt: Date.now(),
        pausedElapsed: 0,
        pausedAt: null,
      };
      persist(next);
    },
    [state, persist],
  );

  const pauseOrResume = useCallback(() => {
    if (state.phase === "idle" || state.startedAt === null) return;
    if (state.pausedAt === null) {
      // Pausing
      persist({ ...state, pausedAt: Date.now() });
    } else {
      // Resuming
      const additional = Date.now() - state.pausedAt;
      persist({
        ...state,
        pausedAt: null,
        pausedElapsed: state.pausedElapsed + additional,
      });
    }
  }, [state, persist]);

  const stop = useCallback(() => {
    persist({
      ...state,
      phase: "idle",
      startedAt: null,
      pausedElapsed: 0,
      pausedAt: null,
    });
  }, [state, persist]);

  const resetCycles = useCallback(() => {
    persist({ ...state, cycles: 0 });
  }, [state, persist]);

  const isRunning = state.phase !== "idle";
  const isPaused = isRunning && state.pausedAt !== null;
  const showCompactReadout = isRunning;

  // Color shifts: emerald during work, amber during break.
  const readoutColor =
    state.phase === "work"
      ? "text-emerald-500"
      : state.phase === "break"
        ? "text-amber-500"
        : "text-app";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          isRunning
            ? `Pomodoro ${state.phase} — ${formatMMSS(remaining)} remaining`
            : "Pomodoro timer"
        }
        title={
          isRunning
            ? `Pomodoro ${state.phase} — ${formatMMSS(remaining)}`
            : "Pomodoro timer"
        }
        className={
          buttonClassName ??
          `flex h-6 items-center gap-1 rounded px-1.5 text-app transition-colors hover:bg-surface ${
            open ? "bg-surface-strong" : ""
          }`
        }
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
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2 2" />
          <path d="M9 2h6" />
        </svg>
        {showCompactReadout && (
          <span className={`text-[0.7rem] tabular-nums ${readoutColor}`}>
            {formatMMSS(remaining)}
          </span>
        )}
      </button>

      {open && pos && mounted &&
        createPortal(
          <div
            data-pomodoro-popover=""
            className="sf-glass-menu fixed z-[70] w-[260px] rounded-xl p-3"
            style={{ top: pos.top, right: pos.right }}
            role="dialog"
            aria-label="Pomodoro timer"
          >
            {/* Phase + readout */}
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[0.6rem] uppercase tracking-[0.14em] text-muted">
                {state.phase === "work"
                  ? "Work"
                  : state.phase === "break"
                    ? "Break"
                    : "Pomodoro"}
              </span>
              <span className="text-[0.65rem] text-faint">
                Cycles {state.cycles}
              </span>
            </div>
            <div
              className={`text-center font-semibold tabular-nums ${
                isRunning ? readoutColor : "text-app"
              } text-[2rem] leading-none`}
            >
              {isRunning
                ? formatMMSS(remaining)
                : `${state.workMinutes.toString().padStart(2, "0")}:00`}
            </div>

            {/* Controls */}
            {!isRunning ? (
              <>
                <div className="mt-3">
                  <div className="mb-1 text-[0.6rem] uppercase tracking-[0.14em] text-muted">
                    Work
                  </div>
                  <div className="flex gap-1.5">
                    {WORK_PRESETS.map((p) => (
                      <button
                        key={p.minutes}
                        type="button"
                        onClick={() => startWork(p.minutes)}
                        className={`flex-1 rounded-md border border-app py-1.5 text-[0.7rem] text-app transition-colors hover:bg-surface ${
                          state.workMinutes === p.minutes
                            ? "bg-surface-strong"
                            : "bg-app"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-2">
                  <div className="mb-1 text-[0.6rem] uppercase tracking-[0.14em] text-muted">
                    Break
                  </div>
                  <div className="flex gap-1.5">
                    {BREAK_PRESETS.map((p) => (
                      <button
                        key={p.minutes}
                        type="button"
                        onClick={() => startBreak(p.minutes)}
                        className={`flex-1 rounded-md border border-app py-1.5 text-[0.7rem] text-app transition-colors hover:bg-surface ${
                          state.breakMinutes === p.minutes
                            ? "bg-surface-strong"
                            : "bg-app"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3">
                  <CustomMinutesInput
                    onStart={(mins) => startWork(mins)}
                  />
                </div>
              </>
            ) : (
              <div className="mt-3 flex gap-1.5">
                <button
                  type="button"
                  onClick={pauseOrResume}
                  className="flex-1 rounded-md bg-tool-accent py-2 text-[0.75rem] font-medium text-white transition-opacity hover:opacity-90"
                >
                  {isPaused ? "Resume" : "Pause"}
                </button>
                <button
                  type="button"
                  onClick={stop}
                  className="flex-1 rounded-md border border-app bg-app py-2 text-[0.75rem] font-medium text-app transition-colors hover:bg-surface"
                >
                  Stop
                </button>
              </div>
            )}

            {state.cycles > 0 && (
              <button
                type="button"
                onClick={resetCycles}
                className="mt-2 w-full rounded-md py-1 text-[0.65rem] text-faint transition-colors hover:text-secondary"
              >
                Reset cycle count
              </button>
            )}
          </div>,
          document.body,
        )}

      {/* Phase-complete toast — top center under the top-bar. */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="sf-glass-menu pointer-events-none fixed left-1/2 top-10 z-[80] -translate-x-1/2 rounded-lg px-3 py-1.5 text-[0.75rem] text-app"
            role="status"
            aria-live="polite"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* Custom-minutes input — lets the user type any 1-180 minute value. */
function CustomMinutesInput({ onStart }: { onStart: (mins: number) => void }) {
  const [value, setValue] = useState("");
  const submit = () => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1 || n > 180) return;
    onStart(n);
    setValue("");
  };
  return (
    <div className="flex gap-1.5">
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={180}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Custom"
        className="flex-1 rounded-md border border-app bg-app px-2 py-1.5 text-[0.7rem] text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!value}
        className="rounded-md bg-tool-accent px-3 py-1.5 text-[0.7rem] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        Start
      </button>
    </div>
  );
}
