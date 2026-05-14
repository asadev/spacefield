"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * ATELIER — Birthday page for Simren Zahra (2026-05-14)
 *
 * LIGHT MODE. A designer's mood board.
 *   - Cream linen background w/ subtle weave grain
 *   - Pinned photos w/ brass tacks + washi tape, slight rotation, drop shadows
 *   - Hand-painted script title ("atelier no. 14 — May 2026")
 *   - Cake as designer's process sketch w/ arrows + handwritten notes
 *   - Wishes on scrap-paper (ruled, kraft, post-it pink, manila tag, etc.)
 *   - Sign-off as a price-tag dangling from twine
 *
 * Sections, top-to-bottom:
 *   1. Title strip   — animate (not whileInView), visible within 1s
 *   2. Mood board    — desktop: 2D pinned collage; mobile: single column
 *   3. Cake sketch   — pencil-line cake w/ designer notes
 *   4. Wishes        — scrap-paper grid, 7 different paper types
 *   5. Sign-off      — manila price-tag w/ twine
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { Caveat, Cormorant_Garamond, Sacramento } from "next/font/google";

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const sacramento = Sacramento({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const FULL_NAME = "SIMREN";
const DATE_STR = "MAY · 2026";

/* ── colour palette (per design-spec.md) ────────────────────────────── */
const CREAM = "#f4ead8";
const CREAM_DEEP = "#e8dcc2";
const LINEN_WARM = "#efe4cc";
const INK = "#2a2a2a";
const INK_SOFT = "#5a4a3a";
const BRASS = "#b8923f";
const BRASS_DEEP = "#8b6f2f";
const ROSE = "#c97a76";
const SAGE = "#9aab8c";
const CREAM_PAPER = "#fffdf6";
const POSTIT_PINK = "#f5c8c4";
const KRAFT = "#c8a878";
const MANILA = "#dcc591";
const RULED_BLUE = "#8aa3c2";

/* ── wishes, on note-paper voice ────────────────────────────────────── */
type PaperKind = "ruled" | "kraft" | "postit" | "manila" | "cardstock" | "torn" | "index";

interface Wish {
  text: string;
  paper: PaperKind;
}

const WISHES: Wish[] = [
  { text: "May this year be the kindest one yet — and may you notice every soft moment of it.", paper: "ruled" },
  { text: "May your laugh stay loud and your worries stay small.", paper: "kraft" },
  { text: "May the people who already love you find a thousand new reasons to.", paper: "postit" },
  { text: "May the ordinary days feel like enough, and the special ones feel like more.", paper: "manila" },
  { text: "May you be brave on the days that ask for brave, and tender on the rest.", paper: "cardstock" },
  { text: "May every door you knock on open a little wider than you expected.", paper: "torn" },
  { text: "Lucky world, having you in it. Today especially.", paper: "index" },
];

/* ── mood-board layout: per-photo placement on the desktop canvas ───── */
interface BoardSlot {
  x: number;
  y: number;
  w: number;
  rot: number;
  pin: "top-left" | "top-right" | "top-center" | "two" | "none";
  tape: "none" | "top-center" | "top-left-diag" | "top-right-diag";
  caption: string;
}

const BOARD_SLOTS: BoardSlot[] = [
  { x: 60,  y: 60,  w: 240, rot: -4, pin: "top-left",   tape: "none",            caption: "no. 01" },
  { x: 360, y: 30,  w: 220, rot:  2, pin: "none",       tape: "top-center",      caption: "soft light" },
  { x: 700, y: 100, w: 260, rot: -3, pin: "top-right",  tape: "none",            caption: "the smile" },
  { x: 120, y: 400, w: 200, rot:  5, pin: "none",       tape: "top-left-diag",   caption: "frame this" },
  { x: 420, y: 360, w: 300, rot: -2, pin: "two",        tape: "none",            caption: "hero shot" },
  { x: 800, y: 440, w: 220, rot:  4, pin: "top-center", tape: "none",            caption: "keep" },
  { x: 180, y: 800, w: 240, rot: -3, pin: "none",       tape: "top-center",      caption: "again" },
  { x: 500, y: 880, w: 220, rot:  3, pin: "top-left",   tape: "none",            caption: "no notes" },
  { x: 800, y: 840, w: 240, rot: -5, pin: "none",       tape: "top-right-diag",  caption: "yes" },
];

/* ── scattered annotations on the board ─────────────────────────────── */
interface Annotation {
  x: number;
  y: number;
  rot: number;
  text: string;
  arrow?: "left" | "right" | "down" | "up" | "none";
  size?: number;
}

const BOARD_ANNOTATIONS: Annotation[] = [
  { x: 320, y: 200, rot: -8, text: "← this one", arrow: "left", size: 22 },
  { x: 660, y: 320, rot: 4,  text: "palette ↑",  arrow: "up",   size: 20 },
  { x: 80,  y: 700, rot: -6, text: "fabric: dusty rose",         size: 18 },
  { x: 740, y: 720, rot: 5,  text: "good light here",            size: 18 },
  { x: 380, y: 760, rot: -3, text: "↓ keep these together",      arrow: "down", size: 18 },
  { x: 980, y: 240, rot: 8,  text: "yes",                        size: 26 },
];

/* ── color-chip swatches scattered on board ─────────────────────────── */
interface Swatch {
  x: number;
  y: number;
  rot: number;
  color: string;
  label: string;
}

const BOARD_SWATCHES: Swatch[] = [
  { x: 1020, y: 80,  rot: -10, color: ROSE,    label: "rose" },
  { x: 1050, y: 160, rot: 6,   color: SAGE,    label: "sage" },
  { x: 1010, y: 240, rot: -4,  color: BRASS,   label: "brass" },
  { x: 30,   y: 280, rot: 12,  color: MANILA,  label: "manila" },
  { x: 60,   y: 1020, rot: -8, color: KRAFT,   label: "kraft" },
];

interface Props {
  photos: string[];
}

/* ───────────────────────────────────────────────────────────────────── */
/* Root                                                                  */
/* ───────────────────────────────────────────────────────────────────── */
export default function AtelierExperience({ photos }: Props) {
  const reduced = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ container: scrollRef });
  const boardShift = useTransform(scrollYProgress, [0, 1], ["0%", "-6%"]);

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
      className={cormorant.className}
    >
      <SvgFilters />

      {/* ── Linen weave background ── */}
      <motion.div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          y: reduced ? "0%" : boardShift,
          zIndex: 0,
          backgroundImage:
            "radial-gradient(ellipse at 25% 15%, rgba(255,250,235,0.6) 0%, transparent 55%)," +
            "radial-gradient(ellipse at 80% 80%, rgba(184,146,63,0.10) 0%, transparent 60%)," +
            `linear-gradient(180deg, ${CREAM} 0%, ${LINEN_WARM} 60%, ${CREAM_DEEP} 100%)`,
        }}
      />
      {/* Linen grain (SVG noise) */}
      <svg
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 1,
          mixBlendMode: "multiply",
          opacity: 0.55,
        }}
      >
        <rect width="100%" height="100%" filter="url(#linenWeave)" />
      </svg>
      {/* Subtle warm vignette to give 'photographed under window' feeling */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 2,
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(90,74,58,0.18) 100%)",
        }}
      />

      <main style={{ position: "relative", zIndex: 5 }}>
        <TitleStrip caveatCls={caveat.className} sacramentoCls={sacramento.className} />
        <MoodBoard photos={photos} caveatCls={caveat.className} reduced={!!reduced} />
        <CakeSketch caveatCls={caveat.className} />
        <WishesGrid caveatCls={caveat.className} />
        <SignOff caveatCls={caveat.className} sacramentoCls={sacramento.className} />
      </main>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* SVG filter defs (linen, pencil, watercolor)                           */
