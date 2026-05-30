import "server-only";

import { createClient } from "@/lib/supabase/server";
import { LEAD_STATUS_VALUES, type CrmLeadStatus } from "@/app/tools/crm/types";
import { indexLead } from "@/lib/crm/search-index";

import { validateRow } from "../validate";
import type { ImportResult, ImportRowInput } from "./types";

/**
 * Insert CRM leads. Same name-splitting heuristic as contacts.
 */
export async function importLeads(
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
        const v = validateRow("leads", raw, mapping);
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

        let firstName = v.data.first_name ?? null;
        let lastName = v.data.last_name ?? null;
        if ((!firstName || !lastName) && v.data.full_name) {
          const parts = v.data.full_name.split(/\s+/);
          if (!firstName) firstName = parts[0] ?? null;
          if (!lastName && parts.length > 1) lastName = parts.slice(1).join(" ");
        }

        let status: CrmLeadStatus = "new";
        if (v.data.status && (LEAD_STATUS_VALUES as readonly string[]).includes(v.data.status)) {
          status = v.data.status as CrmLeadStatus;
        }

        const payload = {
          workspace_id: workspaceId,
          first_name: firstName,
          last_name: lastName,
          email: v.data.email ?? null,
          phone: v.data.phone ?? null,
          source: v.data.source ?? null,
          status,
          notes: v.data.notes ?? null,
          created_by: userId,
        };

        const { data: inserted, error } = await supabase
          .from("crm_leads")
          .insert(payload)
          .select("*")
          .single();
        if (error) {
          result.skipped += 1;
          result.errors.push({ row: rowIndex, message: error.message });
          return;
        }
        result.imported += 1;
        // SYNC-01: index the bulk-imported row into global search.
        // Guarded so an indexer fault can't abort the Promise.all import
        // batch — search staleness must never block the originating write.
        try {
          await indexLead(inserted);
        } catch {
          /* best-effort; indexer already logs internally */
        }
      })
    );
  }

  return result;
}
