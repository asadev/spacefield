"use client";

/* Shared QR-code style preferences.
 *
 * The user picks their preferred QR style once in the QR code generator
 * (inside Format Converters). Those settings are then used everywhere
 * else: MintShareButton's QR display, any future "Show QR" flow, etc.
 *
 * Persisted in localStorage. Workspace-scoped persistence may come later;
 * for now, every workspace on the same browser shares the same style.
 */

import { useEffect, useState } from "react";

export type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

export interface QrPrefs {
  /** Foreground (dark module) color, e.g. "#0a0a0a". */
  dark: string;
  /** Background (light module) color, e.g. "#ffffff". */
  light: string;
  /** Error-correction level. Higher tolerates more occlusion (logo). */
  ecl: ErrorCorrectionLevel;
  /** Quiet-zone margin in modules. 0-10. */
  margin: number;
  /** Render width in pixels. */
  width: number;
  /** Optional embedded logo (data URL or remote URL). */
  logoUrl: string | null;
  /** Logo size as a fraction of QR width, 0.1-0.3. */
  logoScale: number;
  /** Padding (white frame) around the embedded logo, in pixels. */
  logoPadding: number;
}

export const DEFAULT_QR_PREFS: QrPrefs = {
  dark: "#0a0a0a",
  light: "#ffffff",
  ecl: "M",
  margin: 2,
  width: 320,
  logoUrl: null,
  logoScale: 0.18,
  logoPadding: 6,
};

const STORAGE_KEY = "spacefield:qrPrefs:v1";

function loadFromStorage(): QrPrefs {
  if (typeof window === "undefined") return DEFAULT_QR_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_QR_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_QR_PREFS, ...parsed };
  } catch {
    return DEFAULT_QR_PREFS;
  }
}

function saveToStorage(p: QrPrefs) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    // Notify other components in the same tab
    window.dispatchEvent(new CustomEvent("spacefield:qrPrefs", { detail: p }));
  } catch {
    // ignore quota / private mode
  }
}

/* React hook — returns current prefs + a setter. Subscribes to storage
 * events so changes in one component (e.g. the QR generator) flow into
 * any other component using QR (e.g. MintShareButton). */
export function useQrPrefs(): [QrPrefs, (next: Partial<QrPrefs>) => void, () => void] {
  const [prefs, setPrefs] = useState<QrPrefs>(DEFAULT_QR_PREFS);

  useEffect(() => {
    setPrefs(loadFromStorage());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPrefs(loadFromStorage());
    };
    const onLocal = (e: Event) => {
      const ce = e as CustomEvent<QrPrefs>;
      if (ce.detail) setPrefs(ce.detail);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("spacefield:qrPrefs", onLocal as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("spacefield:qrPrefs", onLocal as EventListener);
    };
  }, []);

  function update(patch: Partial<QrPrefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveToStorage(next);
      return next;
    });
  }

  function reset() {
    setPrefs(DEFAULT_QR_PREFS);
    saveToStorage(DEFAULT_QR_PREFS);
  }

  return [prefs, update, reset];
}

/* Plain getter for non-hook contexts. */
export function getQrPrefs(): QrPrefs {
  return loadFromStorage();
}
