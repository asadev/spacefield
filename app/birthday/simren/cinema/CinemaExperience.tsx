"use client";

/* Cinema variant — a tribute reel.
 * - Black/charcoal stage with SVG film grain + faint vignette + scanlines.
 * - Title types out like a slate.
 * - "Now Showing" intertitle on a velvet curtain.
 * - 35mm film strip with sprocket holes scrolls horizontally as the user scrolls vertically.
 * - Cake = monochrome SVG lit by a projector beam; click a candle to blow it out.
 * - Wishes presented as title cards (one per scroll section), styled like film quotes.
 * - End-credits scroll for the sign-off (no name, generic).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useScroll, useTransform, useMotionValueEvent } from "framer-motion";

const GOLD = "#d4af37";
const CREAM = "#f1e7ce";
const INK = "#0a0a0a";
const CHARCOAL = "#141414";

const WISHES: { quote: string; tag: string }[] = [
  { quote: "May this year be the one you remember in close-up.", tag: "— Reel I" },
  { quote: "Take the scenic shot. The script can wait.", tag: "— Reel II" },
  { quote: "Be the protagonist. The world will catch up to your pacing.", tag: "— Reel III" },
  { quote: "Let the light find you. It usually does.", tag: "— Reel IV" },
  { quote: "Soft hearts make the loudest soundtracks.", tag: "— Reel V" },
  { quote: "Cut what no longer serves the story. Keep the laugh.", tag: "— Reel VI" },
  { quote: "Roll credits on the old year. Open on something kinder.", tag: "— Reel VII" },
];

export default function CinemaExperience({ photos }: { photos: string[] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ container: wrapRef });

  // Strip slides left as page scrolls down. Width depends on photo count.
  const stripCount = Math.max(photos.length, 1);
  // Each frame ~ 70vw on mobile / 28vw on desktop. We'll use vmin for stability.
  // Total strip travels from 0 to -(N-1) * frameVw.
  const frameVw = 30; // matches CSS .frame width: 30vmin
  const stripTravel = useTransform(
    scrollYProgress,
    [0.18, 0.78],
    [0, -(stripCount - 1) * frameVw],
  );
  const stripX = useTransform(stripTravel, (v) => `${v}vmin`);

  // Title typewriter
  const fullTitle = "HAPPY BIRTHDAY, SIMREN.";
  const [typed, setTyped] = useState("");
  useEffect(() => {
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setTyped(fullTitle.slice(0, i));
      if (i >= fullTitle.length) window.clearInterval(id);
    }, 70);
    return () => window.clearInterval(id);
  }, []);

  // Cue counter (top-right "FILM 01 — TAKE 14")
  const [cue, setCue] = useState("REEL 01 — 00:00");
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const reel = Math.min(7, Math.max(1, Math.floor(v * 8) + 1));
    const secs = Math.floor(v * 240); // up to 4:00 runtime
    const mm = String(Math.floor(secs / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    setCue(`REEL ${String(reel).padStart(2, "0")} — ${mm}:${ss}`);
  });

  // Candles state
  const [candles, setCandles] = useState<boolean[]>([true, true, true, true, true]);
  const allOut = candles.every((c) => !c);
  const blow = (i: number) =>
    setCandles((prev) => prev.map((v, j) => (j === i ? false : v)));
  const relight = () => setCandles([true, true, true, true, true]);

  // Strip frames — repeat photos if very few, but never more than 9 visible to keep pacing.
  const frames = useMemo(() => {
    if (photos.length === 0) return [] as string[];
    return photos;
  }, [photos]);

  return (
    <div
      ref={wrapRef}
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        overflowX: "hidden",
        background: INK,
        color: CREAM,
        fontFamily: '"Times New Roman", "Playfair Display", ui-serif, Georgia, serif',
        WebkitOverflowScrolling: "touch",
      }}
    >
      <style>{`
        @keyframes flicker {
          0%, 100% { opacity: 0.92; }
          47% { opacity: 0.85; }
          51% { opacity: 0.97; }
          73% { opacity: 0.88; }
        }
        @keyframes grainShift {
          0% { transform: translate(0,0); }
          25% { transform: translate(-2%, 1%); }
          50% { transform: translate(1%, -2%); }
          75% { transform: translate(-1%, 2%); }
          100% { transform: translate(0,0); }
        }
        @keyframes flame {
          0%, 100% { transform: scale(1) rotate(-1deg); opacity: 1; }
          50% { transform: scale(1.06) rotate(1deg); opacity: 0.92; }
        }
        @keyframes blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes creditScroll {
          from { transform: translateY(60vh); }
          to { transform: translateY(-100%); }
        }
        @keyframes curtainOpen {
          from { transform: translateX(0); }
          to { transform: translateX(-105%); }
        }
        @keyframes curtainOpenR {
          from { transform: translateX(0); }
          to { transform: translateX(105%); }
        }
        .grain {
          position: fixed; inset: -10%;
          pointer-events: none;
          opacity: 0.18;
          mix-blend-mode: overlay;
          z-index: 50;
          animation: grainShift 1.6s steps(6) infinite, flicker 4s ease-in-out infinite;
        }
        .scanlines {
          position: fixed; inset: 0;
          pointer-events: none; z-index: 49;
          background: repeating-linear-gradient(
            to bottom,
            rgba(255,255,255,0.012) 0 1px,
            transparent 1px 3px
          );
        }
        .vignette {
          position: fixed; inset: 0;
          pointer-events: none; z-index: 48;
          background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.65) 100%);
        }
        .topbar {
          position: fixed; top: 0; left: 0; right: 0;
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 20px;
          z-index: 60;
          font-family: "Courier New", ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.18em;
          color: ${GOLD};
          text-transform: uppercase;
          mix-blend-mode: screen;
        }
        .topbar .dot {
          display: inline-block; width: 8px; height: 8px; border-radius: 50%;
          background: #c0392b; margin-right: 8px; vertical-align: middle;
          box-shadow: 0 0 8px rgba(192,57,43,0.7);
          animation: flicker 1.5s ease-in-out infinite;
        }
        .filmstrip-wrap {
          position: relative;
          height: 100vh;
          display: flex;
          align-items: center;
          overflow: hidden;
        }
        .filmstrip {
          display: flex;
          gap: 0;
          align-items: center;
          padding: 0 35vw;
          will-change: transform;
        }
        .frame {
          position: relative;
          flex: 0 0 auto;
          width: 30vmin;
          height: 42vmin;
          margin: 0;
          padding: 4vmin 1.4vmin;
          background: #0d0d0d;
          border-left: 1px solid #1d1d1d;
          border-right: 1px solid #1d1d1d;
        }
        .frame::before, .frame::after {
          content: "";
          position: absolute; left: 0; right: 0; height: 4vmin;
          background-image:
            radial-gradient(circle, #0a0a0a 30%, transparent 32%);
          background-size: 3vmin 3vmin;
          background-repeat: repeat-x;
          background-position: center;
          background-color: #1a1a1a;
        }
        .frame::before { top: 0; }
        .frame::after { bottom: 0; }
        .frame .photo {
          width: 100%; height: 100%;
          object-fit: cover;
          filter: grayscale(0.35) contrast(1.05) sepia(0.08) brightness(0.95);
          display: block;
        }
        .frame .label {
          position: absolute;
          top: 4.4vmin; left: 1.8vmin;
          font-family: "Courier New", monospace;
          font-size: 9px; letter-spacing: 0.15em;
          color: ${GOLD}; opacity: 0.85;
          text-transform: uppercase;
          background: rgba(0,0,0,0.45);
          padding: 2px 6px;
          border-radius: 1px;
        }
        .reel-section {
          min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          padding: 8vh 6vw;
          position: relative;
        }
        .quote-card {
          max-width: 720px;
          text-align: center;
        }
        .quote-card .q {
          font-family: ui-serif, "Playfair Display", Georgia, serif;
          font-style: italic;
          font-size: clamp(28px, 5.2vw, 56px);
          line-height: 1.18;
          color: ${CREAM};
          text-wrap: balance;
        }
        .quote-card .t {
          margin-top: 24px;
          font-family: "Courier New", monospace;
          font-size: 12px; letter-spacing: 0.3em;
          color: ${GOLD};
          text-transform: uppercase;
        }
        .intertitle {
          background: linear-gradient(180deg, #1a0c0c 0%, #0a0606 100%);
          border-top: 4px double ${GOLD};
          border-bottom: 4px double ${GOLD};
          padding: 60px 40px;
          text-align: center;
        }
        .intertitle .small {
          font-family: "Courier New", monospace;
          font-size: 12px; letter-spacing: 0.5em;
          color: ${GOLD}; opacity: 0.85;
          text-transform: uppercase;
        }
        .intertitle .big {
          margin-top: 18px;
          font-family: ui-serif, "Playfair Display", Georgia, serif;
          font-size: clamp(48px, 9vw, 110px);
          letter-spacing: 0.04em;
          color: ${CREAM};
          line-height: 1;
        }
        .credits {
          height: 100vh;
          overflow: hidden;
          position: relative;
        }
        .credits-inner {
          position: absolute; left: 0; right: 0;
          text-align: center;
          animation: creditScroll 38s linear forwards;
          font-family: "Courier New", monospace;
          color: ${CREAM};
          line-height: 1.9;
          font-size: 14px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .credits .role {
          color: ${GOLD};
          font-size: 11px;
          letter-spacing: 0.32em;
          margin-top: 28px;
          margin-bottom: 4px;
          opacity: 0.85;
        }
        .credits .name {
          font-size: 18px;
          letter-spacing: 0.22em;
        }
        .credits .end {
          margin-top: 80px;
          font-family: ui-serif, Georgia, serif;
          font-style: italic;
          font-size: 36px;
          letter-spacing: 0.06em;
          color: ${GOLD};
          text-transform: none;
        }
        .curtain {
          position: absolute; top: 0; bottom: 0; width: 52%;
          background:
            repeating-linear-gradient(90deg,
              #1a0a0a 0 18px,
              #2a0e0e 18px 36px,
              #110505 36px 54px);
          z-index: 5;
          box-shadow: inset 0 0 60px rgba(0,0,0,0.7);
        }
        .curtain.l { left: 0; animation: curtainOpen 2.4s cubic-bezier(0.7,0,0.2,1) 1.6s forwards; }
        .curtain.r { right: 0; animation: curtainOpenR 2.4s cubic-bezier(0.7,0,0.2,1) 1.6s forwards; }
        .caret { display: inline-block; width: 0.55ch; background: ${GOLD}; margin-left: 4px; animation: blink 1s steps(2) infinite; }
        .candle .flame { transform-origin: 50% 100%; animation: flame 0.6s ease-in-out infinite; }
        .candle button {
          background: none; border: none; padding: 0; cursor: pointer;
        }
        @media (max-width: 700px) {
          .frame { width: 60vmin; height: 80vmin; }
          .filmstrip { padding: 0 20vw; }
          .topbar { font-size: 10px; padding: 10px 14px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .grain, .scanlines { animation: none; }
          .candle .flame { animation: none; }
          .credits-inner { animation-duration: 60s; }
        }
      `}</style>

      {/* Film grain texture */}
      <svg className="grain" xmlns="http://www.w3.org/2000/svg">
        <filter id="cinema-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.92" numOctaves="2" stitchTiles="stitch" seed="7" />
          <feColorMatrix type="matrix" values="0 0 0 0 1   0 0 0 0 1   0 0 0 0 1   0 0 0 0.6 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#cinema-noise)" />
      </svg>
      <div className="scanlines" />
      <div className="vignette" />

      {/* Top bar — REC + reel timer */}
      <div className="topbar">
        <div><span className="dot" /> REC · 35MM · K-7219</div>
        <div>{cue}</div>
      </div>

      {/* SCENE 1 — slate / title */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "10vh 6vw", overflow: "hidden" }}>
        <div className="curtain l" />
        <div className="curtain r" />
        <div style={{ position: "relative", zIndex: 4, textAlign: "center", maxWidth: 980 }}>
          <div style={{ fontFamily: "Courier New, monospace", fontSize: 12, letterSpacing: "0.5em", color: GOLD, textTransform: "uppercase", marginBottom: 28 }}>
            A Tribute Reel — In One Act
          </div>
          <h1 style={{
            fontFamily: 'ui-serif, "Playfair Display", Georgia, serif',
            fontWeight: 400,
            fontSize: "clamp(40px, 8vw, 96px)",
            letterSpacing: "0.06em",
            lineHeight: 1.05,
            margin: 0,
            color: CREAM,
            textShadow: `0 0 24px rgba(212,175,55,0.18)`,
          }}>
            {typed}
            <span className="caret" style={{ height: "0.85em" }} />
          </h1>
          <div style={{ marginTop: 36, fontFamily: "Courier New, monospace", fontSize: 13, letterSpacing: "0.3em", color: GOLD, textTransform: "uppercase" }}>
            14 · MAY · MMXXVI
          </div>
          <div style={{ marginTop: 60, fontFamily: "ui-serif, Georgia, serif", fontStyle: "italic", color: "#9b9079", fontSize: 14, letterSpacing: "0.08em" }}>
            scroll to roll the reel ↓
          </div>
        </div>
      </section>

      {/* SCENE 2 — Now Showing intertitle */}
      <section className="reel-section intertitle">
        <div>
          <div className="small">— Now Showing —</div>
          <div className="big">SIMREN</div>
          <div className="small" style={{ marginTop: 14 }}>A Life, In Frames</div>
        </div>
      </section>

      {/* SCENE 3 — film strip (sticky horizontal scrub) */}
      <section style={{ height: "260vh", position: "relative" }}>
        <div style={{ position: "sticky", top: 0, height: "100vh" }}>
          <div className="filmstrip-wrap">
            {frames.length > 0 ? (
              <motion.div className="filmstrip" style={{ x: stripX }}>
                {frames.map((src, i) => (
                  <div className="frame" key={src + i}>
                    <div className="label">FRAME {String(i + 1).padStart(3, "0")}</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="photo" src={src} alt={`frame ${i + 1}`} loading={i < 2 ? "eager" : "lazy"} />
                  </div>
                ))}
              </motion.div>
            ) : (
              <div style={{ width: "100%", textAlign: "center", color: "#6b6453", fontFamily: "Courier New, monospace", letterSpacing: "0.3em", fontSize: 12 }}>
                — REEL EMPTY —
              </div>
            )}
          </div>
          <div style={{ position: "absolute", bottom: 30, left: 0, right: 0, textAlign: "center", fontFamily: "Courier New, monospace", fontSize: 11, color: GOLD, letterSpacing: "0.3em", textTransform: "uppercase", opacity: 0.8 }}>
            ↕ scroll to scrub the reel
          </div>
        </div>
      </section>

      {/* SCENES 4–10 — wishes as title cards */}
      {WISHES.map((w, i) => (
        <section className="reel-section" key={i}>
          <motion.div
            className="quote-card"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4, root: wrapRef }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          >
            <div className="q">&ldquo;{w.quote}&rdquo;</div>
            <div className="t">{w.tag}</div>
          </motion.div>
        </section>
      ))}

      {/* SCENE 11 — projector cake */}
      <section className="reel-section" style={{ flexDirection: "column" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div className="small" style={{ fontFamily: "Courier New, monospace", fontSize: 12, letterSpacing: "0.5em", color: GOLD, textTransform: "uppercase" }}>
            — Intermission —
          </div>
          <div style={{ marginTop: 10, fontFamily: "ui-serif, Georgia, serif", fontStyle: "italic", color: CREAM, fontSize: 18 }}>
            {allOut ? "wish cast." : "click each candle. make it count."}
          </div>
        </div>
        <ProjectorCake candles={candles} onBlow={blow} />
        {allOut && (
          <button
            onClick={relight}
            style={{
              marginTop: 26,
              background: "transparent",
              color: GOLD,
              border: `1px solid ${GOLD}`,
              padding: "10px 22px",
              fontFamily: "Courier New, monospace",
              fontSize: 11,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Re-Light
          </button>
        )}
      </section>

      {/* SCENE 12 — End credits */}
      <section className="credits">
        <div className="credits-inner">
          <div className="role">Featuring</div>
          <div className="name">Simren Zahra</div>

          <div className="role">In The Role Of</div>
          <div className="name">Herself — Brilliant, As Always</div>

          <div className="role">On The Occasion Of</div>
          <div className="name">14 May 2026</div>

          <div className="role">Director Of Light</div>
          <div className="name">The Sun, On Her Side</div>

          <div className="role">Score By</div>
          <div className="name">Every Song She&rsquo;s Loved Twice</div>

          <div className="role">Wardrobe</div>
          <div className="name">Whatever She Damn Well Pleases</div>

          <div className="role">Cinematography</div>
          <div className="name">Friends, Mostly. A Few Strangers.</div>

          <div className="role">Special Thanks</div>
          <div className="name">To The People Who Stayed</div>

          <div className="role">Dedicated To</div>
          <div className="name">The Year Ahead</div>

          <div className="end">— with love —</div>

          <div style={{ marginTop: 60, color: GOLD, fontSize: 11, letterSpacing: "0.4em", opacity: 0.7 }}>
            FIN.
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------- Cake (projector beam, monochrome SVG) ---------- */

function ProjectorCake({
  candles,
  onBlow,
}: {
  candles: boolean[];
  onBlow: (i: number) => void;
}) {
  // 5 candles. SVG viewBox 400 x 320.
  const candleX = [110, 165, 200, 235, 290];
  return (
    <div style={{ position: "relative", width: "min(560px, 92vw)", aspectRatio: "400 / 360" }}>
      {/* Projector beam from upper-left */}
      <svg
        viewBox="0 0 400 360"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }}
        aria-hidden
      >
        <defs>
          <linearGradient id="beam" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={CREAM} stopOpacity="0.0" />
            <stop offset="40%" stopColor={CREAM} stopOpacity="0.16" />
            <stop offset="100%" stopColor={CREAM} stopOpacity="0.04" />
          </linearGradient>
          <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor={GOLD} stopOpacity="0.55" />
            <stop offset="60%" stopColor={GOLD} stopOpacity="0.08" />
            <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Beam cone from top-left of frame to cake */}
        <polygon points="-20,-20 60,-10 360,260 40,360 -20,360" fill="url(#beam)" />
      </svg>

      <svg
        viewBox="0 0 400 360"
        style={{ position: "relative", width: "100%", height: "100%", zIndex: 2, display: "block" }}
        role="img"
        aria-label="A small monochrome cake with five candles"
      >
        {/* Plate */}
        <ellipse cx="200" cy="318" rx="155" ry="14" fill="#0a0a0a" />
        <ellipse cx="200" cy="316" rx="148" ry="10" fill="none" stroke={CREAM} strokeOpacity="0.35" strokeWidth="1" />

        {/* Cake — three tiers, monochrome line-art */}
        {/* base tier */}
        <rect x="60" y="240" width="280" height="72" rx="6" fill={CHARCOAL} stroke={CREAM} strokeOpacity="0.55" strokeWidth="1.4" />
        {/* drip ring */}
        <path
          d="M 60 252 Q 80 264 100 252 T 140 252 T 180 252 T 220 252 T 260 252 T 300 252 T 340 252"
          fill="none"
          stroke={CREAM}
          strokeOpacity="0.5"
          strokeWidth="1.2"
        />
        {/* mid tier */}
        <rect x="100" y="180" width="200" height="60" rx="5" fill={CHARCOAL} stroke={CREAM} strokeOpacity="0.55" strokeWidth="1.4" />
        <path
          d="M 100 192 Q 118 202 136 192 T 172 192 T 208 192 T 244 192 T 280 192 T 300 192"
          fill="none"
          stroke={CREAM}
          strokeOpacity="0.5"
          strokeWidth="1.2"
        />
        {/* top tier */}
        <rect x="140" y="130" width="120" height="50" rx="4" fill={CHARCOAL} stroke={CREAM} strokeOpacity="0.55" strokeWidth="1.4" />
        <path
          d="M 140 142 Q 156 152 172 142 T 204 142 T 236 142 T 260 142"
          fill="none"
          stroke={CREAM}
          strokeOpacity="0.5"
          strokeWidth="1.2"
        />

        {/* Tiny gold filigree accent on top tier */}
        <text
          x="200"
          y="162"
          textAnchor="middle"
          fontFamily="ui-serif, Georgia, serif"
          fontStyle="italic"
          fontSize="14"
          fill={GOLD}
          opacity="0.9"
          letterSpacing="2"
        >
          S · Z
        </text>

        {/* Candles — sit IN the top tier (base at y=130, candle bottom at y=130) */}
        {candleX.map((cx, i) => (
          <Candle key={i} cx={cx} lit={candles[i]} index={i} onBlow={onBlow} />
        ))}
      </svg>
    </div>
  );
}

function Candle({
  cx,
  lit,
  index,
  onBlow,
}: {
  cx: number;
  lit: boolean;
  index: number;
  onBlow: (i: number) => void;
}) {
  // Candle body: from y=130 (top tier surface) up to y=92. Wick at y=88. Flame above.
  const bodyTop = 92;
  const bodyBottom = 130;
  const wickTop = 86;

  return (
    <g
      className="candle"
      onClick={() => lit && onBlow(index)}
      style={{ cursor: lit ? "pointer" : "default" }}
    >
      {/* Candle body */}
      <rect
        x={cx - 4}
        y={bodyTop}
        width={8}
        height={bodyBottom - bodyTop}
        fill={CREAM}
        opacity={0.92}
      />
      {/* Subtle stripe */}
      <line x1={cx - 4} y1={bodyTop + 12} x2={cx + 4} y2={bodyTop + 12} stroke="#bcb39c" strokeWidth="0.6" opacity="0.6" />
      <line x1={cx - 4} y1={bodyTop + 24} x2={cx + 4} y2={bodyTop + 24} stroke="#bcb39c" strokeWidth="0.6" opacity="0.6" />
      {/* Wick */}
      <line x1={cx} y1={bodyTop} x2={cx} y2={wickTop} stroke="#1a1a1a" strokeWidth="1.2" />
      {/* Flame or smoke */}
      {lit ? (
        <g className="flame">
          {/* Outer glow */}
          <ellipse cx={cx} cy={wickTop - 8} rx="9" ry="14" fill={GOLD} opacity="0.18" />
          {/* Flame body */}
          <path
            d={`M ${cx} ${wickTop - 18} Q ${cx + 5} ${wickTop - 10} ${cx + 3} ${wickTop - 2} Q ${cx} ${wickTop + 2} ${cx - 3} ${wickTop - 2} Q ${cx - 5} ${wickTop - 10} ${cx} ${wickTop - 18} Z`}
            fill={GOLD}
          />
          {/* Inner flame */}
          <path
            d={`M ${cx} ${wickTop - 12} Q ${cx + 2} ${wickTop - 7} ${cx + 1.5} ${wickTop - 3} Q ${cx} ${wickTop} ${cx - 1.5} ${wickTop - 3} Q ${cx - 2} ${wickTop - 7} ${cx} ${wickTop - 12} Z`}
            fill={CREAM}
          />
          {/* Click target */}
          <circle cx={cx} cy={wickTop - 10} r="14" fill="transparent">
            <title>Blow out</title>
          </circle>
        </g>
      ) : (
        <g opacity="0.6">
          {/* Smoke wisp */}
          <path
            d={`M ${cx} ${wickTop - 2} q -3 -8 0 -14 q 3 -6 0 -14`}
            fill="none"
            stroke={CREAM}
            strokeOpacity="0.5"
            strokeWidth="1.2"
          />
        </g>
      )}
    </g>
  );
}
