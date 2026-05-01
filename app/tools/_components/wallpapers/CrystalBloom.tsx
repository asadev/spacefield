"use client";

/* CrystalBloom — Three.js cloud of low-poly crystal meshes that drift
 * and rotate in space, lit so faces catch the light.
 *
 * Inspired by Mamboleoo's DecorativeBackgrounds demo5 (the broken-apart
 * polygonal sphere) and the holographic-crystal aesthetic from
 * particlegalaxy.webflow.io / brainit.es. Replaces the original
 * 2D-canvas implementation, which couldn't sell the faceted-3D look.
 *
 *   - 24 crystal meshes (6 in preview), each one of Icosahedron /
 *     Octahedron / Dodecahedron / Tetrahedron geometry so the scene
 *     isn't monotonous. flatShading: true on a MeshStandardMaterial
 *     gives the low-poly faceted look.
 *   - Distributed in a roughly spherical cloud around the origin via
 *     random spherical coords with a Math.cbrt() radius bias so they
 *     don't cluster at the center.
 *   - Holographic palette (pastel pink, lavender, mint, soft yellow,
 *     cyan) — one tint per crystal so each face catches a different
 *     hue under the directional light.
 *   - HemisphereLight (sky/ground) for ambient lift + DirectionalLight
 *     for the catch-light on faces.
 *   - Each crystal owns its own angular velocity (gentle, scaled in the
 *     frame loop) and a per-axis sine drift around its base position so
 *     they bob asynchronously, never in sync.
 *   - Slow Y auto-rotation of the whole group + mouse-driven camera
 *     tilt. Group is at rest when the pointer is idle.
 *   - Per-crystal additive Sprite halo for the luminous look + a
 *     wireframe overlay in a brighter tint for the "crystal facet" edge
 *     glow.
 *
 * Lazy-loads Three via DesktopBackground's Suspense boundary. Pauses on
 * visibilitychange. Respects prefers-reduced-motion (one static frame).
 */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

interface Props {
  preview?: { w: number; h: number };
}

const PALETTE = [
  "#fbcfe8", // pastel pink
  "#c4b5fd", // lavender
  "#a7f3d0", // mint
  "#fef3c7", // soft yellow
  "#a5f3fc", // cyan
];

type GeomKind = "ico" | "octa" | "dodeca" | "tetra";
const GEOM_KINDS: GeomKind[] = ["ico", "octa", "dodeca", "tetra"];

function makeGeometry(kind: GeomKind, size: number): THREE.BufferGeometry {
  switch (kind) {
    case "ico":
      return new THREE.IcosahedronGeometry(size, 0);
    case "octa":
      return new THREE.OctahedronGeometry(size, 0);
    case "dodeca":
      return new THREE.DodecahedronGeometry(size, 0);
    case "tetra":
      return new THREE.TetrahedronGeometry(size, 0);
  }
}

/* Tiny radial-gradient sprite texture used for the per-crystal halo.
 * Drawn once on a 64×64 canvas — cheap, cached by the GPU. */
