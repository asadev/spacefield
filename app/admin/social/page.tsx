import { createAdminClient } from "@/lib/supabase/admin";
import { presignedDownloadUrl } from "@/lib/r2";

import { assertAdmin, formatDateTime } from "../_lib";
import Compose from "./_compose";
import RowActions from "./_row-actions";

export const dynamic = "force-dynamic";

type Channel = "facebook" | "instagram";
type Status = "draft" | "scheduled" | "publishing" | "published" | "failed";

type SocialPostRow = {
  id: string;
  channel: Channel;
  status: Status;
  body: string;
  attachment_ids: string[] | null;
  link_url: string | null;
  scheduled_at: string | null;
  meta_post_id: string | null;
  meta_permalink: string | null;
  insights: Record<string, unknown> | null;
  insights_at: string | null;
  failure_reason: string | null;
  created_at: string;
  published_at: string | null;
};

type FileRow = {
  id: string;
  r2_key: string;
  name: string;
  content_type: string | null;
};

const STATUS_GROUPS: { key: Status; label: string }[] = [
  { key: "draft", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "publishing", label: "Publishing" },
  { key: "published", label: "Published" },
  { key: "failed", label: "Failed" },
];

const STATUS_BADGE: Record<Status, string> = {
  draft: "bg-app-elevated text-secondary border border-app",
  scheduled: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  publishing: "bg-tool-accent-soft text-tool-accent",
  published: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
  failed: "bg-red-500/15 text-red-500 dark:text-red-400",
};

const CHANNEL_LABEL: Record<Channel, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
};

