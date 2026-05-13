"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * Birthday experience for Simren Zahra (2026-05-14)
 *
 * Full-bleed scroll-driven page. Sections:
 *   1. Hero    — WebGL particle field (cosmic dust + petals) + name title
 *                with mouse parallax
 *   2. Stage   — date + opening line, scroll-fade
 *   3. Cake    — layered HTML/CSS cake; click each candle to blow it out
 *                → reveals "make a wish" line
 *   4. Gallery — floating photo cards (HTML <img> so EXIF orientation
 *                is honored). Auto-skipped if `photos` is empty.
 *   5. Wishes  — 7 staggered lines (one per candle)
 *   6. Finale  — confetti + sign-off (no name)
 *
 * Renders as a fixed full-viewport overlay so it ignores any layout
 * container the route group might impose. Internal scroll container.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  AnimatePresence,
} from "framer-motion";
import * as THREE from "three";

const NAME = "Simren";
const FULL_NAME = "Simren Zahra";
const DATE_STR = "May 14, 2026";

const WISHES = [
  "May this year wear your name better than any year before.",
  "May the small things stay small and the right things grow loud.",
  "May the people who matter find their way to your door.",
  "May your laugh stay exactly the way it is.",
  "May the version of you a year from now thank the version of you today.",
  "May you be soft where you want to be and steel where you have to be.",
  "May the world be a little kinder than it has to be — to you, especially.",
];

interface Props {
  photos: string[];
}

