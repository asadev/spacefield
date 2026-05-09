import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime, inputClass } from "../../_lib";
import type {
  WebhookDeliveryV2Row,
  WebhookEndpointRow,
} from "../../_types";
import { updateEndpoint } from "../_actions";
import { WEBHOOK_EVENTS } from "../_constants";
import { EventsPicker } from "../_components/EventsPicker";
import { SecretReveal } from "../_components/SecretReveal";
import {
  DeleteButton,
  EnabledToggle,
  RotateSecretButton,
  TestSendButton,
} from "../_components/RowActions";
import { DeliveryStatusChip } from "../_components/StatusChip";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

type WorkspaceLite = { id: string; name: string };

async function updateEndpointVoid(formData: FormData): Promise<void> {
  "use server";
  await updateEndpoint(formData);
}

export default async function AdminWebhookDetailPage({ params }: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: rowData } = await admin
    .from("webhook_endpoints")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const row = (rowData as WebhookEndpointRow | null) ?? null;
  if (!row) notFound();

  let workspace: WorkspaceLite | null = null;
  if (row.workspace_id) {
    const { data: wsData } = await admin
      .from("workspaces")
      .select("id, name")
      .eq("id", row.workspace_id)
      .maybeSingle();
    workspace = (wsData as WorkspaceLite | null) ?? null;
  }

  const { data: deliveriesRaw } = await admin
    .from("webhook_deliveries_v2")
    .select("*")
    .eq("endpoint_id", id)
    .order("attempted_at", { ascending: false })
    .limit(100);
  const deliveries = (deliveriesRaw ?? []) as WebhookDeliveryV2Row[];

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/webhooks"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Webhooks
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">{row.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="rounded-md border border-app bg-app px-2 py-1 font-mono">
            {row.id.slice(0, 8)}
          </span>
          <span>created {formatDateTime(row.created_at)}</span>
          <span>updated {formatDateTime(row.updated_at)}</span>
          {workspace ? (
            <Link
              href={`/admin/workspaces/${workspace.id}`}
              className="text-app hover:text-tool-accent"
            >
              {workspace.name}
            </Link>
          ) : (
            <span className="rounded-md border border-app bg-app px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-secondary">
              Global
            </span>
          )}
        </div>
      </div>

      {/* Edit form */}
      <form
        action={updateEndpointVoid}
        className="space-y-5 rounded-xl border border-app bg-app-elevated p-4"
      >
        <input type="hidden" name="id" value={row.id} />

        <Field label="Name">
          <input
            type="text"
            name="name"
            defaultValue={row.name}
            required
            className={inputClass}
          />
        </Field>

        <Field label="URL" hint="Receiver of the signed POST.">
          <input
            type="url"
            name="url"
            defaultValue={row.url}
            required
            className={inputClass}
          />
        </Field>

        <Field label="Events">
          <EventsPicker selected={row.events ?? []} />
        </Field>

        <Field label="Max retries">
          <input
            type="number"
            name="max_retries"
            min={0}
            max={10}
            defaultValue={row.max_retries}
            className={inputClass}
          />
        </Field>

        <Field label="Enabled">
          <label className="flex items-center gap-2 text-sm text-app">
            <input
              type="checkbox"
              name="enabled"
              value="on"
              defaultChecked={row.enabled}
              className="h-4 w-4 accent-current text-tool-accent"
            />
            Endpoint receives events
          </label>
        </Field>

        <div className="flex items-center justify-end gap-2 border-t border-app pt-4">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-tool-accent px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            Save changes
          </button>
        </div>
      </form>

      {/* Secret panel */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-app">Signing secret</h2>
            <p className="mt-1 text-xs text-muted">
              Used to compute the <code>X-Signature</code> header
              (HMAC-SHA256, hex). Rotate immediately if you suspect leakage —
              receivers will need the new secret to verify.
            </p>
          </div>
          <RotateSecretButton id={row.id} />
        </div>
        <div className="mt-3">
          <SecretReveal secret={row.secret} />
        </div>
      </section>

      {/* Quick actions */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">Test &amp; lifecycle</h2>
        <p className="mt-1 text-xs text-muted">
          Test send fires a sample payload to the URL and logs the result
          to the deliveries table below. Disable to stop sending without
          deleting the endpoint.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <TestSendButton id={row.id} variant="primary" />
          <EnabledToggle id={row.id} enabled={row.enabled} />
          <DeleteButton id={row.id} />
        </div>
      </section>

      {/* Deliveries */}
      <section className="rounded-xl border border-app bg-app-elevated">
        <div className="flex items-center justify-between border-b border-app px-4 py-3">
          <h2 className="text-sm font-semibold text-app">
            Recent deliveries
          </h2>
          <span className="text-[11px] text-muted">
            last {deliveries.length} of up to 100
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Attempted</th>
                <th className="px-3 py-2 text-left font-normal">Event</th>
                <th className="px-3 py-2 text-left font-normal">Status</th>
                <th className="px-3 py-2 text-left font-normal">HTTP</th>
                <th className="px-3 py-2 text-left font-normal">Duration</th>
                <th className="px-3 py-2 text-left font-normal">Attempt</th>
                <th className="px-3 py-2 text-left font-normal">Trigger</th>
                <th className="px-3 py-2 text-left font-normal">Response</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-faint"
                  >
                    No deliveries yet. Use Test send to fire a sample.
                  </td>
                </tr>
              ) : (
                deliveries.map((d) => {
                  const trigger =
                    typeof d.metadata === "object" && d.metadata
                      ? String(
                          (d.metadata as Record<string, unknown>)
                            .triggered_by ?? "—"
                        )
                      : "—";
                  return (
                    <tr
                      key={d.id}
                      className="border-b border-app last:border-b-0 hover:bg-app/40"
                    >
                      <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                        {formatDateTime(d.attempted_at)}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-app">
                        {d.event}
                      </td>
                      <td className="px-3 py-2">
                        <DeliveryStatusChip status={d.status} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                        {d.http_status ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                        {typeof d.duration_ms === "number"
                          ? `${d.duration_ms}ms`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                        {d.attempt}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-secondary">
                        {trigger}
                      </td>
                      <td className="px-3 py-2">
                        {d.response_excerpt ? (
                          <span
                            className="block max-w-[280px] truncate font-mono text-[11px] text-faint"
                            title={d.response_excerpt}
                          >
                            {d.response_excerpt}
                          </span>
                        ) : (
                          <span className="text-[11px] text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Reference */}
      <section className="rounded-xl border border-app bg-app-elevated p-4 text-xs text-muted">
        <h2 className="text-sm font-semibold text-app">
          Subscribed events ({(row.events ?? []).length} of {WEBHOOK_EVENTS.length})
        </h2>
        <div className="mt-2 flex flex-wrap gap-1">
          {(row.events ?? []).map((e) => (
            <span
              key={e}
              className="inline-flex items-center rounded-md border border-app bg-app px-1.5 py-0.5 font-mono text-[10px] text-app"
            >
              {e}
            </span>
          ))}
          {(row.events ?? []).length === 0 ? (
            <span className="text-faint">None — endpoint will not fire.</span>
          ) : null}
        </div>
      </section>
    </div>
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
      <div className="text-[0.65rem] uppercase tracking-[0.18em] text-muted">
        {label}
      </div>
      {hint ? <div className="mt-0.5 text-[11px] text-faint">{hint}</div> : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}
