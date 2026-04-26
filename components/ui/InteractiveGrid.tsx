"use client";

import { useRef, useEffect, useCallback } from "react";
import { useCanvasTone } from "@/lib/useCanvasTone";

interface Dot {
  x: number;
  y: number;
  baseAlpha: number;
}

export default function InteractiveGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const dotsRef = useRef<Dot[]>([]);
  const rafRef = useRef<number>(0);
  const dprRef = useRef(1);
  const isVisible = useRef(true);
  const drawRef = useRef<(ctx: CanvasRenderingContext2D, w: number, h: number) => void>(
    () => {}
  );
  const tone = useCanvasTone();

  const SPACING = 40;
  const DOT_RADIUS = 0.8;
  const INFLUENCE = 150;
  const LINE_DISTANCE = 120;

  const initDots = useCallback(
    (width: number, height: number) => {
      const dots: Dot[] = [];
      const cols = Math.ceil(width / SPACING) + 1;
      const rows = Math.ceil(height / SPACING) + 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          dots.push({
            x: c * SPACING,
            y: r * SPACING,
            baseAlpha: 0.08 + Math.random() * 0.04,
          });
        }
      }
      dotsRef.current = dots;
    },
    [SPACING]
  );

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      if (!isVisible.current) {
        rafRef.current = requestAnimationFrame(() => drawRef.current(ctx, width, height));
        return;
      }
      const dpr = dprRef.current;
      ctx.clearRect(0, 0, width * dpr, height * dpr);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const dots = dotsRef.current;

      // Draw lines between nearby active dots
      for (let i = 0; i < dots.length; i++) {
        const a = dots[i];
        const dxA = a.x - mx;
        const dyA = a.y - my;
        const distA = Math.sqrt(dxA * dxA + dyA * dyA);
        if (distA > INFLUENCE * 1.5) continue;

        const alphaA = Math.max(0, 1 - distA / INFLUENCE);

        for (let j = i + 1; j < dots.length; j++) {
          const b = dots[j];
          const ddx = a.x - b.x;
          const ddy = a.y - b.y;
          const dd = Math.sqrt(ddx * ddx + ddy * ddy);
          if (dd > LINE_DISTANCE) continue;

          const dxB = b.x - mx;
          const dyB = b.y - my;
          const distB = Math.sqrt(dxB * dxB + dyB * dyB);
          const alphaB = Math.max(0, 1 - distB / INFLUENCE);

          const lineAlpha = Math.min(alphaA, alphaB) * (1 - dd / LINE_DISTANCE) * 0.15;
          if (lineAlpha < 0.005) continue;

          ctx.beginPath();
          ctx.moveTo(a.x * dpr, a.y * dpr);
          ctx.lineTo(b.x * dpr, b.y * dpr);
          ctx.strokeStyle = `rgba(${tone},${lineAlpha})`;
          ctx.lineWidth = 0.5 * dpr;
          ctx.stroke();
        }
      }

      // Draw dots
      for (const dot of dots) {
        const dx = dot.x - mx;
        const dy = dot.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const influence = Math.max(0, 1 - dist / INFLUENCE);

        const alpha = dot.baseAlpha + influence * 0.5;
        const radius = (DOT_RADIUS + influence * 1.2) * dpr;

        ctx.beginPath();
        ctx.arc(dot.x * dpr, dot.y * dpr, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${tone},${alpha})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(() => drawRef.current(ctx, width, height));
    },
    [INFLUENCE, LINE_DISTANCE, DOT_RADIUS, tone]
  );

  // Keep drawRef in sync so the rAF self-loop uses the latest draw.
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  // Pause animation when off-screen
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new IntersectionObserver(
      ([entry]) => { isVisible.current = entry.isIntersecting; },
      { threshold: 0 }
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dprRef.current = dpr;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      initDots(w, h);
    };

    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouse);

    const ctx = canvas.getContext("2d");
    if (ctx) {
      rafRef.current = requestAnimationFrame(() =>
        drawRef.current(ctx, canvas.width / dpr, canvas.height / dpr)
      );
    }

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouse);
      cancelAnimationFrame(rafRef.current);
    };
  }, [initDots, draw]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