/* small seeded RNG for deterministic SSR layouts */
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function CosmicExperience({ photos }: Props) {
  const reduced = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: scrollRef });

  return (
    <div
      ref={scrollRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        overflowY: "auto",
        overflowX: "hidden",
        background:
          "radial-gradient(ellipse at top, #1a0f2e 0%, #0a0612 45%, #050309 100%)",
        color: "#f5e9d4",
        fontFamily: "ui-serif, Georgia, 'Times New Roman', serif",
        WebkitFontSmoothing: "antialiased",
        scrollBehavior: "smooth",
      }}
    >
      {/* WebGL ambient particle field — fixed behind everything */}
      <ParticleSky reduced={!!reduced} />

      <ScrollProgress progress={scrollYProgress} />

      <div style={{ position: "relative", zIndex: 1 }}>
        <Hero reduced={!!reduced} />
        <Stage />
        <CakeSection />
        {photos.length > 0 && <PhotoGallery photos={photos} reduced={!!reduced} />}
        <WishesSection />
        <Finale />
      </div>

      <style jsx global>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        @keyframes float-up {
          0% { transform: translateY(0) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(-120vh) rotate(360deg); opacity: 0; }
        }
        @keyframes flame-flicker {
          0%, 100% {
            transform: translate(-50%, 0) scale(1, 1);
            filter: brightness(1) blur(0.4px);
          }
          25% {
            transform: translate(-50%, -1px) scale(0.95, 1.08);
            filter: brightness(1.15) blur(0.5px);
          }
          50% {
            transform: translate(-50%, 0) scale(1.05, 0.95);
            filter: brightness(0.95) blur(0.3px);
          }
          75% {
            transform: translate(-50%, -0.5px) scale(0.97, 1.04);
            filter: brightness(1.1) blur(0.4px);
          }
        }
        @keyframes cake-glow {
          0%, 100% { filter: drop-shadow(0 30px 60px rgba(255,158,118,0.25)) drop-shadow(0 0 30px rgba(255,196,128,0.15)); }
          50% { filter: drop-shadow(0 30px 60px rgba(255,158,118,0.35)) drop-shadow(0 0 50px rgba(255,196,128,0.25)); }
        }
        @keyframes smoke-rise {
          0% { transform: translate(-50%, 0) scale(1); opacity: 0.55; }
          100% { transform: translate(-50%, -80px) scale(2.4); opacity: 0; }
        }
        @keyframes card-bob {
          0%, 100% { transform: var(--rest-transform); }
          50% { transform: var(--rest-transform) translateY(-8px); }
        }
        ::selection { background: rgba(255,196,128,0.5); color: #fff; }
        html, body { overflow: hidden; }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * WebGL: ambient particle sky — drifting cosmic dust + warm "petals"
 * ─────────────────────────────────────────────────────────────────── */
function ParticleSky({ reduced }: { reduced: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );
    camera.position.z = 80;

    /* —— Layer 1: tiny white star dust —— */
    const dustCount = reduced ? 600 : 2000;
    const dustGeom = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);
    const dustSizes = new Float32Array(dustCount);
    const rng = mulberry32(7);
    for (let i = 0; i < dustCount; i++) {
      dustPositions[i * 3] = (rng() - 0.5) * 400;
      dustPositions[i * 3 + 1] = (rng() - 0.5) * 240;
      dustPositions[i * 3 + 2] = (rng() - 0.5) * 200 - 30;
      dustSizes[i] = 0.4 + rng() * 1.2;
    }
    dustGeom.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
    dustGeom.setAttribute("size", new THREE.BufferAttribute(dustSizes, 1));

    const dustMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size;
        uniform float uTime;
        varying float vAlpha;
        void main() {
          vec3 pos = position;
          float twinkle = 0.55 + 0.45 * sin(uTime * 1.5 + position.x * 0.05 + position.y * 0.03);
          vAlpha = twinkle;
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * vAlpha;
          gl_FragColor = vec4(1.0, 0.96, 0.88, a);
        }
      `,
    });
    const dust = new THREE.Points(dustGeom, dustMat);
    scene.add(dust);

    /* —— Layer 2: warm "petals" — slow drift, larger glow —— */
    const petalCount = reduced ? 80 : 220;
    const petalGeom = new THREE.BufferGeometry();
    const petalPos = new Float32Array(petalCount * 3);
    const petalCol = new Float32Array(petalCount * 3);
    const petalVel = new Float32Array(petalCount); // drift speed factor
    const palette = [
      [1.0, 0.85, 0.61], // gold
      [1.0, 0.6, 0.46],  // coral
      [1.0, 0.49, 0.7],  // pink
      [0.7, 0.53, 1.0],  // violet
    ];
    for (let i = 0; i < petalCount; i++) {
      petalPos[i * 3] = (rng() - 0.5) * 280;
      petalPos[i * 3 + 1] = (rng() - 0.5) * 180;
      petalPos[i * 3 + 2] = (rng() - 0.5) * 120 - 10;
      const c = palette[Math.floor(rng() * palette.length)];
      petalCol[i * 3] = c[0];
      petalCol[i * 3 + 1] = c[1];
      petalCol[i * 3 + 2] = c[2];
      petalVel[i] = 0.3 + rng() * 0.7;
    }
    petalGeom.setAttribute("position", new THREE.BufferAttribute(petalPos, 3));
    petalGeom.setAttribute("color", new THREE.BufferAttribute(petalCol, 3));
    petalGeom.setAttribute("velocity", new THREE.BufferAttribute(petalVel, 1));

    const petalMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 color;
        attribute float velocity;
        uniform float uTime;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec3 pos = position;
          // gentle drift — y descends slowly, looping
          float t = uTime * velocity * 1.5;
          pos.y = mod(pos.y - t + 100.0, 200.0) - 100.0;
          pos.x += sin(uTime * 0.4 + position.z * 0.1) * 4.0;
          vColor = color;
          vAlpha = 0.6 + 0.4 * sin(uTime + position.x * 0.05);
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = (60.0 + 30.0 * sin(uTime * 0.5 + position.x)) * (200.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.05, d) * vAlpha * 0.5;
          gl_FragColor = vec4(vColor, a);
        }
      `,
    });
    const petals = new THREE.Points(petalGeom, petalMat);
    scene.add(petals);

    /* mouse parallax */
    let mx = 0, my = 0, tx = 0, ty = 0;
    function onMove(e: PointerEvent) {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;
      my = (e.clientY / window.innerHeight - 0.5) * 2;
    }
    window.addEventListener("pointermove", onMove);

    function onResize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onResize);

    const clock = new THREE.Clock();
    let raf = 0;
    function tick() {
      const t = clock.getElapsedTime();
      dustMat.uniforms.uTime.value = t;
      petalMat.uniforms.uTime.value = t;

      tx += (mx * 6 - tx) * 0.04;
      ty += (-my * 4 - ty) * 0.04;
      camera.position.x = tx;
      camera.position.y = ty;
      camera.lookAt(0, 0, 0);

      dust.rotation.y = t * 0.005;
      petals.rotation.y = t * 0.01;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      dustGeom.dispose();
      petalGeom.dispose();
      dustMat.dispose();
      petalMat.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [reduced]);

  return (
    <div
      aria-hidden
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}

