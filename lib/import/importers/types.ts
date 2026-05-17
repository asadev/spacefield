/**
 * Shared types for entity importers. Each importer takes parsed CSV
 * rows + the user's header→target mapping and returns a summary.
 */

export type ImportRowInput = Record<string, string>;

export interface ImportRowError {
  row: number;
  field?: string;
  message: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: ImportRowError[];
}
