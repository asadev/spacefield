"use client";

import { Cinzel, Cormorant_Garamond } from "next/font/google";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useMemo, useRef } from "react";

const display = Cinzel({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const body = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  display: "swap",
});

/* -------------------------------------------------------------------------- */
/*  Tokens                                                                    */
/* -------------------------------------------------------------------------- */

const INK_DEEP = "#050a1a";
const INK_NAVY = "#0a1428";
const GOLD = "#d4a949";
const GOLD_BRIGHT = "#e9c87a";
const CREAM = "#efe4c7";

const HAIR = "rgba(212,169,73,0.55)";
const HAIR_FAINT = "rgba(212,169,73,0.28)";
const GHOST = "rgba(212,169,73,0.10)";
const GRID_DOT = "rgba(212,169,73,0.10)";
const STAR_BASE = "rgba(239,228,199,";

/* -------------------------------------------------------------------------- */
/*  Chart geometry                                                            */
/* -------------------------------------------------------------------------- */

const VB_W = 1000;
const VB_H = 1400;

type Body = {
  i: number;
  cx: number;
  cy: number;
  r: number;
  label: string;
  coord: string;
};

const BODIES: Body[] = [
  { i: 0, cx: 200, cy: 380, r: 70, label: "URSA SIMRA", coord: "14° 26′ N" },
  { i: 1, cx: 380, cy: 250, r: 60, label: "LUMEN PRIMA", coord: "22° 04′ E" },
  { i: 2, cx: 580, cy: 200, r: 55, label: "STELLA CORDIS", coord: "31° 18′ N" },
  { i: 3, cx: 760, cy: 320, r: 65, label: "CORONA ZAHRA", coord: "09° 47′ W" },
  { i: 4, cx: 500, cy: 480, r: 90, label: "NUCLEUS · ASCENDANT", coord: "0° 00′" },
  { i: 5, cx: 280, cy: 700, r: 60, label: "VESPER LUNA", coord: "17° 52′ S" },
  { i: 6, cx: 720, cy: 720, r: 60, label: "IGNIS DULCIS", coord: "08° 11′ E" },
  { i: 7, cx: 460, cy: 920, r: 65, label: "AURIGA NOVA", coord: "25° 39′ N" },
  { i: 8, cx: 600, cy: 1100, r: 55, label: "CAUDA AETERNA", coord: "12° 03′ S" },
];

const LINES: [number, number][] = [
  [0, 1], [1, 2], [2, 3],
  [0, 4], [4, 3],
  [4, 5], [4, 6],
  [5, 7], [6, 7],
  [7, 8],
];

/* -------------------------------------------------------------------------- */
/*  Seeded star field (deterministic — no Math.random in render)              */
/* -------------------------------------------------------------------------- */

