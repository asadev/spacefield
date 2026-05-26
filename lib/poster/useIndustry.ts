/* ═══════════════════════════════════════════════════════════════════════════
   lib/poster/useIndustry.ts — adapter hook for workspace industry
   ───────────────────────────────────────────────────────────────────────────
   Agent C (parallel) is adding workspace.industry + a proper
   useWorkspaceIndustry() React hook in `lib/industry/`. Until that lands
   and is wired through every callsite, this adapter does the right thing:

     1. Try `lib/industry` (Agent C's hook) — only available once C ships.
     2. Fall back to the per-workspace `posters:industry` localStorage key
        so a user can still pick once and have it stick.
     3. Default to "generic" if nothing else is known.

   The adapter is intentionally tiny + dynamic so the build doesn't error
   if Agent C's module isn't there yet. Once C lands its API, replace the
   try/catch with a direct import; nothing else in the tool changes.
═══════════════════════════════════════════════════════════════════════════ */

"use client";

import { useEffect, useState, useCallback } from "react";
import { useWorkspace } from "@/lib/workspaces/client";
import type { PosterIndustry } from "./types";
import { POSTER_INDUSTRIES } from "./types";

const VALID = new Set<PosterIndustry>(POSTER_INDUSTRIES.map((i) => i.id));

function isPosterIndustry(v: unknown): v is PosterIndustry {
  return typeof v === "string" && VALID.has(v as PosterIndustry);
}

function storageKeyForWorkspace(workspaceId: string | undefined): string {
  return workspaceId
    ? `posters:industry:ws:${workspaceId}`
    : "posters:industry:personal";
}

/**
 * Returns the active poster industry + a setter that persists per-workspace.
 * Defaults to "generic".
 */
export function usePosterIndustry(): {
  industry: PosterIndustry;
  setIndustry: (i: PosterIndustry) => void;
  hydrated: boolean;
} {
  const { current } = useWorkspace();
  const workspaceId = current.kind === "team" ? current.id : undefined;

  const [industry, setIndustryState] = useState<PosterIndustry>("generic");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      // 1. Local override always wins (user explicitly picked).
      try {
        const raw = localStorage.getItem(storageKeyForWorkspace(workspaceId));
        if (raw && isPosterIndustry(raw)) {
          if (!cancelled) {
            setIndustryState(raw);
            setHydrated(true);
          }
          return;
        }
      } catch {}

      // 2. Try Agent C's industry registry hook if available.
      //    Use a string template so the bundler doesn't try to statically
      //    resolve it at build time (the module doesn't exist yet on this
      //    branch; Agent C is shipping it in parallel).
      try {
        const modulePath = "@/lib/" + "industry/registry";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = await (import(/* webpackIgnore: true */ modulePath as string).catch(() => null)) as any;
        if (mod && typeof mod.resolveWorkspaceIndustry === "function") {
          const slug: unknown = await mod.resolveWorkspaceIndustry(workspaceId);
          if (!cancelled && isPosterIndustry(slug)) {
            setIndustryState(slug);
            setHydrated(true);
            return;
          }
        }
      } catch {}

      // 3. Default fallback.
      if (!cancelled) {
        setIndustryState("generic");
        setHydrated(true);
      }
    }
    resolve();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const setIndustry = useCallback(
    (next: PosterIndustry) => {
      setIndustryState(next);
      try {
        localStorage.setItem(storageKeyForWorkspace(workspaceId), next);
      } catch {}
    },
    [workspaceId]
  );

  return { industry, setIndustry, hydrated };
}

/**
 * Returns the active currency code (e.g. "AED", "PKR", "USD") for the
 * current workspace. Mirrors the same fall-through model as
 * usePosterIndustry — local override → workspace setting → AED default.
 *
 * Until Agent C / the workspace settings API exposes currency, callers
 * can override per-poster via the Poster Creator's currency field.
 */
export function useWorkspaceCurrency(): {
  currency: string;
  setCurrency: (c: string) => void;
} {
  const { current } = useWorkspace();
  const workspaceId = current.kind === "team" ? current.id : undefined;

  const [currency, setCurrencyState] = useState<string>("AED");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(
        workspaceId
          ? `posters:currency:ws:${workspaceId}`
          : "posters:currency:personal"
      );
      if (raw && typeof raw === "string" && raw.length > 0 && raw.length <= 6) {
        setCurrencyState(raw.toUpperCase());
      }
    } catch {}
  }, [workspaceId]);

  const setCurrency = useCallback(
    (next: string) => {
      const clean = next.trim().toUpperCase().slice(0, 6);
      setCurrencyState(clean);
      try {
        localStorage.setItem(
          workspaceId
            ? `posters:currency:ws:${workspaceId}`
            : "posters:currency:personal",
          clean
        );
      } catch {}
    },
    [workspaceId]
  );

  return { currency, setCurrency };
}
