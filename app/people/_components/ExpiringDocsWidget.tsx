import Link from "next/link";

import { listExpiringDocs } from "@/lib/people/server";

import ExpiryBadge from "./ExpiryBadge";

/**
 * Compact widget showing N docs expiring within `withinDays`. Server
 * component — pulls fresh data on every render.
 */
export default async function ExpiringDocsWidget({
  withinDays = 30,
  limit = 5,
  heading = "Documents expiring soon",
}: {
  withinDays?: number;
  limit?: number;
  heading?: string;
}) {
  const rows = await listExpiringDocs(withinDays);
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-app bg-app-elevated p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-app">{heading}</h3>
          <span className="text-[10px] uppercase tracking-wide text-faint">
            nothing in {withinDays}d
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">
          All employee documents are current. UAE EID / visa tracking is on.
        </p>
      </div>
    );
  }
  const show = rows.slice(0, limit);
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-app">{heading}</h3>
        <span className="text-[10px] uppercase tracking-wide text-faint">
          {rows.length} in {withinDays}d
        </span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {show.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <Link
              href={`/people/${r.employee_id}`}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <span className="truncate font-medium text-app hover:text-tool-accent">
                {r.employee_name}
              </span>
              <span className="shrink-0 text-faint">·</span>
              <span className="shrink-0 text-secondary">{r.kind}</span>
            </Link>
            <ExpiryBadge expiresAt={r.expires_at} />
          </li>
        ))}
      </ul>
      {rows.length > limit && (
        <p className="mt-3 text-[11px] text-faint">
          +{rows.length - limit} more — see admin / people.
        </p>
      )}
    </div>
  );
}