export default async function AdminSocialPage() {
  const auth = await assertAdmin();
  const admin = createAdminClient();

  // Resolve the admin's primary workspace — the composer needs one to
  // upload attachments through the existing files pipeline. Match the
  // file-upload self-heal pattern: prefer any membership, fall back to
  // an owned row.
  const workspaceId = await resolveAdminWorkspaceId(auth.userId);

  const { data: rowsData, error: rowsErr } = await admin
    .from("social_posts")
    .select(
      "id, channel, status, body, attachment_ids, link_url, scheduled_at, meta_post_id, meta_permalink, insights, insights_at, failure_reason, created_at, published_at"
    )
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (rowsData ?? []) as SocialPostRow[];

  // Resolve attachment thumbnails. We pull every referenced file id in
  // one query and presign a 10-minute GET URL per row's first image.
  // Cheaper than N round-trips and keeps the page render fast.
  const allIds = Array.from(
    new Set(rows.flatMap((r) => r.attachment_ids ?? []))
  );
  const thumbsByPostId = await resolveThumbs(rows, allIds);

  const grouped = new Map<Status, SocialPostRow[]>();
  for (const g of STATUS_GROUPS) grouped.set(g.key, []);
  for (const r of rows) {
    const list = grouped.get(r.status);
    if (list) list.push(r);
  }

  const total = rows.length;
  const publishedCount = grouped.get("published")?.length ?? 0;
  const scheduledCount = grouped.get("scheduled")?.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Social
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">
          Meta — Facebook + Instagram
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          {total} post{total === 1 ? "" : "s"} · {publishedCount} published ·{" "}
          {scheduledCount} scheduled
        </p>
      </div>

      {workspaceId ? (
        <Compose workspaceId={workspaceId} />
      ) : (
        <div className="rounded-xl border border-app bg-app-elevated p-3 text-xs text-amber-500">
          No workspace found for the admin account — cannot upload images
          for social posts. Sign in to /tools at least once to provision a
          workspace.
        </div>
      )}

      {rowsErr && (
        <div className="rounded-xl border border-app bg-app-elevated p-3 text-xs text-red-500">
          Read failed: {rowsErr.message}
        </div>
      )}

      {STATUS_GROUPS.map((g) => {
        const list = grouped.get(g.key) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={g.key} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-app">{g.label}</h2>
              <span className="text-[10px] uppercase tracking-[0.2em] text-faint">
                {list.length}
              </span>
            </div>
            <div className="overflow-hidden rounded-xl border border-app bg-app-elevated">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                    <th className="px-3 py-2 text-left font-normal w-12">
                      Img
                    </th>
                    <th className="px-3 py-2 text-left font-normal">Body</th>
                    <th className="px-3 py-2 text-left font-normal w-24">
                      Channel
                    </th>
                    <th className="px-3 py-2 text-left font-normal w-28">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left font-normal w-40">
                      When
                    </th>
                    <th className="px-3 py-2 text-left font-normal w-44">
                      Insights
                    </th>
                    <th className="px-3 py-2 text-right font-normal w-56">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <Row
                      key={r.id}
                      row={r}
                      thumb={thumbsByPostId.get(r.id) ?? null}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {total === 0 && (
        <div className="rounded-xl border border-app bg-app-elevated p-8 text-center text-xs text-faint">
          No posts yet. Use the composer above to create the first one.
        </div>
      )}
    </div>
  );

  function Row({
    row,
    thumb,
  }: {
    row: SocialPostRow;
    thumb: string | null;
  }) {
    const insights = row.insights as Partial<{
      likes: number;
      comments: number;
      reach: number;
      impressions: number;
    }> | null;
    const excerpt =
      row.body.length > 140 ? row.body.slice(0, 140).trimEnd() + "…" : row.body;
    const when =
      row.status === "published"
        ? formatDateTime(row.published_at)
        : row.status === "scheduled"
        ? formatDateTime(row.scheduled_at)
        : formatDateTime(row.created_at);
    return (
      <tr className="border-b border-app last:border-b-0 align-top">
        <td className="px-3 py-2">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt=""
              className="h-10 w-10 rounded-md border border-app object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded-md border border-dashed border-app bg-surface" />
          )}
        </td>
        <td className="px-3 py-2 text-app">
          <div className="line-clamp-3 text-xs whitespace-pre-wrap">
            {excerpt || (
              <span className="text-faint italic">no body</span>
            )}
          </div>
          {row.link_url && (
            <div className="mt-1 truncate text-[10px] text-tool-accent">
              {row.link_url}
            </div>
          )}
          {row.failure_reason && (
            <div className="mt-1 text-[10px] text-red-500">
              {row.failure_reason}
            </div>
          )}
          {row.meta_permalink && (
            <a
              className="mt-1 inline-block text-[10px] text-tool-accent hover:underline"
              href={row.meta_permalink}
              target="_blank"
              rel="noreferrer noopener"
            >
              Open on {CHANNEL_LABEL[row.channel]}
            </a>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-secondary">
          {CHANNEL_LABEL[row.channel]}
        </td>
        <td className="px-3 py-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
              STATUS_BADGE[row.status]
            }`}
          >
            {row.status}
          </span>
        </td>
        <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
          {when}
        </td>
        <td className="px-3 py-2 text-[11px] text-secondary">
          {row.status === "published" && insights ? (
            <div className="flex flex-col leading-tight">
              <span>
                {insights.likes ?? 0} likes · {insights.comments ?? 0} comments
              </span>
              <span className="text-faint">
                {insights.reach ?? 0} reach · {insights.impressions ?? 0} imp
              </span>
              {row.insights_at && (
                <span className="mt-0.5 text-[10px] text-faint">
                  as of {formatDateTime(row.insights_at)}
                </span>
              )}
            </div>
          ) : (
            <span className="text-faint">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          <RowActions
            id={row.id}
            status={row.status}
            channel={row.channel}
            body={row.body}
            linkUrl={row.link_url}
            scheduledAt={row.scheduled_at}
            attachmentIds={row.attachment_ids ?? []}
          />
        </td>
      </tr>
    );
  }
}

async function resolveAdminWorkspaceId(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  // Prefer an existing membership (covers both owned + invited workspaces).
  const { data: mem } = await admin
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .order("role", { ascending: true })
    .limit(1);
  if (mem && mem.length > 0) {
    return (mem[0] as { workspace_id: string }).workspace_id;
  }
  const { data: owned } = await admin
    .from("workspaces")
    .select("id")
    .eq("user_id", userId)
    .limit(1);
  if (owned && owned.length > 0) {
    return (owned[0] as { id: string }).id;
  }
  return null;
}

async function resolveThumbs(
  rows: SocialPostRow[],
  allIds: string[]
): Promise<Map<string, string>> {
  if (allIds.length === 0) return new Map();
  const admin = createAdminClient();
  const { data } = await admin
    .from("workspace_files")
    .select("id, r2_key, name, content_type")
    .in("id", allIds);
  const byId = new Map<string, FileRow>();
  for (const f of (data ?? []) as FileRow[]) byId.set(f.id, f);

  // Only sign one URL per row (we only render a single thumb). When
  // R2_PUBLIC_URL is set, no signing round-trip is needed.
  const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/+$/, "");
  const out = new Map<string, string>();
  await Promise.all(
    rows.map(async (r) => {
      const firstId = r.attachment_ids?.[0];
      if (!firstId) return;
      const f = byId.get(firstId);
      if (!f) return;
      if (publicBase) {
        out.set(r.id, `${publicBase}/${f.r2_key}`);
        return;
      }
      try {
        const url = await presignedDownloadUrl({
          key: f.r2_key,
          fileName: f.name,
          expiresInSeconds: 600,
        });
        out.set(r.id, url);
      } catch {
        /* ignore — thumb is decorative */
      }
    })
  );
  return out;
}
