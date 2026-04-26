"use client";

/* PalmJumeirah — abstract concentric arcs evoking palm fronds, slowly
 * rotating with mouse parallax. A subtle wave shimmer ripples across
 * the bottom third like sun on shallow water. */

import { useEffect, useRef } from "react";

interface Props {
  preview?: { w: number; h: number };
}

export default function PalmJumeirah({ preview }: Props) {
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
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    let t = 0;

    const resize = () => {
      cssW = preview?.w ?? canvas.clientWidth;
      cssH = preview?.h ?? canvas.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = preview ? null : new ResizeObserver(resize);
    if (ro) ro.observe(canvas);

    const onMouse = (e: MouseEvent) => {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    if (!preview) window.addEventListener("mousemove", onMouse);

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

    const accent = readVar("--text", "#f1f5f9");
    const bg = readVar("--bg", "#0a0a0a");
    const fronds = Math.max(7, Math.floor(Math.min(cssW, cssH) / 80));
    const arcsPerFrond = 8;

    let last = performance.now();
    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(48, now - last);
      last = now;
      t += dt * 0.00015;
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;

      // base wash
      const grad = ctx.createRadialGradient(
        cssW / 2,
        cssH * 0.4,
        0,
        cssW / 2,
        cssH * 0.4,
        Math.max(cssW, cssH) * 0.7
      );
      grad.addColorStop(0, withAlpha(accent, 0.04));
      grad.addColorStop(1, bg);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cssW, cssH);

      const cx = cssW / 2 + mouse.x * 30;
      const cy = cssH * 0.45 + mouse.y * 20;
      const baseR = Math.min(cssW, cssH) * 0.12;

      for (let f = 0; f < fronds; f++) {
        const angleBase = (f / fronds) * Math.PI * 2 + t;
        for (let a = 0; a < arcsPerFrond; a++) {
          const r = baseR + a * (Math.min(cssW, cssH) * 0.05);
          const start = angleBase - 0.1 - a * 0.02;
          const end = angleBase + 0.1 + a * 0.02;
          const opacity = (1 - a / arcsPerFrond) * 0.18;
          ctx.beginPath();
          ctx.strokeStyle = withAlpha(accent, opacity);
          ctx.lineWidth = 1.2;
          ctx.arc(cx, cy, r, start, end);
          ctx.stroke();
        }
      }

      // wave shimmer at bottom
      const waveTop = cssH * 0.7;
      const waveSeg = Math.max(20, Math.floor(cssW / 8));
      ctx.strokeStyle = withAlpha(accent, 0.08);
      ctx.lineWidth = 1;
      for (let row = 0; row < 4; row++) {
        ctx.beginPath();
        const y0 = waveTop + row * ((cssH - waveTop) / 4);
        for (let i = 0; i <= waveSeg; i++) {
          const x = (i / waveSeg) * cssW;
          const off = Math.sin(i * 0.2 + t * 12 + row) * 4;
          if (i === 0) ctx.moveTo(x, y0 + off);
          else ctx.lineTo(x, y0 + off);
        }
        ctx.stroke();
      }

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

function readVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

function withAlpha(color: string, alpha: number): string {
  // Accepts hex, rgb, hsl. For hex shorten to rgba.
  if (color.startsWith("#")) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `,${alpha})`);
  }
  return color;
}
