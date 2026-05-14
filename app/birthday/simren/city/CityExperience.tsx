"use client";

/* City variant — a 12-chapter scroll-driven cinematic film.
 *
 * Reading guide:
 *   - constants & palette
 *   - utilities (mobile detect, reduced-motion, font injector, lenis hook,
 *     intersection-observer mount, photo distribution)
 *   - WebGL pieces: DroneShow + Fireworks (lazy-mounted)
 *   - Chapter1..Chapter12 components
 *   - ChapterDots side-rail
 *   - default export <CityExperience photos={...} />
 *
 * Failure-mode discipline:
 *   - Chapter 1 uses CSS keyframe `fadeRise` (visible at first paint), not
 *     framer whileInView. All other chapters use whileInView (they're below
 *     the fold and scroll-revealed).
 *   - WebGL Canvases mount only when scrolled near (lazy via IntersectionObserver).
 *   - Particles are PointsMaterial circles (no photo textures).
 *   - Photos are <img> only (EXIF respected by browser).
 *   - title: { absolute: ... } is in page.tsx, not here.
 *   - No personal-name attribution — sign-off is generic.
 *   - Mobile composes at 375px (clamp() throughout, particle count drops).
 *   - prefers-reduced-motion: lenis disabled, animations short-circuit. */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════════════════════
 *  Palette + chapter color grade table
 * ═══════════════════════════════════════════════════════════════════════════ */

type ChapterPalette = {
  bg: string;
  fg: string; // primary text
  accent: string;
  prevBg: string; // for the top-of-section fade overlay
  photoFilter: string;
};

const PALETTE: Record<number, ChapterPalette> = {
  0:  { bg: "#f7e9d4", fg: "#1a1410", accent: "#c8722f", prevBg: "#f7e9d4", photoFilter: "sepia(.25) saturate(1.1) brightness(1.04)" }, // hero/intro
  1:  { bg: "#f7e9d4", fg: "#1a1410", accent: "#c8722f", prevBg: "#f7e9d4", photoFilter: "sepia(.25) saturate(1.1) brightness(1.04)" },
  2:  { bg: "#dfe6ec", fg: "#1a2230", accent: "#5a6b7a", prevBg: "#f7e9d4", photoFilter: "saturate(.85) brightness(.96) contrast(1.05)" },
  3:  { bg: "#fcf6e6", fg: "#3a2a18", accent: "#e0a64f", prevBg: "#dfe6ec", photoFilter: "saturate(1.15) brightness(1.04)" },
  4:  { bg: "#fff1d6", fg: "#3a2510", accent: "#e87a4a", prevBg: "#fcf6e6", photoFilter: "sepia(.18) saturate(1.2)" },
  5:  { bg: "#f3ece1", fg: "#2a1a14", accent: "#9c2b2e", prevBg: "#fff1d6", photoFilter: "saturate(.95) contrast(1.03)" },
  6:  { bg: "#efe6d6", fg: "#3a2510", accent: "#7a4a25", prevBg: "#f3ece1", photoFilter: "sepia(.3) saturate(1.05)" },
  7:  { bg: "#e8e3d6", fg: "#1a1814", accent: "#22201d", prevBg: "#efe6d6", photoFilter: "grayscale(.6) contrast(1.08)" },
  8:  { bg: "#1c1f2c", fg: "#f4ecdc", accent: "#ffb469", prevBg: "#e8e3d6", photoFilter: "saturate(1.2) brightness(.95)" },
  9:  { bg: "#3b2f4d", fg: "#e8def4", accent: "#d8b3ff", prevBg: "#1c1f2c", photoFilter: "hue-rotate(-12deg) saturate(.9) brightness(.92)" },
  10: { bg: "#070912", fg: "#cbd9ff", accent: "#9ec1ff", prevBg: "#3b2f4d", photoFilter: "" },
  11: { bg: "#0a0712", fg: "#ffd2a6", accent: "#ffd2a6", prevBg: "#070912", photoFilter: "" },
  12: { bg: "#0c0c12", fg: "#f4ecdc", accent: "#caa46e", prevBg: "#0a0712", photoFilter: "sepia(.25) saturate(.9)" },
};

/* ═══════════════════════════════════════════════════════════════════════════
 *  Utilities
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Deterministic PRNG so SVG decorations look "scattered" but render
 *  identically every time (lint rule: no Math.random in render). */
function rand(seed: number): number {
  // mulberry32-ish
  let t = (seed * 1664525 + 1013904223) | 0;
  t = (t ^ (t >>> 15)) | 0;
  t = Math.imul(t, 0x85ebca6b);
  t = (t ^ (t >>> 13)) | 0;
  t = Math.imul(t, 0xc2b2ae35);
  t = (t ^ (t >>> 16)) >>> 0;
  return t / 4294967296;
}

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const update = () => setM(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return m;
}

function usePrefersReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setR(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return r;
}

/** Inject Cormorant + Caveat once per document. Idempotent. */
function FontInjector() {
  useEffect(() => {
    const id = "city-fonts-link";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Caveat:wght@400;600&family=JetBrains+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);
  }, []);
  return null;
}

/** Initialize lenis (inertial smooth scroll). Disabled if reduced motion. */
function useLenisSmoothScroll(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let lenis: { raf: (t: number) => void; destroy: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("lenis");
        if (cancelled) return;
        const Lenis = (mod as { default: new (opts: object) => typeof lenis }).default as unknown as new (opts: object) => {
          raf: (t: number) => void;
          destroy: () => void;
        };
        lenis = new Lenis({
          duration: 1.2,
          easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          wheelMultiplier: 1,
          touchMultiplier: 1.4,
        });
        const tick = (time: number) => {
          lenis?.raf(time);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        /* lenis missing — fall back to native scroll silently */
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      lenis?.destroy();
    };
  }, [enabled]);
}

/** Lazy-mount: returns true when the ref enters within rootMargin of viewport. */
function useNearViewport<T extends Element>(rootMargin = "120% 0px") {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!ref.current || near) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setNear(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin, threshold: 0.01 }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [near, rootMargin]);
  return [ref, near] as const;
}

/** Detect AutoMusic playing — skip generative audio if so. */
function useAutoMusicActive() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      const a = document.querySelector("audio");
      if (a && !a.paused && !a.muted && a.volume > 0) setActive(true);
    }, 800);
    return () => clearTimeout(t);
  }, []);
  return active;
}

/** Photo slot resolver: distribute photos to specific chapter slots. */
function usePhotoSlots(photos: string[]) {
  return useMemo(() => {
    const slots: Record<number, string | null> = {
      2: null, 4: null, 6: null, 9: null,
    };
    const memory: string[] = [];
    if (!photos.length) return { slots, memory };
    const pool = [...photos];
    if (pool.length >= 5) {
      slots[2] = pool.shift() ?? null;
      slots[4] = pool.shift() ?? null;
      slots[6] = pool.shift() ?? null;
      slots[9] = pool.shift() ?? null;
    } else {
      slots[2] = pool.shift() ?? null;
      slots[9] = pool.shift() ?? null;
    }
    memory.push(...pool.slice(0, 5));
    if (memory.length === 0 && photos.length > 0) {
      memory.push(...photos.slice(0, Math.min(5, photos.length)));
    }
    return { slots, memory };
  }, [photos]);
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Shared chapter primitives
 * ═══════════════════════════════════════════════════════════════════════════ */

type ChapterShellProps = {
  index: number;
  time: string;
  title: string;
  caption: string;
  children: ReactNode;
  height?: string;
  variant?: "italic" | "roman";
  noFade?: boolean;
};

function ChapterShell({
  index,
  time,
  title,
  caption,
  children,
  height = "100vh",
  variant = "roman",
  noFade,
}: ChapterShellProps) {
  const palette = PALETTE[index];
  const reduced = usePrefersReducedMotion();
  const titleFontStyle: CSSProperties = {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontStyle: variant === "italic" ? "italic" : "normal",
    fontWeight: 500,
    color: palette.fg,
    letterSpacing: "-0.01em",
    lineHeight: 1.05,
    fontSize: "clamp(36px, 7vw, 88px)",
  };

  const sectionStyle: CSSProperties = {
    position: "relative",
    minHeight: height,
    background: palette.bg,
    color: palette.fg,
    overflow: "hidden",
    isolation: "isolate",
  };

  return (
    <section data-chapter={index} style={sectionStyle}>
      {!noFade && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "30vh",
            background: `linear-gradient(to bottom, ${palette.prevBg}, ${palette.bg})`,
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      )}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "clamp(48px, 9vh, 120px) clamp(20px, 5vw, 64px)",
          minHeight: height,
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
          gap: "clamp(24px, 4vh, 48px)",
        }}
      >
        <motion.header
          initial={reduced ? false : { opacity: 0, y: -12 }}
          whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "16px",
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: "clamp(10px, 1.4vw, 12px)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: palette.fg,
            opacity: 0.7,
          }}
        >
          <span>
            Ch. {String(index).padStart(2, "0")} · {time}
          </span>
          <span>City</span>
        </motion.header>

        <div style={{ display: "grid", gap: "clamp(24px, 5vh, 56px)" }}>
          <motion.h2
            initial={reduced ? false : { opacity: 0, y: 24 }}
            whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
            style={titleFontStyle}
          >
            {title}
          </motion.h2>

          <div style={{ position: "relative" }}>{children}</div>
        </div>

        <motion.p
          initial={reduced ? false : { opacity: 0, y: 18 }}
          whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: "clamp(17px, 1.7vw, 22px)",
            lineHeight: 1.55,
            color: palette.fg,
            maxWidth: "640px",
            opacity: 0.92,
            fontStyle: "italic",
          }}
        >
          {caption}
        </motion.p>
      </div>
    </section>
  );
}

