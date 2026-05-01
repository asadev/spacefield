"use client";

/* NetworkMesh — Three.js sphere of dots connected by line segments.
 *
 * Heavily inspired by Mamboleoo's DecorativeBackgrounds demo1
 * (https://github.com/Mamboleoo/DecorativeBackgrounds/blob/master/js/demo1.js):
 *
 *   - ~1800 dots distributed on a sphere shell using a Fibonacci
 *     spiral (visually even, no clumps at the poles).
 *   - Pairs within a small distance threshold are connected by short
 *     white line segments — that's the "mesh" look.
 *   - The whole sphere auto-rotates very slowly and tilts toward the
 *     mouse via a quaternion slerp. NOT brownian random motion — the
 *     network is at rest unless you push it.
 *   - A Raycaster intersects against the dots; hovered dots scale up
 *     elastically (per-vertex size attribute) and the lines emanating
 *     from them brighten. Snap back smoothly when you move away.
 *
 * Lazy-loads Three via DesktopBackground's Suspense boundary so users
 * on a static wallpaper never download it. Pauses on
 * visibilitychange. Respects prefers-reduced-motion (renders one
 * static frame and stops).
 */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

interface Props {
  preview?: { w: number; h: number };
}

const PALETTE_NODE = new THREE.Color("#a8c7ff"); // soft cyan-blue
const PALETTE_EDGE = new THREE.Color("#7fb6ff"); // slightly bluer for lines
const HOVER_TINT = new THREE.Color("#ffffff");

