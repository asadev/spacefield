"use client";

/* Sandstorm — fine particles drifting diagonally across a hazy ochre
 * canvas with a softly glowing sun in the upper corner. Reads as motion
 * without ever resolving into anything sharp enough to distract. */

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  drift: number;
}

interface Props {
  preview?: { w: number; h: number };
}

export default function Sandstorm({ preview }: Props) {
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
    let particles: Particle[] = [];

    const seedParticles = () => {
      const count = Math.max(
        50,
        Math.floor((cssW * cssH) / (preview ? 600 : 6000))
      );
      particles = [];
      for (let i = 0; i < count; i++) {
        particles.push(makeParticle(true));
      }
    };

    const makeParticle = (random: boolean): Particle => ({
      x: random ? Math.random() * cssW : -10 - Math.random() * 50,
      y: random ? Math.random() * cssH : Math.random() * cssH * 1.2 - cssH * 0.1,
      vx: 1.2 + Math.random() * 1.8,
      vy: 0.4 + Math.random() * 0.7,
      size: 0.6 + Math.random() * 1.6,
      alpha: 0.05 + Math.random() * 0.35,
      drift: (Math.random() - 0.5) * 0.4,
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

    let last = performance.now();
    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(48, now - last);
      last = now;
      t += dt;

      // base ochre wash with vertical gradient
      const base = ctx.createLinearGradient(0, 0, 0, cssH);
      base.addColorStop(0, "#c2884a");
      base.addColorStop(0.5, "#a06a32");
      base.addColorStop(1, "#5e3c1b");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, cssW, cssH);

      // hazy sun — top-right corner, big soft halo
      const sunX = cssW * 0.82;
      const sunY = cssH * 0.18;
      const sunR = Math.min(cssW, cssH) * 0.45;
      const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
      sunGrad.addColorStop(0, "rgba(255,235,180,0.55)");
      sunGrad.addColorStop(0.3, "rgba(255,210,140,0.35)");
      sunGrad.addColorStop(1, "rgba(255,180,100,0)");
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, 0, cssW, cssH);

      // diagonal haze streaks (very faint, slow drift)
      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = "rgba(255,220,180,0.05)";
      ctx.lineWidth = 30;
      for (let i = 0; i < 5; i++) {
        const off = ((t * 0.04 + i * 200) % (cssW + cssH)) - cssH;
        ctx.beginPath();
        ctx.moveTo(off, 0);
        ctx.lineTo(off + cssH, cssH);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";

      // particles — diagonal drift
      for (const p of particles) {
        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        p.x += Math.sin(t * 0.001 + p.drift * 5) * 0.2;
        if (p.x > cssW + 5 || p.y > cssH + 5) {
          Object.assign(p, makeParticle(false));
        }
        ctx.fillStyle = `rgba(255,235,200,${p.alpha})`;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }

      // gentle vignette
      const vg = ctx.createRadialGradient(
        cssW / 2,
        cssH / 2,
        Math.min(cssW, cssH) * 0.3,
        cssW / 2,
        cssH / 2,
        Math.max(cssW, cssH) * 0.7
      );
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(40,20,5,0.45)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, cssW, cssH);

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
