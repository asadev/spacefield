"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * Paper variant — Birthday page for Simren Zahra (2026-05-14)
 *
 * LIGHT MODE. Cream-paper texture (SVG fractal-noise + grain overlay).
 * Sections, top-to-bottom:
 *   1. Title card — handwritten name, doodle hearts/stars, watercolor blobs
 *   2. Cake      — child-storybook pencil cake with attached candles;
 *                  click each candle to blow it out (becomes smoke wisp).
 *   3. Polaroids — torn-edge photo cutouts pinned with washi tape, slight
 *                  rotation, drop shadows; raw <img> auto-honors EXIF.
 *   4. Wishes    — 7 handwritten cursive notes on lined-paper cards.
 *   5. Sign-off  — generic, no name. Date stamped.
 *
 * Crinkled paper folds animate on scroll (parallax SVG fold lines).
 * Watercolor splatter accents float in soft peach / blush / sage.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  AnimatePresence,
} from "framer-motion";
import { Caveat, Cormorant_Garamond } from "next/font/google";

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const FULL_NAME = "Simren Zahra";
const DATE_STR = "May 14, 2026";

const WISHES = [
  "May this year be the kindest one yet — and may you notice every soft moment of it.",
  "May your laugh stay loud and your worries stay small.",
  "May the people who already love you find a thousand new reasons to.",
  "May the ordinary days feel like enough, and the special ones feel like more.",
  "May you be brave on the days that ask for brave, and tender on the rest.",
  "May every door you knock on open a little wider than you expected.",
  "May the world keep being lucky to have you in it — today especially.",
];

interface Props {
  photos: string[];
}

/* ── colour palette ───────────────────────────────────────────────── */
const CREAM = "#f6efe1";
const CREAM_DEEP = "#ede2c8";
const INK = "#3a2f24";
const INK_SOFT = "#6b5947";
const PEACH = "#f3b9a0";
const BLUSH = "#e8a8b8";
const SAGE = "#a8c3a0";
const BUTTER = "#f3d57a";

export default function PaperExperience({ photos }: Props) {
  const reduced = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ container: scrollRef });
  const foldShift = useTransform(scrollYProgress, [0, 1], ["0%", "-25%"]);

  return (
    <div
      ref={scrollRef}
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        overflowX: "hidden",
        background: CREAM,
        color: INK,
        WebkitOverflowScrolling: "touch",
      }}
      className={`${cormorant.className}`}
    >
      {/* ── Paper fibre texture (SVG fractal noise) ── */}
      <PaperTexture />

      {/* ── Crinkled fold lines (parallax) ── */}
      <motion.div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          y: reduced ? "0%" : foldShift,
          zIndex: 1,
          opacity: 0.35,
        }}
      >
        <FoldLines />
      </motion.div>

      {/* ── Floating watercolour blobs (fixed) ── */}
      <FloatingBlobs reduced={!!reduced} />

      {/* ── Content ── */}
      <main style={{ position: "relative", zIndex: 5 }}>
        <TitleCard caveat={caveat.className} />
        <CakeSection />
        <PolaroidsSection photos={photos} caveat={caveat.className} />
        <WishesSection caveat={caveat.className} />
        <SignOff caveat={caveat.className} />
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Paper Texture — SVG fractal noise filter                            */
/* ─────────────────────────────────────────────────────────────────── */
function PaperTexture() {
  return (
    <>
      <svg
        aria-hidden
        width="0"
        height="0"
        style={{ position: "absolute" }}
      >
        <defs>
          <filter id="paperNoise">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves="2"
              stitchTiles="stitch"
            />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.23 0 0 0 0 0.18 0 0 0 0 0.14 0 0 0 0.18 0"
            />
          </filter>
          <filter id="paperGrain">
            <feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves="1" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.4 0 0 0 0 0.3 0 0 0 0 0.2 0 0 0 0.07 0"
            />
          </filter>
          <filter id="watercolor" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="2" />
            <feDisplacementMap in="SourceGraphic" scale="22" />
          </filter>
          <filter id="watercolor2" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="11" />
            <feDisplacementMap in="SourceGraphic" scale="18" />
          </filter>
          <filter id="pencilWobble" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="5" />
            <feDisplacementMap in="SourceGraphic" scale="1.4" />
          </filter>
        </defs>
      </svg>

      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 2,
          backgroundImage:
            "radial-gradient(ellipse at 30% 20%, rgba(255,243,220,0.55) 0%, transparent 55%), radial-gradient(ellipse at 75% 85%, rgba(232,168,184,0.18) 0%, transparent 60%)",
        }}
      />
      <svg
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 3,
          mixBlendMode: "multiply",
          opacity: 0.55,
        }}
      >
        <rect width="100%" height="100%" filter="url(#paperNoise)" />
      </svg>
      <svg
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 4,
          mixBlendMode: "multiply",
          opacity: 0.35,
        }}
      >
        <rect width="100%" height="100%" filter="url(#paperGrain)" />
      </svg>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Fold lines (animated on scroll)                                     */
