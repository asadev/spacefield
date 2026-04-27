"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Sheets editor — Univer + SheetJS
   ───────────────────────────────────────────────────────────────────────────
   This is the heavy half of the Sheets app. It is loaded behind a
   `dynamic(..., { ssr: false })` boundary in `_app.tsx` so the desktop OS
   boot stays small. ~1.5–2 MB of Univer + xlsx code lives in this chunk.

   Univer mounts to a real DOM element imperatively. We hand it a workbook
   in its native `IWorkbookData` shape. To support real .xlsx round-trip
   we use SheetJS:

     .xlsx bytes  ──XLSX.read──► sheetjs WB ──cellsToUniver──► IWorkbookData
     IWorkbookData ──univerToSheetjs──► sheetjs WB ──XLSX.write──► .xlsx bytes
═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef } from "react";
import {
  Univer,
  LocaleType,
  LogLevel,
  UniverInstanceType,
  Tools,
  type IWorkbookData,
  type IWorksheetData,
  type ICellData,
  type IObjectMatrixPrimitiveType,
} from "@univerjs/core";
import { UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverFormulaEnginePlugin } from "@univerjs/engine-formula";
import { UniverUIPlugin } from "@univerjs/ui";
import { UniverSheetsPlugin } from "@univerjs/sheets";
import { UniverSheetsUIPlugin } from "@univerjs/sheets-ui";
import { UniverSheetsFormulaPlugin } from "@univerjs/sheets-formula";
import { UniverSheetsNumfmtPlugin } from "@univerjs/sheets-numfmt";

import * as XLSX from "xlsx";

// Univer 0.21 inlines its component styles via runtime CSS-in-JS, so
// there are no separate stylesheets to import. The container DIV holds
// the editor and inherits no styles from the desktop chrome.

// Univer's FWorkbook facade — pulled lazily via the sheets package's
// `getActiveWorkbook()` returns a non-typed object in plain core. We
// type-narrow at call sites.
type FWorkbookLike = {
  save?: () => IWorkbookData;
  getSnapshot?: () => IWorkbookData;
};

interface EditorProps {
  /** Raw .xlsx (or .csv text-as-bytes) buffer to seed the editor. Null = blank. */
  initialBuffer: ArrayBuffer | null;
  initialFormat: "xlsx" | "csv" | null;
  docName: string;
  theme: "dark" | "light";
  onReady: (api: { getXlsxBuffer: () => Promise<ArrayBuffer> }) => void;
  onDirty: () => void;
  onEditingChange: (editing: boolean) => void;
}

// ---------------------------------------------------------------------------
// SheetJS workbook ↔ Univer IWorkbookData conversions
// ---------------------------------------------------------------------------

function blankWorkbookData(name: string): IWorkbookData {
  const sheetId = "sheet-1";
  const sheet: Partial<IWorksheetData> = {
    id: sheetId,
    name: "Sheet1",
    rowCount: 100,
    columnCount: 26,
    cellData: {},
  };
  return {
    id: `wb-${Date.now()}`,
    sheetOrder: [sheetId],
    name,
    appVersion: "0.21.1",
    locale: LocaleType.EN_US,
    styles: {},
    sheets: { [sheetId]: sheet },
  };
}

function sheetjsToUniver(wb: XLSX.WorkBook, name: string): IWorkbookData {
  const sheets: Record<string, Partial<IWorksheetData>> = {};
  const order: string[] = [];

  for (let idx = 0; idx < wb.SheetNames.length; idx++) {
    const sheetName = wb.SheetNames[idx];
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const sheetId = `sheet-${idx + 1}`;
    order.push(sheetId);

    const cellData: IObjectMatrixPrimitiveType<ICellData> = {};
    let maxRow = 0;
    let maxCol = 0;

    const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    if (range) {
      maxRow = range.e.r + 1;
      maxCol = range.e.c + 1;
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = ws[addr];
          if (!cell) continue;
          const out: ICellData = {};
          // Formula
          if (cell.f) {
            out.f = `=${cell.f}`;
          }
          // Value
          if (cell.v !== undefined && cell.v !== null) {
            if (cell.t === "n") out.v = Number(cell.v);
            else if (cell.t === "b") out.v = Boolean(cell.v);
            else out.v = String(cell.v);
          }
          if (out.v === undefined && !out.f) continue;
          if (!cellData[r]) cellData[r] = {};
          cellData[r][c] = out;
        }
      }
    }

    // Merged ranges
    const mergeData =
      ws["!merges"]?.map((m) => ({
        startRow: m.s.r,
        startColumn: m.s.c,
        endRow: m.e.r,
        endColumn: m.e.c,
      })) ?? [];

    sheets[sheetId] = {
      id: sheetId,
      name: sheetName,
      rowCount: Math.max(maxRow, 100),
      columnCount: Math.max(maxCol, 26),
      cellData,
      mergeData,
    };
  }

  if (order.length === 0) {
    return blankWorkbookData(name);
  }

  return {
    id: `wb-${Date.now()}`,
    sheetOrder: order,
    name,
    appVersion: "0.21.1",
    locale: LocaleType.EN_US,
    styles: {},
    sheets,
  };
}

