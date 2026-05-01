"use client";

/* NetworkMesh — Three.js sphere of glowing dots + connecting lines.
 *
 * Asad's spec on revision two:
 *   - DOTS MUST FEEL PRESENT, not pinpricks. Bigger size, bright glow.
 *   - The whole sphere does NOT rotate. The network is at perfect
 *     rest. No auto-spin, no mouse tilt.
 *   - Only the dots the cursor is currently over move. They pop out
 *     radially from the sphere surface (like fabric being poked from
 *     inside), pulse, and brighten — and the lines emanating from
 *     them stretch + glow with them. Move the cursor away and they
 *     smoothly settle back into place.
 *
 * Visual language: high-tech cyan/electric-blue on near-black. Big
 * round dots with strong additive halos that bloom on hover. Lines
 * are thin and crisp, normally a faint blue, jumping to bright cyan
 * around the active region.
 */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

interface Props {
  preview?: { w: number; h: number };
}

const NODE_COLOR = new THREE.Color("#7dd3fc"); // sky-300
const NODE_HOT = new THREE.Color("#ffffff");
const EDGE_COLOR = new THREE.Color("#38bdf8"); // sky-400
const EDGE_HOT = new THREE.Color("#e0f2fe"); // very pale sky

export default function NetworkMesh({ preview }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const dotCount = useMemo(() => (preview ? 260 : 1100), [preview]);
  const radius = useMemo(() => (preview ? 35 : 100), [preview]);
  const linkDist = useMemo(() => (preview ? 11 : 11), [preview]);
  // Range (in 3D world units) within which the cursor's projected
  // pierce-point activates a dot.
  const interactRadius = useMemo(() => (preview ? 14 : 28), [preview]);

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
    renderer.setClearColor(0x05070f, 1);
    container.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, {
      width: "100%",
      height: "100%",
      display: "block",
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
    camera.position.set(0, 0, radius * 3.4);
    camera.lookAt(0, 0, 0);

    /* ─── Dots: Fibonacci sphere ─────────────────────────────────── */
    const positions = new Float32Array(dotCount * 3);
    const sizes = new Float32Array(dotCount);
    const heat = new Float32Array(dotCount); // 0..1 hover/activation amount
    // Per-dot displacement (along the radial normal) — current and target.
    const liftCur = new Float32Array(dotCount);
    const liftTgt = new Float32Array(dotCount);

    const baseSize = preview ? 4.5 : 6.5;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    interface Dot {
      basePos: THREE.Vector3;
      normal: THREE.Vector3; // unit outward direction
    }
    const dots: Dot[] = new Array(dotCount);

    for (let i = 0; i < dotCount; i++) {
      const y = 1 - (i / (dotCount - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = goldenAngle * i;
      const x = Math.cos(t) * r;
      const z = Math.sin(t) * r;
      const normal = new THREE.Vector3(x, y, z); // unit
      const basePos = normal.clone().multiplyScalar(radius);
      positions[i * 3] = basePos.x;
      positions[i * 3 + 1] = basePos.y;
      positions[i * 3 + 2] = basePos.z;
      sizes[i] = baseSize;
      heat[i] = 0;
      dots[i] = { basePos, normal };
    }

    const dotGeom = new THREE.BufferGeometry();
    dotGeom.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
    );
    dotGeom.setAttribute(
      "size",
      new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage)
    );
    dotGeom.setAttribute(
      "heat",
      new THREE.BufferAttribute(heat, 1).setUsage(THREE.DynamicDrawUsage)
    );

    /* Round-dot shader with strong glow halo. The fragment draws a
     * small bright disc surrounded by a bigger soft halo, blended
     * additively so overlap feels luminous. Heat-driven color shift +
     * extra bloom on activated dots. */
    const dotMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: NODE_COLOR },
        uHot: { value: NODE_HOT },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float heat;
        varying float vHeat;
        void main() {
          vHeat = heat;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // Heat scales the rendered point size — punchy.
          float s = size * (1.0 + heat * 1.6);
          gl_PointSize = s * (320.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform vec3 uColor;
        uniform vec3 uHot;
        varying float vHeat;
        void main() {
          // gl_PointCoord 0..1 inside the rendered point square.
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          if (d > 0.5) discard;

          // Bright core disc.
          float core = smoothstep(0.18, 0.0, d);
          // Soft halo radiating out to the edge.
          float halo = smoothstep(0.5, 0.0, d) * (0.55 + 0.45 * vHeat);

          vec3 c = mix(uColor, uHot, vHeat * 0.8);
          float a = clamp(core + halo * 0.8, 0.0, 1.0);
          gl_FragColor = vec4(c, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(dotGeom, dotMat);
    scene.add(points);

    /* ─── Edges between near-neighbors ───────────────────────────── */
    const edgePairs: Array<[number, number]> = [];
    const cellSize = linkDist;
    const grid = new Map<string, number[]>();
    const key = (x: number, y: number, z: number) =>
      `${Math.floor(x / cellSize)}|${Math.floor(y / cellSize)}|${Math.floor(z / cellSize)}`;
    for (let i = 0; i < dotCount; i++) {
      const v = dots[i].basePos;
      const k = key(v.x, v.y, v.z);
      const bucket = grid.get(k) ?? [];
      bucket.push(i);
      grid.set(k, bucket);
    }
    const linkSq = linkDist * linkDist;
    for (let i = 0; i < dotCount; i++) {
      const v = dots[i].basePos;
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
              const u = dots[j].basePos;
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
    const edgeHeat = new Float32Array(edgePairs.length * 2);
    for (let e = 0; e < edgePairs.length; e++) {
      const [i, j] = edgePairs[e];
      const a = dots[i].basePos;
      const b = dots[j].basePos;
      edgePos[e * 6 + 0] = a.x;
      edgePos[e * 6 + 1] = a.y;
      edgePos[e * 6 + 2] = a.z;
      edgePos[e * 6 + 3] = b.x;
      edgePos[e * 6 + 4] = b.y;
      edgePos[e * 6 + 5] = b.z;
      edgeAlpha[e * 2] = 0.22;
      edgeAlpha[e * 2 + 1] = 0.22;
      edgeHeat[e * 2] = 0;
      edgeHeat[e * 2 + 1] = 0;
    }
    const edgeGeom = new THREE.BufferGeometry();
    edgeGeom.setAttribute(
      "position",
      new THREE.BufferAttribute(edgePos, 3).setUsage(THREE.DynamicDrawUsage)
    );
    edgeGeom.setAttribute(
      "alpha",
      new THREE.BufferAttribute(edgeAlpha, 1).setUsage(THREE.DynamicDrawUsage)
    );
    edgeGeom.setAttribute(
      "heatAttr",
      new THREE.BufferAttribute(edgeHeat, 1).setUsage(THREE.DynamicDrawUsage)
    );

    const edgeMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: EDGE_COLOR },
        uHot: { value: EDGE_HOT },
      },
      vertexShader: /* glsl */ `
        attribute float alpha;
        attribute float heatAttr;
        varying float vAlpha;
        varying float vHeat;
        void main() {
          vAlpha = alpha;
          vHeat = heatAttr;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform vec3 uColor;
        uniform vec3 uHot;
        varying float vAlpha;
        varying float vHeat;
        void main() {
          vec3 c = mix(uColor, uHot, vHeat);
          gl_FragColor = vec4(c, vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const edges = new THREE.LineSegments(edgeGeom, edgeMat);
    scene.add(edges);

    // Per-dot edge index lookup.
    const edgesAtDot: number[][] = new Array(dotCount);
    for (let i = 0; i < dotCount; i++) edgesAtDot[i] = [];
    for (let e = 0; e < edgePairs.length; e++) {
      edgesAtDot[edgePairs[e][0]].push(e);
      edgesAtDot[edgePairs[e][1]].push(e);
    }

    /* ─── Mouse-driven activation field ──────────────────────────── */
    /* We project the screen mouse to a ray, intersect with a sphere
     * of slightly larger radius, and treat that pierce-point as the
     * "cursor in 3D" — every dot within `interactRadius` of that
     * point gets activation proportional to (1 - dist/radius). */
    const ndcMouse = new THREE.Vector2(2, 2);
    const ray = new THREE.Raycaster();
    const proj = new THREE.Vector3();
    const cursorPos = new THREE.Vector3(9999, 9999, 9999);
    let cursorActive = false;

    const updateMouseFromEvent = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndcMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndcMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      cursorActive = true;
    };
    const onPointerMove = (e: PointerEvent) =>
      updateMouseFromEvent(e.clientX, e.clientY);
    const onPointerLeave = () => {
      cursorActive = false;
      ndcMouse.set(2, 2);
    };
    if (!preview) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerleave", onPointerLeave);
    }

    /* ─── Render loop ────────────────────────────────────────────── */
    let rafId = 0;
    let running = true;
    let last = performance.now();
    const liftMax = preview ? 8 : 18; // how far hovered dots pop outward

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

    const posAttr = dotGeom.getAttribute("position") as THREE.BufferAttribute;
    const sizeAttr = dotGeom.getAttribute("size") as THREE.BufferAttribute;
    const heatAttr = dotGeom.getAttribute("heat") as THREE.BufferAttribute;
    const edgePosAttr = edgeGeom.getAttribute("position") as THREE.BufferAttribute;
    const edgeAlphaAttr = edgeGeom.getAttribute("alpha") as THREE.BufferAttribute;
    const edgeHeatAttr = edgeGeom.getAttribute("heatAttr") as THREE.BufferAttribute;

    function frame(now: number) {
      if (!running) return;
      const dt = Math.min(50, now - last) / 1000;
      last = now;

      /* 1. Resolve cursor to a 3D point on/near the sphere surface.
       * We use a sphere intersection slightly inside the dot sphere so
       * the activation field doesn't wrap around the back side. */
      let cursorOnSphere = false;
      if (cursorActive && ndcMouse.x <= 1) {
        ray.setFromCamera(ndcMouse, camera);
        // Intersect ray with sphere centered at origin, radius = our radius.
        // Using analytic solution for ray-sphere.
        const ox = ray.ray.origin.x;
        const oy = ray.ray.origin.y;
        const oz = ray.ray.origin.z;
        const dxr = ray.ray.direction.x;
        const dyr = ray.ray.direction.y;
        const dzr = ray.ray.direction.z;
        const b = 2 * (ox * dxr + oy * dyr + oz * dzr);
        const c = ox * ox + oy * oy + oz * oz - radius * radius;
        const disc = b * b - 4 * c;
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          const tNear = (-b - sq) / 2;
          const tParam = tNear > 0 ? tNear : (-b + sq) / 2;
          if (tParam > 0) {
            cursorPos.set(
              ox + dxr * tParam,
              oy + dyr * tParam,
              oz + dzr * tParam
            );
            cursorOnSphere = true;
          }
        }
      }

      /* 2. Compute target lift + heat per dot based on distance from
       * cursor pierce-point. */
      const interactSq = interactRadius * interactRadius;
      let posDirty = false;
      let sizeDirty = false;
      let heatDirty = false;

      for (let i = 0; i < dotCount; i++) {
        let target = 0;
        if (cursorOnSphere) {
          const d = dots[i].basePos;
          const ddx = d.x - cursorPos.x;
          const ddy = d.y - cursorPos.y;
          const ddz = d.z - cursorPos.z;
          const distSq = ddx * ddx + ddy * ddy + ddz * ddz;
          if (distSq < interactSq) {
            const dist = Math.sqrt(distSq);
            const fall = 1 - dist / interactRadius;
            target = fall * fall; // sharper falloff
          }
        }
        liftTgt[i] = target * liftMax;

        // Smooth lift (fast attack, slower release).
        const targetLift = liftTgt[i];
        const k =
          targetLift > liftCur[i]
            ? Math.min(1, dt * 14)
            : Math.min(1, dt * 5);
        const nextLift = liftCur[i] + (targetLift - liftCur[i]) * k;

        if (Math.abs(nextLift - liftCur[i]) > 0.005) {
          liftCur[i] = nextLift;
          // Apply lift along the outward normal.
          const nx = dots[i].normal.x;
          const ny = dots[i].normal.y;
          const nz = dots[i].normal.z;
          posAttr.array[i * 3] = dots[i].basePos.x + nx * nextLift;
          posAttr.array[i * 3 + 1] = dots[i].basePos.y + ny * nextLift;
          posAttr.array[i * 3 + 2] = dots[i].basePos.z + nz * nextLift;
          posDirty = true;
        }

        // Heat = normalized lift, sets shader brightness/halo
        const newHeat = nextLift / liftMax;
        if (Math.abs(newHeat - heat[i]) > 0.005) {
          heat[i] = newHeat;
          heatDirty = true;
        }

        // Size pulses with a small sine on top of the lift-driven scale.
        const pulse =
          newHeat > 0.04 ? 1 + 0.18 * Math.sin(now * 0.012 + i * 0.31) : 1;
        const newSize = baseSize * (1 + newHeat * 0.4) * pulse;
        if (Math.abs(newSize - sizes[i]) > 0.02) {
          sizes[i] = newSize;
          sizeDirty = true;
        }
      }

      /* 3. Update edge endpoints to follow the dots they connect, and
       * brighten edges whose endpoints are activated. */
      let edgeDirty = false;
      const baseAlpha = 0.22;
      const litAlpha = 0.95;
      for (let e = 0; e < edgePairs.length; e++) {
        const [i, j] = edgePairs[e];
        // Update both endpoints from the (possibly lifted) point positions.
        const newAx = posAttr.array[i * 3];
        const newAy = posAttr.array[i * 3 + 1];
        const newAz = posAttr.array[i * 3 + 2];
        const newBx = posAttr.array[j * 3];
        const newBy = posAttr.array[j * 3 + 1];
        const newBz = posAttr.array[j * 3 + 2];
        if (
          edgePosAttr.array[e * 6] !== newAx ||
          edgePosAttr.array[e * 6 + 1] !== newAy ||
          edgePosAttr.array[e * 6 + 2] !== newAz ||
          edgePosAttr.array[e * 6 + 3] !== newBx ||
          edgePosAttr.array[e * 6 + 4] !== newBy ||
          edgePosAttr.array[e * 6 + 5] !== newBz
        ) {
          edgePosAttr.array[e * 6] = newAx;
          edgePosAttr.array[e * 6 + 1] = newAy;
          edgePosAttr.array[e * 6 + 2] = newAz;
          edgePosAttr.array[e * 6 + 3] = newBx;
          edgePosAttr.array[e * 6 + 4] = newBy;
          edgePosAttr.array[e * 6 + 5] = newBz;
          edgeDirty = true;
        }

        // Heat = max of the two endpoint heats.
        const eheat = Math.max(heat[i], heat[j]);
        const targetA = baseAlpha + (litAlpha - baseAlpha) * eheat;
        if (Math.abs(targetA - edgeAlpha[e * 2]) > 0.005) {
          edgeAlpha[e * 2] = targetA;
          edgeAlpha[e * 2 + 1] = targetA;
          edgeDirty = true;
        }
        if (Math.abs(eheat - edgeHeat[e * 2]) > 0.005) {
          edgeHeat[e * 2] = eheat;
          edgeHeat[e * 2 + 1] = eheat;
          edgeDirty = true;
        }
      }

      if (posDirty) posAttr.needsUpdate = true;
      if (sizeDirty) sizeAttr.needsUpdate = true;
      if (heatDirty) heatAttr.needsUpdate = true;
      if (edgeDirty) {
        edgePosAttr.needsUpdate = true;
        edgeAlphaAttr.needsUpdate = true;
        edgeHeatAttr.needsUpdate = true;
      }

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
      dotGeom.dispose();
      edgeGeom.dispose();
      dotMat.dispose();
      edgeMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [preview, dotCount, radius, linkDist, interactRadius]);

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
