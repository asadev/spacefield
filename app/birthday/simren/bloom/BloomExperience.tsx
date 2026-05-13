"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cormorant_Garamond, Playfair_Display } from "next/font/google";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const accent = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

/* Palette — warm South Asian wedding-card feel */
const PALETTE = {
  cream: "#fbf3e4",
  creamDeep: "#f3e6cd",
  saffron: "#d98a2b",
  saffronLight: "#f1b25b",
  maroon: "#7a1a2f",
  maroonDeep: "#591023",
  teal: "#0e4d4f",
  tealDeep: "#073638",
  ink: "#2a1a12",
  rosegold: "linear-gradient(120deg, #b76e79 0%, #e8b4a3 35%, #d99c8a 60%, #b76e79 100%)",
  gold: "linear-gradient(120deg, #c79a3a 0%, #f1d27a 30%, #e2b85a 55%, #a87922 100%)",
};

const WISHES = [
  "May this year unfold like the first jasmine of the season — quietly, completely, perfuming every room you walk into.",
  "May your laughter be the kind elders bless: full-throated, unguarded, a little scandalous in the best way.",
  "May your work bear fruit so sweet that even the people who underestimated you reach for a second helping.",
  "May love find you the way old ghazals do — slowly, then all at once, and right on the line you needed to hear.",
  "May your kitchen always smell of cardamom, your books always have one bent corner, and your phone always ring on the days you doubt yourself.",
  "May the doors that close this year close cleanly, and the ones that open be tall enough to walk through with your full crown on.",
  "May twenty-six be the year you stop apologising for taking up exactly the space you were born to take.",
];

type Petal = {
  id: number;
  x: number;
  delay: number;
  duration: number;
  drift: number;
  rotate: number;
  scale: number;
  hue: number;
};

