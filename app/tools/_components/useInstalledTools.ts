"use client";

import { useCallback, useEffect, useState } from "react";
import { TOOLS } from "../_data/tools-list";
import { useWorkspaceKey, useWorkspaces } from "./useWorkspaces";

const STORAGE_SUFFIX = "tools-desktop-install-v1";

type ToolAvailability =
  | "allowed"
  | "disabled"
  | "tier_locked"
  | "workspace_blocked";

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

/**
 * Server-side gate before mutating local install state. Returns the
 * canonical availability string so the UI can react (toast / route to
 * pricing / silently no-op). Falls back to "allowed" on transport
 * errors — the same RPC is enforced at the tool runtime layer, so a
 * stale or offline client can't actually use a forbidden tool.
 */
async function checkAvailability(
  workspaceId: string,
  slug: string
): Promise<ToolAvailability> {
  if (!workspaceId) return "allowed";
  try {
    const r = await fetch("/api/tools/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, slugs: [slug] }),
    });
    if (!r.ok) return "allowed";
    const j = (await r.json()) as {
      availability?: Record<string, ToolAvailability>;
    };
    const v = j.availability?.[slug];
    return v === "disabled" ||
      v === "tier_locked" ||
      v === "workspace_blocked" ||
      v === "allowed"
      ? v
      : "allowed";
  } catch {
    return "allowed";
  }
}

export function useInstalledTools() {
  const STORAGE_KEY = useWorkspaceKey(STORAGE_SUFFIX);
  const { activeId } = useWorkspaces();
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

  // Install applies the local state mutation only after the server
  // RPC clears the request. The client AppStore already greys the
  // button for non-"allowed" tools, but a tampered call (or a
  // stale-cache install) goes through the same gate.
  const install = useCallback(
    (slug: string) => {
      void (async () => {
        const verdict = await checkAvailability(activeId, slug);
        if (verdict !== "allowed") {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("tools:install-blocked", {
                detail: { slug, reason: verdict },
              })
            );
          }
          return;
        }
        setState((prev) => {
          if (prev.installed.includes(slug)) return prev;
          const next = { ...prev, installed: [...prev.installed, slug] };
          save(STORAGE_KEY, next);
          return next;
        });
      })();
    },
    [STORAGE_KEY, activeId]
  );

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
