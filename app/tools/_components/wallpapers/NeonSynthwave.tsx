"use client";

/* NeonSynthwave — Three.js retro outrun aesthetic.
 *
 * Replaces the old 2D-canvas faked-perspective version with a real 3D
 * scene: a procedural cyan grid plane scrolling toward a perspective
 * camera, a wireframe icosahedron "sun" fronted by horizontal scan
 * bars, a vertical sunset gradient sky with scattered stars, and a
 * slow horizontal scan band drifting across the canvas. No mouse
 * interaction — the camera bobs subtly and the grid streams forward,
 * selling kinetic motion. Same Suspense-friendly Three lazy-loading
 * pattern as NetworkMesh / ParticleGalaxy.
 *
 *   - PerspectiveCamera fov 60, position (0, 4, 14), lookAt (0, 2, -40)
 *     for a slightly downward forward gaze.
 *   - Sky plane: 200x100 at z=-90 with a ShaderMaterial that bakes the
 *     vertical gradient AND the star dots — one draw call instead of
 *     two. Stars use a hash-based dot field in the fragment shader.
 *   - Sun: wireframe IcosahedronGeometry at (0, 4, -60), magenta-orange
 *     emissive lines, fronted by a soft additive halo sprite. Three
 *     thin black PlaneGeometry bars sit a hair in front of the sun to
 *     fake CRT scan lines.
 *   - Grid: a 80x200 PlaneGeometry rotated flat at y=0, ShaderMaterial
 *     drawing procedural cyan lines from world coords. uScroll
 *     advances per frame so the lines slide toward the camera; a
 *     distance-based fade kills lines beyond the horizon.
 *   - Scan band: thin emissive plane that translates y from -2 up
 *     past camera height every 8s. Subtle additive blend.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Props {
  preview?: { w: number; h: number };
}

export default function NeonSynthwave({ preview }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    /* ─── Scene setup ────────────────────────────────────────────── */
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
    renderer.setClearColor(0x05010d, 1);
    container.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, {
      width: "100%",
      height: "100%",
      display: "block",
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 500);
    camera.position.set(0, 4, 14);
    camera.lookAt(0, 2, -40);
    const baseCamY = camera.position.y;

    /* ─── Sky plane: vertical gradient + procedural stars ──────── */
    const skyGeom = new THREE.PlaneGeometry(200, 100);
    const skyUniforms = {
      uStarDensity: { value: preview ? 0.0008 : 0.0012 },
      uTime: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        varying vec2 vUv;
        uniform float uStarDensity;
        uniform float uTime;

        // 2D hash for procedural stars.
        float hash(vec2 p) {
          p = fract(p * vec2(443.897, 441.423));
          p += dot(p, p.yx + 19.19);
          return fract((p.x + p.y) * p.x);
        }

        void main() {
          // vUv.y goes 0 (bottom) → 1 (top). Build the sunset:
          //   top (0.85+):    deep purple #1a0020
          //   upper-mid:      neon pink/red #ff006e
          //   lower-mid:      sunset orange #ffaa00
          //   bottom band:    fade to dark for the grid horizon
          vec3 top = vec3(0.102, 0.0, 0.125);
          vec3 pink = vec3(1.0, 0.0, 0.431);
          vec3 orange = vec3(1.0, 0.667, 0.0);
          vec3 horizon = vec3(0.02, 0.005, 0.05);

          float y = vUv.y;
          vec3 col;
          if (y > 0.65) {
            col = mix(pink, top, smoothstep(0.65, 1.0, y));
          } else if (y > 0.42) {
            col = mix(orange, pink, smoothstep(0.42, 0.65, y));
          } else {
            col = mix(horizon, orange, smoothstep(0.0, 0.42, y));
          }

          // Stars only in the upper region (y > 0.6). Hash a dense grid,
          // sparse threshold so most cells are empty.
          if (y > 0.6) {
            vec2 cell = floor(vUv * vec2(220.0, 110.0));
            float r = hash(cell);
            if (r > 1.0 - uStarDensity * 800.0) {
              // gentle twinkle
              float tw = 0.5 + 0.5 * sin(uTime * 1.4 + r * 31.0);
              float starAlpha = (0.55 + tw * 0.45) * smoothstep(0.6, 0.78, y);
              col = mix(col, vec3(1.0), starAlpha * 0.85);
            }
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthWrite: false,
    });
    const sky = new THREE.Mesh(skyGeom, skyMat);
    sky.position.set(0, 8, -90);
    scene.add(sky);

    /* ─── Sun: solid radial sprite + wireframe icosa + scan bars ── */
    // Soft radial halo behind the sun for the "bloom" look.
    const haloMat = new THREE.SpriteMaterial({
      map: makeRadialTexture("#ff6b9d", "#ffaa00"),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.85,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.position.set(0, 4, -60);
    halo.scale.set(38, 38, 1);
    scene.add(halo);

    // Wireframe icosahedron — gives the sun its retro mesh-globe feel.
    const sunGeom = new THREE.IcosahedronGeometry(10, 2);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xff6b9d,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });
    const sun = new THREE.Mesh(sunGeom, sunMat);
    sun.position.set(0, 4, -60);
    scene.add(sun);

    // CRT scan bars — three thin black planes a hair in front of the
    // sun to slice the bottom half. We position them on the lower
    // portion so the icosahedron's top stays unbroken.
    const scanBars: THREE.Mesh[] = [];
    const scanBarMat = new THREE.MeshBasicMaterial({
      color: 0x05010d,
      transparent: false,
    });
    const scanBarYs = [-1.2, -3.0, -5.2, -7.8];
    const scanBarHeights = [0.45, 0.6, 0.85, 1.2];
    for (let i = 0; i < scanBarYs.length; i++) {
      const bar = new THREE.Mesh(
        new THREE.PlaneGeometry(24, scanBarHeights[i]),
        scanBarMat
      );
      bar.position.set(0, 4 + scanBarYs[i], -59.5);
      scene.add(bar);
      scanBars.push(bar);
    }

    /* ─── Perspective grid: shader plane scrolling forward ─────── */
    const gridSegments = preview ? 1 : 1; // shader handles detail; segments don't matter
    const gridGeom = new THREE.PlaneGeometry(80, 200, gridSegments, gridSegments);
    gridGeom.rotateX(-Math.PI / 2); // lay flat
    const gridUniforms = {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uMajor: { value: 4.0 }, // z spacing for forward bands
      uMinor: { value: 4.0 }, // x spacing for perpendicular bands
      uLineWidth: { value: 0.06 },
      uColor: { value: new THREE.Color("#00ffff") },
      uFadeNear: { value: 4.0 },
      uFadeFar: { value: 95.0 },
    };
    const gridMat = new THREE.ShaderMaterial({
      uniforms: gridUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        varying vec3 vWorld;
        uniform float uTime;
        uniform float uScroll;
        uniform float uMajor;
        uniform float uMinor;
        uniform float uLineWidth;
        uniform vec3 uColor;
        uniform float uFadeNear;
        uniform float uFadeFar;

        // Anti-aliased line: returns 1 at the line, 0 elsewhere.
        // Uses fwidth so the line has constant pixel-thickness.
        float gridLine(float coord, float spacing, float width) {
          float m = mod(coord, spacing);
          float d = min(m, spacing - m);
          float aa = fwidth(coord) * 1.2;
          return 1.0 - smoothstep(width - aa, width + aa, d);
        }

        void main() {
          // Forward (z) lines scroll toward the viewer; perpendicular
          // (x) lines stay fixed.
          float zLines = gridLine(vWorld.z + uScroll, uMajor, uLineWidth);
          float xLines = gridLine(vWorld.x, uMinor, uLineWidth);
          float lines = max(zLines, xLines);

          // Distance-based fade: lines disappear into the horizon.
          float dist = length(vec2(vWorld.x, vWorld.z));
          float fade = 1.0 - smoothstep(uFadeNear, uFadeFar, dist);

          // Strong cyan with additive feel; alpha drops with distance.
          float a = lines * fade;
          if (a < 0.01) discard;

          // Slight color brighten on lines closer to the camera
          float brighten = mix(0.55, 1.0, fade);
          gl_FragColor = vec4(uColor * brighten, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const grid = new THREE.Mesh(gridGeom, gridMat);
    // Shift grid forward so the camera sits above the near edge of it.
    grid.position.set(0, 0, -90);
    scene.add(grid);

    /* ─── Horizon glow line: thin cyan emissive plane at horizon ── */
    const horizonGlowMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const horizonGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 0.15),
      horizonGlowMat
    );
    horizonGlow.position.set(0, 0.05, -55);
    scene.add(horizonGlow);

    /* ─── Scan band: thin emissive plane sweeping vertically ───── */
    const scanBandMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const scanBand = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 1.4),
      scanBandMat
    );
    scanBand.position.set(0, -2, -30);
    scene.add(scanBand);

    /* ─── Render loop ────────────────────────────────────────────── */
    let rafId = 0;
    let running = true;
    let last = performance.now();
    const startMs = last;

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
      const tSec = (now - startMs) / 1000;

      // Grid scroll: world units per second. Mod against major spacing
      // to keep precision tight over long sessions.
      gridUniforms.uScroll.value =
        (gridUniforms.uScroll.value + dt * 8.0) % gridUniforms.uMajor.value;
      gridUniforms.uTime.value = tSec;
      skyUniforms.uTime.value = tSec;

      // Subtle camera bob.
      camera.position.y = baseCamY + Math.sin(tSec * 0.9) * 0.08;
      camera.lookAt(0, 2, -40);

      // Slow sun rotation — sells the wireframe globe.
      sun.rotation.y += dt * 0.12;
      sun.rotation.x += dt * 0.04;

      // Vertical scan band: 8s period, y from -2 up to camera.y + 8.
      const period = 8.0;
      const phase = (tSec % period) / period; // 0..1
      scanBand.position.y = -2 + phase * (baseCamY + 10);

      renderer.render(scene, camera);
      if (!reduceMotion) rafId = requestAnimationFrame(frame);
    }

    if (reduceMotion) {
      // One static render, no rAF.
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
      ro?.disconnect();

      skyGeom.dispose();
      skyMat.dispose();
      sunGeom.dispose();
      sunMat.dispose();
      gridGeom.dispose();
      gridMat.dispose();
      horizonGlow.geometry.dispose();
      horizonGlowMat.dispose();
      scanBand.geometry.dispose();
      scanBandMat.dispose();
      for (const bar of scanBars) bar.geometry.dispose();
      scanBarMat.dispose();
      haloMat.map?.dispose();
      haloMat.dispose();

      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [preview]);

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

/* Two-stop radial gradient → CanvasTexture, used by the sun halo
 * sprite. Inner is hot, outer fades to transparent. */
function makeRadialTexture(inner: string, mid: string): THREE.CanvasTexture {
  const size = 128;
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
    grad.addColorStop(0, inner);
    grad.addColorStop(0.45, mid);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
