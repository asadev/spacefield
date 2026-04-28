/* ─────────────────────────────────────────────────────────────────────────
 * CRM Boards — TypeScript types.
 * Mirrors 20260428_crm_boards.sql. The boards system is the Monday-style
 * generic-spreadsheet layer that lives ON TOP of the fixed CRM (contacts,
 * companies, deals, leads, inventory, activities). Anything that doesn't
 * fit those typed entities goes into a board.
 *
 * Conventions
 * ───────────
 * - DB rows use snake_case — types match.
 * - All cell values live inside `crm_board_records.data` keyed by
 *   `crm_board_columns.field_key`. Cell value shapes per column type
 *   are described in BoardCellValue below; the actual stored type is
 *   `unknown` because we hold the union loosely until the editor reads it.
 * ───────────────────────────────────────────────────────────────────── */

// ─── enums ──────────────────────────────────────────────────────────────

export const BOARD_KIND_VALUES = [
  "marketing",
  "projects",
  "onboarding",
  "accounts",
  "custom",
] as const;
export type BoardKind = (typeof BOARD_KIND_VALUES)[number];

export const BOARD_FIELD_TYPE_VALUES = [
  "text",
  "longtext",
  "number",
  "currency",
  "percent",
  "rating",
  "date",
  "datetime",
  "status",
  "dropdown",
  "multiselect",
  "checkbox",
  "person",
  "people",
  "link",
  "email",
  "phone",
  "file",
  "formula",
] as const;
export type BoardFieldType = (typeof BOARD_FIELD_TYPE_VALUES)[number];

export const BOARD_VIEW_TYPE_VALUES = [
  "table",
  "kanban",
  "calendar",
  "timeline",
  "cards",
  "form",
  "chart",
] as const;
export type BoardViewType = (typeof BOARD_VIEW_TYPE_VALUES)[number];

// ─── column config shapes ───────────────────────────────────────────────

export interface BoardStatusOption {
  value: string;
  label: string;
  color: string; // hex
}

export interface BoardDropdownOption {
  value: string;
  label: string;
  color?: string;
}

export interface BoardColumnConfigStatus {
  options: BoardStatusOption[];
}
export interface BoardColumnConfigDropdown {
  options: BoardDropdownOption[];
}
export interface BoardColumnConfigMultiselect {
  options: BoardDropdownOption[];
}
export interface BoardColumnConfigNumber {
  prefix?: string;
  suffix?: string;
  decimals?: number;
}
export interface BoardColumnConfigCurrency {
  code?: string; // ISO-4217
  decimals?: number;
}
export interface BoardColumnConfigPercent {
  decimals?: number;
}
export interface BoardColumnConfigRating {
  max?: number; // default 5
}
export interface BoardColumnConfigFormula {
  expression: string;
}

export type BoardColumnConfig =
  | Record<string, never>
  | BoardColumnConfigStatus
  | BoardColumnConfigDropdown
  | BoardColumnConfigMultiselect
  | BoardColumnConfigNumber
  | BoardColumnConfigCurrency
  | BoardColumnConfigPercent
  | BoardColumnConfigRating
  | BoardColumnConfigFormula;

// ─── view config ────────────────────────────────────────────────────────

export interface BoardViewFilter {
  field: string; // field_key, or special: "name", "created_at"
  op:
    | "eq"
    | "neq"
    | "in"
    | "nin"
    | "contains"
    | "starts_with"
    | "ends_with"
    | "is_empty"
    | "is_not_empty"
    | "gt"
    | "gte"
    | "lt"
    | "lte";
  value?: unknown;
}

export interface BoardViewSort {
  field: string;
  direction: "asc" | "desc";
}

export interface BoardViewConfig {
  filters?: BoardViewFilter[];
  sort?: BoardViewSort[];
  group_by?: string;
  hidden_columns?: string[];
  /** Calendar/timeline view: which date field to plot. */
  date_field?: string;
  /** Timeline: end date. */
  end_date_field?: string;
}

// ─── row types — one per table ──────────────────────────────────────────

export interface CrmBoard {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  kind: BoardKind;
  description: string | null;
  icon: string | null;
  color: string | null;
  position: number;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmBoardColumn {
  id: string;
  board_id: string;
  field_key: string;
  label: string;
  field_type: BoardFieldType;
  config: BoardColumnConfig;
  required: boolean;
  width: number;
  position: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmBoardRecord {
  id: string;
  board_id: string;
  workspace_id: string;
  data: Record<string, unknown>;
  position: number;
  parent_id: string | null;
  created_by: string | null;
  assignee_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface CrmBoardView {
  id: string;
  board_id: string;
  workspace_id: string;
  name: string;
  view_type: BoardViewType;
  config: BoardViewConfig;
  is_default: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

// ─── joined / hydrated shapes ───────────────────────────────────────────

export interface BoardSummary extends CrmBoard {
  record_count: number;
}

export interface FullBoard {
  board: CrmBoard;
  columns: CrmBoardColumn[];
  views: CrmBoardView[];
}

// ─── input payload shapes ───────────────────────────────────────────────

export interface BoardCreateBody {
  workspace_id: string;
  template_id?: string;
  name?: string;
  kind?: BoardKind;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
}

export interface BoardUpdateBody {
  name?: string;
  slug?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  position?: number;
  archived_at?: string | null;
}

export interface BoardColumnCreateBody {
  field_key: string;
  label: string;
  field_type: BoardFieldType;
  config?: BoardColumnConfig;
  required?: boolean;
  width?: number;
  position?: number;
}

export interface BoardColumnUpdateBody {
  label?: string;
  field_type?: BoardFieldType;
  config?: BoardColumnConfig;
  required?: boolean;
  width?: number;
  position?: number;
  archived_at?: string | null;
}

export interface BoardRecordCreateBody {
  data?: Record<string, unknown>;
  position?: number;
  parent_id?: string | null;
  assignee_ids?: string[];
}

export interface BoardRecordUpdateBody {
  /** Partial merge into `data` jsonb — keys present here overwrite,
   * other keys remain untouched. */
  data?: Record<string, unknown>;
  position?: number;
  parent_id?: string | null;
  assignee_ids?: string[];
}

export interface BoardViewCreateBody {
  name: string;
  view_type: BoardViewType;
  config?: BoardViewConfig;
  is_default?: boolean;
  position?: number;
}

export interface BoardViewUpdateBody {
  name?: string;
  view_type?: BoardViewType;
  config?: BoardViewConfig;
  is_default?: boolean;
  position?: number;
}