/* ───────────────────────────────────────────────────────────────────── */
function SvgFilters() {
  return (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        <filter id="linenWeave">
          <feTurbulence type="fractalNoise" baseFrequency="0.92" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.32 0 0 0 0 0.25 0 0 0 0 0.16 0 0 0 0.20 0"
          />
        </filter>
        <filter id="pencilWobble" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="5" />
          <feDisplacementMap in="SourceGraphic" scale="1.4" />
        </filter>
        <filter id="paintStroke" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="9" />
          <feDisplacementMap in="SourceGraphic" scale="3" />
        </filter>
      </defs>
    </svg>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* Title strip — must show within 1s (animate, NOT whileInView)          */
/* ───────────────────────────────────────────────────────────────────── */
function TitleStrip({
  caveatCls,
  sacramentoCls,
}: {
  caveatCls: string;
  sacramentoCls: string;
}) {
  return (
    <section
      style={{
        minHeight: "92svh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "10vh 6vw 4vh",
        textAlign: "center",
        position: "relative",
      }}
    >
      {/* Top fabric swatch tab */}
      <FabricTab color={ROSE} side="left" />
      <FabricTab color={SAGE} side="right" />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        style={{
          fontSize: "clamp(11px, 1.6vw, 13px)",
          letterSpacing: "0.45em",
          textTransform: "uppercase",
          color: INK_SOFT,
          marginBottom: "2.4vh",
        }}
      >
        a small thing, made by hand
      </motion.div>

      {/* Sacramento "atelier no. 14" overlay */}
      <motion.div
        initial={{ opacity: 0, rotate: -3 }}
        animate={{ opacity: 1, rotate: -3 }}
        transition={{ duration: 0.9, delay: 0.15, ease: "easeOut" }}
        className={sacramentoCls}
        style={{
          fontSize: "clamp(34px, 6.5vw, 72px)",
          lineHeight: 1,
          color: ROSE,
          marginBottom: "-1.2vh",
          filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.04))",
          // not blurred — drop-shadow is fine
        }}
      >
        atelier no. 14
      </motion.div>

      {/* SIMREN in display Cormorant caps with painted underline */}
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.3, ease: "easeOut" }}
        style={{
          fontSize: "clamp(72px, 18vw, 220px)",
          lineHeight: 0.95,
          color: INK,
          margin: "0",
          fontWeight: 500,
          letterSpacing: "0.06em",
          fontStyle: "normal",
          position: "relative",
        }}
      >
        {FULL_NAME}
        {/* hand-painted brushstroke underline */}
        <svg
          aria-hidden
          viewBox="0 0 400 30"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            left: "5%",
            right: "5%",
            bottom: "-12px",
            width: "90%",
            height: "22px",
            display: "block",
            filter: "url(#paintStroke)",
          }}
        >
          <path
            d="M5 15 Q 100 5, 200 14 T 395 12"
            stroke={ROSE}
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
            opacity="0.85"
          />
        </svg>
      </motion.h1>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.6 }}
        style={{
          marginTop: "4.5vh",
          fontSize: "clamp(12px, 1.7vw, 14px)",
          letterSpacing: "0.6em",
          textTransform: "uppercase",
          color: INK_SOFT,
          fontWeight: 500,
        }}
      >
        {DATE_STR}
      </motion.div>

      {/* hand-pinned brass tack on the title card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.85 }}
        style={{ position: "absolute", top: "9vh", left: "50%", transform: "translateX(-50%)" }}
      >
        <BrassTack size={18} />
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.75 }}
        className={caveatCls}
        style={{
          marginTop: "5vh",
          maxWidth: 540,
          fontSize: "clamp(20px, 2.6vw, 26px)",
          color: INK,
          lineHeight: 1.45,
          transform: "rotate(-1deg)",
        }}
      >
        a board pinned for you — scroll on
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 1.5, repeat: Infinity, repeatType: "reverse" }}
        style={{
          position: "absolute",
          bottom: "3vh",
          left: "50%",
          transform: "translateX(-50%)",
          color: INK_SOFT,
          fontSize: 11,
          letterSpacing: "0.35em",
          textTransform: "uppercase",
        }}
      >
        ↓ to the board
      </motion.div>
    </section>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* Mood Board — desktop 2D collage / mobile single column                */
/* ───────────────────────────────────────────────────────────────────── */
function MoodBoard({
  photos,
  caveatCls,
  reduced,
}: {
  photos: string[];
  caveatCls: string;
  reduced: boolean;
}) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [lifted, setLifted] = useState<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (!photos.length) {
    return (
      <section
        style={{
          padding: "10vh 6vw",
          textAlign: "center",
          color: INK_SOFT,
          fontStyle: "italic",
        }}
      >
        the board is being prepared.
      </section>
    );
  }

  // Repeat slots if photos > slots length
  const items = photos.map((src, i) => ({
    src,
    slot: BOARD_SLOTS[i % BOARD_SLOTS.length],
    index: i,
  }));

  return (
    <section
      style={{
        padding: isDesktop ? "8vh 0 12vh" : "8vh 5vw 10vh",
        position: "relative",
      }}
    >
      <SectionLabel caveatCls={caveatCls} text="the board" subtext="moments, pinned" />

      {isDesktop ? (
        // ─── DESKTOP: 2D collage ───────────────────────────────────────
        <div
          style={{
            position: "relative",
            width: "min(1200px, 94vw)",
            height: 1180,
            margin: "4vh auto 0",
          }}
        >
          {/* color chip swatches */}
          {BOARD_SWATCHES.map((s, i) => (
            <ColorChip key={`sw-${i}`} swatch={s} />
          ))}

          {/* photos */}
          {items.map(({ src, slot, index }) => (
            <PinnedPhoto
              key={src}
              src={src}
              slot={slot}
              index={index}
              caveatCls={caveatCls}
              isLifted={lifted === index}
              onClick={() => setLifted(lifted === index ? null : index)}
              reduced={reduced}
            />
          ))}

          {/* annotations */}
          {BOARD_ANNOTATIONS.map((a, i) => (
            <BoardAnnotation key={`an-${i}`} ann={a} caveatCls={caveatCls} index={i} />
          ))}
        </div>
      ) : (
        // ─── MOBILE: vertical column ───────────────────────────────────
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8vh",
            maxWidth: 480,
            margin: "4vh auto 0",
          }}
        >
          {items.map(({ src, slot, index }) => (
            <MobilePinnedPhoto
              key={src}
              src={src}
              slot={slot}
              index={index}
              caveatCls={caveatCls}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Section header (re-used) ────────────────────────────────────────── */
function SectionLabel({
  caveatCls,
  text,
  subtext,
}: {
  caveatCls: string;
  text: string;
  subtext?: string;
}) {
  return (
    <div style={{ textAlign: "center", marginBottom: "1vh" }}>
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.7 }}
        className={caveatCls}
        style={{
          fontSize: "clamp(34px, 5.5vw, 56px)",
          color: INK,
          margin: 0,
          lineHeight: 1.05,
          fontWeight: 500,
          transform: "rotate(-2deg)",
          display: "inline-block",
        }}
      >
        {text}
      </motion.h2>
      {subtext && (
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2 }}
          style={{
            marginTop: "1vh",
            fontSize: "clamp(11px, 1.4vw, 13px)",
            letterSpacing: "0.4em",
            textTransform: "uppercase",
            color: INK_SOFT,
            fontWeight: 500,
          }}
        >
          {subtext}
        </motion.div>
      )}
    </div>
  );
}

/* ── Pinned photo (DESKTOP) ─────────────────────────────────────────── */
function PinnedPhoto({
  src,
  slot,
  index,
  caveatCls,
  isLifted,
  onClick,
  reduced,
}: {
  src: string;
  slot: BoardSlot;
  index: number;
  caveatCls: string;
  isLifted: boolean;
  onClick: () => void;
  reduced: boolean;
}) {
  return (
    <motion.figure
      initial={{ opacity: 0, y: 24, rotate: slot.rot * 0.4 }}
      whileInView={{ opacity: 1, y: 0, rotate: slot.rot }}
      viewport={{ once: true, margin: "-5%" }}
      transition={{
        duration: 0.7,
        delay: Math.min(index * 0.05, 0.4),
        ease: "easeOut",
      }}
      whileHover={
        reduced
          ? { opacity: 1 }
          : { rotate: 0, scale: 1.06, y: -8, zIndex: 30 }
      }
      onClick={onClick}
      style={{
        position: "absolute",
        left: slot.x,
        top: slot.y,
        width: slot.w,
        background: CREAM_PAPER,
        padding: "10px 10px 10px",
        boxShadow: isLifted
          ? "0 30px 50px -16px rgba(42,42,42,0.42), 0 12px 20px -10px rgba(42,42,42,0.28)"
          : "0 1px 0 rgba(255,255,255,0.4) inset, 0 12px 22px -12px rgba(42,42,42,0.32), 0 4px 8px -4px rgba(42,42,42,0.2)",
        cursor: "pointer",
        zIndex: isLifted ? 40 : 10,
        transformOrigin: "center top",
        margin: 0,
      }}
    >
      {/* Tape strips */}
      {slot.tape !== "none" && <Tape kind={slot.tape} />}
      {/* Brass tacks */}
      {slot.pin !== "none" && <Pins kind={slot.pin} />}

      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1.2",
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
            filter: "saturate(0.95) contrast(1.02)",
          }}
        />
      </div>

      <figcaption
        className={caveatCls}
        style={{
          marginTop: 6,
          textAlign: "center",
          fontSize: 16,
          color: INK,
          letterSpacing: "0.02em",
          lineHeight: 1.1,
        }}
      >
        {slot.caption}
      </figcaption>
    </motion.figure>
  );
}