/* ── Scroll progress bar ────────────────────────────────────────────── */
function ScrollProgress({
  progress,
}: {
  progress: ReturnType<typeof useScroll>["scrollYProgress"];
}) {
  const width = useTransform(progress, [0, 1], ["0%", "100%"]);
  return (
    <motion.div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        height: 2,
        width,
        background: "linear-gradient(90deg, #ffb56b, #ff7eb3, #b388ff)",
        zIndex: 100,
      }}
    />
  );
}

/* ── 1. Hero ─────────────────────────────────────────────────────────── */
function Hero({ reduced }: { reduced: boolean }) {
  const letters = NAME.split("");

  return (
    <section
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 24px",
        textAlign: "center",
        position: "relative",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        style={{
          fontSize: "clamp(11px, 1.4vw, 14px)",
          letterSpacing: "0.45em",
          textTransform: "uppercase",
          color: "rgba(245,233,212,0.55)",
          marginBottom: 28,
        }}
      >
        Today, the world made room for you
      </motion.div>

      <h1
        style={{
          fontSize: "clamp(48px, 11vw, 140px)",
          fontWeight: 300,
          margin: 0,
          letterSpacing: "-0.02em",
          lineHeight: 1.05,
          fontStyle: "italic",
        }}
      >
        <motion.span
          initial="hidden"
          animate="visible"
          style={{ display: "block" }}
          variants={{
            hidden: {},
            visible: {
              transition: {
                staggerChildren: reduced ? 0 : 0.07,
                delayChildren: 0.4,
              },
            },
          }}
        >
          <span
            style={{
              fontSize: "0.5em",
              fontStyle: "normal",
              fontWeight: 200,
              letterSpacing: "0.05em",
              color: "rgba(245,233,212,0.85)",
              display: "block",
              marginBottom: "0.4em",
            }}
          >
            {"Happy Birthday,".split("").map((ch, i) => (
              <motion.span
                key={i}
                style={{ display: "inline-block", whiteSpace: "pre" }}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.6, ease: "easeOut" },
                  },
                }}
              >
                {ch === " " ? " " : ch}
              </motion.span>
            ))}
          </span>
          <span
            style={{
              background:
                "linear-gradient(135deg, #ffd89b 0%, #ff9a76 35%, #ff7eb3 65%, #b388ff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              filter: "drop-shadow(0 4px 30px rgba(255,158,118,0.35))",
            }}
          >
            {letters.map((ch, i) => (
              <motion.span
                key={i}
                style={{ display: "inline-block" }}
                variants={{
                  hidden: { opacity: 0, y: 60, rotateX: -90 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    rotateX: 0,
                    transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
                  },
                }}
              >
                {ch}
              </motion.span>
            ))}
          </span>
        </motion.span>
      </h1>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.2, duration: 1 }}
        style={{
          marginTop: 56,
          fontSize: 12,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: "rgba(245,233,212,0.4)",
        }}
      >
        scroll
      </motion.div>
      <motion.div
        animate={reduced ? {} : { y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        style={{
          marginTop: 12,
          width: 1,
          height: 32,
          background: "linear-gradient(to bottom, rgba(245,233,212,0.6), transparent)",
        }}
      />
    </section>
  );
}

/* ── 2. Stage / opening line ─────────────────────────────────────────── */
function Stage() {
  return (
    <section
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 24px",
        textAlign: "center",
      }}
    >
      <motion.div
        initial={{ opacity: 0, letterSpacing: "0.6em" }}
        whileInView={{ opacity: 1, letterSpacing: "0.45em" }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1.6, ease: "easeOut" }}
        style={{
          fontSize: "clamp(12px, 1.5vw, 14px)",
          textTransform: "uppercase",
          color: "rgba(245,233,212,0.5)",
          marginBottom: 32,
        }}
      >
        {DATE_STR}
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        style={{
          fontSize: "clamp(22px, 3.6vw, 38px)",
          fontWeight: 300,
          fontStyle: "italic",
          lineHeight: 1.4,
          maxWidth: 720,
          margin: 0,
          color: "rgba(245,233,212,0.92)",
        }}
      >
        Some people are born on regular days.
        <br />
        Today isn&apos;t one of them.
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 1.4, delay: 0.6 }}
        style={{
          marginTop: 40,
          fontSize: "clamp(14px, 1.6vw, 17px)",
          color: "rgba(245,233,212,0.55)",
          maxWidth: 520,
          lineHeight: 1.7,
        }}
      >
        Scroll on. There&apos;s a cake. There are wishes. There&apos;s a
        whole day made of you.
      </motion.p>
    </section>
  );
}

