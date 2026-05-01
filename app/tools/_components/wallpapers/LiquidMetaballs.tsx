"use client";

/* LiquidMetaballs — Three.js fragment-shader raymarched SDF.
 *
 * Replaces the old 2D-canvas additive-blob trick with a real WebGL
 * implementation: a single full-screen quad + an ortho camera, and a
 * fragment shader that raymarches a polynomial-smin'd union of N
 * spheres ("metaballs"). True 3D with normals, diffuse + rim shading,
 * and per-ball color blending — looks like fluid metal/jelly rather
 * than overlapping radial gradients.
 *
 *   - 9 balls in full mode, 6 in preview.
 *   - Each ball drifts on its own sin/cos orbit at desynced
 *     frequencies + radii so they merge and split organically.
 *   - One ball follows the mouse with spring smoothing — when the
 *     pointer is idle, it auto-orbits so the scene never feels static.
 *   - 64 raymarch steps in full mode, 36 in preview.
 *   - DPR clamp 1.5 (raymarching is GPU-heavy; 2dpr on retina cooks
 *     M1s, and Asad has been thermally cautious).
 *   - Pauses on visibilitychange, respects prefers-reduced-motion,
 *     resizes via ResizeObserver, disposes everything on unmount.
 */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

interface Props {
  preview?: { w: number; h: number };
}

