"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import XPToast from "@/components/XPToast";

interface XPToastContextType {
  showXPToast: (xp: number, badges?: string[]) => void;
}

const XPToastContext = createContext<XPToastContextType>({
  showXPToast: () => {},
});

export function useXPToast() {
  return useContext(XPToastContext);
}

export default function XPToastProvider({ children }: { children: ReactNode }) {
  const [xp, setXP] = useState<number | null>(null);
  const [badges, setBadges] = useState<string[]>([]);
  const [key, setKey] = useState(0);

  const showXPToast = useCallback((amount: number, newBadges: string[] = []) => {
    setXP(amount);
    setBadges(newBadges);
    setKey((k) => k + 1); // Force re-render to restart animation
  }, []);

  return (
    <XPToastContext.Provider value={{ showXPToast }}>
      {children}
      <XPToast key={key} xp={xp} badges={badges} />
    </XPToastContext.Provider>
  );
}
