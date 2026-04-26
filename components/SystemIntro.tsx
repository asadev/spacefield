"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import SectionLabel from "./ui/SectionLabel";
import TextReveal from "./ui/TextReveal";
import ScanLine from "./ui/ScanLine";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

export default function SystemIntro() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section ref={ref} className="relative py-[clamp(80px,12vw,160px)] overflow-hidden">
      <ScanLine delay={0.1} />

      {/* Animated divider */}
      <div className="mx-auto max-w-[1200px] px-6 lg:px-10">
        <motion.div
          initial={{ scaleX: 0 }}
          animate={isInView ? { scaleX: 1 } : {}}
          transition={{ duration: 1, ease }}
          style={{ originX: 0 }}
          className="h-px w-full bg-gradient-to-r from-white/20 via-white/[0.06] to-transparent"
        />
      </div>

      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="gradient-blob-1 absolute top-0 right-1/4 h-[350px] w-[350px] rounded-full bg-white/[0.015] blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-[1200px] px-6 pt-[clamp(80px,12vw,160px)] lg:px-10">
        <div className="max-w-2xl">
          {/* Label with system connector */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, ease }}
            className="flex items-center gap-4"
          >
            <SectionLabel>The Approach</SectionLabel>
            <motion.span
              initial={{ scaleX: 0 }}
              animate={isInView ? { scaleX: 1 } : {}}
              transition={{ duration: 1, delay: 0.3, ease }}
              style={{ originX: 0 }}
              className="hidden h-px flex-1 bg-gradient-to-r from-white/15 to-transparent sm:block"
            />
          </motion.div>

          {/* Heading */}
          <div className="mt-6">
            <TextReveal
              as="h2"
              className="text-[clamp(2rem,4vw,3.5rem)] font-bold leading-[1.15] tracking-[-0.01em] text-text-primary"
              delay={0.15}
              speed="fast"
            >
              Not Tools. Systems.
            </TextReveal>
          </div>

          {/* Content — glass panel treatment */}
          <motion.div
            initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
            animate={isInView ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
            transition={{ duration: 0.8, delay: 0.5, ease }}
            className="mt-8 glass-panel rounded-sm px-6 py-5"
          >
            <div className="space-y-6 text-[clamp(1.05rem,1.4vw,1.2rem)] leading-[1.7] text-text-secondary">
              <p>
                I design interconnected AI systems that sit inside your
                operations — capturing signals, structuring data, and automating
                decisions.
              </p>
              <div className="h-px w-full bg-gradient-to-r from-border-subtle via-white/[0.06] to-transparent" />
              <p>
                Not adding more tools.
                <br />
                Replacing the need for manual work altogether.
              </p>
            </div>
          </motion.div>

          {/* System capability indicators */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 1, ease }}
            className="mt-8 flex flex-wrap gap-3"
          >
            {["Signal Capture", "Data Structuring", "Automated Decisions"].map(
              (label, i) => (
                <motion.span
                  key={label}
                  initial={{ opacity: 0, scale: 0.9, filter: "blur(4px)" }}
                  animate={
                    isInView
                      ? { opacity: 1, scale: 1, filter: "blur(0px)" }
                      : {}
                  }
                  transition={{ duration: 0.5, delay: 1.1 + i * 0.12, ease }}
                  className="hover-glow inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.06] px-4 py-1.5 text-xs font-medium tracking-wide text-text-muted transition-colors duration-300 hover:text-white hover:border-white/25"
                >
                  <span className="h-1 w-1 rounded-full bg-white/40" />
                  {label}
                </motion.span>
              )
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
