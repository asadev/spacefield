"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface XPToastProps {
  xp: number | null;
  badges?: string[];
}

export default function XPToast({ xp, badges = [] }: XPToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (xp && xp > 0) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [xp]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 border border-white/[0.12] bg-[#0a0a0a]/95 px-5 py-3 backdrop-blur-sm"
        >
          <span className="text-lg font-semibold text-white">+{xp} XP</span>
          {badges.length > 0 && (
            <span className="text-[0.6rem] uppercase tracking-[0.15em] text-amber-400">
              New badge!
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
