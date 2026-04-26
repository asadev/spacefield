"use client";
import { useRef } from "react";
import { motion, useInView } from "framer-motion";

export default function StatCard({ label, value, change, icon }: { label: string; value: string; change?: string; icon?: React.ReactNode }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const isPositive = change?.startsWith("+");

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="group relative overflow-hidden rounded-lg border border-white/[0.10] bg-white/[0.05] p-5 transition-all duration-300 hover:border-white/[0.20] hover:bg-white/[0.07]"
    >
      <span className="pointer-events-none absolute top-0 left-0 w-3 h-3 border-t border-l border-white/20" />
      <span className="pointer-events-none absolute top-0 right-0 w-3 h-3 border-t border-r border-white/20" />
      <span className="pointer-events-none absolute bottom-0 left-0 w-3 h-3 border-b border-l border-white/20" />
      <span className="pointer-events-none absolute bottom-0 right-0 w-3 h-3 border-b border-r border-white/20" />
      <div className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/[0.03] blur-2xl transition-all duration-500 group-hover:bg-white/[0.05]" />
      <p className="text-xs font-medium uppercase tracking-widest text-white/40">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</p>
      {change && (
        <span className={`mt-1 inline-block text-sm font-medium ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
          {change}
        </span>
      )}
    </motion.div>
  );
}
