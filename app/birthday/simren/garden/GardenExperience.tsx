"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

/* ---------- palette ---------- */
const C = {
  cream: "#fbf4e6",
  creamDeep: "#f3e8d2",
  paper: "#f6ecd6",
  sage: "#a7bf9d",
  sageDeep: "#7e9a78",
  sageInk: "#3f5a3e",
  peach: "#f3b59a",
  peachDeep: "#d98b73",
  rose: "#d99aa6",
  roseDeep: "#b8697a",
  butter: "#f1d68a",
  ink: "#3d2f24",
  inkSoft: "#5e4a3a",
  twine: "#8b6a45",
  wood: "#b58860",
};

const WISHES = [
  "May this year wear your name better than any year before.",
  "May the small things stay small and the right things grow loud.",
  "May the people who matter find their way to your door.",
  "May your laugh stay exactly the way it is.",
  "May the version of you a year from now thank the version of you today.",
  "May you be soft where you want to be and steel where you have to be.",
  "May the world be a little kinder than it has to be — to you, especially.",
];

/* ---------- root ---------- */
export default function GardenExperience({ photos }: { photos: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        overflowX: "hidden",
        background: C.cream,
        color: C.ink,
        fontFamily: '"Cormorant Garamond", "Georgia", ui-serif, serif',
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <PaperGrain />
      <SunDapple />
      <DriftingPetals reduced={!!reduced} />

      <Hero />
      <BloomBand reduced={!!reduced} />
      <PolaroidTable photos={photos} />
      <CakeSection reduced={!!reduced} />
      <WishesTwine />
      <Closing />

      <FontImports />
    </div>
  );
}

/* ---------- background layers ---------- */

function PaperGrain() {
  // Subtle warm paper texture using two stacked SVG noise layers.
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        backgroundImage: `
          radial-gradient(1200px 800px at 20% 10%, rgba(255,235,200,0.55), transparent 60%),
          radial-gradient(900px 700px at 80% 30%, rgba(243,181,154,0.18), transparent 65%),
          radial-gradient(1100px 900px at 50% 100%, rgba(167,191,157,0.22), transparent 60%),
          url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.30 0 0 0 0 0.22 0 0 0 0 0.14 0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")
        `,
        backgroundSize: "auto, auto, auto, 220px 220px",
        mixBlendMode: "multiply",
      }}
    />
  );
}

function SunDapple() {
  // Soft, slowly-shifting sunlight through leaves.
  return (
    <motion.div
      aria-hidden
      animate={{ opacity: [0.55, 0.8, 0.55] }}
      transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 1,
        backgroundImage: `
          radial-gradient(280px 220px at 12% 18%, rgba(255,236,180,0.45), transparent 70%),
          radial-gradient(220px 180px at 78% 12%, rgba(255,224,170,0.38), transparent 70%),
          radial-gradient(360px 280px at 60% 78%, rgba(255,236,180,0.30), transparent 70%)
        `,
      }}
    />
  );
}

/* slow-drifting petals across the whole page (parallax-ish) */
function DriftingPetals({ reduced }: { reduced: boolean }) {
  const petals = useMemo(() => {
    const arr: { x: number; delay: number; dur: number; size: number; hue: number; sway: number }[] = [];
    for (let i = 0; i < 18; i++) {
      arr.push({
        x: Math.random() * 100,
        delay: Math.random() * 18,
        dur: 22 + Math.random() * 18,
        size: 10 + Math.random() * 14,
        hue: Math.random(),
        sway: 30 + Math.random() * 50,
      });
    }
    return arr;
  }, []);

  if (reduced) return null;

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
      {petals.map((p, i) => {
        const fill = p.hue < 0.4 ? C.rose : p.hue < 0.75 ? C.peach : C.butter;
        return (
          <motion.div
            key={i}
            initial={{ y: -40, x: 0, rotate: 0, opacity: 0 }}
            animate={{
              y: ["-5%", "110vh"],
              x: [0, p.sway, -p.sway, 0],
              rotate: [0, 180, 360],
              opacity: [0, 0.85, 0.85, 0],
            }}
            transition={{
              duration: p.dur,
              delay: p.delay,
              repeat: Infinity,
              ease: "linear",
              times: [0, 0.1, 0.9, 1],
            }}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              width: p.size,
              height: p.size,
              willChange: "transform",
            }}
          >
            <Petal fill={fill} />
          </motion.div>
        );
      })}
    </div>
  );
}

