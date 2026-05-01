"use client";

/* ParticleGalaxy v5 — properly photorealistic, full rewrite.
 *
 * Asad called out the v4 line as "incremental tries that don't add
 * up". This version is built around a single principle: every body
 * uses a real NASA-derived texture, lit by a real PointLight at the
 * Sun. No more procedural-noise planets that look like colored
 * marbles. No more jittered-icosahedron asteroids that read as
 * folded paper.
 *
 * Texture pipeline (all CC-licensed / public domain, bundled in
 * /public/textures, total ~3.7MB, only fetched when the wallpaper
 * is selected):
 *   - 2k_sun.jpg                — Solar Dynamics Observatory composite
 *   - 2k_mercury.jpg            — MESSENGER mosaic
 *   - 2k_venus_atmosphere.jpg   — Magellan / Pioneer atmospheric top
 *   - earth_atmos_2048.jpg      — NASA Blue Marble surface
 *   - earth_clouds_1024.png     — translucent cloud layer
 *   - earth_specular_2048.jpg   — ocean specular mask (oceans glint
 *                                 under the sun, continents are matte)
 *   - 2k_mars.jpg               — Viking / MOLA mosaic
 *   - moon_1024.jpg             — Lunar Reconnaissance Orbiter mosaic
 *   - 2k_stars_milky_way.jpg    — wide-field night sky for the
 *                                 inverted-sphere skybox
 *
 * Lighting model (Solar System level):
 *   - PointLight at world origin (the Sun) — distance falloff so
 *     Mercury is brightest, Mars dimmer.
 *   - Soft AmbientLight (0.08) so unlit hemispheres don't go pure
 *     black on planets that face away.
 *   - Sun mesh uses MeshBasicMaterial (emissive, no lighting
 *     dependency) so it appears self-lit even though the PointLight
 *     is positioned inside it.
 *
 * Lighting model (Planet Detail level):
 *   - DirectionalLight from off-axis to give a clean terminator and
 *     visible day/night. Planets rotate underneath the fixed light
 *     so their textured surface scrolls into and out of daylight.
 *   - AmbientLight 0.18 for subtle base illumination.
 *
 * Asteroid belt:
 *   - Smooth-shaded IcosahedronGeometry(detail=2) — 320 triangles
 *     each, more than the v4 jittered low-poly origami. Vertices
 *     get a small (0.15) per-vertex displacement along their normal
 *     for an irregular silhouette, then computeVertexNormals() so
 *     lighting reads as smooth.
 *   - MeshStandardMaterial with a procedural rocky color (warm gray
 *     + dark mineral patches) and high roughness. Lit by the same
 *     PointLight at the Sun, so they fall into shadow naturally.
 *   - Each rock has its own orbit + tumble axis + spin rate.
 *
 * Star skybox:
 *   - Inverted SphereGeometry(800) with the Milky Way panorama
 *     mapped on the inside. The whole scene exists inside this
 *     sphere; the camera stays well inside it. Doesn't move with the
 *     planets — it's the universe.
 *
 * Interaction (preserved from v4.2):
 *   - DOUBLE-CLICK empty space → advance level (galaxy → cluster →
 *     solar → planet detail → wraps).
 *   - SINGLE-CLICK a planet → zoom into that planet's detail.
 *   - LONG-PRESS + DRAG → trackball rotate; release with velocity →
 *     inertial spin that decays.
 *   - ESC / right-click → step back one level.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

interface Props {
  preview?: { w: number; h: number };
}

const LEVEL_NAMES = ["Galaxy", "Star Cluster", "Solar System"] as const;
const PLANET_NAMES = ["Mercury", "Venus", "Earth", "Mars"] as const;

const TEX = {
  sun: "/textures/2k_sun.jpg",
  mercury: "/textures/2k_mercury.jpg",
  venus: "/textures/2k_venus_atmosphere.jpg",
  earth: "/textures/earth_atmos_2048.jpg",
  earthClouds: "/textures/earth_clouds_1024.png",
  earthSpecular: "/textures/earth_specular_2048.jpg",
  mars: "/textures/2k_mars.jpg",
  moon: "/textures/moon_1024.jpg",
  stars: "/textures/2k_stars_milky_way.jpg",
} as const;

interface MoonSpec {
  name: string;
  radius: number;
  orbit: number;
  speed: number;
  inclination: number;
  /** "luna" → real LRO map. "rocky" → procedural gray (Phobos / Deimos). */
  surface: "luna" | "rocky";
}

