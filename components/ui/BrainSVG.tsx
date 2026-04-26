"use client";

import Image from "next/image";
import { motion } from "framer-motion";

interface BrainSVGProps {
  size?: number;
  opacity?: number;
  scale?: number;
}

export default function BrainSVG({
  size = 120,
  opacity = 1,
  scale = 1,
}: BrainSVGProps) {
  return (
    <motion.div
      className="relative flex items-center justify-center"
      style={{ opacity, scale }}
      animate={{ y: [0, -2, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* Subtle glow underneath */}
      <div
        className="absolute"
        style={{
          width: size * 1.5,
          height: size * 0.3,
          bottom: -size * 0.15,
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(80,150,255,0.08) 0%, transparent 70%)",
        }}
      />

      {/* Brain PNG with transparent background */}
      <Image
        src="/brain.png"
        alt=""
        width={size}
        height={size}
        style={{
          width: size,
          height: "auto",
          filter: "drop-shadow(0 0 15px rgba(100,180,255,0.15))",
          pointerEvents: "none",
        }}
      />
    </motion.div>
  );
}