/* ─────────────────────────────────────────────────────────────────── */
function FoldLines() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 100 200"
      preserveAspectRatio="none"
      style={{ width: "100%", height: "200vh" }}
    >
      <g stroke={INK_SOFT} strokeWidth="0.05" fill="none" opacity="0.6">
        <path d="M0 38 Q 50 36 100 39" />
        <path d="M0 80 Q 50 83 100 79" />
        <path d="M0 120 Q 50 117 100 121" />
        <path d="M0 165 Q 50 168 100 164" />
      </g>
      <g stroke={INK_SOFT} strokeWidth="0.04" fill="none" opacity="0.4">
        <path d="M22 0 L 24 200" />
        <path d="M78 0 L 76 200" />
      </g>
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Floating watercolour blobs                                          */
/* ─────────────────────────────────────────────────────────────────── */
function FloatingBlobs({ reduced }: { reduced: boolean }) {
  const blobs = useMemo(
    () => [
      { c: PEACH, x: "8%", y: "12%", r: 110, dur: 22, delay: 0 },
      { c: BLUSH, x: "82%", y: "18%", r: 80, dur: 28, delay: 3 },
      { c: SAGE, x: "12%", y: "62%", r: 95, dur: 26, delay: 1.5 },
      { c: BUTTER, x: "88%", y: "72%", r: 70, dur: 24, delay: 5 },
      { c: PEACH, x: "50%", y: "92%", r: 100, dur: 30, delay: 2 },
    ],
    []
  );

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={
            reduced
              ? { opacity: 0.45 }
              : {
                  opacity: [0.3, 0.5, 0.35, 0.45],
                  scale: [1, 1.08, 0.96, 1.04, 1],
                  x: [0, 8, -6, 4, 0],
                  y: [0, -6, 8, -4, 0],
                }
          }
          transition={
            reduced
              ? { duration: 1 }
              : {
                  duration: b.dur,
                  delay: b.delay,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
          style={{
            position: "absolute",
            left: b.x,
            top: b.y,
            width: b.r * 2,
            height: b.r * 2,
            transform: "translate(-50%, -50%)",
          }}
        >
          <svg viewBox="-100 -100 200 200" width="100%" height="100%">
            <g filter="url(#watercolor)">
              <circle cx="0" cy="0" r="80" fill={b.c} opacity="0.55" />
            </g>
            <g filter="url(#watercolor2)" opacity="0.45">
              <circle cx="-15" cy="10" r="55" fill={b.c} />
            </g>
          </svg>
        </motion.div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Title Card                                                          */
/* ─────────────────────────────────────────────────────────────────── */
function TitleCard({ caveat }: { caveat: string }) {
  return (
    <section
      style={{
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "8vh 6vw 6vh",
        textAlign: "center",
        position: "relative",
      }}
    >
      <DoodleBorderTop />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        style={{
          fontSize: "clamp(14px, 2.2vw, 18px)",
          letterSpacing: "0.32em",
          textTransform: "uppercase",
          color: INK_SOFT,
          marginBottom: "2vh",
          fontStyle: "italic",
        }}
      >
        a little something for
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.4, delay: 0.3, ease: "easeOut" }}
        className={caveat}
        style={{
          fontSize: "clamp(64px, 14vw, 180px)",
          lineHeight: 0.95,
          color: INK,
          margin: "0.2em 0",
          fontWeight: 600,
          letterSpacing: "-0.01em",
        }}
      >
        {FULL_NAME}
      </motion.h1>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1 }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          marginTop: "1vh",
        }}
      >
        <DoodleHeart fill={BLUSH} size={26} />
        <div
          style={{
            fontSize: "clamp(15px, 2.4vw, 20px)",
            fontStyle: "italic",
            color: INK_SOFT,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          {DATE_STR}
        </div>
        <DoodleStar fill={BUTTER} size={26} />
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 1.4 }}
        className={caveat}
        style={{
          marginTop: "5vh",
          maxWidth: 520,
          fontSize: "clamp(20px, 3vw, 28px)",
          color: INK,
          lineHeight: 1.4,
        }}
      >
        scroll on, this one was made by hand
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 1.5, repeat: Infinity, repeatType: "reverse" }}
        style={{
          position: "absolute",
          bottom: "3vh",
          left: "50%",
          transform: "translateX(-50%)",
          color: INK_SOFT,
          fontSize: 12,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          fontStyle: "italic",
        }}
      >
        ↓ keep going
      </motion.div>
    </section>
  );
}