/** Photo cameo — color-graded `<img>`, framed like a film still. */
function PhotoCameo({
  src,
  filter,
  caption,
  tilt = -1.5,
  width = "min(420px, 80vw)",
}: {
  src: string | null;
  filter: string;
  caption?: string;
  tilt?: number;
  width?: string;
}) {
  if (!src) {
    return (
      <div
        style={{
          width,
          aspectRatio: "3 / 4",
          borderRadius: "4px",
          background: "rgba(255,255,255,0.4)",
          border: "1px solid rgba(0,0,0,0.06)",
          display: "grid",
          placeItems: "center",
          fontFamily: "'Cormorant Garamond', serif",
          fontStyle: "italic",
          opacity: 0.55,
          transform: `rotate(${tilt}deg)`,
        }}
      >
        ·
      </div>
    );
  }
  return (
    <figure
      style={{
        margin: 0,
        width,
        transform: `rotate(${tilt}deg)`,
        boxShadow: "0 10px 30px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)",
        background: "#fff",
        padding: "10px 10px 14px",
        borderRadius: "3px",
      }}
    >
      <img
        src={src}
        alt=""
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          maxHeight: "62vh",
          objectFit: "cover",
          filter,
        }}
      />
      {caption && (
        <figcaption
          style={{
            marginTop: "8px",
            fontFamily: "'Caveat', 'Brush Script MT', cursive",
            fontSize: "18px",
            textAlign: "center",
            color: "#3a2a18",
            opacity: 0.85,
          }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Chapter 1 — Dawn Bakery (visible at first paint, CSS keyframe)
 * ═══════════════════════════════════════════════════════════════════════════ */

function Chapter1() {
  // No framer whileInView — uses CSS keyframe so first chapter is always visible.
  return (
    <ChapterShell
      index={1}
      time="05:42"
      title="The first letter of your name."
      caption="Before the sun cleared the rooftops, she was already piping the first letter. The kitchen smelled of butter and sleep. The radio whispered a song from another decade."
      variant="italic"
      noFade
    >
      <style>{`
        @keyframes city-fade-rise {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes city-pipe-squeeze {
          0%, 100% { transform: scaleY(1); }
          18% { transform: scaleY(0.92); }
          22% { transform: scaleY(1.04); }
        }
        @keyframes city-flour-float {
          0%, 100% { transform: translateY(0); opacity: 0.55; }
          50% { transform: translateY(-6px); opacity: 0.85; }
        }
        @keyframes city-stroke-write {
          to { stroke-dashoffset: 0; }
        }
        @keyframes city-window-pulse {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 1; }
        }
      `}</style>
      <div
        style={{
          width: "100%",
          maxWidth: "880px",
          aspectRatio: "16 / 9",
          margin: "0 auto",
          animation: "city-fade-rise 1.2s cubic-bezier(.22,1,.36,1) both",
        }}
      >
        <svg viewBox="0 0 800 450" width="100%" height="100%" role="img" aria-label="A baker's hand piping the letter S onto a cake at dawn.">
          <defs>
            <linearGradient id="bakery-window" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#ffd9a4" />
              <stop offset=".55" stopColor="#fbe6c6" />
              <stop offset="1" stopColor="#f5dfb6" />
            </linearGradient>
            <linearGradient id="bakery-counter" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#bf8a52" />
              <stop offset="0.5" stopColor="#a87547" />
              <stop offset="1" stopColor="#8e5e36" />
            </linearGradient>
            <radialGradient id="bakery-cake" cx=".5" cy=".4" r=".7">
              <stop offset="0" stopColor="#fff7e6" />
              <stop offset="1" stopColor="#f0dfb8" />
            </radialGradient>
          </defs>

          {/* window light */}
          <rect x="60" y="20" width="380" height="240" fill="url(#bakery-window)" rx="6" style={{ animation: "city-window-pulse 7s ease-in-out infinite" }} />
          {/* sun rays */}
          <g opacity="0.5">
            <polygon points="60,20 440,20 320,260 60,260" fill="#fff5d8" opacity="0.35" />
            <polygon points="200,20 360,20 300,260 230,260" fill="#fff" opacity="0.25" />
          </g>
          {/* window mullions */}
          <line x1="250" y1="20" x2="250" y2="260" stroke="#9a6b3c" strokeWidth="3" />
          <line x1="60" y1="140" x2="440" y2="140" stroke="#9a6b3c" strokeWidth="3" />

          {/* hanging utensils */}
          <line x1="500" y1="20" x2="500" y2="100" stroke="#5a3e22" strokeWidth="1" />
          <circle cx="500" cy="106" r="14" fill="none" stroke="#7a5a3a" strokeWidth="2" />
          <line x1="540" y1="20" x2="540" y2="120" stroke="#5a3e22" strokeWidth="1" />
          <rect x="530" y="118" width="20" height="34" fill="#7a5a3a" rx="2" />

          {/* counter */}
          <rect x="0" y="280" width="800" height="140" fill="url(#bakery-counter)" />
          <line x1="0" y1="280" x2="800" y2="280" stroke="#5a3a1c" strokeWidth="2" />
          {/* wood grain */}
          <g opacity="0.18">
            <line x1="0" y1="310" x2="800" y2="312" stroke="#3e2810" />
            <line x1="0" y1="340" x2="800" y2="338" stroke="#3e2810" />
            <line x1="0" y1="370" x2="800" y2="372" stroke="#3e2810" />
            <line x1="0" y1="395" x2="800" y2="394" stroke="#3e2810" />
          </g>

          {/* cake plate */}
          <ellipse cx="400" cy="345" rx="180" ry="14" fill="#1a1410" opacity="0.25" />
          <ellipse cx="400" cy="338" rx="170" ry="22" fill="#fefefe" />
          <ellipse cx="400" cy="332" rx="170" ry="22" fill="#f4ecdc" />

          {/* cake body */}
          <ellipse cx="400" cy="318" rx="135" ry="32" fill="url(#bakery-cake)" />
          <rect x="265" y="318" width="270" height="44" fill="#fff7e6" />
          <ellipse cx="400" cy="362" rx="135" ry="32" fill="#f0dfb8" />
          {/* frosting drips */}
          <path d="M 280 330 Q 290 348 300 332 Q 310 354 322 330" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.85" />
          <path d="M 460 332 Q 470 350 482 330 Q 494 354 506 330" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.85" />

          {/* the S being piped — animated stroke */}
          <path
            d="M 430 300 C 430 280, 405 270, 380 280 C 355 290, 355 308, 380 312 C 405 316, 425 320, 425 338 C 425 354, 400 360, 380 352"
            fill="none"
            stroke="#e8b15a"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 240,
              strokeDashoffset: 240,
              animation: "city-stroke-write 2.4s cubic-bezier(.22,1,.36,1) 0.4s forwards",
            }}
          />

          {/* arm + sleeve */}
          <g style={{ transformOrigin: "640px 60px", animation: "city-pipe-squeeze 3.8s ease-in-out infinite" }}>
            <path d="M 720 30 Q 700 80 660 130 L 620 200 L 590 240 Q 580 250 575 270 L 595 280 Q 615 256 640 220 L 690 150 Q 730 90 760 50 Z" fill="#e8d4b6" />
            <path d="M 720 30 Q 700 80 660 130 L 620 200 Q 615 215 612 230" fill="none" stroke="#c8a87c" strokeWidth="1" />
            {/* piping bag */}
            <path d="M 555 250 L 535 270 L 545 290 L 580 280 Z" fill="#f2e6d0" stroke="#a88c66" strokeWidth="1.5" />
            {/* nozzle */}
            <path d="M 535 270 L 525 282 L 530 290 L 545 290 Z" fill="#9c7d54" />
            {/* drop of frosting */}
            <circle cx="528" cy="294" r="2.2" fill="#fff" opacity="0.9" />
          </g>

          {/* flour dust */}
          <g>
            {[
              [120, 250, 1.5, 0],
              [180, 245, 1.8, 0.4],
              [210, 270, 1.3, 1.2],
              [340, 260, 2, 0.8],
              [410, 240, 1.6, 1.6],
              [460, 268, 1.4, 0.2],
              [560, 252, 1.7, 1.0],
              [600, 235, 1.2, 0.6],
              [660, 260, 1.5, 1.4],
            ].map(([x, y, r, d], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={r}
                fill="#fff"
                opacity="0.7"
                style={{ animation: `city-flour-float 4s ease-in-out ${d}s infinite` }}
              />
            ))}
          </g>
        </svg>
      </div>
    </ChapterShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Chapter 2 — Morning Metro
 * ═══════════════════════════════════════════════════════════════════════════ */

function Chapter2({ photo, filter }: { photo: string | null; filter: string }) {
  const reduced = usePrefersReducedMotion();
  const tickerRef = useRef<HTMLSpanElement | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!tickerRef.current) return;
    const node = tickerRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !revealed) {
            setRevealed(true);
            if (reduced) {
              node.textContent = "FOR SIMREN — TODAY";
              return;
            }
            const target = "FOR SIMREN — TODAY";
            const glyphs = "█▓▒░ABCDEFGHIJKLMNOPQRSTUVWXYZ ";
            let i = 0;
            const start = performance.now();
            const tick = (now: number) => {
              const elapsed = now - start;
              if (elapsed < 600) {
                node.textContent = Array.from({ length: target.length }, () => glyphs[(Math.random() * glyphs.length) | 0]).join("");
                requestAnimationFrame(tick);
                return;
              }
              const reveal = Math.min(target.length, Math.floor((elapsed - 600) / 50));
              if (reveal > i) i = reveal;
              const tail = target.length - i;
              node.textContent =
                target.slice(0, i) +
                Array.from({ length: tail }, () => glyphs[(Math.random() * glyphs.length) | 0]).join("");
              if (i < target.length) requestAnimationFrame(tick);
              else node.textContent = target;
            };
            requestAnimationFrame(tick);
          }
        }
      },
      { threshold: 0.4 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [revealed, reduced]);

  return (
    <ChapterShell
      index={2}
      time="07:14"
      title="The platform read your name."
      caption="At 07:14 the message changed. Most people kept reading their phones. One man looked up — really looked — and smiled a slow private smile."
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "32px", alignItems: "center" }}>
        <div style={{ width: "100%", maxWidth: "920px", margin: "0 auto" }}>
          <svg viewBox="0 0 920 360" width="100%" role="img" aria-label="Subway platform with arriving train and an LED sign that reveals her name.">
            <defs>
              <linearGradient id="metro-tile" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#c0cad3" />
                <stop offset="1" stopColor="#9faab5" />
              </linearGradient>
              <linearGradient id="metro-train" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#e7eef3" />
                <stop offset="1" stopColor="#aab8c4" />
              </linearGradient>
            </defs>

            {/* tile wall */}
            <rect x="0" y="0" width="920" height="200" fill="url(#metro-tile)" />
            <g stroke="#8590a0" strokeWidth="0.8" opacity="0.4">
              {Array.from({ length: 20 }).map((_, i) => (
                <line key={i} x1={i * 46} y1="0" x2={i * 46} y2="200" />
              ))}
              {Array.from({ length: 8 }).map((_, i) => (
                <line key={i} x1="0" y1={i * 28} x2="920" y2={i * 28} />
              ))}
            </g>

            {/* LED sign frame */}
            <rect x="280" y="40" width="380" height="62" fill="#1a1f28" rx="4" />
            <rect x="284" y="44" width="372" height="54" fill="#0a0d12" rx="3" />
            {/* LED text — placed via foreignObject so we can use webfont + animate */}
            <foreignObject x="290" y="48" width="360" height="46">
              <div
                style={{
                  height: "100%",
                  display: "grid",
                  placeItems: "center",
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  color: "#ffb469",
                  fontSize: "22px",
                  letterSpacing: "0.18em",
                  textShadow: "0 0 8px rgba(255,180,105,0.6)",
                }}
              >
                <span ref={tickerRef}>MIND THE GAP</span>
              </div>
            </foreignObject>

            {/* platform edge with yellow line */}
            <rect x="0" y="200" width="920" height="100" fill="#5a6b7a" />
            <rect x="0" y="200" width="920" height="6" fill="#3a4a5a" />
            <rect x="0" y="208" width="920" height="14" fill="#f6c73a" />
            <g opacity="0.4" stroke="#1a1f28" strokeWidth="2">
              {Array.from({ length: 30 }).map((_, i) => (
                <line key={i} x1={i * 32} y1="222" x2={i * 32 + 12} y2="222" />
              ))}
            </g>

            {/* concrete texture */}
            <g opacity="0.18">
              {Array.from({ length: 40 }).map((_, i) => (
                <circle key={i} cx={rand(i + 1) * 920} cy={230 + rand(i + 101) * 70} r={rand(i + 201) * 2 + 0.5} fill="#1a1f28" />
              ))}
            </g>

            {/* arriving train */}
            <g>
              <rect x="540" y="120" width="380" height="120" fill="url(#metro-train)" rx="10" />
              <rect x="556" y="138" width="60" height="48" fill="#243240" rx="3" />
              <rect x="630" y="138" width="60" height="48" fill="#243240" rx="3" />
              <rect x="704" y="138" width="60" height="48" fill="#243240" rx="3" />
              <rect x="778" y="138" width="60" height="48" fill="#243240" rx="3" />
              {/* doors */}
              <rect x="852" y="138" width="60" height="100" fill="#3a4a5a" rx="2" />
              <line x1="882" y1="138" x2="882" y2="238" stroke="#1a1f28" strokeWidth="1" />
              {/* nose bevel */}
              <path d="M 540 120 L 530 160 L 540 200 Z" fill="#243240" />
              {/* headlight */}
              <circle cx="538" cy="160" r="6" fill="#fffce8" opacity="0.85" />
            </g>

            {/* commuter silhouette */}
            <g transform="translate(120,140)">
              <circle cx="0" cy="0" r="14" fill="#2a323c" />
              <path d="M -22 16 Q -24 60 -10 100 L 10 100 Q 24 60 22 16 Z" fill="#2a323c" />
              {/* head tilted up */}
              <circle cx="3" cy="-2" r="2" fill="#5a6b7a" />
            </g>
            {/* second commuter, looking down */}
            <g transform="translate(180,148)">
              <circle cx="0" cy="0" r="13" fill="#374050" />
              <path d="M -20 14 Q -22 56 -8 96 L 12 96 Q 24 60 22 14 Z" fill="#374050" />
              <rect x="-6" y="36" width="12" height="20" fill="#5a6b7a" rx="2" />
            </g>
          </svg>
        </div>
        {photo && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <PhotoCameo src={photo} filter={filter} caption="07:14 — she'd already been awake for an hour." tilt={-1.5} width="min(280px, 60vw)" />
          </div>
        )}
      </div>
    </ChapterShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Chapter 3 — Classroom
 * ═══════════════════════════════════════════════════════════════════════════ */