function seededStars(count: number, seed: number) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  const out: { x: number; y: number; r: number; o: number; glint: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    const x = rnd() * VB_W;
    const y = rnd() * VB_H;
    const r = 0.6 + rnd() * 1.0;
    const o = 0.25 + rnd() * 0.30; // 0.25–0.55 (cap per spec)
    const glint = i < Math.min(8, Math.floor(count / 12));
    out.push({ x, y, r, o, glint });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Wishes                                                                    */
/* -------------------------------------------------------------------------- */

type Wish = { numeral: string; eyebrow: string; body: string };
const WISHES: Wish[] = [
  {
    numeral: "I",
    eyebrow: "FIRST READING · OF THE NATAL HOUR",
    body: "The chart marks an auspicious convergence; the moon, having waited politely all night, takes her position above your horizon. What this means, plainly: the year ahead has been preparing the room before your arrival. Step into it.",
  },
  {
    numeral: "II",
    eyebrow: "SECOND READING · OF THE INNER CONSTELLATION",
    body: "Stars that did not believe in themselves have been observed, this season, beginning to. The astronomers — & here we mean the people who have always loved you — record this with quiet relief. Continue.",
  },
  {
    numeral: "III",
    eyebrow: "THIRD READING · OF THE WORK OF THE HANDS",
    body: "Mars in your seventh house indicates labour rewarded; not loudly, but in the manner of a tide returning a thing thought lost. Make what you mean to make. The instruments are tuned in your favour.",
  },
  {
    numeral: "IV",
    eyebrow: "FOURTH READING · OF KIND COMPANY",
    body: "The chart shows three close-orbiting bodies — friendship, family, & a love yet to be named. Treat each as you would a rare star: notice it, record it, do not assume it will return on its own.",
  },
  {
    numeral: "V",
    eyebrow: "FIFTH READING · OF REST",
    body: "Venus, that patient planet, advises against the fashionable virtue of exhaustion. You are permitted to sleep. You are permitted to do nothing on a Tuesday. The cosmos has prepared no test for which rest is the wrong answer.",
  },
  {
    numeral: "VI",
    eyebrow: "SIXTH READING · OF SOFTNESS",
    body: "Soft things, the chart insists, are not small things. The reed bends; the stone does not; & yet only one of them survives the river. Be reed-like; be river-like; be, in any case, exactly what you already are.",
  },
  {
    numeral: "VII",
    eyebrow: "SEVENTH READING · OF THE YEAR ITSELF",
    body: "Twenty-six is a long, slow exhale. The astrologers — & here we mean those of us who have done the looking — predict a year that arrives the way good light does: quietly, on its own schedule, & all at once into the room you happen to be standing in.",
  },
];

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function ConstellationExperience({ photos }: { photos: string[] }) {
  const reduce = useReducedMotion();
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Map photos to bodies (cycle if fewer than 9; gracefully handle 0)
  const pics = useMemo(() => {
    if (photos.length === 0) return [] as string[];
    const out: string[] = [];
    for (let i = 0; i < BODIES.length; i++) out.push(photos[i % photos.length]);
    return out;
  }, [photos]);

  // Two star sets — desktop 120, mobile 60. Toggled via CSS media query inside the SVG.
  const starsField = useMemo(() => seededStars(120, 0xc0ffee), []);
  const starsMobile = useMemo(() => seededStars(60, 0xc0ffee), []);

  // Scroll-driven micro-motion (hero chart sticky behind content)
  const { scrollYProgress } = useScroll({ container: scrollerRef });
  const chartScale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [1, 1.05]);
  const fieldOpacity = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [1, 0.5]);

  const hasPhotos = pics.length > 0;

  return (
    <div
      ref={scrollerRef}
      className={display.className}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "auto",
        background: `radial-gradient(ellipse at 50% 35%, ${INK_NAVY} 0%, ${INK_DEEP} 80%)`,
        color: CREAM,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* ============================================================ */}
      {/*  HERO — sticky chart with title overlay                      */}
      {/* ============================================================ */}
      <section
        style={{
          position: "relative",
          minHeight: "100vh",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 16px",
          boxSizing: "border-box",
        }}
      >
        <ChartCanvas
          pics={pics}
          starsDesktop={starsField}
          starsMobile={starsMobile}
          chartScale={chartScale}
          fieldOpacity={fieldOpacity}
          reduce={!!reduce}
          hasPhotos={hasPhotos}
        />
        <HeroTitle reduce={!!reduce} />
      </section>

      {/* ============================================================ */}
      {/*  LEGEND                                                       */}
      {/* ============================================================ */}
      <Section title="A LEGEND" subtitle="Names assigned to the visible bodies, recorded in order of brightness.">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "20px 36px",
            maxWidth: 880,
            margin: "0 auto",
          }}
        >
          {BODIES.map((b) => (
            <div
              key={b.i}
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                borderBottom: `1px dashed ${HAIR_FAINT}`,
                paddingBottom: 10,
                gap: 12,
              }}
            >
              <span style={{ fontFamily: display.style.fontFamily, fontSize: 12, letterSpacing: "0.3em", color: GOLD_BRIGHT }}>
                {b.label}
              </span>
              <span className={body.className} style={{ fontStyle: "italic", color: CREAM, opacity: 0.78, fontSize: 15 }}>
                {b.coord}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  THE READING — 7 wishes                                       */}
      {/* ============================================================ */}
      <Section title="THE READING" subtitle="Seven observations, transcribed for the recipient on the fourteenth of May, MMXXVI.">
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 64 }}>
          {WISHES.map((w) => (
            <WishCard key={w.numeral} wish={w} reduce={!!reduce} />
          ))}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  MARGINALIA — Cake                                            */}
      {/* ============================================================ */}
      <Section title="MARGINALIA" subtitle="A small constellation observed at the edge of the chart.">
        <CakeMarginalia />
        <p
          className={body.className}
          style={{
            textAlign: "center",
            fontStyle: "italic",
            color: CREAM,
            opacity: 0.82,
            fontSize: 18,
            maxWidth: 520,
            margin: "32px auto 0",
            lineHeight: 1.5,
          }}
        >
          Constellatio Tortae — A small confection observed at noon. The astrologers
          recommend you make a wish; they decline, on principle, to predict its outcome.
        </p>
      </Section>

      {/* ============================================================ */}
      {/*  COLOPHON                                                     */}
      {/* ============================================================ */}
      <footer
        style={{
          padding: "80px 16px 120px",
          textAlign: "center",
          borderTop: `1px solid ${HAIR_FAINT}`,
          marginTop: 64,
        }}
      >
        <Diamond />
        <div
          style={{
            fontFamily: display.style.fontFamily,
            fontSize: 11,
            letterSpacing: "0.5em",
            color: GOLD,
            marginTop: 18,
          }}
        >
          COMPILED BY HAND · BOUND IN GOLD
        </div>
        <div
          className={body.className}
          style={{
            fontStyle: "italic",
            color: CREAM,
            opacity: 0.7,
            fontSize: 15,
            marginTop: 10,
            letterSpacing: "0.04em",
          }}
        >
          for Simren Zahra · MMXXVI
        </div>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function HeroTitle({ reduce }: { reduce: boolean }) {
  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.0 }}
      style={{
        position: "relative",
        zIndex: 5,
        textAlign: "center",
        padding: "0 16px",
        pointerEvents: "none",
        maxWidth: 720,
      }}
    >
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4, ease }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.5em",
            color: GOLD,
            marginBottom: 16,
          }}
        >
          · OBSERVED ON THE FOURTEENTH OF MAY ·
        </div>
        <RuleWithDiamond />
      </motion.div>

      <motion.h1
        initial={reduce ? false : { opacity: 0, letterSpacing: "0.32em" }}
        animate={{ opacity: 1, letterSpacing: "0.18em" }}
        transition={{ duration: 0.7, delay: 0.55, ease }}
        style={{
          fontSize: "clamp(22px, 5.5vw, 44px)",
          fontWeight: 600,
          lineHeight: 1.15,
          margin: "18px 0 6px",
          color: CREAM,
        }}
      >
        THE SIMREN ZAHRA
      </motion.h1>

      <motion.div
        initial={reduce ? false : { opacity: 0, letterSpacing: "0.34em" }}
        animate={{ opacity: 1, letterSpacing: "0.2em" }}
        transition={{ duration: 0.7, delay: 0.63, ease }}
        style={{
          fontSize: "clamp(28px, 7vw, 64px)",
          fontWeight: 700,
          lineHeight: 1.05,
          color: GOLD_BRIGHT,
          textShadow: `0 0 24px rgba(233,200,122,0.18)`,
        }}
      >
        CELESTIAL CHART
      </motion.div>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.71, ease }}
        style={{
          marginTop: 18,
          fontSize: "clamp(11px, 2.2vw, 14px)",
          letterSpacing: "0.42em",
          color: GOLD,
        }}
      >
        MAY · XIV · MMXXVI
      </motion.div>

      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.85 }}
        style={{ marginTop: 22 }}
      >
        <RuleWithDiamond />
      </motion.div>
    </motion.div>
  );
}

