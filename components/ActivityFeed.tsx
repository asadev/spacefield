/* ActivityFeed — server component rendering an activity timeline.
 *
 * Two modes:
 *   - per-entity:  pass entityType + entityId (and optionally
 *                  workspaceId for an extra filter)
 *   - workspace:   pass workspaceId only
 *
 * Reads via `lib/collab/activity.ts::listActivities` which uses the
 * user-scoped Supabase client, so RLS applies. A non-member sees an
 * empty list. The render is plain DOM — no client state — so it's safe
 * to embed inside any RSC page.
 */

import { formatActivityLine, listActivities, type Activity } from "@/lib/collab/activity";

interface Props {
  entityType?: string;
  entityId?: string;
  workspaceId?: string;
  limit?: number;
  /** Optional title shown above the list. */
  title?: string;
  emptyMessage?: string;
}

export default async function ActivityFeed({
  entityType,
  entityId,
  workspaceId,
  limit = 25,
  title,
  emptyMessage,
}: Props) {
  if (!workspaceId && !entityId) {
    return (
      <div className="text-xs text-muted">
        ActivityFeed requires workspaceId or entityId.
      </div>
    );
  }

  let items: Activity[] = [];
  let errored = false;
  try {
    items = await listActivities({
      workspaceId,
      entityType,
      entityId,
      limit,
    });
  } catch {
    errored = true;
  }

  return (
    <section className="flex flex-col gap-3">
      {title && (
        <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
          {title}
        </h3>
      )}
      {errored ? (
        <div className="text-xs text-red-500">
          Activity feed temporarily unavailable.
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-app bg-app-elevated px-3 py-4 text-center text-xs text-muted">
          {emptyMessage ?? "No activity yet."}
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((row) => (
            <li
              key={row.id}
              className="flex items-start gap-3 rounded-md border border-app bg-app-elevated px-3 py-2"
            >
              {row.actor?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.actor.avatar_url}
                  alt=""
                  width={22}
                  height={22}
                  className="shrink-0 rounded-full border border-app object-cover"
                />
              ) : (
                <div
                  className="shrink-0 rounded-full border border-app bg-app text-center text-[9px] font-semibold text-secondary"
                  style={{ width: 22, height: 22, lineHeight: "22px" }}
                >
                  {actorInitial(row)}
                </div>
              )}
              <div className="min-w-0 flex-1 text-xs">
                <span className="font-medium text-app">{actorName(row)}</span>{" "}
                <span className="text-secondary">{formatActivityLine(row)}</span>
                <span className="ml-2 text-[0.55rem] uppercase tracking-[0.15em] text-faint">
                  {relativeTime(row.created_at)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function actorName(row: Activity): string {
  if (!row.actor) return "System";
  return row.actor.full_name || row.actor.username || "Member";
}

function actorInitial(row: Activity): string {
  const n = actorName(row);
  return n.trim().slice(0, 1).toUpperCase();
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
