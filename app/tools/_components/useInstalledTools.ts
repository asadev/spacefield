"use client";

import { useCallback, useEffect, useState } from "react";
import { TOOLS } from "../_data/tools-list";
import { useWorkspaceKey } from "./useWorkspaces";

const STORAGE_SUFFIX = "tools-desktop-install-v1";

interface InstallState {
  onboarded: boolean;
  profession: string | null;
  installed: string[];
}

const DEFAULT_STATE: InstallState = {
  onboarded: false,
  profession: null,
  installed: [],
};

function load(storageKey: string): InstallState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return {
          onboarded: !!parsed.onboarded,
          profession: parsed.profession ?? null,
          installed: Array.isArray(parsed.installed) ? parsed.installed : [],
        };
      }
    }
  } catch {}
  return DEFAULT_STATE;
}

function save(storageKey: string, state: InstallState) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {}
}

export function useInstalledTools() {
  const STORAGE_KEY = useWorkspaceKey(STORAGE_SUFFIX);
  const [state, setState] = useState<InstallState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(load(STORAGE_KEY));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((next: InstallState) => {
    setState(next);
    save(STORAGE_KEY, next);
  }, [STORAGE_KEY]);

  const install = useCallback((slug: string) => {
    setState((prev) => {
      if (prev.installed.includes(slug)) return prev;
      const next = { ...prev, installed: [...prev.installed, slug] };
      save(STORAGE_KEY, next);
      return next;
    });
  }, [STORAGE_KEY]);

  const uninstall = useCallback((slug: string) => {
    setState((prev) => {
      if (!prev.installed.includes(slug)) return prev;
      const next = {
        ...prev,
        installed: prev.installed.filter((s) => s !== slug),
      };
      save(STORAGE_KEY, next);
      return next;
    });
  }, [STORAGE_KEY]);

  const completeOnboarding = useCallback(
    (profession: string, installed: string[]) => {
      const next: InstallState = { onboarded: true, profession, installed };
      setState(next);
      save(STORAGE_KEY, next);
    },
    [STORAGE_KEY]
  );

  const resetOnboarding = useCallback(() => {
    update(DEFAULT_STATE);
  }, [update]);

  const isInstalled = useCallback(
    (slug: string) => state.installed.includes(slug),
    [state.installed]
  );

  // Convenience: the tool list filtered to installed
  const installedTools = TOOLS.filter((t) => state.installed.includes(t.slug));

  return {
    hydrated,
    onboarded: state.onboarded,
    profession: state.profession,
    installed: state.installed,
    installedTools,
    isInstalled,
    install,
    uninstall,
    completeOnboarding,
    resetOnboarding,
  };
}
