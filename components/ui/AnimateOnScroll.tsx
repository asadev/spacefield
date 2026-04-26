"use client";

import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

interface AnimateOnScrollProps {
  children: ReactNode;
  variants?: Variants;
  className?: string;
  amount?: number;
  margin?: string;
}

export default function AnimateOnScroll({
  children,
  variants,
  className,
  amount = 0.2,
  margin = "-60px",
}: AnimateOnScrollProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount, margin }}
      variants={variants}
      className={className}
    >
      {children}
    </motion.div>
  );
}
