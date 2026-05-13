"use client";

/* Aurora — DARK MODE birthday experience for Simren Zahra · May 14, 2026.
 *
 * Layers (back → front):
 *   1. Deep navy / midnight gradient background.
 *   2. WebGL full-screen quad running a custom GLSL fragment shader that
 *      simulates flowing aurora ribbons (green / teal / magenta / purple).
 *      Click anywhere on the cake (or the sky) to fire an "aurora burst"
 *      that pulses brightness + saturation for ~1.6s.
 *   3. CSS snow particle system (canvas2D) — gentle vertical drift with
 *      slight horizontal sway. Density auto-scales for mobile / reduced-motion.
 *   4. Photo polaroids (plain <img>, NOT in WebGL — avoids EXIF rotation
 *      issues with iPhone JPGs). Slowly drift downward through the snow,
 *      subtle rotation + parallax.
 *   5. Foreground content — title, snow-iced tiered cake (SVG, click to
 *      blow out candles → triggers aurora burst), 7 wishes, sign-off.
 *
 * No "Asad" anywhere. Sign-off generic. Recipient: Simren / Simren Zahra.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type Props = { photos: string[] };

const WISHES: { title: string; body: string }[] = [
  {
    title: "to be the loudest in every room",
    body:
      "the room you walk into shifts a little. keep being unmistakable — the world is better when you take up space.",
  },
  {
    title: "to a year of yes",
    body:
      "yes to the trip, the dress, the dinner, the dare. the things that scare you a little are usually the right ones.",
  },
  {
    title: "to softness without apology",
    body:
      "you don't have to be hard to be strong. let the soft parts stay soft — they're the parts people fall in love with.",
  },
  {
    title: "to mornings that feel like yours",
    body:
      "slow ones, sunlit ones, the kind where you sit with your coffee and don't owe anyone an answer for ten whole minutes.",
  },
  {
    title: "to the people who get it",
    body:
      "the friends who text back fast. the ones who remember the small things. may your circle stay tight and warm and weirdly funny.",
  },
  {
    title: "to a season of small luxuries",
    body:
      "the good candle. the slow walk home. the second helping. you've earned more of the little things than you let yourself have.",
  },
  {
    title: "to whatever you're quietly hoping for",
    body:
      "the one you didn't say out loud. consider this a small nudge from the universe that it's noted, and it's on its way.",
  },
];

/* ============================================================
 * AURORA SHADER
 * Full-screen quad. Flowing ribbons of green / teal / magenta /
 * purple driven by stacked sin + simplex-ish noise. Burst uniform
 * pulses brightness + saturation when the cake is clicked.
 * ============================================================ */

