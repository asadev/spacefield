"use client";

/* BurjTwilight — Dubai skyline silhouette under a slowly shifting sunset
 * → night sky. Soft "lights" rise from random building windows at slow,
 * irregular intervals like fireflies. Calm, never distracting. */

import { useEffect, useRef } from "react";

interface Spark {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

interface Building {
  x: number;
  w: number;
  h: number;
  topShape: "flat" | "spire" | "dome";
}

interface Props {
  /** Render at a fixed CSS size for thumbnails. Omit for full background. */
  preview?: { w: number; h: number };
}

export default function BurjTwilight({ preview }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cssW = preview?.w ?? canvas.clientWidth;
    let cssH = preview?.h ?? canvas.clientHeight;
    let buildings: Building[] = [];
    const sparks: Spark[] = [];
    let raf = 0;
    let running = true;
    let t = 0;

    const seed = (w: number) => {
      buildings = [];
      const target = Math.max(8, Math.floor(w / 70));
      let x = 0;
      while (x < w) {
        const bw = 28 + Math.random() * 70;
        const bh = 80 + Math.random() * (cssH * 0.55);
        const r = Math.random();
        const topShape: Building["topShape"] =
          r < 0.15 ? "spire" : r < 0.25 ? "dome" : "flat";
        buildings.push({ x, w: bw, h: bh, topShape });
        x += bw + 1;
      }
      // ensure a Burj-like spire near 60%
      const burjIdx = Math.floor(buildings.length * 0.6);
      if (buildings[burjIdx]) {
        buildings[burjIdx].h = Math.min(cssH * 0.85, cssH * 0.7);
        buildings[burjIdx].topShape = "spire";
        buildings[burjIdx].w = Math.max(buildings[burjIdx].w, 36);
      }
      void target;
    };

    const resize = () => {
      cssW = preview?.w ?? canvas.clientWidth;
      cssH = preview?.h ?? canvas.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed(cssW);
    };

    resize();
    const ro = preview ? null : new ResizeObserver(resize);
    if (ro) ro.observe(canvas);

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

    const spawnSpark = () => {
      const b = buildings[Math.floor(Math.random() * buildings.length)];
      if (!b) return;
      const baseY = cssH - b.h + 6 + Math.random() * (b.h * 0.8);
      sparks.push({
        x: b.x + Math.random() * b.w,
        y: baseY,
        vy: -(0.15 + Math.random() * 0.35),
        life: 0,
        maxLife: 240 + Math.random() * 360,
        size: 0.8 + Math.random() * 1.2,
        hue: 30 + Math.random() * 30,
      });
      if (sparks.length > 80) sparks.splice(0, sparks.length - 80);
    };

    let last = performance.now();
    let sparkAcc = 0;

    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(48, now - last);
      last = now;
      t += dt * 0.0001;

      // sky gradient — slow palette cycle
      const phase = (Math.sin(t) + 1) / 2;
      const g = ctx.createLinearGradient(0, 0, 0, cssH);
      const top = mix("#0a0f2c", "#2a0a3a", phase);
      const mid = mix("#3a1a4a", "#d97742", phase * 0.6);
      const bot = mix("#5b2a62", "#f8b16a", phase * 0.5);
      g.addColorStop(0, top);
      g.addColorStop(0.55, mid);
      g.addColorStop(1, bot);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cssW, cssH);

      // distant skyline (lighter haze)
      ctx.fillStyle = `rgba(20, 14, 40, ${0.35 + phase * 0.2})`;
      drawSkyline(ctx, buildings, cssH, 0.55, 0);

      // foreground skyline
      ctx.fillStyle = `rgba(6, 4, 18, ${0.85 + phase * 0.1})`;
      drawSkyline(ctx, buildings, cssH, 1, 0);

      // sparks
      sparkAcc += dt;
      const interval = 220 + Math.random() * 400;
      if (sparkAcc > interval) {
        sparkAcc = 0;
        spawnSpark();
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life += dt;
        s.y += s.vy * (dt / 16);
        const fade = 1 - s.life / s.maxLife;
        if (fade <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.fillStyle = `hsla(${s.hue}, 90%, 70%, ${fade * 0.85})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `hsla(${s.hue}, 90%, 70%, ${fade})`;
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
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

function drawSkyline(
  ctx: CanvasRenderingContext2D,
  buildings: Building[],
  cssH: number,
  scale: number,
  yOffset: number
) {
  ctx.beginPath();
  ctx.moveTo(0, cssH);
  for (const b of buildings) {
    const top = cssH - b.h * scale + yOffset;
    ctx.lineTo(b.x, top);
    if (b.topShape === "spire") {
      ctx.lineTo(b.x + b.w / 2, top - 60 * scale);
      ctx.lineTo(b.x + b.w, top);
    } else if (b.topShape === "dome") {
      ctx.quadraticCurveTo(b.x + b.w / 2, top - 18 * scale, b.x + b.w, top);
    } else {
      ctx.lineTo(b.x + b.w, top);
    }
  }
  ctx.lineTo(ctx.canvas.width, cssH);
  ctx.closePath();
  ctx.fill();
}

function mix(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}