function RuleWithDiamond() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
      <span style={{ width: 56, height: 1, background: GOLD, opacity: 0.7 }} />
      <span style={{ color: GOLD_BRIGHT, fontSize: 10 }}>◆</span>
      <span style={{ width: 56, height: 1, background: GOLD, opacity: 0.7 }} />
    </div>
  );
}

function Diamond() {
  return (
    <span style={{ color: GOLD_BRIGHT, fontSize: 14, letterSpacing: "0.4em" }}>◆ · ◆</span>
  );
}

/* ------------------------------ Chart canvas ----------------------------- */

function ChartCanvas({
  pics,
  starsDesktop,
  starsMobile,
  chartScale,
  fieldOpacity,
  reduce,
  hasPhotos,
}: {
  pics: string[];
  starsDesktop: ReturnType<typeof seededStars>;
  starsMobile: ReturnType<typeof seededStars>;
  chartScale: ReturnType<typeof useTransform<number, number>>;
  fieldOpacity: ReturnType<typeof useTransform<number, number>>;
  reduce: boolean;
  hasPhotos: boolean;
}) {
  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <motion.div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        scale: chartScale,
      }}
    >
      <motion.div
        style={{
          position: "relative",
          width: "min(100%, calc((100vh - 64px) * 0.714))",
          aspectRatio: `${VB_W} / ${VB_H}`,
          maxWidth: 920,
        }}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0 }}
      >
        {/* Background star field — desktop */}
        <motion.svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{
            position: "absolute",
            inset: 0,
            opacity: fieldOpacity,
            pointerEvents: "none",
          }}
          aria-hidden
        >
          {/* Mobile star set (≤640px) */}
          <g className="stars-mobile">
            {starsMobile.map((s, i) => (
              <Star key={`m${i}`} s={s} />
            ))}
          </g>
          {/* Desktop star set (>640px) */}
          <g className="stars-desktop">
            {starsDesktop.map((s, i) => (
              <Star key={`d${i}`} s={s} />
            ))}
          </g>
        </motion.svg>

        {/* Main chart SVG */}
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ position: "absolute", inset: 0 }}
          aria-label="Celestial chart"
        >
          {/* Outer ornament frame */}
          <motion.rect
            x={48}
            y={48}
            width={VB_W - 96}
            height={VB_H - 96}
            fill="none"
            stroke={GOLD}
            strokeWidth={1.2}
            initial={reduce ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.15, ease }}
          />
          {/* Inner hairline frame */}
          <motion.rect
            x={64}
            y={64}
            width={VB_W - 128}
            height={VB_H - 128}
            fill="none"
            stroke={HAIR_FAINT}
            strokeWidth={0.6}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.45 }}
          />
          {/* Corner cross marks */}
          {[
            [64, 64],
            [VB_W - 64, 64],
            [64, VB_H - 64],
            [VB_W - 64, VB_H - 64],
          ].map(([x, y], i) => (
            <g key={i} stroke={GOLD} strokeWidth={1}>
              <line x1={x - 8} y1={y} x2={x + 8} y2={y} />
              <line x1={x} y1={y - 8} x2={x} y2={y + 8} />
            </g>
          ))}

          {/* Coordinate dot grid */}
          <g fill={GRID_DOT}>
            {Array.from({ length: 11 }).map((_, gx) =>
              Array.from({ length: 15 }).map((_, gy) => {
                const x = 80 + gx * ((VB_W - 160) / 10);
                const y = 80 + gy * ((VB_H - 160) / 14);
                return <circle key={`g${gx}-${gy}`} cx={x} cy={y} r={0.6} />;
              })
            )}
          </g>

          {/* Meridian arcs */}
          <motion.g
            stroke={GHOST}
            strokeWidth={0.5}
            fill="none"
            strokeDasharray="2 5"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 2.2 }}
          >
            {[280, 460, 620].map((r, i) => (
              <circle key={i} cx={500} cy={700} r={r} />
            ))}
          </motion.g>

          {/* Compass rose */}
          <motion.g
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 2.2 }}
          >
            <CompassRose cx={820} cy={160} r={56} />
          </motion.g>

          {/* Constellation hairlines */}
          {LINES.map(([a, b], i) => {
            const A = BODIES[a];
            const B = BODIES[b];
            const dx = B.cx - A.cx;
            const dy = B.cy - A.cy;
            const len = Math.sqrt(dx * dx + dy * dy);
            // Trim each line by the body radii so it lands on the rim, not the centre
            const ux = dx / len;
            const uy = dy / len;
            const x1 = A.cx + ux * (A.r + 4);
            const y1 = A.cy + uy * (A.r + 4);
            const x2 = B.cx - ux * (B.r + 4);
            const y2 = B.cy - uy * (B.r + 4);
            return (
              <motion.line
                key={`L${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={HAIR}
                strokeWidth={0.7}
                strokeLinecap="round"
                initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.9, delay: 1.5 + i * 0.08, ease }}
              />
            );
          })}

          {/* Body backing rings + tick marks + labels (frames) */}
          {BODIES.map((bdy, i) => (
            <BodyFrame key={`f${i}`} body={bdy} reduce={reduce} delay={0.8 + i * 0.05} />
          ))}

          {/* Cake marginalia (in-chart) */}
          <motion.g
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 2.0 }}
          >
            <CakeInChart />
          </motion.g>
        </svg>

        {/* HTML photo overlays — absolutely positioned to match SVG circles */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {BODIES.map((bdy, i) => (
            <PhotoBody
              key={`p${i}`}
              body={bdy}
              src={pics[i] ?? null}
              reduce={reduce}
              hasPhotos={hasPhotos}
              delay={1.1 + i * 0.05}
            />
          ))}
        </div>

        {/* Per-spec mobile/desktop star toggle */}
        <style>{`
          .stars-mobile { display: block; }
          .stars-desktop { display: none; }
          @media (min-width: 641px) {
            .stars-mobile { display: none; }
            .stars-desktop { display: block; }
          }
        `}</style>
      </motion.div>
    </motion.div>
  );
}

function Star({ s }: { s: { x: number; y: number; r: number; o: number; glint: boolean } }) {
  return (
    <g>
      <circle cx={s.x} cy={s.y} r={s.r} fill={`${STAR_BASE}${s.o.toFixed(2)})`} />
      {s.glint && (
        <g stroke={`${STAR_BASE}0.85)`} strokeWidth={0.4} opacity={0.85}>
          <line x1={s.x - 4} y1={s.y} x2={s.x + 4} y2={s.y} />
          <line x1={s.x} y1={s.y - 4} x2={s.x} y2={s.y + 4} />
        </g>
      )}
    </g>
  );
}

function CompassRose({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g stroke={GOLD} strokeWidth={0.7} fill="none" opacity={0.85}>
      <circle cx={cx} cy={cy} r={r} />
      <circle cx={cx} cy={cy} r={r * 0.6} strokeDasharray="2 3" />
      <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} />
      <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} />
      <line x1={cx - r * 0.7} y1={cy - r * 0.7} x2={cx + r * 0.7} y2={cy + r * 0.7} strokeDasharray="1 3" />
      <line x1={cx + r * 0.7} y1={cy - r * 0.7} x2={cx - r * 0.7} y2={cy + r * 0.7} strokeDasharray="1 3" />
      {/* N E S W */}
      <text x={cx} y={cy - r - 6} fontFamily="serif" fontSize={9} fill={GOLD_BRIGHT} textAnchor="middle" stroke="none" letterSpacing={1}>N</text>
      <text x={cx + r + 8} y={cy + 3} fontFamily="serif" fontSize={9} fill={GOLD_BRIGHT} textAnchor="middle" stroke="none" letterSpacing={1}>E</text>
      <text x={cx} y={cy + r + 12} fontFamily="serif" fontSize={9} fill={GOLD_BRIGHT} textAnchor="middle" stroke="none" letterSpacing={1}>S</text>
      <text x={cx - r - 8} y={cy + 3} fontFamily="serif" fontSize={9} fill={GOLD_BRIGHT} textAnchor="middle" stroke="none" letterSpacing={1}>W</text>
    </g>
  );
}

function BodyFrame({ body, reduce, delay }: { body: Body; reduce: boolean; delay: number }) {
  const ease = [0.22, 1, 0.36, 1] as const;
  // 8 tick marks just outside the rim
  const ticks = Array.from({ length: 8 }).map((_, k) => {
    const a = (Math.PI * 2 * k) / 8;
    const r1 = body.r + 8;
    const r2 = body.r + 14;
    return {
      x1: body.cx + Math.cos(a) * r1,
      y1: body.cy + Math.sin(a) * r1,
      x2: body.cx + Math.cos(a) * r2,
      y2: body.cy + Math.sin(a) * r2,
    };
  });

  // Label arc path (curved beneath the body)
  const labelR = body.r + 22;
  const arcPathId = `arc-${body.i}`;
  const ax1 = body.cx - labelR;
  const ay1 = body.cy;
  const ax2 = body.cx + labelR;
  const ay2 = body.cy;
  // Lower half arc: sweep flag 1 to curve below
  const arcD = `M ${ax1} ${ay1} A ${labelR} ${labelR} 0 0 0 ${ax2} ${ay2}`;

  return (
    <motion.g
      initial={reduce ? false : { opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay, ease }}
      style={{ transformOrigin: `${body.cx}px ${body.cy}px`, transformBox: "fill-box" }}
    >
      {/* backing soft fill */}
      <circle cx={body.cx} cy={body.cy} r={body.r + 6} fill="rgba(239,228,199,0.04)" />
      {/* outer gold ring */}
      <circle cx={body.cx} cy={body.cy} r={body.r + 6} fill="none" stroke={GOLD} strokeWidth={1.2} />
      {/* inner faint ring */}
      <circle cx={body.cx} cy={body.cy} r={body.r} fill="none" stroke={HAIR_FAINT} strokeWidth={0.5} />
      {/* tick marks */}
      <g stroke={HAIR} strokeWidth={0.7} strokeLinecap="round">
        {ticks.map((t, k) => (
          <line key={k} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
        ))}
      </g>
      {/* hidden arc for text path */}
      <path id={arcPathId} d={arcD} fill="none" stroke="none" />
      {/* label on arc */}
      <text fontFamily="serif" fontSize={11} fill={GOLD_BRIGHT} letterSpacing={1.4} stroke="none">
        <textPath href={`#${arcPathId}`} startOffset="50%" textAnchor="middle">
          {body.label}
        </textPath>
      </text>
      {/* coord, straight, beneath the label arc */}
      <text
        x={body.cx}
        y={body.cy + body.r + 38}
        fontFamily="serif"
        fontSize={10}
        fill={GOLD}
        letterSpacing={1.2}
        textAnchor="middle"
        stroke="none"
        opacity={0.92}
      >
        {body.coord}
      </text>
    </motion.g>
  );
}

function PhotoBody({
  body,
  src,
  reduce,
  hasPhotos,
  delay,
}: {
  body: Body;
  src: string | null;
  reduce: boolean;
  hasPhotos: boolean;
  delay: number;
}) {
  // Convert SVG coords → percentage of overlay box
  const left = (body.cx / VB_W) * 100;
  const top = (body.cy / VB_H) * 100;
  const sizePct = (body.r * 2) / VB_W * 100;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay }}
      style={{
        position: "absolute",
        left: `${left}%`,
        top: `${top}%`,
        width: `${sizePct}%`,
        aspectRatio: "1 / 1",
        transform: "translate(-50%, -50%)",
        clipPath: "circle(50%)",
        WebkitClipPath: "circle(50%)",
        background: "rgba(239,228,199,0.04)",
        overflow: "hidden",
      }}
    >
      {src && hasPhotos ? (
        <img
          src={src}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            filter: "saturate(0.9) contrast(0.96) sepia(0.08)",
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "serif",
            fontSize: 10,
            color: GOLD,
            letterSpacing: "0.3em",
            opacity: 0.6,
            textAlign: "center",
            padding: 8,
          }}
        >
          ✦
        </div>
      )}
    </motion.div>
  );
}