export default function NetworkMesh({ preview }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Reduce density when used as a thumbnail.
  const dotCount = useMemo(() => (preview ? 320 : 1800), [preview]);
  const radius = useMemo(() => (preview ? 35 : 100), [preview]);
  const linkDist = useMemo(() => (preview ? 9 : 9), [preview]);

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
    renderer.setClearColor(0x070914, 1);
    container.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, {
      width: "100%",
      height: "100%",
      display: "block",
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
    camera.position.set(0, 0, radius * 3.4);

    const galaxy = new THREE.Group();
    scene.add(galaxy);

    /* ─── Dots: Fibonacci sphere, BufferGeometry with size attr ──── */
    const positions = new Float32Array(dotCount * 3);
    const sizes = new Float32Array(dotCount);
    const baseSize = preview ? 1.4 : 2.0;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    interface Dot {
      pos: THREE.Vector3;
      base: number;
      target: number;
      cur: number;
    }
    const dots: Dot[] = new Array(dotCount);

    for (let i = 0; i < dotCount; i++) {
      const y = 1 - (i / (dotCount - 1)) * 2; // -1..1
      const r = Math.sqrt(1 - y * y);
      const t = goldenAngle * i;
      const x = Math.cos(t) * r;
      const z = Math.sin(t) * r;
      const v = new THREE.Vector3(x, y, z).multiplyScalar(radius);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
      sizes[i] = baseSize;
      dots[i] = { pos: v, base: baseSize, target: baseSize, cur: baseSize };
    }

    const dotGeom = new THREE.BufferGeometry();
    dotGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    dotGeom.setAttribute(
      "size",
      new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage)
    );

    /* Round-dot shader — replaces the dotTexture.png trick from the
     * reference; we draw a soft circle directly in the fragment shader
     * so there's no asset to ship. Size is per-vertex so hover scaling
     * is GPU-cheap. */
    const dotMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: PALETTE_NODE },
        uHover: { value: HOVER_TINT },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        varying float vSize;
        void main() {
          vSize = size;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform vec3 uColor;
        uniform vec3 uHover;
        varying float vSize;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.35, d);
          float hoverMix = smoothstep(2.5, 6.0, vSize);
          vec3 c = mix(uColor, uHover, hoverMix);
          gl_FragColor = vec4(c, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    const points = new THREE.Points(dotGeom, dotMat);
    galaxy.add(points);

    /* ─── Edge mesh: short white segments between near-neighbors ─── */
    const edgePairs: Array<[number, number]> = [];
    // Spatial hashing so we don't do O(n²) on 1800 dots.
    const cellSize = linkDist;
    const grid = new Map<string, number[]>();
    const key = (x: number, y: number, z: number) =>
      `${Math.floor(x / cellSize)}|${Math.floor(y / cellSize)}|${Math.floor(z / cellSize)}`;
    for (let i = 0; i < dotCount; i++) {
      const v = dots[i].pos;
      const k = key(v.x, v.y, v.z);
      const bucket = grid.get(k) ?? [];
      bucket.push(i);
      grid.set(k, bucket);
    }
    const linkSq = linkDist * linkDist;
    for (let i = 0; i < dotCount; i++) {
      const v = dots[i].pos;
      const cx = Math.floor(v.x / cellSize);
      const cy = Math.floor(v.y / cellSize);
      const cz = Math.floor(v.z / cellSize);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const bucket = grid.get(`${cx + dx}|${cy + dy}|${cz + dz}`);
            if (!bucket) continue;
            for (const j of bucket) {
              if (j <= i) continue;
              const u = dots[j].pos;
              const ddx = u.x - v.x;
              const ddy = u.y - v.y;
              const ddz = u.z - v.z;
              if (ddx * ddx + ddy * ddy + ddz * ddz < linkSq) {
                edgePairs.push([i, j]);
              }
            }
          }
        }
      }
    }

    const edgePos = new Float32Array(edgePairs.length * 6);
    const edgeAlpha = new Float32Array(edgePairs.length * 2);
    for (let e = 0; e < edgePairs.length; e++) {
      const [i, j] = edgePairs[e];
      const a = dots[i].pos;
      const b = dots[j].pos;
      edgePos[e * 6 + 0] = a.x;
      edgePos[e * 6 + 1] = a.y;
      edgePos[e * 6 + 2] = a.z;
      edgePos[e * 6 + 3] = b.x;
      edgePos[e * 6 + 4] = b.y;
      edgePos[e * 6 + 5] = b.z;
      edgeAlpha[e * 2 + 0] = 0.18;
      edgeAlpha[e * 2 + 1] = 0.18;
    }
    const edgeGeom = new THREE.BufferGeometry();
    edgeGeom.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
    edgeGeom.setAttribute(
      "alpha",
      new THREE.BufferAttribute(edgeAlpha, 1).setUsage(THREE.DynamicDrawUsage)
    );

    const edgeMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: PALETTE_EDGE } },
      vertexShader: /* glsl */ `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(uColor, vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    const edges = new THREE.LineSegments(edgeGeom, edgeMat);
    galaxy.add(edges);

    // Per-edge index lookup: which edges touch a given dot index?
    const edgesAtDot: number[][] = new Array(dotCount);
    for (let i = 0; i < dotCount; i++) edgesAtDot[i] = [];
    for (let e = 0; e < edgePairs.length; e++) {
      edgesAtDot[edgePairs[e][0]].push(e);
      edgesAtDot[edgePairs[e][1]].push(e);
    }

    /* ─── Mouse + raycaster ──────────────────────────────────────── */
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: preview ? 1.5 : 3.5 };
    const mouse = new THREE.Vector2(2, 2); // start off-screen
    const targetTilt = new THREE.Vector2(0, 0);
    const tilt = new THREE.Vector2(0, 0);

    const updateMouse = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      // Drive a gentle tilt — the "moves only when you move the cursor"
      // behavior. No pointer motion = no tilt change = network at rest.
      targetTilt.x = mouse.y * 0.4;
      targetTilt.y = mouse.x * 0.6;
    };
    const onPointerMove = (e: PointerEvent) =>
      updateMouse(e.clientX, e.clientY);
    const onPointerLeave = () => {
      mouse.set(2, 2);
      targetTilt.set(0, 0);
    };
    if (!preview) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerleave", onPointerLeave);
    }

    /* ─── Render loop ────────────────────────────────────────────── */
    let rafId = 0;
    let running = true;
    let last = performance.now();
    const hoverMaxSize = preview ? 4.5 : 7.5;
    const hoverActive = new Set<number>();

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

    const sizesAttr = dotGeom.getAttribute("size") as THREE.BufferAttribute;
    const alphaAttr = edgeGeom.getAttribute("alpha") as THREE.BufferAttribute;

    function frame(now: number) {
      if (!running) return;
      const dt = Math.min(50, now - last) / 1000;
      last = now;

      // Smoothly approach the mouse-driven tilt.
      tilt.x += (targetTilt.x - tilt.x) * Math.min(1, dt * 4);
      tilt.y += (targetTilt.y - tilt.y) * Math.min(1, dt * 4);
      galaxy.rotation.x = tilt.x;
      // Tiny constant drift so even an idle viewer sees life. Half the
      // speed of the original demo to feel calm.
      galaxy.rotation.y += dt * 0.04 + (tilt.y - galaxy.rotation.y) * 0.04;

      /* Raycast against the points. Hovered indices get a bigger
       * target size; everyone else relaxes back to base. */
      const newHover = new Set<number>();
      if (!preview && mouse.x <= 1) {
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObject(points, false);
        for (const h of hits) {
          if (typeof h.index === "number") newHover.add(h.index);
        }
      }

      // Update target sizes; fast attack on hover, slow release.
      for (const i of newHover) {
        dots[i].target = hoverMaxSize;
      }
      for (const i of hoverActive) {
        if (!newHover.has(i)) dots[i].target = dots[i].base;
      }
      hoverActive.clear();
      for (const i of newHover) hoverActive.add(i);

      // Smooth current → target per-dot.
      let sizesDirty = false;
      for (let i = 0; i < dotCount; i++) {
        const d = dots[i];
        const k =
          d.target > d.cur ? Math.min(1, dt * 12) : Math.min(1, dt * 4);
        const next = d.cur + (d.target - d.cur) * k;
        if (Math.abs(next - d.cur) > 0.001) {
          d.cur = next;
          sizes[i] = next;
          sizesDirty = true;
        }
      }
      if (sizesDirty) sizesAttr.needsUpdate = true;

      // Pump line alpha for edges touching hovered dots.
      let edgeDirty = false;
      const baseAlpha = 0.18;
      const litAlpha = 0.85;
      // Decay everything one step toward base.
      for (let e = 0; e < edgePairs.length; e++) {
        const a0 = edgeAlpha[e * 2];
        const decayed = a0 + (baseAlpha - a0) * Math.min(1, dt * 3);
        if (Math.abs(decayed - a0) > 0.005) {
          edgeAlpha[e * 2] = decayed;
          edgeAlpha[e * 2 + 1] = decayed;
          edgeDirty = true;
        }
      }
      // Light the edges of hovered dots.
      for (const i of newHover) {
        for (const e of edgesAtDot[i]) {
          edgeAlpha[e * 2] = litAlpha;
          edgeAlpha[e * 2 + 1] = litAlpha;
          edgeDirty = true;
        }
      }
      if (edgeDirty) alphaAttr.needsUpdate = true;

      renderer.render(scene, camera);
      if (!reduceMotion) rafId = requestAnimationFrame(frame);
    }

    if (reduceMotion) {
      // One static render then stop.
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
      dotGeom.dispose();
      edgeGeom.dispose();
      dotMat.dispose();
      edgeMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [preview, dotCount, radius, linkDist]);

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