const AURORA_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const AURORA_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uBurst;
  uniform vec2  uResolution;

  // Cheap hash + value noise (good enough for this scale).
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  // A single aurora ribbon at vertical center "centerY", thickness "thick".
  // Flow shifts with time + noise so ribbons ripple horizontally.
  float ribbon(vec2 uv, float centerY, float thick, float speed, float seed) {
    // horizontal warp
    float warp = fbm(vec2(uv.x * 1.6 + seed, uTime * speed + seed)) * 0.45;
    warp += sin(uv.x * 3.1 + uTime * (speed * 0.6) + seed * 4.0) * 0.06;
    float dy = uv.y - centerY - warp;

    // soft band falloff
    float band = exp(-pow(dy / thick, 2.0));

    // vertical streaks (the "curtain" feel) - high freq noise gated by band
    float streak = fbm(vec2(uv.x * 8.0 + seed * 3.0, uv.y * 26.0 - uTime * 0.6));
    streak = pow(streak, 2.4);

    return band * (0.55 + streak * 0.9);
  }

  void main() {
    vec2 uv = vUv;

    // base midnight sky — deep navy at top easing to near-black at bottom horizon
    vec3 skyTop    = vec3(0.018, 0.024, 0.075);   // very deep navy
    vec3 skyMid    = vec3(0.030, 0.045, 0.110);   // dark royal
    vec3 skyBottom = vec3(0.005, 0.008, 0.025);   // near-black horizon
    vec3 col = mix(skyBottom, skyMid, smoothstep(0.0, 0.55, uv.y));
    col = mix(col, skyTop, smoothstep(0.55, 1.0, uv.y));

    // faint twinkle stars (cheap)
    float starField = step(0.9965, hash(floor(uv * vec2(uResolution.x, uResolution.y) * 0.7)));
    float twinkle   = 0.6 + 0.4 * sin(uTime * 3.1 + hash(floor(uv * 700.0)) * 40.0);
    col += vec3(0.85, 0.88, 1.0) * starField * twinkle * 0.55;

    // three ribbons stacked at different heights / speeds / palettes
    float r1 = ribbon(uv, 0.62, 0.085, 0.18, 1.3);
    float r2 = ribbon(uv, 0.74, 0.110, 0.13, 7.7);
    float r3 = ribbon(uv, 0.55, 0.060, 0.22, 13.1);

    // palette: teal-green -> mint -> magenta -> violet
    vec3 cTeal    = vec3(0.10, 0.95, 0.65);
    vec3 cMint    = vec3(0.45, 1.00, 0.80);
    vec3 cMagenta = vec3(0.95, 0.30, 0.75);
    vec3 cViolet  = vec3(0.55, 0.35, 0.95);

    vec3 ribbonCol = vec3(0.0);
    ribbonCol += mix(cTeal, cMint, 0.5 + 0.5 * sin(uTime * 0.4)) * r1;
    ribbonCol += mix(cMagenta, cViolet, 0.5 + 0.5 * sin(uTime * 0.3 + 1.5)) * r2 * 0.85;
    ribbonCol += mix(cMint, cViolet, 0.5 + 0.5 * sin(uTime * 0.5 + 3.0)) * r3 * 0.7;

    // ribbons glow stronger near top, fade toward horizon
    float topMask = smoothstep(0.30, 0.95, uv.y);
    ribbonCol *= topMask;

    // overall intensity + burst pulse from cake click
    float burst = uBurst;
    col += ribbonCol * (1.05 + burst * 1.6);

    // burst also lifts saturation by mixing more of the dominant ribbon color
    col = mix(col, col * vec3(1.15, 1.05, 1.20), burst * 0.5);

    // subtle vignette so cake/text pops
    float v = distance(uv, vec2(0.5, 0.45));
    col *= smoothstep(1.05, 0.25, v);

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ============================================================
 * Aurora canvas — three.js shader on full-screen quad.
 * ============================================================ */

function AuroraSky({
  burstRef,
  reducedMotion,
}: {
  burstRef: React.MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    const dpr = Math.min(window.devicePixelRatio || 1, reducedMotion ? 1 : 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.domElement.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms = {
      uTime: { value: 0 },
      uBurst: { value: 0 },
      uResolution: {
        value: new THREE.Vector2(window.innerWidth, window.innerHeight),
      },
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader: AURORA_VERT,
      fragmentShader: AURORA_FRAG,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    scene.add(quad);

    let raf = 0;
    const start = performance.now();
    const speed = reducedMotion ? 0.25 : 1.0;

    const tick = () => {
      const now = performance.now();
      uniforms.uTime.value = ((now - start) / 1000) * speed;
      // ease burst toward 0
      const b = burstRef.current;
      uniforms.uBurst.value = b;
      burstRef.current = b * 0.96;
      if (burstRef.current < 0.001) burstRef.current = 0;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      quad.geometry.dispose();
      mat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [burstRef, reducedMotion]);

  return (
    <div
      ref={mountRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}

/* ============================================================
 * Snow — canvas2D particle system. Lightweight, no GL state.
 * ============================================================ */

function Snow({ reducedMotion }: { reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isMobile = window.innerWidth < 768;
    const baseDensity = isMobile ? 90 : 220;
    const density = reducedMotion ? Math.floor(baseDensity * 0.4) : baseDensity;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const sizeCanvas = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    sizeCanvas();

    type Flake = {
      x: number;
      y: number;
      r: number; // radius
      vy: number; // fall speed
      drift: number; // sin amplitude
      phase: number;
      alpha: number;
    };
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;
    const flakes: Flake[] = Array.from({ length: density }, () => ({
      x: Math.random() * W(),
      y: Math.random() * H(),
      r: 0.6 + Math.random() * 2.4,
      vy: 0.25 + Math.random() * 0.9,
      drift: 0.2 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.35 + Math.random() * 0.55,
    }));

    let raf = 0;
    let last = performance.now();
    const speedMul = reducedMotion ? 0.35 : 1.0;

    const tick = (now: number) => {
      const dt = Math.min(64, now - last) / 16.67; // normalize to ~60fps frames
      last = now;
      const w = W();
      const h = H();
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,1)";

      for (const f of flakes) {
        f.phase += 0.01 * dt;
        f.y += f.vy * dt * speedMul;
        f.x += Math.sin(f.phase) * f.drift * 0.4 * dt * speedMul;
        if (f.y - f.r > h) {
          f.y = -f.r;
          f.x = Math.random() * w;
        }
        if (f.x < -10) f.x = w + 10;
        if (f.x > w + 10) f.x = -10;

        ctx.globalAlpha = f.alpha;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
      }}
    />
  );
}

/* ============================================================
 * Drifting polaroids — plain <img>, EXIF respected by browser.
 * Each picks a column, drifts from above the viewport down, with
 * subtle rotation and parallax. Loops forever.
 * ============================================================ */

type DriftConfig = {
  src: string;
  left: number; // %
  size: number; // px (longest edge of polaroid, scaled on mobile)
  rotate: number;
  duration: number; // s
  delay: number; // s
  depth: number; // 0..1 affects opacity + blur
};

function PolaroidDrift({
  photos,
  reducedMotion,
  isMobile,
}: {
  photos: string[];
  reducedMotion: boolean;
  isMobile: boolean;
}) {
  const items: DriftConfig[] = useMemo(() => {
    if (!photos.length) return [];
    // distribute across viewport
    const cols = isMobile ? 4 : 8;
    return photos.map((src, i) => {
      const col = i % cols;
      const jitter = (Math.sin(i * 13.7) + 1) / 2; // deterministic 0..1
      const left = (col / cols) * 100 + (jitter * (100 / cols)) * 0.6 + 2;
      const size = isMobile
        ? 120 + Math.floor(jitter * 30)
        : 170 + Math.floor(jitter * 60);
      const rotate = (jitter - 0.5) * 14; // -7..+7 deg
      const duration = (reducedMotion ? 90 : 55) + jitter * 30;
      const delay = -((i * duration) / photos.length) * 0.9; // stagger so they're already mid-flight
      const depth = 0.45 + jitter * 0.55;
      return { src, left: Math.min(left, 92), size, rotate, duration, delay, depth };
    });
  }, [photos, reducedMotion, isMobile]);

  if (!items.length) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {items.map((it, i) => (
        <div
          key={i}
          className="aurora-polaroid"
          style={{
            position: "absolute",
            left: `${it.left}%`,
            top: 0,
            width: it.size,
            transform: `translateY(-30%) rotate(${it.rotate}deg)`,
            animation: `aurora-fall ${it.duration}s linear ${it.delay}s infinite`,
            opacity: 0.55 + it.depth * 0.4,
            filter: `blur(${(1 - it.depth) * 1.6}px)`,
            willChange: "transform",
          }}
        >
          <div
            style={{
              background: "rgba(245,248,255,0.94)",
              padding: "10px 10px 28px 10px",
              borderRadius: 4,
              boxShadow:
                "0 12px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.25) inset",
              backdropFilter: "blur(6px)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={it.src}
              alt=""
              draggable={false}
              loading="lazy"
              style={{
                display: "block",
                width: "100%",
                height: it.size,
                objectFit: "cover",
                borderRadius: 2,
                background: "#1a1a2e",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
 * Snow-iced tiered cake (SVG). Click anywhere on it to blow out
 * candles, which fires an aurora burst.
 * ============================================================ */

function Cake({ onBlow, lit }: { onBlow: () => void; lit: boolean }) {
  return (
    <button
      onClick={onBlow}
      aria-label={lit ? "Blow out the candles" : "Candles blown — relight by tapping"}
      style={{
        background: "transparent",
        border: 0,
        padding: 0,
        cursor: "pointer",
        display: "block",
        margin: "0 auto",
        filter: "drop-shadow(0 18px 30px rgba(0,0,0,0.6))",
      }}
    >
      <svg
        width="280"
        height="280"
        viewBox="0 0 280 280"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", maxWidth: "70vw", height: "auto" }}
      >
        <defs>
          <linearGradient id="tier1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f4f8ff" />
            <stop offset="100%" stopColor="#cdd8ec" />
          </linearGradient>
          <linearGradient id="tier2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#dde6f5" />
          </linearGradient>
          <linearGradient id="tier3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#e5edfa" />
          </linearGradient>
          <radialGradient id="flame" cx="0.5" cy="0.4" r="0.6">
            <stop offset="0%" stopColor="#fff7c2" stopOpacity="1" />
            <stop offset="55%" stopColor="#ffb347" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ff5e3a" stopOpacity="0" />
          </radialGradient>
          <filter id="flameGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
          {/* drip / icing path uses a wavy bottom edge for "snow" feel */}
        </defs>

        {/* plate */}
        <ellipse cx="140" cy="262" rx="118" ry="9" fill="rgba(255,255,255,0.12)" />
        <ellipse cx="140" cy="260" rx="110" ry="6" fill="rgba(180,200,235,0.35)" />

        {/* bottom tier */}
        <g>
          <rect x="40" y="190" width="200" height="62" rx="5" fill="url(#tier1)" />
          {/* drippy icing */}
          <path
            d="M40 200
               q10 14 20 0 q10 14 20 0 q10 14 20 0 q10 14 20 0
               q10 14 20 0 q10 14 20 0 q10 14 20 0 q10 14 20 0
               q10 14 20 0 q10 14 20 0
               L240 190 L40 190 Z"
            fill="#ffffff"
          />
          {/* frost dots */}
          {Array.from({ length: 14 }).map((_, i) => (
            <circle
              key={i}
              cx={50 + i * 13.5}
              cy={232 + ((i % 3) - 1) * 4}
              r={1.4}
              fill="rgba(255,255,255,0.85)"
            />
          ))}
          <ellipse cx="140" cy="190" rx="100" ry="6" fill="#f4f8ff" />
        </g>

        {/* middle tier */}
        <g>
          <rect x="65" y="138" width="150" height="56" rx="4" fill="url(#tier2)" />
          <path
            d="M65 148
               q9 12 18 0 q9 12 18 0 q9 12 18 0 q9 12 18 0
               q9 12 18 0 q9 12 18 0 q9 12 18 0 q9 12 18 0
               L215 138 L65 138 Z"
            fill="#ffffff"
          />
          {Array.from({ length: 10 }).map((_, i) => (
            <circle
              key={i}
              cx={75 + i * 14}
              cy={178 + ((i % 2) - 0.5) * 6}
              r={1.2}
              fill="rgba(255,255,255,0.9)"
            />
          ))}
          <ellipse cx="140" cy="138" rx="75" ry="5" fill="#f4f8ff" />
        </g>

        {/* top tier */}
        <g>
          <rect x="92" y="92" width="96" height="50" rx="4" fill="url(#tier3)" />
          <path
            d="M92 100
               q8 10 16 0 q8 10 16 0 q8 10 16 0 q8 10 16 0
               q8 10 16 0 q8 10 16 0
               L188 92 L92 92 Z"
            fill="#ffffff"
          />
          <ellipse cx="140" cy="92" rx="48" ry="4" fill="#f4f8ff" />
        </g>

        {/* candles — 3 candles on top tier */}
        {[
          { x: 110, color: "#ff7eb3" },
          { x: 140, color: "#9bc7ff" },
          { x: 170, color: "#b6f0d0" },
        ].map((c, i) => (
          <g key={i}>
            {/* candle */}
            <rect
              x={c.x - 3.5}
              y={62}
              width={7}
              height={32}
              rx={1.5}
              fill={c.color}
            />
            {/* wax drip */}
            <ellipse cx={c.x} cy={94} rx={4.2} ry={1.4} fill={c.color} opacity={0.7} />
            {/* wick */}
            <line
              x1={c.x}
              y1={62}
              x2={c.x}
              y2={56}
              stroke="#2a1a10"
              strokeWidth={1.2}
              strokeLinecap="round"
            />
            {/* flame */}
            {lit && (
              <g style={{ transformOrigin: `${c.x}px 50px` }} className="aurora-flame">
                <ellipse
                  cx={c.x}
                  cy={50}
                  rx={5.5}
                  ry={9}
                  fill="url(#flame)"
                  filter="url(#flameGlow)"
                />
                <ellipse cx={c.x} cy={52} rx={2.4} ry={4.5} fill="#fff8d8" />
              </g>
            )}
            {/* smoke trail when blown */}
            {!lit && (
              <g opacity={0.55}>
                <path
                  d={`M${c.x} 56 q6 -10 -2 -18 q-6 -8 4 -16`}
                  stroke="rgba(220,230,255,0.5)"
                  strokeWidth={1.2}
                  fill="none"
                  strokeLinecap="round"
                  className="aurora-smoke"
                />
              </g>
            )}
          </g>
        ))}
      </svg>
    </button>
  );
}

/* ============================================================
 * MAIN EXPERIENCE
 * ============================================================ */

export default function AuroraExperience({ photos }: Props) {
  const burstRef = useRef(0);
  const [lit, setLit] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mqMobile = window.matchMedia("(max-width: 767px)");
    setReducedMotion(mqMotion.matches);
    setIsMobile(mqMobile.matches);
    const onM = () => setReducedMotion(mqMotion.matches);
    const onMb = () => setIsMobile(mqMobile.matches);
    mqMotion.addEventListener("change", onM);
    mqMobile.addEventListener("change", onMb);
    return () => {
      mqMotion.removeEventListener("change", onM);
      mqMobile.removeEventListener("change", onMb);
    };
  }, []);

  const blow = () => {
    setHint(false);
    if (lit) {
      // first click — blow them out + big aurora burst
      setLit(false);
      burstRef.current = 1.0;
      // tiny delayed second pulse for richness
      window.setTimeout(() => {
        burstRef.current = Math.max(burstRef.current, 0.55);
      }, 280);
    } else {
      // relight — small burst
      setLit(true);
      burstRef.current = 0.4;
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        overflow: "auto",
        background:
          "radial-gradient(ellipse at 50% 110%, #03060f 0%, #050a1a 40%, #02030a 100%)",
        color: "#eaf2ff",
        fontFamily:
          "ui-serif, 'Iowan Old Style', 'Apple Garamond', Georgia, 'Times New Roman', serif",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <AuroraSky burstRef={burstRef} reducedMotion={reducedMotion} />
      <Snow reducedMotion={reducedMotion} />
      <PolaroidDrift photos={photos} reducedMotion={reducedMotion} isMobile={isMobile} />

      {/* foreground content */}
      <div
        style={{
          position: "relative",
          zIndex: 5,
          maxWidth: 760,
          margin: "0 auto",
          padding: "10vh 22px 14vh",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontSize: 11,
            letterSpacing: "0.42em",
            textTransform: "uppercase",
            color: "rgba(180,210,255,0.65)",
            margin: "0 0 18px",
          }}
        >
          May 14, 2026 · under the lights
        </p>

        <h1
          style={{
            fontSize: "clamp(40px, 8vw, 76px)",
            fontWeight: 300,
            fontStyle: "italic",
            lineHeight: 1.04,
            margin: 0,
            background:
              "linear-gradient(110deg, #b6f0d0 0%, #9bc7ff 35%, #d8b4ff 70%, #ff9ed1 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            textShadow: "0 0 38px rgba(155,199,255,0.18)",
          }}
        >
          Happy Birthday,
          <br />
          Simren
        </h1>

        <p
          style={{
            marginTop: 26,
            fontSize: 16,
            lineHeight: 1.7,
            color: "rgba(220,232,255,0.80)",
            fontStyle: "italic",
            maxWidth: 460,
            marginInline: "auto",
          }}
        >
          The sky did a thing tonight. It&rsquo;s yours.
        </p>

        {/* Frosted-glass card holding the cake */}
        <div
          style={{
            marginTop: 56,
            display: "inline-block",
            padding: "28px 36px 22px",
            borderRadius: 22,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
            border: "1px solid rgba(180,210,255,0.18)",
            boxShadow:
              "0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)",
            backdropFilter: "blur(14px) saturate(1.1)",
            WebkitBackdropFilter: "blur(14px) saturate(1.1)",
          }}
        >
          <Cake onBlow={blow} lit={lit} />
          <p
            style={{
              marginTop: 8,
              marginBottom: 0,
              fontSize: 12,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: "rgba(200,220,255,0.55)",
              transition: "opacity 400ms ease",
              opacity: hint ? 1 : 0.35,
            }}
          >
            {lit ? "tap the cake — make a wish" : "wish made · tap to relight"}
          </p>
        </div>

        {/* Wishes — 7 */}
        <section
          style={{
            marginTop: 110,
            display: "grid",
            gap: 18,
          }}
        >
          <h2
            style={{
              fontSize: 13,
              letterSpacing: "0.42em",
              textTransform: "uppercase",
              color: "rgba(155,199,255,0.7)",
              margin: "0 0 12px",
              fontWeight: 500,
            }}
          >
            seven wishes
          </h2>

          {WISHES.map((w, i) => (
            <article
              key={i}
              style={{
                textAlign: "left",
                padding: "22px 26px",
                borderRadius: 16,
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015))",
                border: "1px solid rgba(180,210,255,0.14)",
                backdropFilter: "blur(10px) saturate(1.05)",
                WebkitBackdropFilter: "blur(10px) saturate(1.05)",
                boxShadow:
                  "0 14px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 14,
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.3em",
                    color: "rgba(182,240,208,0.85)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "clamp(18px, 2.4vw, 22px)",
                    fontStyle: "italic",
                    fontWeight: 400,
                    color: "#eaf2ff",
                  }}
                >
                  {w.title}
                </h3>
              </div>
              <p
                style={{
                  margin: 0,
                  marginLeft: 32,
                  fontSize: 15,
                  lineHeight: 1.7,
                  color: "rgba(220,232,255,0.78)",
                }}
              >
                {w.body}
              </p>
            </article>
          ))}
        </section>

        {/* sign-off */}
        <footer
          style={{
            marginTop: 110,
            paddingTop: 40,
            borderTop: "1px solid rgba(180,210,255,0.15)",
          }}
        >
          <p
            style={{
              fontSize: 18,
              fontStyle: "italic",
              color: "rgba(230,240,255,0.85)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Simren Zahra — twenty-something and luminous as ever.
            <br />
            Go enjoy the lights.
          </p>
          <p
            style={{
              marginTop: 22,
              fontSize: 11,
              letterSpacing: "0.42em",
              textTransform: "uppercase",
              color: "rgba(155,199,255,0.45)",
            }}
          >
            with love · 14 · 05 · 2026
          </p>
        </footer>
      </div>

      <style>{`
        @keyframes aurora-fall {
          0% {
            transform: translateY(-30vh) rotate(var(--r, 0deg));
          }
          100% {
            transform: translateY(120vh) rotate(var(--r, 0deg));
          }
        }
        .aurora-polaroid {
          --r: 0deg;
        }
        @keyframes aurora-flicker {
          0%, 100% { transform: scaleY(1) scaleX(1); opacity: 1; }
          25%      { transform: scaleY(1.08) scaleX(0.96); opacity: 0.92; }
          50%      { transform: scaleY(0.94) scaleX(1.04); opacity: 1; }
          75%      { transform: scaleY(1.04) scaleX(0.98); opacity: 0.95; }
        }
        .aurora-flame {
          animation: aurora-flicker 1.6s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center bottom;
        }
        @keyframes aurora-smoke {
          0%   { opacity: 0.55; transform: translateY(0); }
          100% { opacity: 0;    transform: translateY(-14px); }
        }
        .aurora-smoke {
          animation: aurora-smoke 2.6s ease-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .aurora-flame, .aurora-smoke { animation: none; }
        }
      `}</style>
    </div>
  );
}
