"use client";

/* MarinaLights — calm dark water reflecting a marina skyline. Floating
 * dot lights flicker on the surface. Mouse motion sends gentle ripples
 * outward like a finger trailing across water. */

import { useEffect, useRef } from "react";

interface Light {
  x: number;
  y: number;
  hue: number;
  base: number;
  phase: number;
  size: number;
}

interface Ripple {
  x: number;
  y: number;
  age: number;
  maxAge: number;
}

interface Props {
  preview?: { w: number; h: number };
}

export default function MarinaLights({ preview }: Props) {
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
    let lights: Light[] = [];
    const ripples: Ripple[] = [];

    const seedLights = () => {
      const count = Math.max(
        12,
        Math.floor((cssW * cssH) / (preview ? 1500 : 14000))
      );
      lights = [];
      for (let i = 0; i < count; i++) {
        const surfaceY = cssH * 0.55;
        lights.push({
          x: Math.random() * cssW,
          y: surfaceY + Math.random() * (cssH - surfaceY),
          hue: 30 + Math.random() * 40,
          base: 0.35 + Math.random() * 0.4,
          phase: Math.random() * Math.PI * 2,
          size: 1 + Math.random() * 2,
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
      seedLights();
    };

    resize();
    const ro = preview ? null : new ResizeObserver(resize);
    if (ro) ro.observe(canvas);

    let lastMouseTime = 0;
    const onMouse = (e: MouseEvent) => {
      const now = performance.now();
      if (now - lastMouseTime < 90) return;
      lastMouseTime = now;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (y < cssH * 0.55) return;
      ripples.push({ x, y, age: 0, maxAge: 1100 });
      if (ripples.length > 14) ripples.shift();
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

    let last = performance.now();
    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(48, now - last);
      last = now;
      t += dt;

      // sky → water gradient
      const sky = ctx.createLinearGradient(0, 0, 0, cssH);
      sky.addColorStop(0, "#0a0f1f");
      sky.addColorStop(0.5, "#162a45");
      sky.addColorStop(0.55, "#08111e");
      sky.addColorStop(1, "#02050c");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cssW, cssH);

      // distant skyline silhouette
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.moveTo(0, cssH * 0.55);
      const seg = 40;
      for (let i = 0; i <= seg; i++) {
        const x = (i / seg) * cssW;
        const h = 30 + Math.sin(i * 1.3) * 15 + ((i * 7) % 20);
        ctx.lineTo(x, cssH * 0.55 - h);
        ctx.lineTo(x + cssW / seg / 2, cssH * 0.55 - h);
        ctx.lineTo(x + cssW / seg / 2, cssH * 0.55);
      }
      ctx.lineTo(cssW, cssH * 0.55);
      ctx.closePath();
      ctx.fill();

      // skyline windows (tiny warm dots above water)
      ctx.fillStyle = "rgba(255,200,120,0.7)";
      for (let i = 0; i < (preview ? 12 : 60); i++) {
        const x = ((i * 47) % cssW);
        const h = 30 + Math.sin(i * 1.3) * 15 + ((i * 7) % 20);
        const y = cssH * 0.55 - Math.random() * h * 0.8;
        const tw = Math.sin(t * 0.003 + i) * 0.5 + 0.5;
        ctx.globalAlpha = 0.5 + tw * 0.5;
        ctx.fillRect(x, y, 1, 1);
      }
      ctx.globalAlpha = 1;

      // surface light reflections — flicker
      for (const l of lights) {
        const flicker = (Math.sin(t * 0.004 + l.phase) + 1) / 2;
        const a = l.base * (0.4 + flicker * 0.6);
        const grad = ctx.createRadialGradient(
          l.x,
          l.y,
          0,
          l.x,
          l.y,
          l.size * 8
        );
        grad.addColorStop(0, `hsla(${l.hue}, 90%, 70%, ${a})`);
        grad.addColorStop(1, `hsla(${l.hue}, 90%, 70%, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(l.x - l.size * 8, l.y - l.size * 8, l.size * 16, l.size * 16);
        // vertical reflection streak
        ctx.fillStyle = `hsla(${l.hue}, 90%, 70%, ${a * 0.4})`;
        ctx.fillRect(l.x - 0.5, l.y, 1, 12 + flicker * 10);
      }

      // ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.age += dt;
        const p = r.age / r.maxAge;
        if (p >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.strokeStyle = `rgba(180,210,255,${(1 - p) * 0.4})`;
        ctx.lineWidth = 1;
        ctx.arc(r.x, r.y, p * 80, 0, Math.PI * 2);
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
