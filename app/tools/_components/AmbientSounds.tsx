"use client";

/* AmbientSounds — Web-Audio synthesized ambient sound mixer.
 *
 * Six procedural sounds: white / pink / brown noise, rain, café, ocean.
 * Each has a per-track enable + volume (0-100%). State persists in
 * `tools-desktop-ambient-v1` (global, NOT workspace-scoped — ambient is
 * the user's mood, not a workspace artifact). Sounds resume on page
 * load if they were on, but only after the user's first click on the
 * page (browser autoplay policy).
 *
 * Master mute: respects the existing UI-sound key
 * `tools-desktop-sound-v1` per workspace. When the user mutes the
 * desktop, the ambient mixer's output gain drops to 0 too — keeps the
 * "global mute" mental model consistent.
 *
 * UI surface: a tiny floating button in the bottom-right corner shows up
 * whenever any ambient track is active, opening a small mixer panel.
 * Agent 1's ControlCenter can also open the same panel by dispatching
 *   window.dispatchEvent(new CustomEvent("spacefield:ambient-toggle"))
 * — this component listens for that event so the Control Center button
 * doesn't need to import us.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "tools-desktop-ambient-v1";

type SoundKey = "white" | "pink" | "brown" | "rain" | "cafe" | "ocean";

interface TrackState {
  on: boolean;
  volume: number; // 0..1
}

interface AmbientState {
  tracks: Record<SoundKey, TrackState>;
}

const DEFAULT_TRACK: TrackState = { on: false, volume: 0.4 };
const DEFAULT_STATE: AmbientState = {
  tracks: {
    white: { ...DEFAULT_TRACK },
    pink: { ...DEFAULT_TRACK },
    brown: { ...DEFAULT_TRACK },
    rain: { ...DEFAULT_TRACK },
    cafe: { ...DEFAULT_TRACK },
    ocean: { ...DEFAULT_TRACK },
  },
};

const SOUND_LIST: { key: SoundKey; label: string; description: string }[] = [
  { key: "white", label: "White noise", description: "Uniform hiss" },
  { key: "pink", label: "Pink noise", description: "Softer, balanced spectrum" },
  { key: "brown", label: "Brown noise", description: "Deep low-end rumble" },
  { key: "rain", label: "Rain", description: "Steady fall with droplets" },
  { key: "cafe", label: "Café", description: "Murmur and low rumble" },
  { key: "ocean", label: "Ocean waves", description: "Slow rolling swells" },
];

function loadState(): AmbientState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<AmbientState>;
    const tracks = parsed?.tracks ?? {};
    const next: AmbientState = { tracks: { ...DEFAULT_STATE.tracks } };
    for (const k of Object.keys(DEFAULT_STATE.tracks) as SoundKey[]) {
      const t = (tracks as Record<string, TrackState | undefined>)[k];
      if (
        t &&
        typeof t.on === "boolean" &&
        typeof t.volume === "number" &&
        t.volume >= 0 &&
        t.volume <= 1
      ) {
        next.tracks[k] = { on: t.on, volume: t.volume };
      }
    }
    return next;
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: AmbientState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota — ignore */
  }
}

/* Read the desktop's master-mute flag. Workspace-scoped, but we don't
 * have access to the active id here (this component sits at the desktop
 * root, not inside a workspace hook). So we scan all `ws:*:tools-desktop-sound-v1`
 * keys: if ANY active workspace has muted set to true, we mute the
 * mixer. In practice the user usually only has one tab focused, and the
 * mute flag is a "vibe" setting — being conservative is the right call. */
function readMasterMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.endsWith(":tools-desktop-sound-v1")) continue;
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { muted?: boolean };
      if (parsed?.muted === true) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/* ============================================================
 * Audio engine — each track is a small graph hung off a master gain.
 * Lazily instantiated on the first user click.
 * ============================================================ */

interface TrackNode {
  outputGain: GainNode;
  cleanup: () => void;
}

function makeNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

function makePinkBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  // Voss-McCartney pink noise approximation.
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

function makeBrownBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