/* ── 3. Cake — interactive ───────────────────────────────────────────── */
function CakeSection() {
  const TOTAL = 7;
  const [lit, setLit] = useState<boolean[]>(() => Array(TOTAL).fill(true));
  const [showWish, setShowWish] = useState(false);
  const allOut = lit.every((v) => !v);

  useEffect(() => {
    if (allOut) {
      const t = setTimeout(() => setShowWish(true), 700);
      return () => clearTimeout(t);
    }
  }, [allOut]);

  function blow(i: number) {
    setLit((cur) => cur.map((v, idx) => (idx === i ? false : v)));
  }

  return (
    <section
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "120px 24px",
        textAlign: "center",
      }}
    >
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1 }}
        style={{
          fontSize: "clamp(13px, 1.6vw, 15px)",
          letterSpacing: "0.4em",
          textTransform: "uppercase",
          color: "rgba(245,233,212,0.55)",
          margin: "0 0 12px 0",
          fontWeight: 400,
        }}
      >
        Step One
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1.2, delay: 0.3 }}
        style={{
          fontSize: "clamp(20px, 3vw, 30px)",
          fontStyle: "italic",
          margin: "0 0 56px 0",
          color: "rgba(245,233,212,0.92)",
          fontWeight: 300,
        }}
      >
        {allOut ? "Now make your wish." : "Tap each candle to blow it out."}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        style={{ width: "100%", display: "flex", justifyContent: "center" }}
      >
        <Cake lit={lit} onBlow={blow} />
      </motion.div>

      <AnimatePresence>
        {showWish && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            style={{
              marginTop: 56,
              fontSize: "clamp(18px, 2.4vw, 24px)",
              fontStyle: "italic",
              color: "#ffd89b",
              maxWidth: 540,
              lineHeight: 1.5,
            }}
          >
            Close your eyes for a second. Pick one thing.
            <br />
            <span
              style={{
                fontSize: "0.7em",
                color: "rgba(245,233,212,0.5)",
                fontStyle: "normal",
                letterSpacing: "0.1em",
              }}
            >
              The universe is listening.
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Cake — proper layered HTML/CSS cake.
 * Three tiers stacked on a plate. Candles are absolutely positioned
 * children of the TOP tier so they sit IN the cake (their base is
 * inside the frosting). Each candle is a rectangle topped with a
 * wick + flame; click anywhere on the candle column to blow it out.
 *
 * The whole cake has a subtle pulse glow + scrolling drips on tiers.
 * ─────────────────────────────────────────────────────────────────── */
function Cake({ lit, onBlow }: { lit: boolean[]; onBlow: (i: number) => void }) {
  return (
    <div
      style={{
        position: "relative",
        width: "min(360px, 88vw)",
        height: 380,
        animation: "cake-glow 4s ease-in-out infinite",
      }}
    >
      {/* Candles — rendered ABOVE the cake but anchored relative to the cake stack */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          /* this row sits just above the top of the top tier */
          bottom: 218,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end",
          gap: 14,
          padding: "0 28px",
          zIndex: 3,
        }}
      >
        {lit.map((isLit, i) => (
          <Candle key={i} lit={isLit} idx={i} onBlow={() => onBlow(i)} />
        ))}
      </div>

      {/* TOP TIER (smallest) */}
      <div
        style={{
          position: "absolute",
          bottom: 150,
          left: "50%",
          transform: "translateX(-50%)",
          width: "62%",
          height: 78,
          borderRadius: "10px 10px 6px 6px",
          background:
            "linear-gradient(180deg, #fff1d6 0%, #ffd89b 35%, #f0b873 100%)",
          boxShadow:
            "inset 0 4px 10px rgba(255,255,255,0.45), inset 0 -8px 16px rgba(150,80,40,0.25), 0 6px 14px rgba(0,0,0,0.35)",
          zIndex: 2,
        }}
      >
        {/* frosting top — slightly lighter ellipse to suggest the icing surface candles sit on */}
        <div
          style={{
            position: "absolute",
            top: -4,
            left: 6,
            right: 6,
            height: 12,
            borderRadius: "50%",
            background: "linear-gradient(180deg, #fff8e7, #ffd89b)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
          }}
        />
        {/* drip 1 */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 14,
            left: 0,
            right: 0,
            height: 22,
            background:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 22' preserveAspectRatio='none'><path d='M0 0 L100 0 L100 6 Q92 16 84 8 Q72 22 64 10 Q54 20 46 9 Q34 22 28 10 Q18 20 10 8 L0 6 Z' fill='%23ff9a76'/></svg>\") center/100% 100% no-repeat",
            opacity: 0.95,
          }}
        />
        {/* sprinkles on top tier */}
        <Sprinkles seed={11} count={14} />
      </div>

      {/* MIDDLE TIER */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: "50%",
          transform: "translateX(-50%)",
          width: "82%",
          height: 78,
          borderRadius: "8px 8px 6px 6px",
          background:
            "linear-gradient(180deg, #ffc8a0 0%, #ff9a76 45%, #c97056 100%)",
          boxShadow:
            "inset 0 4px 10px rgba(255,255,255,0.35), inset 0 -10px 18px rgba(120,50,30,0.35), 0 8px 18px rgba(0,0,0,0.4)",
          zIndex: 2,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -3,
            left: 8,
            right: 8,
            height: 10,
            borderRadius: "50%",
            background: "linear-gradient(180deg, #ffd89b, #ff9a76)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
          }}
        />
        {/* drip dripping from middle tier */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 12,
            left: 0,
            right: 0,
            height: 26,
            background:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 26' preserveAspectRatio='none'><path d='M0 0 L100 0 L100 8 Q94 22 86 10 Q76 26 68 12 Q58 24 50 11 Q40 26 32 12 Q22 24 14 10 L0 8 Z' fill='%23ffd89b'/></svg>\") center/100% 100% no-repeat",
            opacity: 0.9,
          }}
        />
        <Sprinkles seed={22} count={20} />
      </div>

      {/* BOTTOM TIER (largest) */}
      <div
        style={{
          position: "absolute",
          bottom: 22,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          height: 86,
          borderRadius: "10px 10px 8px 8px",
          background:
            "linear-gradient(180deg, #d8a7d4 0%, #b07cb4 45%, #6e4a82 100%)",
          boxShadow:
            "inset 0 4px 10px rgba(255,255,255,0.3), inset 0 -12px 20px rgba(40,15,55,0.5), 0 12px 22px rgba(0,0,0,0.5)",
          zIndex: 2,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -3,
            left: 10,
            right: 10,
            height: 10,
            borderRadius: "50%",
            background: "linear-gradient(180deg, #e8c8e8, #b07cb4)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
          }}
        />
        {/* drip dripping from bottom tier */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 14,
            left: 0,
            right: 0,
            height: 30,
            background:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 30' preserveAspectRatio='none'><path d='M0 0 L100 0 L100 10 Q94 26 86 12 Q76 30 68 14 Q58 28 50 13 Q40 30 32 14 Q22 28 14 12 L0 10 Z' fill='%23b388ff'/></svg>\") center/100% 100% no-repeat",
            opacity: 0.85,
          }}
        />
        <Sprinkles seed={33} count={28} />
      </div>

      {/* PLATE */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "118%",
          height: 28,
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse at center top, #6a4a78 0%, #3a2540 60%, #1a1028 100%)",
          boxShadow: "0 18px 30px rgba(0,0,0,0.55)",
          zIndex: 1,
        }}
      />
      {/* plate highlight */}
      <div
        style={{
          position: "absolute",
          bottom: 18,
          left: "50%",
          transform: "translateX(-50%)",
          width: "104%",
          height: 4,
          borderRadius: "50%",
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)",
          zIndex: 1,
        }}
      />
    </div>
  );
}

