"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Sheets editor — Univer + SheetJS (pro-tier)
   ───────────────────────────────────────────────────────────────────────────
   This is the heavy half of the Sheets app. Loaded behind a
   `dynamic(..., { ssr: false })` boundary so the desktop OS boot stays small.

   Pro-tier feature plugins all stay here:
     - sheets-formula / sheets-formula-ui     (formula bar + autocomplete)
     - sheets-numfmt                          (number formats)
     - sheets-sort / sheets-sort-ui           (column sort)
     - sheets-filter / sheets-filter-ui       (header filter dropdowns)
     - sheets-conditional-formatting(+ui)     (cell-value rules, color scale)
     - find-replace / sheets-find-replace     (Cmd+F panel, native)

   Univer 0.21 ships its CSS via separate stylesheets in each UI package's
   `lib/index.css` — they are imported below. Without these the toolbar /
   ribbon / context menu render unstyled.

     .xlsx bytes  ──XLSX.read──► sheetjs WB ──cellsToUniver──► IWorkbookData
     IWorkbookData ──univerToSheetjs──► sheetjs WB ──XLSX.write──► .xlsx bytes
═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  type IStyleData,
} from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverFormulaEnginePlugin } from "@univerjs/engine-formula";
import { UniverUIPlugin } from "@univerjs/ui";
import { UniverSheetsPlugin } from "@univerjs/sheets";
import { UniverSheetsUIPlugin } from "@univerjs/sheets-ui";
import { UniverSheetsFormulaPlugin } from "@univerjs/sheets-formula";
import { UniverSheetsFormulaUIPlugin } from "@univerjs/sheets-formula-ui";
import { UniverSheetsNumfmtPlugin } from "@univerjs/sheets-numfmt";
import { UniverSheetsSortPlugin } from "@univerjs/sheets-sort";
import { UniverSheetsSortUIPlugin } from "@univerjs/sheets-sort-ui";
import { UniverSheetsFilterPlugin } from "@univerjs/sheets-filter";
import { UniverSheetsFilterUIPlugin } from "@univerjs/sheets-filter-ui";
import { UniverSheetsConditionalFormattingPlugin } from "@univerjs/sheets-conditional-formatting";
import { UniverSheetsConditionalFormattingUIPlugin } from "@univerjs/sheets-conditional-formatting-ui";
import { UniverFindReplacePlugin } from "@univerjs/find-replace";
import { UniverSheetsFindReplacePlugin } from "@univerjs/sheets-find-replace";

// Facades — registering these on the global `FUniver` lets us call
// `univerAPI.getActiveWorkbook().getActiveSheet().getRange(…).setNumberFormat(…)`
// without touching the redi DI container ourselves.
import "@univerjs/sheets/facade";
import "@univerjs/sheets-numfmt/facade";
import "@univerjs/sheets-formula/facade";
import "@univerjs/sheets-sort/facade";
import "@univerjs/sheets-filter/facade";
import "@univerjs/sheets-conditional-formatting/facade";
import "@univerjs/sheets-find-replace/facade";

// Locales — these are merged at construct time. Without them the toolbar
// labels render as raw `i18n.foo.bar` keys.
import DesignEnUS from "@univerjs/design/locale/en-US";
import UIEnUS from "@univerjs/ui/locale/en-US";
import SheetsEnUS from "@univerjs/sheets/locale/en-US";
import SheetsUIEnUS from "@univerjs/sheets-ui/locale/en-US";
import SheetsFormulaEnUS from "@univerjs/sheets-formula/locale/en-US";
import SheetsFormulaUIEnUS from "@univerjs/sheets-formula-ui/locale/en-US";
import SheetsSortUIEnUS from "@univerjs/sheets-sort-ui/locale/en-US";
import SheetsFilterUIEnUS from "@univerjs/sheets-filter-ui/locale/en-US";
import SheetsCondFmtUIEnUS from "@univerjs/sheets-conditional-formatting-ui/locale/en-US";
import FindReplaceEnUS from "@univerjs/find-replace/locale/en-US";