interface PlanetSpec {
  name: (typeof PLANET_NAMES)[number];
  /** Radius in the SOLAR SYSTEM view (everything tiny, lit by Sun). */
  solarRadius: number;
  /** Radius in the PLANET DETAIL view (planet fills frame). */
  detailRadius: number;
  orbit: number;
  type: "mercury" | "venus" | "earth" | "mars";
  speed: number;
  /** Axial tilt in degrees. Earth ≈ 23.5, Mars ≈ 25, Mercury ≈ 0, Venus ≈ 177 (retrograde, simplified). */
  tilt: number;
  moons: MoonSpec[];
}

const PLANETS: PlanetSpec[] = [
  { name: "Mercury", solarRadius: 0.45, detailRadius: 2.4, orbit: 5.0, type: "mercury", speed: 0.9, tilt: 0.04, moons: [] },
  { name: "Venus", solarRadius: 0.7, detailRadius: 2.5, orbit: 6.8, type: "venus", speed: 0.6, tilt: 2.6, moons: [] },
  {
    name: "Earth", solarRadius: 0.78, detailRadius: 2.6, orbit: 9.0, type: "earth", speed: 0.4, tilt: 23.5,
    moons: [{ name: "Luna", radius: 0.7, orbit: 5.5, speed: 0.55, inclination: 0.07, surface: "luna" }],
  },
  {
    name: "Mars", solarRadius: 0.6, detailRadius: 2.55, orbit: 11.4, type: "mars", speed: 0.28, tilt: 25,
    moons: [
      { name: "Phobos", radius: 0.16, orbit: 3.2, speed: 1.4, inclination: 0.1, surface: "rocky" },
      { name: "Deimos", radius: 0.13, orbit: 5.4, speed: 0.6, inclination: -0.18, surface: "rocky" },
    ],
  },
];

interface Textures {
  sun: THREE.Texture;
  mercury: THREE.Texture;
  venus: THREE.Texture;
  earth: THREE.Texture;
  earthClouds: THREE.Texture;
  earthSpecular: THREE.Texture;
  mars: THREE.Texture;
  moon: THREE.Texture;
  stars: THREE.Texture;
}

