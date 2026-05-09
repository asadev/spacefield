import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime, inputClass } from "../_lib";
import type { WebhookEndpointRow } from "../_types";
import { WEBHOOK_EVENTS } from "./_constants";
import {
  DeliveryStatusChip,
  EnabledChip,
  EventChips,
} from "./_components/StatusChip";
import { RowActions } from "./_components/RowActions";

export const dynamic = "force-dynamic";

type WorkspaceLite = { id: string; name: string };

type SearchParams = Promise<{
  workspace?: string;
  enabled?: string;
  event?: string;
}>;

export default async function AdminWebhooksPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const filterWorkspace = (sp.workspace ?? "").trim();
  const filterEnabled = (sp.enabled ?? "").trim(); // "", "on", "off"
  const filterEvent = (sp.event ?? "").trim();

  const admin = createAdminClient();

  let q = admin.from("webhook_endpoints").select("*").order("created_at", {
    ascending: false,
  });

  if (filterWorkspace === "__global__") {
    q = q.is("workspace_id", null);
  } else if (filterWorkspace) {
    q = q.eq("workspace_id", filterWorkspace);
  }
  if (filterEnabled === "on") q = q.eq("enabled", true);
  if (filterEnabled === "off") q = q.eq("enabled", false);
  // Event subscription filter — Postgres jsonb containment.
  if (filterEvent) q = q.contains("events", JSON.stringify([filterEvent]));

  const { data: rowsRaw } = await q;
  const rows = (rowsRaw ?? []) as WebhookEndpointRow[];

  // Workspace name lookup. Pull the picker list (recent 200) AND any
  // workspaces referenced by current rows so the chip on a row is
  // populated even if the workspace is older than the picker window.
  const wsIdsFromRows = Array.from(
    new Set(rows.map((r) => r.workspace_id).filter(Boolean))
  ) as string[];

  const { data: pickerWsRaw } = await admin
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: false })
    .limit(200);
  const pickerWs = (pickerWsRaw ?? []) as WorkspaceLite[];

  const extraIds = wsIdsFromRows.filter(
    (id) => !pickerWs.some((w) => w.id === id)
  );
  let extraWs: WorkspaceLite[] = [];
  if (extraIds.length > 0) {
    const { data: extraRaw } = await admin
      .from("workspaces")
      .select("id, name")
      .in("id", extraIds);
    extraWs = (extraRaw ?? []) as WorkspaceLite[];
  }
  const wsById = new Map<string, WorkspaceLite>(
    [...pickerWs, ...extraWs].map((w) => [w.id, w])
  );

  const counts = {
    total: rows.length,
    enabled: rows.filter((r) => r.enabled).length,
    global: rows.filter((r) => r.workspace_id === null).length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Ops
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">
            Webhook endpoints
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Generic outbound webhooks signed with HMAC-SHA256. {counts.total}{" "}
            total · {counts.enabled} enabled · {counts.global} global.
          </p>
        </div>
        <Link
          href="/admin/webhooks/new"
          className="inline-flex items-center justify-center rounded-lg bg-tool-accent px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          + New endpoint
        </Link>
      </div>

      {/* Filters */}
      <form
        method="get"
        className="grid gap-2 rounded-xl border border-app bg-app-elevated p-3 sm:grid-cols-[2fr_1fr_1fr_auto]"
      >
        <select
          name="workspace"
          defaultValue={filterWorkspace}
          className={inputClass}
        >
          <option value="">All workspaces</option>
          <option value="__global__">Global only (no workspace)</option>
          {pickerWs.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} — {w.id.slice(0, 8)}
            </option>
          ))}
        </select>
        <select
          name="enabled"
          defaultValue={filterEnabled}
          className={inputClass}
        >
          <option value="">Any status</option>
          <option value="on">Enabled</option>
          <option value="off">Disabled</option>
        </select>
        <select
          name="event"
          defaultValue={filterEvent}
          className={inputClass}
        >
          <option value="">Any event</option>
          {WEBHOOK_EVENTS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg border border-app bg-app px-3 py-2 text-xs text-app transition-colors hover:border-tool-accent"
        >
          Filter
        </button>
      </form>

      {/* List */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Name</th>
              <th className="px-3 py-2 text-left font-normal">URL</th>
              <th className="px-3 py-2 text-left font-normal">Workspace</th>
              <th className="px-3 py-2 text-left font-normal">Events</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Last delivery</th>
              <th className="px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-faint"
                >
                  No endpoints match these filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const ws = row.workspace_id
                  ? wsById.get(row.workspace_id)
                  : null;
                return (
                  <tr
                    key={row.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/webhooks/${row.id}`}
                        className="text-app hover:text-tool-accent"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="block max-w-[280px] truncate font-mono text-[11px] text-secondary"
                        title={row.url}
                      >
                        {row.url}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {row.workspace_id === null ? (
                        <span className="rounded-md border border-app bg-app px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-secondary">
                          Global
                        </span>
                      ) : ws ? (
                        <Link
                          href={`/admin/workspaces/${row.workspace_id}`}
                          className="text-app hover:text-tool-accent"
                        >
                          {ws.name}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-faint">
                          {row.workspace_id.slice(0, 8)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <EventChips events={row.events} />
                    </td>
                    <td className="px-3 py-2">
                      <EnabledChip enabled={row.enabled} />
                    </td>
                    <td className="px-3 py-2">
                      {row.last_delivery_at ? (
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[11px] tabular-nums text-secondary">
                            {formatDateTime(row.last_delivery_at)}
                          </span>
                          {row.last_delivery_status ? (
                            <DeliveryStatusChip
                              status={row.last_delivery_status}
                            />
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-faint">never</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <RowActions
                        id={row.id}
                        enabled={row.enabled}
                        variant="compact"
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
