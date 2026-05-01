"use client";

/* NeonSynthwave — retro outrun aesthetic. Sunset gradient sky, a
 * scan-lined horizon sun, and a perspective grid sliding toward the
 * viewer. A slow horizontal scan band sweeps top-to-bottom. */

import { useEffect, useRef } from "react";

interface Props {
  preview?: { w: number; h: number };
}

export default function NeonSynthwave({ preview }: Props) {
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

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

    const seed = (n: number) => {
      const s = Math.sin(n * 9301 + 49297) * 233280;
      return s - Math.floor(s);
    };

    const drawSky = () => {
      const g = ctx.createLinearGradient(0, 0, 0, cssH);
      g.addColorStop(0, "#1a0020");
      g.addColorStop(0.55, "#ff006e");
      g.addColorStop(0.78, "#ffaa00");
      g.addColorStop(1, "#00d4ff");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cssW, cssH);
    };

    const drawStars = () => {
      // few scattered stars only in the dark upper region
      const horizonY = cssH * 0.6;
      const starCount = preview ? 18 : 50;
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < starCount; i++) {
        const sx = seed(i + 11) * cssW;
        const sy = seed(i + 23) * (horizonY * 0.85);
        const tw = preview
          ? 0.6
          : Math.sin(t * 0.0015 + i * 1.7) * 0.5 + 0.5;
        ctx.globalAlpha = 0.15 + tw * 0.35;
        ctx.fillRect(sx, sy, 1.2, 1.2);
      }
      ctx.globalAlpha = 1;
    };

    const drawSun = () => {
      const cx = cssW / 2;
      const horizonY = cssH * 0.6;
      const r = Math.min(cssW, cssH) * 0.22;

      // Half-disk gradient (top-half, sitting on the horizon)
      const g = ctx.createLinearGradient(cx, horizonY - r, cx, horizonY);
      g.addColorStop(0, "#ffd166");
      g.addColorStop(0.5, "#ffaa00");
      g.addColorStop(1, "#ff6b9d");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, horizonY, r, Math.PI, 0, false);
      ctx.closePath();
      ctx.fill();

      // CRT scan-lines: cut horizontal strips out of the bottom 60% of the sun
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, horizonY, r, Math.PI, 0, false);
      ctx.closePath();
      ctx.clip();

      const stripCount = 8;
      for (let i = 0; i < stripCount; i++) {
        const frac = i / stripCount; // 0 top of cut region
        const stripY = horizonY - r * 0.55 + frac * r * 0.6;
        const stripH = (r * 0.6) / stripCount / 1.6;
        // alpha falls toward the top of the sun (more cuts near the bottom)
        ctx.fillStyle = `rgba(15,5,20,${0.25 + frac * 0.55})`;
        ctx.fillRect(cx - r, stripY, r * 2, stripH);
      }
      ctx.restore();

      // Subtle outer glow
      const glow = ctx.createRadialGradient(
        cx,
        horizonY,
        r * 0.6,
        cx,
        horizonY,
        r * 1.8
      );
      glow.addColorStop(0, "rgba(255,107,157,0.3)");
      glow.addColorStop(1, "rgba(255,107,157,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, horizonY - r * 1.8, cssW, r * 1.8);
    };

    const drawGrid = () => {
      const horizonY = cssH * 0.6;
      const gridTop = horizonY;
      const gridBottom = cssH;
      const gridH = gridBottom - gridTop;
      if (gridH <= 0) return;

      ctx.strokeStyle = "rgba(0,255,255,0.4)";
      ctx.lineWidth = 1;

      // Horizontal lines — spaced via perspective. Use a moving offset so
      // the grid appears to slide toward the viewer.
      const speed = preview ? 0 : 0.00012; // proportion of gridH per ms
      const baseOffset = (t * speed) % 1;
      const horizontals = 14;
      for (let i = 0; i < horizontals; i++) {
        // perspective progress 0..1 from horizon to viewer
        const raw = (i + baseOffset) / horizontals;
        // ease so lines bunch near horizon
        const p = Math.pow(raw, 2.2);
        const y = gridTop + p * gridH;
        const alpha = 0.15 + p * 0.45;
        ctx.strokeStyle = `rgba(0,255,255,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cssW, y);
        ctx.stroke();
      }

      // Vertical lines fanning from horizon point at (cx, horizonY)
      const cx = cssW / 2;
      const verticals = 22;
      for (let i = -verticals / 2; i <= verticals / 2; i++) {
        const k = i / (verticals / 2); // -1..1
        const xBottom = cx + k * cssW * 1.3;
        ctx.strokeStyle = `rgba(0,255,255,0.45)`;
        ctx.beginPath();
        ctx.moveTo(cx, gridTop);
        ctx.lineTo(xBottom, gridBottom);
        ctx.stroke();
      }
    };

    const drawScanBand = () => {
      if (preview) return;
      // 8s period sweep top-to-bottom
      const period = 8000;
      const yp = ((t % period) / period) * cssH;
      const bandH = Math.max(60, cssH * 0.12);
      const g = ctx.createLinearGradient(0, yp - bandH / 2, 0, yp + bandH / 2);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(255,255,255,0.08)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, yp - bandH / 2, cssW, bandH);
    };

    const renderAll = () => {
      drawSky();
      drawStars();
      drawSun();
      drawGrid();
      drawScanBand();
    };

    // Preview is a static frame regardless.
    if (preview || reduced) {
      renderAll();
      return () => {
        ro?.disconnect();
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

      renderAll();

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