function DoodleBorderTop() {
  return (
    <svg
      aria-hidden
      width="180"
      height="40"
      viewBox="0 0 180 40"
      style={{ position: "absolute", top: "5vh", left: "50%", transform: "translateX(-50%)" }}
      filter="url(#pencilWobble)"
    >
      <g stroke={INK} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.55">
        <path d="M10 20 Q 30 8, 50 20 T 90 20 T 130 20 T 170 20" />
        <circle cx="35" cy="14" r="1.5" fill={INK} />
        <circle cx="90" cy="26" r="1.5" fill={INK} />
        <circle cx="145" cy="14" r="1.5" fill={INK} />
      </g>
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Doodle primitives                                                   */
/* ─────────────────────────────────────────────────────────────────── */
function DoodleHeart({ fill = BLUSH, size = 24 }: { fill?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" filter="url(#pencilWobble)">
      <path
        d="M12 21 C 6 17, 2 13, 2 8.5 A 4.5 4.5 0 0 1 12 6 A 4.5 4.5 0 0 1 22 8.5 C 22 13, 18 17, 12 21 Z"
        fill={fill}
        stroke={INK}
        strokeWidth="0.8"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}

function DoodleStar({ fill = BUTTER, size = 24 }: { fill?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" filter="url(#pencilWobble)">
      <path
        d="M12 2 L14.6 9.2 L22 9.7 L16.3 14.3 L18.2 21.5 L12 17.4 L5.8 21.5 L7.7 14.3 L2 9.7 L9.4 9.2 Z"
        fill={fill}
        stroke={INK}
        strokeWidth="0.8"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Cake — pencil-style, click-to-blow-out candles                      */
/* ─────────────────────────────────────────────────────────────────── */
function CakeSection() {
  const [lit, setLit] = useState<boolean[]>(() => Array(7).fill(true));
  const [allOut, setAllOut] = useState(false);

  useEffect(() => {
    if (lit.every((c) => !c)) {
      const t = setTimeout(() => setAllOut(true), 600);
      return () => clearTimeout(t);
    } else {
      setAllOut(false);
    }
  }, [lit]);

  const blowOut = (i: number) => {
    setLit((prev) => {
      const next = [...prev];
      next[i] = false;
      return next;
    });
  };

  // 7 candles distributed across cake top
  const candles = useMemo(() => {
    const xs = [];
    for (let i = 0; i < 7; i++) {
      xs.push(70 + i * 35); // x positions
    }
    return xs;
  }, []);

  return (
    <section
      style={{
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "10vh 5vw",
        textAlign: "center",
      }}
    >
      <motion.h2
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-20%" }}
        transition={{ duration: 0.9 }}
        style={{
          fontSize: "clamp(22px, 4vw, 36px)",
          fontStyle: "italic",
          color: INK_SOFT,
          margin: 0,
          letterSpacing: "0.04em",
        }}
      >
        a cake, drawn for you
      </motion.h2>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 1.2 }}
        style={{
          marginTop: "4vh",
          width: "min(560px, 92vw)",
          aspectRatio: "1 / 0.85",
          position: "relative",
        }}
      >
        <svg viewBox="0 0 400 340" width="100%" height="100%" style={{ overflow: "visible" }}>
          {/* Plate shadow */}
          <ellipse cx="200" cy="320" rx="160" ry="10" fill={INK_SOFT} opacity="0.18" />

          {/* Plate */}
          <g filter="url(#pencilWobble)">
            <ellipse
              cx="200"
              cy="312"
              rx="170"
              ry="14"
              fill="#fffaf0"
              stroke={INK}
              strokeWidth="1.4"
            />
            <ellipse cx="200" cy="312" rx="155" ry="9" fill="none" stroke={INK_SOFT} strokeWidth="0.6" />
          </g>

          {/* ── Bottom tier ── */}
          <g filter="url(#pencilWobble)">
            <path
              d="M55 305 L55 220 Q 200 200, 345 220 L345 305 Q 200 318, 55 305 Z"
              fill="#fff5e0"
              stroke={INK}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            {/* drip frosting along top of bottom tier */}
            <path
              d="M55 220 Q 65 232, 75 222 Q 90 240, 105 222 Q 120 238, 138 222 Q 155 240, 175 222 Q 195 238, 215 222 Q 235 240, 255 222 Q 275 236, 295 222 Q 315 238, 330 222 Q 340 232, 345 220"
              fill={BLUSH}
              stroke={INK}
              strokeWidth="1.2"
              strokeLinejoin="round"
              opacity="0.95"
            />
            {/* pencil shading hatches */}
            <g stroke={INK_SOFT} strokeWidth="0.5" opacity="0.35">
              <line x1="70" y1="260" x2="74" y2="295" />
              <line x1="80" y1="262" x2="84" y2="297" />
              <line x1="320" y1="260" x2="324" y2="295" />
              <line x1="310" y1="262" x2="314" y2="297" />
            </g>
            {/* dotted sprinkles */}
            <g fill={SAGE}>
              <circle cx="120" cy="265" r="2" />
              <circle cx="180" cy="278" r="2" />
              <circle cx="240" cy="262" r="2" />
              <circle cx="280" cy="280" r="2" />
            </g>
            <g fill={PEACH}>
              <circle cx="150" cy="280" r="2" />
              <circle cx="210" cy="265" r="2" />
              <circle cx="265" cy="270" r="2" />
            </g>
          </g>

          {/* ── Top tier ── */}
          <g filter="url(#pencilWobble)">
            <path
              d="M115 215 L115 145 Q 200 130, 285 145 L285 215 Q 200 225, 115 215 Z"
              fill="#fff8e6"
              stroke={INK}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            {/* frosting drip top tier */}
            <path
              d="M115 145 Q 128 160, 142 146 Q 158 162, 175 146 Q 193 162, 212 146 Q 230 162, 248 146 Q 265 162, 280 146 Q 290 156, 285 145"
              fill={PEACH}
              stroke={INK}
              strokeWidth="1.2"
              strokeLinejoin="round"
              opacity="0.95"
            />
            {/* tier sprinkles */}
            <g fill={BUTTER}>
              <circle cx="150" cy="180" r="1.8" />
              <circle cx="210" cy="195" r="1.8" />
              <circle cx="250" cy="178" r="1.8" />
              <circle cx="180" cy="200" r="1.8" />
            </g>
            <g fill={BLUSH}>
              <circle cx="200" cy="170" r="1.8" />
              <circle cx="230" cy="200" r="1.8" />
            </g>
          </g>

          {/* ── Candles attached to top tier ── */}
          {candles.map((cx, i) => (
            <Candle
              key={i}
              cx={cx}
              isLit={lit[i]}
              onBlow={() => blowOut(i)}
              colour={[BLUSH, PEACH, SAGE, BUTTER, BLUSH, PEACH, SAGE][i]}
            />
          ))}

          {/* small written "happy birthday" ribbon under tier */}
          <g filter="url(#pencilWobble)">
            <path
              d="M120 248 Q 200 240, 280 248 L 285 268 Q 200 260, 115 268 Z"
              fill="#fffaf0"
              stroke={INK}
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </g>
          <text
            x="200"
            y="262"
            textAnchor="middle"
            fontFamily="cursive, ui-serif"
            fontStyle="italic"
            fontSize="14"
            fill={INK}
          >
            happy birthday
          </text>
        </svg>

        <AnimatePresence>
          {allOut && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              style={{
                position: "absolute",
                bottom: -54,
                left: 0,
                right: 0,
                textAlign: "center",
                fontStyle: "italic",
                fontSize: "clamp(18px, 2.6vw, 24px)",
                color: INK,
              }}
            >
              now make the wish.
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.6, duration: 1 }}
        style={{
          marginTop: "10vh",
          fontSize: "clamp(13px, 1.8vw, 15px)",
          color: INK_SOFT,
          fontStyle: "italic",
          letterSpacing: "0.06em",
        }}
      >
        {allOut ? "well done." : "tap each flame, one by one."}
      </motion.p>
    </section>
  );
}

function Candle({
  cx,
  isLit,
  onBlow,
  colour,
}: {
  cx: number;
  isLit: boolean;
  onBlow: () => void;
  colour: string;
}) {
  return (
    <g
      style={{ cursor: isLit ? "pointer" : "default" }}
      onClick={() => isLit && onBlow()}
    >
      {/* candle body */}
      <g filter="url(#pencilWobble)">
        <rect
          x={cx - 4}
          y={108}
          width={8}
          height={36}
          rx={1.5}
          fill={colour}
          stroke={INK}
          strokeWidth={1}
        />
        {/* candle stripes */}
        <line
          x1={cx - 4}
          y1={118}
          x2={cx + 4}
          y2={114}
          stroke={INK}
          strokeWidth="0.5"
          opacity="0.5"
        />
        <line
          x1={cx - 4}
          y1={130}
          x2={cx + 4}
          y2={126}
          stroke={INK}
          strokeWidth="0.5"
          opacity="0.5"
        />
      </g>

      {/* wick */}
      <line x1={cx} y1={108} x2={cx} y2={102} stroke={INK} strokeWidth={1.2} />

      {/* flame OR smoke */}
      <AnimatePresence mode="wait">
        {isLit ? (
          <motion.g
            key="flame"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{
              scale: [1, 1.08, 0.95, 1.05, 1],
              opacity: 1,
            }}
            exit={{ opacity: 0, scale: 0.4, y: -8 }}
            transition={{
              scale: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
              opacity: { duration: 0.5 },
            }}
            style={{ transformOrigin: `${cx}px 100px` }}
          >
            {/* outer glow */}
            <ellipse cx={cx} cy={96} rx={6} ry={9} fill={BUTTER} opacity={0.5} />
            {/* main flame */}
            <path
              d={`M${cx} 88 Q ${cx + 4} 96, ${cx + 2.5} 102 Q ${cx} 105, ${cx - 2.5} 102 Q ${cx - 4} 96, ${cx} 88 Z`}
              fill="#ffb347"
              stroke={INK}
              strokeWidth="0.6"
            />
            {/* inner flame */}
            <path
              d={`M${cx} 92 Q ${cx + 2} 97, ${cx + 1} 101 Q ${cx} 102.5, ${cx - 1} 101 Q ${cx - 2} 97, ${cx} 92 Z`}
              fill="#fff3a0"
            />
          </motion.g>
        ) : (
          <motion.g
            key="smoke"
            initial={{ opacity: 0.7, y: 0 }}
            animate={{ opacity: 0, y: -22 }}
            transition={{ duration: 2, ease: "easeOut" }}
          >
            <path
              d={`M${cx} 100 Q ${cx + 3} 94, ${cx - 1} 88 Q ${cx + 2} 82, ${cx} 76`}
              stroke={INK_SOFT}
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
              opacity="0.6"
            />
          </motion.g>
        )}
      </AnimatePresence>
    </g>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Polaroids                                                           */
/* ─────────────────────────────────────────────────────────────────── */
function PolaroidsSection({
  photos,
  caveat,
}: {
  photos: string[];
  caveat: string;
}) {
  if (!photos.length) return null;

  // deterministic per-index variation so SSR matches CSR
  const variants = photos.map((_, i) => {
    const seed = (i * 7 + 13) % 11;
    return {
      rotate: ((seed - 5) * 1.7).toFixed(2), // -8.5 → +8.5 deg
      tape: i % 3,
      tapeColor: [PEACH, BLUSH, SAGE, BUTTER][i % 4],
    };
  });

  return (
    <section
      style={{
        minHeight: "100svh",
        padding: "12vh 6vw 14vh",
        position: "relative",
      }}
    >
      <motion.h2
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.9 }}
        style={{
          fontSize: "clamp(22px, 4vw, 38px)",
          fontStyle: "italic",
          color: INK_SOFT,
          textAlign: "center",
          margin: "0 0 1vh",
          letterSpacing: "0.03em",
        }}
      >
        kept moments
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.3, duration: 0.8 }}
        className={caveat}
        style={{
          textAlign: "center",
          color: INK,
          fontSize: "clamp(20px, 2.6vw, 26px)",
          marginBottom: "6vh",
        }}
      >
        a few of you, taped to the page
      </motion.p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "clamp(28px, 4vw, 56px)",
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        {photos.map((src, i) => (
          <Polaroid
            key={src}
            src={src}
            index={i}
            rotate={Number(variants[i].rotate)}
            tapeStyle={variants[i].tape}
            tapeColor={variants[i].tapeColor}
            caveat={caveat}
          />
        ))}
      </div>
    </section>
  );
}

function Polaroid({
  src,
  index,
  rotate,
  tapeStyle,
  tapeColor,
  caveat,
}: {
  src: string;
  index: number;
  rotate: number;
  tapeStyle: number;
  tapeColor: string;
  caveat: string;
}) {
  return (
    <motion.figure
      initial={{ opacity: 0, y: 30, rotate: rotate * 0.3 }}
      whileInView={{ opacity: 1, y: 0, rotate }}
      viewport={{ once: true, margin: "-8%" }}
      transition={{ duration: 0.9, delay: (index % 6) * 0.07, ease: "easeOut" }}
      whileHover={{ rotate: 0, scale: 1.04, zIndex: 10 }}
      style={{
        position: "relative",
        background: "#fffdf6",
        padding: "12px 12px 44px",
        boxShadow:
          "0 1px 1px rgba(58,47,36,0.08), 0 14px 30px -10px rgba(58,47,36,0.28), 0 4px 10px -4px rgba(58,47,36,0.18)",
        borderRadius: 1,
        // torn-edge effect via clip-path
        clipPath:
          "polygon(0% 1%, 4% 0%, 12% 1.5%, 22% 0.4%, 35% 1.6%, 48% 0.2%, 60% 1.4%, 72% 0.5%, 84% 1.6%, 95% 0.4%, 100% 1.2%, 99% 12%, 100% 28%, 99.4% 45%, 100% 60%, 99% 75%, 99.6% 88%, 100% 99%, 92% 100%, 80% 99%, 65% 100%, 50% 99.2%, 35% 100%, 20% 99%, 8% 100%, 0% 99%, 0.6% 86%, 0% 70%, 0.4% 55%, 0% 42%, 0.6% 28%, 0% 14%)",
        transformOrigin: "center",
        margin: "12px",
      }}
    >
      {/* washi tape */}
      <Tape style={tapeStyle} color={tapeColor} />

      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1.05",
          overflow: "hidden",
          background: CREAM_DEEP,
          position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            // gentle warm/desaturate to match paper feel
            filter: "saturate(0.92) contrast(1.02) sepia(0.06)",
          }}
        />
        {/* subtle paper grain over photo */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 50% 30%, rgba(255,243,220,0.18) 0%, transparent 70%)",
            mixBlendMode: "soft-light",
            pointerEvents: "none",
          }}
        />
      </div>

      <figcaption
        className={caveat}
        style={{
          position: "absolute",
          bottom: 10,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 22,
          color: INK,
          letterSpacing: "0.02em",
        }}
      >
        {["smile", "you, exactly", "keeper", "this one", "always", "hold this", "no notes", "framed", "again"][index % 9]}
      </figcaption>
    </motion.figure>
  );
}

