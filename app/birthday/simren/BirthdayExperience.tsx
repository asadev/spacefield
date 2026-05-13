"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * Birthday experience for Simren Zahra (2026-05-14)
 *
 * Full-bleed scroll-driven page. Sections:
 *   1. Hero    — WebGL particle field (cosmic dust + petals) + name title
 *                with mouse parallax
 *   2. Stage   — date + opening line, scroll-fade
 *   3. Cake    — interactive SVG cake; click each candle to blow it out
 *                → reveals "make a wish" line
 *   4. Gallery — 3D photo orbit (three.js): images of Simren rotate as
 *                planes around the camera, gentle drift, hover tilts each.
 *                Auto-skipped if `photos` is empty.
 *   5. Wishes  — 7 staggered lines (one per candle)
 *   6. Sky     — WebGL canvas; click anywhere to spawn a glowing star
 *                with a soft bloom; previous stars connect with lines
 *   7. Finale  — confetti + signed sign-off
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
const FROM = "Asad";
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

export default function BirthdayExperience({ photos }: Props) {
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
        {photos.length > 0 && <PhotoOrbit photos={photos} reduced={!!reduced} />}
        <WishesSection />
        <ConstellationSection reduced={!!reduced} />
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
        @keyframes flame {
          0%, 100% { transform: translateX(-50%) scaleY(1) scaleX(1); }
          50% { transform: translateX(-50%) scaleY(1.15) scaleX(0.9); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(255,196,128,0.4); }
          50% { box-shadow: 0 0 40px rgba(255,196,128,0.8); }
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
        Scroll on. There&apos;s a cake. There are wishes. There&apos;s a sky
        with your name on it.
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
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
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

function Cake({ lit, onBlow }: { lit: boolean[]; onBlow: (i: number) => void }) {
  const candleCount = lit.length;
  const candleSpacing = 36;
  const cakeWidth = candleCount * candleSpacing + 80;
  const startX = (cakeWidth - (candleCount - 1) * candleSpacing) / 2;

  return (
    <svg
      viewBox={`0 0 ${cakeWidth} 280`}
      width={Math.min(cakeWidth, 380)}
      style={{
        overflow: "visible",
        filter: "drop-shadow(0 20px 40px rgba(255,158,118,0.2))",
      }}
    >
      {/* plate */}
      <ellipse cx={cakeWidth / 2} cy={258} rx={cakeWidth / 2 - 10} ry={10} fill="#3a2540" opacity={0.6} />
      {/* base tier */}
      <rect x={20} y={170} width={cakeWidth - 40} height={88} rx={6} fill="url(#tier1)" />
      {/* drip */}
      <path
        d={`M 20 178 Q ${cakeWidth / 4} 200 ${cakeWidth / 2} 184 T ${cakeWidth - 20} 180 L ${cakeWidth - 20} 178 L 20 178 Z`}
        fill="#ffd89b"
        opacity={0.85}
      />
      {/* top tier */}
      <rect x={60} y={120} width={cakeWidth - 120} height={56} rx={5} fill="url(#tier2)" />
      {/* candles */}
      {lit.map((isLit, i) => {
        const cx = startX + i * candleSpacing;
        return (
          <g key={i} style={{ cursor: "pointer" }} onClick={() => onBlow(i)}>
            <rect x={cx - 16} y={40} width={32} height={90} fill="transparent" />
            <rect
              x={cx - 3}
              y={88}
              width={6}
              height={36}
              rx={1}
              fill={i % 2 === 0 ? "#ff9a76" : "#ffd89b"}
            />
            <rect x={cx - 0.5} y={82} width={1} height={8} fill="#3a2540" />
            {isLit && (
              <g
                style={{
                  transformOrigin: `${cx}px 80px`,
                  animation: "flame 0.6s ease-in-out infinite",
                }}
              >
                <ellipse cx={cx} cy={75} rx={5} ry={9} fill="#ffb56b" opacity={0.9} />
                <ellipse cx={cx} cy={73} rx={3} ry={6} fill="#fff8e7" />
                <circle cx={cx} cy={70} r={1.5} fill="#fff" />
              </g>
            )}
            {!isLit && (
              <motion.g
                initial={{ opacity: 0.7, y: 0 }}
                animate={{ opacity: 0, y: -30 }}
                transition={{ duration: 2, ease: "easeOut" }}
              >
                <circle cx={cx} cy={75} r={2} fill="rgba(245,233,212,0.4)" />
                <circle cx={cx + 2} cy={68} r={1.5} fill="rgba(245,233,212,0.3)" />
                <circle cx={cx - 2} cy={62} r={1} fill="rgba(245,233,212,0.2)" />
              </motion.g>
            )}
          </g>
        );
      })}
      <defs>
        <linearGradient id="tier1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff9a76" />
          <stop offset="100%" stopColor="#b46e58" />
        </linearGradient>
        <linearGradient id="tier2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd89b" />
          <stop offset="100%" stopColor="#e0a76a" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * 4. Photo Orbit — three.js carousel of Simren's photos
 *
 * Each photo becomes a textured plane orbiting the camera. Hover
 * pauses + zooms the focused plane. Scroll inside the section
 * advances the orbit (so the gallery feels scroll-driven).
 * ─────────────────────────────────────────────────────────────────── */
function PhotoOrbit({ photos, reduced }: { photos: string[]; reduced: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const activeIdxRef = useRef<number | null>(null);
  useEffect(() => {
    activeIdxRef.current = activeIdx;
  }, [activeIdx]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || photos.length === 0) return;

    const w = () => container.clientWidth;
    const h = () => container.clientHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w(), h());
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w() / h(), 0.1, 1000);
    camera.position.set(0, 0, 14);

    /* warm rim light + ambient */
    scene.add(new THREE.AmbientLight(0xfff0d6, 0.85));
    const dir = new THREE.DirectionalLight(0xffb56b, 0.6);
    dir.position.set(5, 8, 6);
    scene.add(dir);

    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";

    const planes: THREE.Mesh[] = [];
    const radius = Math.max(6, Math.min(9, photos.length * 0.9));
    const placeholderMat = new THREE.MeshStandardMaterial({
      color: 0x2a1a3a,
      roughness: 0.8,
    });

    photos.forEach((src, i) => {
      const angle = (i / photos.length) * Math.PI * 2;
      // landscape default; will adjust on load
      const geom = new THREE.PlaneGeometry(3.6, 2.4, 1, 1);
      const mesh = new THREE.Mesh(geom, placeholderMat);
      mesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      mesh.lookAt(0, 0, 0);
      mesh.userData.baseAngle = angle;
      mesh.userData.idx = i;
      scene.add(mesh);
      planes.push(mesh);

      loader.load(
        src,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
          const aspect = tex.image.width / tex.image.height;
          // Resize plane to match aspect — keep height at 3, width = 3*aspect
          const baseH = 3.0;
          const baseW = baseH * aspect;
          mesh.geometry.dispose();
          mesh.geometry = new THREE.PlaneGeometry(baseW, baseH, 1, 1);
          mesh.material = new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.5,
            metalness: 0.0,
            emissive: 0x110a1c,
            emissiveIntensity: 0.4,
            side: THREE.DoubleSide,
          });
        },
        undefined,
        () => {
          /* on error keep placeholder */
        },
      );
    });

    /* Raycaster for hover */
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredIdx: number | null = null;

    function onPointerMove(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    function onPointerLeave() {
      pointer.x = -1000;
      pointer.y = -1000;
    }
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);

    function onResize() {
      renderer.setSize(w(), h());
      camera.aspect = w() / h();
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onResize);

    /* scroll-driven offset */
    let scrollOffset = 0;
    function onScroll() {
      const sec = sectionRef.current;
      if (!sec) return;
      const rect = sec.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when section just enters bottom, 1 when fully scrolled past
      const p = 1 - (rect.top + rect.height / 2) / vh;
      scrollOffset = p;
    }
    const scrollContainer = sectionRef.current?.parentElement?.parentElement;
    scrollContainer?.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const clock = new THREE.Clock();
    let raf = 0;
    function tick() {
      const t = clock.getElapsedTime();

      // raycast for hover
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(planes);
      const newHover = hits.length > 0 ? (hits[0].object.userData.idx as number) : null;
      if (newHover !== hoveredIdx) {
        hoveredIdx = newHover;
        if (newHover !== activeIdxRef.current) setActiveIdx(newHover);
      }

      const orbitT = t * 0.08 + scrollOffset * Math.PI * 0.6;

      for (let i = 0; i < planes.length; i++) {
        const m = planes[i];
        const baseAngle = m.userData.baseAngle as number;
        const angle = baseAngle + orbitT;
        const isActive = i === hoveredIdx;
        const targetR = isActive ? radius * 0.62 : radius;
        // smooth radius
        const cur = m.position.length();
        const newR = cur + (targetR - cur) * 0.08;
        m.position.x = Math.cos(angle) * newR;
        m.position.z = Math.sin(angle) * newR;
        m.position.y = Math.sin(t * 0.5 + i) * 0.35; // gentle bob
        m.lookAt(0, 0, 0);
        // tiny tilt
        m.rotation.z = Math.sin(t * 0.4 + i * 0.7) * 0.05;
        // scale pop on active
        const targetScale = isActive ? 1.18 : 1.0;
        const curScale = m.scale.x;
        const nextScale = curScale + (targetScale - curScale) * 0.1;
        m.scale.set(nextScale, nextScale, nextScale);
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }
    if (!reduced) tick();
    else renderer.render(scene, camera);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      scrollContainer?.removeEventListener("scroll", onScroll);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      planes.forEach((m) => {
        m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat.dispose();
      });
      renderer.dispose();
      placeholderMat.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [photos, reduced]);

  return (
    <section
      ref={sectionRef}
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
          margin: "0 0 32px 0",
          color: "rgba(245,233,212,0.92)",
          fontWeight: 300,
          maxWidth: 640,
        }}
      >
        Moments worth keeping. Hover to hold one still.
      </motion.p>

      <div
        ref={containerRef}
        style={{
          width: "min(960px, 96vw)",
          height: "min(560px, 65vh)",
          position: "relative",
          borderRadius: 18,
          overflow: "hidden",
          background:
            "radial-gradient(ellipse at center, rgba(50,25,75,0.4) 0%, rgba(15,8,25,0.2) 70%)",
          boxShadow:
            "inset 0 0 60px rgba(255,196,128,0.06), 0 30px 80px rgba(0,0,0,0.5)",
        }}
      />

      <motion.p
        animate={{ opacity: activeIdx === null ? 0.4 : 0.85 }}
        transition={{ duration: 0.4 }}
        style={{
          marginTop: 24,
          fontSize: 12,
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          color: "rgba(245,233,212,0.55)",
        }}
      >
        {activeIdx === null
          ? `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`
          : `${(activeIdx + 1).toString().padStart(2, "0")} / ${photos.length
              .toString()
              .padStart(2, "0")}`}
      </motion.p>
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