/* ── Pinned photo (MOBILE) — single column, no absolute positioning ── */
function MobilePinnedPhoto({
  src,
  slot,
  index,
  caveatCls,
}: {
  src: string;
  slot: BoardSlot;
  index: number;
  caveatCls: string;
}) {
  // Smaller rotations on mobile
  const rot = slot.rot * 0.4;
  const tape = index % 2 === 0 ? "top-center" : "none";
  const pin = index % 2 === 1;

  return (
    <motion.figure
      initial={{ opacity: 0, y: 16, rotate: 0 }}
      whileInView={{ opacity: 1, y: 0, rotate: rot }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.6, delay: Math.min(index * 0.04, 0.3) }}
      style={{
        position: "relative",
        background: CREAM_PAPER,
        padding: "12px 12px 14px",
        boxShadow:
          "0 12px 22px -12px rgba(42,42,42,0.32), 0 4px 8px -4px rgba(42,42,42,0.2)",
        margin: "0 auto",
        maxWidth: 360,
        width: "90%",
      }}
    >
      {tape === "top-center" && <Tape kind="top-center" />}
      {pin && <Pins kind="top-center" />}

      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1.2",
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
            filter: "saturate(0.95) contrast(1.02)",
          }}
        />
      </div>
      <figcaption
        className={caveatCls}
        style={{
          marginTop: 8,
          textAlign: "center",
          fontSize: 18,
          color: INK,
        }}
      >
        {slot.caption}
      </figcaption>
    </motion.figure>
  );
}

