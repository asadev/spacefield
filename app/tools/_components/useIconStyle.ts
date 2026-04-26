"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_ICON_STYLE,
  isIconStyle,
  type IconStyleId,
} from "./icon-styles";
import { useWorkspaceKey } from "./useWorkspaces";

const STORAGE_SUFFIX = "tools-desktop-icon-style-v1";
const EVENT_NAME = "tools-desktop-icon-style-change";

function load(storageKey: string): IconStyleId {
  if (typeof window === "undefined") return DEFAULT_ICON_STYLE;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw && isIconStyle(raw)) return raw;
  } catch {}
  return DEFAULT_ICON_STYLE;
}

function save(storageKey: string, style: IconStyleId) {
  try {
    localStorage.setItem(storageKey, style);
  } catch {}
  // Fire a same-tab custom event so every Dock/Launchpad/picker that's
  // mounted updates instantly, without each consumer needing a context.
  // localStorage's "storage" event only fires cross-tab — useless here.
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<IconStyleId>(EVENT_NAME, { detail: style })
    );
  }
}

/**
 * Hook to read/write the user's icon-style preference. SSR-safe — returns the
 * default until `hydrated` is true so the server-rendered markup matches the
 * first client render. After hydration the localStorage value is applied.
 *
 * Cross-component sync: writes dispatch a `tools-desktop-icon-style-change`
 * custom event; every other instance of this hook listens for it and updates
 * in-place. No context provider needed.
 */
export function useIconStyle() {
  const STORAGE_KEY = useWorkspaceKey(STORAGE_SUFFIX);
  const [style, setStyleState] = useState<IconStyleId>(DEFAULT_ICON_STYLE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setStyleState(load(STORAGE_KEY));
    setHydrated(true);

    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<IconStyleId>).detail;
      if (isIconStyle(detail)) setStyleState(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = e.newValue;
      if (next && isIconStyle(next)) setStyleState(next);
      else if (!next) setStyleState(DEFAULT_ICON_STYLE);
    };

    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStyle = useCallback((next: IconStyleId) => {
    setStyleState(next);
    save(STORAGE_KEY, next);
  }, [STORAGE_KEY]);

  return { style, setStyle, hydrated };
}
