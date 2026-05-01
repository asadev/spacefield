"use client";

/* ParticleGalaxy — multi-stage zoom journey from a galaxy down to
 * the Earth/Moon. Click anywhere on the wallpaper to dive one level
 * deeper. The journey wraps around back to the galaxy once you reach
 * Earth so it never dead-ends.
 *
 * Levels:
 *   0  Galaxy           — wide spiral disk, 6000 stars, glowing core
 *   1  Star Cluster     — ~400 stars, one prominent yellow star, dust
 *   2  Solar System     — Sun + 4 planets (Mercury, Venus, Earth, Mars)
 *                         on elliptical orbits with tilt
 *   3  Earth & Moon     — Earth dominant, Moon orbiting, sun-lit
 *
 * Implementation:
 *   - One Three.js scene; each level is its own Group. Only one
 *     group's opacity is rendered at any time. Click triggers a
 *     1.0s crossfade + camera dolly (cubic ease).
 *   - Procedural Earth/Moon/Sun via fragment shaders (no asset
 *     textures, no PNG to ship). Perlin-noise driven continent mask
 *     for Earth, crater displacement for Moon, hot-additive corona
 *     for Sun.
 *   - The renderer's DOM element is pointer-events-auto so clicks
 *     reach it; the desktop's icon / widget layer sits on top and
 *     absorbs its own clicks naturally via DOM z-order.
 *   - A small breadcrumb overlay in the corner shows the current
 *     level name.
 *   - Visibility-pause, prefers-reduced-motion respected, DPR
 *     clamped to 2, ResizeObserver, full Three resource disposal.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

interface Props {
  preview?: { w: number; h: number };
}

const LEVEL_NAMES = [
  "Galaxy",
  "Star Cluster",
  "Solar System",
  "Earth & Moon",
] as const;

export default function ParticleGalaxy({ preview }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState(0);

  // Reduced detail in preview tiles; disable interaction.
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
    container.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, {
      width: "100%",
      height: "100%",
      display: "block",
      cursor: isPreview ? "default" : "pointer",
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.05, 4000);

    const uTime = { value: 0 };

    /* ─── Level 0: Galaxy ──────────────────────────────────────── */
    const galaxyGroup = new THREE.Group();
    scene.add(galaxyGroup);
    const galaxyRadius = 95;
    {
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
      galaxyGroup.add(stars);
      // Central glow sprite
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
      galaxyGroup.add(sprite);
      galaxyGroup.userData = { stars, mat, geom, sprite, spriteMat, spriteMap };
    }

    /* ─── Level 1: Star Cluster ─────────────────────────────────── */
    const clusterGroup = new THREE.Group();
    clusterGroup.visible = false;
    scene.add(clusterGroup);
    {
      const N = isPreview ? 200 : 500;
      const positions = new Float32Array(N * 3);
      const colors = new Float32Array(N * 3);
      const sizes = new Float32Array(N);
      const phases = new Float32Array(N);
      const tmp = new THREE.Color();
      const cool = new THREE.Color("#cfe1ff");
      const warm = new THREE.Color("#ffe7c2");
      for (let i = 0; i < N; i++) {
        // Spherical Gaussian-ish distribution.
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
      clusterGroup.add(stars);
      // One bright "feature star" in the foreground (the future Sun).
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
      clusterGroup.add(feature);
      clusterGroup.userData = { stars, mat, geom, feature, featureMat, featureMap };
    }

    /* ─── Level 2: Solar System ─────────────────────────────────── */
    const solarGroup = new THREE.Group();
    solarGroup.visible = false;
    scene.add(solarGroup);
    {
      // Sun — emissive sphere with corona sprite.
      const sunMat = new THREE.ShaderMaterial({
        uniforms: { uTime, uOpacity: { value: 0 } },
        vertexShader: SUN_VERT,
        fragmentShader: SUN_FRAG,
        transparent: true,
      });
      const sunGeom = new THREE.SphereGeometry(2.4, 48, 48);
      const sun = new THREE.Mesh(sunGeom, sunMat);
      solarGroup.add(sun);
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
      solarGroup.add(corona);

      // 4 planets — Mercury, Venus, Earth (with subtle blue), Mars.
      const planets: Array<{
        mesh: THREE.Mesh;
        mat: THREE.ShaderMaterial;
        orbit: number;
        speed: number;
        phase: number;
        tilt: number;
      }> = [];
      const planetSpecs: Array<{
        radius: number;
        orbit: number;
        color: THREE.Color;
        type: "rocky" | "earth" | "mars";
        speed: number;
        tilt: number;
      }> = [
        { radius: 0.4, orbit: 4.6, color: new THREE.Color(0xa8a29e), type: "rocky", speed: 0.9, tilt: 0.04 },
        { radius: 0.65, orbit: 6.2, color: new THREE.Color(0xe8c894), type: "rocky", speed: 0.6, tilt: 0.02 },
        { radius: 0.78, orbit: 8.4, color: new THREE.Color(0x4dabf7), type: "earth", speed: 0.4, tilt: 0.08 },
        { radius: 0.55, orbit: 10.6, color: new THREE.Color(0xc06b3a), type: "mars", speed: 0.28, tilt: 0.06 },
      ];
      for (let i = 0; i < planetSpecs.length; i++) {
        const spec = planetSpecs[i];
        const mat = new THREE.ShaderMaterial({
          uniforms: {
            uTime,
            uOpacity: { value: 0 },
            uColor: { value: spec.color.clone() },
            uType: { value: spec.type === "earth" ? 1 : spec.type === "mars" ? 2 : 0 },
          },
          vertexShader: PLANET_VERT,
          fragmentShader: PLANET_FRAG,
          transparent: true,
        });
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(spec.radius, 32, 32),
          mat
        );
        solarGroup.add(mesh);
        planets.push({
          mesh,
          mat,
          orbit: spec.orbit,
          speed: spec.speed,
          phase: Math.random() * Math.PI * 2,
          tilt: spec.tilt,
        });
      }

      // Orbit rings — faint circles drawn as line loops.
      const orbitMats: THREE.LineBasicMaterial[] = [];
      const orbitGeoms: THREE.BufferGeometry[] = [];
      for (const spec of planetSpecs) {
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
        solarGroup.add(ring);
        orbitMats.push(om);
        orbitGeoms.push(og);
      }

      // Background star dust for the solar system view.
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
      solarGroup.add(dust);

      solarGroup.userData = {
        sun, sunMat, sunGeom, corona, coronaMat, coronaMap,
        planets, orbitMats, orbitGeoms,
        dust, dMat, dGeom,
      };
    }

    /* ─── Level 3: Earth & Moon ─────────────────────────────────── */
    const earthGroup = new THREE.Group();
    earthGroup.visible = false;
    scene.add(earthGroup);
    {
      const earthMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime,
          uOpacity: { value: 0 },
          uColor: { value: new THREE.Color(0x4dabf7) },
          uType: { value: 1 },
        },
        vertexShader: PLANET_VERT,
        fragmentShader: PLANET_FRAG,
        transparent: true,
      });
      const earthGeom = new THREE.SphereGeometry(2.6, 96, 96);
      const earth = new THREE.Mesh(earthGeom, earthMat);
      earth.rotation.z = 0.41; // ~23.5° axial tilt
      earthGroup.add(earth);

      const moonMat = new THREE.ShaderMaterial({
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
      const moonGeom = new THREE.SphereGeometry(0.7, 48, 48);
      const moon = new THREE.Mesh(moonGeom, moonMat);
      moon.position.set(6, 0.4, 0);
      earthGroup.add(moon);

      // Background star dust at this scale.
      const dN = isPreview ? 80 : 220;
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
      earthGroup.add(dust);

      earthGroup.userData = {
        earth, earthMat, earthGeom, moon, moonMat, moonGeom,
        dust, dM, dG,
      };
    }

    /* ─── Camera presets per level ──────────────────────────────── */
    const camPresets = [
      { pos: new THREE.Vector3(0, 50, 250), look: new THREE.Vector3(0, 0, 0) },
      { pos: new THREE.Vector3(0, 5, 90), look: new THREE.Vector3(0, 0, 0) },
      { pos: new THREE.Vector3(0, 6, 22), look: new THREE.Vector3(0, 0, 0) },
      { pos: new THREE.Vector3(0, 0, 9), look: new THREE.Vector3(0, 0, 0) },
    ];
    camera.position.copy(camPresets[0].pos);
    camera.lookAt(camPresets[0].look);

    /* Apply per-level opacities + visibility based on transition state. */
    const groups = [galaxyGroup, clusterGroup, solarGroup, earthGroup];
    function setLevelOpacities(active: number, blend: number) {
      // blend is 0..1 going from prev to active. -1 means stable on `active`.
      groups.forEach((g, i) => {
        const target = i === active ? blend : (i === active - 1 ? 1 - blend : 0);
        g.visible = target > 0.001;
        // Drill into known shader uniforms.
        applyOpacity(g, target);
      });
    }

    /* ─── Click → advance level ─────────────────────────────────── */
    let curLevel = 0;
    let prevLevel = 0;
    let transition = 0; // 0..1 progress
    let inTransition = false;
    let transitionStart = 0;
    const TRANSITION_MS = reduceMotion ? 1 : 950;

    setLevelOpacities(0, 1);

    function advance() {
      if (inTransition) return;
      prevLevel = curLevel;
      curLevel = (curLevel + 1) % 4;
      transition = 0;
      transitionStart = performance.now();
      inTransition = true;
      setLevel(curLevel);
    }

    if (!isPreview) {
      renderer.domElement.addEventListener("click", advance);
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

    const targetCam = new THREE.Vector2(0, 0);
    const curCam = new THREE.Vector2(0, 0);
    const onPointerMove = (e: PointerEvent) => {
      if (isPreview) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      targetCam.x = -nx * 0.08;
      targetCam.y = -ny * 0.05;
    };
    const onPointerLeave = () => targetCam.set(0, 0);
    if (!isPreview) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerleave", onPointerLeave);
    }

    function frame(now: number) {
      if (!running) return;
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      uTime.value = now * 0.001;

      // Resolve transition state.
      if (inTransition) {
        transition = Math.min(1, (now - transitionStart) / TRANSITION_MS);
        const eased = easeInOutCubic(transition);
        // Camera dolly between presets.
        const a = camPresets[prevLevel];
        const b = camPresets[curLevel];
        camera.position.lerpVectors(a.pos, b.pos, eased);
        // Cross-fade between groups.
        applyOpacity(groups[prevLevel], 1 - eased);
        applyOpacity(groups[curLevel], eased);
        groups[prevLevel].visible = transition < 1;
        groups[curLevel].visible = true;
        if (transition >= 1) {
          inTransition = false;
        }
      } else {
        // Stable on current level.
        const c = camPresets[curLevel];
        // Tiny mouse-driven parallax on top.
        curCam.x += (targetCam.x - curCam.x) * Math.min(1, dt * 3);
        curCam.y += (targetCam.y - curCam.y) * Math.min(1, dt * 3);
        camera.position.set(c.pos.x + curCam.x * 8, c.pos.y + curCam.y * 4, c.pos.z);
      }
      camera.lookAt(camPresets[curLevel].look);

      // Per-level idle animation.
      // Galaxy spins slow.
      galaxyGroup.rotation.y += dt * 0.045;
      // Cluster gently rotates.
      clusterGroup.rotation.y += dt * 0.03;
      // Solar system planets orbit + sun rotates.
      const solarUd = solarGroup.userData as {
        planets?: Array<{
          mesh: THREE.Mesh;
          orbit: number;
          speed: number;
          phase: number;
          tilt: number;
        }>;
        sun?: THREE.Mesh;
      };
      if (solarUd.planets) {
        for (const p of solarUd.planets) {
          const a = uTime.value * p.speed + p.phase;
          p.mesh.position.set(
            Math.cos(a) * p.orbit,
            Math.sin(a * 0.5) * p.tilt,
            Math.sin(a) * p.orbit
          );
          p.mesh.rotation.y += dt * 0.4;
        }
      }
      if (solarUd.sun) solarUd.sun.rotation.y += dt * 0.06;
      // Earth + moon: earth spins, moon orbits.
      const earthUd = earthGroup.userData as {
        earth?: THREE.Mesh;
        moon?: THREE.Mesh;
      };
      if (earthUd.earth) earthUd.earth.rotation.y += dt * 0.18;
      if (earthUd.moon) {
        const a = uTime.value * 0.55;
        earthUd.moon.position.set(Math.cos(a) * 6, 0.4, Math.sin(a) * 6);
        earthUd.moon.rotation.y += dt * 0.08;
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
        renderer.domElement.removeEventListener("click", advance);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerleave", onPointerLeave);
      }
      ro?.disconnect();
      // Dispose all groups' resources.
      disposeGroup(galaxyGroup);
      disposeGroup(clusterGroup);
      disposeGroup(solarGroup);
      disposeGroup(earthGroup);
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
        // Make the wallpaper canvas click-receptive so the zoom advance
        // works. Desktop icons / dock / widgets sit on top of this in
        // DOM z-order so they absorb their own clicks; clicks that fall
        // through to empty wallpaper space hit our canvas.
        pointerEvents: preview ? "none" : "auto",
        position: "relative",
      }}
    >
      {!preview && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[0.66rem] font-medium uppercase tracking-[0.16em] text-white/80 backdrop-blur-md"
        >
          <span className="text-white">{LEVEL_NAMES[level]}</span>
          <span className="text-white/40">·</span>
          <span className="text-white/55">click to dive</span>
        </div>
      )}
    </div>
  );
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
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vWorldPos = position;
    gl_Position = projectionMatrix * mv;
  }