function Petal({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%">
      <path
        d="M12 2 C 17 6, 19 12, 12 22 C 5 12, 7 6, 12 2 Z"
        fill={fill}
        opacity={0.85}
      />
      <path
        d="M12 4 C 14 9, 14 15, 12 20"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="0.6"
        fill="none"
      />
    </svg>
  );
}

/* ---------- hero ---------- */

function Hero() {
  return (
    <section
      style={{
        position: "relative",
        zIndex: 5,
        minHeight: "100svh",
        display: "grid",
        placeItems: "center",
        padding: "calc(env(safe-area-inset-top, 0) + 6vh) 6vw 8vh",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 720 }}>
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          style={{
            fontFamily: '"Caveat", "Bradley Hand", cursive',
            fontSize: "clamp(18px, 4.2vw, 24px)",
            color: C.sageInk,
            letterSpacing: "0.02em",
            marginBottom: "1.2rem",
          }}
        >
          May 14, 2026
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.6, delay: 0.2, ease: "easeOut" }}
          style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontWeight: 500,
            fontStyle: "italic",
            fontSize: "clamp(44px, 11vw, 96px)",
            lineHeight: 1.02,
            margin: 0,
            color: C.ink,
            textShadow: "0 1px 0 rgba(255,255,255,0.5)",
          }}
        >
          Happy Birthday,
          <br />
          <span
            style={{
              fontFamily: '"Caveat", cursive',
              fontStyle: "normal",
              color: C.roseDeep,
              fontSize: "1.05em",
            }}
          >
            Simren
          </span>
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.6, delay: 1.0 }}
          style={{
            marginTop: "1.6rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            color: C.inkSoft,
            fontStyle: "italic",
            fontSize: "clamp(15px, 3.4vw, 18px)",
          }}
        >
          <Sprig />
          <span>a little garden, grown for you</span>
          <Sprig flip />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 0.7, y: 0 }}
          transition={{ duration: 1.4, delay: 1.6 }}
          style={{
            marginTop: "8vh",
            fontFamily: '"Caveat", cursive',
            fontSize: 18,
            color: C.sageInk,
          }}
        >
          ↓ scroll, the flowers are waiting
        </motion.div>
      </div>
    </section>
  );
}

function Sprig({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 80 24"
      width="64"
      height="20"
      style={{ transform: flip ? "scaleX(-1)" : undefined, opacity: 0.85 }}
    >
      <path
        d="M2 12 C 18 12, 32 8, 78 12"
        stroke={C.sageDeep}
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="20" cy="9" rx="5" ry="2.4" fill={C.sage} transform="rotate(-25 20 9)" />
      <ellipse cx="34" cy="7" rx="5" ry="2.4" fill={C.sage} transform="rotate(-15 34 7)" />
      <ellipse cx="50" cy="9" rx="5" ry="2.4" fill={C.sageDeep} transform="rotate(-5 50 9)" />
      <ellipse cx="64" cy="11" rx="5" ry="2.4" fill={C.sage} transform="rotate(5 64 11)" />
    </svg>
  );
}

/* ---------- bloom band: flowers grow as the section enters view ---------- */