/* ── Brass tack ──────────────────────────────────────────────────────── */
function BrassTack({ size = 14 }: { size?: number }) {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle at 35% 30%, #f0d484 0%, ${BRASS} 45%, ${BRASS_DEEP} 100%)`,
        boxShadow:
          `0 1px 0 rgba(255,255,255,0.4) inset, 0 ${Math.round(size * 0.2)}px ${Math.round(size * 0.5)}px rgba(42,42,42,0.45), 0 1px 1px rgba(42,42,42,0.35)`,
        border: `0.5px solid ${BRASS_DEEP}`,
      }}
    />
  );
}

/* ── Pin layouts on a photo ──────────────────────────────────────────── */
function Pins({ kind }: { kind: "top-left" | "top-right" | "top-center" | "two" }) {
  const wrap: React.CSSProperties = { position: "absolute", zIndex: 5 };
  if (kind === "top-left") {
    return (
      <div style={{ ...wrap, top: -6, left: -4 }}>
        <BrassTack size={16} />
      </div>
    );
  }
  if (kind === "top-right") {
    return (
      <div style={{ ...wrap, top: -6, right: -4 }}>
        <BrassTack size={16} />
      </div>
    );
  }
  if (kind === "top-center") {
    return (
      <div style={{ ...wrap, top: -6, left: "50%", transform: "translateX(-50%)" }}>
        <BrassTack size={16} />
      </div>
    );
  }
  // two
  return (
    <>
      <div style={{ ...wrap, top: -6, left: -4 }}>
        <BrassTack size={14} />
      </div>
      <div style={{ ...wrap, top: -6, right: -4 }}>
        <BrassTack size={14} />
      </div>
    </>
  );
}

