"use client";

import { motion } from "framer-motion";
import TextReveal from "@/components/ui/TextReveal";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

interface SolutionsHeaderProps {
  label: string;
  title: string;
  description?: string;
}

// Violet-accented page header for the /solutions section.
// Distinct from the real-estate PageHeader to keep visual identity separate.
export default function SolutionsHeader({ label, title, description }: SolutionsHeaderProps) {
  return (
    <section className="relative pt-32 pb-16 overflow-hidden lg:pt-40 lg:pb-24">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-violet-500/[0.05] blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-[1200px] px-6 lg:px-10">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease }}
          className="flex items-center gap-4"
        >
          <span className="inline-flex items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.2em] text-violet-300/75">
            <span className="flex items-center gap-1.5">
              <span className="block h-1.5 w-1.5 rounded-full bg-violet-400/75" />
              <span className="block h-px w-5 bg-violet-400/35" />
            </span>
            {label}
          </span>
          <motion.span
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1, delay: 0.3, ease }}
            style={{ originX: 0 }}
            className="hidden h-px flex-1 bg-gradient-to-r from-violet-400/25 to-transparent sm:block"
          />
        </motion.div>

        <div className="mt-6">
          <TextReveal
            as="h1"
            className="text-[clamp(2.5rem,5vw,4rem)] font-bold leading-[1.1] tracking-[-0.02em] text-white"
            delay={0.15}
            speed="fast"
          >
            {title}
          </TextReveal>
        </div>

        {description && (
          <motion.p
            initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, delay: 0.5, ease }}
            className="mt-6 max-w-2xl text-[clamp(1rem,1.3vw,1.15rem)] leading-[1.7] text-gray-300"
          >
            {description}
          </motion.p>
        )}
      </div>
    </section>
  );
}