function BloomBand({ reduced }: { reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  // We use scrollYProgress to drive a CSS variable on the section
  // so each flower can read it for staggered bloom.
  const groundOpacity = useTransform(scrollYProgress, [0, 0.3], [0, 1]);

  return (
    <section
      ref={ref}
      style={{
        position: "relative",
        zIndex: 5,
        minHeight: "70svh",
        padding: "8vh 0 4vh",
      }}
    >
      <div
        style={{
          textAlign: "center",
          padding: "0 6vw 4vh",
          color: C.sageInk,
          fontStyle: "italic",
          fontSize: "clamp(18px, 4.2vw, 22px)",
        }}
      >
        a meadow that opens, a little, when you look at it.
      </div>

      <motion.div
        style={{
          position: "relative",
          height: "clamp(260px, 42vh, 420px)",
          opacity: groundOpacity,
        }}
      >
        <Meadow scrollProgress={scrollYProgress} reduced={reduced} />
      </motion.div>
    </section>
  );
}

function Meadow({
  scrollProgress,
  reduced,
}: {
  scrollProgress: ReturnType<typeof useScroll>["scrollYProgress"];
  reduced: boolean;
}) {
  // Build a deterministic set of flowers across the band.
  const flowers = useMemo(() => {
    const list: { x: number; y: number; scale: number; kind: 0 | 1 | 2; rot: number; bloom: number }[] = [];
    const n = 22;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      // pseudo-random but stable
      const seed = Math.sin(i * 9.13) * 43758.5453;
      const r = (k: number) => {
        const v = Math.sin(seed + k * 12.9898) * 43758.5453;
        return v - Math.floor(v);
      };
      list.push({
        x: t * 100 + (r(1) - 0.5) * 6,
        y: 30 + r(2) * 60,
        scale: 0.7 + r(3) * 0.7,
        kind: (Math.floor(r(4) * 3) as 0 | 1 | 2),
        rot: (r(5) - 0.5) * 30,
        bloom: 0.15 + r(6) * 0.55, // when in scroll progress they bloom
      });
    }
    return list;
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* grass line */}
      <svg
        viewBox="0 0 1000 200"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "60%",
        }}
      >
        <path
          d="M0 160 C 200 130, 400 180, 600 145 S 1000 150, 1000 160 L 1000 200 L 0 200 Z"
          fill={C.sage}
          opacity="0.55"
        />
        <path
          d="M0 175 C 220 155, 420 185, 620 165 S 1000 170, 1000 175 L 1000 200 L 0 200 Z"
          fill={C.sageDeep}
          opacity="0.65"
        />
        {/* grass blades */}
        {Array.from({ length: 60 }).map((_, i) => {
          const x = (i / 60) * 1000 + ((i * 7919) % 11) - 5;
          const h = 8 + ((i * 13) % 14);
          return (
            <path
              key={i}
              d={`M${x} 170 q 1.2 -${h} 2.4 0`}
              stroke={C.sageDeep}
              strokeWidth="1"
              fill="none"
              opacity="0.7"
            />
          );
        })}
      </svg>

      {flowers.map((f, i) => (
        <Flower
          key={i}
          flower={f}
          scrollProgress={scrollProgress}
          reduced={reduced}
        />
      ))}
    </div>
  );
}

function Flower({
  flower,
  scrollProgress,
  reduced,
}: {
  flower: { x: number; y: number; scale: number; kind: 0 | 1 | 2; rot: number; bloom: number };
  scrollProgress: ReturnType<typeof useScroll>["scrollYProgress"];
  reduced: boolean;
}) {
  // Bloom maps progress relative to flower's individual bloom point.
  const bloom = useTransform(scrollProgress, (p) => {
    if (reduced) return 1;
    const start = flower.bloom;
    const end = Math.min(1, start + 0.25);
    if (p <= start) return 0;
    if (p >= end) return 1;
    return (p - start) / (end - start);
  });
  const scale = useTransform(bloom, [0, 1], [0, flower.scale]);
  const stem = useTransform(bloom, [0, 0.6], [0.05, 1]);

  return (
    <div
      style={{
        position: "absolute",
        left: `${flower.x}%`,
        bottom: `${flower.y - 30}px`,
        transform: `translateX(-50%)`,
        transformOrigin: "bottom center",
      }}
    >
      {/* stem */}
      <motion.svg
        viewBox="0 0 12 60"
        width={12 * flower.scale}
        height={60 * flower.scale}
        style={{ display: "block", scaleY: stem, transformOrigin: "bottom center" }}
      >
        <path d="M6 60 C 4 40, 8 20, 6 0" stroke={C.sageDeep} strokeWidth="1.4" fill="none" />
        <ellipse cx="3" cy="38" rx="3" ry="1.4" fill={C.sage} transform="rotate(-30 3 38)" />
        <ellipse cx="9" cy="26" rx="3" ry="1.4" fill={C.sage} transform="rotate(30 9 26)" />
      </motion.svg>

      {/* head */}
      <motion.div
        style={{
          position: "absolute",
          left: "50%",
          bottom: `${56 * flower.scale}px`,
          translateX: "-50%",
          scale,
          rotate: flower.rot,
        }}
      >
        <FlowerHead kind={flower.kind} />
      </motion.div>
    </div>
  );
}