function CakeInChart() {
  // Tiny cake mini-constellation in bottom-left margin
  const ox = 140;
  const oy = 1240;
  const dots = [
    { x: ox - 18, y: oy + 10 },
    { x: ox - 6, y: oy + 6 },
    { x: ox + 6, y: oy + 6 },
    { x: ox + 18, y: oy + 10 },
    { x: ox, y: oy - 10 }, // candle flame
  ];
  return (
    <g>
      {/* connecting hairlines */}
      <g stroke={HAIR_FAINT} strokeWidth={0.6}>
        <line x1={dots[0].x} y1={dots[0].y} x2={dots[1].x} y2={dots[1].y} />
        <line x1={dots[1].x} y1={dots[1].y} x2={dots[2].x} y2={dots[2].y} />
        <line x1={dots[2].x} y1={dots[2].y} x2={dots[3].x} y2={dots[3].y} />
        <line x1={dots[1].x} y1={dots[1].y} x2={dots[4].x} y2={dots[4].y} />
        <line x1={dots[2].x} y1={dots[2].y} x2={dots[4].x} y2={dots[4].y} />
      </g>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={1.6} fill={GOLD_BRIGHT} />
      ))}
      {/* bracket */}
      <g stroke={GOLD} strokeWidth={0.6} opacity={0.7}>
        <line x1={ox + 36} y1={oy} x2={ox + 70} y2={oy - 30} />
        <line x1={ox + 70} y1={oy - 30} x2={ox + 80} y2={oy - 30} />
      </g>
      <text
        x={ox + 84}
        y={oy - 26}
        fontFamily="serif"
        fontStyle="italic"
        fontSize={11}
        fill="rgba(239,228,199,0.78)"
        stroke="none"
      >
        Constellatio Tortae
      </text>
    </g>
  );
}

