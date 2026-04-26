"use client";

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { useScroll, useMotionValueEvent } from "framer-motion";
import SectionLabel from "./ui/SectionLabel";
import TextReveal from "./ui/TextReveal";
import BrainSVG from "./ui/BrainSVG";
import { tools } from "@/lib/tools-data";

/* ─── Grid layout: 4 top + 4 bottom + 10 left (2×5) + 10 right (2×5) = 28 icons ─── */
const ICON_LAYOUT = (() => {
  const spots: { x: number; y: number; size: number }[] = [];
  const iconSize = 34;

  // Top row: 4 icons
  const topY = 0.22;
  for (let i = 0; i < 4; i++) {
    spots.push({ x: 0.38 + i * 0.08, y: topY, size: iconSize });
  }

  // Bottom row: 4 icons
  const botY = 0.78;
  for (let i = 0; i < 4; i++) {
    spots.push({ x: 0.38 + i * 0.08, y: botY, size: iconSize });
  }

  // Left block: 2 cols × 5 rows = 10 icons
  const leftCols = [0.22, 0.30];
  const rowPositions = [0.26, 0.39, 0.50, 0.61, 0.74];
  for (const row of rowPositions) {
    for (const col of leftCols) {
      spots.push({ x: col, y: row, size: iconSize });
    }
  }

  // Right block: 2 cols × 5 rows = 10 icons
  const rightCols = [0.70, 0.78];
  for (const row of rowPositions) {
    for (const col of rightCols) {
      spots.push({ x: col, y: row, size: iconSize });
    }
  }

  return spots; // 4 + 4 + 10 + 10 = 28
})();

/*
  Route pipe from brain center to app using 2-3 right-angle segments.
  Pattern: exit brain in a direction → horizontal run → vertical run → horizontal to app
  Returns array of {x,y} waypoints.
*/
function routePipe(
  cx: number, cy: number, tx: number, ty: number, _idx: number, dpr: number
): { x: number; y: number }[] {
  const brainR = 0; // pipes start from center, hidden behind brain image
  const cxD = cx * dpr;
  const cyD = cy * dpr;
  const txD = tx * dpr;
  const tyD = ty * dpr;

  const dx = txD - cxD;
  const dy = tyD - cyD;
  const angle = Math.atan2(dy, dx);
  const exitX = cxD + Math.cos(angle) * brainR;
  const exitY = cyD + Math.sin(angle) * brainR;

  // Midpoint: go 50% of the way radially, then turn
  const midFrac = 0.5;
  const midX = exitX + (txD - exitX) * midFrac;
  const midY = exitY + (tyD - exitY) * midFrac;

  // Determine primary direction and create uniform L-shape
  const absDx = Math.abs(txD - exitX);
  const absDy = Math.abs(tyD - exitY);

  if (absDx > absDy) {
    // Primarily horizontal: go horizontal first, then vertical
    return [
      { x: exitX, y: exitY },
      { x: midX, y: exitY },
      { x: midX, y: tyD },
      { x: txD, y: tyD },
    ];
  } else {
    // Primarily vertical: go vertical first, then horizontal
    return [
      { x: exitX, y: exitY },
      { x: exitX, y: midY },
      { x: txD, y: midY },
      { x: txD, y: tyD },
    ];
  }
}

