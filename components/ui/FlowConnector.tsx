"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

export default function FlowConnector() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <div
      ref={ref}
      className="relative mx-auto flex h-24 w-full max-w-[1200px] items-center justify-start px-6 lg:px-10"
    >
      {/* Vertical flow line */}
      <div className="relative ml-[2px] flex h-full flex-col items-center">
        <motion.div
          initial={{ scaleY: 0 }}
          animate={isInView ? { scaleY: 1 } : { scaleY: 0 }}
          transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{ originY: 0 }}
          className="h-full w-px bg-gradient-to-b from-white/20 via-white/10 to-transparent"
        />

        {/* Traveling pulse */}
        {isInView && (
          <motion.div
            initial={{ top: 0, opacity: 0 }}
            animate={{ top: "100%", opacity: [0, 1, 1, 0] }}
            transition={{
              duration: 1.5,
              delay: 0.4,
              repeat: Infinity,
              repeatDelay: 3,
              ease: "easeInOut",
            }}
            className="absolute left-1/2 h-6 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/40 to-transparent"
          />
        )}
      </div>
    </div>
  );
}