function Candle({
  lit,
  idx,
  onBlow,
}: {
  lit: boolean;
  idx: number;
  onBlow: () => void;
}) {
  /* alternating candle colors for a playful look */
  const palette = ["#fff8e7", "#ff9a76", "#ffd89b", "#ff7eb3", "#b388ff"];
  const candleColor = palette[idx % palette.length];

  return (
    <button
      type="button"
      onClick={onBlow}
      aria-label={lit ? `Blow out candle ${idx + 1}` : `Candle ${idx + 1} (out)`}
      style={{
        position: "relative",
        width: 14,
        height: 70,
        padding: 0,
        background: "transparent",
        border: "none",
        cursor: lit ? "pointer" : "default",
        display: "block",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* candle body */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          bottom: 0,
          transform: "translateX(-50%)",
          width: 8,
          height: 56,
          borderRadius: "3px 3px 1px 1px",
          background: `linear-gradient(180deg, ${candleColor} 0%, ${candleColor} 60%, rgba(0,0,0,0.15) 100%)`,
          boxShadow:
            "inset -2px 0 3px rgba(0,0,0,0.18), inset 2px 0 2px rgba(255,255,255,0.35), 0 2px 4px rgba(0,0,0,0.25)",
        }}
      />
      {/* candle stripe (a small accent so they read as candles) */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          bottom: 36,
          transform: "translateX(-50%)",
          width: 8,
          height: 2,
          background: "rgba(0,0,0,0.18)",
        }}
      />
      {/* wick */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          bottom: 56,
          transform: "translateX(-50%)",
          width: 1.5,
          height: 6,
          background: "#3a2540",
          borderRadius: 1,
        }}
      />
      {/* flame */}
      {lit && (
        <>
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: "50%",
              bottom: 60,
              width: 12,
              height: 18,
              borderRadius: "50% 50% 45% 45% / 60% 60% 40% 40%",
              background:
                "radial-gradient(ellipse at 50% 75%, #fff8e7 0%, #ffd89b 35%, #ffb56b 65%, rgba(255,120,80,0.4) 100%)",
              boxShadow:
                "0 0 12px rgba(255,196,128,0.9), 0 0 24px rgba(255,158,118,0.6), 0 0 40px rgba(255,158,118,0.35)",
              transformOrigin: "50% 100%",
              animation: "flame-flicker 0.5s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
          {/* hot core */}
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: "50%",
              bottom: 62,
              transform: "translateX(-50%)",
              width: 4,
              height: 7,
              borderRadius: "50%",
              background: "#fff",
              filter: "blur(0.5px)",
              opacity: 0.9,
              pointerEvents: "none",
            }}
          />
        </>
      )}
      {/* smoke after blow-out */}
      {!lit && (
        <span
          aria-hidden
          key={`smoke-${idx}`}
          style={{
            position: "absolute",
            left: "50%",
            bottom: 60,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(245,233,212,0.5) 0%, rgba(245,233,212,0) 70%)",
            transformOrigin: "50% 100%",
            animation: "smoke-rise 1.6s ease-out forwards",
            pointerEvents: "none",
          }}
        />
      )}
    </button>
  );
}

