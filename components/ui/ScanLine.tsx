"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

interface ScanLineProps {
  delay?: number;
}

export default function ScanLine({ delay = 0 }: ScanLineProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden">
      {isInView && (
        <motion.div
          initial={{ top: "-2px" }}
          animate={{ top: "100%" }}
          transition={{
            duration: 2,
            delay,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          className="absolute inset-x-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(99,102,241,0.2) 20%, rgba(129,140,248,0.35) 50%, rgba(99,102,241,0.2) 80%, transparent)",
          }}
        />
      )}
    </div>
  );
}
