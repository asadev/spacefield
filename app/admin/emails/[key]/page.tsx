import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { renderTemplate } from "@/lib/email-templates";

import {
  buttonClass,
  buttonGhostClass,
  formatDateTime,
  inputClass,
} from "../../_lib";

import type { EmailSendRow, EmailTemplateRow } from "../../_types";

import { TemplateEditorForm } from "../_components/TemplateEditorForm";
import {
  deleteTemplate,
  testSend,
  updateTemplate,
} from "../_actions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminEmailTemplatePage({
  params,
  searchParams,
}: PageProps) {
  const { key: rawKey } = await params;
  const sp = await searchParams;
  const key = decodeURIComponent(rawKey);

  const admin = createAdminClient();

  const { data: tpl } = await admin
    .from("email_templates")
    .select(
      "key, display_name, description, category, role, subject, html, plain_text, variables_json, enabled, locale, last_test_send_at, created_at, updated_at"
    )
    .eq("key", key)
    .maybeSingle();

  if (!tpl) notFound();
  const template = tpl as Pick<
    EmailTemplateRow,
    | "key"
    | "display_name"
    | "description"
    | "category"
    | "role"
    | "subject"
    | "html"
    | "plain_text"
    | "variables_json"
    | "enabled"
    | "locale"
    | "last_test_send_at"
    | "created_at"
    | "updated_at"
  >;

  // Build the test-vars object from `?test_<name>=...` query params.
  const testVars: Record<string, string> = {};
  for (const v of template.variables_json) {
    const queryVal = sp[`test_${v}`];
    const value =
      typeof queryVal === "string"
        ? queryVal
        : Array.isArray(queryVal)
          ? (queryVal[0] ?? "")
          : "";
    testVars[v] = value;
  }

  const renderedSubject = renderTemplate(template.subject, testVars);
  const renderedHtml = renderTemplate(template.html, testVars);

  // Last 100 sends for this template.
  const { data: sendsRaw } = await admin
    .from("email_sends")
    .select(
      "id, template_key, to_email, subject, status, provider_id, error, sent_by, workspace_id, metadata, created_at"
    )
    .eq("template_key", key)
    .order("created_at", { ascending: false })
    .limit(100);
  const sends = (sendsRaw as EmailSendRow[] | null) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/emails"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Email templates
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold text-app">
            {template.key}
          </h1>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
              template.enabled
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-app text-faint border border-app"
            }`}
          >
            {template.enabled ? "Enabled" : "Disabled"}
          </span>
          <span className="inline-flex items-center rounded-full bg-app-elevated border border-app px-2 py-0.5 text-[10px] font-medium text-secondary">
            {template.category}
          </span>
          <span className="inline-flex items-center rounded-full bg-app-elevated border border-app px-2 py-0.5 text-[10px] font-medium text-secondary font-mono">
            {template.role}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          <span className="rounded-md border border-app bg-app px-2 py-1">
            updated {formatDateTime(template.updated_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            created {formatDateTime(template.created_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            last test {formatDateTime(template.last_test_send_at)}
          </span>
        </div>
      </div>

      {/* Edit form */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Edit template</h2>
        <div className="mt-4">
          <TemplateEditorForm
            template={template}
            keyEditable={false}
            action={updateTemplate}
            submitLabel="Save changes"
          />
        </div>
      </section>

      {/* Variables + preview */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Preview</h2>
        <p className="mt-1 text-xs text-muted">
          Fill the variables and re-submit to render the body. Values are
          substituted with{" "}
          <code className="rounded bg-app px-1 text-[11px]">{`{{name}}`}</code>{" "}
          syntax.
        </p>

        {template.variables_json.length === 0 ? (
          <div className="mt-3 rounded-md border border-app bg-app px-3 py-2 text-[11px] text-faint">
            This template declares no variables. Preview shows the raw body.
          </div>
        ) : (
          <form
            method="get"
            action={`/admin/emails/${encodeURIComponent(template.key)}`}
            className="mt-3 grid gap-2 sm:grid-cols-2"
          >
            {template.variables_json.map((v) => (
              <div key={v}>
                <label className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                  {v}
                </label>
                <input
                  type="text"
                  name={`test_${v}`}
                  defaultValue={testVars[v] ?? ""}
                  placeholder={`Test value for {{${v}}}`}
                  className={`${inputClass} mt-1 font-mono text-xs`}
                />
              </div>
            ))}
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2 pt-1">
              <button type="submit" className={buttonClass}>
                Render preview
              </button>
              {Object.values(testVars).some((v) => v) && (
                <Link
                  href={`/admin/emails/${encodeURIComponent(template.key)}`}
                  className={buttonGhostClass}
                >
                  Reset
                </Link>
              )}
            </div>
          </form>
        )}

        <div className="mt-5 grid gap-3">
          <div className="rounded-lg border border-app bg-app p-3">
            <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
              Rendered subject
            </div>
            <div className="mt-1 text-sm text-app font-mono">
              {renderedSubject || (
                <span className="text-faint">—</span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-app bg-white p-0 overflow-hidden">
            <div className="border-b border-app bg-app-elevated px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-muted">
              Rendered HTML preview
            </div>
            <iframe
              title="email preview"
              srcDoc={renderedHtml || "<p style=\"color:#999;font-family:sans-serif;padding:24px\">Body is empty.</p>"}
              sandbox=""
              className="block w-full"
              style={{ minHeight: 400, height: 480, border: 0 }}
            />
          </div>
        </div>
      </section>

      {/* Test send */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Test send</h2>
        <p className="mt-1 text-xs text-muted">
          Send the rendered template to a single email address using the
          variables you set above. The send is logged to{" "}
          <code className="rounded bg-app px-1 text-[11px]">
            email_sends
          </code>
          .
        </p>
        <form
          action={testSend}
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
        >
          <input type="hidden" name="key" value={template.key} />
          {template.variables_json.map((v) => (
            <input
              key={v}
              type="hidden"
              name={`var_${v}`}
              value={testVars[v] ?? ""}
            />
          ))}
          <input
            type="email"
            name="to"
            required
            placeholder="someone@example.com"
            className={inputClass}
          />
          <button
            type="submit"
            className={buttonClass}
            disabled={!template.enabled}
            title={
              template.enabled
                ? "Send rendered template now"
                : "Enable template to test-send"
            }
          >
            Send test email
          </button>
        </form>
        {!template.enabled && (
          <div className="mt-2 text-[11px] text-amber-500">
            Template is disabled — re-enable it above before test-sending.
          </div>
        )}
      </section>

      {/* Send log */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-app">
              Recent sends
            </h2>
            <p className="mt-1 text-xs text-muted">
              Last 100 sends — newest first.
            </p>
          </div>
          <span className="text-[11px] text-faint tabular-nums">
            {sends.length} row{sends.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-app">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app bg-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">When</th>
                <th className="px-3 py-2 text-left font-normal">To</th>
                <th className="px-3 py-2 text-left font-normal">Subject</th>
                <th className="px-3 py-2 text-left font-normal">Status</th>
                <th className="px-3 py-2 text-left font-normal">Provider</th>
                <th className="px-3 py-2 text-left font-normal">Error</th>
              </tr>
            </thead>
            <tbody>
              {sends.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-faint"
                  >
                    No sends yet. Use “Send test email” above to fire one.
                  </td>
                </tr>
              ) : (
                sends.map((s) => <SendRow key={s.id} send={s} />)
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
        <h2 className="text-sm font-semibold text-rose-500">Danger zone</h2>
        <p className="mt-1 text-xs text-rose-500/80">
          Permanently delete this template. Code calling{" "}
          <code className="rounded bg-app px-1 text-[11px]">
            sendTemplate(&quot;{template.key}&quot;, ...)
          </code>{" "}
          will start returning <code>null</code>.
        </p>
        <form action={deleteTemplate} className="mt-3">
          <input type="hidden" name="key" value={template.key} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
          >
            Delete template
          </button>
        </form>
      </section>
    </div>
  );
}

function SendRow({ send }: { send: EmailSendRow }) {
  const statusClass =
    send.status === "sent"
      ? "bg-emerald-500/15 text-emerald-500"
      : send.status === "failed" || send.status === "bounced"
        ? "bg-rose-500/15 text-rose-500"
        : "bg-amber-500/15 text-amber-500";
  return (
    <tr className="border-b border-app last:border-b-0">
      <td className="px-3 py-1.5 align-top font-mono text-[11px] tabular-nums text-secondary whitespace-nowrap">
        {formatDateTime(send.created_at)}
      </td>
      <td className="px-3 py-1.5 align-top text-xs text-app">
        <span className="break-all">{send.to_email}</span>
      </td>
      <td className="px-3 py-1.5 align-top text-xs text-secondary">
        <div className="line-clamp-2 max-w-[360px]">{send.subject}</div>
      </td>
      <td className="px-3 py-1.5 align-top">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass}`}
        >
          {send.status}
        </span>
      </td>
      <td className="px-3 py-1.5 align-top font-mono text-[10px] text-muted">
        {send.provider_id ? (
          <span className="break-all">{send.provider_id}</span>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className="px-3 py-1.5 align-top text-[11px] text-rose-500">
        {send.error ? (
          <div className="line-clamp-2 max-w-[260px]">{send.error}</div>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
    </tr>
  );
}