function FlowerHead({ kind }: { kind: 0 | 1 | 2 }) {
  if (kind === 0) {
    // daisy
    return (
      <svg viewBox="0 0 40 40" width="36" height="36">
        {Array.from({ length: 8 }).map((_, i) => (
          <ellipse
            key={i}
            cx="20"
            cy="9"
            rx="3.4"
            ry="7"
            fill={C.cream}
            stroke="rgba(0,0,0,0.04)"
            transform={`rotate(${i * 45} 20 20)`}
          />
        ))}
        <circle cx="20" cy="20" r="4" fill={C.butter} />
      </svg>
    );
  }
  if (kind === 1) {
    // cosmos / pink
    return (
      <svg viewBox="0 0 40 40" width="34" height="34">
        {Array.from({ length: 6 }).map((_, i) => (
          <path
            key={i}
            d="M20 20 C 14 14, 14 6, 20 4 C 26 6, 26 14, 20 20 Z"
            fill={C.rose}
            opacity="0.95"
            transform={`rotate(${i * 60} 20 20)`}
          />
        ))}
        <circle cx="20" cy="20" r="3" fill={C.butter} />
      </svg>
    );
  }
  // poppy / peach
  return (
    <svg viewBox="0 0 40 40" width="32" height="32">
      {Array.from({ length: 5 }).map((_, i) => (
        <path
          key={i}
          d="M20 20 C 12 16, 12 4, 20 6 C 28 4, 28 16, 20 20 Z"
          fill={C.peach}
          transform={`rotate(${i * 72} 20 20)`}
        />
      ))}
      <circle cx="20" cy="20" r="3.5" fill={C.peachDeep} />
      <circle cx="20" cy="20" r="1.6" fill={C.ink} />
    </svg>
  );
}

/* ---------- polaroid table ---------- */

function PolaroidTable({ photos }: { photos: string[] }) {
  // Pre-compute scattered positions (deterministic).
  const layout = useMemo(() => {
    return photos.map((src, i) => {
      const seed = i + 1;
      const r = (k: number) => {
        const v = Math.sin(seed * 99.7 + k * 12.9898) * 43758.5453;
        return v - Math.floor(v);
      };
      return {
        src,
        rot: (r(1) - 0.5) * 18,
        tape: Math.floor(r(2) * 3) as 0 | 1 | 2,
        nudgeX: (r(3) - 0.5) * 16, // px
        nudgeY: (r(4) - 0.5) * 16,
      };
    });
  }, [photos]);

  return (
    <section
      style={{
        position: "relative",
        zIndex: 5,
        padding: "10vh 5vw 8vh",
      }}
    >
      <SectionTitle eyebrow="the table" title="moments, pinned" />
      {/* wood-table backdrop */}
      <div
        style={{
          position: "relative",
          margin: "4vh auto 0",
          maxWidth: 1100,
          borderRadius: 18,
          padding: "clamp(20px, 5vw, 56px) clamp(14px, 4vw, 40px)",
          background: `
            repeating-linear-gradient(
              90deg,
              ${C.wood} 0px,
              ${C.wood} 2px,
              #a87a55 2px,
              #a87a55 5px,
              ${C.wood} 5px,
              ${C.wood} 64px,
              #c89770 64px,
              #c89770 67px,
              ${C.wood} 67px,
              ${C.wood} 140px
            )
          `,
          boxShadow:
            "0 30px 60px rgba(80,50,20,0.18), inset 0 0 80px rgba(80,40,15,0.18)",
          overflow: "hidden",
        }}
      >
        {/* wood grain noise overlay */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.02 0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>")`,
            mixBlendMode: "multiply",
            opacity: 0.25,
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 40vw), 1fr))",
            gap: "clamp(18px, 3.4vw, 36px)",
            justifyItems: "center",
          }}
        >
          {layout.map((p, i) => (
            <Polaroid
              key={p.src}
              src={p.src}
              rot={p.rot}
              tape={p.tape}
              nudgeX={p.nudgeX}
              nudgeY={p.nudgeY}
              index={i}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Polaroid({
  src,
  rot,
  tape,
  nudgeX,
  nudgeY,
  index,
}: {
  src: string;
  rot: number;
  tape: 0 | 1 | 2;
  nudgeX: number;
  nudgeY: number;
  index: number;
}) {
  const [hover, setHover] = useState(false);
  const tapeColors = [C.peach, C.rose, C.sage];
  const tapeColor = tapeColors[tape];
  return (
    <motion.figure
      initial={{ opacity: 0, y: 24, rotate: rot }}
      whileInView={{ opacity: 1, y: 0, rotate: rot }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.8, delay: (index % 6) * 0.06, ease: "easeOut" }}
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      animate={{ rotate: hover ? rot * 0.3 : rot, y: hover ? -6 : 0 }}
      style={{
        position: "relative",
        width: "clamp(180px, 30vw, 240px)",
        margin: 0,
        padding: "12px 12px 36px",
        background: "#fdfaf2",
        borderRadius: 4,
        boxShadow:
          "0 12px 22px rgba(60,40,20,0.22), 0 2px 4px rgba(60,40,20,0.18)",
        transform: `translate(${nudgeX}px, ${nudgeY}px)`,
        cursor: "default",
      }}
    >
      {/* washi tape */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: -10,
          left: "50%",
          transform: "translateX(-50%) rotate(-6deg)",
          width: 70,
          height: 18,
          background: tapeColor,
          opacity: 0.78,
          boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
          borderLeft: "1px dashed rgba(255,255,255,0.5)",
          borderRight: "1px dashed rgba(255,255,255,0.5)",
        }}
      />
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 1",
          overflow: "hidden",
          background: "#eadfca",
          borderRadius: 2,
        }}
      >
        {/* plain <img> so EXIF orientation is honored */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            // very mild warm filter to sell the polaroid feel
            filter: "saturate(0.95) contrast(0.98) sepia(0.06)",
          }}
        />
      </div>
    </motion.figure>
  );
}