/* deterministic sprinkles scattered on a tier */
function Sprinkles({ seed, count }: { seed: number; count: number }) {
  const rng = useMemo(() => mulberry32(seed), [seed]);
  const items = useMemo(() => {
    const colors = ["#fff8e7", "#b388ff", "#ff7eb3", "#ffd89b", "#ff9a76"];
    return Array.from({ length: count }, () => ({
      left: 4 + rng() * 92,
      top: 30 + rng() * 42,
      rot: rng() * 360,
      color: colors[Math.floor(rng() * colors.length)],
      w: 3 + rng() * 2,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);
  return (
    <>
      {items.map((s, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            position: "absolute",
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.w,
            height: 1.5,
            background: s.color,
            transform: `rotate(${s.rot}deg)`,
            borderRadius: 1,
            opacity: 0.9,
          }}
        />
      ))}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * 4. Photo Gallery — floating cards using HTML <img> (auto-orients EXIF)
 *
 * Cards are absolutely positioned in a wide stage, slightly tilted
 * and offset; one is "active" at a time and floats forward. Tap/click
 * to advance. Auto-cycles otherwise. Mobile-friendly.
 * ─────────────────────────────────────────────────────────────────── */
function PhotoGallery({ photos, reduced }: { photos: string[]; reduced: boolean }) {
  const [active, setActive] = useState(0);
  const total = photos.length;

  /* auto-advance unless reduced motion */
  useEffect(() => {
    if (reduced || total <= 1) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % total);
    }, 4200);
    return () => window.clearInterval(id);
  }, [reduced, total]);

  function next() {
    setActive((i) => (i + 1) % total);
  }
  function prev() {
    setActive((i) => (i - 1 + total) % total);
  }

  return (
    <section
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "120px 24px",
        textAlign: "center",
        position: "relative",
      }}
    >
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1 }}
        style={{
          fontSize: "clamp(13px, 1.6vw, 15px)",
          letterSpacing: "0.4em",
          textTransform: "uppercase",
          color: "rgba(245,233,212,0.55)",
          margin: "0 0 12px 0",
          fontWeight: 400,
        }}
      >
        A few of you
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1.2, delay: 0.3 }}
        style={{
          fontSize: "clamp(20px, 3vw, 30px)",
          fontStyle: "italic",
          margin: "0 0 40px 0",
          color: "rgba(245,233,212,0.92)",
          fontWeight: 300,
          maxWidth: 640,
        }}
      >
        Moments worth keeping.
      </motion.p>

      <div
        style={{
          width: "min(720px, 94vw)",
          height: "min(560px, 70vh)",
          position: "relative",
          perspective: "1400px",
          /* subtle inner radial wash so cards float against a gentle stage */
          background:
            "radial-gradient(ellipse at center, rgba(50,25,75,0.35) 0%, rgba(15,8,25,0) 70%)",
          borderRadius: 18,
        }}
      >
        {photos.map((src, i) => {
          /* stack offset relative to active card */
          const offset = i - active;
          /* normalize for wrap: bring far cards to nearest side */
          const normalized =
            offset > total / 2
              ? offset - total
              : offset < -total / 2
                ? offset + total
                : offset;
          const isActive = normalized === 0;
          /* only render the 5 nearest cards for perf */
          if (Math.abs(normalized) > 2) return null;

          const rotY = normalized * -22;
          const translateX = normalized * 60;
          const translateZ = isActive ? 0 : -120 - Math.abs(normalized) * 60;
          const opacity = Math.abs(normalized) > 2 ? 0 : 1 - Math.abs(normalized) * 0.25;
          const tilt = isActive ? 0 : normalized * 4;

          return (
            <button
              key={src}
              type="button"
              onClick={() => {
                if (isActive) next();
                else setActive(i);
              }}
              aria-label={isActive ? "Next photo" : `Bring photo ${i + 1} forward`}
              style={{
                position: "absolute",
                inset: 0,
                margin: "auto",
                width: "min(360px, 70vw)",
                height: "min(480px, 60vh)",
                padding: 10,
                background: "linear-gradient(145deg, #fff8e7 0%, #f0e0c8 100%)",
                border: "none",
                borderRadius: 14,
                cursor: "pointer",
                transform: `translate3d(${translateX}px, 0, ${translateZ}px) rotateY(${rotY}deg) rotateZ(${tilt}deg)`,
                transformStyle: "preserve-3d",
                transition:
                  "transform 0.9s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.6s ease, box-shadow 0.6s ease",
                opacity,
                zIndex: 100 - Math.abs(normalized),
                boxShadow: isActive
                  ? "0 30px 80px rgba(0,0,0,0.6), 0 0 40px rgba(255,196,128,0.25), inset 0 0 0 1px rgba(255,255,255,0.4)"
                  : "0 20px 50px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.2)",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <img
                src={src}
                alt={`Photo ${i + 1} of ${total}`}
                draggable={false}
                loading={Math.abs(normalized) <= 1 ? "eager" : "lazy"}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: 8,
                  display: "block",
                  pointerEvents: "none",
                  /* HTML img auto-honors EXIF; this guarantees it on all browsers */
                  imageOrientation: "from-image",
                } as React.CSSProperties}
              />
            </button>
          );
        })}
      </div>

      {/* controls + counter */}
      <div
        style={{
          marginTop: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        <button
          type="button"
          onClick={prev}
          aria-label="Previous photo"
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "1px solid rgba(255,196,128,0.3)",
            background: "rgba(40,20,60,0.4)",
            color: "#ffd89b",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          ‹
        </button>
        <div
          style={{
            fontSize: 12,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "rgba(245,233,212,0.55)",
            minWidth: 80,
          }}
        >
          {(active + 1).toString().padStart(2, "0")} / {total.toString().padStart(2, "0")}
        </div>
        <button
          type="button"
          onClick={next}
          aria-label="Next photo"
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "1px solid rgba(255,196,128,0.3)",
            background: "rgba(40,20,60,0.4)",
            color: "#ffd89b",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          ›
        </button>
      </div>
    </section>
  );
}

