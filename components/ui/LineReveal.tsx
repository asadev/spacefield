"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

interface LineRevealProps {
  children: string;
  className?: string;
  delay?: number;
  index?: number;
}

export default function LineReveal({
  children,
  className = "",
  delay = 0,
  index = 0,
}: LineRevealProps) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.8 });

  return (
    <div ref={ref} className="overflow-hidden">
      <motion.p
        className={className}
        initial={{ y: "100%", opacity: 0 }}
        animate={inView ? { y: "0%", opacity: 1 } : {}}
        transition={{
          duration: 0.7,
          delay: delay + index * 0.15,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
      >
        {children}
      </motion.p>
    </div>
  );
}