// Tiny deterministic PRNG so render is pure but values are varied.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function BloomExperience({ photos }: { photos: string[] }) {
  const [openPhoto, setOpenPhoto] = useState<string | null>(null);
  const [candlesLit, setCandlesLit] = useState(true);
  const [blew, setBlew] = useState(false);

  const petals: Petal[] = useMemo(() => {
    const rnd = mulberry32(0x5117);
    return Array.from({ length: 28 }, (_, i) => ({
      id: i,
      x: rnd() * 100,
      delay: rnd() * 12,
      duration: 14 + rnd() * 14,
      drift: -40 + rnd() * 80,
      rotate: rnd() * 360,
      scale: 0.55 + rnd() * 0.85,
      hue: rnd(),
    }));
  }, []);

  // Mughal arches need stable per-photo seed for slight rotation variance
  const photoMeta = useMemo(
    () =>
      photos.map((src, i) => ({
        src,
        rot: ((i * 53) % 7) - 3,
        delay: i * 0.08,
      })),
    [photos],
  );

  useEffect(() => {
    if (!blew) return;
    const t = setTimeout(() => setCandlesLit(false), 350);
    return () => clearTimeout(t);
  }, [blew]);

  return (
    <div
      className={display.className}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "auto",
        background: `
          radial-gradient(1200px 800px at 15% -10%, ${PALETTE.saffronLight}33 0%, transparent 55%),
          radial-gradient(1000px 700px at 110% 20%, ${PALETTE.maroon}22 0%, transparent 60%),
          radial-gradient(900px 700px at 50% 110%, ${PALETTE.teal}22 0%, transparent 60%),
          linear-gradient(180deg, ${PALETTE.cream} 0%, ${PALETTE.creamDeep} 100%)
        `,
        color: PALETTE.ink,
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* Subtle paper grain */}
      <PaperGrain />

      {/* Drifting marigold petals — fixed layer */}
      <PetalField petals={petals} />

      {/* Decorative top border */}
      <BorderFlourish position="top" />

      {/* HERO */}
      <section
        style={{
          minHeight: "100svh",
          display: "grid",
          placeItems: "center",
          padding: "72px 20px 48px",
          position: "relative",
          textAlign: "center",
        }}
      >
        {/* Henna corner flourishes */}
        <HennaCorner pos="tl" />
        <HennaCorner pos="tr" />
        <HennaCorner pos="bl" />
        <HennaCorner pos="br" />

        <div style={{ maxWidth: 720, position: "relative", zIndex: 2 }}>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            style={{
              fontSize: "clamp(11px, 2.4vw, 13px)",
              letterSpacing: "0.42em",
              textTransform: "uppercase",
              color: PALETTE.maroon,
              marginBottom: 18,
            }}
          >
            14 · May · 2026
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.4, ease: [0.2, 0.7, 0.2, 1] }}
            style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}
          >
            <ArchOrnament />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 0.25, ease: "easeOut" }}
            className={accent.className}
            style={{
              fontSize: "clamp(46px, 11vw, 112px)",
              lineHeight: 0.95,
              fontWeight: 500,
              fontStyle: "italic",
              margin: 0,
              background: PALETTE.rosegold,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              letterSpacing: "-0.01em",
            }}
          >
            Simren Zahra
          </motion.h1>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.4, delay: 0.6 }}
            style={{
              marginTop: 22,
              fontSize: "clamp(18px, 3.8vw, 26px)",
              fontStyle: "italic",
              color: PALETTE.maroonDeep,
              lineHeight: 1.5,
            }}
          >
            with fondest wishes on the day
            <br />
            you came into the world
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 1.6, delay: 0.9 }}
            style={{
              margin: "32px auto 0",
              width: "min(280px, 60vw)",
              height: 1,
              background: `linear-gradient(90deg, transparent, ${PALETTE.saffron}, transparent)`,
            }}
          />
        </div>

        <ScrollHint />
      </section>

      {/* PHOTO GALLERY — Mughal arches */}
      <section style={{ padding: "40px 18px 80px", position: "relative" }}>
        <SectionTitle eyebrow="Album" title="moments, framed" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "clamp(18px, 3vw, 36px)",
            maxWidth: 1180,
            margin: "0 auto",
            padding: "0 4px",
          }}
        >
          {photoMeta.map((p, i) => (
            <motion.button
              key={p.src}
              type="button"
              onClick={() => setOpenPhoto(p.src)}
              initial={{ opacity: 0, y: 30, rotate: p.rot }}
              whileInView={{ opacity: 1, y: 0, rotate: p.rot }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.9, delay: p.delay, ease: "easeOut" }}
              whileHover={{ y: -6, rotate: 0, transition: { duration: 0.4 } }}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                display: "block",
              }}
              aria-label={`Open photo ${i + 1}`}
            >
              <MughalArch src={p.src} index={i} />
            </motion.button>
          ))}
        </div>
      </section>

      {/* CAKE */}
      <section
        style={{
          padding: "60px 16px 100px",
          position: "relative",
          textAlign: "center",
        }}
      >
        <SectionTitle eyebrow="Make a wish" title="the cake awaits" />
        <p
          style={{
            maxWidth: 460,
            margin: "0 auto 28px",
            fontStyle: "italic",
            fontSize: "clamp(15px, 2.6vw, 18px)",
            color: PALETTE.maroon,
            opacity: 0.85,
          }}
        >
          {candlesLit ? (
            <>tap the candles, close your eyes, and wish well</>
          ) : (
            <>your wish is on its way — may it ripen this year</>
          )}
        </p>

        <div
          style={{
            display: "grid",
            placeItems: "center",
            position: "relative",
            margin: "0 auto",
            maxWidth: 460,
          }}
        >
          <Cake
            lit={candlesLit}
            onBlow={() => {
              if (!blew) setBlew(true);
            }}
          />
        </div>
      </section>

      {/* WISHES */}
      <section style={{ padding: "20px 20px 100px", position: "relative" }}>
        <SectionTitle eyebrow="Seven wishes" title="for the year ahead" />
        <div
          style={{
            display: "grid",
            gap: "clamp(18px, 3vw, 28px)",
            maxWidth: 760,
            margin: "0 auto",
          }}
        >
          {WISHES.map((w, i) => (
            <WishCard key={i} index={i} wish={w} />
          ))}
        </div>
      </section>

      {/* CLOSING */}
      <section
        style={{
          padding: "40px 20px 96px",
          textAlign: "center",
          position: "relative",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        >
          <ArchOrnament small />
          <div
            className={accent.className}
            style={{
              fontStyle: "italic",
              fontSize: "clamp(28px, 6vw, 46px)",
              color: PALETTE.maroonDeep,
              marginTop: 20,
              lineHeight: 1.2,
            }}
          >
            Salgirah Mubarak,
            <br />
            Simren.
          </div>
          <div
            style={{
              marginTop: 22,
              fontSize: "clamp(13px, 2.4vw, 15px)",
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color: PALETTE.teal,
            }}
          >
            with love &amp; quiet duas
          </div>
        </motion.div>
      </section>

      <BorderFlourish position="bottom" />

      {/* PHOTO LIGHTBOX */}
      <AnimatePresence>
        {openPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => setOpenPhoto(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(42,26,18,0.86)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              display: "grid",
              placeItems: "center",
              zIndex: 100,
              padding: 24,
              cursor: "zoom-out",
            }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
              style={{
                maxWidth: "min(92vw, 720px)",
                maxHeight: "88vh",
                position: "relative",
              }}
            >
              <MughalArch src={openPhoto} index={0} large />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- subcomponents ---------------- */

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 36 }}>
      <div
        style={{
          fontSize: "clamp(10px, 2vw, 12px)",
          letterSpacing: "0.4em",
          textTransform: "uppercase",
          color: PALETTE.teal,
          marginBottom: 10,
        }}
      >
        ❖ {eyebrow} ❖
      </div>
      <h2
        className={display.className}
        style={{
          margin: 0,
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: "clamp(28px, 6vw, 46px)",
          color: PALETTE.maroonDeep,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h2>
    </div>
  );
}

function MughalArch({
  src,
  index,
  large = false,
}: {
  src: string;
  index: number;
  large?: boolean;
}) {
  // Unique clip-path id per arch so multiple instances render
  const clipId = `arch-clip-${index}-${large ? "lg" : "sm"}`;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "3 / 4.2",
        filter: large
          ? "drop-shadow(0 30px 60px rgba(122,26,47,0.35))"
          : "drop-shadow(0 14px 26px rgba(122,26,47,0.18))",
      }}
    >
      <svg
        width="0"
        height="0"
        style={{ position: "absolute" }}
        aria-hidden
      >
        <defs>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            {/* Mughal pointed arch (cusped/ogee feel) */}
            <path d="M 0.5 0.001 C 0.65 0.02 0.78 0.06 0.88 0.13 C 0.965 0.2 1 0.3 1 0.42 L 1 1 L 0 1 L 0 0.42 C 0 0.3 0.035 0.2 0.12 0.13 C 0.22 0.06 0.35 0.02 0.5 0.001 Z" />
          </clipPath>
        </defs>
      </svg>

      {/* Outer ornate frame */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: PALETTE.gold,
          clipPath: `url(#${clipId})`,
          padding: 0,
        }}
      />
      {/* Inner cream mat */}
      <div
        style={{
          position: "absolute",
          inset: large ? 8 : 5,
          background: PALETTE.cream,
          clipPath: `url(#${clipId})`,
        }}
      />
      {/* Photo */}
      <div
        style={{
          position: "absolute",
          inset: large ? 14 : 10,
          clipPath: `url(#${clipId})`,
          overflow: "hidden",
          background: PALETTE.creamDeep,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>

      {/* Arch keystone ornament */}
      <div
        style={{
          position: "absolute",
          top: large ? -14 : -10,
          left: "50%",
          transform: "translateX(-50%)",
          width: large ? 22 : 16,
          height: large ? 22 : 16,
          background: PALETTE.gold,
          borderRadius: "50%",
          boxShadow: `0 0 0 ${large ? 4 : 3}px ${PALETTE.cream}, 0 0 0 ${large ? 6 : 4}px ${PALETTE.maroon}`,
        }}
      />
    </div>
  );
}