// Univer ships its CSS as separate stylesheets in 0.21.
// These imports MUST run before the editor mounts — Next.js / Webpack will
// fold them into the lazy chunk's CSS bundle.
import "@univerjs/design/lib/index.css";
import "@univerjs/ui/lib/index.css";
import "@univerjs/sheets-ui/lib/index.css";
import "@univerjs/sheets-formula-ui/lib/index.css";
import "@univerjs/find-replace/lib/index.css";
import "@univerjs/sheets-sort-ui/lib/index.css";
import "@univerjs/sheets-filter-ui/lib/index.css";
import "@univerjs/sheets-conditional-formatting-ui/lib/index.css";

// TODO(SE-002): port to exceljs — bidirectional xlsx<->Univer conversion
// (sheetjsToUniver, univerToSheetjs, csvToUniver, getXlsxBuffer, encode_col/encode_cell
// helpers) is ~200 lines of cell/style/merge/formula round-tripping; needs its own
// focused round so we don't regress the Sheets editor. Keep `xlsx` in deps until then.
import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Public command surface — kept tiny on purpose.
// `_app.tsx` invokes these via the ref-callback API; it never imports Univer.
// ---------------------------------------------------------------------------

export type ChartKind = "column" | "bar" | "line" | "pie";

export interface ChartSelectionData {
  /** A1 notation of the source range, e.g. "A1:C10". */
  range: string;
  /** Headers (top row of the range). */
  headers: string[];
  /** Numeric series, one row per data row. */
  rows: Array<{ label: string; values: number[] }>;
}

export interface SheetTabInfo {
  id: string;
  name: string;
  active: boolean;
  index: number;
}

export interface EditorAPI {
  /** Pull a fresh .xlsx ArrayBuffer for save / export. */
  getXlsxBuffer: () => Promise<ArrayBuffer>;
  /** Set a number format pattern on the active selection. */
  setNumberFormat: (pattern: string) => void;
  /** Apply a fill / font-weight / etc. style on the active selection. */
  setStyle: (style: Partial<IStyleData>) => void;
  /** Increase/decrease decimal places on the active range. */
  changeDecimals: (delta: 1 | -1) => void;
  /** Sort active range by its first column. */
  sortActive: (asc: boolean) => void;
  /** Toggle a header-row filter on the active range. */
  toggleFilter: () => void;
  /** Open Univer's Find & Replace panel. */
  openFindReplace: () => void;
  /** Open the conditional-formatting side panel. */
  openConditionalFormat: () => void;
  /** Freeze / unfreeze rows / columns. */
  freezeTopRow: () => void;
  freezeFirstColumn: () => void;
  freezeRows: (n: number) => void;
  freezeColumns: (n: number) => void;
  unfreeze: () => void;
  /** Sheet-tab manipulation. */
  insertSheet: (name?: string) => void;
  deleteActiveSheet: () => void;
  duplicateActiveSheet: () => void;
  renameActiveSheet: (name: string) => void;
  setActiveSheet: (sheetId: string) => void;
  listSheets: () => SheetTabInfo[];
  /** Pull data behind the current selection in a chart-friendly shape. */
  getChartSelection: () => ChartSelectionData | null;
  /** Theme switch without remount. */
  setTheme: (theme: "dark" | "light") => void;
  /** Undo / redo passthrough. */
  undo: () => void;
  redo: () => void;
}

interface EditorProps {
  /** Raw .xlsx (or .csv text-as-bytes) buffer to seed the editor. Null = blank. */
  initialBuffer: ArrayBuffer | null;
  initialFormat: "xlsx" | "csv" | null;
  /** Optional pre-parsed CSV options (delimiter, encoding, header). */
  csvOptions?: {
    delimiter?: string;
    encoding?: string;
    hasHeader?: boolean;
  } | null;
  docName: string;
  theme: "dark" | "light";
  onReady: (api: EditorAPI) => void;
  onError: (message: string) => void;
  onDirty: () => void;
  onEditingChange: (editing: boolean) => void;
  onSheetTabsChange?: (tabs: SheetTabInfo[]) => void;
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
          if (cell.f) out.f = `=${cell.f}`;
          if (cell.v !== undefined && cell.v !== null) {
            if (cell.t === "n") out.v = Number(cell.v);
            else if (cell.t === "b") out.v = Boolean(cell.v);
            else out.v = String(cell.v);
          }
          // Number format → Univer's `s.n.pattern`. SheetJS exposes it via `z`.
          if (cell.z && typeof cell.z === "string") {
            out.s = { n: { pattern: cell.z } };
          }
          if (out.v === undefined && !out.f) continue;
          if (!cellData[r]) cellData[r] = {};
          cellData[r][c] = out;
        }
      }
    }

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

  if (order.length === 0) return blankWorkbookData(name);

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

