"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import InteractiveGrid from "./ui/InteractiveGrid";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

const container = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.2, delayChildren: 0.6 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 1, ease },
  },
};

const lineExpand = {
  hidden: { scaleX: 0 },
  visible: {
    scaleX: 1,
    transition: { duration: 1.2, delay: 1.4, ease },
  },
};

export default function Hero() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const contentY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const gridOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section
      ref={ref}
      className="grain relative flex min-h-[85vh] md:min-h-screen items-center justify-center overflow-hidden"
    >
      {/* Interactive dot grid background */}
      <motion.div className="absolute inset-0" style={{ opacity: gridOpacity }}>
        <InteractiveGrid />
      </motion.div>

      {/* Radial vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 50%, transparent 0%, color-mix(in srgb, var(--edge-fade) 60%, transparent) 70%, var(--edge-fade) 100%)",
        }}
      />

      {/* Content */}
      <motion.div
        className="relative z-10 text-center"
        style={{ y: contentY, opacity: contentOpacity }}
      >
        <motion.div
          variants={container}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center"
        >
          {/* Title */}
          <motion.h1
            variants={item}
            className="text-[clamp(2rem,5.6vw,4.8rem)] font-bold leading-[1] tracking-[-0.03em] text-white"
          >
            AI Systems Architect
          </motion.h1>

          {/* Tagline */}
          <motion.p
            variants={item}
            className="mt-2 text-center text-base tracking-wide text-gray-300"
          >
            Designing operational intelligence for real estate.
          </motion.p>

          {/* Divider line */}
          <motion.div
            variants={lineExpand}
            style={{ originX: 0.5 }}
            className="my-3 h-px w-24 bg-gradient-to-r from-transparent via-white/40 to-transparent"
          />
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.5, duration: 1 }}
        className="absolute bottom-16 md:bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2"
      >
        <span className="text-[0.55rem] uppercase tracking-[0.3em] text-gray-300">
          Scroll
        </span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          className="h-6 w-px bg-gradient-to-b from-white/40 to-transparent"
        />
      </motion.div>

      {/* Bottom fade */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />
    </section>
  );
}