/* ── Washi tape strip ────────────────────────────────────────────────── */
function Tape({ kind }: { kind: "top-center" | "top-left-diag" | "top-right-diag" }) {
  const layouts: Record<string, React.CSSProperties> = {
    "top-center": {
      left: "50%",
      top: -14,
      width: 110,
      height: 24,
      transform: "translateX(-50%) rotate(2deg)",
      background: ROSE,
    },
    "top-left-diag": {
      left: -22,
      top: -10,
      width: 100,
      height: 22,
      transform: "rotate(-22deg)",
      background: SAGE,
    },
    "top-right-diag": {
      right: -22,
      top: -10,
      width: 100,
      height: 22,
      transform: "rotate(20deg)",
      background: MANILA,
    },
  };
  const l = layouts[kind];
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        zIndex: 4,
        opacity: 0.78,
        boxShadow: "0 3px 6px rgba(42,42,42,0.18)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)",
        maskImage:
          "linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)",
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0 6px, transparent 6px 12px)",
        backgroundBlendMode: "overlay",
        ...l,
      }}
    />
  );
}

/* ── Color chip swatches ─────────────────────────────────────────────── */
function ColorChip({ swatch }: { swatch: Swatch }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7, rotate: 0 }}
      whileInView={{ opacity: 1, scale: 1, rotate: swatch.rot }}
      viewport={{ once: true, margin: "-5%" }}
      transition={{ duration: 0.6, delay: 0.2 }}
      style={{
        position: "absolute",
        left: swatch.x,
        top: swatch.y,
        width: 60,
        height: 70,
        background: CREAM_PAPER,
        padding: "6px 6px 4px",
        boxShadow:
          "0 8px 14px -8px rgba(42,42,42,0.3), 0 2px 4px -2px rgba(42,42,42,0.2)",
        zIndex: 8,
      }}
    >
      <div
        aria-hidden
        style={{ position: "absolute", top: -5, left: "50%", transform: "translateX(-50%)" }}
      >
        <BrassTack size={12} />
      </div>
      <div
        style={{
          width: "100%",
          height: 38,
          background: swatch.color,
          boxShadow: "inset 0 0 0 0.5px rgba(42,42,42,0.18)",
        }}
      />
      <div
        style={{
          fontSize: 8,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: INK_SOFT,
          textAlign: "center",
          marginTop: 4,
          fontFamily: "ui-serif, Georgia, serif",
          fontWeight: 600,
        }}
      >
        {swatch.label}
      </div>
    </motion.div>
  );
}

/* ── Annotation — handwritten note pinned on the board ──────────────── */
function BoardAnnotation({
  ann,
  caveatCls,
  index,
}: {
  ann: Annotation;
  caveatCls: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1, rotate: ann.rot }}
      viewport={{ once: true, margin: "-5%" }}
      transition={{ duration: 0.6, delay: 0.3 + index * 0.05 }}
      className={caveatCls}
      style={{
        position: "absolute",
        left: ann.x,
        top: ann.y,
        fontSize: ann.size ?? 18,
        color: INK,
        zIndex: 6,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        textShadow: "0 1px 0 rgba(244,234,216,0.6)",
      }}
    >
      {ann.text}
    </motion.div>
  );
}