function makeHaloTexture(): THREE.CanvasTexture {
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
    grad.addColorStop(0, "rgba(255,255,255,0.85)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.25)");
    grad.addColorStop(0.75, "rgba(255,255,255,0.06)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function CrystalBloom({ preview }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Reduce density when used as a thumbnail.
  const crystalCount = useMemo(() => (preview ? 6 : 24), [preview]);

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
    renderer.setClearColor(0x0a0420, 1);
    container.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, {
      width: "100%",
      height: "100%",
      display: "block",
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
    camera.position.set(0, 0, 60);
    camera.lookAt(0, 0, 0);

    const group = new THREE.Group();
    scene.add(group);

    /* ─── Lights ─────────────────────────────────────────────────── */
    const hemi = new THREE.HemisphereLight(0xc4b5fd, 0x1e1b4b, 0.55);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xfbcfe8, 0.7);
    dir.position.set(5, 8, 5);
    scene.add(dir);

    /* ─── Crystal cloud ──────────────────────────────────────────── */
    const haloTex = makeHaloTexture();

    interface Crystal {
      group: THREE.Group;
      base: THREE.Vector3;
      // per-axis drift amplitude (units) and frequency (rad / ms)
      ampX: number;
      ampY: number;
      ampZ: number;
      freqX: number;
      freqY: number;
      freqZ: number;
      phaseX: number;
      phaseY: number;
      phaseZ: number;
      // angular velocities (rad / s) — applied scaled in the frame loop
      rotXVel: number;
      rotYVel: number;
    }

    // Track resources for clean disposal.
    const ownedGeoms: THREE.BufferGeometry[] = [];
    const ownedMats: THREE.Material[] = [];
    const ownedTextures: THREE.Texture[] = [haloTex];

    const crystals: Crystal[] = [];
    const cloudRadius = preview ? 24 : 40;

    for (let i = 0; i < crystalCount; i++) {
      // Random spherical coord with cube-root radius bias so they fill
      // the volume rather than clustering at the origin.
      const u = Math.random();
      const radius = cloudRadius * (0.4 + 0.6 * Math.cbrt(u));
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const bx = radius * Math.sin(phi) * Math.cos(theta);
      const by = radius * Math.sin(phi) * Math.sin(theta);
      const bz = radius * Math.cos(phi);

      const size = 0.6 + Math.random() * 1.8; // 0.6..2.4
      const kind = GEOM_KINDS[i % GEOM_KINDS.length];
      const colorHex = PALETTE[i % PALETTE.length];
      const color = new THREE.Color(colorHex);

      const geom = makeGeometry(kind, size);
      ownedGeoms.push(geom);

      const mat = new THREE.MeshStandardMaterial({
        color,
        flatShading: true,
        metalness: 0.1,
        roughness: 0.55,
      });
      ownedMats.push(mat);
      const mesh = new THREE.Mesh(geom, mat);

      // Wireframe overlay in a brighter tint — the "facet edge glow".
      const wireColor = color.clone().lerp(new THREE.Color(0xffffff), 0.45);
      const wireMat = new THREE.MeshBasicMaterial({
        color: wireColor,
        wireframe: true,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      });
      ownedMats.push(wireMat);
      // Tiny scale-up so wireframe sits just outside the solid mesh and
      // doesn't z-fight the shaded faces.
      const wire = new THREE.Mesh(geom, wireMat);
      wire.scale.setScalar(1.02);

      // Soft additive halo behind the crystal.
      const haloMat = new THREE.SpriteMaterial({
        map: haloTex,
        color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.55,
      });
      ownedMats.push(haloMat);
      const halo = new THREE.Sprite(haloMat);
      halo.scale.set(size * 3, size * 3, 1);

      const cGroup = new THREE.Group();
      cGroup.add(halo);
      cGroup.add(mesh);
      cGroup.add(wire);
      cGroup.position.set(bx, by, bz);
      // Random initial orientation so faces aren't all aligned.
      cGroup.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      group.add(cGroup);

      crystals.push({
        group: cGroup,
        base: new THREE.Vector3(bx, by, bz),
        ampX: 1 + Math.random() * 2, // 1..3
        ampY: 1 + Math.random() * 2,
        ampZ: 1 + Math.random() * 2,
        freqX: 0.0003 + Math.random() * 0.0005, // 0.0003..0.0008
        freqY: 0.0003 + Math.random() * 0.0005,
        freqZ: 0.0003 + Math.random() * 0.0005,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        phaseZ: Math.random() * Math.PI * 2,
        // -0.4..+0.4 rad/s (gentle when scaled by 0.2 in frame loop)
        rotXVel: (Math.random() - 0.5) * 0.8,
        rotYVel: (Math.random() - 0.5) * 0.8,
      });
    }

    /* ─── Mouse-driven camera tilt ──────────────────────────────── */
    const targetCam = new THREE.Vector2(0, 0);
    const curCam = new THREE.Vector2(0, 0);
    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      // ±6 in X, ±4 in Y.
      targetCam.x = nx * 6;
      targetCam.y = -ny * 4;
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
      const dt = Math.min(50, now - last) / 1000; // seconds
      last = now;

      // Slow auto-rotation of the whole crystal cloud around Y.
      group.rotation.y += dt * 0.04;

      // Smooth camera follow.
      curCam.x += (targetCam.x - curCam.x) * Math.min(1, dt * 3);
      curCam.y += (targetCam.y - curCam.y) * Math.min(1, dt * 3);
      camera.position.x = baseCamX + curCam.x;
      camera.position.y = baseCamY + curCam.y;
      camera.lookAt(0, 0, 0);

      // Per-crystal drift + spin. Angular velocities scaled by 0.2 so
      // the spin reads as gentle even at the upper end of the range.
      for (let i = 0; i < crystals.length; i++) {
        const c = crystals[i];
        const ox = c.ampX * Math.sin(now * c.freqX + c.phaseX);
        const oy = c.ampY * Math.sin(now * c.freqY + c.phaseY);
        const oz = c.ampZ * Math.sin(now * c.freqZ + c.phaseZ);
        c.group.position.set(c.base.x + ox, c.base.y + oy, c.base.z + oz);
        c.group.rotation.x += c.rotXVel * dt * 0.2;
        c.group.rotation.y += c.rotYVel * dt * 0.2;
      }

      renderer.render(scene, camera);
      if (!reduceMotion) rafId = requestAnimationFrame(frame);
    }

    if (reduceMotion) {
      // Render one static frame and stop.
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
      for (const g of ownedGeoms) g.dispose();
      for (const m of ownedMats) m.dispose();
      for (const t of ownedTextures) t.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [preview, crystalCount]);

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