/* ── 5. Wishes — staggered reveal ────────────────────────────────────── */
function WishesSection() {
  return (
    <section
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "120px 24px",
      }}
    >
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1 }}
        style={{
          fontSize: "clamp(13px, 1.6vw, 15px)",
          letterSpacing: "0.4em",
          textTransform: "uppercase",
          color: "rgba(245,233,212,0.55)",
          margin: "0 0 12px 0",
          textAlign: "center",
          fontWeight: 400,
        }}
      >
        Seven Wishes For Your Year
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1.2, delay: 0.3 }}
        style={{
          fontSize: "clamp(14px, 1.6vw, 17px)",
          color: "rgba(245,233,212,0.5)",
          margin: "0 0 64px 0",
          textAlign: "center",
        }}
      >
        One for every candle you just blew out.
      </motion.p>

      <motion.ol
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.18 } },
        }}
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          maxWidth: 680,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        {WISHES.map((w, i) => (
          <motion.li
            key={i}
            variants={{
              hidden: { opacity: 0, x: -30 },
              visible: {
                opacity: 1,
                x: 0,
                transition: { duration: 0.9, ease: "easeOut" },
              },
            }}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 20,
              borderLeft: "1px solid rgba(255,196,128,0.25)",
              paddingLeft: 24,
              paddingTop: 8,
              paddingBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: "0.2em",
                color: "#ffd89b",
                minWidth: 28,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              style={{
                fontSize: "clamp(17px, 2.1vw, 22px)",
                lineHeight: 1.55,
                fontStyle: "italic",
                color: "rgba(245,233,212,0.92)",
                fontWeight: 300,
              }}
            >
              {w}
            </span>
          </motion.li>
        ))}
      </motion.ol>
    </section>
  );
}

