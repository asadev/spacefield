"use client";
import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import Link from "next/link";

interface BentoCardProps {
  title: string;
  description: string;
  href: string;
  label?: string;
  size?: "default" | "large" | "tall";
  accent?: boolean;
  children?: React.ReactNode;
  className?: string;
  delay?: number;
}

export default function BentoCard({ title, description, href, label, size = "default", accent = false, children, className = "", delay = 0 }: BentoCardProps) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });

  const sizeClasses = {
    default: "",
    large: "sm:col-span-2",
    tall: "sm:row-span-2",
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`${sizeClasses[size]} ${className}`}
    >
      <Link href={href} className="group block h-full">
        <div className={`relative flex h-full flex-col overflow-hidden rounded-lg border p-6 transition-all duration-300 ${
          accent
            ? "border-white/[0.14] bg-white/[0.06] hover:border-white/[0.22] hover:bg-white/[0.08]"
            : "border-white/[0.10] bg-white/[0.05] hover:border-white/[0.18] hover:bg-white/[0.07]"
        }`}>
          {/* Corner accents */}
          <span className="pointer-events-none absolute top-0 left-0 w-3 h-3 border-t border-l border-white/20" />
          <span className="pointer-events-none absolute top-0 right-0 w-3 h-3 border-t border-r border-white/20" />
          <span className="pointer-events-none absolute bottom-0 left-0 w-3 h-3 border-b border-l border-white/20" />
          <span className="pointer-events-none absolute bottom-0 right-0 w-3 h-3 border-b border-r border-white/20" />
          {/* Hover glow */}
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/[0.03] blur-3xl transition-all duration-500 group-hover:bg-white/[0.06]" />

          {label && (
            <span className="mb-3 inline-block w-fit rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-widest text-white/70">
              {label}
            </span>
          )}

          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-white/50">{description}</p>

          {children && <div className="mt-4">{children}</div>}

          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-white/60 transition-all duration-300 group-hover:text-white group-hover:gap-2.5">
            Explore <span aria-hidden>&rarr;</span>
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
