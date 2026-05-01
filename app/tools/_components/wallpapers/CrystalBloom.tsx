"use client";

/* CrystalBloom — soft pastel polygonal crystals that drift, rotate, and
 * glow. Each crystal has a halo gradient behind a translucent fill and
 * a thin bright stroke. Subtle mouse parallax shifts the whole field. */

import { useEffect, useRef } from "react";

interface Props {
  preview?: { w: number; h: number };
}

interface Crystal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vRot: number;
  verts: Array<{ ang: number; rad: number }>; // unit polygon
  color: string; // pastel
}

const PALETTE = ["#fbcfe8", "#c4b5fd", "#a7f3d0", "#fef3c7"];

export default function CrystalBloom({ preview }: Props) {
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

    const COUNT = preview ? 5 : 14;
    const crystals: Crystal[] = [];

    const seed = (n: number) => {
      const s = Math.sin(n * 9301 + 49297) * 233280;
      return s - Math.floor(s);
    };

    const buildCrystals = () => {
      crystals.length = 0;
      for (let i = 0; i < COUNT; i++) {
        const verts: Array<{ ang: number; rad: number }> = [];
        const vCount = 3 + Math.floor(seed(i + 7) * 5); // 3..7
        // generate angles in sorted order with slight jitter, plus per-vertex radius variance
        for (let v = 0; v < vCount; v++) {
          const baseAng = (v / vCount) * Math.PI * 2;
          const jitter = (seed(i * 31 + v + 13) - 0.5) * 0.5;
          verts.push({
            ang: baseAng + jitter,
            rad: 0.7 + seed(i * 41 + v + 19) * 0.4, // 0.7..1.1
          });
        }
        const speed = 0.012 + seed(i + 23) * 0.022;
        const dir = seed(i + 29) * Math.PI * 2;
        crystals.push({
          x: seed(i + 31) * cssW,
          y: seed(i + 37) * cssH,
          vx: Math.cos(dir) * speed,
          vy: Math.sin(dir) * speed,
          r: 60 + seed(i + 41) * 100,
          rot: seed(i + 43) * Math.PI * 2,
          vRot: (seed(i + 47) - 0.5) * 0.0006,
          verts,
          color: PALETTE[i % PALETTE.length],
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
      buildCrystals();
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
      const g = ctx.createLinearGradient(0, 0, 0, cssH);
      g.addColorStop(0, "#0a0420");
      g.addColorStop(1, "#1a0a3a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cssW, cssH);
    };

    const hexToRgb = (hex: string) => {
      const h = hex.replace("#", "");
      return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
      };
    };

    const drawCrystal = (c: Crystal, parallaxX: number, parallaxY: number) => {
      const cx = c.x + parallaxX;
      const cy = c.y + parallaxY;
      const rgb = hexToRgb(c.color);
      const rgbStr = `${rgb.r},${rgb.g},${rgb.b}`;

      // Glow halo (skip in preview to keep thumbnails clean and cheap)
      if (!preview) {
        const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, c.r * 1.7);
        halo.addColorStop(0, `rgba(${rgbStr},0.35)`);
        halo.addColorStop(0.5, `rgba(${rgbStr},0.12)`);
        halo.addColorStop(1, `rgba(${rgbStr},0)`);
        ctx.fillStyle = halo;
        ctx.fillRect(
          cx - c.r * 1.7,
          cy - c.r * 1.7,
          c.r * 3.4,
          c.r * 3.4
        );
      }

      // Build polygon path (rotation applied)
      ctx.beginPath();
      for (let i = 0; i < c.verts.length; i++) {
        const v = c.verts[i];
        const a = v.ang + c.rot;
        const px = cx + Math.cos(a) * c.r * v.rad;
        const py = cy + Math.sin(a) * c.r * v.rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      // Translucent fill — gradient gives a holographic feel
      const fill = ctx.createLinearGradient(
        cx - c.r,
        cy - c.r,
        cx + c.r,
        cy + c.r
      );
      fill.addColorStop(0, `rgba(${rgbStr},0.22)`);
      fill.addColorStop(1, `rgba(${rgbStr},0.1)`);
      ctx.fillStyle = fill;
      ctx.fill();

      // Bright thin stroke
      ctx.strokeStyle = `rgba(${rgbStr},0.6)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    const renderAll = (parallaxX: number, parallaxY: number) => {
      drawBg();
      for (let i = 0; i < crystals.length; i++) {
        drawCrystal(crystals[i], parallaxX, parallaxY);
      }
    };

    if (reduced) {
      renderAll(0, 0);
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

      // Update positions and rotations
      for (let i = 0; i < crystals.length; i++) {
        const c = crystals[i];
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        if (!preview) c.rot += c.vRot * dt;

        // Wrap around edges (with margin so crystals don't pop in/out abruptly)
        const margin = c.r * 1.2;
        if (c.x < -margin) c.x = cssW + margin;
        else if (c.x > cssW + margin) c.x = -margin;
        if (c.y < -margin) c.y = cssH + margin;
        else if (c.y > cssH + margin) c.y = -margin;
      }

      const px = (mouse.x - 0.5) * 30;
      const py = (mouse.y - 0.5) * 30;

      renderAll(px, py);

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
