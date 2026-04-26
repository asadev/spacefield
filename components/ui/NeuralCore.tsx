"use client";

import { useRef, useEffect, useCallback } from "react";
import { useCanvasTone } from "@/lib/useCanvasTone";

interface LightningBolt {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  progress: number;
  startTime: number;
  duration: number;
  targetIndex: number;
}

interface Particle {
  angle: number;
  radius: number;
  speed: number;
  alpha: number;
  size: number;
}

interface NeuralCoreProps {
  width: number;
  height: number;
  targetPositions: React.MutableRefObject<{ x: number; y: number }[]>;
  onLightningHit?: (index: number) => void;
  isMobile?: boolean;
}

export default function NeuralCore({
  width,
  height,
  targetPositions,
  onLightningHit,
  isMobile = false,
}: NeuralCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const dprRef = useRef(1);
  const particlesRef = useRef<Particle[]>([]);
  const boltsRef = useRef<LightningBolt[]>([]);
  const lastBoltTimeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const isVisible = useRef(true);
  const drawRef = useRef<(ctx: CanvasRenderingContext2D, w: number, h: number) => void>(
    () => {}
  );
  const tone = useCanvasTone();

  const PARTICLE_COUNT = isMobile ? 15 : 25;
  const BOLT_INTERVAL_MIN = isMobile ? 3000 : 2000;
  const BOLT_INTERVAL_MAX = isMobile ? 4000 : 4000;
  const BOLT_DURATION = 300;
  const MAX_BOLTS = isMobile ? 1 : 3;
  const FRAME_INTERVAL = isMobile ? 1000 / 30 : 0;

  const initParticles = useCallback(() => {
    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 20 + Math.random() * 30,
        speed: 0.3 + Math.random() * 0.5,
        alpha: 0.1 + Math.random() * 0.2,
        size: 0.5 + Math.random() * 1,
      });
    }
    particlesRef.current = particles;
  }, [PARTICLE_COUNT]);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number) => {
      if (!isVisible.current) {
        rafRef.current = requestAnimationFrame(() => drawRef.current(ctx, canvasW, canvasH));
        return;
      }
      const now = performance.now();

      if (FRAME_INTERVAL > 0 && now - lastFrameRef.current < FRAME_INTERVAL) {
        rafRef.current = requestAnimationFrame(() =>
          drawRef.current(ctx, canvasW, canvasH)
        );
        return;
      }
      lastFrameRef.current = now;

      const dpr = dprRef.current;
      ctx.clearRect(0, 0, canvasW * dpr, canvasH * dpr);

      const cx = (canvasW / 2) * dpr;
      const cy = (canvasH / 2) * dpr;
      const t = now / 1000;

      // Pulsing central radial gradient
      const pulseAlpha = 0.15 + 0.15 * Math.sin(t * ((2 * Math.PI) / 3));
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80 * dpr);
      gradient.addColorStop(0, `rgba(${tone},${pulseAlpha})`);
      gradient.addColorStop(0.5, `rgba(${tone},${pulseAlpha * 0.3})`);
      gradient.addColorStop(1, `rgba(${tone},0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, 80 * dpr, 0, Math.PI * 2);
      ctx.fill();

      // Concentric ring strokes
      const ringAlphas = [0.08, 0.06, 0.04, 0.03];
      const ringRadii = [30, 50, 70, 90];
      for (let i = 0; i < ringRadii.length; i++) {
        const breathe = Math.sin(t * 0.8 + i * 0.5) * 5;
        const r = (ringRadii[i] + breathe) * dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${tone},${ringAlphas[i]})`;
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();
      }

      // Particles drifting outward
      const particles = particlesRef.current;
      for (const p of particles) {
        p.radius += p.speed * 0.15;
        if (p.radius > 100) {
          p.radius = 20;
          p.angle = Math.random() * Math.PI * 2;
          p.alpha = 0.1 + Math.random() * 0.2;
        }
        const fadeAlpha = p.alpha * (1 - (p.radius - 20) / 80);
        const px = cx + Math.cos(p.angle) * p.radius * dpr;
        const py = cy + Math.sin(p.angle) * p.radius * dpr;
        ctx.beginPath();
        ctx.arc(px, py, p.size * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${tone},${Math.max(0, fadeAlpha)})`;
        ctx.fill();
      }

      // Lightning bolt generation
      const targets = targetPositions.current;
      if (
        targets.length > 0 &&
        now - lastBoltTimeRef.current >
          BOLT_INTERVAL_MIN +
            Math.random() * (BOLT_INTERVAL_MAX - BOLT_INTERVAL_MIN)
      ) {
        const boltCount = 1 + Math.floor(Math.random() * MAX_BOLTS);
        const used = new Set<number>();
        for (let b = 0; b < boltCount && used.size < targets.length; b++) {
          let idx: number;
          do {
            idx = Math.floor(Math.random() * targets.length);
          } while (used.has(idx));
          used.add(idx);

          const target = targets[idx];
          boltsRef.current.push({
            x1: canvasW / 2,
            y1: canvasH / 2,
            x2: target.x,
            y2: target.y,
            progress: 0,
            startTime: now,
            duration: BOLT_DURATION,
            targetIndex: idx,
          });
          onLightningHit?.(idx);
        }
        lastBoltTimeRef.current = now;
      }

      // Draw lightning bolts
      const activeBolts: LightningBolt[] = [];
      for (const bolt of boltsRef.current) {
        const elapsed = now - bolt.startTime;
        if (elapsed > bolt.duration) continue;

        activeBolts.push(bolt);
        const progress = elapsed / bolt.duration;
        const alpha = progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) / 0.7;

        ctx.save();
        ctx.shadowBlur = 15 * dpr;
        ctx.shadowColor = `rgba(${tone},0.6)`;
        ctx.strokeStyle = `rgba(${tone},${0.3 * alpha})`;
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();

        const x1 = bolt.x1 * dpr;
        const y1 = bolt.y1 * dpr;
        const x2 = bolt.x2 * dpr;
        const y2 = bolt.y2 * dpr;

        // Jagged lightning path
        const segments = 6;
        ctx.moveTo(x1, y1);
        for (let s = 1; s <= segments; s++) {
          const frac = s / segments;
          const lx = x1 + (x2 - x1) * frac;
          const ly = y1 + (y2 - y1) * frac;
          if (s < segments) {
            const perpX = -(y2 - y1);
            const perpY = x2 - x1;
            const len = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
            const jitter = (Math.random() - 0.5) * 20 * dpr;
            ctx.lineTo(
              lx + (perpX / len) * jitter,
              ly + (perpY / len) * jitter
            );
          } else {
            ctx.lineTo(lx, ly);
          }
        }
        ctx.stroke();

        // Impact flash at target
        if (progress < 0.5) {
          const flashAlpha = 0.4 * (1 - progress / 0.5);
          const flashGrad = ctx.createRadialGradient(
            x2, y2, 0,
            x2, y2, 12 * dpr
          );
          flashGrad.addColorStop(0, `rgba(${tone},${flashAlpha})`);
          flashGrad.addColorStop(1, `rgba(${tone},0)`);
          ctx.fillStyle = flashGrad;
          ctx.beginPath();
          ctx.arc(x2, y2, 12 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
      boltsRef.current = activeBolts;

      rafRef.current = requestAnimationFrame(() =>
        drawRef.current(ctx, canvasW, canvasH)
      );
    },
    [
      targetPositions,
      onLightningHit,
      isMobile,
      BOLT_INTERVAL_MIN,
      BOLT_INTERVAL_MAX,
      MAX_BOLTS,
      FRAME_INTERVAL,
      tone,
    ]
  );

  // Keep drawRef pointed at the latest draw so the rAF self-loop is always current.
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

    initParticles();

    const ctx = canvas.getContext("2d");
    if (ctx) {
      rafRef.current = requestAnimationFrame(() => drawRef.current(ctx, width, height));
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [width, height, initParticles, draw]);

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

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0"
      style={{ width, height }}
    />
  );
}
