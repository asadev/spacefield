"use client";

/* LiquidMetaballs — additive radial-gradient blobs that merge optically
 * via globalCompositeOperation = "lighter", with a contrast/blur filter
 * applied to the canvas to sharpen edges and produce the metaball look. */

import { useEffect, useRef } from "react";

interface Props {
  preview?: { w: number; h: number };
}

interface Blob {
  ox: number; // origin x
  oy: number;
  ax: number; // amplitude of drift
  ay: number;
  fx: number; // frequency
  fy: number;
  px: number; // phase
  py: number;
  r: number;
  hue: number;
}

const PALETTE = [
  { hue: 295 }, // magenta #d946ef
  { hue: 188 }, // cyan #06b6d4
  { hue: 38 }, // amber #f59e0b
];

export default function LiquidMetaballs({ preview }: Props) {
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
    const mouse = { x: 0, y: 0, tx: 0, ty: 0, active: false };

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const COUNT = preview ? 4 : 9;
    const blobs: Blob[] = [];

    const seed = (n: number) => {
      const s = Math.sin(n * 9301 + 49297) * 233280;
      return s - Math.floor(s);
    };

    const buildBlobs = () => {
      blobs.length = 0;
      for (let i = 0; i < COUNT; i++) {
        const r = preview ? 70 + seed(i + 5) * 80 : 90 + seed(i + 5) * 110;
        blobs.push({
          ox: seed(i + 11) * cssW,
          oy: seed(i + 17) * cssH,
          ax: 80 + seed(i + 23) * 140,
          ay: 60 + seed(i + 29) * 120,
          fx: 0.00018 + seed(i + 31) * 0.00022,
          fy: 0.00015 + seed(i + 37) * 0.0002,
          px: seed(i + 41) * Math.PI * 2,
          py: seed(i + 43) * Math.PI * 2,
          r,
          hue: PALETTE[i % PALETTE.length].hue,
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
      buildBlobs();
    };

    // Apply a CSS filter for the metaball edge effect.
    // Skip in preview to keep thumbnails crisp and cheap.
    canvas.style.filter = preview ? "none" : "contrast(1.4) blur(8px)";

    resize();
    const ro = preview ? null : new ResizeObserver(resize);
    if (ro) ro.observe(canvas);

    const onMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.tx = e.clientX - rect.left;
      mouse.ty = e.clientY - rect.top;
      mouse.active = true;
    };
    const onLeave = () => {
      mouse.active = false;
    };
    if (!preview) {
      window.addEventListener("mousemove", onMouse);
      window.addEventListener("mouseout", onLeave);
    }

    const drawBg = () => {
      const g = ctx.createLinearGradient(0, 0, 0, cssH);
      g.addColorStop(0, "#0c0420");
      g.addColorStop(1, "#1a0635");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cssW, cssH);
    };

    const drawBlob = (x: number, y: number, r: number, hue: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `hsla(${hue}, 90%, 60%, 0.95)`);
      g.addColorStop(0.5, `hsla(${hue}, 85%, 55%, 0.4)`);
      g.addColorStop(1, `hsla(${hue}, 85%, 50%, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };

    const renderFrame = () => {
      drawBg();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        const x = b.ox + Math.sin(t * b.fx + b.px) * b.ax;
        const y = b.oy + Math.cos(t * b.fy + b.py) * b.ay;
        drawBlob(x, y, b.r, b.hue);
      }
      if (mouse.active && !preview) {
        drawBlob(mouse.x, mouse.y, 100, 320);
      }
      ctx.globalCompositeOperation = "source-over";
    };

    if (reduced) {
      renderFrame();
      return () => {
        ro?.disconnect();
        if (!preview) {
          window.removeEventListener("mousemove", onMouse);
          window.removeEventListener("mouseout", onLeave);
        }
        canvas.style.filter = "none";
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
      // spring-smoothed cursor
      mouse.x += (mouse.tx - mouse.x) * 0.08;
      mouse.y += (mouse.ty - mouse.y) * 0.08;

      renderFrame();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      if (!preview) {
        window.removeEventListener("mousemove", onMouse);
        window.removeEventListener("mouseout", onLeave);
      }
      ro?.disconnect();
      canvas.style.filter = "none";
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
