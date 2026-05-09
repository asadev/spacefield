"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Per-page selection state for the universal bulk-action bar.
 *
 * The provider holds a `Set<string>` of selected target ids plus
 * mutators. A `scope` key (e.g. "users", "workspaces", "agents") lets
 * different pages reuse the same components without colliding — the
 * scope is also what the API route uses to dispatch the action.
 *
 * Components consume the context via `useBulkActions()`. The hook is
 * intentionally simple: callers wire `<BulkRowCheckbox>` per row and
 * drop a `<BulkActionBar>` somewhere on the page; the rest is implicit.
 */

export interface BulkActionContextValue {
  scope: string;
  selected: Set<string>;
  count: number;
  isSelected: (id: string) => boolean;
  select: (id: string) => void;
  unselect: (id: string) => void;
  toggle: (id: string) => void;
  clear: () => void;
  selectAll: (ids: string[]) => void;
  setSelected: (ids: string[]) => void;
}

const BulkActionContext = createContext<BulkActionContextValue | null>(null);

export interface BulkActionProviderProps {
  scope: string;
  children: ReactNode;
  /** Optional initial selection (ids). Mostly useful for tests. */
  initial?: string[];
}

export function BulkActionProvider({
  scope,
  children,
  initial,
}: BulkActionProviderProps) {
  const [selected, setSelectedState] = useState<Set<string>>(
    () => new Set(Array.isArray(initial) ? initial : [])
  );

  const select = useCallback((id: string) => {
    if (!id) return;
    setSelectedState((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const unselect = useCallback((id: string) => {
    if (!id) return;
    setSelectedState((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggle = useCallback((id: string) => {
    if (!id) return;
    setSelectedState((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelectedState((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedState((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (id) next.add(id);
      }
      return next;
    });
  }, []);

  const setSelected = useCallback((ids: string[]) => {
    setSelectedState(new Set(ids.filter(Boolean)));
  }, []);

  const isSelected = useCallback(
    (id: string) => selected.has(id),
    [selected]
  );

  const value = useMemo<BulkActionContextValue>(
    () => ({
      scope,
      selected,
      count: selected.size,
      isSelected,
      select,
      unselect,
      toggle,
      clear,
      selectAll,
      setSelected,
    }),
    [
      scope,
      selected,
      isSelected,
      select,
      unselect,
      toggle,
      clear,
      selectAll,
      setSelected,
    ]
  );

  return (
    <BulkActionContext.Provider value={value}>
      {children}
    </BulkActionContext.Provider>
  );
}

/** Read the bulk-action selection state. Throws when called outside a
 * `<BulkActionProvider>` so misuse is loud at dev time. */
export function useBulkActions(): BulkActionContextValue {
  const ctx = useContext(BulkActionContext);
  if (!ctx) {
    throw new Error("useBulkActions must be used inside a <BulkActionProvider>");
  }
  return ctx;
}

/** Optional, non-throwing variant. Returns null when no provider is
 * mounted — handy for components that *may* be rendered outside a
 * bulk-enabled page. */
export function useBulkActionsOptional(): BulkActionContextValue | null {
  return useContext(BulkActionContext);
}