/* ── 6. Finale ───────────────────────────────────────────────────────── */
function Finale() {
  const [burst, setBurst] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setBurst(true);
          obs.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "120px 24px 160px",
        textAlign: "center",
        position: "relative",
      }}
    >
      {burst && <Confetti />}

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1.4 }}
        style={{
          fontSize: "clamp(13px, 1.6vw, 15px)",
          letterSpacing: "0.4em",
          textTransform: "uppercase",
          color: "rgba(245,233,212,0.55)",
          margin: "0 0 32px 0",
        }}
      >
        and so —
      </motion.p>

      <motion.h2
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1.6, ease: "easeOut" }}
        style={{
          fontSize: "clamp(36px, 7vw, 84px)",
          fontWeight: 300,
          fontStyle: "italic",
          margin: 0,
          letterSpacing: "-0.02em",
          background:
            "linear-gradient(135deg, #ffd89b 0%, #ff9a76 50%, #ff7eb3 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          lineHeight: 1.1,
        }}
      >
        Happy Birthday,
        <br />
        {FULL_NAME}.
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1.4, delay: 0.6 }}
        style={{
          marginTop: 48,
          fontSize: "clamp(15px, 1.8vw, 19px)",
          color: "rgba(245,233,212,0.7)",
          maxWidth: 520,
          lineHeight: 1.7,
          fontStyle: "italic",
        }}
      >
        Have the kind of day people remember.
        <br />
        And the kind of year that earns the day.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1.4, delay: 1.4 }}
        style={{
          marginTop: 80,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ width: 40, height: 1, background: "rgba(245,233,212,0.3)" }} />
        <div
          style={{
            fontSize: 13,
            letterSpacing: "0.4em",
            textTransform: "uppercase",
            color: "rgba(245,233,212,0.55)",
          }}
        >
          with love
        </div>
      </motion.div>
    </section>
  );
}

/* ── Confetti ────────────────────────────────────────────────────────── */
function Confetti() {
  const pieces = useMemo(() => {
    const colors = ["#ffd89b", "#ff9a76", "#ff7eb3", "#b388ff", "#fff8e7"];
    const rand = mulberry32(99);
    return Array.from({ length: 90 }, (_, i) => ({
      id: i,
      left: rand() * 100,
      delay: rand() * 1.5,
      duration: 4 + rand() * 4,
      color: colors[Math.floor(rand() * colors.length)],
      size: 6 + rand() * 8,
      rotate: rand() * 360,
    }));
  }, []);
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            bottom: -20,
            width: p.size,
            height: p.size * 0.4,
            background: p.color,
            borderRadius: 2,
            transform: `rotate(${p.rotate}deg)`,
            animation: `float-up ${p.duration}s ease-out ${p.delay}s forwards`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}