function ArchOrnament({ small = false }: { small?: boolean }) {
  const w = small ? 80 : 120;
  return (
    <svg
      width={w}
      height={w * 0.5}
      viewBox="0 0 120 60"
      fill="none"
      aria-hidden
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="arch-grad" x1="0" x2="1">
          <stop offset="0" stopColor="#b76e79" />
          <stop offset="0.5" stopColor="#e8b4a3" />
          <stop offset="1" stopColor="#b76e79" />
        </linearGradient>
      </defs>
      <path
        d="M 10 58 Q 10 14, 60 6 Q 110 14, 110 58"
        stroke="url(#arch-grad)"
        strokeWidth="1.2"
        fill="none"
      />
      <circle cx="60" cy="6" r="3" fill={PALETTE.maroon} />
      <circle cx="60" cy="6" r="1.4" fill={PALETTE.cream} />
      <path
        d="M 30 58 Q 30 30, 60 26 Q 90 30, 90 58"
        stroke={PALETTE.saffron}
        strokeWidth="0.8"
        fill="none"
        opacity="0.7"
      />
    </svg>
  );
}

function HennaCorner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const transform = {
    tl: "scale(1,1)",
    tr: "scale(-1,1)",
    bl: "scale(1,-1)",
    br: "scale(-1,-1)",
  }[pos];
  const placement: React.CSSProperties =
    pos === "tl"
      ? { top: 0, left: 0 }
      : pos === "tr"
        ? { top: 0, right: 0 }
        : pos === "bl"
          ? { bottom: 0, left: 0 }
          : { bottom: 0, right: 0 };

  return (
    <motion.svg
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 0.55, scale: 1 }}
      transition={{ duration: 1.6, delay: 0.4, ease: "easeOut" }}
      width={180}
      height={180}
      viewBox="0 0 180 180"
      fill="none"
      aria-hidden
      style={{
        position: "absolute",
        ...placement,
        pointerEvents: "none",
        transform,
      }}
    >
      <g stroke={PALETTE.maroon} strokeWidth="1" fill="none" opacity="0.9">
        {/* main vine */}
        <path d="M 8 8 Q 60 12, 80 50 Q 92 78, 130 92" />
        {/* paisley */}
        <path d="M 28 28 Q 50 24, 56 44 Q 60 60, 44 64 Q 30 60, 28 48 Z" />
        <path d="M 36 38 Q 46 38, 48 48" />
        {/* leaf cluster */}
        <path d="M 70 22 Q 78 30, 70 38 Q 62 30, 70 22 Z" />
        <path d="M 90 32 Q 98 40, 90 48 Q 82 40, 90 32 Z" />
        <path d="M 110 50 Q 118 58, 110 66 Q 102 58, 110 50 Z" />
        {/* secondary curl */}
        <path d="M 14 60 Q 36 70, 38 90 Q 38 108, 22 110" />
        <circle cx="22" cy="110" r="2" fill={PALETTE.saffron} stroke="none" />
        <circle cx="38" cy="90" r="1.6" fill={PALETTE.saffron} stroke="none" />
        {/* dots */}
        <circle cx="56" cy="20" r="1.4" fill={PALETTE.maroon} stroke="none" />
        <circle cx="68" cy="14" r="1.2" fill={PALETTE.maroon} stroke="none" />
        <circle cx="80" cy="20" r="1" fill={PALETTE.maroon} stroke="none" />
        <circle cx="120" cy="80" r="1.4" fill={PALETTE.maroon} stroke="none" />
        <circle cx="135" cy="92" r="1.6" fill={PALETTE.saffron} stroke="none" />
        {/* small flowers */}
        <g transform="translate(50,80)">
          <circle r="2" fill={PALETTE.saffron} stroke="none" />
          <circle cx="6" cy="0" r="1.6" fill="none" stroke={PALETTE.maroon} />
          <circle cx="-6" cy="0" r="1.6" fill="none" stroke={PALETTE.maroon} />
          <circle cx="0" cy="6" r="1.6" fill="none" stroke={PALETTE.maroon} />
          <circle cx="0" cy="-6" r="1.6" fill="none" stroke={PALETTE.maroon} />
        </g>
      </g>
    </motion.svg>
  );
}

