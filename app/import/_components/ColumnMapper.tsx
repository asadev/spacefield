"use client";

import { useMemo } from "react";

import type { EntityKey } from "@/lib/import/schemas";
import { SCHEMAS } from "@/lib/import/schemas";

export interface ColumnMapperProps {
  entity: EntityKey;
  headers: string[];
  sampleRows: string[][];
  mapping: Record<string, string | null>;
  onChange: (mapping: Record<string, string | null>) => void;
}

/**
 * Step 2 — show each CSV header next to a dropdown of target fields.
 * Shows a 1-row preview value beside each header so the user can sanity-
 * check what they're mapping. Highlights required fields that haven't
 * been mapped to anything yet.
 */
export default function ColumnMapper({
  entity,
  headers,
  sampleRows,
  mapping,
  onChange,
}: ColumnMapperProps) {
  const cols = SCHEMAS[entity];

  const usedTargets = useMemo(() => {
    const s = new Set<string>();
    for (const v of Object.values(mapping)) if (v) s.add(v);
    return s;
  }, [mapping]);

  const missingRequired = useMemo(
    () => cols.filter((c) => c.required && !usedTargets.has(c.name)),
    [cols, usedTargets]
  );

  const set = (header: string, target: string | null) => {
    onChange({ ...mapping, [header]: target });
  };

  return (
    <div className="space-y-4">
      {missingRequired.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          Required field{missingRequired.length > 1 ? "s" : ""} not mapped:{" "}
          <span className="font-medium">
            {missingRequired.map((c) => c.label).join(", ")}
          </span>
          . Pick a CSV column for each, or the import won&apos;t accept rows
          missing it.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-app">
        <table className="w-full text-sm">
          <thead className="bg-app-elevated text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 text-left">Your CSV column</th>
              <th className="px-4 py-2 text-left">Example value</th>
              <th className="px-4 py-2 text-left">Map to</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((h, i) => {
              const sampleVal = sampleRows[0]?.[i] ?? "";
              const target = mapping[h] ?? null;
              return (
                <tr
                  key={h}
                  className="border-t border-app even:bg-app-elevated/40"
                >
                  <td className="px-4 py-2 font-medium text-app">{h || <em className="text-muted">(empty)</em>}</td>
                  <td className="px-4 py-2 max-w-[14rem] truncate text-muted" title={sampleVal}>
                    {sampleVal || <em>—</em>}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={target ?? ""}
                      onChange={(e) =>
                        set(h, e.target.value === "" ? null : e.target.value)
                      }
                      className="w-full rounded-md border border-app bg-app-elevated px-2 py-1 text-sm text-app"
                    >
                      <option value="">— Skip this column —</option>
                      {cols.map((c) => {
                        const conflict =
                          usedTargets.has(c.name) && target !== c.name;
                        return (
                          <option
                            key={c.name}
                            value={c.name}
                            disabled={conflict}
                          >
                            {c.label}
                            {c.required ? " *" : ""}
                            {conflict ? " (already mapped)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        Fields marked <span className="text-app">*</span> are required.
      </p>
    </div>
  );
}
