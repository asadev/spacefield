"use client";

/* AuroraDubai — flowing aurora-like ribbons drawn as stacked sine
 * gradients that morph and gently react to the mouse. Three palettes
 * (teal, magenta, gold) cycle across multiple bands. */

import { useEffect, useRef } from "react";

interface Props {
  preview?: { w: number; h: number };
}

export default function AuroraDubai({ preview }: Props) {
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
      mouse.tx = e.clientX / window.innerWidth;
      mouse.ty = e.clientY / window.innerHeight;
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

    const ribbons = [
      { hue1: 178, hue2: 220, yBase: 0.32, amp: 90, speed: 0.0004 },
      { hue1: 290, hue2: 320, yBase: 0.5, amp: 110, speed: 0.0006 },
      { hue1: 38, hue2: 16, yBase: 0.68, amp: 80, speed: 0.0005 },
    ];

    let last = performance.now();
    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(48, now - last);
      last = now;
      t += dt;
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;

      // base
      ctx.fillStyle = "#06081a";
      ctx.fillRect(0, 0, cssW, cssH);

      // each ribbon = wide vertical gradient swept across cssH using a path
      ctx.globalCompositeOperation = "screen";
      const seg = Math.max(40, Math.floor(cssW / 6));

      ribbons.forEach((r, idx) => {
        const phase = t * r.speed + idx;
        const offsetY =
          (mouse.y - 0.5) * 60 * (idx + 1) +
          (mouse.x - 0.5) * 30 * ((idx % 2) * 2 - 1);

        ctx.beginPath();
        for (let i = 0; i <= seg; i++) {
          const x = (i / seg) * cssW;
          const y =
            cssH * r.yBase +
            offsetY +
            Math.sin(i * 0.08 + phase) * r.amp +
            Math.sin(i * 0.03 - phase * 1.3) * r.amp * 0.4;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let i = seg; i >= 0; i--) {
          const x = (i / seg) * cssW;
          const y =
            cssH * r.yBase +
            offsetY +
            Math.sin(i * 0.08 + phase) * r.amp +
            Math.sin(i * 0.03 - phase * 1.3) * r.amp * 0.4 +
            cssH * 0.18;
          ctx.lineTo(x, y);
        }
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, cssH * r.yBase, 0, cssH);
        grad.addColorStop(
          0,
          `hsla(${r.hue1 + Math.sin(phase) * 10}, 90%, 60%, 0.45)`
        );
        grad.addColorStop(0.5, `hsla(${r.hue2}, 85%, 55%, 0.25)`);
        grad.addColorStop(1, `hsla(${r.hue2}, 85%, 50%, 0)`);
        ctx.fillStyle = grad;
        ctx.fill();
      });

      ctx.globalCompositeOperation = "source-over";

      // soft star dust to break flat black areas
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      const stars = preview ? 8 : 60;
      for (let i = 0; i < stars; i++) {
        const sx = (Math.sin(i * 12.345 + t * 0.0001) * 0.5 + 0.5) * cssW;
        const sy = ((i * 173) % cssH);
        const tw = Math.sin(t * 0.002 + i) * 0.5 + 0.5;
        ctx.globalAlpha = tw * 0.4;
        ctx.fillRect(sx, sy, 1.2, 1.2);
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
