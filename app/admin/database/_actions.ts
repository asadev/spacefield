"use server";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import {
  assertSelectOnly,
  execManagementSql,
  quoteLiteral,
  rowsToCsv,
  validateIdent,
  type ExecResult,
} from "./_helpers";

/**
 * Run an arbitrary SELECT query against the project database.
 *
 * Only SELECT is allowed — `assertSelectOnly()` is the gate. Successful
 * runs are written to admin_audit_log (action `db.query`). Returns a
 * structured `ExecResult` plus an `error` string so the calling client
 * component can render either path without throwing.
 */
export async function runSql(formData: FormData): Promise<{
  ok: true;
  result: ExecResult;
} | {
  ok: false;
  error: string;
}> {
  await assertAdmin();
  const sql = String(formData.get("sql") ?? "").trim();
  try {
    assertSelectOnly(sql);
    const result = await execManagementSql(sql);
    await recordAdminAction({
      action: "db.query",
      metadata: {
        sql,
        row_count: result.rowCount,
        duration_ms: result.durationMs,
      },
    });
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Re-execute a prior SELECT and return CSV text. Caller writes it to a
 * file via `<a href={"data:..."} download>`.
 */
export async function exportQuery(
  formData: FormData
): Promise<{ ok: true; csv: string; filename: string } | { ok: false; error: string }> {
  await assertAdmin();
  const sql = String(formData.get("sql") ?? "").trim();
  try {
    assertSelectOnly(sql);
    const result = await execManagementSql(sql);
    const csv = rowsToCsv(result.rows, result.columns);
    await recordAdminAction({
      action: "db.export_query",
      metadata: {
        sql,
        row_count: result.rowCount,
        duration_ms: result.durationMs,
      },
    });
    return {
      ok: true,
      csv,
      filename: `query-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Export the full result of a table-viewer query (with current filters
 * + sort applied) to CSV. Caps at 10k rows so we don't OOM the route.
 */
export async function exportTable(
  formData: FormData
): Promise<{ ok: true; csv: string; filename: string } | { ok: false; error: string }> {
  await assertAdmin();
  const tableRaw = String(formData.get("table") ?? "").trim();
  const sortColRaw = String(formData.get("sort") ?? "").trim();
  const sortDirRaw = String(formData.get("dir") ?? "").trim().toLowerCase();
  const filtersRaw = String(formData.get("filters") ?? "").trim();
  try {
    const table = validateIdent(tableRaw);
    let where = "";
    if (filtersRaw) {
      const parsed = JSON.parse(filtersRaw) as Array<{
        col: string;
        kind: string;
        value: string;
      }>;
      const clauses: string[] = [];
      for (const f of parsed) {
        const col = validateIdent(f.col);
        if (f.kind === "text" || f.kind === "uuid") {
          clauses.push(
            `${col}::text ilike ${quoteLiteral(`%${f.value}%`)}`
          );
        } else if (f.kind === "numeric") {
          const n = Number(f.value);
          if (Number.isFinite(n)) {
            clauses.push(`${col} = ${n}`);
          }
        } else if (f.kind === "boolean") {
          if (f.value === "true" || f.value === "false") {
            clauses.push(`${col} = ${f.value}`);
          }
        }
      }
      if (clauses.length > 0) where = ` where ${clauses.join(" and ")}`;
    }
    let order = "";
    if (sortColRaw) {
      const sortCol = validateIdent(sortColRaw);
      const dir = sortDirRaw === "desc" ? "desc" : "asc";
      order = ` order by ${sortCol} ${dir}`;
    }
    const sql = `select * from public.${table}${where}${order} limit 10000;`;
    assertSelectOnly(sql);
    const result = await execManagementSql(sql);
    const csv = rowsToCsv(result.rows, result.columns);
    await recordAdminAction({
      action: "db.export_table",
      targetType: "table",
      targetId: table,
      metadata: {
        row_count: result.rowCount,
        duration_ms: result.durationMs,
        sort: sortColRaw || null,
        dir: sortDirRaw || null,
      },
    });
    return {
      ok: true,
      csv,
      filename: `${table}-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