function Chapter3() {
  const reduced = usePrefersReducedMotion();
  const posters = [
    { x: 30, y: 40, rot: -8, color: "#fff5d8", word: "HAPPY", crayon: "#e87a4a" },
    { x: 280, y: 20, rot: 6, color: "#ffe1b8", word: "BIRTHDAY", crayon: "#9c2b2e" },
    { x: 540, y: 50, rot: -3, color: "#e7f3d4", word: "SIMRENNN", crayon: "#3a7a3a" },
  ];
  return (
    <ChapterShell
      index={3}
      time="08:30"
      title="They added extra Ns, just in case."
      caption="Mrs. Khan let them use the gold glitter — the good kind, from the cabinet she normally guards. They argued about how to spell your name. They settled it by adding more letters."
      variant="italic"
    >
      <div style={{ width: "100%", maxWidth: "920px", margin: "0 auto" }}>
        <svg viewBox="0 0 900 380" width="100%" role="img" aria-label="Three children's birthday posters with crayon handwriting.">
          <defs>
            <pattern id="paper-grain" width="6" height="6" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="transparent" />
              <circle cx="2" cy="2" r="0.4" fill="#a88c66" opacity="0.3" />
              <circle cx="5" cy="4" r="0.3" fill="#a88c66" opacity="0.2" />
            </pattern>
            <pattern id="cork-board" width="20" height="20" patternUnits="userSpaceOnUse">
              <rect width="20" height="20" fill="#caa46e" />
              <circle cx="5" cy="5" r="1.4" fill="#a88c66" opacity="0.5" />
              <circle cx="14" cy="11" r="1.1" fill="#8e6e44" opacity="0.4" />
              <circle cx="9" cy="16" r="1.2" fill="#a88c66" opacity="0.4" />
            </pattern>
          </defs>
          {/* cork board */}
          <rect x="0" y="0" width="900" height="380" fill="url(#cork-board)" />
          <rect x="0" y="0" width="900" height="380" fill="#3a2a18" opacity="0.05" />

          {posters.map((p, i) => (
            <motion.g
              key={i}
              initial={reduced ? false : { opacity: 0, rotate: p.rot - 12, y: -20 }}
              whileInView={reduced ? undefined : { opacity: 1, rotate: p.rot, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, delay: i * 0.18, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: `${p.x + 130}px ${p.y + 110}px` }}
            >
              <g transform={`translate(${p.x},${p.y})`}>
                {/* paper */}
                <rect x="0" y="0" width="260" height="220" fill={p.color} stroke="#a88c66" strokeWidth="0.5" rx="2" />
                <rect x="0" y="0" width="260" height="220" fill="url(#paper-grain)" />
                {/* pin */}
                <circle cx="130" cy="14" r="6" fill="#9c2b2e" stroke="#5a1818" strokeWidth="0.6" />
                <circle cx="128" cy="12" r="2" fill="#ff7a7a" opacity="0.7" />
                {/* crayon writing */}
                <text
                  x="130"
                  y="120"
                  textAnchor="middle"
                  fontFamily="'Caveat', 'Brush Script MT', cursive"
                  fontSize="38"
                  fontWeight={600}
                  fill={p.crayon}
                  style={{
                    paintOrder: "stroke",
                    stroke: p.crayon,
                    strokeWidth: 0.6,
                    letterSpacing: 1,
                  }}
                >
                  {p.word}
                </text>
                {/* doodle */}
                <g stroke={p.crayon} strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.85">
                  <path d="M 30 170 Q 60 160 90 175" />
                  <path d="M 100 175 Q 130 165 160 180" />
                  <path d="M 170 178 Q 200 168 230 184" />
                  {/* heart */}
                  <path d="M 70 196 q -8 -10 -18 -2 q 0 12 18 22 q 18 -10 18 -22 q -10 -8 -18 2 z" fill={p.crayon} />
                </g>
                {/* glitter */}
                <g>
                  {[...Array(10)].map((_, j) => (
                    <circle key={j} cx={20 + rand(i * 31 + j + 7) * 220} cy={30 + rand(i * 31 + j + 71) * 160} r={0.8 + rand(i * 31 + j + 137) * 1.2} fill="#e8b15a" opacity={0.5 + rand(i * 31 + j + 211) * 0.4} />
                  ))}
                </g>
              </g>
            </motion.g>
          ))}
        </svg>
      </div>
    </ChapterShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Chapter 4 — Flower Market
 * ═══════════════════════════════════════════════════════════════════════════ */

function Chapter4({ photo, filter }: { photo: string | null; filter: string }) {
  return (
    <ChapterShell
      index={4}
      time="10:00"
      title="A tag tied to every stem."
      caption="The florist said: 'For her, for today.' She didn't ask who. She just tied tighter — the kind of small craft that makes a whole day's air smell better."
    >
      <style>{`
        @keyframes city-petal-sway {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(2deg); }
        }
        @keyframes city-tag-flutter {
          0% { transform: rotate(-12deg); }
          20% { transform: rotate(8deg); }
          40% { transform: rotate(-4deg); }
          60% { transform: rotate(2deg); }
          80%, 100% { transform: rotate(-1deg); }
        }
      `}</style>
      <div style={{ display: "grid", gridTemplateColumns: photo ? "1.4fr 1fr" : "1fr", gap: "32px", alignItems: "center" }}>
        <div>
          <svg viewBox="0 0 620 480" width="100%" role="img" aria-label="A bundle of marigolds with a hand tying a paper tag to a stem.">
            <defs>
              <radialGradient id="marigold-petal" cx=".5" cy=".5" r=".5">
                <stop offset="0" stopColor="#ffd56a" />
                <stop offset=".5" stopColor="#ffae3a" />
                <stop offset="1" stopColor="#e87a2a" />
              </radialGradient>
              <linearGradient id="market-bg" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#fff7da" />
                <stop offset="1" stopColor="#ffe9b8" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="620" height="480" fill="url(#market-bg)" />
            {/* window light bands */}
            <g opacity="0.35">
              <polygon points="0,0 220,0 80,480 0,480" fill="#fff" />
              <polygon points="380,0 480,0 360,480 280,480" fill="#fff8d4" />
            </g>

            {/* stems */}
            <g stroke="#3a6b3a" strokeWidth="3" strokeLinecap="round" fill="none">
              <path d="M 180 460 Q 200 360 220 240" />
              <path d="M 240 470 Q 240 360 250 220" />
              <path d="M 290 465 Q 280 360 280 200" />
              <path d="M 330 470 Q 340 350 330 220" />
              <path d="M 380 460 Q 380 360 370 240" />
            </g>
            {/* leaves */}
            <g fill="#5a8a3a">
              <ellipse cx="200" cy="320" rx="14" ry="6" transform="rotate(-30 200 320)" />
              <ellipse cx="260" cy="300" rx="14" ry="6" transform="rotate(20 260 300)" />
              <ellipse cx="290" cy="280" rx="14" ry="6" transform="rotate(-15 290 280)" />
              <ellipse cx="350" cy="310" rx="14" ry="6" transform="rotate(35 350 310)" />
            </g>

            {/* marigold blossoms (layered ellipses) */}
            {[
              { cx: 220, cy: 230, s: 1.0 },
              { cx: 250, cy: 210, s: 1.05 },
              { cx: 280, cy: 190, s: 1.2 },
              { cx: 330, cy: 215, s: 1.0 },
              { cx: 370, cy: 230, s: 0.95 },
            ].map((b, i) => (
              <g key={i} transform={`translate(${b.cx},${b.cy}) scale(${b.s})`} style={{ animation: `city-petal-sway 6s ease-in-out ${i * 0.4}s infinite`, transformOrigin: "center" }}>
                {[...Array(12)].map((_, j) => {
                  const a = (j / 12) * Math.PI * 2;
                  return (
                    <ellipse
                      key={j}
                      cx={Math.cos(a) * 14}
                      cy={Math.sin(a) * 14}
                      rx="14"
                      ry="9"
                      fill="url(#marigold-petal)"
                      opacity="0.9"
                      transform={`rotate(${(a * 180) / Math.PI} ${Math.cos(a) * 14} ${Math.sin(a) * 14})`}
                    />
                  );
                })}
                {[...Array(8)].map((_, j) => {
                  const a = (j / 8) * Math.PI * 2 + 0.2;
                  return (
                    <ellipse
                      key={`i${j}`}
                      cx={Math.cos(a) * 7}
                      cy={Math.sin(a) * 7}
                      rx="9"
                      ry="6"
                      fill="#ffd56a"
                      transform={`rotate(${(a * 180) / Math.PI} ${Math.cos(a) * 7} ${Math.sin(a) * 7})`}
                    />
                  );
                })}
                <circle r="6" fill="#a85a18" />
              </g>
            ))}

            {/* twine wrap */}
            <ellipse cx="300" cy="380" rx="120" ry="14" fill="#caa46e" />
            <ellipse cx="300" cy="378" rx="120" ry="6" fill="#a88c66" />
            <g stroke="#8e6e44" strokeWidth="1" fill="none">
              <path d="M 200 376 L 400 384" />
              <path d="M 200 380 L 400 388" />
              <path d="M 200 384 L 400 392" />
            </g>

            {/* paper tag */}
            <g transform="translate(420,360)" style={{ animation: "city-tag-flutter 5s ease-in-out infinite", transformOrigin: "0 -10px" }}>
              <line x1="0" y1="-20" x2="0" y2="0" stroke="#8e6e44" strokeWidth="0.8" />
              <path d="M 0 0 L 80 -8 L 90 6 L 80 20 L 0 12 Z" fill="#fdf3dc" stroke="#a88c66" strokeWidth="1" />
              <circle cx="6" cy="6" r="2" fill="none" stroke="#a88c66" strokeWidth="0.8" />
              <text x="46" y="9" textAnchor="middle" fontFamily="'Caveat', 'Brush Script MT', cursive" fontSize="14" fill="#3a2a18">
                for her, for today
              </text>
            </g>

            {/* tying hand */}
            <g transform="translate(440, 380)">
              <path d="M 0 0 Q -10 30 -30 50 Q -50 70 -70 80 L -90 100 Q -100 120 -80 130 Q -50 120 -30 110 Q 0 80 20 60 Q 40 30 50 0 Z" fill="#e8c8a4" />
              <path d="M -10 5 Q -20 25 -40 45" fill="none" stroke="#caa46e" strokeWidth="1" />
              <path d="M -90 100 Q -110 120 -120 130 L -130 140" fill="none" stroke="#caa46e" strokeWidth="1.5" />
            </g>
          </svg>
        </div>
        {photo && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <PhotoCameo src={photo} filter={filter} caption="pinned to the stall" tilt={3} width="min(300px, 80vw)" />
          </div>
        )}
      </div>
    </ChapterShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Chapter 5 — Tailor
 * ═══════════════════════════════════════════════════════════════════════════ */

function Chapter5() {
  const reduced = usePrefersReducedMotion();
  const letters = ["S", "I", "M", "R", "E", "N"];
  return (
    <ChapterShell
      index={5}
      time="11:45"
      title="Stitched slow, one letter at a time."
      caption="She pulled the red thread through cream linen with the patience of someone who's done this for forty years. The 'M' took longest. She said the slow ones hold."
    >
      <div style={{ width: "100%", maxWidth: "880px", margin: "0 auto" }}>
        <svg viewBox="0 0 880 380" width="100%" role="img" aria-label="A tailor's bench with cream pennants stitched with the name in red thread.">
          <defs>
            <linearGradient id="bench-wood" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#a87547" />
              <stop offset="1" stopColor="#7a5535" />
            </linearGradient>
            <pattern id="linen" width="3" height="3" patternUnits="userSpaceOnUse">
              <rect width="3" height="3" fill="#f4ecdc" />
              <line x1="0" y1="0" x2="3" y2="0" stroke="#e8d8b8" strokeWidth="0.4" />
              <line x1="0" y1="0" x2="0" y2="3" stroke="#e8d8b8" strokeWidth="0.4" />
            </pattern>
          </defs>
          {/* background wash */}
          <rect x="0" y="0" width="880" height="380" fill="#f3ece1" />
          <rect x="0" y="280" width="880" height="100" fill="url(#bench-wood)" />
          {/* wood grain */}
          <g opacity="0.2" stroke="#3e2810">
            <line x1="0" y1="300" x2="880" y2="298" />
            <line x1="0" y1="320" x2="880" y2="322" />
            <line x1="0" y1="340" x2="880" y2="338" />
            <line x1="0" y1="358" x2="880" y2="360" />
          </g>

          {/* embroidery hoop */}
          <g transform="translate(440, 180)">
            <circle r="120" fill="none" stroke="#caa46e" strokeWidth="6" />
            <circle r="116" fill="url(#linen)" />
            <circle r="120" fill="none" stroke="#a87547" strokeWidth="2" opacity="0.7" />
            {/* tightening screw */}
            <rect x="-10" y="-130" width="20" height="14" fill="#a87547" rx="2" />
            <rect x="-3" y="-138" width="6" height="10" fill="#7a5535" />
            {/* embroidered name */}
            <g>
              {letters.map((l, i) => (
                <motion.text
                  key={i}
                  x={-90 + i * 36}
                  y="10"
                  fontFamily="'Cormorant Garamond', Georgia, serif"
                  fontSize="44"
                  fontWeight={600}
                  fill="#9c2b2e"
                  style={{ paintOrder: "stroke", stroke: "#7a1818", strokeWidth: 0.6 }}
                  initial={reduced ? false : { opacity: 0, scale: 0.5 }}
                  whileInView={reduced ? undefined : { opacity: 1, scale: 1 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  {l}
                </motion.text>
              ))}
            </g>
            {/* chain-stitch dots between letters */}
            <g fill="#9c2b2e" opacity="0.45">
              {[...Array(20)].map((_, i) => (
                <circle key={i} cx={-100 + i * 10} cy={20} r={1} />
              ))}
            </g>
          </g>

          {/* needle */}
          <g transform="translate(580, 80)">
            <line x1="0" y1="0" x2="40" y2="-30" stroke="#e0e0e0" strokeWidth="1.5" />
            <circle cx="-1" cy="1" r="3" fill="#e0e0e0" />
            <line x1="0" y1="0" x2="-30" y2="40" stroke="#9c2b2e" strokeWidth="1.5" />
          </g>

          {/* scissors */}
          <g transform="translate(160, 300) rotate(-20)">
            <circle cx="-10" cy="-30" r="14" fill="none" stroke="#b87535" strokeWidth="3" />
            <circle cx="14" cy="-30" r="14" fill="none" stroke="#b87535" strokeWidth="3" />
            <line x1="-10" y1="-16" x2="50" y2="40" stroke="#a8a8a8" strokeWidth="3" />
            <line x1="14" y1="-16" x2="50" y2="40" stroke="#a8a8a8" strokeWidth="3" />
          </g>

          {/* thread spool */}
          <g transform="translate(740, 290)">
            <ellipse cx="0" cy="0" rx="22" ry="6" fill="#7a1818" />
            <rect x="-22" y="-30" width="44" height="30" fill="#9c2b2e" />
            <ellipse cx="0" cy="-30" rx="22" ry="6" fill="#c83838" />
            <ellipse cx="0" cy="0" rx="22" ry="6" fill="#9c2b2e" opacity="0.7" />
            {/* thread trail */}
            <path d="M 0 -16 C 40 -10, 80 -40, 110 -60" fill="none" stroke="#9c2b2e" strokeWidth="1" />
          </g>

          {/* small pennants stacked */}
          <g transform="translate(40, 200)">
            {[0, 1, 2].map((i) => (
              <g key={i} transform={`translate(${i * 12}, ${i * -6}) rotate(${i * -3})`}>
                <path d="M 0 0 L 90 0 L 70 24 L 90 48 L 0 48 Z" fill="url(#linen)" stroke="#caa46e" strokeWidth="0.6" />
                <text x="35" y="30" textAnchor="middle" fontFamily="'Cormorant Garamond', serif" fontSize="14" fill="#9c2b2e" fontWeight={600}>
                  S
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>
    </ChapterShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Chapter 6 — Café
 * ═══════════════════════════════════════════════════════════════════════════ */

function Chapter6({ photo, filter }: { photo: string | null; filter: string }) {
  return (
    <ChapterShell
      index={6}
      time="13:00"
      title="Today's special: a drink named after you."
      caption="Vanilla, cardamom, a little extra time. He chalked it up at noon and said the recipe came to him this morning, fully formed, like a song he didn't write."
    >
      <style>{`
        @keyframes city-chalk-write {
          to { stroke-dashoffset: 0; }
        }
        @keyframes city-steam-rise {
          0% { transform: translateY(0) scale(1); opacity: 0.6; }
          100% { transform: translateY(-40px) scale(1.4); opacity: 0; }
        }
      `}</style>
      <div style={{ display: "grid", gridTemplateColumns: photo ? "1.5fr 1fr" : "1fr", gap: "32px", alignItems: "center" }}>
        <div>
          <svg viewBox="0 0 620 460" width="100%" role="img" aria-label="A chalkboard menu reading TODAY'S SPECIAL — SIMREN LATTE.">
            <defs>
              <pattern id="chalkboard" width="6" height="6" patternUnits="userSpaceOnUse">
                <rect width="6" height="6" fill="#1f3530" />
                <circle cx="2" cy="2" r="0.3" fill="#cbd9c8" opacity="0.2" />
                <circle cx="5" cy="4" r="0.2" fill="#cbd9c8" opacity="0.15" />
              </pattern>
            </defs>
            <rect x="0" y="0" width="620" height="460" fill="#efe6d6" />

            {/* wall texture */}
            <g opacity="0.08">
              {[...Array(40)].map((_, i) => (
                <rect key={i} x={rand(i + 311) * 620} y={rand(i + 411) * 460} width="1" height="6" fill="#7a4a25" />
              ))}
            </g>

            {/* chalkboard frame */}
            <rect x="60" y="40" width="500" height="320" fill="#7a4a25" rx="6" />
            <rect x="74" y="54" width="472" height="292" fill="url(#chalkboard)" rx="3" />

            {/* TODAY'S SPECIAL header */}
            <text x="310" y="100" textAnchor="middle" fontFamily="'JetBrains Mono', ui-monospace, monospace" fontSize="16" fill="#cbd9c8" letterSpacing="3">
              TODAY&rsquo;S SPECIAL
            </text>
            <line x1="180" y1="118" x2="440" y2="118" stroke="#cbd9c8" strokeWidth="1" opacity="0.7" strokeDasharray="2 4" />

            {/* SIMREN LATTE — chalk written, animated stroke */}
            <text
              x="310"
              y="190"
              textAnchor="middle"
              fontFamily="'Caveat', 'Brush Script MT', cursive"
              fontSize="58"
              fill="none"
              stroke="#fff5d8"
              strokeWidth="2"
              fontWeight={600}
              style={{
                strokeDasharray: 700,
                strokeDashoffset: 700,
                animation: "city-chalk-write 3.2s cubic-bezier(.22,1,.36,1) 0.5s forwards",
              }}
            >
              Simren Latte
            </text>

            {/* description, also chalk */}
            <text x="310" y="240" textAnchor="middle" fontFamily="'Cormorant Garamond', serif" fontStyle="italic" fontSize="20" fill="#cbd9c8">
              vanilla, cardamom,
            </text>
            <text x="310" y="266" textAnchor="middle" fontFamily="'Cormorant Garamond', serif" fontStyle="italic" fontSize="20" fill="#cbd9c8">
              made with intention
            </text>

            {/* price */}
            <text x="310" y="320" textAnchor="middle" fontFamily="'JetBrains Mono', ui-monospace, monospace" fontSize="14" fill="#cbd9c8" letterSpacing="2">
              ON THE HOUSE — TODAY ONLY
            </text>

            {/* chalk dust */}
            <g>
              {[...Array(8)].map((_, i) => (
                <circle
                  key={i}
                  cx={150 + rand(i + 511) * 320}
                  cy={350}
                  r={1 + rand(i + 611) * 1.5}
                  fill="#fff5d8"
                  opacity="0.5"
                  style={{ animation: `city-steam-rise ${(4 + rand(i + 711) * 3).toFixed(2)}s ease-out ${(rand(i + 811) * 4).toFixed(2)}s infinite` }}
                />
              ))}
            </g>

            {/* coffee cup */}
            <g transform="translate(110, 400)">
              <ellipse cx="0" cy="0" rx="38" ry="6" fill="#3a2510" opacity="0.5" />
              <path d="M -32 -50 Q -32 0 0 0 Q 32 0 32 -50 Z" fill="#fef9ed" stroke="#a87547" strokeWidth="1.5" />
              <ellipse cx="0" cy="-50" rx="32" ry="8" fill="#7a4a25" />
              <ellipse cx="0" cy="-52" rx="28" ry="6" fill="#3a2510" />
              {/* steam */}
              <g opacity="0.7" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round">
                <path d="M -10 -60 Q -14 -76 -8 -90 Q 0 -104 -6 -120" style={{ animation: "city-steam-rise 3s ease-out infinite" }} />
                <path d="M 6 -60 Q 10 -76 4 -90 Q -2 -104 4 -120" style={{ animation: "city-steam-rise 3.5s ease-out 0.8s infinite" }} />
              </g>
              {/* handle */}
              <path d="M 30 -38 Q 50 -38 50 -22 Q 50 -8 30 -8" fill="none" stroke="#fef9ed" strokeWidth="6" />
            </g>

            {/* pastry case */}
            <g transform="translate(480, 400)">
              <rect x="-50" y="-50" width="100" height="60" rx="6" fill="#fff" stroke="#a87547" strokeWidth="1" opacity="0.85" />
              <rect x="-46" y="-46" width="92" height="22" rx="2" fill="#caa46e" opacity="0.5" />
              <ellipse cx="-30" cy="-32" rx="10" ry="4" fill="#a87547" />
              <ellipse cx="-6" cy="-32" rx="10" ry="4" fill="#9c5828" />
              <ellipse cx="20" cy="-32" rx="10" ry="4" fill="#caa46e" />
            </g>
          </svg>
        </div>
        {photo && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <PhotoCameo src={photo} filter={filter} caption="seat by the window" tilt={2} width="min(280px, 80vw)" />
          </div>
        )}
      </div>
    </ChapterShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Chapter 7 — Newsstand
 * ═══════════════════════════════════════════════════════════════════════════ */

function Chapter7() {
  const reduced = usePrefersReducedMotion();
  return (
    <ChapterShell
      index={7}
      time="15:30"
      title="A press ran one word."
      caption="The newspaper's editor said it was the easiest cover she'd ever signed off. One word, dead center, in the old-style serif they only break out for moments that matter."
    >
      <div style={{ width: "100%", maxWidth: "740px", margin: "0 auto" }}>
        <svg viewBox="0 0 740 460" width="100%" role="img" aria-label="A stack of newspapers with the cover headline SIMREN.">
          <defs>
            <linearGradient id="news-paper" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#fdf6e2" />
              <stop offset="1" stopColor="#ede2c2" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="740" height="460" fill="#e8e3d6" />

          {/* shadows of stacks */}
          <ellipse cx="370" cy="430" rx="280" ry="14" fill="#000" opacity="0.18" />

          {/* stack of papers — multiple sheets */}
          {[
            { x: 170, y: 380, w: 400, h: 8, rot: -1 },
            { x: 162, y: 364, w: 400, h: 8, rot: 1 },
            { x: 174, y: 350, w: 400, h: 8, rot: -0.8 },
            { x: 168, y: 336, w: 400, h: 8, rot: 0.5 },
            { x: 178, y: 322, w: 400, h: 8, rot: -1.2 },
          ].map((s, i) => (
            <g key={i} transform={`rotate(${s.rot} ${s.x + s.w / 2} ${s.y + s.h / 2})`}>
              <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="url(#news-paper)" stroke="#a88c66" strokeWidth="0.4" />
            </g>
          ))}

          {/* twine */}
          <g transform="translate(370, 350)">
            <ellipse cx="0" cy="0" rx="220" ry="6" fill="none" stroke="#a87547" strokeWidth="3" />
            <path d="M -10 -10 Q -20 -25 -10 -40 Q 0 -50 10 -45" fill="none" stroke="#7a5535" strokeWidth="2" />
          </g>

          {/* top paper — the cover */}
          <motion.g
            initial={reduced ? false : { y: 24, opacity: 0 }}
            whileInView={reduced ? undefined : { y: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            <g transform="translate(150, 40) rotate(-2 220 160)">
              <rect x="0" y="0" width="440" height="320" fill="url(#news-paper)" stroke="#7a5535" strokeWidth="0.6" />
              {/* masthead bar */}
              <rect x="20" y="20" width="400" height="2" fill="#22201d" />
              <text x="220" y="44" textAnchor="middle" fontFamily="'JetBrains Mono', ui-monospace, monospace" fontSize="9" letterSpacing="3" fill="#22201d">
                THE CITY DAILY · EXTRA EDITION · 14·05·2026
              </text>
              <rect x="20" y="52" width="400" height="2" fill="#22201d" />

              {/* SIMREN headline */}
              <motion.text
                x="220"
                y="180"
                textAnchor="middle"
                fontFamily="'Cormorant Garamond', Georgia, serif"
                fontSize="120"
                fontWeight={700}
                fill="#22201d"
                letterSpacing="-2"
                initial={reduced ? false : { opacity: 0 }}
                whileInView={reduced ? undefined : { opacity: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 1.4, delay: 0.6, ease: "easeOut" }}
              >
                SIMREN
              </motion.text>

              {/* subhead */}
              <text x="220" y="220" textAnchor="middle" fontFamily="'Cormorant Garamond', serif" fontStyle="italic" fontSize="14" fill="#3a2a18">
                — a city, briefly arranged.
              </text>

              {/* faux columns */}
              <g fill="#22201d" opacity="0.55">
                {[0, 1, 2].map((c) => (
                  <g key={c} transform={`translate(${30 + c * 130}, 240)`}>
                    {[...Array(7)].map((_, r) => (
                      <rect key={r} x="0" y={r * 8} width={120 - (r % 3 === 0 ? 30 : 0)} height="2" />
                    ))}
                  </g>
                ))}
              </g>
            </g>
          </motion.g>
        </svg>
      </div>
    </ChapterShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Chapter 8 — Billboard
 * ═══════════════════════════════════════════════════════════════════════════ */

function Chapter8() {
  const wishes = useMemo(
    () =>
      [
        "ADEEL FROM LAHORE: a year of soft mornings",
        "MARIAM FROM DUBAI: every door opens",
        "ZAHRA FROM KARACHI: the people who love you, multiplied",
        "OMAR FROM ISTANBUL: nothing rushed, everything chosen",
        "AYESHA FROM TORONTO: the long version of every laugh",
        "RAYAAN FROM RIYADH: a calmer brave year",
        "NOOR FROM LONDON: a kitchen that always smells like something",
        "HASSAN FROM BERLIN: the friends who pick up on the first ring",
        "LEILA FROM PARIS: rooms full of yes",
        "BILAL FROM JAKARTA: a window seat the whole way",
      ].join("   ·   "),
    []
  );

  return (
    <ChapterShell
      index={8}
      time="17:15"
      title="The biggest screen in the city, briefly hers."
      caption="For one minute the giant board scrolled wishes from strangers in cities you've never been to. The technician said it just took someone asking nicely. He paused it on your name."
    >
      <style>{`
        @keyframes city-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes city-ticker-flicker {
          0%, 92%, 100% { opacity: 1; }
          93%, 95% { opacity: 0.4; }
          94% { opacity: 1; }
        }
      `}</style>
      <div style={{ width: "100%", maxWidth: "1000px", margin: "0 auto" }}>
        <svg viewBox="0 0 1000 480" width="100%" role="img" aria-label="A Times-Square style billboard scrolling birthday wishes from cities around the world.">
          <defs>
            <linearGradient id="dusk-sky" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#1c1f2c" />
              <stop offset=".7" stopColor="#3a2e4a" />
              <stop offset="1" stopColor="#a85a4a" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="1000" height="480" fill="url(#dusk-sky)" />

          {/* faint stars */}
          <g fill="#fff">
            {[...Array(30)].map((_, i) => (
              <circle key={i} cx={rand(i + 911) * 1000} cy={rand(i + 1011) * 200} r={rand(i + 1111) * 1.2} opacity={rand(i + 1211) * 0.6 + 0.2} />
            ))}
          </g>

          {/* skyline silhouette */}
          <g fill="#0a0d18">
            <rect x="0" y="380" width="80" height="100" />
            <rect x="80" y="350" width="60" height="130" />
            <rect x="140" y="370" width="50" height="110" />
            <rect x="190" y="340" width="80" height="140" />
            <rect x="270" y="380" width="40" height="100" />
            <rect x="700" y="360" width="60" height="120" />
            <rect x="760" y="340" width="50" height="140" />
            <rect x="810" y="370" width="60" height="110" />
            <rect x="870" y="350" width="80" height="130" />
            <rect x="950" y="380" width="50" height="100" />
          </g>
          {/* window lights */}
          <g fill="#ffd56a">
            {[...Array(40)].map((_, i) => (
              <rect key={i} x={(i * 23) % 1000} y={350 + ((i * 17) % 120)} width="2" height="3" opacity={rand(i + 1311) * 0.7 + 0.3} />
            ))}
          </g>

          {/* billboard */}
          <g transform="translate(180, 80)">
            {/* support pole */}
            <rect x="310" y="220" width="20" height="220" fill="#0a0d18" />
            {/* board frame */}
            <rect x="0" y="0" width="640" height="240" fill="#0a0d18" rx="8" />
            <rect x="8" y="8" width="624" height="224" fill="#070912" rx="4" />

            {/* top ticker — wishes marquee */}
            <foreignObject x="14" y="20" width="612" height="120">
              <div
                style={{
                  height: "100%",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  whiteSpace: "nowrap",
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  color: "#ffb469",
                  textShadow: "0 0 12px rgba(255,180,105,0.7)",
                  fontSize: "clamp(13px, 1.6vw, 20px)",
                  letterSpacing: "0.12em",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: "max-content",
                    animation: "city-marquee 60s linear infinite",
                  }}
                >
                  <span style={{ paddingRight: 60 }}>{wishes}</span>
                  <span style={{ paddingRight: 60 }}>{wishes}</span>
                </div>
              </div>
            </foreignObject>

            {/* divider */}
            <line x1="14" y1="148" x2="626" y2="148" stroke="#1a1f2c" strokeWidth="1" />

            {/* bottom ticker — stock-style flicker */}
            <foreignObject x="14" y="156" width="612" height="68">
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-around",
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  color: "#9ec1ff",
                  textShadow: "0 0 8px rgba(158,193,255,0.6)",
                  fontSize: "clamp(11px, 1.4vw, 17px)",
                  letterSpacing: "0.15em",
                  animation: "city-ticker-flicker 5s ease-in-out infinite",
                }}
              >
                <span>SIMREN ▲ +∞%</span>
                <span style={{ color: "#ffb469" }}>HAPPINESS ▲</span>
                <span>YEAR 2026 ▲</span>
              </div>
            </foreignObject>
          </g>

          {/* spotlight beams */}
          <g opacity="0.18">
            <polygon points="200,80 820,80 720,180 300,180" fill="#fff" />
          </g>
        </svg>
      </div>
    </ChapterShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Chapter 9 — Lakefront
 * ═══════════════════════════════════════════════════════════════════════════ */

function Chapter9({ photo, filter }: { photo: string | null; filter: string }) {
  return (
    <ChapterShell
      index={9}
      time="19:00"
      title="On the rocks, configuring the swarm."
      caption="They'd practiced for a week. The wind was cooperating. The sky was asking for it. Three pilots, three open laptops, one walkie-talkie — and a lake that would soon hold a reflection of your name."
    >
      <style>{`
        @keyframes city-laptop-pulse {
          0%, 100% { opacity: 0.65; }
          50% { opacity: 1; }
        }
        @keyframes city-drone-rise {
          0% { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(-30px); opacity: 0.85; }
        }
      `}</style>
      <div style={{ display: "grid", gridTemplateColumns: photo ? "1.4fr 1fr" : "1fr", gap: "32px", alignItems: "center" }}>
        <div>
          <svg viewBox="0 0 720 420" width="100%" role="img" aria-label="Three drone pilots on lakefront rocks at dusk, configuring a swarm.">
            <defs>
              <linearGradient id="dusk-sky-9" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#3b2f4d" />
                <stop offset=".5" stopColor="#5e4a7e" />
                <stop offset="1" stopColor="#d8b3ff" />
              </linearGradient>
              <linearGradient id="lake" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#6e5a90" />
                <stop offset="1" stopColor="#3b2f4d" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="720" height="280" fill="url(#dusk-sky-9)" />
            <rect x="0" y="280" width="720" height="80" fill="url(#lake)" />
            {/* lake shimmer */}
            <g stroke="#d8b3ff" strokeWidth="0.6" opacity="0.4">
              <line x1="0" y1="290" x2="720" y2="291" />
              <line x1="0" y1="305" x2="720" y2="306" />
              <line x1="0" y1="320" x2="720" y2="321" />
              <line x1="0" y1="338" x2="720" y2="339" />
            </g>
            {/* rocks */}
            <g fill="#1a1820">
              <path d="M 0 360 L 80 320 L 160 350 L 240 330 L 320 360 L 720 360 L 720 420 L 0 420 Z" />
            </g>
            <g fill="#2a2330" opacity="0.7">
              <path d="M 0 380 L 100 340 L 200 370 L 300 350 L 400 380 L 720 380 L 720 420 L 0 420 Z" />
            </g>

            {/* moon */}
            <circle cx="600" cy="80" r="34" fill="#fff5d8" opacity="0.85" />
            <circle cx="595" cy="76" r="3" fill="#caa46e" opacity="0.4" />
            <circle cx="608" cy="86" r="2" fill="#caa46e" opacity="0.3" />

            {/* three pilots silhouettes */}
            {[
              { x: 130, scale: 1, drone: -12 },
              { x: 340, scale: 1.05, drone: -22 },
              { x: 540, scale: 0.95, drone: -8 },
            ].map((p, i) => (
              <g key={i} transform={`translate(${p.x},340) scale(${p.scale})`}>
                {/* sitting body */}
                <ellipse cx="0" cy="0" rx="22" ry="8" fill="#0a0810" />
                <path d="M -16 0 Q -20 -30 -8 -40 L 8 -40 Q 20 -30 16 0 Z" fill="#0a0810" />
                <circle cx="0" cy="-50" r="10" fill="#0a0810" />
                {/* laptop */}
                <g transform="translate(0,-12)">
                  <rect x="-14" y="-2" width="28" height="3" fill="#1a1820" />
                  <rect x="-13" y="-22" width="26" height="20" fill="#1a1820" />
                  <rect x="-12" y="-21" width="24" height="18" fill="#9ec1ff" style={{ animation: `city-laptop-pulse 3s ease-in-out ${i * 0.4}s infinite` }} />
                </g>
                {/* drone hovering above */}
                <g transform={`translate(0, -120) translate(0, ${p.drone}px)`} style={{ animation: `city-drone-rise 4s ease-in-out ${i * 0.6}s infinite alternate` }}>
                  <circle cx="0" cy="0" r="3" fill="#0a0810" />
                  <ellipse cx="-8" cy="0" rx="6" ry="1.5" fill="#0a0810" opacity="0.6" />
                  <ellipse cx="8" cy="0" rx="6" ry="1.5" fill="#0a0810" opacity="0.6" />
                  <circle cx="0" cy="2" r="1.5" fill="#9ec1ff" />
                </g>
              </g>
            ))}
            {/* walkie talkie raised by middle pilot */}
            <g transform="translate(360,290)">
              <rect x="-5" y="-30" width="10" height="20" fill="#0a0810" />
              <rect x="-3" y="-32" width="6" height="4" fill="#caa46e" />
              <line x1="0" y1="-32" x2="0" y2="-44" stroke="#0a0810" strokeWidth="1" />
            </g>

            {/* far shore lights */}
            <g fill="#ffd56a">
              {[...Array(20)].map((_, i) => (
                <rect key={i} x={i * 36 + 4} y={272} width="1" height="2" opacity={0.5 + rand(i + 1411) * 0.4} />
              ))}
            </g>
          </svg>
        </div>
        {photo && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <PhotoCameo src={photo} filter={filter} caption="lakeside" tilt={-2} width="min(280px, 80vw)" />
          </div>
        )}
      </div>
    </ChapterShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  WebGL: Drone Show (Chapter 10)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Sample target points for "SIMREN" by drawing in an offscreen canvas. */
function sampleSimrenPoints(count: number): Float32Array {
  if (typeof document === "undefined") return new Float32Array(0);
  const canvas = document.createElement("canvas");
  const W = 600;
  const H = 160;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new Float32Array(0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 130px 'Cormorant Garamond', Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SIMREN", W / 2, H / 2);
  const data = ctx.getImageData(0, 0, W, H).data;
  const samples: number[] = [];
  // Sample by random rejection
  let attempts = 0;
  const maxAttempts = count * 60;
  while (samples.length / 3 < count && attempts < maxAttempts) {
    attempts++;
    const x = Math.floor(Math.random() * W);
    const y = Math.floor(Math.random() * H);
    const idx = (y * W + x) * 4;
    if (data[idx] > 200) {
      // map x,y to world coords centered at origin
      const wx = ((x - W / 2) / W) * 7.5;
      const wy = -((y - H / 2) / H) * 1.9;
      samples.push(wx, wy, (Math.random() - 0.5) * 0.4);
    }
  }
  // pad if undersampled
  while (samples.length / 3 < count) samples.push(0, 0, 0);
  return new Float32Array(samples);
}

function DroneCloud({ count, scrollY }: { count: number; scrollY: MotionValue<number> }) {
  const pointsRef = useRef<THREE.Points>(null);
  const targets = useMemo(() => sampleSimrenPoints(count), [count]);
  const wanderSeeds = useMemo(() => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      a[i] = (rand(i + 3001) - 0.5) * 6;
      a[i + 1] = (rand(i + 3101) - 0.5) * 4;
      a[i + 2] = (rand(i + 3201) - 0.5) * 2;
    }
    return a;
  }, [count]);
  const phaseSeeds = useMemo(() => {
    const a = new Float32Array(count);
    for (let i = 0; i < count; i++) a[i] = rand(i + 3301) * Math.PI * 2;
    return a;
  }, [count]);
  const delaySeeds = useMemo(() => {
    const a = new Float32Array(count);
    for (let i = 0; i < count; i++) a[i] = rand(i + 3401) * 0.25;
    return a;
  }, [count]);

  // Geometry built once
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    // per-vertex color
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const tint = rand(i + 3501);
      colors[i * 3 + 0] = 0.78 + tint * 0.18;
      colors[i * 3 + 1] = 0.85 + tint * 0.12;
      colors[i * 3 + 2] = 1.0;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.085,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  );

  const tStart = useRef(0);
  const reduced = usePrefersReducedMotion();

  useFrame(() => {
    if (!pointsRef.current) return;
    if (tStart.current === 0) tStart.current = performance.now();
    const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
    const elapsed = (performance.now() - tStart.current) / 1000;

    // scroll progress 0..1 (scrollY is normalized to chapter 10 range elsewhere)
    const sp = Math.min(1, Math.max(0, scrollY.get()));
    // Phase curve: 0..0.35 wander → 0.35..0.65 gather → 0.65..1 hover
    for (let i = 0; i < count; i++) {
      const tx = targets[i * 3];
      const ty = targets[i * 3 + 1];
      const tz = targets[i * 3 + 2];
      const wx = wanderSeeds[i * 3];
      const wy = wanderSeeds[i * 3 + 1];
      const wz = wanderSeeds[i * 3 + 2];
      const phase = phaseSeeds[i];
      const delay = delaySeeds[i];

      // wander position drifts slowly
      const wanderX = wx + Math.sin(elapsed * 0.4 + phase) * 0.4;
      const wanderY = wy + Math.cos(elapsed * 0.5 + phase) * 0.3;
      const wanderZ = wz + Math.sin(elapsed * 0.3 + phase * 1.7) * 0.2;

      // ease from wander → home as scroll progresses
      // shifted by per-particle delay to make it look like a gathering
      let t: number;
      if (reduced) {
        t = 1;
      } else {
        const localSp = Math.max(0, Math.min(1, (sp - delay) / (1 - delay)));
        if (localSp < 0.35) t = 0;
        else if (localSp < 0.65) {
          const u = (localSp - 0.35) / 0.3;
          t = u * u * (3 - 2 * u); // smoothstep
        } else t = 1;
      }

      const homeX = tx + Math.sin(elapsed * 0.6 + phase) * 0.04;
      const homeY = ty + Math.cos(elapsed * 0.5 + phase * 1.3) * 0.04;
      const homeZ = tz;

      positions[i * 3] = wanderX * (1 - t) + homeX * t;
      positions[i * 3 + 1] = wanderY * (1 - t) + homeY * t;
      positions[i * 3 + 2] = wanderZ * (1 - t) + homeZ * t;
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

function CityHorizon() {
  // simple silhouette mesh below the drones
  return (
    <mesh position={[0, -2.4, -0.2]}>
      <planeGeometry args={[14, 1.2]} />
      <meshBasicMaterial color="#020308" />
    </mesh>
  );
}

function DroneCanvasInner({ count, scrollY }: { count: number; scrollY: MotionValue<number> }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 0, 8);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  return (
    <>
      <CityHorizon />
      <DroneCloud count={count} scrollY={scrollY} />
    </>
  );
}

function detectWebGL(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function Chapter10() {
  const isMobile = useIsMobile();
  const reduced = usePrefersReducedMotion();
  const sectionRef = useRef<HTMLElement | null>(null);
  const [mountRef, near] = useNearViewport<HTMLDivElement>("100% 0px");
  const count = isMobile ? 220 : 420;
  const [webglOk] = useState(detectWebGL);

  // local scroll progress: 0 entering, 1 fully past
  const { scrollYProgress } = useScroll({
    target: sectionRef as React.RefObject<HTMLElement>,
    offset: ["start end", "end start"],
  });
  // remap so middle of section is mid-progress
  const progress = useTransform(scrollYProgress, [0.2, 0.85], [0, 1]);

  return (
    <section
      ref={sectionRef}
      data-chapter={10}
      style={{
        position: "relative",
        minHeight: "120vh",
        background: PALETTE[10].bg,
        color: PALETTE[10].fg,
        overflow: "hidden",
        isolation: "isolate",
      }}
    >
      {/* fade in from prev */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "30vh",
          background: `linear-gradient(to bottom, ${PALETTE[10].prevBg}, ${PALETTE[10].bg})`,
          zIndex: 1,
          pointerEvents: "none",
        }}
      />

      <div
        ref={mountRef}
        style={{
          position: "sticky",
          top: 0,
          width: "100%",
          height: "100vh",
          zIndex: 2,
        }}
      >
        {/* DOM overlay caption */}
        <div
          style={{
            position: "absolute",
            top: "clamp(48px, 9vh, 120px)",
            left: "clamp(20px, 5vw, 64px)",
            zIndex: 3,
            display: "flex",
            justifyContent: "space-between",
            width: "calc(100% - clamp(40px, 10vw, 128px))",
            alignItems: "baseline",
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: "clamp(10px, 1.4vw, 12px)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#9ec1ff",
            opacity: 0.8,
          }}
        >
          <span>Ch. 10 · 21:30</span>
          <span>City</span>
        </div>

        <h2
          style={{
            position: "absolute",
            top: "clamp(110px, 18vh, 200px)",
            left: "clamp(20px, 5vw, 64px)",
            zIndex: 3,
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontWeight: 500,
            color: "#cbd9ff",
            letterSpacing: "-0.01em",
            lineHeight: 1.05,
            fontSize: "clamp(36px, 7vw, 88px)",
            margin: 0,
            maxWidth: "min(680px, 92vw)",
            mixBlendMode: "screen",
          }}
        >
          21:30. Look up.
        </h2>

        {/* WebGL canvas (or fallback) */}
        {webglOk && near ? (
          <Canvas
            dpr={[1, 1.6]}
            gl={{ antialias: true, powerPreference: "low-power", alpha: false }}
            camera={{ position: [0, 0, isMobile ? 9 : 8], fov: 45 }}
            style={{ position: "absolute", inset: 0, zIndex: 2 }}
            onCreated={({ gl }) => {
              gl.setClearColor("#070912", 1);
            }}
          >
            <ambientLight intensity={0.4} />
            <DroneCanvasInner count={count} scrollY={progress} />
          </Canvas>
        ) : (
          // SVG fallback: static dot pattern of SIMREN
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <svg viewBox="0 0 800 200" width="80%" height="auto">
              <text
                x="400"
                y="120"
                textAnchor="middle"
                fontFamily="'Cormorant Garamond', Georgia, serif"
                fontSize="160"
                fontWeight={700}
                fill="#9ec1ff"
                opacity="0.9"
                letterSpacing="-2"
              >
                SIMREN
              </text>
              {[...Array(60)].map((_, i) => (
                <circle key={i} cx={rand(i + 1511) * 800} cy={rand(i + 1611) * 200} r={1.5} fill="#cbd9ff" opacity={0.3 + rand(i + 1711) * 0.5} />
              ))}
            </svg>
          </div>
        )}

        {/* caption */}
        <p
          style={{
            position: "absolute",
            bottom: "clamp(48px, 9vh, 120px)",
            left: "clamp(20px, 5vw, 64px)",
            zIndex: 3,
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontSize: "clamp(17px, 1.7vw, 22px)",
            lineHeight: 1.55,
            color: "#cbd9ff",
            maxWidth: "min(560px, 90vw)",
            opacity: 0.92,
            margin: 0,
            mixBlendMode: "screen",
          }}
        >
          Four hundred drones gathered slowly out of a wandering swarm and held themselves into the shape of your name. Then, after a while, they exhaled and drifted apart again.
          {reduced && " (Reduced motion: a still tribute.)"}
        </p>
      </div>
      {/* spacer to give the sticky scrubbing room */}
      <div style={{ height: "20vh" }} />
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  WebGL: Fireworks (Chapter 11)
 * ═══════════════════════════════════════════════════════════════════════════ */

type Particle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  r: number;
  g: number;
  b: number;
  alive: boolean;
};

const FIREWORK_PALETTES: [number, number, number][][] = [
  [
    [1.0, 0.82, 0.65],
    [1.0, 0.72, 0.5],
  ],
  [
    [1.0, 0.54, 0.65],
    [1.0, 0.7, 0.78],
  ],
  [
    [0.65, 0.78, 1.0],
    [0.78, 0.85, 1.0],
  ],
  [
    [1.0, 0.88, 0.48],
    [1.0, 0.78, 0.6],
  ],
  [
    [0.77, 0.65, 1.0],
    [0.88, 0.78, 1.0],
  ],
];

function FireworksParticles({ maxParticles, audioOk, mutedAudio }: { maxParticles: number; audioOk: boolean; mutedAudio: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  // Particle pool lives in a ref because it's intentionally mutated by useFrame.
  const particlesRef = useRef<Particle[] | null>(null);
  function getParticles(): Particle[] {
    if (particlesRef.current) return particlesRef.current;
    const arr: Particle[] = [];
    for (let i = 0; i < maxParticles; i++) {
      arr.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0, r: 1, g: 1, b: 1, alive: false });
    }
    particlesRef.current = arr;
    return arr;
  }
  // Random pool counter so spawnBurst doesn't trip the purity rule.
  const randCounter = useRef(0);
  function rnd(): number {
    randCounter.current = (randCounter.current + 1) | 0;
    return rand(randCounter.current);
  }

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(maxParticles * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(maxParticles * 3), 3));
    return g;
  }, [maxParticles]);

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.11,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  );

  const reduced = usePrefersReducedMotion();
  const last = useRef(0);
  const cycleStart = useRef(0);
  const launchedThisCycleRef = useRef<Set<number> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  function getLaunched(): Set<number> {
    if (!launchedThisCycleRef.current) launchedThisCycleRef.current = new Set();
    return launchedThisCycleRef.current;
  }

  const launchTimes = [0.2, 1.1, 2.0, 2.9, 3.8, 4.6, 5.4]; // seconds within cycle
  const cycleLen = 8;

  function ensureAudio() {
    if (!audioOk || mutedAudio || reduced) return null;
    if (!audioCtxRef.current) {
      try {
        const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
        audioCtxRef.current = new Ctx();
      } catch {
        return null;
      }
    }
    return audioCtxRef.current;
  }

  function thump() {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.45);
  }

  function spawnBurst(now: number) {
    const particles = getParticles();
    const palette = FIREWORK_PALETTES[(rnd() * FIREWORK_PALETTES.length) | 0];
    const cx = (rnd() - 0.5) * 5.5;
    const cy = 1 + rnd() * 1.6;
    const cz = (rnd() - 0.5) * 1.2;
    const burstSize = reduced ? 0 : Math.min(maxParticles, 90);
    let spawned = 0;
    for (let i = 0; i < particles.length && spawned < burstSize; i++) {
      const p = particles[i];
      if (p.alive) continue;
      // sphere direction
      const theta = rnd() * Math.PI * 2;
      const phi = Math.acos(2 * rnd() - 1);
      const speed = 1.4 + rnd() * 0.8;
      p.x = cx;
      p.y = cy;
      p.z = cz;
      p.vx = Math.sin(phi) * Math.cos(theta) * speed;
      p.vy = Math.cos(phi) * speed;
      p.vz = Math.sin(phi) * Math.sin(theta) * speed * 0.4;
      p.life = 0;
      p.maxLife = 1.4 + rnd() * 0.6;
      const c = palette[(rnd() * palette.length) | 0];
      p.r = c[0];
      p.g = c[1];
      p.b = c[2];
      p.alive = true;
      spawned++;
    }
    if (audioOk && !mutedAudio && !reduced) thump();
    return now;
  }

  useFrame(() => {
    const now = performance.now();
    if (last.current === 0) last.current = now;
    if (cycleStart.current === 0) cycleStart.current = now;
    const dt = Math.min(0.05, (now - last.current) / 1000);
    last.current = now;

    const launched = getLaunched();
    const elapsed = (now - cycleStart.current) / 1000;
    if (elapsed > cycleLen) {
      cycleStart.current = now;
      launched.clear();
    }

    // schedule launches
    for (let li = 0; li < launchTimes.length; li++) {
      if (elapsed >= launchTimes[li] && !launched.has(li)) {
        launched.add(li);
        spawnBurst(now);
      }
    }

    // update + write to geometry
    const positions = pointsRef.current!.geometry.attributes.position.array as Float32Array;
    const colors = pointsRef.current!.geometry.attributes.color.array as Float32Array;
    const particles = getParticles();

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (!p.alive) {
        positions[i * 3] = 999;
        positions[i * 3 + 1] = 999;
        positions[i * 3 + 2] = 999;
        colors[i * 3] = 0;
        colors[i * 3 + 1] = 0;
        colors[i * 3 + 2] = 0;
        continue;
      }
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        continue;
      }
      // gravity
      p.vy -= 0.6 * dt;
      // drag
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.vz *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const fade = 1 - p.life / p.maxLife;
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      colors[i * 3] = p.r * fade;
      colors[i * 3 + 1] = p.g * fade;
      colors[i * 3 + 2] = p.b * fade;
    }
    pointsRef.current!.geometry.attributes.position.needsUpdate = true;
    pointsRef.current!.geometry.attributes.color.needsUpdate = true;
  });

  useEffect(() => {
    return () => {
      try {
        audioCtxRef.current?.close();
      } catch {
        /* noop */
      }
    };
  }, []);

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

function Chapter11() {
  const isMobile = useIsMobile();
  const sectionRef = useRef<HTMLElement | null>(null);
  const [mountRef, near] = useNearViewport<HTMLDivElement>("100% 0px");
  const audioPlaying = useAutoMusicActive();
  const [webglOk] = useState(detectWebGL);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  useEffect(() => {
    const unlock = () => setAudioUnlocked(true);
    document.addEventListener("pointerdown", unlock, { once: true, passive: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  const max = isMobile ? 7 * 50 : 7 * 90;
  const audioOk = audioUnlocked;
  const mutedAudio = audioPlaying;

  return (
    <section
      ref={sectionRef}
      data-chapter={11}
      style={{
        position: "relative",
        minHeight: "110vh",
        background: PALETTE[11].bg,
        color: PALETTE[11].fg,
        overflow: "hidden",
        isolation: "isolate",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "30vh",
          background: `linear-gradient(to bottom, ${PALETTE[11].prevBg}, ${PALETTE[11].bg})`,
          zIndex: 1,
          pointerEvents: "none",
        }}
      />

      <div
        ref={mountRef}
        style={{
          position: "sticky",
          top: 0,
          width: "100%",
          height: "100vh",
          zIndex: 2,
        }}
      >
        {/* city silhouette */}
        <svg viewBox="0 0 1000 200" preserveAspectRatio="none" style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "30vh", zIndex: 2 }}>
          <g fill="#040408">
            <rect x="0" y="120" width="80" height="80" />
            <rect x="80" y="80" width="60" height="120" />
            <rect x="140" y="100" width="50" height="100" />
            <rect x="190" y="60" width="80" height="140" />
            <rect x="270" y="110" width="40" height="90" />
            <rect x="310" y="90" width="70" height="110" />
            <rect x="380" y="60" width="50" height="140" />
            <rect x="430" y="80" width="80" height="120" />
            <rect x="510" y="100" width="60" height="100" />
            <rect x="570" y="70" width="70" height="130" />
            <rect x="640" y="90" width="50" height="110" />
            <rect x="690" y="60" width="60" height="140" />
            <rect x="750" y="80" width="50" height="120" />
            <rect x="800" y="100" width="80" height="100" />
            <rect x="880" y="70" width="60" height="130" />
            <rect x="940" y="100" width="60" height="100" />
          </g>
          <g fill="#ffd56a" opacity="0.8">
            {[...Array(40)].map((_, i) => (
              <rect key={i} x={(i * 27) % 1000} y={80 + ((i * 13) % 100)} width="2" height="3" opacity={0.4 + rand(i + 1811) * 0.5} />
            ))}
          </g>
        </svg>

        {webglOk && near ? (
          <Canvas
            dpr={[1, 1.6]}
            gl={{ antialias: true, powerPreference: "low-power", alpha: false }}
            camera={{ position: [0, 1, isMobile ? 9 : 8], fov: 50 }}
            style={{ position: "absolute", inset: 0, zIndex: 1 }}
            onCreated={({ gl }) => {
              gl.setClearColor("#0a0712", 1);
            }}
          >
            <ambientLight intensity={0.3} />
            <FireworksParticles maxParticles={max} audioOk={audioOk} mutedAudio={mutedAudio} />
          </Canvas>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <svg viewBox="0 0 400 400" width="60%" height="auto">
              <g>
                {[...Array(48)].map((_, i) => {
                  const a = (i / 48) * Math.PI * 2;
                  const len = 80 + (i % 4) * 30;
                  return <line key={i} x1="200" y1="200" x2={200 + Math.cos(a) * len} y2={200 + Math.sin(a) * len} stroke="#ffd2a6" strokeWidth="2" opacity="0.7" />;
                })}
                {[...Array(48)].map((_, i) => {
                  const a = (i / 48) * Math.PI * 2;
                  const len = 110 + (i % 5) * 20;
                  return <circle key={i} cx={200 + Math.cos(a) * len} cy={200 + Math.sin(a) * len} r={2.5} fill="#ffd2a6" />;
                })}
              </g>
            </svg>
          </div>
        )}

        {/* DOM overlay caption */}
        <div
          style={{
            position: "absolute",
            top: "clamp(48px, 9vh, 120px)",
            left: "clamp(20px, 5vw, 64px)",
            zIndex: 3,
            display: "flex",
            justifyContent: "space-between",
            width: "calc(100% - clamp(40px, 10vw, 128px))",
            alignItems: "baseline",
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: "clamp(10px, 1.4vw, 12px)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#ffd2a6",
            opacity: 0.85,
          }}
        >
          <span>Ch. 11 · 22:00</span>
          <span>City</span>
        </div>

        <h2
          style={{
            position: "absolute",
            top: "clamp(110px, 18vh, 200px)",
            left: "clamp(20px, 5vw, 64px)",
            zIndex: 3,
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontWeight: 500,
            color: "#ffd2a6",
            letterSpacing: "-0.01em",
            lineHeight: 1.05,
            fontSize: "clamp(36px, 7vw, 88px)",
            margin: 0,
            maxWidth: "min(680px, 92vw)",
            mixBlendMode: "screen",
          }}
        >
          For thirty seconds, the sky owed you something.
        </h2>

        <p
          style={{
            position: "absolute",
            bottom: "clamp(48px, 9vh, 120px)",
            left: "clamp(20px, 5vw, 64px)",
            zIndex: 3,
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontSize: "clamp(17px, 1.7vw, 22px)",
            lineHeight: 1.55,
            color: "#ffd2a6",
            maxWidth: "min(560px, 90vw)",
            opacity: 0.92,
            margin: 0,
            mixBlendMode: "screen",
          }}
        >
          Then it was quiet again, and the city went back to its evening — like nothing remarkable had just happened. Like it had been doing the math all year for exactly this.
        </p>

        {!audioUnlocked && !audioPlaying && (
          <div
            style={{
              position: "absolute",
              bottom: "12vh",
              right: "clamp(20px, 5vw, 64px)",
              zIndex: 4,
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: "11px",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#ffd2a6",
              opacity: 0.55,
            }}
          >
            tap for sound
          </div>
        )}
      </div>
      <div style={{ height: "10vh" }} />
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Chapter 12 — The Letter
 * ═══════════════════════════════════════════════════════════════════════════ */

function Chapter12({ memory, filter }: { memory: string[]; filter: string }) {
  const reduced = usePrefersReducedMotion();
  const lines = useMemo(
    () => [
      "Before the sun cleared the rooftops, someone wrote your name in cream.",
      "At 07:14 a city's signs decided to be about you.",
      "A child added extra Ns. They were right.",
      "A florist tied tags she didn't need to. A tailor stitched slow.",
      "A barista named a drink. A press ran a single word.",
      "And tonight, the sky lit up because you were here for it.",
    ],
    []
  );
  return (
    <section
      data-chapter={12}
      style={{
        position: "relative",
        minHeight: "180vh",
        background: PALETTE[12].bg,
        color: PALETTE[12].fg,
        overflow: "hidden",
        isolation: "isolate",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "30vh",
          background: `linear-gradient(to bottom, ${PALETTE[12].prevBg}, ${PALETTE[12].bg})`,
          zIndex: 1,
        }}
      />

      {/* far city pinpoints in the window */}
      <div
        style={{
          position: "absolute",
          top: "8vh",
          right: "8vw",
          width: "clamp(120px, 22vw, 320px)",
          height: "clamp(80px, 14vw, 200px)",
          background: "linear-gradient(135deg, #1a1828, #0a0710)",
          border: "1px solid #2a2230",
          zIndex: 2,
          overflow: "hidden",
          opacity: 0.8,
        }}
      >
        <svg viewBox="0 0 320 200" width="100%" height="100%">
          {[...Array(50)].map((_, i) => (
            <circle key={i} cx={rand(i + 1911) * 320} cy={rand(i + 2011) * 200} r={rand(i + 2111) * 1.5} fill="#caa46e" opacity={0.4 + rand(i + 2211) * 0.5} />
          ))}
          {/* faint city silhouette */}
          <g fill="#000" opacity="0.6">
            <rect x="0" y="140" width="40" height="60" />
            <rect x="40" y="120" width="30" height="80" />
            <rect x="70" y="130" width="25" height="70" />
            <rect x="95" y="100" width="40" height="100" />
            <rect x="135" y="120" width="20" height="80" />
            <rect x="155" y="110" width="35" height="90" />
            <rect x="190" y="130" width="25" height="70" />
            <rect x="215" y="100" width="30" height="100" />
            <rect x="245" y="120" width="25" height="80" />
            <rect x="270" y="130" width="50" height="70" />
          </g>
        </svg>
      </div>

      {/* the letter */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "clamp(60px, 12vh, 140px) clamp(20px, 5vw, 64px)",
          display: "grid",
          gridTemplateRows: "auto 1fr",
          gap: "clamp(28px, 5vh, 56px)",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: "clamp(10px, 1.4vw, 12px)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: PALETTE[12].fg,
            opacity: 0.7,
          }}
        >
          <span>Ch. 12 · 22:30</span>
          <span>City</span>
        </header>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 30, rotate: -1.2 }}
          whileInView={reduced ? undefined : { opacity: 1, y: 0, rotate: -1.2 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background: "#f4ecdc",
            color: "#3a2a18",
            maxWidth: "min(720px, 92vw)",
            margin: "0 auto",
            padding: "clamp(36px, 6vw, 72px) clamp(28px, 5vw, 64px)",
            boxShadow: "0 30px 80px rgba(0,0,0,0.5), 0 6px 20px rgba(0,0,0,0.35)",
            borderRadius: "2px",
            position: "relative",
            transformOrigin: "center",
            backgroundImage:
              "repeating-linear-gradient(transparent, transparent 31px, rgba(58,42,24,0.04) 32px)",
          }}
        >
          {/* date */}
          <div
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: "11px",
              letterSpacing: "0.18em",
              opacity: 0.6,
              marginBottom: "20px",
              textAlign: "right",
            }}
          >
            14 · 05 · 2026
          </div>

          <div
            style={{
              fontFamily: "'Caveat', 'Brush Script MT', cursive",
              fontSize: "clamp(22px, 2.7vw, 32px)",
              lineHeight: 1.55,
              color: "#3a2a18",
            }}
          >
            <p style={{ margin: "0 0 14px" }}>Dear Simren,</p>
            {lines.map((line, i) => (
              <motion.p
                key={i}
                initial={reduced ? false : { opacity: 0, x: -16 }}
                whileInView={reduced ? undefined : { opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.7, delay: 0.2 + i * 0.4, ease: [0.22, 1, 0.36, 1] }}
                style={{ margin: "0 0 12px" }}
              >
                {line}
              </motion.p>
            ))}

            <motion.p
              initial={reduced ? false : { opacity: 0 }}
              whileInView={reduced ? undefined : { opacity: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 1.2, delay: 0.2 + lines.length * 0.4, ease: [0.22, 1, 0.36, 1] }}
              style={{ margin: "32px 0 0", textAlign: "right" }}
            >
              — with love, every street that knew your name today.
            </motion.p>
          </div>
        </motion.div>

        {/* memory polaroids scattered */}
        {memory.length > 0 && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 1,
            }}
          >
            {memory.slice(0, 5).map((src, i) => {
              const positions = [
                { top: "12vh", left: "4vw", rot: -8 },
                { bottom: "10vh", left: "6vw", rot: 5 },
                { top: "44vh", left: "2vw", rot: -3 },
                { bottom: "18vh", right: "4vw", rot: 7 },
                { top: "62vh", right: "2vw", rot: -5 },
              ];
              const pos = positions[i] ?? positions[0];
              return (
                <div
                  key={src}
                  style={{
                    position: "absolute",
                    ...pos,
                    width: "clamp(110px, 14vw, 180px)",
                    transform: `rotate(${pos.rot}deg)`,
                    background: "#fff",
                    padding: "8px 8px 22px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    borderRadius: "2px",
                  }}
                >
                  <img
                    src={src}
                    alt=""
                    style={{
                      display: "block",
                      width: "100%",
                      aspectRatio: "1 / 1",
                      objectFit: "cover",
                      filter,
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}

        <div
          style={{
            marginTop: "16vh",
            textAlign: "center",
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: "11px",
            letterSpacing: "0.4em",
            opacity: 0.5,
            color: PALETTE[12].fg,
          }}
        >
          END · 14·05·2026
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Chapter dots — fixed right rail
 * ═══════════════════════════════════════════════════════════════════════════ */

function ChapterDots() {
  const [active, setActive] = useState(1);
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-chapter]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = Number(e.target.getAttribute("data-chapter"));
            if (!Number.isNaN(idx)) setActive(idx);
          }
        }
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: 0 }
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);
  return (
    <nav
      aria-hidden
      style={{
        position: "fixed",
        right: "clamp(10px, 2vw, 22px)",
        top: "50%",
        transform: "translateY(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        zIndex: 50,
        mixBlendMode: "difference",
      }}
    >
      {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
        <span
          key={n}
          style={{
            width: n === active ? "20px" : "8px",
            height: "2px",
            background: "#fff",
            opacity: n === active ? 0.9 : 0.45,
            transition: "all 0.4s cubic-bezier(.22,1,.36,1)",
          }}
        />
      ))}
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Hero / intro (chapter 0 — lead-in)
 * ═══════════════════════════════════════════════════════════════════════════ */

function Hero() {
  return (
    <section
      data-chapter={0}
      style={{
        position: "relative",
        minHeight: "100vh",
        background: PALETTE[0].bg,
        color: PALETTE[0].fg,
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        padding: "clamp(40px, 8vh, 96px) clamp(20px, 5vw, 64px)",
      }}
    >
      <style>{`
        @keyframes city-hero-in {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes city-arrow-bob {
          0%, 100% { transform: translateY(0); opacity: 0.55; }
          50% { transform: translateY(8px); opacity: 0.9; }
        }
      `}</style>
      <div style={{ maxWidth: "880px", textAlign: "center", animation: "city-hero-in 1.4s cubic-bezier(.22,1,.36,1) both" }}>
        <p
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: "clamp(11px, 1.4vw, 13px)",
            letterSpacing: "0.4em",
            textTransform: "uppercase",
            opacity: 0.65,
            margin: "0 0 28px",
          }}
        >
          A Day In Twelve Chapters · 14·05·2026
        </p>
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontWeight: 500,
            fontStyle: "italic",
            fontSize: "clamp(40px, 9vw, 110px)",
            lineHeight: 1.02,
            letterSpacing: "-0.02em",
            margin: "0 0 28px",
          }}
        >
          For Simren —<br />
          <span style={{ fontStyle: "normal" }}>a city, quietly conspiring.</span>
        </h1>
        <p
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontSize: "clamp(17px, 1.8vw, 22px)",
            lineHeight: 1.55,
            opacity: 0.8,
            margin: "0 auto",
            maxWidth: "560px",
          }}
        >
          What if ten thousand strangers in your city had been quietly arranging
          a day to be remembered? Scroll. Take your time.
        </p>
        <div
          style={{
            marginTop: "clamp(48px, 8vh, 96px)",
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: "11px",
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            opacity: 0.7,
          }}
        >
          <span>scroll</span>
          <svg width="14" height="22" viewBox="0 0 14 22" style={{ animation: "city-arrow-bob 2s ease-in-out infinite" }}>
            <path d="M 7 2 L 7 18 M 2 13 L 7 18 L 12 13" stroke={PALETTE[0].fg} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Default export
 * ═══════════════════════════════════════════════════════════════════════════ */

export default function CityExperience({ photos }: { photos: string[] }) {
  const reduced = usePrefersReducedMotion();
  useLenisSmoothScroll(!reduced);
  const { slots, memory } = usePhotoSlots(photos);

  return (
    <>
      <FontInjector />
      <main
        data-city-root
        style={{
          background: PALETTE[0].bg,
          color: PALETTE[0].fg,
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          overflowX: "hidden",
        }}
      >
        <Hero />
        <Chapter1 />
        <Chapter2 photo={slots[2]} filter={PALETTE[2].photoFilter} />
        <Chapter3 />
        <Chapter4 photo={slots[4]} filter={PALETTE[4].photoFilter} />
        <Chapter5 />
        <Chapter6 photo={slots[6]} filter={PALETTE[6].photoFilter} />
        <Chapter7 />
        <Chapter8 />
        <Chapter9 photo={slots[9]} filter={PALETTE[9].photoFilter} />
        <Chapter10 />
        <Chapter11 />
        <Chapter12 memory={memory} filter={PALETTE[12].photoFilter} />
      </main>
      <ChapterDots />
    </>
  );
}