function csvToUniver(text: string, name: string): IWorkbookData {
  const wb = XLSX.read(text, { type: "string" });
  return sheetjsToUniver(wb, name);
}

function univerToSheetjs(snapshot: IWorkbookData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const sheetId of snapshot.sheetOrder) {
    const sheet = snapshot.sheets[sheetId];
    if (!sheet) continue;
    const aoa: (string | number | boolean | null)[][] = [];
    const cellData = sheet.cellData ?? {};
    let maxRow = 0;
    let maxCol = 0;
    // Walk numeric keys
    for (const rowKey of Object.keys(cellData)) {
      const r = Number(rowKey);
      if (!Number.isFinite(r)) continue;
      if (r > maxRow) maxRow = r;
      const row = cellData[r] ?? {};
      for (const colKey of Object.keys(row)) {
        const c = Number(colKey);
        if (!Number.isFinite(c)) continue;
        if (c > maxCol) maxCol = c;
      }
    }
    // Initialise array
    for (let r = 0; r <= maxRow; r++) {
      aoa[r] = new Array(maxCol + 1).fill(null);
    }
    // Fill cells (values only — XLSX.utils.aoa_to_sheet doesn't carry formulas
    // through the AOA path, so for formula-bearing cells we splice them in
    // afterwards via the resulting ws.)
    const formulaCells: Array<{ r: number; c: number; f: string; v?: unknown }> =
      [];
    for (const rowKey of Object.keys(cellData)) {
      const r = Number(rowKey);
      if (!Number.isFinite(r)) continue;
      const row = cellData[r] ?? {};
      for (const colKey of Object.keys(row)) {
        const c = Number(colKey);
        if (!Number.isFinite(c)) continue;
        const cell = row[c] as ICellData | undefined;
        if (!cell) continue;
        if (cell.f) {
          // Strip leading "=" for SheetJS, which expects raw formula text.
          formulaCells.push({
            r,
            c,
            f: cell.f.replace(/^=/, ""),
            v: cell.v ?? undefined,
          });
          aoa[r][c] = (cell.v ?? null) as never;
        } else if (cell.v !== undefined && cell.v !== null) {
          aoa[r][c] = cell.v as never;
        }
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    for (const fc of formulaCells) {
      const addr = XLSX.utils.encode_cell({ r: fc.r, c: fc.c });
      const existing = ws[addr] || {};
      existing.f = fc.f;
      if (fc.v !== undefined) existing.v = fc.v;
      ws[addr] = existing;
    }
    // Merges
    if (sheet.mergeData && sheet.mergeData.length > 0) {
      ws["!merges"] = sheet.mergeData.map((m) => ({
        s: { r: m.startRow, c: m.startColumn },
        e: { r: m.endRow, c: m.endColumn },
      }));
    }

    XLSX.utils.book_append_sheet(wb, ws, sheet.name ?? sheetId);
  }
  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "Sheet1");
  }
  return wb;
}

// ---------------------------------------------------------------------------
// React component
// ---------------------------------------------------------------------------

