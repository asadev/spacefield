import "server-only";

import { createEmployee } from "@/lib/people/actions";
import type { EmploymentType } from "@/lib/people/types";

import { validateRow } from "../validate";
import type { ImportResult, ImportRowInput } from "./types";

const EMP_TYPES: readonly EmploymentType[] = [
  "full_time",
  "part_time",
  "contractor",
  "intern",
];

/**
 * Insert employees via the existing `createEmployee` server action so
 * search-indexing + revalidatePath side-effects fire just like the UI.
 *
 * `createEmployee` already does its own auth check; we still need a
 * `workspaceId` passed through.
 */
export async function importEmployees(
  workspaceId: string,
  _userId: string,
  rows: ImportRowInput[],
  mapping: Record<string, string | null>
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
  const BATCH = 10;

  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (raw, j) => {
        const rowIndex = i + j;
        const v = validateRow("employees", raw, mapping);
        if (!v.hasRequired) {
          result.skipped += 1;
          for (const err of v.errors) {
            result.errors.push({ row: rowIndex, field: err.field, message: err.message });
          }
          return;
        }
        const typeErrs = v.errors.filter((e) => !e.message.endsWith("is required"));
        if (typeErrs.length > 0) {
          result.skipped += 1;
          for (const err of typeErrs) {
            result.errors.push({ row: rowIndex, field: err.field, message: err.message });
          }
          return;
        }

        let employment_type: EmploymentType | undefined;
        if (v.data.employment_type && EMP_TYPES.includes(v.data.employment_type as EmploymentType)) {
          employment_type = v.data.employment_type as EmploymentType;
        }

        const res = await createEmployee({
          workspace_id: workspaceId,
          full_name: v.data.full_name ?? "",
          email: v.data.email ?? undefined,
          job_title: v.data.job_title ?? undefined,
          department: v.data.department ?? undefined,
          location: v.data.location ?? undefined,
          hire_date: v.data.hire_date ?? undefined,
          employment_type,
        });
        if (!res.ok) {
          result.skipped += 1;
          result.errors.push({ row: rowIndex, message: res.error });
          return;
        }
        result.imported += 1;
      })
    );
  }

  return result;
}