function BorderFlourish({ position }: { position: "top" | "bottom" }) {
  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0.5 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ duration: 1.6, ease: "easeOut" }}
      style={{
        height: 28,
        width: "100%",
        background: `repeating-linear-gradient(90deg,
          ${PALETTE.maroon} 0 1px,
          transparent 1px 12px,
          ${PALETTE.saffron} 12px 13px,
          transparent 13px 24px)`,
        opacity: 0.4,
        borderTop: position === "bottom" ? `1px solid ${PALETTE.maroon}33` : "none",
        borderBottom: position === "top" ? `1px solid ${PALETTE.maroon}33` : "none",
      }}
    />
  );
}

function ScrollHint() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.2, delay: 1.6 }}
      style={{
        position: "absolute",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        fontSize: 11,
        letterSpacing: "0.3em",
        textTransform: "uppercase",
        color: PALETTE.teal,
        textAlign: "center",
      }}
    >
      <motion.div
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        scroll
      </motion.div>
    </motion.div>
  );
}

function PaperGrain() {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 1,
        opacity: 0.06,
        mixBlendMode: "multiply",
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.16 0 0 0 0 0.1 0 0 0 0 0.07 0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      }}
    />
  );
}

function PetalField({ petals }: { petals: Petal[] }) {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2,
        overflow: "hidden",
      }}
    >
      {petals.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: "-12vh", x: 0, opacity: 0, rotate: p.rotate }}
          animate={{
            y: "112vh",
            x: p.drift,
            opacity: [0, 0.85, 0.85, 0],
            rotate: p.rotate + 360,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "linear",
            times: [0, 0.1, 0.85, 1],
          }}
          style={{
            position: "absolute",
            top: 0,
            left: `${p.x}%`,
            width: 18 * p.scale,
            height: 18 * p.scale,
          }}
        >
          <Petal hue={p.hue} />
        </motion.div>
      ))}
    </div>
  );
}

