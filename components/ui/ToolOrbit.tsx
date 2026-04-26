"use client";

import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { tools, type Tool } from "@/lib/tools-data";
import ToolIcon from "./ToolIcon";

interface OrbitItem {
  tool: Tool;
  ring: number;
  angleOffset: number;
  speed: number;
  floatPhase: number;
  floatAmp: number;
  size: number;
  opacity: number;
}

interface ToolOrbitProps {
  width: number;
  height: number;
  targetPositions: React.MutableRefObject<{ x: number; y: number }[]>;
  hitIndices: Set<number>;
  isMobile?: boolean;
  isTablet?: boolean;
}

function getResponsiveConfig(isMobile: boolean, isTablet: boolean) {
  if (isMobile) {
    return {
      iconCount: 38,
      ringCount: 3,
      radii: [100, 145, 185],
      baseSizes: [30, 26, 22],
      baseOpacities: [0.5, 0.35, 0.2],
      speedScale: 0.6,
    };
  }
  if (isTablet) {
    return {
      iconCount: 60,
      ringCount: 4,
      radii: [130, 190, 250, 300],
      baseSizes: [36, 32, 28, 24],
      baseOpacities: [0.55, 0.45, 0.3, 0.2],
      speedScale: 0.8,
    };
  }
  return {
    iconCount: 90,
    ringCount: 5,
    radii: [120, 180, 250, 320, 390],
    baseSizes: [40, 36, 32, 28, 24],
    baseOpacities: [0.6, 0.5, 0.4, 0.25, 0.15],
    speedScale: 1,
  };
}

export default function ToolOrbit({
  width,
  height,
  targetPositions,
  hitIndices,
  isMobile = false,
  isTablet = false,
}: ToolOrbitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iconRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number>(0);
  const visibleRef = useRef(true);
  const lastFrameRef = useRef(0);
  const animateRef = useRef<() => void>(() => {});

  const config = useMemo(
    () => getResponsiveConfig(isMobile, isTablet),
    [isMobile, isTablet]
  );

  // Random seeds generated once (lazy init) so the useMemo below stays pure.
  const [randoms] = useState<Array<{ s: number; p: number; a: number }>>(
    () =>
      Array.from({ length: tools.length }, () => ({
        s: Math.random(),
        p: Math.random(),
        a: Math.random(),
      }))
  );

  const orbitItems = useMemo<OrbitItem[]>(() => {
    const itemCount = Math.min(config.iconCount, tools.length);
    const selectedTools = tools.slice(0, itemCount);
    const items: OrbitItem[] = [];

    // Distribute icons across rings
    const perRing = Math.ceil(itemCount / config.ringCount);

    selectedTools.forEach((tool, i) => {
      const ring = Math.min(Math.floor(i / perRing), config.ringCount - 1);
      const indexInRing = i - ring * perRing;
      const countInRing =
        ring < config.ringCount - 1
          ? perRing
          : itemCount - ring * perRing;
      const r = randoms[i];

      items.push({
        tool,
        ring,
        angleOffset: (indexInRing / countInRing) * Math.PI * 2,
        speed:
          (0.15 + r.s * 0.1) *
          (1 / (ring + 1)) *
          config.speedScale,
        floatPhase: r.p * Math.PI * 2,
        floatAmp: 3 + r.a * 5,
        size: config.baseSizes[ring],
        opacity: config.baseOpacities[ring],
      });
    });

    return items;
  }, [config, randoms]);

  const FRAME_INTERVAL = isMobile ? 1000 / 30 : 0;

  const animate = useCallback(() => {
    if (!visibleRef.current) {
      rafRef.current = requestAnimationFrame(() => animateRef.current());
      return;
    }

    const now = performance.now();
    if (FRAME_INTERVAL > 0 && now - lastFrameRef.current < FRAME_INTERVAL) {
      rafRef.current = requestAnimationFrame(() => animateRef.current());
      return;
    }
    lastFrameRef.current = now;

    const t = now / 1000;
    const cx = width / 2;
    const cy = height / 2;
    const positions: { x: number; y: number }[] = [];

    for (let i = 0; i < orbitItems.length; i++) {
      const item = orbitItems[i];
      const el = iconRefs.current[i];
      if (!el) continue;

      const r = config.radii[item.ring];
      const angle = item.angleOffset + t * item.speed;
      const x = cx + r * Math.cos(angle);
      const y =
        cy +
        r * Math.sin(angle) +
        Math.sin(t * 0.5 + item.floatPhase) * item.floatAmp;

      positions.push({ x, y });

      const isHit = hitIndices.has(i);
      const scale = isHit ? 1.15 : 1;

      el.style.transform = `translate(${x - item.size / 2}px, ${y - item.size / 2}px) scale(${scale})`;
    }

    targetPositions.current = positions;
    rafRef.current = requestAnimationFrame(() => animateRef.current());
  }, [
    width,
    height,
    orbitItems,
    config.radii,
    hitIndices,
    targetPositions,
    FRAME_INTERVAL,
  ]);

  // Keep animateRef in sync for the rAF self-loop.
  useEffect(() => {
    animateRef.current = animate;
  }, [animate]);

  // IntersectionObserver to pause off-screen
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
      },
      { threshold: 0.05 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Animation loop
  useEffect(() => {
    if (width === 0 || height === 0) return;
    rafRef.current = requestAnimationFrame(() => animateRef.current());
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate, width, height]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ width, height }}
    >
      {orbitItems.map((item, i) => (
        <div
          key={`${item.tool.name}-${i}`}
          ref={(el) => {
            iconRefs.current[i] = el;
          }}
          className="absolute left-0 top-0 transition-[scale] duration-300"
          style={{ willChange: "transform" }}
        >
          <ToolIcon
            tool={item.tool}
            size={item.size}
            opacity={item.opacity}
          />
        </div>
      ))}
    </div>
  );
}
