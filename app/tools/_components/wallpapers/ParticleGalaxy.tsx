"use client";

/* ParticleGalaxy v4 — interactive zoom journey from a galaxy down to
 * a real-textured Earth/Moon, with per-planet click-to-zoom and
 * trackball drag-to-rotate.
 *
 * Interaction model (Asad's spec):
 *   - DOUBLE-CLICK on empty space → advance / wrap level
 *   - CLICK on a planet (in the Solar System view) → zoom into that
 *     planet's detail view; each planet has its own moon
 *   - LONG-PRESS + DRAG (held >180ms then move) → trackball-rotate the
 *     current scene 360° on both axes; release to leave the new
 *     orientation in place
 *   - ESC → step back to the previous level
 *
 * Levels:
 *   0  Galaxy           — wide spiral disk, 6000 stars + glowing core
 *   1  Star Cluster     — sparser stars + prominent feature star
 *   2  Solar System     — Sun + 4 clickable planets on tilted orbits
 *   3  Planet Detail    — focused planet (real NASA texture for
 *                         Earth, procedural for others) + its moon
 *
 * Earth + Moon use NASA Visible Earth Blue Marble + Lunar Reconnaissance
 * Orbiter imagery via the Three.js examples textures (public domain).
 * Clouds layer is a translucent shell with a separate cloud texture.
 * The Sun illuminates Earth/Moon via a real PointLight at the origin.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

interface Props {
  preview?: { w: number; h: number };
}

const LEVEL_NAMES = ["Galaxy", "Star Cluster", "Solar System"] as const;
const PLANET_NAMES = ["Mercury", "Venus", "Earth", "Mars"] as const;

const TEX_EARTH = "/textures/earth_atmos_2048.jpg";
const TEX_EARTH_CLOUDS = "/textures/earth_clouds_1024.png";
const TEX_MOON = "/textures/moon_1024.jpg";

interface MoonSpec {
  /** Display name (used for log/debug only). */
  name: string;
  /** Moon body radius at wallpaper scale (NOT real km — visually
   *  scaled so tiny captured asteroids like Phobos/Deimos are still
   *  visible as small chunks rather than single pixels). */
  radius: number;
  /** Orbit radius from the parent planet's center, wallpaper units. */
  orbit: number;
  /** Orbit angular velocity, rad/sec. Closer moons usually faster
   *  (per Kepler-ish), but we just pick visually pleasing rates. */
  speed: number;
  /** Inclination — small Y tilt in the orbit so moons don't sit on a
   *  flat plane. Also slightly different per moon. */
  inclination: number;
  /** "luna" gets the real lunar texture; "rocky" is procedural gray. */
  surface: "luna" | "rocky";
}

interface PlanetSpec {
  name: (typeof PLANET_NAMES)[number];
  radius: number;
  orbit: number;
  color: number; // hex, used as fallback tint
  type: "rocky" | "earth" | "mars";
  speed: number;
  tilt: number; // degrees of axial tilt, applied as rotation.z
  /** REAL moons. Mercury and Venus have none — empty array.
   *  Earth has 1 (Luna). Mars has 2 (Phobos + Deimos). */
  moons: MoonSpec[];
}

const PLANETS: PlanetSpec[] = [
  // Mercury — zero moons (gravitational pull too weak + too close to the Sun).
  { name: "Mercury", radius: 0.4, orbit: 4.6, color: 0xa8a29e, type: "rocky", speed: 0.9, tilt: 0.04, moons: [] },
  // Venus — zero moons (no captured satellite ever stable here).
  { name: "Venus", radius: 0.65, orbit: 6.2, color: 0xe8c894, type: "rocky", speed: 0.6, tilt: 0.02, moons: [] },
  // Earth — one moon, gets the real LRO texture.
  {
    name: "Earth", radius: 0.78, orbit: 8.4, color: 0x4dabf7, type: "earth", speed: 0.4, tilt: 23.5,
    moons: [
      { name: "Luna", radius: 0.7, orbit: 5.5, speed: 0.55, inclination: 0.07, surface: "luna" },
    ],
  },
  // Mars — two tiny captured asteroids (Phobos closer + smaller orbit, Deimos farther + slower).
  {
    name: "Mars", radius: 0.55, orbit: 10.6, color: 0xc06b3a, type: "mars", speed: 0.28, tilt: 25,
    moons: [
      { name: "Phobos", radius: 0.16, orbit: 3.2, speed: 1.4, inclination: 0.1, surface: "rocky" },
      { name: "Deimos", radius: 0.13, orbit: 5.4, speed: 0.6, inclination: -0.18, surface: "rocky" },
    ],
  },
];

