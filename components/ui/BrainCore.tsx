"use client";

import { useRef, useEffect, useCallback } from "react";
import { useCanvasTone } from "@/lib/useCanvasTone";

interface ConnectionTarget {
  x: number;
  y: number;
  highlighted: boolean;
}

interface Particle {
  connectionIndex: number;
  t: number; // 0-1 progress along path
  speed: number;
  alpha: number;
  size: number;
}

interface BrainCoreProps {
  width: number;
  height: number;
  connections: ConnectionTarget[];
  isMobile: boolean;
}

export default function BrainCore({
  width,
  height,
  connections,
  isMobile,
}: BrainCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const dprRef = useRef(1);
  const particlesRef = useRef<Particle[]>([]);
  const initedRef = useRef(false);
  const drawRef = useRef<(ctx: CanvasRenderingContext2D) => void>(() => {});
  const tone = useCanvasTone();

  const PARTICLES_PER_CONN = isMobile ? 2 : 3;

  const initParticles = useCallback(
    (connCount: number) => {
      const particles: Particle[] = [];
      for (let c = 0; c < connCount; c++) {
        for (let p = 0; p < PARTICLES_PER_CONN; p++) {
          particles.push({
            connectionIndex: c,
            t: p / PARTICLES_PER_CONN + Math.random() * 0.1,
            speed: 0.15 + Math.random() * 0.1,
            alpha: 0.3 + Math.random() * 0.3,
            size: 1.2 + Math.random() * 0.8,
          });
        }
      }
      particlesRef.current = particles;
      initedRef.current = true;
    },
    [PARTICLES_PER_CONN]
  );

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const dpr = dprRef.current;
      const now = performance.now() / 1000;
      ctx.clearRect(0, 0, width * dpr, height * dpr);

      const cx = (width / 2) * dpr;
      const cy = (height / 2) * dpr;

      // Draw brain glow
      const pulseAlpha = 0.12 + 0.08 * Math.sin(now * 1.5);
      const glowRadius = (45 + 5 * Math.sin(now * 1.5)) * dpr;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
      glow.addColorStop(0, `rgba(${tone},${pulseAlpha})`);
      glow.addColorStop(0.5, `rgba(${tone},${pulseAlpha * 0.3})`);
      glow.addColorStop(1, `rgba(${tone},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // Draw connections and particles
      for (let i = 0; i < connections.length; i++) {
        const conn = connections[i];
        const tx = conn.x * dpr;
        const ty = conn.y * dpr;
        const highlighted = conn.highlighted;

        // Connection line
        const lineAlpha = highlighted ? 0.18 : 0.05;
        ctx.beginPath();
        ctx.moveTo(cx, cy);

        // Slight curve via control point
        const midX = (cx + tx) / 2;
        const midY = (cy + ty) / 2;
        const perpX = -(ty - cy);
        const perpY = tx - cx;
        const len = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
        const curvature = 0.08;
        const cpx = midX + (perpX / len) * len * curvature;
        const cpy = midY + (perpY / len) * len * curvature;

        ctx.quadraticCurveTo(cpx, cpy, tx, ty);
        ctx.strokeStyle = `rgba(${tone},${lineAlpha})`;
        ctx.lineWidth = (highlighted ? 1.5 : 0.8) * dpr;
        ctx.stroke();

        // Glow on highlighted connection
        if (highlighted) {
          ctx.save();
          ctx.shadowBlur = 8 * dpr;
          ctx.shadowColor = `rgba(${tone},0.15)`;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.quadraticCurveTo(cpx, cpy, tx, ty);
          ctx.strokeStyle = `rgba(${tone},0.08)`;
          ctx.lineWidth = 3 * dpr;
          ctx.stroke();
          ctx.restore();
        }
      }

      // Draw particles
      for (const p of particlesRef.current) {
        if (p.connectionIndex >= connections.length) continue;

        const conn = connections[p.connectionIndex];
        const tx = conn.x * dpr;
        const ty = conn.y * dpr;
        const highlighted = conn.highlighted;

        // Advance particle
        const speedMult = highlighted ? 1.5 : 1;
        p.t += p.speed * speedMult * 0.005;
        if (p.t > 1) p.t -= 1;

        // Quadratic bezier position
        const midX = (cx + tx) / 2;
        const midY = (cy + ty) / 2;
        const perpX = -(ty - cy);
        const perpY = tx - cx;
        const len = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
        const curvature = 0.08;
        const cpx = midX + (perpX / len) * len * curvature;
        const cpy = midY + (perpY / len) * len * curvature;

        const t = p.t;
        const omt = 1 - t;
        const px = omt * omt * cx + 2 * omt * t * cpx + t * t * tx;
        const py = omt * omt * cy + 2 * omt * t * cpy + t * t * ty;

        const alphaBoost = highlighted ? 1.6 : 1;
        const fadeAlpha =
          p.alpha * alphaBoost * (t < 0.1 ? t / 0.1 : t > 0.9 ? (1 - t) / 0.1 : 1);

        ctx.beginPath();
        ctx.arc(px, py, p.size * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${tone},${Math.min(fadeAlpha, 0.8)})`;
        ctx.fill();

        // Particle glow
        if (fadeAlpha > 0.2) {
          const pGlow = ctx.createRadialGradient(
            px, py, 0,
            px, py, p.size * 3 * dpr
          );
          pGlow.addColorStop(0, `rgba(${tone},${fadeAlpha * 0.3})`);
          pGlow.addColorStop(1, `rgba(${tone},0)`);
          ctx.fillStyle = pGlow;
          ctx.beginPath();
          ctx.arc(px, py, p.size * 3 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(() => drawRef.current(ctx));
    },
    [width, height, connections, isMobile, tone]
  );

  useEffect(() => {
    if (connections.length > 0 && !initedRef.current) {
      initParticles(connections.length);
    }
  }, [connections.length, initParticles]);

  // Keep drawRef in sync so the rAF self-loop always calls the latest draw.
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dprRef.current = dpr;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      rafRef.current = requestAnimationFrame(() => drawRef.current(ctx));
    }

    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height, draw]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0"
      style={{ width, height }}
    />
  );
}
