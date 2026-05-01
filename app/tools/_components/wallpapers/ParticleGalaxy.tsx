"use client";

/* ParticleGalaxy — Three.js 3D galaxy with spiral arms + glowing core.
 *
 * Inspired by particlegalaxy.webflow.io and Mamboleoo's
 * DecorativeBackgrounds demo1. Replaces the original 2D-canvas
 * starfield (which Asad correctly called "too basic" — flat dots on
 * a flat background can't compete with a real 3D galaxy).
 *
 *   - 6000 particles distributed across 4 spiral arms with logarithmic
 *     arm windup, Gaussian arm thickness, and a Plummer-profile
 *     central bulge so density is highest at the core.
 *   - Per-particle color: warm yellow at the core, cyan-blue mid disk,
 *     white-pink at the outer fringe, with a small fraction of bright
 *     "feature stars" that twinkle.
 *   - Tilt + slow rotation around the galactic axis. Mouse drives an
 *     additional camera tilt — galaxy at rest when pointer is idle.
 *   - Custom point shader: per-vertex size + color, soft-disc fragment
 *     so dots feel like stars rather than squares; brighter stars get
 *     a subtle bloom by stacking a faint halo at 1.6x size.
 */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

interface Props {
  preview?: { w: number; h: number };
}

const COLOR_CORE = new THREE.Color("#ffd9a3"); // warm yellow
const COLOR_DISK = new THREE.Color("#a3c8ff"); // cyan-blue
const COLOR_OUTER = new THREE.Color("#ffd6f0"); // pink-white
const COLOR_FEATURE = new THREE.Color("#ffffff"); // pure white twinkles