function Petal({ hue }: { hue: number }) {
  // Marigold range: deep saffron → orange → pale gold
  const fills = [
    "#e8a23a",
    "#d97a1f",
    "#f1b25b",
    "#c9621a",
    "#eab455",
  ];
  const fill = fills[Math.floor(hue * fills.length)];
  return (
    <svg viewBox="0 0 20 20" width="100%" height="100%">
      <g transform="translate(10,10)">
        {Array.from({ length: 8 }).map((_, i) => (
          <ellipse
            key={i}
            cx="0"
            cy="-5"
            rx="2.2"
            ry="4.5"
            fill={fill}
            opacity="0.85"
            transform={`rotate(${(i * 360) / 8})`}
          />
        ))}
        <circle r="2" fill="#7a3a0c" />
      </g>
    </svg>
  );
}

function Cake({ lit, onBlow }: { lit: boolean; onBlow: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 1.2, ease: "easeOut" }}
      style={{ width: "min(420px, 88vw)", cursor: lit ? "pointer" : "default" }}
      onClick={onBlow}
      role="button"
      aria-label="Blow out the candles"
    >
      <svg viewBox="0 0 400 460" width="100%" height="auto" aria-hidden>
        <defs>
          <linearGradient id="cake-tier1" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fbeede" />
            <stop offset="1" stopColor="#e8c9a3" />
          </linearGradient>
          <linearGradient id="cake-tier2" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#f8e0d8" />
            <stop offset="1" stopColor="#d99c8a" />
          </linearGradient>
          <linearGradient id="cake-tier3" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#7a1a2f" />
            <stop offset="1" stopColor="#4a0e1d" />
          </linearGradient>
          <linearGradient id="gold-trim" x1="0" x2="1">
            <stop offset="0" stopColor="#a87922" />
            <stop offset="0.5" stopColor="#f1d27a" />
            <stop offset="1" stopColor="#a87922" />
          </linearGradient>
          <radialGradient id="flame-grad" cx="0.5" cy="0.7" r="0.6">
            <stop offset="0" stopColor="#fff8c2" />
            <stop offset="0.5" stopColor="#ffb84a" />
            <stop offset="1" stopColor="#ff5a1a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="plate" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#e2b85a" />
            <stop offset="1" stopColor="#a87922" />
          </linearGradient>
        </defs>

        {/* Cake plate */}
        <ellipse cx="200" cy="438" rx="180" ry="14" fill="url(#plate)" />
        <ellipse cx="200" cy="434" rx="170" ry="10" fill="#f1d27a" />
        <ellipse cx="200" cy="432" rx="155" ry="6" fill="#fbeede" opacity="0.4" />

        {/* Bottom tier (maroon) */}
        <rect x="60" y="320" width="280" height="110" rx="6" fill="url(#cake-tier3)" />
        <ellipse cx="200" cy="320" rx="140" ry="14" fill="#591023" />
        <ellipse cx="200" cy="320" rx="140" ry="14" fill="url(#gold-trim)" opacity="0.4" />
        {/* gold scallop trim bottom tier */}
        <g fill="url(#gold-trim)">
          {Array.from({ length: 14 }).map((_, i) => (
            <circle key={i} cx={70 + i * 20} cy={428} r="5" />
          ))}
        </g>
        {/* maroon piping pattern */}
        <g stroke="url(#gold-trim)" strokeWidth="1.4" fill="none" opacity="0.85">
          <path d="M 70 350 Q 90 340, 110 350 T 150 350 T 190 350 T 230 350 T 270 350 T 310 350 T 330 350" />
          <path d="M 70 380 Q 90 370, 110 380 T 150 380 T 190 380 T 230 380 T 270 380 T 310 380 T 330 380" />
          <path d="M 70 410 Q 90 400, 110 410 T 150 410 T 190 410 T 230 410 T 270 410 T 310 410 T 330 410" />
        </g>
        {/* gold dots between piping */}
        <g fill="url(#gold-trim)">
          {[340, 370, 400].flatMap((y) =>
            Array.from({ length: 8 }).map((_, i) => (
              <circle key={`${y}-${i}`} cx={90 + i * 32} cy={y - 15} r="1.6" />
            )),
          )}
        </g>

        {/* Middle tier (rose) */}
        <rect x="100" y="220" width="200" height="100" rx="5" fill="url(#cake-tier2)" />
        <ellipse cx="200" cy="220" rx="100" ry="12" fill="#d99c8a" />
        <ellipse cx="200" cy="220" rx="100" ry="12" fill="url(#gold-trim)" opacity="0.35" />
        {/* gold drip / trim */}
        <g fill="url(#gold-trim)">
          {Array.from({ length: 12 }).map((_, i) => {
            const x = 108 + i * 16;
            const h = 4 + ((i * 7) % 9);
            return (
              <path
                key={i}
                d={`M ${x} 232 Q ${x + 4} ${232 + h}, ${x + 8} 232 L ${x + 8} 224 L ${x} 224 Z`}
              />
            );
          })}
        </g>
        {/* roses on middle tier */}
        <g>
          <Rose cx={140} cy={270} r={10} />
          <Rose cx={200} cy={290} r={11} />
          <Rose cx={260} cy={270} r={10} />
          <Rose cx={170} cy={300} r={7} />
          <Rose cx={230} cy={300} r={7} />
        </g>

        {/* Top tier (cream w/ gold filigree) */}
        <rect x="140" y="140" width="120" height="80" rx="4" fill="url(#cake-tier1)" />
        <ellipse cx="200" cy="140" rx="60" ry="9" fill="#e8c9a3" />
        <ellipse cx="200" cy="140" rx="60" ry="9" fill="url(#gold-trim)" opacity="0.35" />
        {/* filigree */}
        <g stroke="url(#gold-trim)" strokeWidth="1" fill="none" opacity="0.9">
          <path d="M 150 165 Q 160 160, 170 165 Q 180 170, 190 165 Q 200 160, 210 165 Q 220 170, 230 165 Q 240 160, 250 165" />
          <path d="M 150 195 Q 160 190, 170 195 Q 180 200, 190 195 Q 200 190, 210 195 Q 220 200, 230 195 Q 240 190, 250 195" />
          <path d="M 200 175 m -5 0 a 5 5 0 1 0 10 0 a 5 5 0 1 0 -10 0" />
        </g>
        {/* gold scallop top tier */}
        <g fill="url(#gold-trim)">
          {Array.from({ length: 7 }).map((_, i) => (
            <circle key={i} cx={148 + i * 17} cy={218} r="3.5" />
          ))}
        </g>

        {/* Candles on top */}
        {[170, 200, 230].map((cx, i) => (
          <g key={cx}>
            {/* candle body */}
            <rect
              x={cx - 4}
              y={92}
              width="8"
              height="48"
              fill="#fbeede"
              stroke="#7a1a2f"
              strokeWidth="0.6"
            />
            {/* candle stripes */}
            <line x1={cx - 4} y1={104} x2={cx + 4} y2={104} stroke="#7a1a2f" strokeWidth="0.5" />
            <line x1={cx - 4} y1={120} x2={cx + 4} y2={120} stroke="#7a1a2f" strokeWidth="0.5" />
            {/* wick */}
            <line x1={cx} y1={92} x2={cx} y2={86} stroke="#2a1a12" strokeWidth="1" />

            {/* flame */}
            <AnimatePresence>
              {lit && (
                <motion.g
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.3, y: -10 }}
                  transition={{
                    duration: 0.6,
                    delay: i * 0.12,
                  }}
                >
                  <motion.ellipse
                    cx={cx}
                    cy={78}
                    rx={6}
                    ry={10}
                    fill="url(#flame-grad)"
                    animate={{
                      ry: [10, 11.5, 9.5, 10],
                      cx: [cx, cx + 0.6, cx - 0.4, cx],
                    }}
                    transition={{
                      duration: 0.8 + i * 0.07,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                  <motion.ellipse
                    cx={cx}
                    cy={80}
                    rx={3}
                    ry={5}
                    fill="#fff8c2"
                    animate={{ ry: [5, 6, 4.5, 5] }}
                    transition={{
                      duration: 0.7 + i * 0.05,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                  {/* glow */}
                  <circle cx={cx} cy={80} r={20} fill="#ffb84a" opacity={0.18} />
                </motion.g>
              )}
            </AnimatePresence>

            {/* Smoke after blowing */}
            <AnimatePresence>
              {!lit && (
                <motion.g
                  initial={{ opacity: 0.7, y: 0 }}
                  animate={{ opacity: 0, y: -40 }}
                  transition={{ duration: 2.4, delay: i * 0.15 }}
                >
                  <path
                    d={`M ${cx} 86 Q ${cx + 4} 76, ${cx - 2} 66 Q ${cx + 5} 56, ${cx} 46`}
                    stroke="#888"
                    strokeWidth="1.4"
                    fill="none"
                    opacity="0.55"
                  />
                </motion.g>
              )}
            </AnimatePresence>
          </g>
        ))}
      </svg>
    </motion.div>
  );
}