export default function ParticleGalaxy({ preview }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState<0 | 1 | 2 | 3>(0);
  const [focusedPlanet, setFocusedPlanet] = useState<number>(2);

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
      powerPreference: isPreview ? "low-power" : "high-performance",
    });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x040611, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
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

    /* ─── Texture loading ───────────────────────────────────────── */
    const texLoader = new THREE.TextureLoader();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    function loadColor(url: string): THREE.Texture {
      const t = texLoader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      return t;
    }
    function loadData(url: string): THREE.Texture {
      const t = texLoader.load(url);
      t.anisotropy = maxAniso;
      return t;
    }
    let textures: Textures | null = null;
    if (!isPreview) {
      textures = {
        sun: loadColor(TEX.sun),
        mercury: loadColor(TEX.mercury),
        venus: loadColor(TEX.venus),
        earth: loadColor(TEX.earth),
        earthClouds: loadColor(TEX.earthClouds),
        earthSpecular: loadData(TEX.earthSpecular),
        mars: loadColor(TEX.mars),
        moon: loadColor(TEX.moon),
        stars: loadColor(TEX.stars),
      };
    }

    /* ─── Levels ───────────────────────────────────────────────── */
    const galaxyGroup = new THREE.Group();
    scene.add(galaxyGroup);
    const galaxyCleanup = buildGalaxy(galaxyGroup, dotCount, isPreview, uTime);

    const clusterGroup = new THREE.Group();
    clusterGroup.visible = false;
    scene.add(clusterGroup);
    const clusterCleanup = buildStarCluster(clusterGroup, isPreview, uTime);

    const solarGroup = new THREE.Group();
    solarGroup.visible = false;
    scene.add(solarGroup);
    const solarBuild = buildSolarSystem(solarGroup, isPreview, uTime, textures);

    const detailGroups: THREE.Group[] = [];
    const detailBuilds: ReturnType<typeof buildPlanetDetail>[] = [];
    for (let i = 0; i < PLANETS.length; i++) {
      const g = new THREE.Group();
      g.visible = false;
      scene.add(g);
      detailGroups.push(g);
      detailBuilds.push(buildPlanetDetail(g, PLANETS[i], isPreview, uTime, textures));
    }

    /* ─── Camera presets ────────────────────────────────────────── */
    const camPresets = {
      0: { pos: new THREE.Vector3(0, 50, 250), look: new THREE.Vector3(0, 0, 0) },
      1: { pos: new THREE.Vector3(0, 5, 90), look: new THREE.Vector3(0, 0, 0) },
      2: { pos: new THREE.Vector3(0, 7, 24), look: new THREE.Vector3(0, 0, 0) },
      3: { pos: new THREE.Vector3(0, 0, 9), look: new THREE.Vector3(0, 0, 0) },
    };
    camera.position.copy(camPresets[0].pos);
    camera.lookAt(camPresets[0].look);

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

    /* ─── Pointer state ────────────────────────────────────────── */
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

    interface VelSample {
      t: number;
      yaw: number;
      pitch: number;
    }
    const velSamples: VelSample[] = [];
    const velocity = { yaw: 0, pitch: 0 };
    const VELOCITY_DAMPING = 0.93;

    let curLevel: 0 | 1 | 2 | 3 = 0;
    let prevLevel: 0 | 1 | 2 | 3 = 0;
    let curPlanet = 2;
    let prevPlanet = 2;
    let inTransition = false;
    let transitionStart = 0;
    const TRANSITION_MS = reduceMotion ? 1 : 1800;

    function startTransition(toLevel: 0 | 1 | 2 | 3, toPlanet: number) {
      if (inTransition) return;
      prevLevel = curLevel;
      prevPlanet = curPlanet;
      curLevel = toLevel;
      curPlanet = toPlanet;
      transitionStart = performance.now();
      inTransition = true;
      const dest = activeGroup(toLevel, toPlanet);
      dest.rotation.set(toLevel === 0 ? -0.72 : 0, 0, 0);
      velocity.yaw = 0;
      velocity.pitch = 0;
      setLevel(toLevel);
      setFocusedPlanet(toPlanet);
    }

    function commitDoubleClick() {
      const next: 0 | 1 | 2 | 3 =
        curLevel === 0 ? 1 : curLevel === 1 ? 2 : curLevel === 2 ? 3 : 0;
      const toPlanet = curLevel === 2 ? curPlanet : 2;
      startTransition(next, toPlanet);
    }

    function projectPlanetClick(clientX: number, clientY: number): number {
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
        const yawDelta = (dx / Math.max(1, pointerCanvasW)) * Math.PI;
        const pitchDelta = (dy / Math.max(1, pointerCanvasH)) * Math.PI;
        const g = activeGroup(curLevel, curPlanet);
        g.rotation.y += yawDelta;
        g.rotation.x = Math.max(-1.4, Math.min(1.4, g.rotation.x + pitchDelta));
        velSamples.push({
          t: performance.now(),
          yaw: g.rotation.y,
          pitch: g.rotation.x,
        });
        if (velSamples.length > 8) velSamples.shift();
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

      if (!wasDown || dragMode === "rotate") {
        if (dragMode === "rotate") {
          const now = performance.now();
          const recent = velSamples.filter((s) => now - s.t < 120);
          if (recent.length >= 2) {
            const a = recent[0];
            const b = recent[recent.length - 1];
            const elapsed = (b.t - a.t) / 1000;
            if (elapsed > 0.001) {
              velocity.yaw = (b.yaw - a.yaw) / elapsed;
              velocity.pitch = (b.pitch - a.pitch) / elapsed;
              const maxVel = 12;
              velocity.yaw = Math.max(-maxVel, Math.min(maxVel, velocity.yaw));
              velocity.pitch = Math.max(-maxVel, Math.min(maxVel, velocity.pitch));
            }
          }
        }
        velSamples.length = 0;
        dragMode = "none";
        return;
      }

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

      if (curLevel === 2) {
        const idx = projectPlanetClick(e.clientX, e.clientY);
        if (idx >= 0) {
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

      pendingClick = { x: e.clientX, y: e.clientY };
      if (pendingClickTimer) clearTimeout(pendingClickTimer);
      pendingClickTimer = setTimeout(() => {
        pendingClick = null;
        pendingClickTimer = null;
      }, DBL_CLICK_MS);
    }
    function onContextMenu(e: MouseEvent) {
      if (isPreview) return;
      e.preventDefault();
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
          [galaxyGroup, clusterGroup, solarGroup, ...detailGroups].forEach((g) => {
            if (g !== curG) setSceneOpacity(g, 0);
          });
          setSceneOpacity(curG, 1);
        }
      } else {
        const c = camPresets[curLevel];
        curCam.x += (targetCam.x - curCam.x) * Math.min(1, dt * 3);
        curCam.y += (targetCam.y - curCam.y) * Math.min(1, dt * 3);
        camera.position.set(c.pos.x + curCam.x * 8, c.pos.y + curCam.y * 4, c.pos.z);
      }
      camera.lookAt(camPresets[curLevel].look);

      // Inertia + auto-idle
      if (!pointerDown && !inTransition) {
        const spinning =
          Math.abs(velocity.yaw) > 0.005 || Math.abs(velocity.pitch) > 0.005;
        if (spinning) {
          curG.rotation.y += velocity.yaw * dt;
          curG.rotation.x = Math.max(
            -1.4,
            Math.min(1.4, curG.rotation.x + velocity.pitch * dt)
          );
          velocity.yaw *= Math.pow(VELOCITY_DAMPING, dt * 60);
          velocity.pitch *= Math.pow(VELOCITY_DAMPING, dt * 60);
          if (Math.abs(velocity.yaw) < 0.005) velocity.yaw = 0;
          if (Math.abs(velocity.pitch) < 0.005) velocity.pitch = 0;
        } else {
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
          p.mesh.rotation.y += dt * 0.2;
        }
        if (solarBuild.sun) solarBuild.sun.rotation.y += dt * 0.04;
        for (const a of solarBuild.asteroids) {
          const ang = uTime.value * a.speed + a.phase;
          a.mesh.position.set(
            Math.cos(ang) * a.orbit,
            Math.sin(ang) * a.inclination * a.orbit,
            Math.sin(ang) * a.orbit
          );
          a.mesh.rotateOnAxis(a.spinAxis, a.spinRate * dt);
        }
        // Animate the sun's overlay shader.
        if (solarBuild.sunOverlayMat) {
          solarBuild.sunOverlayMat.uniforms.uTime.value = uTime.value;
        }
      }
      // Planet detail: planet rotates slowly; clouds match it; moons orbit.
      if (curLevel === 3) {
        const d = detailBuilds[curPlanet];
        const spinRate = 0.05;
        if (d.planet) d.planet.rotation.y += dt * spinRate;
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

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVis);
      if (!isPreview) {
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("contextmenu", onContextMenu);
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("pointermove", onHoverMove);
        window.removeEventListener("pointermove", onWindowPointerMove);
        window.removeEventListener("pointerup", onWindowPointerUp);
        window.removeEventListener("pointercancel", onWindowPointerUp);
        if (pendingClickTimer) clearTimeout(pendingClickTimer);
      }
      ro?.disconnect();
      galaxyCleanup();
      clusterCleanup();
      solarBuild.dispose();
      for (const d of detailBuilds) d.dispose();
      if (textures) {
        for (const k of Object.keys(textures) as Array<keyof Textures>) {
          textures[k].dispose();
        }
      }
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
  isPreview: boolean,
  uTime: { value: number }
) {
  const galaxyRadius = 95;
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
  uTime: { value: number },
  textures: Textures | null
) {
  /* Skybox — inverted sphere with the Milky Way panorama on the
   * inside. Doesn't move with the planets; you're looking out at
   * the deep field. */
  const skyGeom = new THREE.SphereGeometry(800, 32, 32);
  const skyMat = new THREE.MeshBasicMaterial({
    map: textures?.stars ?? null,
    side: THREE.BackSide,
    depthWrite: false,
    transparent: true,
    opacity: 0,
  });
  const sky = new THREE.Mesh(skyGeom, skyMat);
  group.add(sky);

  /* Sun lighting — multiple sources so every planet reads clearly
   * regardless of its orbital position relative to the camera.
   *
   *   1. PointLight at the Sun, decay 0 (no falloff) so planets
   *      receive consistent illumination on their sun-side rather
   *      than dimming to black with distance. Real inverse-square
   *      makes Mars vanish.
   *   2. HemisphereLight gives a soft sky/ground gradient so the
   *      shaded hemisphere isn't pitch black — it reads as
   *      "shaded" rather than "missing".
   *   3. A weak fill light from camera direction so we ALWAYS see
   *      something on the side of the planet we're looking at,
   *      even during transit when its sun-side faces away. This is
   *      key+fill lighting; physically inaccurate but essential for
   *      a wallpaper where every planet must always be legible. */
  const sunLight = new THREE.PointLight(0xfff5e5, 2.6, 0, 0);
  sunLight.position.set(0, 0, 0);
  group.add(sunLight);
  const hemi = new THREE.HemisphereLight(0xc8d4ff, 0x1a1830, 0.35);
  group.add(hemi);
  // Fill light positioned where the camera is — points inward so
  // planets in transit (between camera and sun) still read.
  const fillLight = new THREE.DirectionalLight(0xb0c5e5, 0.55);
  fillLight.position.set(0, 7, 24);
  group.add(fillLight);

  /* The Sun itself. MeshBasicMaterial so it's self-luminous regardless
   * of the PointLight (which is positioned inside it anyway). The base
   * texture supplies surface color/sunspots; an additive overlay
   * shader on a slightly larger sphere adds animated turbulence and
   * granulation cells, and a second outer corona sphere adds the
   * soft halo. Three layers compose to a luminous star. */
  const sunBaseGeom = new THREE.SphereGeometry(2.6, 64, 64);
  const sunBaseMat = new THREE.MeshBasicMaterial({
    map: textures?.sun ?? null,
    color: 0xffe9a8,
    transparent: true,
    opacity: 0,
    toneMapped: false,
  });
  const sun = new THREE.Mesh(sunBaseGeom, sunBaseMat);
  group.add(sun);

  // Animated noise overlay — adds the "boiling" surface activity that
  // a static texture can't show.
  const sunOverlayGeom = new THREE.SphereGeometry(2.61, 48, 48);
  const sunOverlayMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: SUN_OVERLAY_VERT,
    fragmentShader: SUN_OVERLAY_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sunOverlay = new THREE.Mesh(sunOverlayGeom, sunOverlayMat);
  group.add(sunOverlay);

  // Corona — three additive sprites at increasing scale for a
  // multi-layer soft halo.
  const coronaSprites: Array<{ sprite: THREE.Sprite; mat: THREE.SpriteMaterial; map: THREE.CanvasTexture }> = [];
  const coronaSpec = [
    { color: "#ffcb6b", scale: 7.2, opacity: 0.85 },
    { color: "#ff9c3e", scale: 11, opacity: 0.55 },
    { color: "#ff6b22", scale: 16, opacity: 0.3 },
  ];
  for (const c of coronaSpec) {
    const map = makeRadialTexture(c.color);
    const mat = new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(c.scale, c.scale, 1);
    group.add(sprite);
    coronaSprites.push({ sprite, mat, map });
  }

  /* Planets — each gets its real texture, lit by the PointLight at
   * the sun via MeshStandardMaterial. */
  const planetTextures: Record<PlanetSpec["type"], THREE.Texture | null> = {
    mercury: textures?.mercury ?? null,
    venus: textures?.venus ?? null,
    earth: textures?.earth ?? null,
    mars: textures?.mars ?? null,
  };
  const planets: Array<{
    mesh: THREE.Mesh;
    mat: THREE.MeshStandardMaterial;
    geom: THREE.SphereGeometry;
    orbit: number;
    speed: number;
    phase: number;
    tilt: number;
  }> = [];
  for (let i = 0; i < PLANETS.length; i++) {
    const spec = PLANETS[i];
    const mat = new THREE.MeshStandardMaterial({
      map: planetTextures[spec.type] ?? null,
      color: planetTextures[spec.type] ? 0xffffff : 0x808080,
      roughness: spec.type === "earth" ? 0.78 : 0.92,
      metalness: 0,
      transparent: true,
      opacity: 0,
    });
    const geom = new THREE.SphereGeometry(spec.solarRadius, 48, 48);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.userData.planetIndex = i;
    mesh.rotation.z = THREE.MathUtils.degToRad(spec.tilt);
    group.add(mesh);
    planets.push({
      mesh,
      mat,
      geom,
      orbit: spec.orbit,
      speed: spec.speed,
      phase: Math.random() * Math.PI * 2,
      tilt: spec.tilt * 0.05,
    });
  }

  // Orbit rings — faint white ellipses.
  const orbitMats: THREE.LineBasicMaterial[] = [];
  const orbitGeoms: THREE.BufferGeometry[] = [];
  for (const spec of PLANETS) {
    const segs = 128;
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
      color: 0x6a7280,
      transparent: true,
      opacity: 0,
    });
    const ring = new THREE.LineLoop(og, om);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    orbitMats.push(om);
    orbitGeoms.push(og);
  }

  /* Satellites — procedural spacecraft built from primitives. Each
   * is a Group of (central body + 2 solar panels + antenna or dish).
   * Three body silhouettes (cylinder / cube / octahedron) for variety.
   * Few of them (5), slow orbital drift, gentle tumble — they should
   * read as man-made objects floating, not asteroids. */
  const satelliteCount = isPreview ? 0 : 5;
  const asteroidMeshes: Array<{
    mesh: THREE.Group;
    geoms: THREE.BufferGeometry[];
    mats: THREE.Material[];
    orbit: number;
    speed: number;
    phase: number;
    inclination: number;
    spinAxis: THREE.Vector3;
    spinRate: number;
  }> = [];
  for (let i = 0; i < satelliteCount; i++) {
    const sat = buildSatellite(i);
    group.add(sat.group);
    // Place satellites around varied orbits — spread between Mars
    // (11.4) and outer dust (~16) so they're visible past the
    // outermost planet, not crowding the planets themselves.
    const orbit = 13 + Math.random() * 3.5;
    asteroidMeshes.push({
      mesh: sat.group,
      geoms: sat.geoms,
      mats: sat.mats,
      orbit,
      speed: 0.04 + Math.random() * 0.04, // ~3-4× slower than the old asteroids
      phase: Math.random() * Math.PI * 2,
      inclination: (Math.random() - 0.5) * 0.25,
      spinAxis: new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize(),
      // Very slow tumble — gives a sense of free-fall float without
      // the spinning-rock energy of the previous asteroid implementation.
      spinRate: (Math.random() - 0.5) * 0.18,
    });
  }

  return {
    sun,
    sunOverlayMat,
    planets,
    asteroids: asteroidMeshes,
    dispose: () => {
      skyGeom.dispose();
      skyMat.dispose();
      sunBaseGeom.dispose();
      sunBaseMat.dispose();
      sunOverlayGeom.dispose();
      sunOverlayMat.dispose();
      for (const cs of coronaSprites) {
        cs.mat.dispose();
        cs.map.dispose();
      }
      for (const p of planets) {
        p.geom.dispose();
        p.mat.dispose();
      }
      for (const a of asteroidMeshes) {
        for (const g of a.geoms) g.dispose();
        for (const m of a.mats) m.dispose();
      }
      for (const og of orbitGeoms) og.dispose();
      for (const om of orbitMats) om.dispose();
    },
  };
}