/* ─── Canvas ─── */
function PipeCanvas({
  width, height, cx, cy, targets, chainProgress,
}: {
  width: number; height: number; cx: number; cy: number;
  targets: { x: number; y: number; order: number }[];
  chainProgress: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const dprRef = useRef(1);
  const drawRef = useRef<(ctx: CanvasRenderingContext2D) => void>(() => {});

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const dpr = dprRef.current;
    const now = performance.now() / 1000;
    ctx.clearRect(0, 0, width * dpr, height * dpr);

    if (chainProgress < 0.01) {
      rafRef.current = requestAnimationFrame(() => drawRef.current(ctx));
      return;
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];

      const pipeStart = t.order * 0.5;
      const pipeProgress = Math.max(0, Math.min(1, (chainProgress - pipeStart) / 0.5));
      if (pipeProgress <= 0) continue;

      const waypoints = routePipe(cx, cy, t.x, t.y, i, dpr);

      let totalLen = 0;
      const segLens: number[] = [];
      for (let s = 1; s < waypoints.length; s++) {
        const dx = waypoints[s].x - waypoints[s - 1].x;
        const dy = waypoints[s].y - waypoints[s - 1].y;
        const len = Math.sqrt(dx * dx + dy * dy);
        segLens.push(len);
        totalLen += len;
      }

      const drawnLen = pipeProgress * totalLen;
      const cornerR = 14 * dpr;

      const buildPath = () => {
        ctx.beginPath();
        ctx.moveTo(waypoints[0].x, waypoints[0].y);
        let remaining = drawnLen;

        for (let s = 0; s < segLens.length; s++) {
          if (remaining <= 0) break;
          const seg = segLens[s];
          const curr = waypoints[s];
          const next = waypoints[s + 1];
          const after = waypoints[s + 2];

          if (remaining < seg) {
            const frac = remaining / seg;
            ctx.lineTo(
              curr.x + (next.x - curr.x) * frac,
              curr.y + (next.y - curr.y) * frac
            );
            remaining = 0;
          } else if (after && remaining >= seg) {
            const r = Math.min(cornerR, seg * 0.4, segLens[s + 1] * 0.4);
            const d1x = next.x - curr.x;
            const d1y = next.y - curr.y;
            const d1len = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
            const d2x = after.x - next.x;
            const d2y = after.y - next.y;
            const d2len = Math.sqrt(d2x * d2x + d2y * d2y) || 1;
            const bx = next.x - (d1x / d1len) * r;
            const by = next.y - (d1y / d1len) * r;
            const ax = next.x + (d2x / d2len) * r;
            const ay = next.y + (d2y / d2len) * r;
            ctx.lineTo(bx, by);
            ctx.quadraticCurveTo(next.x, next.y, ax, ay);
            remaining -= seg;
          } else {
            ctx.lineTo(next.x, next.y);
            remaining -= seg;
          }
        }
      };

      buildPath();
      ctx.strokeStyle = `rgba(70,110,210,0.05)`;
      ctx.lineWidth = 7 * dpr;
      ctx.stroke();

      buildPath();
      ctx.strokeStyle = `rgba(80,125,230,0.09)`;
      ctx.lineWidth = 3.5 * dpr;
      ctx.stroke();

      buildPath();
      ctx.strokeStyle = `rgba(110,155,255,0.14)`;
      ctx.lineWidth = 1.2 * dpr;
      ctx.stroke();

      if (pipeProgress < 1) {
        let remaining = drawnLen;
        let tipX = waypoints[0].x, tipY = waypoints[0].y;
        for (let s = 0; s < segLens.length; s++) {
          if (remaining <= 0) break;
          if (remaining >= segLens[s]) {
            tipX = waypoints[s + 1].x;
            tipY = waypoints[s + 1].y;
            remaining -= segLens[s];
          } else {
            const frac = remaining / segLens[s];
            tipX = waypoints[s].x + (waypoints[s + 1].x - waypoints[s].x) * frac;
            tipY = waypoints[s].y + (waypoints[s + 1].y - waypoints[s].y) * frac;
            remaining = 0;
          }
        }
        ctx.beginPath();
        ctx.arc(tipX, tipY, 3.5 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(130,175,255,0.8)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(tipX, tipY, 8 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(100,150,255,0.12)";
        ctx.fill();
      }

      if (pipeProgress >= 1) {
        const posOnPath = (dist: number) => {
          let rem = dist;
          for (let s = 0; s < segLens.length; s++) {
            if (rem <= segLens[s]) {
              const f = rem / segLens[s];
              return {
                x: waypoints[s].x + (waypoints[s + 1].x - waypoints[s].x) * f,
                y: waypoints[s].y + (waypoints[s + 1].y - waypoints[s].y) * f,
              };
            }
            rem -= segLens[s];
          }
          return waypoints[waypoints.length - 1];
        };

        const speed = 0.3 + (i % 3) * 0.04;
        for (let flow = 0; flow < 2; flow++) {
          const phase = flow * 0.5 + i * 0.19;
          const sweepFrac = ((now * speed + phase) % 1.5) / 1.5;
          const sweepPos = sweepFrac * totalLen;
          const glowHalf = totalLen * 0.1;
          const s0 = Math.max(0, sweepPos - glowHalf);
          const s1 = Math.min(totalLen, sweepPos + glowHalf);

          ctx.beginPath();
          const p0 = posOnPath(s0);
          ctx.moveTo(p0.x, p0.y);
          const eSamples = 8;
          for (let e = 1; e <= eSamples; e++) {
            const d = s0 + (e / eSamples) * (s1 - s0);
            const p = posOnPath(d);
            ctx.lineTo(p.x, p.y);
          }
          ctx.strokeStyle = `rgba(90,145,255,0.1)`;
          ctx.lineWidth = 5 * dpr;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          for (let e = 1; e <= eSamples; e++) {
            const d = s0 + (e / eSamples) * (s1 - s0);
            const p = posOnPath(d);
            ctx.lineTo(p.x, p.y);
          }
          ctx.strokeStyle = `rgba(140,185,255,0.35)`;
          ctx.lineWidth = 1.5 * dpr;
          ctx.stroke();
        }
      }
    }

    rafRef.current = requestAnimationFrame(() => drawRef.current(ctx));
  }, [width, height, cx, cy, targets, chainProgress]);

  // Keep the ref in sync so the rAF callbacks always invoke the latest draw.
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
    if (ctx) rafRef.current = requestAnimationFrame(() => drawRef.current(ctx));
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height, draw]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-10" style={{ width, height }} />;
}

