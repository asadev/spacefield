"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import SectionLabel from "./ui/SectionLabel";
import TextReveal from "./ui/TextReveal";
import NeuralCore from "./ui/NeuralCore";
import ToolOrbit from "./ui/ToolOrbit";

export default function ToolEcosystem() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const targetPositions = useRef<{ x: number; y: number }[]>([]);
  const [hitIndices, setHitIndices] = useState<Set<number>>(new Set());
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [breakpoint, setBreakpoint] = useState<"mobile" | "tablet" | "desktop">(
    "desktop"
  );

  const hitTimeouts = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const handleLightningHit = useCallback((index: number) => {
    setHitIndices((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });

    // Clear previous timeout for this index
    const existing = hitTimeouts.current.get(index);
    if (existing) clearTimeout(existing);

    const timeout = setTimeout(() => {
      setHitIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      hitTimeouts.current.delete(index);
    }, 400);

    hitTimeouts.current.set(index, timeout);
  }, []);

  useEffect(() => {
    const updateSize = () => {
      const section = sectionRef.current;
      if (!section) return;

      const w = section.clientWidth;
      const h = section.clientHeight;
      setDimensions({ width: w, height: h });

      const vw = window.innerWidth;
      if (vw < 768) setBreakpoint("mobile");
      else if (vw < 1024) setBreakpoint("tablet");
      else setBreakpoint("desktop");
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Cleanup hit timeouts
  useEffect(() => {
    return () => {
      hitTimeouts.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const isMobile = breakpoint === "mobile";
  const isTablet = breakpoint === "tablet";

  return (
    <section
      className={`relative overflow-hidden ${isMobile ? "min-h-[60vh]" : "min-h-[80vh]"}`}
    >
      <div className="mx-auto max-w-[1200px] px-6 lg:px-10">
        {/* Text content */}
        <div
          className={`relative z-10 ${isMobile ? "mb-8 text-center" : "mb-0 pt-20"}`}
        >
          <div className={`${isMobile ? "" : "mb-6"}`}>
            <SectionLabel>Ecosystem</SectionLabel>
          </div>
          <TextReveal
            as="h2"
            className="mt-4 text-[clamp(1.8rem,4vw,3.2rem)] font-bold leading-[1.1] tracking-[-0.02em] text-white"
          >
            One Brain. Every Tool.
          </TextReveal>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-gray-200">
            Connected to 90+ platforms. Orchestrated by AI.
          </p>
        </div>

        {/* Orbit visualization */}
        <div
          ref={sectionRef}
          className={`relative ${isMobile ? "mx-auto h-[350px] w-[350px]" : isTablet ? "mx-auto h-[600px] w-full" : "mx-auto h-[800px] w-full"}`}
        >
          {dimensions.width > 0 && (
            <>
              <NeuralCore
                width={dimensions.width}
                height={dimensions.height}
                targetPositions={targetPositions}
                onLightningHit={handleLightningHit}
                isMobile={isMobile}
              />
              <ToolOrbit
                width={dimensions.width}
                height={dimensions.height}
                targetPositions={targetPositions}
                hitIndices={hitIndices}
                isMobile={isMobile}
                isTablet={isTablet}
              />
              {/* Brain SVG at center — sits above the NeuralCore canvas */}
              <div
                className="pointer-events-none absolute"
                style={{
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  zIndex: 10,
                }}
              >
                {/* Glow halo behind the brain */}
                <div
                  style={{
                    position: "absolute",
                    inset: "-20px",
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle, color-mix(in srgb, var(--text) 12%, transparent) 0%, color-mix(in srgb, var(--text) 4%, transparent) 50%, transparent 70%)",
                    filter: "blur(12px)",
                  }}
                />
                {/* Brain image with float animation */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brain.svg"
                  alt="AI Brain"
                  className="brain-float relative"
                  style={{
                    width: isMobile ? "42px" : isTablet ? "51px" : "60px",
                    height: isMobile ? "42px" : isTablet ? "51px" : "60px",
                    objectFit: "contain",
                    filter:
                      "drop-shadow(0 0 24px color-mix(in srgb, var(--text) 25%, transparent)) drop-shadow(0 0 8px color-mix(in srgb, var(--text) 15%, transparent))",
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