function startWhite(ctx: AudioContext): TrackNode {
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, 2);
  src.loop = true;
  const out = ctx.createGain();
  out.gain.value = 0;
  src.connect(out);
  src.start();
  return {
    outputGain: out,
    cleanup: () => {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      src.disconnect();
      out.disconnect();
    },
  };
}

function startPink(ctx: AudioContext): TrackNode {
  const src = ctx.createBufferSource();
  src.buffer = makePinkBuffer(ctx, 2);
  src.loop = true;
  const out = ctx.createGain();
  out.gain.value = 0;
  src.connect(out);
  src.start();
  return {
    outputGain: out,
    cleanup: () => {
      try {
        src.stop();
      } catch {
        /* */
      }
      src.disconnect();
      out.disconnect();
    },
  };
}

function startBrown(ctx: AudioContext): TrackNode {
  const src = ctx.createBufferSource();
  src.buffer = makeBrownBuffer(ctx, 2);
  src.loop = true;
  // Steepen the low-pass for a heavier rumble.
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 240;
  const out = ctx.createGain();
  out.gain.value = 0;
  src.connect(lp).connect(out);
  src.start();
  return {
    outputGain: out,
    cleanup: () => {
      try {
        src.stop();
      } catch {
        /* */
      }
      src.disconnect();
      lp.disconnect();
      out.disconnect();
    },
  };
}

function startRain(ctx: AudioContext): TrackNode {
  // Rain = filtered white-noise base + occasional droplet sine bursts.
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, 2);
  src.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 800;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 4500;
  const out = ctx.createGain();
  out.gain.value = 0;
  src.connect(hp).connect(lp).connect(out);
  src.start();

  let timer: number | null = null;
  const droplet = () => {
    if (out.gain.value <= 0.0001) {
      // Track is muted — skip droplet but keep the timer alive so the
      // pattern picks up when the user un-mutes.
      timer = window.setTimeout(droplet, 600 + Math.random() * 1400);
      return;
    }
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 800 + Math.random() * 1800;
    env.gain.value = 0;
    const now = ctx.currentTime;
    env.gain.linearRampToValueAtTime(0.04 * Math.random() + 0.01, now + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(env).connect(out);
    osc.start(now);
    osc.stop(now + 0.1);
    timer = window.setTimeout(droplet, 350 + Math.random() * 900);
  };
  timer = window.setTimeout(droplet, 800);

  return {
    outputGain: out,
    cleanup: () => {
      if (timer !== null) window.clearTimeout(timer);
      try {
        src.stop();
      } catch {
        /* */
      }
      src.disconnect();
      hp.disconnect();
      lp.disconnect();
      out.disconnect();
    },
  };
}

function startCafe(ctx: AudioContext): TrackNode {
  // Loose pink noise band-passed around speech frequencies + low rumble.
  const src = ctx.createBufferSource();
  src.buffer = makePinkBuffer(ctx, 3);
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 600;
  bp.Q.value = 0.6;

  const rumbleSrc = ctx.createBufferSource();
  rumbleSrc.buffer = makeBrownBuffer(ctx, 3);
  rumbleSrc.loop = true;
  const rumbleLp = ctx.createBiquadFilter();
  rumbleLp.type = "lowpass";
  rumbleLp.frequency.value = 120;
  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.4;

  const out = ctx.createGain();
  out.gain.value = 0;
  src.connect(bp).connect(out);
  rumbleSrc.connect(rumbleLp).connect(rumbleGain).connect(out);
  src.start();
  rumbleSrc.start();

  return {
    outputGain: out,
    cleanup: () => {
      try {
        src.stop();
        rumbleSrc.stop();
      } catch {
        /* */
      }
      src.disconnect();
      bp.disconnect();
      rumbleSrc.disconnect();
      rumbleLp.disconnect();
      rumbleGain.disconnect();
      out.disconnect();
    },
  };
}