function Tape({ style, color }: { style: number; color: string }) {
  // 3 styles: top-left, top-center, top-right
  const layouts = [
    { left: -18, right: "auto", top: -14, rotate: -22, w: 90 },
    { left: "50%", right: "auto", top: -16, rotate: 4, w: 110, translateX: -55 },
    { left: "auto", right: -18, top: -14, rotate: 18, w: 90 },
  ];
  const l = layouts[style];
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: l.left as number | string,
        right: l.right as number | string,
        top: l.top,
        width: l.w,
        height: 22,
        transform: `${l.translateX ? `translateX(${l.translateX}%) ` : ""}rotate(${l.rotate}deg)`,
        background: color,
        opacity: 0.7,
        boxShadow: "0 2px 4px rgba(58,47,36,0.18)",
        // jagged tape edges via mask
        WebkitMaskImage:
          "linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%)",
        maskImage:
          "linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%)",
        zIndex: 2,
        // semi-transparent stripe
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 6px, transparent 6px 12px)",
        backgroundBlendMode: "overlay",
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Wishes — handwritten lined-paper notes                              */
/* ─────────────────────────────────────────────────────────────────── */
function WishesSection({ caveat }: { caveat: string }) {
  return (
    <section
      style={{
        minHeight: "100svh",
        padding: "12vh 6vw",
      }}
    >
      <motion.h2
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-20%" }}
        transition={{ duration: 0.9 }}
        style={{
          fontSize: "clamp(22px, 4vw, 38px)",
          fontStyle: "italic",
          color: INK_SOFT,
          textAlign: "center",
          margin: "0 0 1vh",
        }}
      >
        seven small wishes
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.2, duration: 0.8 }}
        style={{
          textAlign: "center",
          fontStyle: "italic",
          color: INK_SOFT,
          fontSize: "clamp(13px, 1.6vw, 15px)",
          marginBottom: "6vh",
          letterSpacing: "0.05em",
        }}
      >
        one for each candle.
      </motion.p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "clamp(24px, 3vw, 40px)",
          maxWidth: 1000,
          margin: "0 auto",
        }}
      >
        {WISHES.map((w, i) => (
          <WishCard key={i} text={w} index={i} caveat={caveat} />
        ))}
      </div>
    </section>
  );
}

