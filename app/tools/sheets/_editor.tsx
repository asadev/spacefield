"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Sheets editor — Univer + ExcelJS (pro-tier)
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

     .xlsx bytes      ──exceljs load──► Workbook ──exceljsToUniver──► IWorkbookData
     IWorkbookData    ──univerToExceljs──► Workbook ──xlsx.writeBuffer──► .xlsx bytes

   SE-002: ported off the `xlsx` (SheetJS) package — it had unpatched
   prototype-pollution + ReDoS CVEs (CVE-2023-30533, CVE-2024-22363).
   exceljs handles cell values, formulas, number formats, and merges; the
   round-trip preserves what Univer actually uses.
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

import ExcelJS from "exceljs";

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
// A1 helpers (replacing XLSX.utils.encode_col / encode_cell).
// 0-based column index → letters: 0 → "A", 25 → "Z", 26 → "AA".
// ---------------------------------------------------------------------------

function encodeCol(col: number): string {
  let n = col;
  let out = "";
  while (n >= 0) {
    out = String.fromCharCode((n % 26) + 65) + out;
    n = Math.floor(n / 26) - 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// ExcelJS workbook ↔ Univer IWorkbookData conversions
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

/**
 * Normalize an exceljs CellValue to a primitive Univer can store.
 * Exceljs returns rich text as `{ richText: [...] }` and dates as Date objects;
 * Univer's `v` field accepts string/number/boolean.
 */
function exceljsCellValueToPrimitive(
  v: unknown
): string | number | boolean | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return v;
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const obj = v as {
      richText?: Array<{ text?: string }>;
      text?: string;
      result?: unknown;
      formula?: string;
      hyperlink?: string;
      error?: string;
    };
    // Hyperlink cell { text, hyperlink }
    if (typeof obj.text === "string") return obj.text;
    // Rich text { richText: [{ text }, ...] }
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((r) => r?.text ?? "").join("");
    }
    // Formula cell { formula, result } — surface the cached result as `v`.
    if ("result" in obj) {
      return exceljsCellValueToPrimitive(obj.result);
    }
    if (typeof obj.error === "string") return obj.error;
  }
  return undefined;
}

/** Extract a formula string from an exceljs cell value, if any. */
function exceljsCellFormula(v: unknown): string | undefined {
  if (v && typeof v === "object") {
    const obj = v as { formula?: string; sharedFormula?: string };
    if (typeof obj.formula === "string") return obj.formula;
    if (typeof obj.sharedFormula === "string") return obj.sharedFormula;
  }
  return undefined;
}

