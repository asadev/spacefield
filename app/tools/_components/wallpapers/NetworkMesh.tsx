"use client";

/* NetworkMesh — drifting nodes that connect to nearby neighbors with
 * alpha-faded lines. Cursor acts as a mild gravity well that nodes
 * gravitate toward and connect to with brighter lines. */

import { useEffect, useRef } from "react";

interface Props {
  preview?: { w: number; h: number };
}

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export default function NetworkMesh({ preview }: Props) {
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
    const mouse = { x: -1000, y: -1000, tx: -1000, ty: -1000, active: false };

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const NODE_COUNT = preview ? 15 : 60;
    const MAX_DIST = preview ? 110 : 150;
    const MOUSE_DIST = 200;
    const nodes: Node[] = [];

    const seed = (n: number) => {
      const s = Math.sin(n * 9301 + 49297) * 233280;
      return s - Math.floor(s);
    };

    const buildNodes = () => {
      nodes.length = 0;
      for (let i = 0; i < NODE_COUNT; i++) {
        const speed = 0.015 + seed(i + 11) * 0.025;
        const ang = seed(i + 23) * Math.PI * 2;
        nodes.push({
          x: seed(i + 41) * cssW,
          y: seed(i + 53) * cssH,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          r: 1.6 + seed(i + 67) * 1.4,
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
      buildNodes();
    };

    resize();
    const ro = preview ? null : new ResizeObserver(resize);
    if (ro) ro.observe(canvas);

    const onMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.tx = e.clientX - rect.left;
      mouse.ty = e.clientY - rect.top;
      mouse.active = true;
    };
    const onLeave = () => {
      mouse.active = false;
      mouse.tx = -1000;
      mouse.ty = -1000;
    };
    if (!preview) {
      window.addEventListener("mousemove", onMouse);
      window.addEventListener("mouseout", onLeave);
    }

    const drawBg = () => {
      const g = ctx.createLinearGradient(0, 0, 0, cssH);
      g.addColorStop(0, "#0a0a14");
      g.addColorStop(1, "#060611");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cssW, cssH);
    };

    const drawNodesAndLinks = () => {
      // links first so they sit behind nodes
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > MAX_DIST * MAX_DIST) continue;
          const d = Math.sqrt(d2);
          const alpha = (1 - d / MAX_DIST) * 0.5;
          ctx.strokeStyle = `rgba(203,213,225,${alpha})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // mouse links
      if (mouse.active) {
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          const dx = a.x - mouse.x;
          const dy = a.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > MOUSE_DIST * MOUSE_DIST) continue;
          const d = Math.sqrt(d2);
          const alpha = (1 - d / MOUSE_DIST) * 0.7;
          ctx.strokeStyle = `rgba(165,243,252,${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }

      // nodes on top
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        ctx.fillStyle = "rgba(203,213,225,0.9)";
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (reduced) {
      drawBg();
      drawNodesAndLinks();
      return () => {
        ro?.disconnect();
        if (!preview) {
          window.removeEventListener("mousemove", onMouse);
          window.removeEventListener("mouseout", onLeave);
        }
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
      mouse.x += (mouse.tx - mouse.x) * 0.12;
      mouse.y += (mouse.ty - mouse.y) * 0.12;

      // physics step
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx * dt;
        n.y += n.vy * dt;

        // gentle gravity toward mouse if within range
        if (mouse.active) {
          const dx = mouse.x - n.x;
          const dy = mouse.y - n.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < MOUSE_DIST * MOUSE_DIST && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const pull = (1 - d / MOUSE_DIST) * 0.0008 * dt;
            n.vx += (dx / d) * pull;
            n.vy += (dy / d) * pull;
          }
        }

        // soft cap on velocity
        const v2 = n.vx * n.vx + n.vy * n.vy;
        const max = 0.06;
        if (v2 > max * max) {
          const v = Math.sqrt(v2);
          n.vx = (n.vx / v) * max;
          n.vy = (n.vy / v) * max;
        }

        // bounce
        if (n.x < 0) {
          n.x = 0;
          n.vx = Math.abs(n.vx);
        } else if (n.x > cssW) {
          n.x = cssW;
          n.vx = -Math.abs(n.vx);
        }
        if (n.y < 0) {
          n.y = 0;
          n.vy = Math.abs(n.vy);
        } else if (n.y > cssH) {
          n.y = cssH;
          n.vy = -Math.abs(n.vy);
        }
      }

      drawBg();
      drawNodesAndLinks();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      if (!preview) {
        window.removeEventListener("mousemove", onMouse);
        window.removeEventListener("mouseout", onLeave);
      }
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
