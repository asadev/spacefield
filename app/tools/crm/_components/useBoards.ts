"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * CRM Boards — client hooks.
 * Three small hooks built on lib/cache/swr so the boards UI gets the
 * same cache-then-revalidate behavior as the rest of the CRM:
 *
 *   useBoards(workspaceId)   → board list summary cards
 *   useBoard(boardId)        → full board (row + columns + views)
 *   useBoardRecords(boardId, viewId?) → records, with optimistic merge
 *
 * Mutations always go through plain fetch() and call invalidate() with a
 * prefix matcher so any cached GET that depends on the affected resource
 * is busted in one call.
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";
import { cachedFetch, invalidate } from "@/lib/cache/swr";
import type {
  BoardSummary,
  CrmBoard,
  CrmBoardColumn,
  CrmBoardRecord,
  CrmBoardView,
  FullBoard,
} from "../_boards/types";

interface BoardsListResponse {
  items: BoardSummary[];
}
interface FullBoardResponse {
  board: CrmBoard;
  columns: CrmBoardColumn[];
  views: CrmBoardView[];
}
interface RecordsResponse {
  items: CrmBoardRecord[];
  limit: number;
  offset: number;
}

export interface UseBoards {
  boards: BoardSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useBoards(workspaceId: string): UseBoards {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const url = workspaceId
    ? `/api/crm/boards?workspace_id=${workspaceId}`
    : null;

  const refresh = useCallback(async (): Promise<void> => {
    if (!url) return;
    try {
      setLoading(true);
      const res = await cachedFetch<BoardsListResponse>(url);
      setBoards(res.items ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (!url) {
      setBoards([]);
      setLoading(false);
      return;
    }
    void refresh();
  }, [url, refresh]);

  return { boards, loading, error, refresh };
}

export interface UseBoard {
  board: FullBoard | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useBoard(boardId: string | null): UseBoard {
  const [data, setData] = useState<FullBoard | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const url = boardId ? `/api/crm/boards/${boardId}` : null;

  const refresh = useCallback(async (): Promise<void> => {
    if (!url) return;
    try {
      setLoading(true);
      const res = await cachedFetch<FullBoardResponse>(url);
      setData({ board: res.board, columns: res.columns, views: res.views });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }
    void refresh();
  }, [url, refresh]);

  return { board: data, loading, error, refresh };
}

export interface UseBoardRecords {
  records: CrmBoardRecord[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Mutate a single record locally (no network). Used to keep the UI
   * snappy while a PATCH is in flight; invalidate() runs after the
   * server responds so the next read pulls authoritative data. */
  optimisticUpdate: (id: string, patch: Partial<CrmBoardRecord>) => void;
  optimisticInsert: (row: CrmBoardRecord) => void;
  optimisticRemove: (id: string) => void;
}

export function useBoardRecords(
  boardId: string | null,
  viewId?: string | null
): UseBoardRecords {
  const [records, setRecords] = useState<CrmBoardRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const url = boardId
    ? `/api/crm/boards/${boardId}/records${
        viewId ? `?view_id=${viewId}` : ""
      }`
    : null;

  const refresh = useCallback(async (): Promise<void> => {
    if (!url) return;
    try {
      setLoading(true);
      const res = await cachedFetch<RecordsResponse>(url);
      setRecords(res.items ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (!url) {
      setRecords([]);
      setLoading(false);
      return;
    }
    void refresh();
  }, [url, refresh]);

  const optimisticUpdate = useCallback(
    (id: string, patch: Partial<CrmBoardRecord>): void => {
      setRecords((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          // Merge `data` jsonb specially so partial cell edits don't
          // wipe other cells.
          const nextData = patch.data
            ? { ...r.data, ...patch.data }
            : r.data;
          return { ...r, ...patch, data: nextData };
        })
      );
    },
    []
  );

  const optimisticInsert = useCallback((row: CrmBoardRecord): void => {
    setRecords((prev) => [...prev, row]);
  }, []);

  const optimisticRemove = useCallback((id: string): void => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return {
    records,
    loading,
    error,
    refresh,
    optimisticUpdate,
    optimisticInsert,
    optimisticRemove,
  };
}

// ─── mutation helpers ────────────────────────────────────────────────────

export async function createBoard(body: {
  workspace_id: string;
  template_id?: string;
  name?: string;
  kind?: "marketing" | "projects" | "onboarding" | "accounts" | "custom";
}): Promise<CrmBoard> {
  const r = await fetch("/api/crm/boards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `${r.status} create board failed`);
  }
  invalidate({ prefix: `/api/crm/boards?workspace_id=${body.workspace_id}` });
  const j = (await r.json()) as { board: CrmBoard };
  return j.board;
}

export async function patchBoardRecord(
  boardId: string,
  recordId: string,
  patch: { data?: Record<string, unknown>; position?: number }
): Promise<CrmBoardRecord> {
  const r = await fetch(`/api/crm/boards/${boardId}/records/${recordId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `${r.status} patch record failed`);
  }
  invalidate({ prefix: `/api/crm/boards/${boardId}/records` });
  const j = (await r.json()) as { record: CrmBoardRecord };
  return j.record;
}

export async function createBoardRecord(
  boardId: string,
  body: { data?: Record<string, unknown>; position?: number }
): Promise<CrmBoardRecord> {
  const r = await fetch(`/api/crm/boards/${boardId}/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `${r.status} create record failed`);
  }
  invalidate({ prefix: `/api/crm/boards/${boardId}/records` });
  const j = (await r.json()) as { record: CrmBoardRecord };
  return j.record;
}

export async function deleteBoardRecord(
  boardId: string,
  recordId: string
): Promise<void> {
  const r = await fetch(`/api/crm/boards/${boardId}/records/${recordId}`, {
    method: "DELETE",
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `${r.status} delete record failed`);
  }
  invalidate({ prefix: `/api/crm/boards/${boardId}/records` });
}

export async function patchBoardColumn(
  boardId: string,
  columnId: string,
  patch: { label?: string; config?: Record<string, unknown>; width?: number }
): Promise<CrmBoardColumn> {
  const r = await fetch(`/api/crm/boards/${boardId}/columns/${columnId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `${r.status} patch column failed`);
  }
  invalidate({ prefix: `/api/crm/boards/${boardId}` });
  const j = (await r.json()) as { column: CrmBoardColumn };
  return j.column;
}

export async function createBoardColumn(
  boardId: string,
  body: {
    field_key: string;
    label: string;
    field_type: string;
    config?: Record<string, unknown>;
  }
): Promise<CrmBoardColumn> {
  const r = await fetch(`/api/crm/boards/${boardId}/columns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `${r.status} create column failed`);
  }
  invalidate({ prefix: `/api/crm/boards/${boardId}` });
  const j = (await r.json()) as { column: CrmBoardColumn };
  return j.column;
}

export async function deleteBoard(boardId: string, workspaceId: string): Promise<void> {
  const r = await fetch(`/api/crm/boards/${boardId}`, { method: "DELETE" });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `${r.status} delete board failed`);
  }
  invalidate({ prefix: `/api/crm/boards?workspace_id=${workspaceId}` });
  invalidate({ prefix: `/api/crm/boards/${boardId}` });
}

export async function patchBoard(
  boardId: string,
  workspaceId: string,
  patch: { name?: string; color?: string | null; icon?: string | null }
): Promise<CrmBoard> {
  const r = await fetch(`/api/crm/boards/${boardId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `${r.status} patch board failed`);
  }
  invalidate({ prefix: `/api/crm/boards?workspace_id=${workspaceId}` });
  invalidate({ prefix: `/api/crm/boards/${boardId}` });
  const j = (await r.json()) as { board: CrmBoard };
  return j.board;
}