`;
const SUN_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  uniform float uTime;
  uniform float uOpacity;
  /* Cheap value noise. */
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
    float n = vnoise(vWorldPos * 1.6 + vec3(uTime * 0.3, 0.0, 0.0));
    n += 0.5 * vnoise(vWorldPos * 4.0 - vec3(uTime * 0.5));
    vec3 hot = vec3(1.0, 0.9, 0.55);
    vec3 cool = vec3(1.0, 0.45, 0.15);
    vec3 c = mix(cool, hot, smoothstep(0.4, 1.4, n));
    // Rim brightening.
    float rim = pow(1.0 - max(dot(vNormal, vec3(0,0,1)), 0.0), 1.6);
    c += rim * vec3(1.0, 0.7, 0.3);
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
  uniform int uType; /* 0 = rocky, 1 = earth, 2 = mars, 3 = moon */

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
  float fbm(vec3 p) {
    float v = 0.0; float a = 0.5;
    for (int k = 0; k < 5; k++) {
      v += a * vnoise(p);
      p *= 2.07; a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 sunDir = normalize(vec3(1.0, 0.6, 0.5));
    float ndotl = max(0.0, dot(normalize(vNormal), sunDir));
    vec3 baseCol = uColor;

    if (uType == 1) {
      // Earth: continents + oceans + clouds.
      float landMask = fbm(vWorldPos * 1.6);
      vec3 ocean = vec3(0.06, 0.32, 0.62);
      vec3 land = mix(vec3(0.18, 0.42, 0.18), vec3(0.55, 0.45, 0.25), fbm(vWorldPos * 4.0));
      vec3 ice  = vec3(0.92, 0.96, 1.0);
      // Polar caps based on world Y.
      float polar = smoothstep(0.78, 0.95, abs(normalize(vWorldPos).y));
      baseCol = mix(ocean, land, smoothstep(0.5, 0.62, landMask));
      baseCol = mix(baseCol, ice, polar);
      // Cloud whites scrolling slowly.
      float clouds = fbm(vWorldPos * 2.4 + vec3(uTime * 0.05, 0.0, 0.0));
      clouds = smoothstep(0.55, 0.78, clouds);
      baseCol = mix(baseCol, vec3(1.0), clouds * 0.6);
    } else if (uType == 2) {
      // Mars: red with darker mineral patches.
      float n = fbm(vWorldPos * 2.2);
      baseCol = mix(vec3(0.5, 0.18, 0.08), vec3(0.85, 0.42, 0.22), n);
    } else if (uType == 3) {
      // Moon: gray with cratered noise.
      float n = fbm(vWorldPos * 5.0);
      baseCol = mix(vec3(0.55, 0.55, 0.6), vec3(0.85, 0.85, 0.9), n);
      // Pock-marks.
      float pits = vnoise(vWorldPos * 12.0);
      baseCol *= 0.85 + 0.15 * pits;
    } else {
      // Generic rocky planet (Mercury, Venus): low-detail mottle.
      float n = fbm(vWorldPos * 3.0);
      baseCol = mix(uColor * 0.7, uColor * 1.1, n);
    }

    // Soft ambient + diffuse Lambertian.
    vec3 lit = baseCol * (0.18 + 0.82 * ndotl);
    // Atmospheric rim glow on Earth.
    if (uType == 1) {
      float rim = pow(1.0 - max(dot(normalize(vNormal), vec3(0,0,1)), 0.0), 2.5);
      lit += rim * vec3(0.35, 0.55, 0.85) * 0.6;
    }
    gl_FragColor = vec4(lit, uOpacity);
  }
`;

