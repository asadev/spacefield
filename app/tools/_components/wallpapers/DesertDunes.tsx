"use client";

/* DesertDunes — undulating sand-colored curves stacked into a dune
 * landscape with slow wind particles drifting horizontally across the
 * canvas. The dunes themselves drift left over very long timescales so
 * the scene never feels static. */

import { useEffect, useRef } from "react";

interface WindParticle {
  x: number;
  y: number;
  vx: number;
  size: number;
  alpha: number;
}

interface Props {
  preview?: { w: number; h: number };
}

export default function DesertDunes({ preview }: Props) {
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
    let particles: WindParticle[] = [];

    const seedParticles = () => {
      const count = Math.max(
        20,
        Math.floor((cssW * cssH) / (preview ? 1200 : 16000))
      );
      particles = [];
      for (let i = 0; i < count; i++) {
        particles.push(makeParticle(true));
      }
    };

    const makeParticle = (random: boolean): WindParticle => ({
      x: random ? Math.random() * cssW : -10,
      y: cssH * 0.3 + Math.random() * cssH * 0.6,
      vx: 0.3 + Math.random() * 0.9,
      size: 0.5 + Math.random() * 1.4,
      alpha: 0.1 + Math.random() * 0.35,
    });

    const resize = () => {
      cssW = preview?.w ?? canvas.clientWidth;
      cssH = preview?.h ?? canvas.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedParticles();
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

    // 5 dune layers, lightest in back
    const dunes = [
      { yBase: 0.55, amp: 30, freq: 0.005, color: "#3a2510", drift: 0.0006 },
      { yBase: 0.65, amp: 38, freq: 0.006, color: "#5a3815", drift: 0.0009 },
      { yBase: 0.74, amp: 45, freq: 0.0045, color: "#7a4d1b", drift: 0.0012 },
      { yBase: 0.84, amp: 50, freq: 0.0055, color: "#a56a25", drift: 0.0015 },
      { yBase: 0.92, amp: 40, freq: 0.007, color: "#c98a3a", drift: 0.0018 },
    ];

    let last = performance.now();
    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(48, now - last);
      last = now;
      t += dt;

      // sky gradient — warm sunlit desert
      const sky = ctx.createLinearGradient(0, 0, 0, cssH);
      sky.addColorStop(0, "#f4c98a");
      sky.addColorStop(0.5, "#e29a55");
      sky.addColorStop(1, "#9b5a25");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cssW, cssH);

      // faint sun
      const sunX = cssW * 0.78;
      const sunY = cssH * 0.25;
      const sunR = Math.min(cssW, cssH) * 0.08;
      const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 3);
      sunGrad.addColorStop(0, "rgba(255,240,200,0.55)");
      sunGrad.addColorStop(1, "rgba(255,240,200,0)");
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, 0, cssW, cssH);

      // dunes — back to front
      for (const d of dunes) {
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.moveTo(0, cssH);
        const seg = Math.max(40, Math.floor(cssW / 8));
        for (let i = 0; i <= seg; i++) {
          const x = (i / seg) * cssW;
          const y =
            cssH * d.yBase +
            Math.sin(x * d.freq + t * d.drift) * d.amp +
            Math.cos(x * d.freq * 0.5 + t * d.drift * 0.7) * d.amp * 0.4;
          if (i === 0) ctx.lineTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineTo(cssW, cssH);
        ctx.closePath();
        ctx.fill();
      }

      // wind particles
      ctx.fillStyle = "#fff";
      for (const p of particles) {
        p.x += p.vx * (dt / 16);
        if (p.x > cssW + 5) {
          Object.assign(p, makeParticle(false));
        }
        ctx.globalAlpha = p.alpha;
        ctx.fillRect(p.x, p.y, p.size, p.size * 0.8);
      }
      ctx.globalAlpha = 1;

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