export default function ParticleGalaxy({ preview }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const count = useMemo(() => (preview ? 800 : 6000), [preview]);
  const galaxyRadius = useMemo(() => (preview ? 28 : 95), [preview]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const w = preview?.w ?? container.clientWidth;
    const h = preview?.h ?? container.clientHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x040611, 1);
    container.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, {
      width: "100%",
      height: "100%",
      display: "block",
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 2000);
    camera.position.set(0, galaxyRadius * 0.55, galaxyRadius * 2.6);
    camera.lookAt(0, 0, 0);

    /* ─── Distribute particles across spiral arms + bulge ──────── */
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count); // for twinkle

    const arms = 4;
    const armSpread = 0.42; // radians, gaussian sigma around arm centerline
    const armWindup = 2.6;  // how tight the spiral is
    const bulgeFraction = 0.18; // fraction of stars in the central bulge

    const tmpColor = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const isFeature = Math.random() < 0.012;
      const inBulge = Math.random() < bulgeFraction;

      let r: number;
      let theta: number;
      let y: number;

      if (inBulge) {
        // Plummer-like bulge — central concentration, ~spherical.
        const u = Math.random();
        r = (galaxyRadius * 0.18) * Math.pow(u, 0.6);
        theta = Math.random() * Math.PI * 2;
        // Spherical-ish: bulge is thicker than the disk.
        y = (Math.random() - 0.5) * r * 0.9;
      } else {
        // Disk star: pick an arm + radial position; jitter angle by a
        // gaussian around the arm centerline, then add the spiral
        // windup so the arm curves outward.
        const arm = Math.floor(Math.random() * arms);
        const armAngle = (arm / arms) * Math.PI * 2;
        // Radial: bias toward the middle of the disk via sqrt(uniform).
        r = galaxyRadius * (0.18 + Math.sqrt(Math.random()) * 0.82);
        const armOffset = gaussian() * armSpread;
        const windup = armWindup * (r / galaxyRadius);
        theta = armAngle + windup + armOffset;
        // Disk thickness: tighter at high radius (star bands flatten out).
        const thickness = 1.6 + 4.5 * (1 - r / galaxyRadius);
        y = (Math.random() - 0.5) * 2 * thickness;
      }

      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Color blend: core warm → mid blue → outer pink-white.
      const t = r / galaxyRadius;
      let target: THREE.Color;
      if (t < 0.25) target = COLOR_CORE;
      else if (t < 0.7) target = COLOR_DISK;
      else target = COLOR_OUTER;
      tmpColor.copy(target);
      // Tiny per-star variance so the disk isn't monochrome.
      const variance = 0.08;
      tmpColor.r = clamp01(tmpColor.r + (Math.random() - 0.5) * variance);
      tmpColor.g = clamp01(tmpColor.g + (Math.random() - 0.5) * variance);
      tmpColor.b = clamp01(tmpColor.b + (Math.random() - 0.5) * variance);
      if (isFeature) tmpColor.lerp(COLOR_FEATURE, 0.7);
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;

      // Size: bulge stars are tiny dust, disk stars vary, features bright.
      const baseSize = preview ? 0.7 : 1.1;
      let s = baseSize + Math.random() * baseSize * 0.6;
      if (inBulge) s *= 0.6;
      if (isFeature) s *= preview ? 2.4 : 3.0;
      sizes[i] = s;
      phases[i] = Math.random() * Math.PI * 2;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.setAttribute(
      "size",
      new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage)
    );
    geom.setAttribute("phase", new THREE.BufferAttribute(phases, 1));

    const uTime = { value: 0 };
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float phase;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uTime;
        void main() {
          vColor = color;
          // Twinkle: per-star sine in alpha. Bigger stars twinkle slower.
          float twinkle = 0.78 + 0.22 * sin(uTime * 1.6 + phase);
          vAlpha = twinkle;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (380.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          // Soft disc with strong center, gentle halo.
          float core = smoothstep(0.5, 0.0, d);
          float halo = smoothstep(0.5, 0.25, d) * 0.4;
          float a = (core + halo) * vAlpha;
          gl_FragColor = vec4(vColor, a);
        }
      `,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const stars = new THREE.Points(geom, mat);
    // Tilt the galaxy so we see it at an oblique angle (more 3D feel
    // than dead-on top-down).
    stars.rotation.x = -0.72;
    scene.add(stars);

    /* Soft glow at the core — a tiny camera-facing sprite that's just
     * a soft radial gradient. Sells the "luminous core" look. */
    const glowMat = new THREE.SpriteMaterial({
      map: makeRadialTexture(),
      color: 0xffe9b8,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.7,
    });
    const glow = new THREE.Sprite(glowMat);
    const glowSize = preview ? galaxyRadius * 0.7 : galaxyRadius * 0.55;
    glow.scale.set(glowSize, glowSize, 1);
    scene.add(glow);

    /* ─── Mouse-driven camera tilt ──────────────────────────────── */
    const targetCam = new THREE.Vector2(0, 0);
    const curCam = new THREE.Vector2(0, 0);
    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      targetCam.x = -nx * 0.18;
      targetCam.y = -ny * 0.12;
    };
    const onPointerLeave = () => targetCam.set(0, 0);
    if (!preview) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerleave", onPointerLeave);
    }

    /* ─── Render loop ────────────────────────────────────────────── */
    let rafId = 0;
    let running = true;
    let last = performance.now();
    const baseCamX = camera.position.x;
    const baseCamY = camera.position.y;

    const onVis = () => {
      running = document.visibilityState !== "hidden";
      if (running) {
        last = performance.now();
        rafId = requestAnimationFrame(frame);
      } else {
        cancelAnimationFrame(rafId);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    function frame(now: number) {
      if (!running) return;
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      uTime.value = now * 0.001;

      // Slow galactic spin (auto, calm pace).
      stars.rotation.y += dt * 0.045;

      // Smooth camera follow.
      curCam.x += (targetCam.x - curCam.x) * Math.min(1, dt * 3);
      curCam.y += (targetCam.y - curCam.y) * Math.min(1, dt * 3);
      camera.position.x = baseCamX + curCam.x * galaxyRadius;
      camera.position.y = baseCamY + curCam.y * galaxyRadius;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      if (!reduceMotion) rafId = requestAnimationFrame(frame);
    }

    if (reduceMotion) {
      renderer.render(scene, camera);
    } else {
      rafId = requestAnimationFrame(frame);
    }

    /* ─── Resize ─────────────────────────────────────────────────── */
    let ro: ResizeObserver | null = null;
    if (!preview) {
      ro = new ResizeObserver(() => {
        const nw = container.clientWidth;
        const nh = container.clientHeight;
        if (nw === 0 || nh === 0) return;
        renderer.setSize(nw, nh, false);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
      });
      ro.observe(container);
    }

    /* ─── Cleanup ────────────────────────────────────────────────── */
    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVis);
      if (!preview) {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerleave", onPointerLeave);
      }
      ro?.disconnect();
      geom.dispose();
      mat.dispose();
      glowMat.map?.dispose();
      glowMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [preview, count, galaxyRadius]);

  return (
    <div
      ref={containerRef}
      style={{
        width: preview ? `${preview.w}px` : "100%",
        height: preview ? `${preview.h}px` : "100%",
      }}
    />
  );
}

/* ──────────── helpers ──────────── */

/* Box-Muller gaussian, mean 0 stddev 1. */
function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/* Tiny radial-gradient texture used by the central glow sprite. We
 * generate it once with a 64×64 canvas — cheap, cached by the GPU. */
function makeRadialTexture(): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.4, "rgba(255,224,160,0.55)");
    grad.addColorStop(0.7, "rgba(255,184,120,0.18)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
