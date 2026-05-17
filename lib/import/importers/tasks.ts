import "server-only";

import { createTask } from "@/lib/tasks/server";
import type { TaskRow } from "@/lib/tasks/types";

import { validateRow } from "../validate";
import type { ImportResult, ImportRowInput } from "./types";

type TaskPriority = NonNullable<TaskRow["priority"]>;
const PRIORITIES: readonly TaskPriority[] = ["urgent", "high", "normal", "low"];

/**
 * Insert tasks via the existing `createTask` helper so search-indexing
 * happens consistently. Date strings are turned into ISO timestamps
 * (validator already normalised dates to yyyy-mm-dd; we anchor at noon
 * UTC so the date doesn't roll over on tz conversion).
 */
export async function importTasks(
  workspaceId: string,
  userId: string,
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
        const v = validateRow("tasks", raw, mapping);
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

        let priority: TaskPriority | undefined;
        if (v.data.priority && PRIORITIES.includes(v.data.priority as TaskPriority)) {
          priority = v.data.priority as TaskPriority;
        }

        let due_at: string | null = null;
        if (v.data.due_at) {
          // validator normalised to yyyy-mm-dd; anchor at noon UTC
          due_at = `${v.data.due_at}T12:00:00.000Z`;
        }

        try {
          await createTask({
            workspace_id: workspaceId,
            title: v.data.title ?? "",
            description: v.data.description ?? null,
            status: v.data.status ?? undefined,
            priority,
            due_at,
            created_by: userId,
          });
          result.imported += 1;
        } catch (err) {
          result.skipped += 1;
          result.errors.push({
            row: rowIndex,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      })
    );
  }

  return result;
}
