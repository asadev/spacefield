import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonClass, formatDateTime, inputClass } from "../_lib";
import type { LocaleRow } from "../_types";
import {
  createLocale,
  setDefault,
  toggleEnabled,
  updateLocale,
} from "./_actions";
import DeleteLocaleButton from "./_components/DeleteLocaleButton";

export const dynamic = "force-dynamic";

type StringCount = { locale_code: string; count: number };

export default async function AdminLocalesPage() {
  const admin = createAdminClient();
  const { data: rowsRaw, error } = await admin
    .from("locales")
    .select("*")
    .order("is_default", { ascending: false })
    .order("code", { ascending: true });
  const rows = (rowsRaw ?? []) as LocaleRow[];

  // Count strings per locale. We hit the table once (limit 0, head)
  // per locale — small N (typically < 20) so cheap.
  const counts = new Map<string, number>();
  await Promise.all(
    rows.map(async (r) => {
      const { count } = await admin
        .from("locale_strings")
        .select("string_key", { count: "exact", head: true })
        .eq("locale_code", r.code);
      counts.set(r.code, count ?? 0);
    })
  );

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Locales
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">Locales</h1>
        <p className="mt-0.5 text-xs text-muted">
          {rows.length.toLocaleString()} locale{rows.length === 1 ? "" : "s"} ·
          enable / disable, set default, edit per-locale strings.
        </p>
      </div>

      {/* + New locale form */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">+ New locale</h2>
        <p className="mt-1 text-xs text-muted">
          ISO code (2-letter, optional region after dash). Setting as default
          unsets the existing default.
        </p>
        <form
          action={createLocale}
          className="mt-3 grid gap-3 sm:grid-cols-[100px_1fr_auto_auto_auto_auto]"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Code
            </span>
            <input
              type="text"
              name="code"
              required
              maxLength={6}
              placeholder="es"
              className={`${inputClass} font-mono uppercase`}
              pattern="^[a-zA-Z]{2}([-_][a-zA-Z]{2})?$"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Display name
            </span>
            <input
              type="text"
              name="display_name"
              required
              maxLength={80}
              placeholder="Spanish"
              className={inputClass}
            />
          </label>
          <CheckLabel name="enabled" label="Enabled" defaultChecked />
          <CheckLabel name="rtl" label="RTL" />
          <CheckLabel name="is_default" label="Default" />
          <div className="flex items-end">
            <button type="submit" className={buttonClass}>
              Create
            </button>
          </div>
        </form>
      </section>

      {error && (
        <div className="rounded-xl border border-app bg-app-elevated p-3 text-xs text-red-500">
          Read failed: {error.message}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Code</th>
              <th className="px-3 py-2 text-left font-normal">Name</th>
              <th className="px-3 py-2 text-left font-normal">Strings</th>
              <th className="px-3 py-2 text-left font-normal">Enabled</th>
              <th className="px-3 py-2 text-left font-normal">RTL</th>
              <th className="px-3 py-2 text-left font-normal">Default</th>
              <th className="px-3 py-2 text-left font-normal">Created</th>
              <th className="px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-faint"
                >
                  No locales — add one above.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.code}
                  className="border-b border-app last:border-b-0 hover:bg-app/40"
                >
                  <td className="px-3 py-2 font-mono text-xs uppercase text-app">
                    <Link
                      href={`/admin/locales/${encodeURIComponent(r.code)}`}
                      className="font-medium hover:text-tool-accent"
                    >
                      {r.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-app">{r.display_name}</td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                    {(counts.get(r.code) ?? 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <ToggleEnabledForm
                      code={r.code}
                      enabled={r.enabled}
                      isDefault={r.is_default}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <UpdateRtlForm
                      code={r.code}
                      displayName={r.display_name}
                      enabled={r.enabled}
                      rtl={r.rtl}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <SetDefaultForm code={r.code} isDefault={r.is_default} />
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                    {formatDateTime(r.created_at)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/admin/locales/${encodeURIComponent(r.code)}`}
                        className="rounded-md border border-app bg-app-elevated px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                      >
                        Strings
                      </Link>
                      <DeleteLocaleButton
                        code={r.code}
                        name={r.display_name}
                        isDefault={r.is_default}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CheckLabel({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      <span className="flex h-[42px] items-center rounded-lg border border-app bg-app px-3">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="h-4 w-4 rounded border-app accent-tool-accent"
        />
      </span>
    </label>
  );
}

function ToggleEnabledForm({
  code,
  enabled,
  isDefault,
}: {
  code: string;
  enabled: boolean;
  isDefault: boolean;
}) {
  const disabled = isDefault && enabled;
  return (
    <form action={toggleEnabled} className="inline-flex">
      <input type="hidden" name="code" value={code} />
      <button
        type="submit"
        disabled={disabled}
        title={
          disabled
            ? "Default locale cannot be disabled"
            : enabled
            ? "Click to disable"
            : "Click to enable"
        }
        className={`inline-flex h-6 w-11 items-center rounded-full border border-app transition-colors disabled:opacity-60 ${
          enabled ? "bg-emerald-500/30" : "bg-app"
        }`}
      >
        <span
          className={`block h-4 w-4 rounded-full transition-transform ${
            enabled
              ? "translate-x-6 bg-emerald-500"
              : "translate-x-1 bg-faint"
          }`}
        />
      </button>
    </form>
  );
}

function UpdateRtlForm({
  code,
  displayName,
  enabled,
  rtl,
}: {
  code: string;
  displayName: string;
  enabled: boolean;
  rtl: boolean;
}) {
  // Toggle RTL by submitting an updateLocale form with the new value
  // (and preserving display_name + enabled).
  return (
    <form action={updateLocale} className="inline-flex">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="display_name" value={displayName} />
      {enabled && <input type="hidden" name="enabled" value="on" />}
      {!rtl && <input type="hidden" name="rtl" value="on" />}
      <button
        type="submit"
        title={rtl ? "Click to make LTR" : "Click to make RTL"}
        className={`inline-flex h-6 w-11 items-center rounded-full border border-app transition-colors ${
          rtl ? "bg-tool-accent-soft" : "bg-app"
        }`}
      >
        <span
          className={`block h-4 w-4 rounded-full transition-transform ${
            rtl
              ? "translate-x-6 bg-tool-accent"
              : "translate-x-1 bg-faint"
          }`}
        />
      </button>
    </form>
  );
}

function SetDefaultForm({
  code,
  isDefault,
}: {
  code: string;
  isDefault: boolean;
}) {
  return (
    <form action={setDefault} className="inline-flex">
      <input type="hidden" name="code" value={code} />
      <button
        type="submit"
        disabled={isDefault}
        title={
          isDefault
            ? "Already the default"
            : "Make this the default locale"
        }
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border transition-colors disabled:cursor-default ${
          isDefault
            ? "border-tool-accent bg-tool-accent"
            : "border-app bg-app hover:border-tool-accent"
        }`}
      >
        {isDefault ? (
          <span className="h-2 w-2 rounded-full bg-white" />
        ) : null}
      </button>
    </form>
  );
}