export default function LiquidMetaballs({ preview }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const ballCount = useMemo(() => (preview ? 6 : 9), [preview]);
  const stepCount = useMemo(() => (preview ? 36 : 64), [preview]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    /* ─── Renderer + scene ───────────────────────────────────────── */
    const w = preview?.w ?? container.clientWidth;
    const h = preview?.h ?? container.clientHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: false, // raymarcher already shades smoothly; AA is wasted GPU
      alpha: false,
      powerPreference: "low-power",
    });
    // 1.5 cap (not 2): raymarching is fragment-bound, retina kills mid GPUs.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    container.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, {
      width: "100%",
      height: "100%",
      display: "block",
    });

    const scene = new THREE.Scene();
    // Ortho camera covering the [-1,1] clip-space quad.
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    /* ─── Uniforms + material ────────────────────────────────────── */
    // Pre-allocate the ball uniform array. Each Vector4 is (x, y, z, radius).
    const ballsUniform: THREE.Vector4[] = [];
    for (let i = 0; i < ballCount; i++) {
      ballsUniform.push(new THREE.Vector4(0, 0, 0, 0.5));
    }

    const uTime = { value: 0 };
    const uResolution = { value: new THREE.Vector2(w * dpr, h * dpr) };
    const uMouse = { value: new THREE.Vector2(0, 0) };
    const uBalls = { value: ballsUniform };

    const fragmentShader = /* glsl */ `
      precision highp float;

      uniform float uTime;
      uniform vec2  uResolution;
      uniform vec2  uMouse;
      uniform vec4  uBalls[${ballCount}];

      // Polynomial smooth-min — the classic iq metaball formulation.
      // Returns merged distance; the closer-ball weight is recoverable
      // via the same h, which we use for color blending below.
      float smin(float a, float b, float k) {
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.0 - h);
      }

      // SDF of a sphere centered at origin.
      float sdSphere(vec3 p, float r) {
        return length(p) - r;
      }

      // Scene SDF + ball-id influence (for color). Returns
      // vec2(distance, dominantBallIndexAsFloat).
      vec2 scene(vec3 p) {
        float k = 0.6;
        float d = sdSphere(p - uBalls[0].xyz, uBalls[0].w);
        float dominant = 0.0;
        for (int i = 1; i < ${ballCount}; i++) {
          float di = sdSphere(p - uBalls[i].xyz, uBalls[i].w);
          // Track which ball is closest before the smin merges them.
          // (Used for color, not distance.)
          if (di < d) dominant = float(i);
          d = smin(d, di, k);
        }
        return vec2(d, dominant);
      }

      // Central-difference normal of the SDF.
      vec3 calcNormal(vec3 p) {
        const float e = 0.001;
        return normalize(vec3(
          scene(p + vec3(e, 0.0, 0.0)).x - scene(p - vec3(e, 0.0, 0.0)).x,
          scene(p + vec3(0.0, e, 0.0)).x - scene(p - vec3(0.0, e, 0.0)).x,
          scene(p + vec3(0.0, 0.0, e)).x - scene(p - vec3(0.0, 0.0, e)).x
        ));
      }

      // Map a ball index → base color. Cycles through magenta / cyan / amber
      // so adjacent balls don't always get the same hue.
      vec3 ballColor(float idx) {
        // 0,3,6 → magenta; 1,4,7 → cyan; 2,5,8 → amber
        int m = int(mod(idx + 0.5, 3.0));
        if (m == 0) return vec3(0.851, 0.275, 0.937); // #d946ef
        if (m == 1) return vec3(0.024, 0.714, 0.831); // #06b6d4
        return vec3(0.961, 0.620, 0.043);             // #f59e0b
      }

      void main() {
        // Aspect-correct NDC for the ray direction.
        vec2 frag = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
        float aspect = uResolution.x / uResolution.y;
        frag.x *= aspect;

        // 60° fov pinhole camera at (0,0,4) looking toward -z.
        // tan(30deg) ≈ 0.5774
        vec3 ro = vec3(0.0, 0.0, 4.0);
        vec3 rd = normalize(vec3(frag * 0.5774, -1.0));

        // Background: deep indigo at the bottom, near-black at the top.
        // Use a pre-aspect screen-space y so the gradient matches the
        // viewport, not the raymarched scene.
        float bgT = clamp(gl_FragCoord.y / uResolution.y, 0.0, 1.0);
        vec3 bg = mix(vec3(0.04, 0.02, 0.13), vec3(0.01, 0.005, 0.04), bgT);

        // Raymarch.
        float t = 0.0;
        float dominant = 0.0;
        bool hit = false;
        for (int i = 0; i < ${stepCount}; i++) {
          vec3 p = ro + rd * t;
          vec2 res = scene(p);
          if (res.x < 0.001) {
            dominant = res.y;
            hit = true;
            break;
          }
          t += res.x;
          if (t > 12.0) break;
        }

        vec3 col = bg;
        if (hit) {
          vec3 p = ro + rd * t;
          vec3 n = calcNormal(p);
          vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
          float diff = max(dot(n, lightDir), 0.0);
          float ambient = 0.18;

          vec3 base = ballColor(dominant);
          vec3 lit = base * (ambient + diff * 0.95);

          // Rim/fresnel — boosts the silhouette so blobs read as
          // glassy/metallic rather than flat-shaded.
          float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * 0.6;
          lit += rim * mix(vec3(1.0), base, 0.4);

          col = lit;
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const vertexShader = /* glsl */ `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime,
        uResolution,
        uMouse,
        uBalls,
      },
      vertexShader,
      fragmentShader,
      depthWrite: false,
      depthTest: false,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(geometry, material);
    scene.add(quad);

    /* ─── Mouse tracking ─────────────────────────────────────────── */
    const mouseTarget = new THREE.Vector2(0, 0);
    const mouseSmooth = new THREE.Vector2(0, 0);
    let pointerActive = false;

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mouseTarget.set(nx, ny);
      pointerActive = true;
    };
    const onPointerLeave = () => {
      pointerActive = false;
      mouseTarget.set(0, 0);
    };
    if (!preview) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerleave", onPointerLeave);
    }

    /* ─── Render loop ────────────────────────────────────────────── */
    let rafId = 0;
    let running = true;
    let last = performance.now();

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

    // Update ball positions for time t. Last ball is mouse-driven; the
    // rest drift on per-ball sin/cos orbits with offset frequencies so
    // they don't move in sync.
    function updateBalls(t: number) {
      const last = ballCount - 1;
      for (let i = 0; i < ballCount; i++) {
        const b = ballsUniform[i];
        if (i === last) {
          // Mouse-driven ball. Auto-orbits when pointer is idle.
          if (pointerActive) {
            // Spring smoothing toward mouse target.
            mouseSmooth.x += (mouseTarget.x - mouseSmooth.x) * 0.12;
            mouseSmooth.y += (mouseTarget.y - mouseSmooth.y) * 0.12;
            b.set(mouseSmooth.x * 1.5, mouseSmooth.y * 1.5, 0.5, 0.55);
          } else {
            // Idle auto-orbit so the scene keeps moving.
            const ax = Math.cos(t * 0.4) * 1.2;
            const ay = Math.sin(t * 0.5) * 0.9;
            mouseSmooth.x += (ax / 1.5 - mouseSmooth.x) * 0.04;
            mouseSmooth.y += (ay / 1.5 - mouseSmooth.y) * 0.04;
            b.set(ax, ay, 0.5, 0.55);
          }
        } else {
          // Independent orbit per ball — different freqs, radii, phases.
          const fi = i + 1;
          const fx = 0.6 + i * 0.07;
          const fy = 0.5 + i * 0.09;
          const fz = 0.4 + i * 0.05;
          const rx = 1.1 + (i % 3) * 0.25;
          const ry = 0.9 + ((i + 1) % 3) * 0.22;
          const rz = 0.6 + ((i + 2) % 3) * 0.18;
          const px = i * 1.37;
          const py = i * 2.11;
          const pz = i * 0.79;
          const x = Math.sin(t * fx + px) * rx;
          const y = Math.cos(t * fy + py) * ry;
          const z = Math.sin(t * fz + pz) * rz;
          const radius = 0.5 + 0.2 * Math.sin(t * 0.7 + fi);
          b.set(x, y, z, radius);
        }
      }
    }

    function frame(now: number) {
      if (!running) return;
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      const t = now * 0.001;
      uTime.value = t;
      void dt; // dt isn't needed — orbits are time-driven, not integrated

      updateBalls(t);

      renderer.render(scene, camera);
      if (!reduceMotion) rafId = requestAnimationFrame(frame);
    }

    if (reduceMotion) {
      // One static frame and stop.
      updateBalls(0);
      uTime.value = 0;
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
        const npr = renderer.getPixelRatio();
        uResolution.value.set(nw * npr, nh * npr);
        // Ortho camera covers full clip space; no aspect on the camera
        // itself — aspect is corrected inside the fragment shader.
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
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [preview, ballCount, stepCount]);

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