/* ── Fabric tab (corner accent) ──────────────────────────────────────── */
function FabricTab({ color, side }: { color: string; side: "left" | "right" }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        [side]: 0,
        width: 60,
        height: 90,
        background: color,
        opacity: 0.7,
        clipPath:
          side === "left"
            ? "polygon(0 0, 100% 0, 80% 100%, 0% 90%)"
            : "polygon(0 0, 100% 0, 100% 90%, 20% 100%)",
        boxShadow: "0 4px 8px rgba(42,42,42,0.15)",
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.12) 0 3px, transparent 3px 6px)",
      }}
    />
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* Cake — designer's process sketch                                       */
/* ───────────────────────────────────────────────────────────────────── */
function CakeSketch({ caveatCls }: { caveatCls: string }) {
  return (
    <section
      style={{
        padding: "10vh 6vw 12vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <SectionLabel caveatCls={caveatCls} text="the cake" subtext="working sketch" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-5%" }}
        transition={{ duration: 0.8 }}
        style={{
          marginTop: "5vh",
          width: "min(620px, 94vw)",
          background: CREAM_PAPER,
          padding: "32px 28px 40px",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.4) inset, 0 18px 36px -16px rgba(42,42,42,0.34), 0 6px 14px -6px rgba(42,42,42,0.22)",
          position: "relative",
          transform: "rotate(-1deg)",
        }}
      >
        {/* pinned at top */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -8,
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          <BrassTack size={18} />
        </div>

        <svg
          viewBox="0 0 400 360"
          width="100%"
          height="auto"
          style={{ overflow: "visible", display: "block" }}
        >
          {/* ── Pencil-line cake ── */}
          <g filter="url(#pencilWobble)">
            {/* Plate */}
            <ellipse
              cx="200"
              cy="320"
              rx="170"
              ry="10"
              fill="none"
              stroke={INK}
              strokeWidth="1.4"
            />

            {/* Bottom tier */}
            <path
              d="M55 318 L55 240 Q 200 220, 345 240 L345 318"
              fill="none"
              stroke={INK}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M55 240 Q 200 252, 345 240"
              fill="none"
              stroke={INK}
              strokeWidth="1.6"
            />

            {/* Mid tier */}
            <path
              d="M95 240 L95 175 Q 200 160, 305 175 L305 240"
              fill="none"
              stroke={INK}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M95 175 Q 200 184, 305 175"
              fill="none"
              stroke={INK}
              strokeWidth="1.6"
            />

            {/* Top tier */}
            <path
              d="M140 175 L140 120 Q 200 110, 260 120 L260 175"
              fill="none"
              stroke={INK}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M140 120 Q 200 128, 260 120"
              fill="none"
              stroke={INK}
              strokeWidth="1.6"
            />

            {/* One single big candle on top */}
            <rect x="194" y="78" width="12" height="38" fill="none" stroke={INK} strokeWidth="1.4" />
            <line x1="200" y1="78" x2="200" y2="68" stroke={INK} strokeWidth="1.2" />
            {/* flame */}
            <path
              d="M200 60 Q 207 68, 204 76 Q 200 80, 196 76 Q 193 68, 200 60 Z"
              fill={ROSE}
              fillOpacity="0.4"
              stroke={INK}
              strokeWidth="1"
            />

            {/* light shading hatches */}
            <g stroke={INK_SOFT} strokeWidth="0.5" opacity="0.45">
              <line x1="70" y1="270" x2="78" y2="305" />
              <line x1="80" y1="272" x2="88" y2="307" />
              <line x1="320" y1="270" x2="328" y2="305" />
              <line x1="105" y1="200" x2="112" y2="225" />
              <line x1="285" y1="200" x2="292" y2="225" />
              <line x1="148" y1="140" x2="154" y2="160" />
              <line x1="245" y1="140" x2="251" y2="160" />
            </g>

            {/* small frosting blob accents */}
            <circle cx="180" cy="234" r="2" fill={ROSE} opacity="0.55" />
            <circle cx="220" cy="232" r="2" fill={ROSE} opacity="0.55" />
            <circle cx="260" cy="240" r="2" fill={ROSE} opacity="0.55" />
            <circle cx="190" cy="170" r="1.6" fill={SAGE} opacity="0.55" />
            <circle cx="225" cy="172" r="1.6" fill={SAGE} opacity="0.55" />
          </g>

          {/* ── Designer's annotation arrows + handwritten labels ── */}
          {/* Annotation: 3 tiers (right side, arrow to top-tier) */}
          <g>
            <path
              d="M340 130 Q 320 130, 290 145"
              stroke={INK_SOFT}
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
              markerEnd="url(#arrowhead)"
              opacity="0.7"
            />
            <text
              x="345"
              y="132"
              fill={INK}
              fontSize="14"
              fontFamily="Caveat, cursive"
              style={{ fontStyle: "italic" }}
            >
              3 tiers
            </text>
          </g>

          {/* Annotation: vanilla bean (left side, arrow to mid) */}
          <g>
            <path
              d="M50 195 Q 75 195, 95 200"
              stroke={INK_SOFT}
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
              markerEnd="url(#arrowhead)"
              opacity="0.7"
            />
            <text
              x="-2"
              y="180"
              fill={INK}
              fontSize="14"
              fontFamily="Caveat, cursive"
              style={{ fontStyle: "italic" }}
            >
              vanilla bean
            </text>
            <text
              x="-2"
              y="196"
              fill={INK_SOFT}
              fontSize="11"
              fontFamily="Caveat, cursive"
            >
              not too sweet
            </text>
          </g>

          {/* Annotation: candle = 14 (top, arrow down-right) */}
          <g>
            <path
              d="M280 50 Q 240 55, 210 64"
              stroke={INK_SOFT}
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
              markerEnd="url(#arrowhead)"
              opacity="0.7"
            />
            <text
              x="282"
              y="44"
              fill={INK}
              fontSize="14"
              fontFamily="Caveat, cursive"
              style={{ fontStyle: "italic" }}
            >
              one big candle
            </text>
            <text
              x="282"
              y="60"
              fill={INK_SOFT}
              fontSize="11"
              fontFamily="Caveat, cursive"
            >
              (instead of fourteen)
            </text>
          </g>

          {/* Annotation: pistachio + rose buttercream (bottom-right of bottom tier) */}
          <g>
            <path
              d="M340 290 Q 320 295, 320 285"
              stroke={INK_SOFT}
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
              markerEnd="url(#arrowhead)"
              opacity="0.7"
            />
            <text
              x="345"
              y="288"
              fill={INK}
              fontSize="13"
              fontFamily="Caveat, cursive"
              style={{ fontStyle: "italic" }}
            >
              pistachio
            </text>
            <text
              x="345"
              y="302"
              fill={INK}
              fontSize="13"
              fontFamily="Caveat, cursive"
              style={{ fontStyle: "italic" }}
            >
              + rose buttercream
            </text>
          </g>

          {/* Cake-board: kraft + twine note (bottom-left) */}
          <g>
            <path
              d="M55 345 Q 75 340, 90 332"
              stroke={INK_SOFT}
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
              markerEnd="url(#arrowhead)"
              opacity="0.7"
            />
            <text
              x="-2"
              y="345"
              fill={INK_SOFT}
              fontSize="11"
              fontFamily="Caveat, cursive"
            >
              kraft + twine
            </text>
          </g>

          {/* arrowhead def */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0 0 L 6 3 L 0 6 z" fill={INK_SOFT} />
            </marker>
          </defs>
        </svg>

        <div
          className={caveatCls}
          style={{
            marginTop: 14,
            fontSize: 18,
            color: INK_SOFT,
            textAlign: "center",
            fontStyle: "italic",
          }}
        >
          fig. 1 — birthday cake, working draft
        </div>
      </motion.div>
    </section>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* Wishes — scrap-paper grid                                              */
/* ───────────────────────────────────────────────────────────────────── */
function WishesGrid({ caveatCls }: { caveatCls: string }) {
  return (
    <section
      style={{
        padding: "10vh 6vw 12vh",
      }}
    >
      <SectionLabel caveatCls={caveatCls} text="seven small wishes" subtext="scraps from the desk" />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "clamp(28px, 4vw, 48px)",
          maxWidth: 1100,
          margin: "5vh auto 0",
          alignItems: "start",
        }}
      >
        {WISHES.map((w, i) => (
          <ScrapNote key={i} wish={w} index={i} caveatCls={caveatCls} />
        ))}
      </div>
    </section>
  );
}

function ScrapNote({
  wish,
  index,
  caveatCls,
}: {
  wish: Wish;
  index: number;
  caveatCls: string;
}) {
  const rot = ((index * 5.3) % 9) - 4.5; // -4.5 → +4.5
  const pinKind: "top-left" | "top-right" | "top-center" =
    index % 3 === 0 ? "top-center" : index % 3 === 1 ? "top-left" : "top-right";

  const paperStyles = paperStyle(wish.paper);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, rotate: 0 }}
      whileInView={{ opacity: 1, y: 0, rotate: rot }}
      viewport={{ once: true, margin: "-8%" }}
      transition={{ duration: 0.7, delay: Math.min(index * 0.06, 0.45) }}
      whileHover={{ y: -4, rotate: 0 }}
      style={{
        position: "relative",
        padding: "22px 22px 26px",
        minHeight: 170,
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.35) inset, 0 12px 24px -12px rgba(42,42,42,0.3), 0 4px 8px -4px rgba(42,42,42,0.18)",
        ...paperStyles.container,
      }}
    >
      <div style={{ position: "absolute", top: -7, ...pinPos(pinKind), zIndex: 5 }}>
        <BrassTack size={14} />
      </div>

      {/* ribbon for index number */}
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: INK_SOFT,
          marginBottom: 10,
          fontFamily: "ui-serif, Georgia, serif",
          fontWeight: 600,
        }}
      >
        no. {String(index + 1).padStart(2, "0")}
      </div>

      <p
        className={caveatCls}
        style={{
          margin: 0,
          color: INK,
          fontSize: paperStyles.fontSize,
          lineHeight: paperStyles.lineHeight,
          letterSpacing: "0.005em",
          ...paperStyles.text,
        }}
      >
        {wish.text}
      </p>

      {/* manila tag string-hole */}
      {wish.paper === "manila" && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: CREAM_DEEP,
            boxShadow: "inset 0 1px 2px rgba(42,42,42,0.4)",
          }}
        />
      )}
    </motion.div>
  );
}