/* ─────────────────────────────────────────────────────────────────────
 * 6. Constellation — WebGL particle sky; click to spawn glowing stars
 * ─────────────────────────────────────────────────────────────────── */
function ConstellationSection({ reduced }: { reduced: boolean }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const apiRef = useRef<{ addStarAt: (nx: number, ny: number) => void } | null>(
    null,
  );

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    const w = () => container.clientWidth;
    const h = () => container.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w(), h());
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.cursor = "crosshair";

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    camera.position.z = 1;

    /* background ambient stars (already-existing) */
    const ambientCount = reduced ? 80 : 240;
    const ambGeom = new THREE.BufferGeometry();
    const ambPos = new Float32Array(ambientCount * 3);
    const ambSize = new Float32Array(ambientCount);
    const rng = mulberry32(33);
    for (let i = 0; i < ambientCount; i++) {
      ambPos[i * 3] = (rng() * 2 - 1) * 0.95;
      ambPos[i * 3 + 1] = (rng() * 2 - 1) * 0.95;
      ambPos[i * 3 + 2] = 0;
      ambSize[i] = 1 + rng() * 2;
    }
    ambGeom.setAttribute("position", new THREE.BufferAttribute(ambPos, 3));
    ambGeom.setAttribute("size", new THREE.BufferAttribute(ambSize, 1));
    const ambMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vAlpha;
        void main() {
          vAlpha = 0.4 + 0.6 * sin(uTime * 1.5 + position.x * 8.0 + position.y * 6.0);
          gl_PointSize = size * uPixelRatio;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * vAlpha * 0.8;
          gl_FragColor = vec4(1.0, 0.96, 0.86, a);
        }
      `,
    });
    const ambient = new THREE.Points(ambGeom, ambMat);
    scene.add(ambient);

    /* user-spawned stars — accumulate into a single buffer */
    const MAX_STARS = 256;
    const starGeom = new THREE.BufferGeometry();
    const starPos = new Float32Array(MAX_STARS * 3);
    const starBirth = new Float32Array(MAX_STARS);
    const starColor = new Float32Array(MAX_STARS * 3);
    starGeom.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    starGeom.setAttribute("aBirth", new THREE.BufferAttribute(starBirth, 1));
    starGeom.setAttribute("aColor", new THREE.BufferAttribute(starColor, 3));
    starGeom.setDrawRange(0, 0);
    const starMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aBirth;
        attribute vec3 aColor;
        uniform float uTime;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vLife;
        void main() {
          float life = uTime - aBirth;
          // pop in then settle to gentle pulse
          float intro = smoothstep(0.0, 0.45, life);
          float pulse = 0.85 + 0.15 * sin(uTime * 2.5 + aBirth * 5.0);
          vLife = intro * pulse;
          vColor = aColor;
          gl_PointSize = (28.0 + 18.0 * intro) * uPixelRatio;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vLife;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          // sharp core + soft halo
          float core = smoothstep(0.18, 0.0, d);
          float halo = smoothstep(0.5, 0.18, d) * 0.55;
          float a = (core + halo) * vLife;
          vec3 col = mix(vColor, vec3(1.0, 0.97, 0.9), core * 0.7);
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    const userStars = new THREE.Points(starGeom, starMat);
    scene.add(userStars);

    /* connection lines — re-built on each add */
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffc480,
      transparent: true,
      opacity: 0.35,
    });
    let lineSeg: THREE.Line | null = null;

    let starCount = 0;
    const palette: [number, number, number][] = [
      [1.0, 0.85, 0.61],
      [1.0, 0.6, 0.46],
      [1.0, 0.49, 0.7],
      [0.7, 0.53, 1.0],
      [1.0, 0.97, 0.9],
    ];

    function addStarAt(nx: number, ny: number) {
      if (starCount >= MAX_STARS) return;
      starPos[starCount * 3] = nx;
      starPos[starCount * 3 + 1] = ny;
      starPos[starCount * 3 + 2] = 0;
      const c = palette[Math.floor(Math.random() * palette.length)];
      starColor[starCount * 3] = c[0];
      starColor[starCount * 3 + 1] = c[1];
      starColor[starCount * 3 + 2] = c[2];
      starBirth[starCount] = clock.getElapsedTime();
      starCount += 1;
      starGeom.setDrawRange(0, starCount);
      starGeom.attributes.position.needsUpdate = true;
      starGeom.attributes.aBirth.needsUpdate = true;
      starGeom.attributes.aColor.needsUpdate = true;

      // rebuild line strip
      if (lineSeg) {
        scene.remove(lineSeg);
        lineSeg.geometry.dispose();
        lineSeg = null;
      }
      if (starCount >= 2) {
        const lg = new THREE.BufferGeometry();
        const lp = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
          lp[i * 3] = starPos[i * 3];
          lp[i * 3 + 1] = starPos[i * 3 + 1];
          lp[i * 3 + 2] = -0.01;
        }
        lg.setAttribute("position", new THREE.BufferAttribute(lp, 3));
        lineSeg = new THREE.Line(lg, lineMat);
        scene.add(lineSeg);
      }

      setCount(starCount);
    }

    apiRef.current = { addStarAt };

    function onClick(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      addStarAt(nx, ny);
    }
    renderer.domElement.addEventListener("pointerdown", onClick);

    function onResize() {
      renderer.setSize(w(), h());
      ambMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      starMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    }
    window.addEventListener("resize", onResize);

    const clock = new THREE.Clock();
    let raf = 0;
    function tick() {
      const t = clock.getElapsedTime();
      ambMat.uniforms.uTime.value = t;
      starMat.uniforms.uTime.value = t;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onClick);
      starGeom.dispose();
      ambGeom.dispose();
      ambMat.dispose();
      starMat.dispose();
      lineMat.dispose();
      if (lineSeg) lineSeg.geometry.dispose();
      renderer.dispose();
      apiRef.current = null;
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [reduced]);

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
        Step Two
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1.2, delay: 0.3 }}
        style={{
          fontSize: "clamp(20px, 3vw, 30px)",
          fontStyle: "italic",
          margin: "0 0 16px 0",
          color: "rgba(245,233,212,0.92)",
          fontWeight: 300,
          maxWidth: 640,
        }}
      >
        Tap the sky. Place a star wherever you want one.
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 1.2, delay: 0.6 }}
        style={{
          fontSize: 13,
          color: "rgba(245,233,212,0.45)",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          margin: 0,
        }}
      >
        {count === 0
          ? "the canvas is yours"
          : `${count} ${count === 1 ? "star" : "stars"} for ${NAME}`}
      </motion.p>

      <div
        ref={canvasRef}
        style={{
          marginTop: 40,
          width: "min(720px, 92vw)",
          height: "min(420px, 60vh)",
          borderRadius: 18,
          border: "1px solid rgba(255,196,128,0.2)",
          background:
            "radial-gradient(ellipse at center, rgba(40,20,60,0.6) 0%, rgba(20,10,30,0.4) 70%)",
          position: "relative",
          overflow: "hidden",
          boxShadow:
            "inset 0 0 60px rgba(255,196,128,0.05), 0 20px 60px rgba(0,0,0,0.4)",
        }}
      />
    </section>
  );
}

/* ── 7. Finale ───────────────────────────────────────────────────────── */
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
          gap: 8,
        }}
      >
        <div style={{ width: 40, height: 1, background: "rgba(245,233,212,0.3)" }} />
        <div
          style={{
            fontSize: 13,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "rgba(245,233,212,0.5)",
          }}
        >
          with love
        </div>
        <div
          style={{
            fontSize: 22,
            fontStyle: "italic",
            color: "#ffd89b",
            marginTop: 4,
            fontFamily: "ui-serif, Georgia, serif",
          }}
        >
          — {FROM}
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
