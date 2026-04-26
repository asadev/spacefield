"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

export default function TrustStrip() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });

  const words =
    "Real systems built inside live business environments — not theoretical AI solutions.".split(
      " "
    );

  return (
    <section
      ref={ref}
      className="relative overflow-hidden border-y border-border-subtle bg-background-secondary"
    >
      {/* Data stream line */}
      {isInView && (
        <motion.div
          initial={{ left: "-20%" }}
          animate={{ left: "120%" }}
          transition={{ duration: 2.5, delay: 0.3, ease: "easeInOut" }}
          className="pointer-events-none absolute top-0 h-px w-1/4"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(99,102,241,0.3), transparent)",
          }}
        />
      )}

      <div className="mx-auto max-w-[1200px] px-6 py-6 lg:px-10">
        <p className="text-center text-sm italic tracking-wide text-text-muted">
          {words.map((word, i) => (
            <span key={i} className="inline-block overflow-hidden">
              <motion.span
                className="inline-block"
                initial={{ y: "110%", opacity: 0 }}
                animate={
                  isInView
                    ? { y: "0%", opacity: 1 }
                    : {}
                }
                transition={{
                  duration: 0.4,
                  delay: i * 0.03,
                  ease,
                }}
              >
                {word}
              </motion.span>
              {i < words.length - 1 && "\u00A0"}
            </span>
          ))}
        </p>
      </div>

      {/* Bottom data stream */}
      {isInView && (
        <motion.div
          initial={{ right: "-20%" }}
          animate={{ right: "120%" }}
          transition={{ duration: 2.5, delay: 0.6, ease: "easeInOut" }}
          className="pointer-events-none absolute bottom-0 h-px w-1/4"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(99,102,241,0.2), transparent)",
          }}
        />
      )}
    </section>
  );
}