function exceljsToUniver(wb: ExcelJS.Workbook, name: string): IWorkbookData {
  const sheets: Record<string, Partial<IWorksheetData>> = {};
  const order: string[] = [];

  let idx = 0;
  for (const ws of wb.worksheets) {
    const sheetId = `sheet-${idx + 1}`;
    order.push(sheetId);
    idx += 1;

    const cellData: IObjectMatrixPrimitiveType<ICellData> = {};
    let maxRow = 0;
    let maxCol = 0;

    // exceljs is 1-indexed on rows AND columns; Univer is 0-indexed.
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const r = rowNumber - 1;
      // row.eachCell skips empty trailing cells; we want that — Univer's
      // cellData is sparse and undefined slots are fine.
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const c = colNumber - 1;
        const out: ICellData = {};
        const f = exceljsCellFormula(cell.value);
        if (f) out.f = f.startsWith("=") ? f : `=${f}`;
        const prim = exceljsCellValueToPrimitive(cell.value);
        if (prim !== undefined) out.v = prim;
        // Number format → Univer's `s.n.pattern`. exceljs exposes it via
        // `cell.numFmt` (string).
        const numFmt = (cell as { numFmt?: string }).numFmt;
        if (numFmt && typeof numFmt === "string" && numFmt !== "General") {
          out.s = { n: { pattern: numFmt } };
        }
        if (out.v === undefined && !out.f) return;
        if (r > maxRow) maxRow = r;
        if (c > maxCol) maxCol = c;
        if (!cellData[r]) cellData[r] = {};
        cellData[r][c] = out;
      });
    });

    // Merges live on the worksheet model as A1 ranges, e.g. "B2:C4".
    const mergeData: NonNullable<IWorksheetData["mergeData"]> = [];
    const merges = ws.model?.merges ?? [];
    for (const m of merges) {
      // m is a string like "B2:C4"
      const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(String(m).toUpperCase());
      if (!match) continue;
      const sc = colLettersToIndex(match[1]);
      const sr = Number(match[2]) - 1;
      const ec = colLettersToIndex(match[3]);
      const er = Number(match[4]) - 1;
      mergeData.push({
        startRow: sr,
        startColumn: sc,
        endRow: er,
        endColumn: ec,
      });
    }

    sheets[sheetId] = {
      id: sheetId,
      name: ws.name,
      rowCount: Math.max(maxRow + 1, 100),
      columnCount: Math.max(maxCol + 1, 26),
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

/** "AA" → 26 (0-based). Inverse of encodeCol. */
function colLettersToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
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

/**
 * Minimal RFC-4180-ish CSV parser. Handles quoted fields, escaped quotes
 * ("" inside a quoted field), CR/LF/CRLF line endings, and a single-char
 * delimiter. Returns a 2-D array of strings.
 */
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      // Eat \r\n as a single line break.
      i += text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Flush the trailing field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
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

  const rows = parseCsv(text, delimiter);
  const sheetId = "sheet-1";
  const cellData: IObjectMatrixPrimitiveType<ICellData> = {};
  let maxCol = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const raw = row[c];
      if (raw === "" || raw === undefined) continue;
      // Coerce numeric-looking cells. CSV has no types, but the previous
      // implementation passed `raw: false` so SheetJS also coerced.
      const asNum = Number(raw);
      const v: string | number | boolean =
        raw === "true"
          ? true
          : raw === "false"
            ? false
            : raw !== "" && !Number.isNaN(asNum) && /^-?\d+(?:\.\d+)?$/.test(raw.trim())
              ? asNum
              : raw;
      if (!cellData[r]) cellData[r] = {};
      cellData[r][c] = { v };
      if (c > maxCol) maxCol = c;
    }
  }
  const sheet: Partial<IWorksheetData> = {
    id: sheetId,
    name: "Sheet1",
    rowCount: Math.max(rows.length, 100),
    columnCount: Math.max(maxCol + 1, 26),
    cellData,
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

async function univerToXlsxBuffer(snapshot: IWorkbookData): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const styles = snapshot.styles ?? {};

  let sheetsAdded = 0;
  for (const sheetId of snapshot.sheetOrder) {
    const sheet = snapshot.sheets[sheetId];
    if (!sheet) continue;
    // Sheet names: exceljs validates them (max 31 chars, no `: \ / ? * [ ]`).
    // Fall back to sheetId if the name would otherwise be rejected.
    const rawName = sheet.name ?? sheetId;
    const safeName = rawName
      .replace(/[\\/?*[\]:]/g, "_")
      .slice(0, 31)
      .trim() || sheetId;
    const ws = wb.addWorksheet(safeName);
    sheetsAdded += 1;
    const cellData = sheet.cellData ?? {};
    for (const rowKey of Object.keys(cellData)) {
      const r = Number(rowKey);
      if (!Number.isFinite(r)) continue;
      const row = cellData[r] ?? {};
      for (const colKey of Object.keys(row)) {
        const c = Number(colKey);
        if (!Number.isFinite(c)) continue;
        const cell = row[c] as ICellData | undefined;
        if (!cell) continue;
        // exceljs is 1-indexed on both axes.
        const target = ws.getCell(r + 1, c + 1);
        let pattern: string | undefined;
        if (cell.s) {
          const sObj =
            typeof cell.s === "string"
              ? (styles[cell.s] as IStyleData | undefined)
              : (cell.s as IStyleData);
          if (sObj?.n?.pattern) pattern = sObj.n.pattern;
        }
        if (cell.f) {
          const formula = cell.f.replace(/^=/, "");
          target.value = {
            formula,
            result:
              cell.v !== undefined && cell.v !== null
                ? (cell.v as number | string | boolean)
                : undefined,
          };
        } else if (cell.v !== undefined && cell.v !== null) {
          target.value = cell.v as ExcelJS.CellValue;
        }
        if (pattern) target.numFmt = pattern;
      }
    }
    if (sheet.mergeData && sheet.mergeData.length > 0) {
      for (const m of sheet.mergeData) {
        try {
          ws.mergeCells(
            m.startRow + 1,
            m.startColumn + 1,
            m.endRow + 1,
            m.endColumn + 1
          );
        } catch {
          // Overlapping/invalid merges — skip rather than break the save.
        }
      }
    }
  }

  if (sheetsAdded === 0) {
    wb.addWorksheet("Sheet1");
  }

  const buf = await wb.xlsx.writeBuffer();
  // exceljs returns a Node `Buffer` in node and a Uint8Array-like in the
  // browser; both expose .buffer/.byteOffset/.byteLength. Normalize to a
  // standalone ArrayBuffer slice so consumers don't accidentally see extra
  // bytes from a shared underlying allocation.
  const view = buf as unknown as ArrayBufferView;
  if (view && typeof view.byteLength === "number" && view.buffer) {
    return view.buffer.slice(
      view.byteOffset,
      view.byteOffset + view.byteLength
    ) as ArrayBuffer;
  }
  return buf as unknown as ArrayBuffer;
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
          const wb = new ExcelJS.Workbook();
          // exceljs declares `load(buffer: Buffer)` but actually accepts any
          // ArrayBuffer at runtime — its own ambient declares
          // `Buffer extends ArrayBuffer`. Cast through `unknown` to satisfy
          // the .d.ts without depending on Node's stricter `Buffer` global.
          await wb.xlsx.load(
            initialBuffer as unknown as Parameters<typeof wb.xlsx.load>[0]
          );
          if (disposed) return;
          workbookData = exceljsToUniver(wb, docName);
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
          return univerToXlsxBuffer(cloned);
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
          const a1 = `${encodeCol(r.startColumn)}${r.startRow + 1}:${encodeCol(r.endColumn)}${r.endRow + 1}`;
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