/* ---------- cake ---------- */

function CakeSection({ reduced }: { reduced: boolean }) {
  const [blown, setBlown] = useState<boolean[]>([false, false, false, false, false]);
  const allOut = blown.every(Boolean);

  function blow(i: number) {
    setBlown((prev) => {
      if (prev[i]) return prev;
      const next = [...prev];
      next[i] = true;
      return next;
    });
  }

  function relight() {
    setBlown([false, false, false, false, false]);
  }

  return (
    <section
      style={{
        position: "relative",
        zIndex: 5,
        padding: "10vh 6vw 6vh",
        textAlign: "center",
      }}
    >
      <SectionTitle eyebrow="make a wish" title="the cake" />
      <p
        style={{
          maxWidth: 520,
          margin: "1.6rem auto 3rem",
          color: C.inkSoft,
          fontStyle: "italic",
          fontSize: "clamp(15px, 3.4vw, 18px)",
        }}
      >
        tap each candle.
      </p>

      <div
        style={{
          position: "relative",
          margin: "0 auto",
          maxWidth: 520,
        }}
      >
        <Cake blown={blown} onBlow={blow} reduced={reduced} />
      </div>

      <motion.div
        initial={false}
        animate={{ opacity: allOut ? 1 : 0, y: allOut ? 0 : 8 }}
        transition={{ duration: 0.6 }}
        style={{
          marginTop: "2.5rem",
          fontFamily: '"Caveat", cursive',
          fontSize: "clamp(22px, 5vw, 30px)",
          color: C.roseDeep,
          minHeight: 60,
        }}
      >
        {allOut && (
          <>
            wish made.
            <button
              onClick={relight}
              style={{
                marginLeft: 14,
                background: "transparent",
                border: `1px solid ${C.sageDeep}`,
                color: C.sageInk,
                padding: "6px 14px",
                borderRadius: 999,
                fontFamily: '"Caveat", cursive',
                fontSize: 18,
                cursor: "pointer",
              }}
            >
              relight
            </button>
          </>
        )}
      </motion.div>
    </section>
  );
}

