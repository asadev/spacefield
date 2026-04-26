"use client";

import { motion } from "framer-motion";
import SectionLabel from "@/components/ui/SectionLabel";
import TextReveal from "@/components/ui/TextReveal";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

const glowColors: Record<string, string> = {
  default: "bg-white/[0.03]",
  purple: "bg-purple-500/[0.04]",
  blue: "bg-blue-500/[0.04]",
  emerald: "bg-emerald-500/[0.04]",
  amber: "bg-amber-500/[0.04]",
  rose: "bg-rose-500/[0.04]",
};

const lineColors: Record<string, string> = {
  default: "from-white/15",
  purple: "from-purple-400/20",
  blue: "from-blue-400/20",
  emerald: "from-emerald-400/20",
  amber: "from-amber-400/20",
  rose: "from-rose-400/20",
};

interface PageHeaderProps {
  label: string;
  title: string;
  description?: string;
  color?: "default" | "purple" | "blue" | "emerald" | "amber" | "rose";
}

export default function PageHeader({ label, title, description, color = "default" }: PageHeaderProps) {
  return (
    <section className="relative pt-32 pb-16 overflow-hidden lg:pt-40 lg:pb-24">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className={`absolute top-0 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full ${glowColors[color]} blur-[100px]`} />
      </div>

      <div className="relative mx-auto max-w-[1200px] px-6 lg:px-10">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease }}
          className="flex items-center gap-4"
        >
          <SectionLabel color={color}>{label}</SectionLabel>
          <motion.span
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1, delay: 0.3, ease }}
            style={{ originX: 0 }}
            className={`hidden h-px flex-1 bg-gradient-to-r ${lineColors[color]} to-transparent sm:block`}
          />
        </motion.div>

        <div className="mt-6">
          <TextReveal
            as="h1"
            className="text-[clamp(2.5rem,5vw,4rem)] font-bold leading-[1.1] tracking-[-0.02em] text-app"
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
            className="mt-6 max-w-2xl text-[clamp(1rem,1.3vw,1.15rem)] leading-[1.7] text-secondary"
          >
            {description}
          </motion.p>
        )}
      </div>
    </section>
  );
}