function WishCard({
  text,
  index,
  caveat,
}: {
  text: string;
  index: number;
  caveat: string;
}) {
  const rot = ((index * 3.7) % 5) - 2.5; // -2.5 → +2.5
  const accents = [
    <DoodleHeart key="h" fill={BLUSH} size={20} />,
    <DoodleStar key="s" fill={BUTTER} size={20} />,
    <DoodleHeart key="h2" fill={PEACH} size={20} />,
    <DoodleStar key="s2" fill={SAGE} size={20} />,
    <DoodleHeart key="h3" fill={BLUSH} size={20} />,
    <DoodleStar key="s3" fill={BUTTER} size={20} />,
    <DoodleHeart key="h4" fill={PEACH} size={20} />,
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, rotate: rot * 0.3 }}
      whileInView={{ opacity: 1, y: 0, rotate: rot }}
      viewport={{ once: true, margin: "-8%" }}
      transition={{ duration: 0.8, delay: index * 0.08, ease: "easeOut" }}
      whileHover={{ rotate: 0, y: -4 }}
      style={{
        background:
          "linear-gradient(to bottom, #fffdf6 0%, #fffaf0 100%)",
        padding: "26px 26px 30px",
        boxShadow:
          "0 1px 1px rgba(58,47,36,0.06), 0 12px 24px -10px rgba(58,47,36,0.22), 0 4px 8px -4px rgba(58,47,36,0.12)",
        borderRadius: 2,
        position: "relative",
        // notebook lines
        backgroundImage:
          "linear-gradient(to bottom, transparent 0, transparent 100%), repeating-linear-gradient(transparent 0 33px, rgba(58,47,36,0.07) 33px 34px)",
        // corner fold
        clipPath:
          "polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%)",
        minHeight: 180,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -10,
          left: -10,
          background: BUTTER,
          color: INK,
          width: 30,
          height: 30,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          fontFamily: "ui-serif, Georgia, serif",
          fontStyle: "italic",
          fontSize: 14,
          fontWeight: 600,
          boxShadow: "0 2px 4px rgba(58,47,36,0.25)",
          border: `1.2px solid ${INK}`,
        }}
      >
        {index + 1}
      </div>
      <p
        className={caveat}
        style={{
          margin: 0,
          color: INK,
          fontSize: "clamp(18px, 2.2vw, 22px)",
          lineHeight: "34px",
          letterSpacing: "0.005em",
        }}
      >
        {text}
      </p>
      <div
        style={{
          marginTop: 14,
          display: "flex",
          justifyContent: "flex-end",
          gap: 6,
        }}
      >
        {accents[index]}
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Sign-off                                                            */
/* ─────────────────────────────────────────────────────────────────── */
function SignOff({ caveat }: { caveat: string }) {
  return (
    <section
      style={{
        minHeight: "70svh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "10vh 6vw 14vh",
        textAlign: "center",
        gap: "2vh",
      }}
    >
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 1.2 }}
      >
        <svg width="80" height="40" viewBox="0 0 80 40" filter="url(#pencilWobble)">
          <path
            d="M5 20 Q 20 5, 40 20 T 75 20"
            stroke={INK}
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
            opacity="0.6"
          />
        </svg>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 1, delay: 0.2 }}
        style={{
          maxWidth: 540,
          fontSize: "clamp(18px, 2.4vw, 22px)",
          fontStyle: "italic",
          color: INK,
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        thank you for being the kind of person who makes
        <br />
        a page like this feel easy to write.
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.6 }}
        className={caveat}
        style={{
          marginTop: "3vh",
          fontSize: "clamp(36px, 6vw, 56px)",
          color: INK,
          lineHeight: 1,
        }}
      >
        happy birthday, Simren
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.9 }}
        style={{
          marginTop: "1vh",
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: INK_SOFT,
          fontStyle: "italic",
          fontSize: "clamp(13px, 1.6vw, 15px)",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        <DoodleHeart fill={BLUSH} size={18} />
        <span>{DATE_STR}</span>
        <DoodleHeart fill={PEACH} size={18} />
      </motion.div>

      {/* bottom torn-paper edge */}
      <svg
        aria-hidden
        width="100%"
        height="20"
        viewBox="0 0 200 20"
        preserveAspectRatio="none"
        style={{ marginTop: "6vh", maxWidth: 600 }}
      >
        <path
          d="M0 10 Q 10 4, 20 10 T 40 10 T 60 10 T 80 10 T 100 10 T 120 10 T 140 10 T 160 10 T 180 10 T 200 10"
          stroke={INK}
          strokeWidth="0.8"
          fill="none"
          opacity="0.35"
          filter="url(#pencilWobble)"
        />
      </svg>
    </section>
  );
}
