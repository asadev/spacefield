"use client";

import { motion } from "framer-motion";

export interface AppInfo {
  name: string;
  abbr: string;
  label: string;
  svg?: string;
}

interface AppNodeProps {
  app: AppInfo;
  x: number;
  y: number;
  size?: number;
  isHovered: boolean;
  onHover: (hovered: boolean) => void;
}

export default function AppNode({
  app,
  x,
  y,
  size = 44,
  isHovered,
  onHover,
}: AppNodeProps) {
  return (
    <motion.div
      className="absolute flex flex-col items-center gap-2"
      style={{
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        zIndex: isHovered ? 20 : 10,
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      animate={{
        scale: isHovered ? 1.15 : 1,
        filter: isHovered ? "brightness(1.5)" : "brightness(1)",
      }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      {/* Icon circle */}
      <div
        className="relative flex items-center justify-center rounded-full border transition-all duration-300"
        style={{
          width: size,
          height: size,
          borderColor: isHovered
            ? "color-mix(in srgb, var(--text) 35%, transparent)"
            : "color-mix(in srgb, var(--text) 15%, transparent)",
          background: isHovered
            ? "color-mix(in srgb, var(--text) 10%, transparent)"
            : "color-mix(in srgb, var(--text) 5%, transparent)",
          boxShadow: isHovered
            ? "var(--shadow-md)"
            : "none",
        }}
      >
        {app.svg ? (
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-app transition-opacity duration-300"
            style={{
              width: size * 0.45,
              height: size * 0.45,
              opacity: isHovered ? 0.95 : 0.65,
            }}
          >
            <path d={app.svg} />
          </svg>
        ) : (
          <span
            className="font-semibold tracking-wider transition-opacity duration-300"
            style={{
              fontSize: size * 0.3,
              opacity: isHovered ? 0.95 : 0.65,
              color: "var(--text)",
            }}
          >
            {app.abbr}
          </span>
        )}
      </div>

      {/* Tooltip label */}
      <motion.div
        initial={false}
        animate={{
          opacity: isHovered ? 1 : 0,
          y: isHovered ? 0 : 4,
          scale: isHovered ? 1 : 0.95,
        }}
        transition={{ duration: 0.2 }}
        className="pointer-events-none absolute whitespace-nowrap"
        style={{ top: size + 8 }}
      >
        <div className="rounded-sm border border-app bg-app-elevated/90 px-2.5 py-1 backdrop-blur-sm">
          <p className="text-[0.6rem] font-medium uppercase tracking-[0.15em] text-secondary">
            {app.label}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