export default function ParticleGalaxy({ preview }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState<0 | 1 | 2 | 3>(0);
  const [focusedPlanet, setFocusedPlanet] = useState<number>(2); // Earth default

  const isPreview = !!preview;
  const dotCount = useMemo(() => (isPreview ? 800 : 6000), [isPreview]);

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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, {
      width: "100%",
      height: "100%",
      display: "block",
      cursor: isPreview ? "default" : "grab",
      touchAction: isPreview ? "auto" : "none",
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.05, 4000);
    const uTime = { value: 0 };

    /* Texture loader for the realistic Earth/Moon level. */
    const texLoader = new THREE.TextureLoader();
    let earthTex: THREE.Texture | null = null;
    let earthCloudsTex: THREE.Texture | null = null;
    let moonTex: THREE.Texture | null = null;
    if (!isPreview) {
      earthTex = texLoader.load(TEX_EARTH);
      earthTex.colorSpace = THREE.SRGBColorSpace;
      earthTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      earthCloudsTex = texLoader.load(TEX_EARTH_CLOUDS);
      moonTex = texLoader.load(TEX_MOON);
      moonTex.colorSpace = THREE.SRGBColorSpace;
      moonTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }

    /* ─── Level 0: Galaxy ──────────────────────────────────────── */
    const galaxyGroup = new THREE.Group();
    scene.add(galaxyGroup);
    const galaxyRadius = 95;
    const galaxyCleanup = buildGalaxy(galaxyGroup, dotCount, galaxyRadius, isPreview, uTime);

    /* ─── Level 1: Star Cluster ─────────────────────────────────── */
    const clusterGroup = new THREE.Group();
    clusterGroup.visible = false;
    scene.add(clusterGroup);
    const clusterCleanup = buildStarCluster(clusterGroup, isPreview, uTime);

    /* ─── Level 2: Solar System (with clickable planets) ────────── */
    const solarGroup = new THREE.Group();
    solarGroup.visible = false;
    scene.add(solarGroup);
    const solarBuild = buildSolarSystem(solarGroup, isPreview, uTime);

    /* ─── Level 3: Planet Detail (one per planet) ──────────────── */
    const detailGroups: THREE.Group[] = [];
    const detailBuilds: ReturnType<typeof buildPlanetDetail>[] = [];
    for (let i = 0; i < PLANETS.length; i++) {
      const g = new THREE.Group();
      g.visible = false;
      scene.add(g);
      detailGroups.push(g);
      detailBuilds.push(
        buildPlanetDetail(
          g,
          PLANETS[i],
          isPreview,
          uTime,
          PLANETS[i].name === "Earth" ? earthTex : null,
          PLANETS[i].name === "Earth" ? earthCloudsTex : null,
          moonTex
        )
      );
    }

    /* ─── Camera presets ────────────────────────────────────────── */
    const camPresets = {
      0: { pos: new THREE.Vector3(0, 50, 250), look: new THREE.Vector3(0, 0, 0) },
      1: { pos: new THREE.Vector3(0, 5, 90), look: new THREE.Vector3(0, 0, 0) },
      2: { pos: new THREE.Vector3(0, 6, 22), look: new THREE.Vector3(0, 0, 0) },
      3: { pos: new THREE.Vector3(0, 0, 9), look: new THREE.Vector3(0, 0, 0) },
    };
    camera.position.copy(camPresets[0].pos);
    camera.lookAt(camPresets[0].look);

    /* ─── Group visibility / opacity helpers ──────────────────── */
    function activeGroup(lvl: 0 | 1 | 2 | 3, planet: number): THREE.Group {
      if (lvl === 0) return galaxyGroup;
      if (lvl === 1) return clusterGroup;
      if (lvl === 2) return solarGroup;
      return detailGroups[planet];
    }
    function setSceneOpacity(group: THREE.Group, value: number) {
      applyOpacity(group, value);
      group.visible = value > 0.001;
    }
    function hideAll() {
      [galaxyGroup, clusterGroup, solarGroup, ...detailGroups].forEach((g) =>
        setSceneOpacity(g, 0)
      );
    }
    hideAll();
    setSceneOpacity(galaxyGroup, 1);

    /* ─── Trackball-style drag rotation ─────────────────────────── */
    /* Each level group has its own .rotation we modulate. User drag
     * directly mutates group.rotation (no separate userRot store —
     * the rotation property IS the source of truth). Auto-idle
     * (galaxy spin etc.) ALSO accumulates onto group.rotation.y in
     * the render loop. Both compose without resetting each frame.
     * Switching levels resets the new level's rotation to neutral. */

    /* ─── Pointer state machine ─────────────────────────────────── */
    let pointerDown = false;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let pointerLastX = 0;
    let pointerLastY = 0;
    let pointerDownAt = 0;
    let pointerCanvasW = 0;
    let pointerCanvasH = 0;
    let dragMode: "none" | "rotate" = "none";
    let lastClickTime = 0;
    let lastClickX = 0;
    let lastClickY = 0;
    let pendingClick: { x: number; y: number } | null = null;
    let pendingClickTimer: ReturnType<typeof setTimeout> | null = null;

    const DBL_CLICK_MS = 320;
    const LONG_PRESS_MS = 180;
    const DRAG_THRESHOLD_PX = 5;

    /* Angular velocity tracker — captures the last few drag samples so
     * we can hand off the user's "throw" to a damped free-spin when
     * the pointer releases. Recent samples weighted more than old. */
    interface VelSample {
      t: number;
      yaw: number;
      pitch: number;
    }
    const velSamples: VelSample[] = [];
    const velocity = { yaw: 0, pitch: 0 }; // rad/sec, decays over time
    const VELOCITY_DAMPING = 0.93; // per-frame multiplier (≈ 1.4s to ~1% at 60fps)

    let curLevel: 0 | 1 | 2 | 3 = 0;
    let prevLevel: 0 | 1 | 2 | 3 = 0;
    let curPlanet = 2;
    let prevPlanet = 2;
    let inTransition = false;
    let transitionStart = 0;
    // Slower, more cinematic dive — was 950ms, felt rushed and made
    // Earth blink in before you could appreciate the approach.
    const TRANSITION_MS = reduceMotion ? 1 : 1800;

    function startTransition(toLevel: 0 | 1 | 2 | 3, toPlanet: number) {
      if (inTransition) return;
      prevLevel = curLevel;
      prevPlanet = curPlanet;
      curLevel = toLevel;
      curPlanet = toPlanet;
      transitionStart = performance.now();
      inTransition = true;
      // Reset the destination group's rotation so each level starts
      // facing forward, not retaining the previous drag orientation.
      const dest = activeGroup(toLevel, toPlanet);
      dest.rotation.set(toLevel === 0 ? -0.72 : 0, 0, 0);
      setLevel(toLevel);
      setFocusedPlanet(toPlanet);
    }

    /* ─── Click / double-click / long-press routing ─────────────── */
    function projectPlanetClick(clientX: number, clientY: number): number {
      // Returns planet index 0..3 if a planet was clicked, or -1.
      if (curLevel !== 2) return -1;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const meshes = solarBuild.planets.map((p) => p.mesh);
      const hits = ray.intersectObjects(meshes, false);
      if (hits.length === 0) return -1;
      return meshes.indexOf(hits[0].object as THREE.Mesh);
    }

    function commitClick(clientX: number, clientY: number) {
      if (curLevel === 2) {
        const idx = projectPlanetClick(clientX, clientY);
        if (idx >= 0) startTransition(3, idx);
      }
    }
    function commitDoubleClick() {
      const next: 0 | 1 | 2 | 3 =
        curLevel === 0 ? 1 : curLevel === 1 ? 2 : curLevel === 2 ? 3 : 0;
      const toPlanet = curLevel === 2 ? curPlanet : 2;
      startTransition(next, toPlanet);
    }

    function onPointerDown(e: PointerEvent) {
      if (isPreview) return;
      pointerDown = true;
      pointerStartX = pointerLastX = e.clientX;
      pointerStartY = pointerLastY = e.clientY;
      pointerDownAt = performance.now();
      dragMode = "none";
      const rect = renderer.domElement.getBoundingClientRect();
      pointerCanvasW = rect.width;
      pointerCanvasH = rect.height;
      // Window-level move/up so events are received even if the
      // pointer leaves the canvas mid-drag. setPointerCapture was
      // failing silently on some chains because of the
      // pointer-events:none parent in DesktopBackground; this
      // pattern sidesteps the entire capture API.
      window.addEventListener("pointermove", onWindowPointerMove);
      window.addEventListener("pointerup", onWindowPointerUp);
      window.addEventListener("pointercancel", onWindowPointerUp);
    }
    function onWindowPointerMove(e: PointerEvent) {
      if (!pointerDown) return;
      const dx = e.clientX - pointerLastX;
      const dy = e.clientY - pointerLastY;
      pointerLastX = e.clientX;
      pointerLastY = e.clientY;

      if (dragMode === "none") {
        const tdx = e.clientX - pointerStartX;
        const tdy = e.clientY - pointerStartY;
        const dist = Math.hypot(tdx, tdy);
        const held = performance.now() - pointerDownAt;
        if (dist > DRAG_THRESHOLD_PX || held > LONG_PRESS_MS) {
          dragMode = "rotate";
          renderer.domElement.style.cursor = "grabbing";
        }
      }
      if (dragMode === "rotate") {
        // Pixels → radians. A full canvas-width sweep = π rotation.
        const yawDelta = (dx / Math.max(1, pointerCanvasW)) * Math.PI;
        const pitchDelta = (dy / Math.max(1, pointerCanvasH)) * Math.PI;
        const g = activeGroup(curLevel, curPlanet);
        g.rotation.y += yawDelta;
        g.rotation.x = Math.max(-1.4, Math.min(1.4, g.rotation.x + pitchDelta));

        // Record sample so we can compute throw velocity on release.
        velSamples.push({
          t: performance.now(),
          yaw: g.rotation.y,
          pitch: g.rotation.x,
        });
        // Trim to the last 8 samples (avoids unbounded growth).
        if (velSamples.length > 8) velSamples.shift();

        // Cancel any inertial spin currently in progress when the
        // user grabs again — they're taking over.
        velocity.yaw = 0;
        velocity.pitch = 0;
      }
    }
    function onWindowPointerUp(e: PointerEvent) {
      const wasDown = pointerDown;
      pointerDown = false;
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerUp);
      renderer.domElement.style.cursor = "grab";

      // If the gesture was a drag, hand off velocity to inertial spin
      // (so a fast flick keeps rotating after release, decaying).
      if (!wasDown || dragMode === "rotate") {
        if (dragMode === "rotate") {
          // Compute velocity from the last ≤120ms of drag samples.
          const now = performance.now();
          const recent = velSamples.filter((s) => now - s.t < 120);
          if (recent.length >= 2) {
            const a = recent[0];
            const b = recent[recent.length - 1];
            const elapsed = (b.t - a.t) / 1000; // seconds
            if (elapsed > 0.001) {
              velocity.yaw = (b.yaw - a.yaw) / elapsed;
              velocity.pitch = (b.pitch - a.pitch) / elapsed;
              // Cap so an unreasonable flick doesn't spin out of control.
              const maxVel = 12; // rad/sec
              velocity.yaw = Math.max(-maxVel, Math.min(maxVel, velocity.yaw));
              velocity.pitch = Math.max(-maxVel, Math.min(maxVel, velocity.pitch));
            }
          }
        }
        velSamples.length = 0;
        dragMode = "none";
        return;
      }

      // It was a click (no drag).
      dragMode = "none";
      velSamples.length = 0;
      const now = performance.now();
      const sinceLast = now - lastClickTime;
      const moveSinceLast = Math.hypot(
        e.clientX - lastClickX,
        e.clientY - lastClickY
      );
      const isDouble = sinceLast < DBL_CLICK_MS && moveSinceLast < 12;
      lastClickTime = now;
      lastClickX = e.clientX;
      lastClickY = e.clientY;

      // Planet hit-test FIRST. If the user clicked directly on a
      // planet at the solar level, commit immediately — no
      // double-click wait — so it dives to THAT planet, not Earth.
      if (curLevel === 2) {
        const idx = projectPlanetClick(e.clientX, e.clientY);
        if (idx >= 0) {
          // Cancel any pending click + treat this as a planet zoom.
          if (pendingClickTimer) {
            clearTimeout(pendingClickTimer);
            pendingClickTimer = null;
            pendingClick = null;
          }
          startTransition(3, idx);
          return;
        }
      }

      if (isDouble) {
        if (pendingClickTimer) {
          clearTimeout(pendingClickTimer);
          pendingClickTimer = null;
          pendingClick = null;
        }
        commitDoubleClick();
        return;
      }

      // Single click on empty space — hold for the double-click
      // grace window in case a second click arrives.
      pendingClick = { x: e.clientX, y: e.clientY };
      if (pendingClickTimer) clearTimeout(pendingClickTimer);
      pendingClickTimer = setTimeout(() => {
        // Single click on empty space at the solar level is a no-op
        // (we don't want a stray background click to fire a level
        // advance — that's what double-click is for).
        pendingClick = null;
        pendingClickTimer = null;
      }, DBL_CLICK_MS);
    }
    function onContextMenu(e: MouseEvent) {
      if (isPreview) return;
      e.preventDefault();
      // Right-click steps back one level.
      if (curLevel > 0) {
        const back: 0 | 1 | 2 | 3 = (curLevel - 1) as 0 | 1 | 2;
        startTransition(back, curPlanet);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (isPreview) return;
      if (e.key === "Escape" && curLevel > 0) {
        const back: 0 | 1 | 2 | 3 = (curLevel - 1) as 0 | 1 | 2;
        startTransition(back, curPlanet);
      }
    }

    if (!isPreview) {
      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("contextmenu", onContextMenu);
      window.addEventListener("keydown", onKey);
    }

    /* ─── Mouse parallax (small camera offset on hover) ─────────── */
    const targetCam = new THREE.Vector2(0, 0);
    const curCam = new THREE.Vector2(0, 0);
    const onHoverMove = (e: PointerEvent) => {
      if (isPreview || pointerDown) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      targetCam.x = -nx * 0.06;
      targetCam.y = -ny * 0.04;
    };
    if (!isPreview) {
      window.addEventListener("pointermove", onHoverMove, { passive: true });
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

    function frame(now: number) {
      if (!running) return;
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      uTime.value = now * 0.001;

      // Resolve transition / camera + opacities.
      const prevG = activeGroup(prevLevel, prevPlanet);
      const curG = activeGroup(curLevel, curPlanet);
      if (inTransition) {
        const t = Math.min(1, (now - transitionStart) / TRANSITION_MS);
        const eased = easeInOutCubic(t);
        const a = camPresets[prevLevel];
        const b = camPresets[curLevel];
        camera.position.lerpVectors(a.pos, b.pos, eased);
        setSceneOpacity(prevG, 1 - eased);
        if (prevG !== curG) setSceneOpacity(curG, eased);
        if (t >= 1) {
          inTransition = false;
          // Hide everyone except current.
          [galaxyGroup, clusterGroup, solarGroup, ...detailGroups].forEach((g) => {
            if (g !== curG) setSceneOpacity(g, 0);
          });
          setSceneOpacity(curG, 1);
        }
      } else {
        // Stable: tiny mouse parallax on top of preset camera.
        const c = camPresets[curLevel];
        curCam.x += (targetCam.x - curCam.x) * Math.min(1, dt * 3);
        curCam.y += (targetCam.y - curCam.y) * Math.min(1, dt * 3);
        camera.position.set(c.pos.x + curCam.x * 8, c.pos.y + curCam.y * 4, c.pos.z);
      }
      camera.lookAt(camPresets[curLevel].look);

      // Inertial spin from a recent drag-release flick. Velocity
      // decays each frame; once it's tiny, snap to 0. Auto-idle
      // (galaxy/cluster spin) only resumes once velocity is fully
      // decayed AND the user isn't holding the pointer.
      if (!pointerDown && !inTransition) {
        const spinning =
          Math.abs(velocity.yaw) > 0.005 || Math.abs(velocity.pitch) > 0.005;
        if (spinning) {
          curG.rotation.y += velocity.yaw * dt;
          curG.rotation.x = Math.max(
            -1.4,
            Math.min(1.4, curG.rotation.x + velocity.pitch * dt)
          );
          // Per-frame damping. Pow(damping, frames-this-frame) is
          // fine for small dt at 60fps.
          velocity.yaw *= Math.pow(VELOCITY_DAMPING, dt * 60);
          velocity.pitch *= Math.pow(VELOCITY_DAMPING, dt * 60);
          if (Math.abs(velocity.yaw) < 0.005) velocity.yaw = 0;
          if (Math.abs(velocity.pitch) < 0.005) velocity.pitch = 0;
        } else {
          // Calm auto-idle so each level still feels alive when no
          // drag is in progress.
          if (curLevel === 0) curG.rotation.y += dt * 0.045;
          else if (curLevel === 1) curG.rotation.y += dt * 0.03;
        }
      }

      // Solar system: planets orbit, sun rotates, asteroids tumble.
      if (curLevel === 2) {
        for (const p of solarBuild.planets) {
          const a = uTime.value * p.speed + p.phase;
          p.mesh.position.set(
            Math.cos(a) * p.orbit,
            Math.sin(a * 0.5) * p.tilt,
            Math.sin(a) * p.orbit
          );
          p.mesh.rotation.y += dt * 0.4;
        }
        if (solarBuild.sun) solarBuild.sun.rotation.y += dt * 0.06;
        // Asteroid belt — slow orbits + irregular tumble around a
        // random axis per rock so the field is alive but not busy.
        for (const a of solarBuild.asteroids) {
          const ang = uTime.value * a.speed + a.phase;
          a.mesh.position.set(
            Math.cos(ang) * a.orbit,
            Math.sin(ang) * a.inclination * a.orbit,
            Math.sin(ang) * a.orbit
          );
          a.mesh.rotateOnAxis(a.spinAxis, a.spinRate * dt);
        }
      }
      // Planet detail: surface + clouds are LOCKED together (same
      // rotation rate) so the planet reads as a single coherent body
      // rather than two layers gliding past each other. Clouds get a
      // tiny extra delta — relative drift only, like real weather.
      // Earth's spin is slow + stately (a full turn ≈ 60s) so it
      // looks majestic rather than spinning like a top.
      if (curLevel === 3) {
        const d = detailBuilds[curPlanet];
        const spinRate = 0.05; // rad/s — slow + cinematic
        if (d.planet) d.planet.rotation.y += dt * spinRate;
        // Clouds rotate at surface rate + a tiny relative drift
        // (~6% extra) to feel like wind shear, not a separate layer.
        if (d.clouds) d.clouds.rotation.y += dt * spinRate * 1.06;
        for (const m of d.moons) {
          const a = uTime.value * m.spec.speed + m.phase;
          m.mesh.position.set(
            Math.cos(a) * m.spec.orbit,
            Math.sin(a) * m.spec.inclination * m.spec.orbit,
            Math.sin(a) * m.spec.orbit
          );
          m.mesh.rotation.y += dt * 0.06;
        }
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
      if (!isPreview) {
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("contextmenu", onContextMenu);
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("pointermove", onHoverMove);
        // If a drag is mid-flight when the wallpaper unmounts, the
        // window-level move/up listeners are still attached. Yank them.
        window.removeEventListener("pointermove", onWindowPointerMove);
        window.removeEventListener("pointerup", onWindowPointerUp);
        window.removeEventListener("pointercancel", onWindowPointerUp);
        if (pendingClickTimer) {
          clearTimeout(pendingClickTimer);
        }
      }
      ro?.disconnect();
      galaxyCleanup();
      clusterCleanup();
      solarBuild.dispose();
      for (const d of detailBuilds) d.dispose();
      earthTex?.dispose();
      earthCloudsTex?.dispose();
      moonTex?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [preview, dotCount, isPreview]);

  return (
    <div
      ref={containerRef}
      style={{
        width: preview ? `${preview.w}px` : "100%",
        height: preview ? `${preview.h}px` : "100%",
        pointerEvents: preview ? "none" : "auto",
        position: "relative",
      }}
    >
      {!preview && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[0.66rem] font-medium uppercase tracking-[0.16em] text-white/80 backdrop-blur-md"
        >
          <span className="text-white">
            {level === 3 ? PLANET_NAMES[focusedPlanet] : LEVEL_NAMES[level]}
          </span>
          <span className="text-white/40">·</span>
          <span className="text-white/55">
            {level === 2
              ? "click a planet · drag to rotate"
              : level === 3
                ? "double-click to exit · drag to rotate"
                : "double-click to dive · drag to rotate"}
          </span>
        </div>
      )}
    </div>
  );
}

/* ──────────── Builders ──────────── */

function buildGalaxy(
  group: THREE.Group,
  dotCount: number,
  galaxyRadius: number,
  isPreview: boolean,
  uTime: { value: number }
) {
  const positions = new Float32Array(dotCount * 3);
  const colors = new Float32Array(dotCount * 3);
  const sizes = new Float32Array(dotCount);
  const phases = new Float32Array(dotCount);
  const arms = 4;
  const armSpread = 0.42;
  const armWindup = 2.6;
  const bulgeFraction = 0.18;
  const COLOR_CORE = new THREE.Color("#ffd9a3");
  const COLOR_DISK = new THREE.Color("#a3c8ff");
  const COLOR_OUTER = new THREE.Color("#ffd6f0");
  const COLOR_FEATURE = new THREE.Color("#ffffff");
  const tmp = new THREE.Color();
  for (let i = 0; i < dotCount; i++) {
    const isFeature = Math.random() < 0.012;
    const inBulge = Math.random() < bulgeFraction;
    let r: number, theta: number, y: number;
    if (inBulge) {
      r = galaxyRadius * 0.18 * Math.pow(Math.random(), 0.6);
      theta = Math.random() * Math.PI * 2;
      y = (Math.random() - 0.5) * r * 0.9;
    } else {
      const arm = Math.floor(Math.random() * arms);
      const armAngle = (arm / arms) * Math.PI * 2;
      r = galaxyRadius * (0.18 + Math.sqrt(Math.random()) * 0.82);
      const armOffset = gaussian() * armSpread;
      const windup = armWindup * (r / galaxyRadius);
      theta = armAngle + windup + armOffset;
      const thickness = 1.6 + 4.5 * (1 - r / galaxyRadius);
      y = (Math.random() - 0.5) * 2 * thickness;
    }
    positions[i * 3] = Math.cos(theta) * r;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(theta) * r;
    const t = r / galaxyRadius;
    const target = t < 0.25 ? COLOR_CORE : t < 0.7 ? COLOR_DISK : COLOR_OUTER;
    tmp.copy(target);
    const v = 0.08;
    tmp.r = clamp01(tmp.r + (Math.random() - 0.5) * v);
    tmp.g = clamp01(tmp.g + (Math.random() - 0.5) * v);
    tmp.b = clamp01(tmp.b + (Math.random() - 0.5) * v);
    if (isFeature) tmp.lerp(COLOR_FEATURE, 0.7);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
    const baseSize = isPreview ? 0.7 : 1.1;
    let s = baseSize + Math.random() * baseSize * 0.6;
    if (inBulge) s *= 0.6;
    if (isFeature) s *= isPreview ? 2.4 : 3.0;
    sizes[i] = s;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  geom.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uOpacity: { value: 1 } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(geom, mat);
  stars.rotation.x = -0.72;
  group.add(stars);
  const spriteMap = makeRadialTexture("#ffe9b8");
  const spriteMat = new THREE.SpriteMaterial({
    map: spriteMap,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.7,
  });
  const sprite = new THREE.Sprite(spriteMat);
  const sg = isPreview ? galaxyRadius * 0.7 : galaxyRadius * 0.55;
  sprite.scale.set(sg, sg, 1);
  group.add(sprite);
  return () => {
    geom.dispose();
    mat.dispose();
    spriteMat.dispose();
    spriteMap.dispose();
  };
}

function buildStarCluster(
  group: THREE.Group,
  isPreview: boolean,
  uTime: { value: number }
) {
  const N = isPreview ? 200 : 500;
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  const phases = new Float32Array(N);
  const tmp = new THREE.Color();
  const cool = new THREE.Color("#cfe1ff");
  const warm = new THREE.Color("#ffe7c2");
  for (let i = 0; i < N; i++) {
    const r = 12 + Math.abs(gaussian()) * 24;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    tmp.copy(Math.random() > 0.5 ? cool : warm);
    const v = 0.1;
    tmp.r = clamp01(tmp.r + (Math.random() - 0.5) * v);
    tmp.g = clamp01(tmp.g + (Math.random() - 0.5) * v);
    tmp.b = clamp01(tmp.b + (Math.random() - 0.5) * v);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
    sizes[i] = 1.4 + Math.random() * 1.5;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  geom.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uOpacity: { value: 0 } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(geom, mat);
  group.add(stars);
  const featureMap = makeRadialTexture("#fff2b8");
  const featureMat = new THREE.SpriteMaterial({
    map: featureMap,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
  });
  const feature = new THREE.Sprite(featureMat);
  feature.scale.set(8, 8, 1);
  feature.position.set(2, 0, 6);
  group.add(feature);
  return () => {
    geom.dispose();
    mat.dispose();
    featureMat.dispose();
    featureMap.dispose();
  };
}

function buildSolarSystem(
  group: THREE.Group,
  isPreview: boolean,
  uTime: { value: number }
) {
  // Sun
  const sunMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uOpacity: { value: 0 } },
    vertexShader: SUN_VERT,
    fragmentShader: SUN_FRAG,
    transparent: true,
  });
  const sunGeom = new THREE.SphereGeometry(2.4, 48, 48);
  const sun = new THREE.Mesh(sunGeom, sunMat);
  group.add(sun);
  const coronaMap = makeRadialTexture("#ffcb6b");
  const coronaMat = new THREE.SpriteMaterial({
    map: coronaMap,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
  });
  const corona = new THREE.Sprite(coronaMat);
  corona.scale.set(11, 11, 1);
  group.add(corona);

  // Planets
  const planets: Array<{
    mesh: THREE.Mesh;
    mat: THREE.ShaderMaterial;
    orbit: number;
    speed: number;
    phase: number;
    tilt: number;
    geom: THREE.BufferGeometry;
  }> = [];
  for (let i = 0; i < PLANETS.length; i++) {
    const spec = PLANETS[i];
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime,
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color(spec.color) },
        uType: { value: spec.type === "earth" ? 1 : spec.type === "mars" ? 2 : 0 },
      },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      transparent: true,
    });
    const g = new THREE.SphereGeometry(spec.radius, 32, 32);
    const m = new THREE.Mesh(g, mat);
    m.userData.planetIndex = i;
    group.add(m);
    planets.push({ mesh: m, mat, orbit: spec.orbit, speed: spec.speed, phase: Math.random() * Math.PI * 2, tilt: spec.tilt * 0.05, geom: g });
  }

  // Orbit rings
  const orbitMats: THREE.LineBasicMaterial[] = [];
  const orbitGeoms: THREE.BufferGeometry[] = [];
  for (const spec of PLANETS) {
    const segs = 96;
    const verts = new Float32Array(segs * 3);
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      verts[i * 3] = Math.cos(a) * spec.orbit;
      verts[i * 3 + 1] = 0;
      verts[i * 3 + 2] = Math.sin(a) * spec.orbit;
    }
    const og = new THREE.BufferGeometry();
    og.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    const om = new THREE.LineBasicMaterial({
      color: 0x4a5570,
      transparent: true,
      opacity: 0,
    });
    const ring = new THREE.LineLoop(og, om);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    orbitMats.push(om);
    orbitGeoms.push(og);
  }

  /* Asteroid belt — irregular low-poly rocks scattered between Mars
   * and the outer dust ring. Each is an icosahedron with each vertex
   * pushed by a small random amount along its normal so the silhouette
   * isn't a clean sphere. They drift on their own slow orbits and
   * tumble on a random axis so the field feels populated and alive
   * without competing visually with the planets. */
  const asteroidCount = isPreview ? 0 : 14;
  const asteroidMeshes: Array<{
    mesh: THREE.Mesh;
    geom: THREE.BufferGeometry;
    mat: THREE.MeshStandardMaterial;
    orbit: number;
    speed: number;
    phase: number;
    inclination: number;
    spinAxis: THREE.Vector3;
    spinRate: number;
  }> = [];
  // Soft hemisphere light just for the asteroids — picks up the warm
  // sun-side and cool night-side without lighting the rest of the scene.
  const beltLight = new THREE.HemisphereLight(0xffe4a3, 0x10131d, 0.85);
  beltLight.position.set(0, 1, 0);
  group.add(beltLight);
  for (let i = 0; i < asteroidCount; i++) {
    const radius = 0.16 + Math.random() * 0.32;
    const detail = Math.random() > 0.5 ? 1 : 0;
    const geom = new THREE.IcosahedronGeometry(radius, detail);
    // Jitter vertices for an irregular silhouette.
    const pos = geom.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let v = 0; v < arr.length; v += 3) {
      const len = Math.hypot(arr[v], arr[v + 1], arr[v + 2]);
      const j = 1 + (Math.random() - 0.5) * 0.55;
      arr[v] = (arr[v] / len) * radius * j;
      arr[v + 1] = (arr[v + 1] / len) * radius * j;
      arr[v + 2] = (arr[v + 2] / len) * radius * j;
    }
    geom.computeVertexNormals();
    const tone = 0.45 + Math.random() * 0.25;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(tone, tone * 0.95, tone * 0.85),
      roughness: 0.95,
      metalness: 0.05,
      flatShading: true,
      transparent: true,
      opacity: 0,
    });
    const mesh = new THREE.Mesh(geom, mat);
    group.add(mesh);
    // Distribute mostly between Mars (10.6) and the outer dust shell.
    const orbit = 12.5 + Math.random() * 4.5;
    asteroidMeshes.push({
      mesh,
      geom,
      mat,
      orbit,
      speed: 0.15 + Math.random() * 0.18,
      phase: Math.random() * Math.PI * 2,
      inclination: (Math.random() - 0.5) * 0.4,
      spinAxis: new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize(),
      spinRate: (Math.random() - 0.5) * 1.4,
    });
  }

  // Background dust
  const dustN = isPreview ? 80 : 220;
  const dPos = new Float32Array(dustN * 3);
  const dCol = new Float32Array(dustN * 3);
  const dSize = new Float32Array(dustN);
  const dPhase = new Float32Array(dustN);
  for (let i = 0; i < dustN; i++) {
    const r = 60 + Math.random() * 40;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    dPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    dPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    dPos[i * 3 + 2] = r * Math.cos(phi);
    dCol[i * 3] = 0.85;
    dCol[i * 3 + 1] = 0.9;
    dCol[i * 3 + 2] = 1;
    dSize[i] = 0.7 + Math.random() * 0.7;
    dPhase[i] = Math.random() * Math.PI * 2;
  }
  const dGeom = new THREE.BufferGeometry();
  dGeom.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
  dGeom.setAttribute("color", new THREE.BufferAttribute(dCol, 3));
  dGeom.setAttribute("size", new THREE.BufferAttribute(dSize, 1));
  dGeom.setAttribute("phase", new THREE.BufferAttribute(dPhase, 1));
  const dMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uOpacity: { value: 0 } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dGeom, dMat);
  group.add(dust);

  return {
    sun,
    planets,
    asteroids: asteroidMeshes,
    dispose: () => {
      sunGeom.dispose();
      sunMat.dispose();
      coronaMat.dispose();
      coronaMap.dispose();
      for (const p of planets) {
        p.geom.dispose();
        p.mat.dispose();
      }
      for (const a of asteroidMeshes) {
        a.geom.dispose();
        a.mat.dispose();
      }
      for (const og of orbitGeoms) og.dispose();
      for (const om of orbitMats) om.dispose();
      dGeom.dispose();
      dMat.dispose();
    },
  };
}

