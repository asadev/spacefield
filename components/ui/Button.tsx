"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "outline";
  href?: string;
}

export default function Button({
  children,
  variant = "primary",
  href = "#",
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center px-7 py-3.5 text-sm font-medium tracking-wide uppercase rounded-none cursor-pointer transition-colors";

  const variants = {
    primary: "btn-primary",
    outline: "btn-outline text-secondary",
  };

  return (
    <motion.a
      href={href}
      className={`${base} ${variants[variant]}`}
      whileHover={
        variant === "primary"
          ? {
              scale: 1.03,
              boxShadow: "var(--shadow-lg)",
            }
          : {
              scale: 1.03,
              boxShadow: "var(--shadow-md)",
            }
      }
      whileTap={{ scale: 0.98 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 25,
      }}
    >
      {children}
    </motion.a>
  );
}
