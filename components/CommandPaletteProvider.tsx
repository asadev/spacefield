"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import CommandPalette from "./CommandPalette";

/* Command palette context.
 *
 * Root layout wires this once:
 *
 *   <CommandPaletteProvider>
 *     {children}
 *   </CommandPaletteProvider>
 *
 * Anywhere inside, components can call useCommandPalette() to open or
 * pre-fill the palette:
 *
 *   const { open, setOpen, setQuery } = useCommandPalette();
 *   <button onClick={() => { setQuery(""); setOpen(true); }}>
 *     Search…
 *   </button>
 *
 * The provider also installs the global Cmd/Ctrl-K keyboard shortcut.
 */

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  query: string;
  setQuery: (q: string) => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null
);

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    // Defensive fallback so a component using the hook outside the
    // provider doesn't crash the entire tree — just no-ops.
    return {
      open: false,
      setOpen: () => {},
      toggle: () => {},
      query: "",
      setQuery: () => {},
    };
  }
  return ctx;
}

interface ProviderProps {
  children: ReactNode;
}

export default function CommandPaletteProvider({ children }: ProviderProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Global Cmd/Ctrl-K. Use keydown and check both metaKey (Mac) and
  // ctrlKey (Windows/Linux). Also support `/` as a quick-open when the
  // user isn't already in a text input.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isModK =
        (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      if (isModK) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        return;
      }
      // Slash-to-search when not already typing into something.
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isTextEntryTarget(e.target)
      ) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ open, setOpen, toggle, query, setQuery }),
    [open, query, toggle]
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        query={query}
        onQueryChange={setQuery}
      />
    </CommandPaletteContext.Provider>
  );
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
