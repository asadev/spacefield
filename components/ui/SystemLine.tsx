"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

interface SystemLineProps {
  children: string;
  index?: number;
  indicator?: boolean;
}

export default function SystemLine({
  children,
  index = 0,
  indicator = true,
}: SystemLineProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.8 });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -16, filter: "blur(4px)" }}
      animate={
        isInView
          ? { opacity: 1, x: 0, filter: "blur(0px)" }
          : {}
      }
      transition={{
        duration: 0.6,
        delay: index * 0.12,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className="flex items-start gap-3 group"
    >
      {indicator && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={isInView ? { scale: 1, opacity: 1 } : {}}
          transition={{
            duration: 0.3,
            delay: index * 0.12 + 0.2,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          className="mt-[10px] flex h-1.5 w-1.5 shrink-0 items-center justify-center"
        >
          <span className="block h-1.5 w-1.5 rounded-full bg-white/40 transition-colors duration-500 group-hover:bg-white/70 group-hover:shadow-[0_0_8px_rgba(255,255,255,0.2)]" />
        </motion.span>
      )}
      <p>{children}</p>
    </motion.div>
  );
}
