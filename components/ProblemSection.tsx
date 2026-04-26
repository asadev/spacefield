"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import SectionLabel from "./ui/SectionLabel";
import TextReveal from "./ui/TextReveal";
import SystemLine from "./ui/SystemLine";
import ScanLine from "./ui/ScanLine";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

export default function ProblemSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.15 });

  return (
    <section ref={ref} className="relative py-[clamp(80px,12vw,160px)] overflow-hidden">
      {/* Scan line on section enter */}
      <ScanLine delay={0.2} />

      {/* Ambient glow — layered depth */}
      <div className="pointer-events-none absolute inset-0">
        <div className="gradient-blob-2 absolute top-1/2 left-0 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.02] blur-[120px]" />
        <div className="gradient-blob-3 absolute bottom-0 right-1/4 h-[250px] w-[250px] rounded-full bg-white/[0.015] blur-[80px]" />
      </div>

      <div className="relative mx-auto max-w-[1200px] px-6 lg:px-10">
        <div className="max-w-2xl">
          {/* Section label with system indicator */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, ease }}
            className="flex items-center gap-4"
          >
            <SectionLabel>The Real Problem</SectionLabel>
            <motion.span
              initial={{ scaleX: 0 }}
              animate={isInView ? { scaleX: 1 } : {}}
              transition={{ duration: 1, delay: 0.3, ease }}
              style={{ originX: 0 }}
              className="hidden h-px flex-1 bg-gradient-to-r from-white/15 to-transparent sm:block"
            />
          </motion.div>

          {/* Heading with word reveal */}
          <div className="mt-6">
            <TextReveal
              as="h2"
              className="text-[clamp(2rem,4vw,3.5rem)] font-bold leading-[1.15] tracking-[-0.01em] text-text-primary"
              delay={0.2}
              speed="fast"
            >
              Most Businesses Don&apos;t Have a Technology Problem
            </TextReveal>
          </div>

          {/* Opening statement */}
          <motion.div
            initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
            animate={isInView ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
            transition={{ duration: 0.7, delay: 0.5, ease }}
            className="mt-8 text-[clamp(1.05rem,1.4vw,1.2rem)] leading-[1.7] text-text-secondary"
          >
            <p>They have an operational problem.</p>
          </motion.div>

          {/* Pain points — system log style */}
          <div className="mt-6 space-y-3 text-[clamp(1.05rem,1.4vw,1.2rem)] leading-[1.7] text-text-secondary">
            <SystemLine index={0}>Leads are missed.</SystemLine>
            <SystemLine index={1}>Follow-ups are inconsistent.</SystemLine>
            <SystemLine index={2}>
              Data exists, but it&apos;s scattered across platforms.
            </SystemLine>
          </div>

          {/* Consequence block — glass panel */}
          <motion.div
            initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
            animate={isInView ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
            transition={{ duration: 0.8, delay: 0.9, ease }}
            className="mt-8 glass-panel rounded-sm px-6 py-5"
          >
            <div className="space-y-4 text-[clamp(1.05rem,1.4vw,1.2rem)] leading-[1.7] text-text-secondary">
              <p>
                Teams compensate with manual work — more messages, more
                spreadsheets, more effort.
              </p>
              <p>
                The result is not just inefficiency.
                <br />
                It&apos;s lost opportunities that are never even seen.
              </p>
            </div>
          </motion.div>

          {/* Transition line — gradient text with glow */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 1.2, ease }}
            className="mt-12 relative"
          >
            <p className="text-[clamp(1.05rem,1.4vw,1.2rem)] leading-[1.7] text-gradient italic">
              This is where AI systems change how the business operates.
            </p>
            {/* Subtle glow behind the line */}
            <div className="pointer-events-none absolute -inset-4 -z-10 rounded-lg bg-white/[0.02] blur-xl" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
