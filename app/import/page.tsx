import Link from "next/link";

import { ENTITY_BLURBS, ENTITY_KEYS, ENTITY_LABELS } from "@/lib/import/schemas";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Import",
  description: "Import contacts, leads, employees, or tasks from a CSV.",
};

const ENTITY_ICONS: Record<(typeof ENTITY_KEYS)[number], string> = {
  contacts: "👤",
  leads: "🎯",
  employees: "👥",
  tasks: "✅",
};

/**
 * Entry page for the CSV import wizard. Asks the user *what* they're
 * importing first, then routes to the entity-specific wizard.
 */
export default function ImportPickerPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-app">Import from CSV</h1>
        <p className="mt-2 text-sm text-muted">
          Bring data over from another tool. Drop a CSV, map the columns,
          we&apos;ll do the rest.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {ENTITY_KEYS.map((key) => (
          <Link
            key={key}
            href={`/import/${key}`}
            className="group rounded-xl border border-app bg-app-elevated p-5 transition hover:border-tool-accent/60 hover:bg-app-hover"
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl" aria-hidden>
                {ENTITY_ICONS[key]}
              </div>
              <div className="flex-1">
                <div className="text-base font-medium text-app">
                  {ENTITY_LABELS[key]}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {ENTITY_BLURBS[key]}
                </p>
              </div>
              <span
                className="self-center text-muted opacity-0 transition group-hover:opacity-100"
                aria-hidden
              >
                →
              </span>
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-xs text-muted">
        Up to 10 MB / 50,000 rows per file. Need to import something else?
        Tell us — the schema is one file.
      </p>
    </div>
  );
}
