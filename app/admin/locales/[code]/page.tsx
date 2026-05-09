import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  formatDateTime,
  inputClass,
} from "../../_lib";
import type { LocaleRow, LocaleStringRow } from "../../_types";
import {
  bulkImport,
  setString,
} from "../_actions";
import DeleteStringButton from "../_components/DeleteStringButton";
import ExportButton from "../_components/ExportButton";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
};

export default async function AdminLocaleStringsPage({
  params,
  searchParams,
}: PageProps) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode);

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const admin = createAdminClient();

  const { data: localeRow, error: localeErr } = await admin
    .from("locales")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (localeErr || !localeRow) notFound();
  const locale = localeRow as LocaleRow;

  // Build the strings query. Filter by string_key substring (ilike).
  let baseQuery = admin
    .from("locale_strings")
    .select("*", { count: "exact" })
    .eq("locale_code", code)
    .order("string_key", { ascending: true });
  if (q) {
    baseQuery = baseQuery.ilike("string_key", `%${q}%`);
  }
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: rowsRaw, count } = await baseQuery.range(from, to);
  const rows = (rowsRaw ?? []) as LocaleStringRow[];
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Total string count (unfiltered) for display.
  const { count: totalUnfiltered } = await admin
    .from("locale_strings")
    .select("string_key", { count: "exact", head: true })
    .eq("locale_code", code);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/locales"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Locales
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-app">
            <span className="font-mono uppercase">{locale.code}</span>{" "}
            <span className="text-muted">·</span>{" "}
            <span className="font-normal">{locale.display_name}</span>
          </h1>
          {locale.is_default && (
            <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tool-accent">
              Default
            </span>
          )}
          {locale.rtl && (
            <span className="rounded-full bg-app-elevated px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary">
              RTL
            </span>
          )}
          {!locale.enabled && (
            <span className="rounded-full bg-app-elevated px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-faint">
              Disabled
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">
          {(totalUnfiltered ?? 0).toLocaleString()} string
          {(totalUnfiltered ?? 0) === 1 ? "" : "s"} total
          {q ? ` · ${total.toLocaleString()} match "${q}"` : ""}
          {pageCount > 1 ? ` · page ${page} / ${pageCount}` : ""}
        </p>
      </div>

      {/* Add string + bulk import + export controls */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-app bg-app-elevated p-4">
          <h2 className="text-sm font-semibold text-app">+ Add string</h2>
          <p className="mt-1 text-xs text-muted">
            Upserts on (locale_code, string_key) — saving an existing key
            overwrites it.
          </p>
          <form action={setString} className="mt-3 space-y-3">
            <input type="hidden" name="locale_code" value={code} />
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                string_key
              </span>
              <input
                type="text"
                name="string_key"
                required
                maxLength={200}
                placeholder="dashboard.title"
                className={`${inputClass} font-mono`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                value
              </span>
              <textarea
                name="value"
                rows={3}
                required
                placeholder="Dashboard"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                context (optional)
              </span>
              <input
                type="text"
                name="context"
                maxLength={400}
                placeholder="Page title for /dashboard"
                className={inputClass}
              />
            </label>
            <div className="flex justify-end">
              <button type="submit" className={buttonClass}>
                Save string
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-app bg-app-elevated p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-app">
              Bulk import / export
            </h2>
            <ExportButton code={code} />
          </div>
          <p className="mt-1 text-xs text-muted">
            Paste a JSON object{" "}
            <code className="text-tool-accent">{`{ "key": "value" }`}</code> to
            upsert many strings. Non-string values are JSON-stringified.
          </p>
          <form action={bulkImport} className="mt-3 space-y-3">
            <input type="hidden" name="locale_code" value={code} />
            <textarea
              name="payload"
              rows={8}
              required
              placeholder={`{\n  "dashboard.title": "Dashboard",\n  "auth.signin": "Sign in"\n}`}
              className={`${inputClass} font-mono text-xs`}
            />
            <div className="flex justify-end">
              <button type="submit" className={buttonClass}>
                Import
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Filter */}
      <section className="rounded-xl border border-app bg-app-elevated p-3">
        <form
          action={`/admin/locales/${encodeURIComponent(code)}`}
          method="get"
          className="flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-1 flex-col gap-1 sm:max-w-md">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Filter (string_key contains)
            </span>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="dashboard."
              className={inputClass}
            />
          </label>
          <button type="submit" className={buttonClass}>
            Search
          </button>
          {q && (
            <Link
              href={`/admin/locales/${encodeURIComponent(code)}`}
              className={buttonGhostClass}
            >
              Clear
            </Link>
          )}
        </form>
      </section>

      {/* Rows table */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Key</th>
              <th className="px-3 py-2 text-left font-normal">Value · context</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-faint">
                  {q
                    ? `No strings match "${q}".`
                    : "No strings yet — add one above or bulk-import."}
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr
                  key={s.string_key}
                  className="border-b border-app last:border-b-0 align-top"
                >
                  <td className="px-3 py-2 font-mono text-[11px] text-secondary">
                    {s.string_key}
                  </td>
                  <td className="px-3 py-2">
                    <form
                      action={setString}
                      className="grid gap-2 md:grid-cols-[1fr_auto]"
                    >
                      <input
                        type="hidden"
                        name="locale_code"
                        value={code}
                      />
                      <input
                        type="hidden"
                        name="string_key"
                        value={s.string_key}
                      />
                      <div className="flex flex-col gap-1.5">
                        <textarea
                          name="value"
                          defaultValue={s.value}
                          rows={2}
                          required
                          dir={locale.rtl ? "rtl" : "ltr"}
                          className={inputClass}
                        />
                        <input
                          type="text"
                          name="context"
                          defaultValue={s.context ?? ""}
                          placeholder="(no context)"
                          maxLength={400}
                          className={`${inputClass} text-[11px] text-faint`}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <button type="submit" className={buttonClass}>
                          Save
                        </button>
                        <DeleteStringButton
                          code={code}
                          stringKey={s.string_key}
                        />
                      </div>
                    </form>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                    {formatDateTime(s.updated_at)}
                  </td>
                  <td className="px-3 py-2 text-right" />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">
            Page {page} of {pageCount} ({total.toLocaleString()} match
            {total === 1 ? "" : "es"})
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={pageUrl(code, q, page - 1)}
                className={buttonGhostClass}
              >
                ← Prev
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={pageUrl(code, q, page + 1)}
                className={buttonGhostClass}
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function pageUrl(code: string, q: string, page: number): string {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return `/admin/locales/${encodeURIComponent(code)}${qs ? `?${qs}` : ""}`;
}