export default function SheetsEditor({
  initialBuffer,
  initialFormat,
  docName,
  theme,
  onReady,
  onDirty,
  onEditingChange,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const univerRef = useRef<Univer | null>(null);
  const workbookRef = useRef<FWorkbookLike | null>(null);

  // Track callbacks via refs so we don't re-mount Univer on every render.
  const onReadyRef = useRef(onReady);
  const onDirtyRef = useRef(onDirty);
  const onEditingRef = useRef(onEditingChange);
  useEffect(() => {
    onReadyRef.current = onReady;
    onDirtyRef.current = onDirty;
    onEditingRef.current = onEditingChange;
  }, [onReady, onDirty, onEditingChange]);

  // -----------------------------------------------------------------------
  // Mount Univer once, on first paint after the container DIV exists.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let univer: Univer | null = null;
    let listeners: Array<() => void> = [];

    (async () => {
      try {
        // Build initial workbook data
        let workbookData: IWorkbookData;
        if (initialBuffer && initialFormat === "xlsx") {
          const wb = XLSX.read(initialBuffer, {
            type: "array",
            cellFormula: true,
          });
          workbookData = sheetjsToUniver(wb, docName);
        } else if (initialBuffer && initialFormat === "csv") {
          const text = new TextDecoder("utf-8").decode(
            new Uint8Array(initialBuffer)
          );
          workbookData = csvToUniver(text, docName);
        } else {
          workbookData = blankWorkbookData(docName);
        }

        if (disposed) return;

        univer = new Univer({
          locale: LocaleType.EN_US,
          darkMode: theme === "dark",
          logLevel: LogLevel.SILENT,
        });

        // Core plugin pipeline.
        univer.registerPlugin(UniverRenderEnginePlugin);
        univer.registerPlugin(UniverFormulaEnginePlugin);
        univer.registerPlugin(UniverUIPlugin, {
          container,
          header: true,
          toolbar: true,
          footer: true,
          contextMenu: true,
        });
        univer.registerPlugin(UniverSheetsPlugin);
        univer.registerPlugin(UniverSheetsUIPlugin);
        univer.registerPlugin(UniverSheetsFormulaPlugin);
        univer.registerPlugin(UniverSheetsNumfmtPlugin);

        if (disposed) {
          univer.dispose();
          return;
        }

        const workbook = univer.createUnit(
          UniverInstanceType.UNIVER_SHEET,
          workbookData
        ) as unknown as FWorkbookLike;

        univerRef.current = univer;
        workbookRef.current = workbook;

        // Expose a getter so the parent can pull a fresh xlsx buffer
        // without triggering a re-render dance.
        const getXlsxBuffer = async (): Promise<ArrayBuffer> => {
          // Univer's UnitModel.save() returns a fresh snapshot.
          const wb = workbookRef.current;
          if (!wb) throw new Error("Editor not ready");
          const snapshot =
            (typeof wb.save === "function" && wb.save()) ||
            (typeof wb.getSnapshot === "function" && wb.getSnapshot());
          if (!snapshot) throw new Error("Couldn't read workbook snapshot");
          // Tools.deepClone is exposed by core for safety.
          const cloned = Tools.deepClone(snapshot) as IWorkbookData;
          const sjs = univerToSheetjs(cloned);
          const out = XLSX.write(sjs, {
            bookType: "xlsx",
            type: "array",
          }) as ArrayBuffer;
          return out;
        };

        onReadyRef.current({ getXlsxBuffer });

        // Dirty / editing tracking — listen on the document via capture so
        // we catch typing inside Univer's nested editors (cells, formula
        // bar). This is heuristic but works well: the editor uses
        // contenteditable + input elements internally.
        const onKey = (ev: KeyboardEvent) => {
          // Ignore pure modifier presses and shortcut keys.
          if (
            ev.key === "Shift" ||
            ev.key === "Control" ||
            ev.key === "Meta" ||
            ev.key === "Alt"
          ) {
            return;
          }
          if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "s") {
            return; // save shortcut handled by parent
          }
          if (!container.contains(ev.target as Node)) return;
          onDirtyRef.current();
        };
        const onFocusIn = (ev: FocusEvent) => {
          const t = ev.target as HTMLElement | null;
          if (!t || !container.contains(t)) return;
          const tag = t.tagName;
          const isEditable =
            tag === "INPUT" ||
            tag === "TEXTAREA" ||
            t.isContentEditable === true;
          if (isEditable) onEditingRef.current(true);
        };
        const onFocusOut = (ev: FocusEvent) => {
          const t = ev.target as HTMLElement | null;
          if (!t || !container.contains(t)) return;
          // Defer so Univer's cell-edit commit can land first.
          setTimeout(() => onEditingRef.current(false), 50);
        };
        const onMouseUp = (ev: MouseEvent) => {
          if (!container.contains(ev.target as Node)) return;
          // Some Univer ops (paste, fill-handle drag) don't bubble keydown.
          // Mark dirty whenever the user clicks then releases inside the
          // editor — false positives are cheap, the dirty bit is checked
          // before the next auto-save and clears immediately on save.
          // We avoid spamming: only set on right-click + middle-click +
          // toolbar buttons, not raw cell clicks.
          if (ev.button !== 0) onDirtyRef.current();
          const target = ev.target as HTMLElement | null;
          if (target && target.closest("button")) onDirtyRef.current();
        };

        container.addEventListener("keydown", onKey, true);
        container.addEventListener("focusin", onFocusIn, true);
        container.addEventListener("focusout", onFocusOut, true);
        container.addEventListener("mouseup", onMouseUp, true);
        listeners.push(
          () => container.removeEventListener("keydown", onKey, true),
          () => container.removeEventListener("focusin", onFocusIn, true),
          () => container.removeEventListener("focusout", onFocusOut, true),
          () => container.removeEventListener("mouseup", onMouseUp, true)
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[sheets] failed to mount Univer", err);
      }
    })();

    return () => {
      disposed = true;
      for (const off of listeners) {
        try {
          off();
        } catch {
          /* noop */
        }
      }
      listeners = [];
      try {
        univer?.dispose();
      } catch {
        /* noop */
      }
      univerRef.current = null;
      workbookRef.current = null;
    };
    // We deliberately mount once per instance — the parent bumps `key`
    // to force a fresh editor when opening a different file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="univer-host h-full w-full"
      data-univer-host
    />
  );
}