function Rose({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      <circle r={r} fill="#b76e79" />
      <circle r={r * 0.75} fill="#c98a92" cx={-r * 0.15} cy={-r * 0.15} />
      <circle r={r * 0.5} fill="#d9a4ab" cx={r * 0.1} cy={-r * 0.05} />
      <circle r={r * 0.25} fill="#f1d0d4" cx={-r * 0.05} cy={r * 0.1} />
      {/* leaves */}
      <ellipse
        rx={r * 0.55}
        ry={r * 0.3}
        cx={-r * 0.9}
        cy={r * 0.4}
        fill="#0e4d4f"
        transform={`rotate(-30 ${-r * 0.9} ${r * 0.4})`}
        opacity="0.8"
      />
      <ellipse
        rx={r * 0.55}
        ry={r * 0.3}
        cx={r * 0.9}
        cy={r * 0.4}
        fill="#0e4d4f"
        transform={`rotate(30 ${r * 0.9} ${r * 0.4})`}
        opacity="0.8"
      />
    </g>
  );
}

function WishCard({ index, wish }: { index: number; wish: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 1, delay: 0.05 * index, ease: "easeOut" }}
      style={{
        position: "relative",
        background: `linear-gradient(180deg, ${PALETTE.cream} 0%, #fff8ea 100%)`,
        borderRadius: 4,
        padding: "32px 28px 30px",
        boxShadow: `0 1px 0 ${PALETTE.saffron}33,
                    0 18px 40px rgba(122,26,47,0.10),
                    inset 0 0 0 1px ${PALETTE.saffron}33`,
      }}
    >
      {/* Inner gold border */}
      <div
        style={{
          position: "absolute",
          inset: 8,
          border: `1px solid ${PALETTE.saffron}55`,
          borderRadius: 2,
          pointerEvents: "none",
        }}
      />
      {/* corner ornaments */}
      <CornerOrn pos="tl" />
      <CornerOrn pos="tr" />
      <CornerOrn pos="bl" />
      <CornerOrn pos="br" />

      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.4em",
          textTransform: "uppercase",
          color: PALETTE.teal,
          marginBottom: 12,
          textAlign: "center",
        }}
      >
        ❖ Wish No. {romanize(index + 1)} ❖
      </div>
      <div
        style={{
          fontSize: "clamp(17px, 3vw, 21px)",
          lineHeight: 1.55,
          fontStyle: "italic",
          color: PALETTE.maroonDeep,
          textAlign: "center",
          fontWeight: 400,
        }}
      >
        {wish}
      </div>
    </motion.div>
  );
}

function CornerOrn({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const transform = {
    tl: "scale(1,1)",
    tr: "scale(-1,1)",
    bl: "scale(1,-1)",
    br: "scale(-1,-1)",
  }[pos];
  const placement: React.CSSProperties =
    pos === "tl"
      ? { top: 4, left: 4 }
      : pos === "tr"
        ? { top: 4, right: 4 }
        : pos === "bl"
          ? { bottom: 4, left: 4 }
          : { bottom: 4, right: 4 };

  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 28 28"
      aria-hidden
      style={{ position: "absolute", ...placement, transform, opacity: 0.7 }}
    >
      <g stroke={PALETTE.maroon} strokeWidth="0.8" fill="none">
        <path d="M 4 4 Q 14 6, 14 14" />
        <circle cx="4" cy="4" r="1.4" fill={PALETTE.saffron} stroke="none" />
        <circle cx="14" cy="14" r="1.2" fill={PALETTE.saffron} stroke="none" />
        <path d="M 6 6 Q 10 6, 10 10" />
      </g>
    </svg>
  );
}

function romanize(n: number): string {
  const map: Array<[number, string]> = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let s = "";
  for (const [v, r] of map) {
    while (n >= v) {
      s += r;
      n -= v;
    }
  }
  return s;
}