/* ------------------------------ Section + Wish --------------------------- */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ padding: "120px 16px 64px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 56 }}>
        <RuleWithDiamond />
        <h2
          style={{
            fontFamily: display.style.fontFamily,
            fontSize: "clamp(18px, 3vw, 24px)",
            fontWeight: 600,
            letterSpacing: "0.5em",
            color: GOLD_BRIGHT,
            margin: "20px 0 12px",
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className={body.className}
            style={{
              fontStyle: "italic",
              color: CREAM,
              opacity: 0.72,
              maxWidth: 560,
              margin: "0 auto",
              fontSize: 16,
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function WishCard({ wish, reduce }: { wish: Wish; reduce: boolean }) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      style={{
        textAlign: "center",
        padding: "0 8px",
      }}
    >
      <div
        style={{
          fontFamily: display.style.fontFamily,
          fontSize: "clamp(36px, 5vw, 56px)",
          fontWeight: 700,
          color: GOLD_BRIGHT,
          letterSpacing: "0.12em",
          lineHeight: 1,
          marginBottom: 14,
        }}
      >
        {wish.numeral}
      </div>
      <div
        style={{
          fontFamily: display.style.fontFamily,
          fontSize: 11,
          letterSpacing: "0.4em",
          color: GOLD,
          marginBottom: 22,
        }}
      >
        {wish.eyebrow}
      </div>
      <p
        className={body.className}
        style={{
          fontStyle: "italic",
          fontSize: "clamp(18px, 2.4vw, 24px)",
          lineHeight: 1.55,
          color: CREAM,
          margin: "0 auto",
          maxWidth: 620,
        }}
      >
        {wish.body}
      </p>
      <div style={{ marginTop: 28 }}>
        <span style={{ display: "inline-block", width: 64, height: 1, background: GOLD, opacity: 0.5 }} />
      </div>
    </motion.div>
  );
}

function CakeMarginalia() {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <svg width="220" height="220" viewBox="0 0 220 220" aria-hidden>
        {/* hairlines */}
        <g stroke={HAIR_FAINT} strokeWidth={0.8}>
          <line x1="50" y1="150" x2="90" y2="135" />
          <line x1="90" y1="135" x2="130" y2="135" />
          <line x1="130" y1="135" x2="170" y2="150" />
          <line x1="90" y1="135" x2="110" y2="80" />
          <line x1="130" y1="135" x2="110" y2="80" />
        </g>
        {/* dots */}
        {[
          [50, 150],
          [90, 135],
          [130, 135],
          [170, 150],
          [110, 80],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={3} fill={GOLD_BRIGHT} />
            <circle cx={x} cy={y} r={6} fill="none" stroke={GOLD} strokeWidth={0.6} opacity={0.6} />
          </g>
        ))}
        {/* glow above the flame star */}
        <circle cx={110} cy={80} r={16} fill="none" stroke={GOLD} strokeWidth={0.4} opacity={0.4} strokeDasharray="2 3" />
      </svg>
    </div>
  );
}
