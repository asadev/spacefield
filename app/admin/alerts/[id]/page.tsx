import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  formatDateTime,
  inputClass,
} from "../../_lib";
import { deleteAlert, updateAlert } from "../_actions";
import {
  ACTION_CHANNELS,
  CONDITION_FIELDS,
  CONDITION_LABELS,
  CONDITION_TYPES,
  type ConditionField,
} from "../_helpers";

import type { AdminAlertRow, AlertConditionType } from "../../_types";

export const dynamic = "force-dynamic";

interface AlertEventRow {
  id: string;
  alert_id: string | null;
  triggered_at: string;
  summary: string;
  payload: Record<string, unknown>;
  notified_channels: string[];
}

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ condition_type?: string }>;
};

export default async function AdminAlertDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;

  const admin = createAdminClient();

  const [alertRes, eventsRes] = await Promise.all([
    admin.from("admin_alerts").select("*").eq("id", id).maybeSingle(),
    admin
      .from("admin_alert_events")
      .select(
        "id, alert_id, triggered_at, summary, payload, notified_channels"
      )
      .eq("alert_id", id)
      .order("triggered_at", { ascending: false })
      .limit(100),
  ]);

  const alert = alertRes.data as AdminAlertRow | null;
  if (!alert) notFound();

  const events = (eventsRes.data ?? []) as AlertEventRow[];

  // The condition_type the editor renders fields for. Defaults to the
  // saved value, but lets you preview a different shape via
  // ?condition_type=... before saving.
  const previewType = (
    CONDITION_TYPES as readonly string[]
  ).includes(sp.condition_type ?? "")
    ? (sp.condition_type as AlertConditionType)
    : alert.condition_type;

  const fields = CONDITION_FIELDS[previewType] ?? [];

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/alerts"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Alerts
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-app">{alert.name}</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              alert.enabled
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-app text-faint border border-app"
            }`}
          >
            {alert.enabled ? "Enabled" : "Disabled"}
          </span>
          <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-medium text-tool-accent">
            {CONDITION_LABELS[alert.condition_type] ?? alert.condition_type}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          <span className="rounded-md border border-app bg-app px-2 py-1">
            updated {formatDateTime(alert.updated_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            last evaluated {formatDateTime(alert.last_evaluated_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            last triggered {formatDateTime(alert.last_triggered_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            triggers {alert.trigger_count}
          </span>
        </div>
      </div>

      {/* Editor */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Edit alert</h2>

        {/* Condition-type form is GET so we can re-render the conditional
            inputs without saving. The Save form below picks up whatever
            condition_type is currently in the URL. */}
        <form
          method="get"
          action={`/admin/alerts/${id}`}
          className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]"
        >
          <select
            name="condition_type"
            defaultValue={previewType}
            className={inputClass}
          >
            {CONDITION_TYPES.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonGhostClass}>
            Switch type
          </button>
        </form>
        <div className="mt-1 text-[11px] text-faint">
          Pick a different type to preview its fields. Saved when you submit
          the main form.
        </div>

        <form action={updateAlert} className="mt-5 space-y-4">
          <input type="hidden" name="id" value={alert.id} />
          <input
            type="hidden"
            name="condition_type"
            value={previewType}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name">
              <input
                type="text"
                name="name"
                required
                defaultValue={alert.name}
                className={inputClass}
              />
            </Field>
            <Field
              label="Enabled"
              hint="Disabled alerts skip evaluation entirely."
            >
              <label className="flex h-[42px] items-center gap-3 rounded-lg border border-app bg-app px-3 text-sm text-app">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={alert.enabled}
                  className="h-4 w-4 rounded border-app accent-tool-accent"
                />
                <span>Active</span>
              </label>
            </Field>
          </div>

          <Field label="Description">
            <textarea
              name="description"
              defaultValue={alert.description}
              rows={3}
              className={inputClass}
            />
          </Field>

          <ConditionParamsSection
            type={previewType}
            fields={fields}
            saved={alert.condition_params}
            savedType={alert.condition_type}
          />

          <Field
            label="Action channels"
            hint="Where the alert fires. Configure recipients per channel below."
          >
            <div className="grid gap-2 sm:grid-cols-3">
              {ACTION_CHANNELS.map((ch) => (
                <label
                  key={ch}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-app bg-app p-3 text-sm transition-colors hover:border-tool-accent has-[:checked]:border-tool-accent has-[:checked]:bg-tool-accent-soft"
                >
                  <input
                    type="checkbox"
                    name="action_channels"
                    value={ch}
                    defaultChecked={alert.action_channels.includes(ch)}
                    className="h-4 w-4 accent-tool-accent"
                  />
                  <span className="font-mono text-xs text-app">{ch}</span>
                </label>
              ))}
            </div>
          </Field>

          <Field
            label="Recipients"
            hint="One per line. Email addresses for email; chat ids for Telegram; E.164 numbers for WhatsApp."
          >
            <textarea
              name="action_recipients"
              defaultValue={alert.action_recipients.join("\n")}
              rows={4}
              spellCheck={false}
              placeholder={"you@example.com\n+971500000000"}
              className={`${inputClass} font-mono text-xs`}
            />
          </Field>

          <Field
            label="Cooldown (minutes)"
            hint="Minimum gap between consecutive firings."
          >
            <input
              type="number"
              name="cooldown_minutes"
              min={1}
              max={1440}
              step={1}
              defaultValue={alert.cooldown_minutes}
              className={`${inputClass} max-w-[160px]`}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" className={buttonClass}>
              Save changes
            </button>
            <Link href="/admin/alerts" className={buttonGhostClass}>
              Back to alerts
            </Link>
          </div>
        </form>
      </section>

      {/* Event log */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">
          Recent events ({events.length})
        </h2>
        <p className="mt-1 text-xs text-muted">
          Last 100 firings logged in{" "}
          <code className="font-mono">admin_alert_events</code>.
        </p>
        <div className="mt-4 overflow-x-auto rounded-lg border border-app bg-app">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">When</th>
                <th className="px-3 py-2 text-left font-normal">Summary</th>
                <th className="px-3 py-2 text-left font-normal">Channels</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-faint">
                    No events yet.
                  </td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr
                    key={ev.id}
                    className="border-b border-app last:border-b-0"
                  >
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(ev.triggered_at)}
                    </td>
                    <td className="px-3 py-2 text-app">{ev.summary}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(ev.notified_channels ?? []).length === 0 ? (
                          <span className="text-xs text-faint">—</span>
                        ) : (
                          (ev.notified_channels ?? []).map((c) => (
                            <span
                              key={c}
                              className="rounded-full bg-app-elevated px-1.5 py-0.5 font-mono text-[10px] text-secondary"
                            >
                              {c}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
        <h2 className="text-sm font-semibold text-rose-500">Danger zone</h2>
        <p className="mt-1 text-xs text-rose-500/80">
          Permanently delete this alert and its event history.
        </p>
        <form action={deleteAlert} className="mt-3">
          <input type="hidden" name="id" value={alert.id} />
          <button
            type="submit"
            className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
          >
            Delete alert
          </button>
        </form>
      </section>
    </div>
  );
}

function ConditionParamsSection({
  type,
  fields,
  saved,
  savedType,
}: {
  type: AlertConditionType;
  fields: ConditionField[];
  saved: Record<string, unknown>;
  savedType: AlertConditionType;
}) {
  // Only seed defaults from `saved` when the editor type matches the
  // saved type. Otherwise the operator is exploring a different shape
  // and the form should start clean.
  const seed = type === savedType ? saved : {};

  return (
    <Field
      label={`Condition params — ${CONDITION_LABELS[type]}`}
      hint="Per-type settings. Saved as JSONB. Falls back to the JSON textarea if you'd rather edit raw."
    >
      <div className="space-y-3 rounded-lg border border-app bg-app p-3">
        {fields.length === 0 ? (
          <div className="text-xs text-faint">No structured fields for this type.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((f) => {
              const seededValue =
                seed[f.key] !== undefined && seed[f.key] !== null
                  ? String(seed[f.key])
                  : f.defaultValue ?? "";
              if (f.type === "textarea") {
                return (
                  <div key={f.key} className="md:col-span-2">
                    <div className="text-[11px] text-muted">{f.label}</div>
                    <textarea
                      name={`cp_${f.key}`}
                      defaultValue={seededValue}
                      placeholder={f.placeholder}
                      rows={4}
                      className={`${inputClass} mt-1 font-mono text-xs`}
                    />
                    {f.hint && (
                      <div className="mt-1 text-[11px] text-faint">
                        {f.hint}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div key={f.key}>
                  <div className="text-[11px] text-muted">{f.label}</div>
                  <input
                    type={f.type}
                    name={`cp_${f.key}`}
                    defaultValue={seededValue}
                    placeholder={f.placeholder}
                    className={`${inputClass} mt-1`}
                  />
                  {f.hint && (
                    <div className="mt-1 text-[11px] text-faint">
                      {f.hint}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] uppercase tracking-[0.18em] text-muted">
            Or edit raw JSON
          </summary>
          <textarea
            name="condition_params_json"
            placeholder={JSON.stringify(seed, null, 2)}
            rows={6}
            spellCheck={false}
            className={`${inputClass} mt-2 font-mono text-[11px]`}
          />
          <div className="mt-1 text-[11px] text-faint">
            If non-empty, overrides the structured fields above.
          </div>
        </details>
      </div>
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
    <div className="block">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
      {hint && <div className="mt-1 text-[11px] text-faint">{hint}</div>}
    </div>
  );
}