function pinPos(kind: "top-left" | "top-right" | "top-center"): React.CSSProperties {
  if (kind === "top-left") return { left: 12 };
  if (kind === "top-right") return { right: 12 };
  return { left: "50%", transform: "translateX(-50%)" };
}

function paperStyle(kind: PaperKind): {
  container: React.CSSProperties;
  text: React.CSSProperties;
  fontSize: string;
  lineHeight: string;
} {
  switch (kind) {
    case "ruled":
      return {
        container: {
          background: CREAM_PAPER,
          backgroundImage: `linear-gradient(${RULED_BLUE} 1px, transparent 1px)`,
          backgroundSize: "100% 28px",
          backgroundPosition: "0 30px",
          borderLeft: `2px solid ${ROSE}40`,
        },
        text: { paddingLeft: 4 },
        fontSize: "clamp(17px, 2vw, 21px)",
        lineHeight: "28px",
      };
    case "kraft":
      return {
        container: {
          background: KRAFT,
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 4px)",
        },
        text: {},
        fontSize: "clamp(17px, 2vw, 21px)",
        lineHeight: "1.5",
      };
    case "postit":
      return {
        container: {
          background: POSTIT_PINK,
          // top has a 'sticky' band that's slightly darker
          backgroundImage:
            `linear-gradient(180deg, rgba(255,255,255,0.18) 0 14px, transparent 14px), repeating-linear-gradient(0deg, rgba(0,0,0,0.015) 0 1px, transparent 1px 4px)`,
        },
        text: {},
        fontSize: "clamp(17px, 2vw, 21px)",
        lineHeight: "1.5",
      };
    case "manila":
      return {
        container: {
          background: MANILA,
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.02) 0 1px, transparent 1px 3px)",
          // notched corner like a tag
          clipPath:
            "polygon(8% 0, 100% 0, 100% 100%, 0% 100%, 0 8%)",
        },
        text: {},
        fontSize: "clamp(17px, 2vw, 21px)",
        lineHeight: "1.5",
      };
    case "cardstock":
      return {
        container: {
          background: LINEN_WARM,
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 4px)",
          border: `1px solid ${INK}10`,
        },
        text: {},
        fontSize: "clamp(17px, 2vw, 21px)",
        lineHeight: "1.5",
      };
    case "torn":
      return {
        container: {
          background: CREAM_PAPER,
          clipPath:
            "polygon(0% 2%, 6% 0%, 14% 2%, 25% 0%, 38% 2%, 52% 0%, 66% 2%, 78% 0%, 90% 2%, 100% 1%, 99% 14%, 100% 30%, 99% 48%, 100% 64%, 99% 80%, 100% 94%, 96% 100%, 82% 99%, 66% 100%, 50% 99%, 34% 100%, 18% 99%, 4% 100%, 0% 96%, 1% 80%, 0% 64%, 1% 48%, 0% 32%, 1% 16%)",
        },
        text: {},
        fontSize: "clamp(17px, 2vw, 21px)",
        lineHeight: "1.5",
      };
    case "index":
      return {
        container: {
          background: CREAM_PAPER,
          backgroundImage: `linear-gradient(${RULED_BLUE}80 1px, transparent 1px)`,
          backgroundSize: "100% 24px",
          backgroundPosition: "0 28px",
          borderTop: `2px solid ${ROSE}80`,
        },
        text: {},
        fontSize: "clamp(17px, 2vw, 21px)",
        lineHeight: "24px",
      };
  }
}