function startOcean(ctx: AudioContext): TrackNode {
  // Brown noise with a slow LFO modulating a low-pass cutoff for the
  // breathing wave shape.
  const src = ctx.createBufferSource();
  src.buffer = makeBrownBuffer(ctx, 3);
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 600;
  lp.Q.value = 0.4;

  // LFO drives the cutoff between ~250 Hz and ~900 Hz over ~10 s.
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.1;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 320;
  lfo.connect(lfoGain).connect(lp.frequency);
  lfo.start();

  const out = ctx.createGain();
  out.gain.value = 0;
  src.connect(lp).connect(out);
  src.start();

  return {
    outputGain: out,
    cleanup: () => {
      try {
        src.stop();
        lfo.stop();
      } catch {
        /* */
      }
      src.disconnect();
      lp.disconnect();
      lfo.disconnect();
      lfoGain.disconnect();
      out.disconnect();
    },
  };
}

const STARTERS: Record<SoundKey, (ctx: AudioContext) => TrackNode> = {
  white: startWhite,
  pink: startPink,
  brown: startBrown,
  rain: startRain,
  cafe: startCafe,
  ocean: startOcean,
};

export default function AmbientSounds() {
  const [state, setState] = useState<AmbientState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [masterMuted, setMasterMuted] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const tracksRef = useRef<Partial<Record<SoundKey, TrackNode>>>({});
  // Has the user clicked anywhere on the page yet? Required before we
  // create the AudioContext (autoplay policy).
  const userInteractedRef = useRef(false);

  // Hydrate persisted state on mount.
  useEffect(() => {
    setState(loadState());
    setHydrated(true);
    setMasterMuted(readMasterMuted());
  }, []);

  // Listen for the desktop master-mute changes via storage events. Same-tab
  // changes don't fire `storage`, so we additionally re-poll on focus.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.endsWith(":tools-desktop-sound-v1")) {
        setMasterMuted(readMasterMuted());
      }
    };
    const onFocus = () => setMasterMuted(readMasterMuted());
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const id = window.setInterval(() => setMasterMuted(readMasterMuted()), 4000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(id);
    };
  }, []);

  // Listen for the Control Center / external open requests.
  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onOpen = () => setOpen(true);
    window.addEventListener("spacefield:ambient-toggle", onToggle);
    window.addEventListener("spacefield:ambient-open", onOpen);
    return () => {
      window.removeEventListener("spacefield:ambient-toggle", onToggle);
      window.removeEventListener("spacefield:ambient-open", onOpen);
    };
  }, []);

  // Track the first user gesture so we can resume autoplay sounds.
  useEffect(() => {
    const onClick = () => {
      userInteractedRef.current = true;
      // If anything was on at hydration time, kick the engine awake.
      if (hydrated) syncEngine();
    };
    window.addEventListener("pointerdown", onClick, { once: true });
    return () => window.removeEventListener("pointerdown", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  /**
   * Reconcile the engine state with `state`. Creates the AudioContext +
   * starts/stops track nodes as needed. Called from setters and from
   * the first-click handler.
   */
  const syncEngine = useCallback(() => {
    if (!userInteractedRef.current) return;
    const anyOn = Object.values(state.tracks).some((t) => t.on);
    // Lazily build the context.
    if (anyOn && !ctxRef.current) {
      const Ctor =
        typeof window !== "undefined"
          ? window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext
          : undefined;
      if (!Ctor) return;
      try {
        ctxRef.current = new Ctor();
        const master = ctxRef.current.createGain();
        master.gain.value = masterMuted ? 0 : 1;
        master.connect(ctxRef.current.destination);
        masterGainRef.current = master;
      } catch {
        ctxRef.current = null;
      }
    }
    const ctx = ctxRef.current;
    if (!ctx || !masterGainRef.current) return;
    const master = masterGainRef.current;
    master.gain.setTargetAtTime(masterMuted ? 0 : 1, ctx.currentTime, 0.05);

    for (const key of Object.keys(state.tracks) as SoundKey[]) {
      const track = state.tracks[key];
      const existing = tracksRef.current[key];
      if (track.on && !existing) {
        const node = STARTERS[key](ctx);
        node.outputGain.connect(master);
        // Ramp in to avoid a click.
        node.outputGain.gain.setValueAtTime(0, ctx.currentTime);
        node.outputGain.gain.linearRampToValueAtTime(
          track.volume,
          ctx.currentTime + 0.4
        );
        tracksRef.current[key] = node;
      } else if (track.on && existing) {
        existing.outputGain.gain.setTargetAtTime(
          track.volume,
          ctx.currentTime,
          0.08
        );
      } else if (!track.on && existing) {
        existing.outputGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        const node = existing;
        // Tear down after the fade.
        window.setTimeout(() => {
          try {
            node.cleanup();
          } catch {
            /* */
          }
        }, 250);
        delete tracksRef.current[key];
      }
    }
  }, [state, masterMuted]);

  // Reconcile whenever state changes (or master-mute flips).
  useEffect(() => {
    if (!hydrated) return;
    syncEngine();
  }, [state, masterMuted, hydrated, syncEngine]);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      for (const node of Object.values(tracksRef.current)) {
        try {
          node?.cleanup();
        } catch {
          /* */
        }
      }
      tracksRef.current = {};
      try {
        ctxRef.current?.close();
      } catch {
        /* */
      }
      ctxRef.current = null;
      masterGainRef.current = null;
    };
  }, []);

  const updateTrack = (key: SoundKey, patch: Partial<TrackState>) => {
    setState((prev) => {
      const next: AmbientState = {
        tracks: {
          ...prev.tracks,
          [key]: { ...prev.tracks[key], ...patch },
        },
      };
      saveState(next);
      return next;
    });
  };

  const anyOn = useMemo(
    () => Object.values(state.tracks).some((t) => t.on),
    [state]
  );

  if (!hydrated) return null;

  return (
    <>
      {/* Floating quick-access button — only renders when at least one
       * track is active, so it doesn't clutter an empty desktop. The
       * Control Center can also call `spacefield:ambient-toggle` to
       * open the panel without this button being visible. */}
      {anyOn && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ambient sounds"
          className="fixed bottom-24 right-4 z-[55] flex h-10 w-10 items-center justify-center rounded-full border border-app bg-app-elevated/90 text-secondary shadow-lg backdrop-blur-xl transition-colors hover:text-app"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 12a9 9 0 0118 0" />
            <path d="M6 12a6 6 0 0112 0" />
            <path d="M9 12a3 3 0 016 0" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
          </svg>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Ambient sounds"
          className="fixed bottom-24 right-4 z-[58] w-[300px] rounded-2xl border border-app bg-app-elevated/95 p-4 shadow-2xl backdrop-blur-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-app">Ambient sounds</div>
              <div className="text-[0.65rem] uppercase tracking-[0.14em] text-muted">
                {masterMuted ? "Master muted" : "Mix and match"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close ambient mixer"
              className="flex h-7 w-7 items-center justify-center rounded-full text-secondary transition-colors hover:bg-surface hover:text-app"
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
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {SOUND_LIST.map((s) => {
              const track = state.tracks[s.key];
              return (
                <div key={s.key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        userInteractedRef.current = true;
                        updateTrack(s.key, { on: !track.on });
                      }}
                      aria-pressed={track.on}
                      className={
                        "flex h-7 min-w-[44px] items-center gap-2 rounded-full px-2.5 text-[0.7rem] font-medium transition-colors " +
                        (track.on
                          ? "bg-tool-accent-soft text-tool-accent ring-1 ring-inset ring-tool-accent/30"
                          : "bg-app text-secondary ring-1 ring-inset ring-app hover:text-app")
                      }
                    >
                      <span
                        className={
                          "h-1.5 w-1.5 rounded-full " +
                          (track.on ? "bg-tool-accent" : "bg-muted")
                        }
                      />
                      {s.label}
                    </button>
                    <span className="text-[0.6rem] tabular-nums text-faint">
                      {Math.round(track.volume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(track.volume * 100)}
                    onChange={(e) =>
                      updateTrack(s.key, {
                        volume: Math.max(
                          0,
                          Math.min(1, Number(e.target.value) / 100)
                        ),
                      })
                    }
                    aria-label={`${s.label} volume`}
                    disabled={!track.on}
                    className="h-1 w-full cursor-pointer appearance-none rounded-full bg-app accent-[color:var(--tool-accent)] disabled:opacity-50"
                  />
                  <div className="text-[0.62rem] text-faint">{s.description}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
