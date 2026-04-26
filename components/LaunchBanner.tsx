"use client";

import { motion } from "framer-motion";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

export function LaunchBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease }}
      className="rounded-lg border border-white/[0.10] bg-white/[0.05] p-5 sm:p-6"
    >
      <p className="text-sm leading-relaxed text-gray-300">
        Professional-grade tools built for the Dubai market. Calculators, analytics, market intelligence, and more
        — designed for investors, agents, and brokerages.
      </p>
    </motion.div>
  );
}

export function TopRatedBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/25 bg-amber-500/[0.12] px-2.5 py-1 text-[0.6rem] font-medium uppercase tracking-[0.1em] text-amber-300">
      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 0 0-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 0 0 .951-.69l1.07-3.292Z" />
      </svg>
      Top Rated
    </span>
  );
}