/* ───────────────────────────────────────────────────────────────────── */
/* Sign-off — manila price-tag with twine                                 */
/* ───────────────────────────────────────────────────────────────────── */
function SignOff({
  caveatCls,
  sacramentoCls,
}: {
  caveatCls: string;
  sacramentoCls: string;
}) {
  return (
    <section
      style={{
        minHeight: "70svh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "8vh 6vw 12vh",
        position: "relative",
      }}
    >
      {/* twine string from above */}
      <motion.svg
        aria-hidden
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 0.8 }}
        width="120"
        height="100"
        viewBox="0 0 120 100"
        style={{ marginBottom: -10 }}
      >
        <path
          d="M60 0 Q 50 30, 60 60 Q 70 80, 60 100"
          stroke={INK_SOFT}
          strokeWidth="1.2"
          fill="none"
          strokeDasharray="3 2"
          opacity="0.6"
        />
      </motion.svg>

      {/* Manila price-tag */}
      <motion.div
        initial={{ opacity: 0, y: -10, rotate: -3 }}
        whileInView={{ opacity: 1, y: 0, rotate: -2 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 0.9 }}
        style={{
          position: "relative",
          width: "min(360px, 88vw)",
          background: MANILA,
          padding: "30px 36px 32px 50px",
          clipPath: "polygon(12% 8%, 100% 0, 100% 100%, 12% 92%, 0 50%)",
          boxShadow:
            "0 18px 36px -16px rgba(42,42,42,0.4), 0 6px 12px -6px rgba(42,42,42,0.24)",
          textAlign: "center",
        }}
      >
        {/* string hole */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: 14,
            transform: "translateY(-50%)",
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: CREAM,
            boxShadow: "inset 0 1px 2px rgba(42,42,42,0.5)",
          }}
        />

        <div
          style={{
            fontSize: "clamp(11px, 1.4vw, 13px)",
            letterSpacing: "0.4em",
            textTransform: "uppercase",
            color: INK,
            fontWeight: 600,
            fontFamily: "ui-serif, Georgia, serif",
          }}
        >
          made with care
        </div>

        <div
          style={{
            marginTop: 4,
            fontSize: "clamp(10px, 1.2vw, 11px)",
            letterSpacing: "0.32em",
            color: INK_SOFT,
            textTransform: "uppercase",
          }}
        >
          no. 5 / 14 / 26
        </div>

        <div
          style={{
            margin: "12px auto",
            width: "70%",
            height: 1,
            background: INK_SOFT,
            opacity: 0.4,
          }}
        />

        <div
          className={sacramentoCls}
          style={{
            fontSize: "clamp(28px, 4.4vw, 38px)",
            color: INK,
            lineHeight: 1.05,
          }}
        >
          happy birthday,
        </div>
        <div
          className={sacramentoCls}
          style={{
            fontSize: "clamp(34px, 5.4vw, 48px)",
            color: ROSE,
            lineHeight: 1.05,
            marginTop: -4,
          }}
        >
          Simren
        </div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.4 }}
        className={caveatCls}
        style={{
          marginTop: "5vh",
          maxWidth: 480,
          textAlign: "center",
          fontSize: "clamp(18px, 2.2vw, 22px)",
          color: INK,
          lineHeight: 1.55,
        }}
      >
        thank you for being the kind of person who makes a board like this
        feel easy to fill.
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.6 }}
        style={{
          marginTop: "3vh",
          fontSize: "clamp(11px, 1.4vw, 13px)",
          letterSpacing: "0.5em",
          textTransform: "uppercase",
          color: INK_SOFT,
          fontWeight: 500,
        }}
      >
        — fin —
      </motion.div>
    </section>
  );
}
