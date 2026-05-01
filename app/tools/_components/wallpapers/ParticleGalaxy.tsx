"use client";

/* ParticleGalaxy — deep-space starfield with three parallax layers,
 * twinkling alpha, slow-drifting nebula clouds, and gentle mouse
 * parallax. Preview mode draws a flat, cheap version. */

import { useEffect, useRef } from "react";

interface Props {
  preview?: { w: number; h: number };
}

interface Star {
  x: number;
  y: number;
  z: number; // layer depth 0..1, lower = closer
  r: number;
  vx: number;
  vy: number;
  phase: number;
  twSpeed: number;
}

interface Nebula {
  x: number;
  y: number;
  r: number;
  hue: number;
  vx: number;
  vy: number;
  alpha: number;
}

export default function ParticleGalaxy({ preview }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cssW = preview?.w ?? canvas.clientWidth;
    let cssH = preview?.h ?? canvas.clientHeight;
    let raf = 0;
    let running = true;
    let t = 0;
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const layers = preview ? 1 : 3;
    const total = preview ? 30 : 200;
    const stars: Star[] = [];
    const nebulae: Nebula[] = [];

    const seed = (n: number) => {
      // deterministic-ish pseudo-random using sin
      const s = Math.sin(n * 9301 + 49297) * 233280;
      return s - Math.floor(s);
    };

    const buildStars = () => {
      stars.length = 0;
      for (let i = 0; i < total; i++) {
        const layer = i % layers;
        const z =
          layers === 1
            ? 0.3
            : layer === 0
              ? 0.15 + seed(i + 1) * 0.15 // closer
              : layer === 1
                ? 0.4 + seed(i + 7) * 0.2 // mid
                : 0.7 + seed(i + 13) * 0.25; // far
        const r =
          layer === 0
            ? 1.2 + seed(i + 21) * 0.8
            : layer === 1
              ? 0.9 + seed(i + 31) * 0.6
              : 0.5 + seed(i + 41) * 0.4;
        stars.push({
          x: seed(i + 51) * cssW,
          y: seed(i + 71) * cssH,
          z,
          r,
          vx: (seed(i + 91) - 0.5) * 0.02 * (1 - z),
          vy: (seed(i + 113) - 0.5) * 0.02 * (1 - z),
          phase: seed(i + 137) * Math.PI * 2,
          twSpeed: 0.0008 + seed(i + 157) * 0.0015,
        });
      }
    };

    const buildNebulae = () => {
      nebulae.length = 0;
      if (preview) return;
      const palette = [
        { hue: 268, alpha: 0.1 }, // purple #7c3aed-ish
        { hue: 188, alpha: 0.08 }, // cyan #06b6d4-ish
        { hue: 295, alpha: 0.09 },
      ];
      for (let i = 0; i < palette.length; i++) {
        const p = palette[i];
        nebulae.push({
          x: seed(i + 311) * cssW,
          y: seed(i + 331) * cssH,
          r: Math.max(cssW, cssH) * (0.45 + seed(i + 351) * 0.25),
          hue: p.hue,
          alpha: p.alpha,
          vx: (seed(i + 371) - 0.5) * 0.015,
          vy: (seed(i + 397) - 0.5) * 0.015,
        });
      }
    };

    const resize = () => {
      cssW = preview?.w ?? canvas.clientWidth;
      cssH = preview?.h ?? canvas.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildStars();
      buildNebulae();
    };

    resize();
    const ro = preview ? null : new ResizeObserver(resize);
    if (ro) ro.observe(canvas);

    const onMouse = (e: MouseEvent) => {
      mouse.tx = e.clientX / window.innerWidth;
      mouse.ty = e.clientY / window.innerHeight;
    };
    if (!preview) window.addEventListener("mousemove", onMouse);

    const drawBg = () => {
      const g = ctx.createRadialGradient(
        cssW / 2,
        cssH / 2,
        0,
        cssW / 2,
        cssH / 2,
        Math.max(cssW, cssH) * 0.75
      );
      g.addColorStop(0, "#020617");
      g.addColorStop(1, "#000000");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cssW, cssH);
    };

    const drawStatic = () => {
      drawBg();
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        ctx.globalAlpha = 0.6;
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 1;
    };

    if (reduced) {
      drawStatic();
      return () => {
        ro?.disconnect();
        if (!preview) window.removeEventListener("mousemove", onMouse);
      };
    }

    const onVis = () => {
      running = document.visibilityState !== "hidden";
      if (running) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else {
        cancelAnimationFrame(raf);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    let last = performance.now();
    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(48, now - last);
      last = now;
      t += dt;
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;

      drawBg();

      // Nebulae (slow drifting soft gradients)
      if (nebulae.length) {
        ctx.globalCompositeOperation = "screen";
        for (let i = 0; i < nebulae.length; i++) {
          const n = nebulae[i];
          n.x += n.vx * dt;
          n.y += n.vy * dt;
          if (n.x < -n.r) n.x = cssW + n.r;
          else if (n.x > cssW + n.r) n.x = -n.r;
          if (n.y < -n.r) n.y = cssH + n.r;
          else if (n.y > cssH + n.r) n.y = -n.r;

          const px = (mouse.x - 0.5) * 30;
          const py = (mouse.y - 0.5) * 30;
          const g = ctx.createRadialGradient(
            n.x + px,
            n.y + py,
            0,
            n.x + px,
            n.y + py,
            n.r
          );
          g.addColorStop(0, `hsla(${n.hue}, 80%, 55%, ${n.alpha})`);
          g.addColorStop(0.5, `hsla(${n.hue}, 75%, 45%, ${n.alpha * 0.4})`);
          g.addColorStop(1, `hsla(${n.hue}, 70%, 30%, 0)`);
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, cssW, cssH);
        }
        ctx.globalCompositeOperation = "source-over";
      }

      // Stars — layered parallax
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.x < -2) s.x = cssW + 2;
        else if (s.x > cssW + 2) s.x = -2;
        if (s.y < -2) s.y = cssH + 2;
        else if (s.y > cssH + 2) s.y = -2;

        // closer layers = bigger parallax shift
        const depthFactor = 1 - s.z; // 0..0.85
        const px = (mouse.x - 0.5) * 40 * depthFactor;
        const py = (mouse.y - 0.5) * 40 * depthFactor;

        const tw = Math.sin(t * s.twSpeed + s.phase) * 0.5 + 0.5;
        ctx.globalAlpha = 0.35 + tw * 0.55;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(s.x + px, s.y + py, s.r, s.r);
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      if (!preview) window.removeEventListener("mousemove", onMouse);
      ro?.disconnect();
    };
  }, [preview]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: preview ? `${preview.w}px` : "100%",
        height: preview ? `${preview.h}px` : "100%",
        display: "block",
      }}
    />
  );
}