/**
 * Auto-detect a CSV delimiter from the first non-empty line. Returns one of
 * comma / semicolon / tab / pipe — defaults to comma.
 */
function detectDelimiter(text: string): "," | ";" | "\t" | "|" {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const counts: Record<string, number> = {
    ",": (sample.match(/,/g) ?? []).length,
    ";": (sample.match(/;/g) ?? []).length,
    "\t": (sample.match(/\t/g) ?? []).length,
    "|": (sample.match(/\|/g) ?? []).length,
  };
  let best: "," | ";" | "\t" | "|" = ",";
  let bestScore = counts[","];
  for (const k of [";", "\t", "|"] as const) {
    if (counts[k] > bestScore) {
      best = k;
      bestScore = counts[k];
    }
  }
  return best;
}

function csvToUniver(
  text: string,
  name: string,
  options?: EditorProps["csvOptions"]
): IWorkbookData {
  const delimiter =
    options?.delimiter && options.delimiter !== "auto"
      ? options.delimiter === "tab"
        ? "\t"
        : options.delimiter
      : detectDelimiter(text);
  const wb = XLSX.read(text, {
    type: "string",
    FS: delimiter,
    raw: false,
  });
  return sheetjsToUniver(wb, name);
}

function univerToSheetjs(snapshot: IWorkbookData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const styles = snapshot.styles ?? {};
  for (const sheetId of snapshot.sheetOrder) {
    const sheet = snapshot.sheets[sheetId];
    if (!sheet) continue;
    const aoa: (string | number | boolean | null)[][] = [];
    const cellData = sheet.cellData ?? {};
    let maxRow = 0;
    let maxCol = 0;
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
    for (let r = 0; r <= maxRow; r++) {
      aoa[r] = new Array(maxCol + 1).fill(null);
    }
    const formulaCells: Array<{
      r: number;
      c: number;
      f: string;
      v?: unknown;
      z?: string;
    }> = [];
    const numFmtCells: Array<{ r: number; c: number; z: string }> = [];
    for (const rowKey of Object.keys(cellData)) {
      const r = Number(rowKey);
      if (!Number.isFinite(r)) continue;
      const row = cellData[r] ?? {};
      for (const colKey of Object.keys(row)) {
        const c = Number(colKey);
        if (!Number.isFinite(c)) continue;
        const cell = row[c] as ICellData | undefined;
        if (!cell) continue;
        let pattern: string | undefined;
        if (cell.s) {
          // `s` may be either an inline IStyleData or a reference into
          // `snapshot.styles`. Dereference if it's a string.
          const sObj =
            typeof cell.s === "string"
              ? (styles[cell.s] as IStyleData | undefined)
              : (cell.s as IStyleData);
          if (sObj?.n?.pattern) pattern = sObj.n.pattern;
        }
        if (cell.f) {
          formulaCells.push({
            r,
            c,
            f: cell.f.replace(/^=/, ""),
            v: cell.v ?? undefined,
            z: pattern,
          });
          aoa[r][c] = (cell.v ?? null) as never;
        } else if (cell.v !== undefined && cell.v !== null) {
          aoa[r][c] = cell.v as never;
          if (pattern) numFmtCells.push({ r, c, z: pattern });
        }
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    for (const fc of formulaCells) {
      const addr = XLSX.utils.encode_cell({ r: fc.r, c: fc.c });
      const existing = ws[addr] || {};
      existing.f = fc.f;
      if (fc.v !== undefined) existing.v = fc.v;
      if (fc.z) existing.z = fc.z;
      ws[addr] = existing;
    }
    for (const nf of numFmtCells) {
      const addr = XLSX.utils.encode_cell({ r: nf.r, c: nf.c });
      const existing = ws[addr];
      if (existing) existing.z = nf.z;
    }
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
  csvOptions,
  docName,
  theme,
  onReady,
  onError,
  onDirty,
  onEditingChange,
  onSheetTabsChange,
}: EditorProps) {
  // Inner host — what Univer mounts into. Absolute-positioned inside the
  // wrapper so it ALWAYS fills the parent regardless of any flex quirks.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const univerRef = useRef<Univer | null>(null);
  // FUniver is the friendly facade — see imports above.
  const apiRef = useRef<FUniver | null>(null);

  // Univer's UIPlugin reads container dimensions at registerPlugin time. If
  // the host is 0×0 then (dynamic import resolved before layout settled, or
  // a parent still animating), the canvas never sizes correctly and the
  // grid renders invisible. Gate the mount on a measurable size.
  const [hasSize, setHasSize] = useState(false);

  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onDirtyRef = useRef(onDirty);
  const onEditingRef = useRef(onEditingChange);
  const onTabsRef = useRef(onSheetTabsChange);
  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
    onDirtyRef.current = onDirty;
    onEditingRef.current = onEditingChange;
    onTabsRef.current = onSheetTabsChange;
  }, [onReady, onError, onDirty, onEditingChange, onSheetTabsChange]);

  // Live theme switching without remount.
  useEffect(() => {
    apiRef.current?.toggleDarkMode(theme === "dark");
  }, [theme]);

  // -----------------------------------------------------------------------
  // Wait for the host to have non-zero dimensions before mounting Univer.
  // useLayoutEffect runs synchronously after DOM mutation, before paint, so
  // we measure as early as possible. ResizeObserver covers the case where
  // the parent is mid-animation or still resolving its flex layout.
  // -----------------------------------------------------------------------
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setHasSize(true);
        return true;
      }
      return false;
    };
    if (measure()) return;
    const ro = new ResizeObserver(() => {
      if (measure()) ro.disconnect();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // -----------------------------------------------------------------------
  // Mount Univer once the container is sized.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasSize) return;
    const container = containerRef.current;
    if (!container) return;

    // Defensive: if anything got left in the host (stale Univer DOM from a
    // previous mount that didn't tear down cleanly), wipe it before Univer
    // appends its fresh tree. New/Import remounts use a `key` bump in the
    // shell, but this guards against any edge case where the same node is
    // reused across mounts.
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    let disposed = false;
    let univer: Univer | null = null;
    let listeners: Array<() => void> = [];

    (async () => {
      try {
        let workbookData: IWorkbookData;
        if (initialBuffer && initialFormat === "xlsx") {
          const wb = XLSX.read(initialBuffer, {
            type: "array",
            cellFormula: true,
            cellNF: true,
          });
          workbookData = sheetjsToUniver(wb, docName);
        } else if (initialBuffer && initialFormat === "csv") {
          const encoding = csvOptions?.encoding ?? "utf-8";
          const text = new TextDecoder(encoding).decode(
            new Uint8Array(initialBuffer)
          );
          workbookData = csvToUniver(text, docName, csvOptions);
        } else {
          workbookData = blankWorkbookData(docName);
        }

        if (disposed) return;

        univer = new Univer({
          locale: LocaleType.EN_US,
          darkMode: theme === "dark",
          logLevel: LogLevel.SILENT,
          locales: {
            [LocaleType.EN_US]: Tools.deepMerge(
              {},
              DesignEnUS,
              UIEnUS,
              SheetsEnUS,
              SheetsUIEnUS,
              SheetsFormulaEnUS,
              SheetsFormulaUIEnUS,
              SheetsSortUIEnUS,
              SheetsFilterUIEnUS,
              SheetsCondFmtUIEnUS,
              FindReplaceEnUS
            ),
          },
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
        univer.registerPlugin(UniverSheetsNumfmtPlugin);
        univer.registerPlugin(UniverSheetsFormulaPlugin);
        univer.registerPlugin(UniverSheetsFormulaUIPlugin);
        univer.registerPlugin(UniverSheetsSortPlugin);
        univer.registerPlugin(UniverSheetsSortUIPlugin);
        univer.registerPlugin(UniverSheetsFilterPlugin);
        univer.registerPlugin(UniverSheetsFilterUIPlugin);
        univer.registerPlugin(UniverSheetsConditionalFormattingPlugin);
        univer.registerPlugin(UniverSheetsConditionalFormattingUIPlugin);
        univer.registerPlugin(UniverFindReplacePlugin);
        univer.registerPlugin(UniverSheetsFindReplacePlugin);

        if (disposed) {
          univer.dispose();
          return;
        }

        univer.createUnit(UniverInstanceType.UNIVER_SHEET, workbookData);

        const api = FUniver.newAPI(univer);
        univerRef.current = univer;
        apiRef.current = api;

        // Helpers --------------------------------------------------------
        const getXlsxBuffer = async (): Promise<ArrayBuffer> => {
          const fwb = api.getActiveWorkbook();
          if (!fwb) throw new Error("Editor not ready");
          const snapshot = fwb.save();
          const cloned = Tools.deepClone(snapshot) as IWorkbookData;
          const sjs = univerToSheetjs(cloned);
          return XLSX.write(sjs, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
        };

        const setNumberFormat = (pattern: string) => {
          const range = api.getActiveWorkbook()?.getActiveRange();
          if (!range) return;
          range.setNumberFormat(pattern);
          onDirtyRef.current();
        };

        const setStyle = (style: Partial<IStyleData>) => {
          const range = api.getActiveWorkbook()?.getActiveRange();
          if (!range) return;
          if (style.bg?.rgb) range.setBackgroundColor(style.bg.rgb);
          if (style.cl?.rgb) range.setFontColor(style.cl.rgb);
          if (style.bl !== undefined) {
            range.setFontWeight(style.bl ? "bold" : "normal");
          }
          onDirtyRef.current();
        };

        // Increase/decrease decimals using the numfmt commands directly.
        const changeDecimals = (delta: 1 | -1) => {
          const id =
            delta === 1
              ? "sheet.command.numfmt.add.decimal.command"
              : "sheet.command.numfmt.subtract.decimal.command";
          api.executeCommand(id).catch(() => {
            /* noop */
          });
          onDirtyRef.current();
        };

        const sortActive = (asc: boolean) => {
          const fwb = api.getActiveWorkbook();
          const ws = fwb?.getActiveSheet();
          const range = fwb?.getActiveRange();
          if (!ws || !range) return;
          const r = range.getRange();
          // Sort by the first column of the selection.
          ws.sort(r.startColumn, asc);
          onDirtyRef.current();
        };

        const toggleFilter = () => {
          const fwb = api.getActiveWorkbook();
          const ws = fwb?.getActiveSheet();
          const range = fwb?.getActiveRange();
          if (!ws || !range) return;
          if (ws.getFilter()) {
            ws.getFilter()?.remove();
          } else {
            range.createFilter();
          }
          onDirtyRef.current();
        };

        const openFindReplace = () => {
          api.executeCommand("ui.operation.open-find-dialog").catch(() => {
            /* noop */
          });
        };

        const openConditionalFormat = () => {
          api
            .executeCommand("sheet.operation.open.conditional.formatting.panel")
            .catch(() => {
              /* noop */
            });
        };

        const freezeRows = (n: number) => {
          api.getActiveWorkbook()?.getActiveSheet()?.setFrozenRows(n);
          onDirtyRef.current();
        };
        const freezeColumns = (n: number) => {
          api.getActiveWorkbook()?.getActiveSheet()?.setFrozenColumns(n);
          onDirtyRef.current();
        };
        const freezeTopRow = () => freezeRows(1);
        const freezeFirstColumn = () => freezeColumns(1);
        const unfreeze = () => {
          freezeRows(0);
          freezeColumns(0);
        };

        const insertSheet = (name?: string) => {
          api.getActiveWorkbook()?.insertSheet(name);
          onDirtyRef.current();
          notifyTabs();
        };
        const deleteActiveSheet = () => {
          api.getActiveWorkbook()?.deleteActiveSheet();
          onDirtyRef.current();
          notifyTabs();
        };
        const duplicateActiveSheet = () => {
          api.getActiveWorkbook()?.duplicateActiveSheet();
          onDirtyRef.current();
          notifyTabs();
        };
        const renameActiveSheet = (name: string) => {
          api.getActiveWorkbook()?.getActiveSheet()?.setName(name);
          onDirtyRef.current();
          notifyTabs();
        };
        const setActiveSheet = (sheetId: string) => {
          api.getActiveWorkbook()?.setActiveSheet(sheetId);
          notifyTabs();
        };

        const listSheetsImpl = (): SheetTabInfo[] => {
          const fwb = api.getActiveWorkbook();
          if (!fwb) return [];
          const active = fwb.getActiveSheet();
          const activeId = active?.getSheetId() ?? null;
          return fwb.getSheets().map((s, i) => ({
            id: s.getSheetId(),
            name: s.getSheetName(),
            active: s.getSheetId() === activeId,
            index: i,
          }));
        };
        const notifyTabs = () => {
          try {
            onTabsRef.current?.(listSheetsImpl());
          } catch {
            /* noop */
          }
        };

        const getChartSelection = (): ChartSelectionData | null => {
          const fwb = api.getActiveWorkbook();
          const ws = fwb?.getActiveSheet();
          const range = fwb?.getActiveRange();
          if (!ws || !range) return null;
          const r = range.getRange();
          const values = range.getValues();
          if (!values || values.length === 0) return null;
          const headers: string[] = [];
          const firstRow = values[0] ?? [];
          for (let c = 0; c < firstRow.length; c++) {
            headers.push(String(firstRow[c] ?? ""));
          }
          const rows: ChartSelectionData["rows"] = [];
          for (let i = 1; i < values.length; i++) {
            const row = values[i];
            if (!row) continue;
            const label = String(row[0] ?? "");
            const series: number[] = [];
            for (let c = 1; c < row.length; c++) {
              const v = Number(row[c]);
              series.push(Number.isFinite(v) ? v : 0);
            }
            rows.push({ label, values: series });
          }
          const a1 = `${XLSX.utils.encode_col(r.startColumn)}${r.startRow + 1}:${XLSX.utils.encode_col(r.endColumn)}${r.endRow + 1}`;
          return { range: a1, headers, rows };
        };

        const setTheme = (next: "dark" | "light") => {
          api.toggleDarkMode(next === "dark");
        };

        const undo = () => {
          api.undo();
        };
        const redo = () => {
          api.redo();
        };

        const editorAPI: EditorAPI = {
          getXlsxBuffer,
          setNumberFormat,
          setStyle,
          changeDecimals,
          sortActive,
          toggleFilter,
          openFindReplace,
          openConditionalFormat,
          freezeTopRow,
          freezeFirstColumn,
          freezeRows,
          freezeColumns,
          unfreeze,
          insertSheet,
          deleteActiveSheet,
          duplicateActiveSheet,
          renameActiveSheet,
          setActiveSheet,
          listSheets: listSheetsImpl,
          getChartSelection,
          setTheme,
          undo,
          redo,
        };

        onReadyRef.current(editorAPI);
        notifyTabs();

        // Dirty / editing tracking ---------------------------------------
        // Univer fires every state change through `onCommandExecuted`. Skip
        // pure read commands (selection, focus) — only persistable mutations.
        const dirtyCmdPattern = /^(sheet\.|doc\.|formula\.).*\b(set|add|remove|insert|delete|move|sort|filter|copy|paste|undo|redo|conditional)/i;
        const dispCmd = api.addEvent(api.Event.CommandExecuted, (event) => {
          const id = event?.id ?? "";
          if (!id) return;
          if (dirtyCmdPattern.test(id)) {
            onDirtyRef.current();
          }
          if (
            id === "sheet.operation.set-worksheet-active" ||
            id === "sheet.command.insert-sheet" ||
            id === "sheet.command.remove-sheet" ||
            id === "sheet.command.set-worksheet-name" ||
            id === "sheet.command.set-worksheet-order"
          ) {
            notifyTabs();
          }
        });
        listeners.push(() => dispCmd.dispose());

        // Cell-editor focus tracking — pause autosave while cell is open.
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
        container.addEventListener("focusin", onFocusIn, true);
        container.addEventListener("focusout", onFocusOut, true);
        listeners.push(
          () => container.removeEventListener("focusin", onFocusIn, true),
          () => container.removeEventListener("focusout", onFocusOut, true)
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[sheets] failed to mount Univer", err);
        const message =
          err instanceof Error
            ? err.message
            : "Couldn't load the spreadsheet engine";
        try {
          onErrorRef.current(message);
        } catch {
          /* noop */
        }
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
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSize]);

  // Outer wrapper: establishes the flex slot + a positioning context.
  // `min-h-0` is the missing-piece fix for nested flex columns — without it,
  // `flex-1` parents can compute height from content rather than from the
  // available space, leaving Univer's host effectively 0px tall.
  // Inner host: absolutely fills the wrapper. Univer registers its UIPlugin
  // against this node, so it ALWAYS has measurable dimensions.
  return (
    <div
      className="relative h-full min-h-0 w-full flex-1 bg-app-elevated"
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
        data-univer-host
      />
    </div>
  );
}