function buildPlanetDetail(
  group: THREE.Group,
  spec: PlanetSpec,
  isPreview: boolean,
  uTime: { value: number },
  textures: Textures | null
) {
  /* Detail-view lighting. DirectionalLight stands in for the Sun
   * (off-axis so the terminator is visible across the textured
   * surface). HemisphereLight + AmbientLight + a fill from camera
   * direction guarantee the planet reads brightly even when the
   * "sun" is on the far side; without the fill, Asad reported the
   * zoomed view felt dim. */
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.6);
  sunLight.position.set(8, 4, 6);
  group.add(sunLight);
  const hemi = new THREE.HemisphereLight(0xb8c8ff, 0x1c1a30, 0.45);
  group.add(hemi);
  const fillLight = new THREE.DirectionalLight(0xb0c5e5, 0.55);
  fillLight.position.set(0, 0, 9);
  group.add(fillLight);
  const ambient = new THREE.AmbientLight(0x303848, 0.45);
  group.add(ambient);

  /* Skybox same as solar level — keeps continuity when zooming in. */
  const skyGeom = new THREE.SphereGeometry(800, 32, 32);
  const skyMat = new THREE.MeshBasicMaterial({
    map: textures?.stars ?? null,
    side: THREE.BackSide,
    depthWrite: false,
    transparent: true,
    opacity: 0,
  });
  const sky = new THREE.Mesh(skyGeom, skyMat);
  group.add(sky);

  /* The PLANET. Earth gets a special multi-layer treatment: surface
   * map + ocean specular mask + cloud shell + atmospheric rim. The
   * other planets get a single textured Phong sphere — clean, real,
   * sun-lit. */
  const planetGeom = new THREE.SphereGeometry(spec.detailRadius, 96, 96);
  let planetMat: THREE.Material;
  let cloudsMesh: THREE.Mesh | null = null;
  let cloudsMat: THREE.Material | null = null;
  let cloudsGeom: THREE.SphereGeometry | null = null;
  let atmoMesh: THREE.Mesh | null = null;
  let atmoMat: THREE.ShaderMaterial | null = null;
  let atmoGeom: THREE.SphereGeometry | null = null;

  if (spec.type === "earth" && textures) {
    planetMat = new THREE.MeshPhongMaterial({
      map: textures.earth,
      specularMap: textures.earthSpecular,
      specular: new THREE.Color(0x556677),
      shininess: 22,
      transparent: true,
      opacity: 0,
    });
    cloudsGeom = new THREE.SphereGeometry(spec.detailRadius * 1.012, 96, 96);
    cloudsMat = new THREE.MeshPhongMaterial({
      map: textures.earthClouds,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    cloudsMesh = new THREE.Mesh(cloudsGeom, cloudsMat);
    cloudsMesh.rotation.z = THREE.MathUtils.degToRad(spec.tilt);
    group.add(cloudsMesh);

    atmoGeom = new THREE.SphereGeometry(spec.detailRadius * 1.06, 64, 64);
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
  } else if (textures) {
    const map =
      spec.type === "mercury"
        ? textures.mercury
        : spec.type === "venus"
          ? textures.venus
          : spec.type === "mars"
            ? textures.mars
            : null;
    planetMat = new THREE.MeshStandardMaterial({
      map,
      color: map ? 0xffffff : 0x888888,
      roughness: spec.type === "venus" ? 0.6 : 0.92,
      metalness: 0,
      transparent: true,
      opacity: 0,
    });
  } else {
    planetMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      opacity: 0,
    });
  }
  const planetMesh = new THREE.Mesh(planetGeom, planetMat);
  planetMesh.rotation.z = THREE.MathUtils.degToRad(spec.tilt);
  group.add(planetMesh);

  /* Moons — exactly the count that planet has in reality. Earth → 1
   * Luna with the LRO texture. Mars → 2 procedural rocky moons. */
  interface BuiltMoon {
    spec: MoonSpec;
    mesh: THREE.Mesh;
    mat: THREE.Material;
    geom: THREE.SphereGeometry;
    phase: number;
  }
  const builtMoons: BuiltMoon[] = [];
  for (let i = 0; i < spec.moons.length; i++) {
    const ms = spec.moons[i];
    let mat: THREE.Material;
    let geom: THREE.SphereGeometry;
    if (ms.surface === "luna" && textures) {
      mat = new THREE.MeshPhongMaterial({
        map: textures.moon,
        specular: 0x111111,
        shininess: 5,
        transparent: true,
        opacity: 0,
      });
      geom = new THREE.SphereGeometry(ms.radius, 48, 48);
    } else {
      // Procedural rocky moon — slightly displaced sphere with a
      // dusty gray color, smooth shaded. Phobos / Deimos shape.
      const rGeom = new THREE.IcosahedronGeometry(ms.radius, 2);
      const arr = (rGeom.getAttribute("position").array as Float32Array);
      for (let v = 0; v < arr.length; v += 3) {
        const len = Math.hypot(arr[v], arr[v + 1], arr[v + 2]) || 1;
        const n =
          1 + (Math.sin(arr[v] * 30) * Math.cos(arr[v + 1] * 28)) * 0.13;
        arr[v] = (arr[v] / len) * ms.radius * n;
        arr[v + 1] = (arr[v + 1] / len) * ms.radius * n;
        arr[v + 2] = (arr[v + 2] / len) * ms.radius * n;
      }
      rGeom.computeVertexNormals();
      mat = new THREE.MeshStandardMaterial({
        color: 0x777777,
        roughness: 0.95,
        metalness: 0.03,
        transparent: true,
        opacity: 0,
      });
      geom = rGeom as unknown as THREE.SphereGeometry;
    }
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

  /* Background dust. */
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
      skyGeom.dispose();
      skyMat.dispose();
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

/* Sun overlay: a thin shell rendered ON TOP of the textured sun
 * sphere. Adds animated turbulence + granulation cells without
 * blowing out the underlying texture. Additive blend means it only
 * brightens; it never darkens what's beneath. */
const SUN_OVERLAY_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SUN_OVERLAY_FRAG = /* glsl */ `
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
  void main() {
    /* Two scrolling layers in opposing directions for shear. */
    float a = vnoise(vWorldPos * 1.4 + vec3(uTime * 0.18, uTime * 0.12, 0.0));
    float b = vnoise(vWorldPos * 3.2 + vec3(-uTime * 0.32, 0.0, uTime * 0.22));
    float n = a * 0.6 + b * 0.4;
    /* Granulation cells. */
    float cells = smoothstep(0.42, 0.58, vnoise(vWorldPos * 8.0 + uTime * 0.3));
    /* Limb brightening. */
    float rim = pow(max(0.0, 1.0 - max(dot(vNormal, vec3(0,0,1)), 0.0)), 1.4);
    /* Color ramp from cool red (low) → orange → warm yellow (high). */
    vec3 c = mix(vec3(0.95, 0.32, 0.10), vec3(1.0, 0.62, 0.18), smoothstep(0.30, 0.65, n));
    c = mix(c, vec3(1.0, 0.9, 0.55), smoothstep(0.65, 1.05, n));
    c *= 0.85 + 0.15 * cells;
    c += rim * vec3(1.0, 0.55, 0.18) * 0.85;
    /* Pulsing prominences — pow at high exponent for sparse hot points. */
    float flare = pow(max(0.0, vnoise(vWorldPos * 2.0 + uTime * 0.6)), 7.0);
    c += flare * vec3(1.0, 0.85, 0.45) * 0.7;
    /* Blend strength — moderate so the underlying texture still reads. */
    gl_FragColor = vec4(c, uOpacity * 0.4);
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
    float fresnel = clamp(0.85 - dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
    float intensity = pow(fresnel, 2.0);
    gl_FragColor = vec4(uColor, intensity * uOpacity);
  }
`;

/* ──────────── builders ──────────── */

/* buildSatellite — assemble a small spacecraft Group from primitives.
 * Three body shapes for variety (cylinder Hubble-style / cube comm
 * sat / octahedron probe) all sharing the same characteristic
 * silhouette feature — two flat dark-blue solar panels extending
 * sideways. A small accent on top: alternating antenna or dish.
 *
 * Materials use realistic spacecraft tones — silver/gold-foil bodies,
 * dark deep-blue solar panels with faint emissive glow, white
 * antennas. All MeshStandardMaterial so the Sun's PointLight + fill
 * lighting shade them properly. */
function buildSatellite(index: number): {
  group: THREE.Group;
  geoms: THREE.BufferGeometry[];
  mats: THREE.Material[];
} {
  const group = new THREE.Group();
  const geoms: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const variant = index % 3;

  // Central body
  if (variant === 0) {
    // Cylinder body — Hubble-style telescope.
    const bodyGeom = new THREE.CylinderGeometry(0.11, 0.13, 0.45, 14);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xeaecef,
      metalness: 0.65,
      roughness: 0.35,
      transparent: true,
      opacity: 0,
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.rotation.z = Math.PI / 2;
    group.add(body);
    geoms.push(bodyGeom);
    mats.push(bodyMat);
    // End cap (lens / aperture)
    const capGeom = new THREE.CircleGeometry(0.11, 18);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x101216,
      metalness: 0.8,
      roughness: 0.25,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const cap = new THREE.Mesh(capGeom, capMat);
    cap.position.x = 0.225;
    cap.rotation.y = Math.PI / 2;
    group.add(cap);
    geoms.push(capGeom);
    mats.push(capMat);
  } else if (variant === 1) {
    // Cube body — communication satellite.
    const bodyGeom = new THREE.BoxGeometry(0.26, 0.26, 0.3);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xc8b88a, // gold MLI foil
      metalness: 0.6,
      roughness: 0.45,
      transparent: true,
      opacity: 0,
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    group.add(body);
    geoms.push(bodyGeom);
    mats.push(bodyMat);
  } else {
    // Octahedron body — interplanetary probe.
    const bodyGeom = new THREE.OctahedronGeometry(0.18, 0);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xf4f5f7,
      metalness: 0.4,
      roughness: 0.55,
      flatShading: true,
      transparent: true,
      opacity: 0,
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    group.add(body);
    geoms.push(bodyGeom);
    mats.push(bodyMat);
  }

  // Two solar-panel wings — the unmistakable satellite silhouette.
  const panelGeom = new THREE.BoxGeometry(0.85, 0.34, 0.025);
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x162a55,
    metalness: 0.35,
    roughness: 0.4,
    emissive: 0x0a1840,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0,
  });
  const leftPanel = new THREE.Mesh(panelGeom, panelMat);
  leftPanel.position.set(-0.65, 0, 0);
  group.add(leftPanel);
  const rightPanel = new THREE.Mesh(panelGeom, panelMat);
  rightPanel.position.set(0.65, 0, 0);
  group.add(rightPanel);
  geoms.push(panelGeom);
  mats.push(panelMat);

  // Small connecting struts so the panels don't appear to float
  // detached from the body.
  const strutGeom = new THREE.CylinderGeometry(0.012, 0.012, 0.4, 6);
  const strutMat = new THREE.MeshStandardMaterial({
    color: 0xcfd2d6,
    metalness: 0.7,
    roughness: 0.4,
    transparent: true,
    opacity: 0,
  });
  const strutL = new THREE.Mesh(strutGeom, strutMat);
  strutL.rotation.z = Math.PI / 2;
  strutL.position.set(-0.32, 0, 0);
  group.add(strutL);
  const strutR = new THREE.Mesh(strutGeom, strutMat);
  strutR.rotation.z = Math.PI / 2;
  strutR.position.set(0.32, 0, 0);
  group.add(strutR);
  geoms.push(strutGeom);
  mats.push(strutMat);

  // Top accent — antenna OR dish, alternating per satellite index
  // for variety. Both are small enough not to dominate the silhouette.
  if (index % 2 === 0) {
    // Whip antenna.
    const antennaGeom = new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6);
    const antennaMat = new THREE.MeshStandardMaterial({
      color: 0xfafafa,
      metalness: 0.55,
      roughness: 0.4,
      transparent: true,
      opacity: 0,
    });
    const antenna = new THREE.Mesh(antennaGeom, antennaMat);
    antenna.position.y = 0.22;
    group.add(antenna);
    geoms.push(antennaGeom);
    mats.push(antennaMat);
    // Tip blob
    const tipGeom = new THREE.SphereGeometry(0.018, 8, 6);
    const tip = new THREE.Mesh(tipGeom, antennaMat);
    tip.position.y = 0.33;
    group.add(tip);
    geoms.push(tipGeom);
  } else {
    // Communication dish (parabolic).
    const dishGeom = new THREE.SphereGeometry(0.13, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2.2);
    const dishMat = new THREE.MeshStandardMaterial({
      color: 0xf2f3f4,
      metalness: 0.55,
      roughness: 0.42,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const dish = new THREE.Mesh(dishGeom, dishMat);
    dish.position.set(0, 0.18, 0);
    dish.rotation.x = Math.PI; // open end facing up
    group.add(dish);
    geoms.push(dishGeom);
    mats.push(dishMat);
    // Feed horn (small cylinder pointing into dish).
    const feedGeom = new THREE.CylinderGeometry(0.018, 0.018, 0.07, 8);
    const feed = new THREE.Mesh(feedGeom, dishMat);
    feed.position.set(0, 0.14, 0);
    group.add(feed);
    geoms.push(feedGeom);
  }

  return { group, geoms, mats };
}

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