function buildPlanetDetail(
  group: THREE.Group,
  spec: PlanetSpec,
  isPreview: boolean,
  uTime: { value: number },
  earthTex: THREE.Texture | null,
  earthCloudsTex: THREE.Texture | null,
  moonTex: THREE.Texture | null
) {
  // Sun light at the same notional origin (off-screen) so Earth/Moon
  // are lit consistently.
  const sunDir = new THREE.Vector3(8, 4, 6).normalize();
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.6);
  sunLight.position.copy(sunDir).multiplyScalar(20);
  group.add(sunLight);
  const ambient = new THREE.AmbientLight(0x202938, 0.45);
  group.add(ambient);

  // The PLANET itself.
  let planetMesh: THREE.Mesh;
  let planetMat: THREE.Material;
  let planetGeom: THREE.SphereGeometry;
  let cloudsMesh: THREE.Mesh | null = null;
  let cloudsMat: THREE.Material | null = null;
  let cloudsGeom: THREE.SphereGeometry | null = null;
  let atmoMesh: THREE.Mesh | null = null;
  let atmoMat: THREE.ShaderMaterial | null = null;
  let atmoGeom: THREE.SphereGeometry | null = null;

  const planetRadius = 2.6;

  if (spec.name === "Earth" && earthTex && earthCloudsTex && !isPreview) {
    // Realistic Earth with the NASA Blue Marble colour map.
    const m = new THREE.MeshPhongMaterial({
      map: earthTex,
      specular: new THREE.Color(0x223344),
      shininess: 18,
      transparent: true,
      opacity: 0,
    });
    planetMat = m;
    planetGeom = new THREE.SphereGeometry(planetRadius, 96, 96);
    planetMesh = new THREE.Mesh(planetGeom, planetMat);
    planetMesh.rotation.z = THREE.MathUtils.degToRad(spec.tilt);
    group.add(planetMesh);

    // Cloud shell — slightly larger sphere with a transparent cloud
    // texture; rotates independently.
    cloudsGeom = new THREE.SphereGeometry(planetRadius * 1.012, 96, 96);
    cloudsMat = new THREE.MeshPhongMaterial({
      map: earthCloudsTex,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    cloudsMesh = new THREE.Mesh(cloudsGeom, cloudsMat);
    cloudsMesh.rotation.z = THREE.MathUtils.degToRad(spec.tilt);
    group.add(cloudsMesh);

    // Atmospheric rim glow — additive shader on a slightly oversized sphere.
    atmoGeom = new THREE.SphereGeometry(planetRadius * 1.06, 64, 64);
    atmoMat = new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color("#5fa8ff") },
      },
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    atmoMesh = new THREE.Mesh(atmoGeom, atmoMat);
    group.add(atmoMesh);
  } else {
    // Procedural fallback for the non-Earth planets.
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uTime,
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color(spec.color) },
        uType: { value: spec.type === "mars" ? 2 : 0 },
      },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      transparent: true,
    });
    planetMat = m;
    planetGeom = new THREE.SphereGeometry(planetRadius, 64, 64);
    planetMesh = new THREE.Mesh(planetGeom, planetMat);
    planetMesh.rotation.z = THREE.MathUtils.degToRad(spec.tilt);
    group.add(planetMesh);
  }

  // Real moons. Mercury / Venus → empty array, no moon mesh built.
  // Earth → 1 (Luna with the LRO texture). Mars → 2 (Phobos/Deimos
  // procedural — they're tiny captured asteroids in reality, no good
  // public-domain map at the resolution we'd use).
  interface BuiltMoon {
    spec: MoonSpec;
    mesh: THREE.Mesh;
    mat: THREE.Material;
    geom: THREE.SphereGeometry;
    /** Per-moon orbit phase so multiple moons don't sit on top of each other. */
    phase: number;
  }
  const builtMoons: BuiltMoon[] = [];
  for (let i = 0; i < spec.moons.length; i++) {
    const ms = spec.moons[i];
    let mat: THREE.Material;
    if (ms.surface === "luna" && moonTex && !isPreview) {
      mat = new THREE.MeshPhongMaterial({
        map: moonTex,
        specular: 0x111111,
        shininess: 5,
        transparent: true,
        opacity: 0,
      });
    } else {
      mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime,
          uOpacity: { value: 0 },
          uColor: { value: new THREE.Color(0xb0b3b8) },
          uType: { value: 3 },
        },
        vertexShader: PLANET_VERT,
        fragmentShader: PLANET_FRAG,
        transparent: true,
      });
    }
    const segs = ms.surface === "luna" ? 48 : 24;
    const geom = new THREE.SphereGeometry(ms.radius, segs, segs);
    const mesh = new THREE.Mesh(geom, mat);
    group.add(mesh);
    builtMoons.push({
      spec: ms,
      mesh,
      mat,
      geom,
      phase: (i * Math.PI * 2) / Math.max(1, spec.moons.length),
    });
  }

  // Background dust at this scale.
  const dN = isPreview ? 80 : 200;
  const dP = new Float32Array(dN * 3);
  const dC = new Float32Array(dN * 3);
  const dS = new Float32Array(dN);
  const dPh = new Float32Array(dN);
  for (let i = 0; i < dN; i++) {
    const r = 30 + Math.random() * 20;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    dP[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    dP[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    dP[i * 3 + 2] = r * Math.cos(phi);
    dC[i * 3] = 0.9;
    dC[i * 3 + 1] = 0.92;
    dC[i * 3 + 2] = 1;
    dS[i] = 0.8 + Math.random();
    dPh[i] = Math.random() * Math.PI * 2;
  }
  const dG = new THREE.BufferGeometry();
  dG.setAttribute("position", new THREE.BufferAttribute(dP, 3));
  dG.setAttribute("color", new THREE.BufferAttribute(dC, 3));
  dG.setAttribute("size", new THREE.BufferAttribute(dS, 1));
  dG.setAttribute("phase", new THREE.BufferAttribute(dPh, 1));
  const dM = new THREE.ShaderMaterial({
    uniforms: { uTime, uOpacity: { value: 0 } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dG, dM);
  group.add(dust);

  return {
    planet: planetMesh,
    clouds: cloudsMesh,
    atmosphere: atmoMesh,
    moons: builtMoons,
    dispose: () => {
      planetGeom.dispose();
      planetMat.dispose();
      cloudsGeom?.dispose();
      cloudsMat?.dispose();
      atmoGeom?.dispose();
      atmoMat?.dispose();
      for (const m of builtMoons) {
        m.geom.dispose();
        m.mat.dispose();
      }
      dG.dispose();
      dM.dispose();
    },
  };
}

/* ──────────── shaders ──────────── */

const STAR_VERT = /* glsl */ `
  attribute float size;
  attribute float phase;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uTime;
  uniform float uOpacity;
  void main() {
    vColor = color;
    float twinkle = 0.78 + 0.22 * sin(uTime * 1.6 + phase);
    vAlpha = twinkle * uOpacity;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (380.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const STAR_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    float halo = smoothstep(0.5, 0.25, d) * 0.4;
    float a = (core + halo) * vAlpha;
    gl_FragColor = vec4(vColor, a);
  }
`;

const SUN_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SUN_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  uniform float uTime;
  uniform float uOpacity;
  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(
      mix(mix(hash(i+vec3(0,0,0)), hash(i+vec3(1,0,0)), f.x),
          mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
          mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  /* Layered noise — fast small-scale "boiling" + slow large-scale
   * convection cells. Scrolled in opposite directions so they shear
   * across each other and read as a turbulent surface, not a static
   * speckle pattern. */
  float surface(vec3 p, float t) {
    float n = 0.0;
    n += 0.50 * vnoise(p * 1.6 + vec3(t * 0.18, t * 0.12, 0.0));
    n += 0.30 * vnoise(p * 3.4 + vec3(-t * 0.32, 0.0, t * 0.22));
    n += 0.20 * vnoise(p * 6.8 + vec3(0.0, t * 0.5, -t * 0.4));
    return n;
  }
  void main() {
    float n = surface(vWorldPos, uTime);
    /* Granulation cells — adds dark thin lacing between hot bright
     * patches, like real solar granulation. */
    float cells = smoothstep(0.42, 0.58, vnoise(vWorldPos * 9.0 + uTime * 0.3));
    /* Hot core / cool shell colour palette pushed redder than before. */
    vec3 hot = vec3(1.0, 0.92, 0.55);
    vec3 mid = vec3(1.0, 0.62, 0.20);
    vec3 cool = vec3(0.96, 0.30, 0.06);
    vec3 c = mix(cool, mid, smoothstep(0.30, 0.70, n));
    c = mix(c, hot, smoothstep(0.65, 1.15, n));
    /* Granulation darkens the lacing slightly. */
    c *= 0.88 + 0.12 * cells;
    /* Limb-brightening rim. The pow() input is now clamped to [0,1]
     * so there's no NaN risk on back-facing normals. */
    float rim = pow(max(0.0, 1.0 - max(dot(vNormal, vec3(0,0,1)), 0.0)), 1.4);
    c += rim * vec3(1.0, 0.55, 0.20) * 1.1;
    /* Tiny pulsing prominences — flares peak occasionally. */
    float flare = pow(max(0.0, vnoise(vWorldPos * 2.0 + uTime * 0.6)), 6.0);
    c += flare * vec3(1.0, 0.8, 0.4) * 0.6;
    gl_FragColor = vec4(c, uOpacity);
  }
`;

const PLANET_VERT = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const PLANET_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform int uType;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(
      mix(mix(hash(i+vec3(0,0,0)), hash(i+vec3(1,0,0)), f.x),
          mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
          mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0; float a = 0.5;
    for (int k = 0; k < 5; k++) {
      v += a * vnoise(p);
      p *= 2.07; a *= 0.5;
    }
    return v;
  }
  void main() {
    vec3 N = normalize(vNormal);
    vec3 sunDir = normalize(vec3(1.0, 0.6, 0.5));
    float ndotl = max(0.0, dot(N, sunDir));
    /* Half-Lambert wraparound makes the night side fall off softer
     * than the harsh terminator from raw Lambert. */
    float wrap = ndotl * 0.6 + 0.4;
    vec3 baseCol = uColor;
    float roughness = 0.65;
    if (uType == 2) {
      // Mars — multi-octave fbm + dark mineral patches + ice cap mix
      // toward the poles.
      float n = fbm(vWorldPos * 2.2);
      float fine = fbm(vWorldPos * 6.0);
      vec3 lo = vec3(0.45, 0.16, 0.06);
      vec3 hi = vec3(0.86, 0.46, 0.22);
      baseCol = mix(lo, hi, n);
      // Dark patch noise.
      baseCol *= 0.78 + 0.22 * fine;
      // Polar caps (subtle frost).
      float polar = smoothstep(0.78, 0.95, abs(N.y));
      baseCol = mix(baseCol, vec3(0.94, 0.92, 0.88), polar * 0.55);
      roughness = 0.88;
    } else if (uType == 3) {
      // Moon — gray with crater pock-noise.
      float n = fbm(vWorldPos * 5.0);
      baseCol = mix(vec3(0.55, 0.55, 0.6), vec3(0.85, 0.85, 0.9), n);
      float pits = vnoise(vWorldPos * 12.0);
      baseCol *= 0.85 + 0.15 * pits;
      roughness = 0.95;
    } else {
      // Generic rocky (Mercury / Venus). Mercury-like rough cratering
      // for darker base; Venus-like banded clouds for warmer colors.
      float n = fbm(vWorldPos * 3.0);
      float bands = 0.5 + 0.5 * sin(vWorldPos.y * 6.0 + n * 4.0);
      vec3 darker = uColor * 0.55;
      vec3 lighter = uColor * 1.18;
      // Use bands more for warm tones (Venus), less for cold (Mercury).
      float warmth = clamp(uColor.r - uColor.b + 0.3, 0.0, 1.0);
      vec3 mottled = mix(darker, lighter, n);
      vec3 banded = mix(darker, lighter, bands);
      baseCol = mix(mottled, banded, warmth);
      roughness = 0.75 - warmth * 0.25;
    }
    /* Diffuse + subtle specular (Blinn-Phong-ish) so lit edges glint
     * a little and the body reads as 3D, not painted. */
    vec3 lit = baseCol * (0.16 + 0.84 * wrap);
    /* Specular only on the lit hemisphere, attenuated by roughness. */
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 halfDir = normalize(sunDir + viewDir);
    float spec = pow(max(0.0, dot(N, halfDir)), 28.0);
    lit += spec * (1.0 - roughness) * 0.4;
    /* Fresnel rim for a touch of atmospheric edge brightness. */
    float rim = pow(1.0 - max(dot(N, viewDir), 0.0), 3.0);
    lit += rim * baseCol * 0.18;
    gl_FragColor = vec4(lit, uOpacity);
  }
`;

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const ATMO_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec3 vNormal;
  void main() {
    /* Clamp the input to [0,1] before pow() — the previous form
     * produced NaN on back-facing normals and banded the silhouette.
     * The result is the classic Rayleigh-style halo that's brightest
     * at the limb and fades into the planet. */
    float fresnel = clamp(0.85 - dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
    float intensity = pow(fresnel, 2.0);
    gl_FragColor = vec4(uColor, intensity * uOpacity);
  }
`;

/* ──────────── helpers ──────────── */

function applyOpacity(group: THREE.Group, value: number) {
  group.traverse((obj) => {
    const o = obj as THREE.Mesh | THREE.Points | THREE.LineLoop | THREE.Sprite;
    const m = (o as THREE.Mesh).material as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    if (!m) return;
    if (Array.isArray(m)) for (const mm of m) setMatOpacity(mm, value);
    else setMatOpacity(m, value);
  });
}
function setMatOpacity(m: THREE.Material, value: number) {
  if ("uniforms" in m && (m as THREE.ShaderMaterial).uniforms?.uOpacity) {
    (m as THREE.ShaderMaterial).uniforms.uOpacity.value = value;
  } else if ("opacity" in m) {
    (m as { opacity: number }).opacity = value;
    (m as THREE.Material).transparent = true;
  }
}
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
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
function makeRadialTexture(centerHex: string): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(
      size / 2, size / 2, 0, size / 2, size / 2, size / 2
    );
    grad.addColorStop(0, hexWithAlpha(centerHex, 1));
    grad.addColorStop(0.45, hexWithAlpha(centerHex, 0.55));
    grad.addColorStop(0.75, hexWithAlpha(centerHex, 0.18));
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function hexWithAlpha(hex: string, a: number): string {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}