function Cake({
  blown,
  onBlow,
  reduced,
}: {
  blown: boolean[];
  onBlow: (i: number) => void;
  reduced: boolean;
}) {
  // Naked cake: two layers with cream filling, frosting roses on top, candles in the cake.
  const candleX = [120, 175, 230, 285, 340]; // along the top of the cake
  const candleTop = 92; // y coordinate where candles sit (in the cake)

  return (
    <svg
      viewBox="0 0 460 360"
      width="100%"
      style={{ display: "block", maxWidth: 480, margin: "0 auto", overflow: "visible" }}
    >
      <defs>
        <radialGradient id="plateGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="100%" stopColor="#e9dcc5" />
        </radialGradient>
        <linearGradient id="cakeBody" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#e7c79a" />
          <stop offset="100%" stopColor="#c79a66" />
        </linearGradient>
        <linearGradient id="cream" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#fff7e3" />
          <stop offset="100%" stopColor="#f3e1b8" />
        </linearGradient>
        <radialGradient id="flameGrad" cx="50%" cy="60%" r="50%">
          <stop offset="0%" stopColor="#fff5b8" />
          <stop offset="60%" stopColor="#ffb347" />
          <stop offset="100%" stopColor="#e07b2c" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* plate */}
      <ellipse cx="230" cy="320" rx="200" ry="22" fill="url(#plateGrad)" opacity="0.95" />
      <ellipse cx="230" cy="320" rx="200" ry="22" fill="none" stroke="#c8b48b" opacity="0.6" />

      {/* lower tier */}
      <g>
        <rect x="80" y="200" width="300" height="110" rx="8" fill="url(#cakeBody)" />
        {/* sponge crumb texture */}
        {Array.from({ length: 60 }).map((_, i) => (
          <circle
            key={`l${i}`}
            cx={86 + (i * 13) % 290}
            cy={208 + Math.floor((i * 13) / 290) * 18 + ((i * 7) % 8)}
            r={1.2 + ((i * 17) % 5) * 0.3}
            fill="#a07645"
            opacity="0.35"
          />
        ))}
        {/* cream filling */}
        <rect x="80" y="248" width="300" height="14" fill="url(#cream)" />
        <path
          d="M80 248 q 10 -6 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0"
          stroke="#fff8e6"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M80 262 q 10 6 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0"
          stroke="#e9d2a3"
          strokeWidth="1.4"
          fill="none"
        />
      </g>

      {/* upper tier */}
      <g>
        <rect x="120" y="110" width="220" height="100" rx="6" fill="url(#cakeBody)" />
        {Array.from({ length: 40 }).map((_, i) => (
          <circle
            key={`u${i}`}
            cx={126 + (i * 13) % 210}
            cy={118 + Math.floor((i * 13) / 210) * 18 + ((i * 7) % 8)}
            r={1.2 + ((i * 17) % 5) * 0.3}
            fill="#a07645"
            opacity="0.35"
          />
        ))}
        {/* upper cream filling */}
        <rect x="120" y="158" width="220" height="12" fill="url(#cream)" />
        <path
          d="M120 158 q 10 -5 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0"
          stroke="#fff8e6"
          strokeWidth="1.6"
          fill="none"
        />
        {/* top frosting band */}
        <path
          d="M120 110 q 11 -8 22 0 t 22 0 t 22 0 t 22 0 t 22 0 t 22 0 t 22 0 t 22 0 t 22 0 t 22 0"
          stroke="#fff7e3"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
      </g>

      {/* frosting roses on top */}
      <FrostingRose cx={150} cy={108} color={C.rose} size={1.0} />
      <FrostingRose cx={185} cy={104} color={C.peach} size={0.9} />
      <FrostingRose cx={262} cy={104} color={C.rose} size={1.0} />
      <FrostingRose cx={310} cy={108} color={C.peach} size={1.05} />
      {/* sage leaves between roses */}
      <path d="M210 110 q 8 -8 18 -2" stroke={C.sageDeep} strokeWidth="2" fill="none" />
      <ellipse cx="218" cy="106" rx="5" ry="2" fill={C.sage} transform="rotate(-20 218 106)" />
      <path d="M285 110 q -8 -8 -18 -2" stroke={C.sageDeep} strokeWidth="2" fill="none" />
      <ellipse cx="278" cy="106" rx="5" ry="2" fill={C.sage} transform="rotate(20 278 106)" />

      {/* "Simren" hand-piped on the lower tier */}
      <text
        x="230"
        y="282"
        textAnchor="middle"
        fontFamily='"Caveat", cursive'
        fontSize="28"
        fill="#fff7e3"
        stroke="#d4b485"
        strokeWidth="0.6"
      >
        Simren
      </text>

      {/* candles — drawn AFTER the upper tier so the base sits inside the cake */}
      {candleX.map((x, i) => (
        <Candle
          key={i}
          x={x}
          baseY={candleTop}
          blown={blown[i]}
          onBlow={() => onBlow(i)}
          reduced={reduced}
        />
      ))}
    </svg>
  );
}

