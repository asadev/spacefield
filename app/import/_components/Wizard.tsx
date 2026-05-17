"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { ParsedCsv } from "@/lib/import/csv";
import { autoMap } from "@/lib/import/auto-map";
import type { EntityKey } from "@/lib/import/schemas";
import { ENTITY_LABELS, SCHEMAS } from "@/lib/import/schemas";

import ColumnMapper from "./ColumnMapper";
import ImportRunner from "./ImportRunner";
import Preview from "./Preview";
import Uploader from "./Uploader";

export interface WizardProps {
  entity: EntityKey;
  workspaceId?: string;
}

type Step = 1 | 2 | 3 | 4;

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: "Upload" },
  { id: 2, label: "Map columns" },
  { id: 3, label: "Preview" },
  { id: 4, label: "Import" },
];

/**
 * 4-step wizard. State lives here so the user can step back without
 * losing the file or their mapping decisions.
 */
export default function Wizard({ entity, workspaceId }: WizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [mapping, setMapping] = useState<Record<string, string | null>>({});

  // When a new CSV is parsed, run auto-map and advance.
  useEffect(() => {
    if (!csv) return;
    const { mapping } = autoMap(entity, csv.headers);
    setMapping(mapping);
    setStep(2);
  }, [csv, entity]);

  const requiredMapped = useMemo(() => {
    const required = SCHEMAS[entity].filter((c) => c.required).map((c) => c.name);
    const used = new Set(Object.values(mapping).filter((v): v is string => !!v));
    return required.every((r) => used.has(r));
  }, [entity, mapping]);

  const goto = (s: Step) => {
    // Don't let the user jump forward past a missing requirement.
    if (s > step && s >= 3 && !requiredMapped) return;
    setStep(s);
  };

  return (
    <div className="space-y-6">
      <ol className="flex items-center gap-2 text-xs">
        {STEPS.map((s, i) => {
          const active = s.id === step;
          const done = s.id < step;
          return (
            <li key={s.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goto(s.id)}
                className={`flex items-center gap-2 rounded-full px-2.5 py-1 transition ${
                  active
                    ? "bg-tool-accent text-white"
                    : done
                      ? "bg-app-elevated text-app hover:bg-app-hover"
                      : "text-muted"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium ${
                    active
                      ? "bg-white/20"
                      : done
                        ? "bg-tool-accent text-white"
                        : "bg-app-elevated text-muted"
                  }`}
                >
                  {s.id}
                </span>
                {s.label}
              </button>
              {i < STEPS.length - 1 && (
                <span className="text-muted" aria-hidden>
                  →
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <Uploader
          onParsed={(c, name) => {
            setCsv(c);
            setFileName(name);
          }}
        />
      )}

      {step === 2 && csv && (
        <>
          <FileBadge name={fileName} csv={csv} />
          <ColumnMapper
            entity={entity}
            headers={csv.headers}
            sampleRows={csv.rows}
            mapping={mapping}
            onChange={setMapping}
          />
          <NextBar
            backLabel="Back to upload"
            onBack={() => setStep(1)}
            nextLabel="Preview rows"
            nextDisabled={!requiredMapped}
            onNext={() => setStep(3)}
            hint={!requiredMapped ? "Map every required field first." : undefined}
          />
        </>
      )}

      {step === 3 && csv && (
        <>
          <FileBadge name={fileName} csv={csv} />
          <Preview
            entity={entity}
            headers={csv.headers}
            rows={csv.rows}
            mapping={mapping}
          />
          <NextBar
            backLabel="Back to mapping"
            onBack={() => setStep(2)}
            nextLabel="Run import"
            onNext={() => setStep(4)}
          />
        </>
      )}

      {step === 4 && csv && (
        <>
          <FileBadge name={fileName} csv={csv} />
          <ImportRunner
            entity={entity}
            headers={csv.headers}
            rows={csv.rows}
            mapping={mapping}
            workspaceId={workspaceId}
          />
          <div className="flex items-center justify-between border-t border-app pt-4">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="text-xs text-muted hover:text-app"
            >
              ← Back to preview
            </button>
            <div className="flex gap-2 text-xs">
              <Link
                href="/import"
                className="rounded-lg border border-app px-3 py-1.5 text-app hover:bg-app-hover"
              >
                Import something else
              </Link>
              <Link
                href={destinationFor(entity)}
                className="rounded-lg bg-tool-accent px-3 py-1.5 text-white"
              >
                View {ENTITY_LABELS[entity]}
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function destinationFor(entity: EntityKey): string {
  switch (entity) {
    case "contacts":
      return "/tools/crm?tab=contacts";
    case "leads":
      return "/tools/crm?tab=leads";
    case "employees":
      return "/people";
    case "tasks":
      return "/tasks";
  }
}

function FileBadge({ name, csv }: { name: string; csv: ParsedCsv }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-app bg-app-elevated px-3 py-2 text-xs">
      <span className="text-app font-medium">{name}</span>
      <span className="text-muted">·</span>
      <span className="text-muted">
        {csv.headers.length} column{csv.headers.length === 1 ? "" : "s"} · {csv.total} row
        {csv.total === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function NextBar({
  backLabel,
  onBack,
  nextLabel,
  onNext,
  nextDisabled,
  hint,
}: {
  backLabel: string;
  onBack: () => void;
  nextLabel: string;
  onNext: () => void;
  nextDisabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between border-t border-app pt-4">
      <button
        type="button"
        onClick={onBack}
        className="text-xs text-muted hover:text-app"
      >
        ← {backLabel}
      </button>
      <div className="flex items-center gap-3">
        {hint && <span className="text-xs text-muted">{hint}</span>}
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="rounded-lg bg-tool-accent px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {nextLabel} →
        </button>
      </div>
    </div>
  );
}