/* ──────────── helpers ──────────── */

function applyOpacity(group: THREE.Group, value: number) {
  group.traverse((obj) => {
    const o = obj as THREE.Mesh | THREE.Points | THREE.LineLoop | THREE.Sprite;
    const m = (o as THREE.Mesh).material as
      | THREE.ShaderMaterial
      | THREE.SpriteMaterial
      | THREE.LineBasicMaterial
      | THREE.Material[]
      | undefined;
    if (!m) return;
    if (Array.isArray(m)) {
      for (const mm of m) setMatOpacity(mm, value);
    } else {
      setMatOpacity(m, value);
    }
  });
}
function setMatOpacity(m: THREE.Material, value: number) {
  if ("uniforms" in m && (m as THREE.ShaderMaterial).uniforms.uOpacity) {
    (m as THREE.ShaderMaterial).uniforms.uOpacity.value = value;
  } else if ("opacity" in m) {
    (m as { opacity: number }).opacity = value;
  }
}
function disposeGroup(group: THREE.Group) {
  group.traverse((obj) => {
    const m = obj as THREE.Mesh | THREE.Points | THREE.LineLoop | THREE.Sprite;
    if ("geometry" in m && m.geometry) (m.geometry as THREE.BufferGeometry).dispose();
    const mat = (m as THREE.Mesh).material as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    if (Array.isArray(mat)) for (const mm of mat) mm.dispose();
    else if (mat) mat.dispose();
  });
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
