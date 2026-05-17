import "server-only";

import { createClient } from "@/lib/supabase/server";

import { validateRow } from "../validate";
import type { ImportResult, ImportRowInput } from "./types";

/**
 * Insert CRM contacts. The schema column `full_name` is split into
 * `first_name` / `last_name` at the first space when those aren't
 * supplied separately — matches the existing CRM contact shape.
 *
 * Inserts in batches of 10 via Promise.all for parallelism while
 * staying well below the supabase request payload limit.
 */
export async function importContacts(
  workspaceId: string,
  userId: string,
  rows: ImportRowInput[],
  mapping: Record<string, string | null>
): Promise<ImportResult> {
  const supabase = await createClient();
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
  const BATCH = 10;

  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (raw, j) => {
        const rowIndex = i + j;
        const v = validateRow("contacts", raw, mapping);
        if (!v.hasRequired) {
          result.skipped += 1;
          for (const err of v.errors) {
            result.errors.push({ row: rowIndex, field: err.field, message: err.message });
          }
          return;
        }
        // Type-level errors (bad email etc.) → skip the row but report.
        const typeErrs = v.errors.filter((e) => !e.message.endsWith("is required"));
        if (typeErrs.length > 0) {
          result.skipped += 1;
          for (const err of typeErrs) {
            result.errors.push({ row: rowIndex, field: err.field, message: err.message });
          }
          return;
        }

        // Split full_name when first/last aren't provided.
        let firstName = v.data.first_name ?? null;
        let lastName = v.data.last_name ?? null;
        if ((!firstName || !lastName) && v.data.full_name) {
          const parts = v.data.full_name.split(/\s+/);
          if (!firstName) firstName = parts[0] ?? null;
          if (!lastName && parts.length > 1) lastName = parts.slice(1).join(" ");
        }

        const payload = {
          workspace_id: workspaceId,
          first_name: firstName,
          last_name: lastName,
          email: v.data.email ?? null,
          phone: v.data.phone ?? null,
          job_title: v.data.title ?? null,
          notes: v.data.notes ?? null,
          created_by: userId,
        };

        const { error } = await supabase
          .from("crm_contacts")
          .insert(payload);
        if (error) {
          result.skipped += 1;
          result.errors.push({ row: rowIndex, message: error.message });
          return;
        }
        result.imported += 1;
      })
    );
  }

  return result;
}
