import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getRuntimeConfig,
  getRuntimeConfigRow,
} from "@/lib/runtime-config";

import { buttonClass, formatDateTime, inputClass } from "../../_lib";
import type {
  RuntimeConfigRow,
  RuntimeConfigValueType,
} from "../../_types";

import DeleteConfigButton from "../_components/DeleteConfigButton";
import { updateConfig } from "../_actions";

export const dynamic = "force-dynamic";

const VALUE_TYPE_OPTIONS: {
  id: RuntimeConfigValueType;
  label: string;
  hint: string;
}[] = [
  { id: "string", label: "string", hint: "Plain text." },
  { id: "number", label: "number", hint: "Finite numeric." },
  { id: "boolean", label: "boolean", hint: "true / false." },
  { id: "json", label: "json", hint: "Any JSON-parseable structure." },
  { id: "secret", label: "secret", hint: "Treated as a masked secret." },
];

type PageProps = {
  params: Promise<{ key: string }>;
};

export default async function AdminRuntimeConfigDetailPage({
  params,
}: PageProps) {
  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey).toLowerCase();
  const row = await getRuntimeConfigRow(key);
  if (!row) notFound();

  // Verify the resolver actually returns what the row says — if the
  // row is_secret and the caller (admin) reads it, this should match
  // the stored value. Surfaces drift if there's ever a code change.
  let resolvedDisplay = "—";
  let resolverError: string | null = null;
  try {
    const resolved = await getRuntimeConfig<unknown>(row.key);
    resolvedDisplay =
      resolved === undefined || resolved === null
        ? "—"
        : typeof resolved === "string"
          ? resolved
          : JSON.stringify(resolved);
  } catch (e) {
    resolverError = e instanceof Error ? e.message : "resolver error";
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/runtime-config"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Runtime config
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold text-app">
            {row.key}
          </h1>
          <ValueTypeChip valueType={row.value_type} />
          {row.is_secret && (
            <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              🔒 secret
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          <span className="rounded-md border border-app bg-app px-2 py-1">
            category: {row.category}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            updated {formatDateTime(row.updated_at)}
          </span>
        </div>
      </div>

      {/* Resolver verification */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">
          Resolved value
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          Output of{" "}
          <code className="rounded bg-app px-1 text-[11px]">
            getRuntimeConfig(&quot;{row.key}&quot;)
          </code>{" "}
          right now (cache may be up to 30s warm). Used by code at runtime.
        </p>
        {resolverError ? (
          <pre className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 font-mono text-[11px] text-rose-500">
            {resolverError}
          </pre>
        ) : (
          <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-app bg-app p-3 font-mono text-[11px] text-app">
            {resolvedDisplay}
          </pre>
        )}
        <UsedByHint configKey={row.key} />
      </section>

      {/* Edit form */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Edit config</h2>
        <form action={updateConfig} className="mt-4 space-y-4">
          <input type="hidden" name="key" value={row.key} />

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Category" hint="Used to group rows in the index.">
              <input
                type="text"
                name="category"
                defaultValue={row.category}
                className={inputClass}
              />
            </Field>
            <Field
              label="Value type"
              hint="Determines how code coerces the stored JSON."
            >
              <select
                name="value_type"
                defaultValue={row.value_type}
                className={inputClass}
              >
                {VALUE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label} — {opt.hint}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Description">
            <textarea
              name="description"
              defaultValue={row.description}
              rows={2}
              className={inputClass}
            />
          </Field>

          <ValueEditor row={row} />

          <Field
            label="Mark as secret"
            hint="Masks value in the index and hides it from non-admin reads via getRuntimeConfig."
          >
            <label className="flex h-[42px] items-center gap-3 rounded-lg border border-app bg-app px-3 text-sm text-app">
              <input
                type="checkbox"
                name="is_secret"
                defaultChecked={row.is_secret}
                className="h-4 w-4 rounded border-app accent-tool-accent"
              />
              <span>Treat this value as a secret</span>
            </label>
            {!row.is_secret && (
              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                Heads up: secrets are masked in the index. Non-admin code
                paths get null when reading.
              </p>
            )}
          </Field>

          <div className="flex flex-wrap items-center gap-3 border-t border-app pt-4">
            <button type="submit" className={buttonClass}>
              Save changes
            </button>
            <span className="text-[11px] text-muted">
              Cache busts on save — readers see the new value within ~30s.
            </span>
          </div>
        </form>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
        <h2 className="text-sm font-semibold text-rose-500">Danger zone</h2>
        <p className="mt-0.5 text-xs text-rose-500/80">
          Deleting this row makes{" "}
          <code className="rounded bg-app px-1 text-[11px]">
            getRuntimeConfig(&quot;{row.key}&quot;)
          </code>{" "}
          fall back to whatever default the caller passes. Audit log keeps
          a record.
        </p>
        <div className="mt-3">
          <DeleteConfigButton configKey={row.key} />
        </div>
      </section>
    </div>
  );
}

/* ─────────────────── components ─────────────────── */

function ValueEditor({ row }: { row: RuntimeConfigRow }) {
  const t = row.value_type;

  if (t === "boolean") {
    const truthy = row.value === true || row.value === "true";
    return (
      <Field label="Value" hint="Boolean toggle.">
        <label className="flex h-[42px] items-center gap-3 rounded-lg border border-app bg-app px-3 text-sm text-app">
          <input
            type="checkbox"
            name="value"
            defaultChecked={truthy}
            className="h-4 w-4 rounded border-app accent-tool-accent"
          />
          <span>{truthy ? "Currently: true" : "Currently: false"}</span>
        </label>
      </Field>
    );
  }

  if (t === "number") {
    const display =
      typeof row.value === "number"
        ? String(row.value)
        : Number.isFinite(Number(row.value))
          ? String(Number(row.value))
          : "";
    return (
      <Field label="Value" hint="Finite numeric. Decimals OK.">
        <input
          type="number"
          step="any"
          name="value"
          defaultValue={display}
          className={`${inputClass} font-mono`}
          required
        />
      </Field>
    );
  }

  if (t === "json") {
    let pretty: string;
    try {
      pretty = JSON.stringify(row.value, null, 2);
    } catch {
      pretty = String(row.value ?? "");
    }
    return (
      <Field
        label="Value"
        hint="Must JSON.parse() cleanly. Use null, [], or {} for empty defaults."
      >
        <textarea
          name="value"
          defaultValue={pretty}
          rows={8}
          className={`${inputClass} font-mono text-[12px]`}
          required
        />
      </Field>
    );
  }

  // string / secret
  const display =
    typeof row.value === "string" ? row.value : String(row.value ?? "");
  return (
    <Field
      label="Value"
      hint={
        t === "secret"
          ? "Stored as a string. Treated as secret server-side."
          : "Plain text."
      }
    >
      <input
        type={t === "secret" ? "password" : "text"}
        name="value"
        defaultValue={display}
        className={`${inputClass} font-mono`}
      />
    </Field>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-muted">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function ValueTypeChip({
  valueType,
}: {
  valueType: RuntimeConfigValueType;
}) {
  const styles: Record<RuntimeConfigValueType, string> = {
    string: "bg-tool-accent-soft text-tool-accent",
    number: "bg-emerald-500/15 text-emerald-500",
    boolean: "bg-violet-500/15 text-violet-500",
    json: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    secret: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[valueType]}`}
    >
      {valueType}
    </span>
  );
}

/**
 * Best-effort "Used by" hint. We don't have a metric for
 * `getRuntimeConfig(key)` call counts yet — this is a placeholder that
 * surfaces the most recent audit-log activity for the key (which is at
 * least visible evidence of usage from admin actions). Replace with a
 * real counter once one exists.
 */
async function UsedByHint({ configKey }: { configKey: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
      <span className="rounded-full border border-app bg-app px-2 py-0.5">
        Used-by metric: not tracked yet
      </span>
      <span>
        Code calls{" "}
        <code className="rounded bg-app px-1 text-[10px]">
          getRuntimeConfig(&quot;{configKey}&quot;)
        </code>{" "}
        — grep your repo or check{" "}
        <Link
          href="/admin/audit"
          className="underline decoration-dotted underline-offset-2 hover:text-app"
        >
          audit log
        </Link>{" "}
        for change history.
      </span>
    </div>
  );
}