function FrostingRose({
  cx,
  cy,
  color,
  size = 1,
}: {
  cx: number;
  cy: number;
  color: string;
  size?: number;
}) {
  // A small SVG frosting rose: spiral of petals.
  const r1 = 10 * size;
  const r2 = 6 * size;
  const r3 = 3 * size;
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r={r1} fill={color} opacity="0.95" />
      <path
        d={`M ${-r1 * 0.85} 0 a ${r1} ${r1 * 0.7} 0 0 1 ${r1 * 1.7} 0`}
        fill="none"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="1"
      />
      <circle r={r2} cx={r1 * 0.1} cy={-r1 * 0.1} fill={color} />
      <path
        d={`M ${-r2} ${-r2 * 0.2} a ${r2} ${r2 * 0.6} 0 0 1 ${r2 * 2} 0`}
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="0.9"
      />
      <circle r={r3} fill="rgba(255,255,255,0.35)" cx={-r3 * 0.2} cy={-r3 * 0.4} />
    </g>
  );
}

function Candle({
  x,
  baseY,
  blown,
  onBlow,
  reduced,
}: {
  x: number;
  baseY: number;
  blown: boolean;
  onBlow: () => void;
  reduced: boolean;
}) {
  // Candle body sits with its base INSIDE the cake (we draw a small wax pool).
  const bodyTop = baseY - 36;
  const wickTop = bodyTop - 6;
  return (
    <g
      onClick={onBlow}
      onTouchStart={(e) => {
        e.preventDefault();
        onBlow();
      }}
      style={{ cursor: blown ? "default" : "pointer" }}
    >
      {/* invisible hit target for easier tap */}
      <rect x={x - 16} y={wickTop - 26} width={32} height={70} fill="transparent" />

      {/* wax pool around base, sitting on the cake */}
      <ellipse cx={x} cy={baseY + 1} rx="7" ry="2.4" fill="#f3d9b0" opacity="0.9" />

      {/* candle body */}
      <rect
        x={x - 4}
        y={bodyTop}
        width="8"
        height="38"
        rx="1.5"
        fill={C.rose}
      />
      <rect
        x={x - 4}
        y={bodyTop}
        width="8"
        height="38"
        rx="1.5"
        fill="url(#stripeGrad)"
        opacity="0"
      />
      {/* candy stripe */}
      {Array.from({ length: 5 }).map((_, i) => (
        <rect
          key={i}
          x={x - 4}
          y={bodyTop + i * 8}
          width="8"
          height="3"
          fill="rgba(255,255,255,0.55)"
        />
      ))}

      {/* wick */}
      <line x1={x} y1={bodyTop} x2={x} y2={wickTop} stroke="#3a2a18" strokeWidth="1.4" strokeLinecap="round" />

      {/* flame */}
      {!blown && (
        <g>
          {!reduced && (
            <motion.ellipse
              cx={x}
              cy={wickTop - 12}
              rx={6}
              ry={9}
              fill="url(#flameGrad)"
              animate={{
                scaleY: [1, 1.08, 0.95, 1.05, 1],
                scaleX: [1, 0.96, 1.05, 0.98, 1],
              }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformOrigin: `${x}px ${wickTop}px` }}
            />
          )}
          {reduced && (
            <ellipse cx={x} cy={wickTop - 12} rx={6} ry={9} fill="url(#flameGrad)" />
          )}
          {/* inner flame */}
          <ellipse cx={x} cy={wickTop - 10} rx={2} ry={5} fill="#fff5b8" opacity="0.95" />
          {/* glow */}
          <circle cx={x} cy={wickTop - 12} r={14} fill="#ffd58a" opacity="0.18" />
        </g>
      )}

      {/* smoke after blow-out */}
      {blown && !reduced && (
        <motion.path
          d={`M ${x} ${wickTop} q -3 -8 0 -16 q 3 -8 0 -16`}
          stroke="#9b9b9b"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
          initial={{ opacity: 0.7, y: 0 }}
          animate={{ opacity: 0, y: -16 }}
          transition={{ duration: 2.2 }}
        />
      )}
    </g>
  );
}

/* ---------- wishes pinned to twine ---------- */