/* ─── Main ─── */
export default function AISystemVisualization() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const [scrollP, setScrollP] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", setScrollP);

  const organizeProgress = Math.min(1, scrollP / 0.18);
  const brainWake = Math.max(0, Math.min(1, (scrollP - 0.05) / 0.13));
  const brainScale = brainWake < 0.6 ? 0.2 + brainWake * 1.2 : 0.92 + (1 - brainWake) * 0.15;
  const brainOpacity = Math.min(1, brainWake * 2);
  const chainProgress = Math.max(0, Math.min(1, (scrollP - 0.16) / 0.4));
  const headerOpacity = Math.max(0, 1 - scrollP / 0.08);

  useEffect(() => {
    const update = () => {
      const el = stickyRef.current;
      if (!el) return;
      setDimensions({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const { cx, cy, brainSize } = useMemo(() => ({
    cx: dimensions.width / 2,
    cy: dimensions.height / 2,
    brainSize: dimensions.width < 768 ? 45 : dimensions.width < 1024 ? 65 : 85,
  }), [dimensions]);

  const activeTools = tools;

  const iconPositions = useMemo(() => {
    if (dimensions.width === 0) return [];
    const w = dimensions.width;
    const h = dimensions.height;
    const org = easeOutCubic(organizeProgress);
    const isMobile = w < 768;
    const sizeMult = isMobile ? 0.75 : w < 1024 ? 0.85 : 1;

    let seed = 55;
    const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    return activeTools.map((_, i) => {
      const spot = ICON_LAYOUT[i];
      // Scatter start: random around center, constrained
      const sx = cx + (rng() - 0.5) * w * 0.38;
      const sy = cy + (rng() - 0.5) * h * 0.28;
      // Organized end: use viewport dimensions directly for grid layout
      const ox = spot.x * w;
      const oy = spot.y * h;
      const order = i / (activeTools.length - 1);
      return {
        x: sx + (ox - sx) * org,
        y: sy + (oy - sy) * org,
        size: spot.size * sizeMult,
        toolIndex: i,
        order,
        activated: chainProgress > order * 0.5 + 0.5,
      };
    });
  }, [dimensions, organizeProgress, chainProgress, cx, cy, activeTools]);

  const pipeTargets = useMemo(() => {
    if (chainProgress < 0.01) return [];
    return iconPositions.map((p) => ({ x: p.x, y: p.y, order: p.order }));
  }, [iconPositions, chainProgress]);

  return (
    <section ref={sectionRef} className="relative" style={{ height: "180vh" }}>
      <div className="sticky top-0 overflow-hidden" style={{ height: "100vh" }}>

        <div
          className="absolute top-8 left-0 right-0 z-30 mx-auto max-w-[1200px] px-6 lg:px-10"
          style={{ opacity: headerOpacity }}
        >
          <SectionLabel>Ecosystem</SectionLabel>
          <TextReveal
            as="h2"
            className="mt-4 text-[clamp(1.8rem,4vw,3.2rem)] font-bold leading-[1.1] tracking-[-0.02em] text-white"
          >
            One Brain. Every Tool.
          </TextReveal>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-gray-200">
            A living AI system — connected to every tool, orchestrating every response.
          </p>
        </div>

        <div ref={stickyRef} className="absolute inset-0">
          {dimensions.width > 0 && (
            <>
              <PipeCanvas
                width={dimensions.width} height={dimensions.height}
                cx={cx} cy={cy}
                targets={pipeTargets}
                chainProgress={chainProgress}
              />

              <div
                className="absolute z-20 flex items-center justify-center pointer-events-none"
                style={{
                  left: cx - brainSize * 1.3, top: cy - brainSize * 1.3,
                  width: brainSize * 2.6, height: brainSize * 2.6,
                }}
              >
                <BrainSVG size={brainSize} opacity={brainOpacity} scale={brainScale} />
              </div>

              {iconPositions.map((ic, i) => {
                const tool = activeTools[ic.toolIndex];
                if (!tool) return null;
                const baseO = 0.5 + organizeProgress * 0.35;
                const glow = ic.activated ? 0.25 : 0;
                return (
                  <div
                    key={i}
                    className="absolute pointer-events-none"
                    style={{
                      left: 0, top: 0, width: ic.size, height: ic.size,
                      transform: `translate(${ic.x - ic.size / 2}px, ${ic.y - ic.size / 2}px) scale(${ic.activated ? 1.06 : 1})`,
                      opacity: baseO + glow,
                      willChange: "transform, opacity",
                      transition: "transform 0.4s ease, opacity 0.4s ease",
                    }}
                  >
                    <div
                      className="flex items-center justify-center rounded-xl"
                      style={{
                        width: ic.size, height: ic.size,
                        background: ic.activated ? "color-mix(in srgb, var(--text) 18%, transparent)" : "color-mix(in srgb, var(--text) 10%, transparent)",
                        border: ic.activated ? "1px solid color-mix(in srgb, var(--text) 28%, transparent)" : "1px solid color-mix(in srgb, var(--text) 14%, transparent)",
                        boxShadow: ic.activated ? "0 2px 12px rgba(100,150,255,0.12)" : "var(--shadow-sm)",
                        transition: "all 0.4s ease",
                      }}
                    >
                      {tool.svg ? (
                        <svg
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="text-app"
                          style={{ width: ic.size * 0.5, height: ic.size * 0.5 }}
                        >
                          <path d={tool.svg} />
                        </svg>
                      ) : (
                        <span
                          style={{
                            fontSize: Math.max(9, ic.size * 0.28),
                            fontWeight: 700,
                            color: "var(--text)",
                            letterSpacing: "-0.02em",
                            lineHeight: 1,
                            fontFamily: "system-ui, sans-serif",
                          }}
                        >
                          {tool.abbr}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Bottom label */}
        <div className="absolute bottom-6 left-0 right-0 z-30 text-center">
          <span className="text-[0.75rem] tracking-[0.05em] text-gray-400">
            Connecting 6,000+ tools
          </span>
        </div>
      </div>
    </section>
  );
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
