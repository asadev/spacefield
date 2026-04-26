"use client";

/**
 * DesktopShellContext — exposes the workspace primitives every native app
 * needs: openApp() to launch / focus other tools, closeWindow() to dismiss
 * itself, and the resolved theme. Mirrors the imatch panel's pattern.
 *
 * Native tool components receive the same data via NativeAppProps, but
 * deeply nested children inside an app can also useDesktopShell() directly.
 */

import { createContext, useContext, type ReactNode } from "react";

export type AppInitialParams = Record<string, unknown>;

export interface DesktopShellApi {
  /**
   * Open / focus an app by slug. If the app is already open it gets focus
   * and an updated initialParamsKey (so it can re-react to new params).
   * Otherwise a new window spawns at the tool's default size.
   */
  openApp: (slug: string, params?: AppInitialParams) => void;
  /** Close the currently focused window (or any window by id). */
  closeWindow: (id?: string) => void;
  /** Resolved light/dark theme — apps use this to drive canvas tones etc. */
  resolved: "dark" | "light";
}

const Ctx = createContext<DesktopShellApi | null>(null);

export function DesktopShellProvider({
  api,
  children,
}: {
  api: DesktopShellApi;
  children: ReactNode;
}) {
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useDesktopShell(): DesktopShellApi {
  const v = useContext(Ctx);
  if (!v) {
    // No-op fallback so a native app can be developed standalone without crashing.
    return {
      openApp: () => {},
      closeWindow: () => {},
      resolved: "dark",
    };
  }
  return v;
}