function WishesTwine() {
  return (
    <section
      style={{
        position: "relative",
        zIndex: 5,
        padding: "12vh 5vw 6vh",
      }}
    >
      <SectionTitle eyebrow="seven small things" title="wishes on the line" />

      <div
        style={{
          position: "relative",
          margin: "5vh auto 0",
          maxWidth: 1100,
        }}
      >
        {/* twine */}
        <svg
          viewBox="0 0 1000 30"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: 30,
            zIndex: 1,
          }}
        >
          <path
            d="M0 14 Q 250 26, 500 14 T 1000 14"
            stroke={C.twine}
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M0 14 Q 250 26, 500 14 T 1000 14"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="0.6"
            fill="none"
          />
        </svg>

        <div
          style={{
            position: "relative",
            paddingTop: 26,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(240px, 80vw), 1fr))",
            gap: "clamp(20px, 3vw, 36px)",
            justifyItems: "center",
            zIndex: 2,
          }}
        >
          {WISHES.map((w, i) => (
            <WishNote key={i} text={w} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function WishNote({ text, index }: { text: string; index: number }) {
  // Stable rotation per index
  const rot = (Math.sin(index * 7.13) * 0.5) * 8;
  const colors = [C.cream, C.paper, "#f7eed7", C.cream, C.paper, "#f7eed7", C.cream];
  const bg = colors[index % colors.length];
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, rotate: rot }}
      whileInView={{ opacity: 1, y: 0, rotate: rot }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.7, delay: index * 0.08, ease: "easeOut" }}
      style={{
        position: "relative",
        width: "clamp(220px, 32vw, 260px)",
        background: bg,
        padding: "34px 18px 22px",
        borderRadius: 4,
        boxShadow:
          "0 8px 16px rgba(60,40,20,0.12), inset 0 0 30px rgba(120,80,30,0.05)",
      }}
    >
      {/* clothespin */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: -14,
          left: "50%",
          transform: "translateX(-50%)",
          width: 18,
          height: 28,
          background: "#caa779",
          borderRadius: "3px 3px 4px 4px",
          boxShadow: "inset 0 -6px 8px rgba(0,0,0,0.15), 0 2px 3px rgba(0,0,0,0.18)",
        }}
      />
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: -10,
          left: "calc(50% - 1px)",
          width: 2,
          height: 14,
          background: "#8a6a45",
          opacity: 0.5,
        }}
      />
      <p
        style={{
          margin: 0,
          fontFamily: '"Caveat", "Bradley Hand", cursive',
          fontSize: "clamp(18px, 4.2vw, 22px)",
          lineHeight: 1.35,
          color: C.ink,
          textAlign: "center",
        }}
      >
        {text}
      </p>
      {/* tiny sprig */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 10, opacity: 0.7 }}>
        <Sprig />
      </div>
    </motion.div>
  );
}

/* ---------- closing ---------- */

function Closing() {
  return (
    <section
      style={{
        position: "relative",
        zIndex: 5,
        padding: "14vh 6vw 18vh",
        textAlign: "center",
      }}
    >
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 1.2 }}
        style={{
          maxWidth: 620,
          margin: "0 auto",
          fontStyle: "italic",
          fontSize: "clamp(18px, 4.4vw, 24px)",
          color: C.inkSoft,
          lineHeight: 1.5,
        }}
      >
        if a year were a garden,
        <br />
        let this one be the kind you walk through slowly,
        <br />
        the kind that smells like rain on warm stone,
        <br />
        the kind you don&apos;t want to leave.
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 1.4, delay: 0.4 }}
        style={{
          marginTop: "3rem",
          fontFamily: '"Caveat", cursive',
          fontSize: "clamp(22px, 5vw, 30px)",
          color: C.roseDeep,
        }}
      >
        with love —
      </motion.div>

      <div style={{ marginTop: "2rem", display: "flex", justifyContent: "center", gap: 14, opacity: 0.85 }}>
        <Sprig />
        <Sprig flip />
      </div>

      <div
        style={{
          marginTop: "5rem",
          fontFamily: '"Caveat", cursive',
          fontSize: 16,
          color: C.sageInk,
          opacity: 0.7,
        }}
      >
        Simren Zahra · 14 May 2026
      </div>
    </section>
  );
}

/* ---------- shared bits ---------- */

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontFamily: '"Caveat", cursive',
          fontSize: "clamp(16px, 3.8vw, 20px)",
          color: C.sageInk,
          letterSpacing: "0.04em",
        }}
      >
        — {eyebrow} —
      </div>
      <h2
        style={{
          fontFamily: '"Cormorant Garamond", Georgia, serif',
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: "clamp(32px, 7vw, 56px)",
          margin: "0.3rem 0 0",
          color: C.ink,
        }}
      >
        {title}
      </h2>
    </div>
  );
}

function FontImports() {
  // Inline @import via a style tag; respects the existing app's font stack
  // and degrades to system fonts if the network is offline.
  useEffect(() => {
    const id = "garden-fonts-link";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Caveat:wght@500;600&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&display=swap";
    document.head.appendChild(link);
  }, []);
  return null;
}
