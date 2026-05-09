import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime, inputClass } from "../_lib";

import ExpandableRow from "./_ExpandableRow";
import {
  NeutralChip,
  PER_PAGE,
  Pagination,
  WebhookStatusChip,
  parseDateBoundary,
  shortId,
} from "./_shared";

const WEBHOOK_STATUSES = [
  "success",
  "timeout",
  "network_error",
  "non_2xx",
  "signing_skipped",
  "unknown",
] as const;

type WebhookDeliveryRow = {
  id: number;
  link_id: string;
  workspace_id: string | null;
  event: string;
  webhook_url: string;
  status: string;
  http_status: number | null;
  response_excerpt: string | null;
  signed: boolean;
  attempted_at: string;
  duration_ms: number | null;
};

type LinkLite = {
  id: string;
  type: string;
  slug: string;
};

export type WebhookFilters = {
  status?: string;
  link?: string;
  ws?: string;
  from?: string;
  to?: string;
};

export default async function WebhookTab({
  page,
  filters,
  baseParams,
}: {
  page: number;
  filters: WebhookFilters;
  baseParams: Record<string, string | undefined>;
}) {
  const admin = createAdminClient();

  let q = admin
    .from("toshare_webhook_deliveries")
    .select(
      "id, link_id, workspace_id, event, webhook_url, status, http_status, response_excerpt, signed, attempted_at, duration_ms",
      { count: "exact" }
    )
    .order("attempted_at", { ascending: false });

  if (filters.status) q = q.eq("status", filters.status);
  if (filters.ws) q = q.eq("workspace_id", filters.ws);
  if (filters.link) q = q.ilike("link_id", `%${filters.link}%`);

  const fromIso = parseDateBoundary(filters.from, "from");
  const toIso = parseDateBoundary(filters.to, "to");
  if (fromIso) q = q.gte("attempted_at", fromIso);
  if (toIso) q = q.lte("attempted_at", toIso);

  const start = (page - 1) * PER_PAGE;
  q = q.range(start, start + PER_PAGE - 1);

  const { data, error, count } = await q;
  const rows = (data ?? []) as WebhookDeliveryRow[];
  const total = count ?? 0;

  // Look up the link rows referenced in this page so we can show
  // type chip + slug. Done with a single .in() query.
  const linkIds = Array.from(new Set(rows.map((r) => r.link_id))).filter(Boolean);
  const linkMap = new Map<string, LinkLite>();
  if (linkIds.length) {
    const { data: links } = await admin
      .from("toshare_links")
      .select("id, type, slug")
      .in("id", linkIds);
    for (const l of (links ?? []) as LinkLite[]) linkMap.set(l.id, l);
  }

  return (
    <div className="space-y-4">
      <FiltersForm filters={filters} />

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
          Failed to load webhook deliveries: {error.message}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Attempted</th>
                <th className="px-3 py-2 text-left font-normal">Link</th>
                <th className="px-3 py-2 text-left font-normal">Event</th>
                <th className="px-3 py-2 text-left font-normal">Status</th>
                <th className="px-3 py-2 text-right font-normal">HTTP</th>
                <th className="px-3 py-2 text-right font-normal">Duration</th>
                <th className="px-3 py-2 text-left font-normal">Signed</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-faint">
                    No webhook deliveries match.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const link = linkMap.get(r.link_id);
                  return (
                    <ExpandableRow
                      key={r.id}
                      colSpan={7}
                      summary={
                        <>
                          <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary whitespace-nowrap">
                            {formatDateTime(r.attempted_at)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {link ? (
                                <NeutralChip>{link.type}</NeutralChip>
                              ) : null}
                              <span className="font-mono text-xs text-app">
                                {link?.slug ?? shortId(r.link_id)}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-secondary">
                            {r.event}
                          </td>
                          <td className="px-3 py-2">
                            <WebhookStatusChip status={r.status} />
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                            {r.http_status ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                            {r.duration_ms != null ? `${r.duration_ms} ms` : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {r.signed ? (
                              <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tool-accent">
                                signed
                              </span>
                            ) : (
                              <span className="text-xs text-faint">no</span>
                            )}
                          </td>
                        </>
                      }
                      detail={<WebhookDetail row={r} link={link ?? null} />}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        total={total}
        perPage={PER_PAGE}
        baseParams={baseParams}
      />
    </div>
  );
}

function FiltersForm({ filters }: { filters: WebhookFilters }) {
  return (
    <form
      action="/admin/logs"
      className="flex flex-wrap items-end gap-2 rounded-xl border border-app bg-app-elevated p-3"
    >
      <input type="hidden" name="tab" value="webhooks" />
      <FilterField label="Status">
        <select
          name="status"
          defaultValue={filters.status ?? ""}
          className={`${inputClass} h-9 w-40`}
        >
          <option value="">All</option>
          {WEBHOOK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Link ID contains">
        <input
          type="search"
          name="link"
          defaultValue={filters.link ?? ""}
          placeholder="uuid substring"
          className={`${inputClass} h-9 w-48`}
        />
      </FilterField>
      <FilterField label="Workspace ID">
        <input
          type="search"
          name="ws"
          defaultValue={filters.ws ?? ""}
          placeholder="exact uuid"
          className={`${inputClass} h-9 w-56 font-mono text-xs`}
        />
      </FilterField>
      <FilterField label="From">
        <input
          type="date"
          name="from"
          defaultValue={filters.from ?? ""}
          className={`${inputClass} h-9 w-40`}
        />
      </FilterField>
      <FilterField label="To">
        <input
          type="date"
          name="to"
          defaultValue={filters.to ?? ""}
          className={`${inputClass} h-9 w-40`}
        />
      </FilterField>
      <button
        type="submit"
        className="h-9 rounded-lg border border-app bg-app px-3 text-sm text-app transition-colors hover:border-tool-accent"
      >
        Apply
      </button>
    </form>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

function WebhookDetail({
  row,
  link,
}: {
  row: WebhookDeliveryRow;
  link: LinkLite | null;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailCell label="Webhook URL">
          <span className="font-mono text-xs break-all text-app">
            {row.webhook_url || "—"}
          </span>
        </DetailCell>
        <DetailCell label="Workspace">
          <span className="font-mono text-xs text-app">
            {row.workspace_id ?? "—"}
          </span>
        </DetailCell>
        <DetailCell label="Link ID">
          <span className="font-mono text-xs text-app">{row.link_id}</span>
        </DetailCell>
        <DetailCell label="Link slug · type">
          <span className="font-mono text-xs text-app">
            {link ? `${link.slug} · ${link.type}` : "—"}
          </span>
        </DetailCell>
      </div>
      <DetailCell label="Response excerpt">
        {row.response_excerpt ? (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-app bg-app p-3 font-mono text-xs text-app">
            {row.response_excerpt}
          </pre>
        ) : (
          <span className="text-xs text-faint">— no response captured —</span>
        )}
      </DetailCell>
    </div>
  );
}

function DetailCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}
