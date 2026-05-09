import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonClass, formatDateTime, inputClass } from "../_lib";
import type { BrandConfigRow } from "../_types";
import { createBrand } from "./_actions";

export const dynamic = "force-dynamic";

type WorkspaceLite = { id: string; name: string };

export default async function AdminBrandingPage() {
  const admin = createAdminClient();
  const { data: rowsRaw, error } = await admin
    .from("brand_configs")
    .select("*")
    .order("workspace_id", { ascending: true, nullsFirst: true })
    .order("updated_at", { ascending: false });
  const rows = (rowsRaw ?? []) as BrandConfigRow[];

  const wsIds = Array.from(
    new Set(rows.map((r) => r.workspace_id).filter((v): v is string => !!v))
  );
  const { data: wsData } = wsIds.length
    ? await admin.from("workspaces").select("id, name").in("id", wsIds)
    : { data: [] as WorkspaceLite[] };
  const workspaces = new Map(
    ((wsData ?? []) as WorkspaceLite[]).map((w) => [w.id, w])
  );

  // Recent workspaces for the picker on "+ New" form. Bounded so the
  // dropdown isn't unmanageable; admin can pick "global" for null.
  const { data: pickerWsData } = await admin
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: false })
    .limit(200);
  const pickerWorkspaces = (pickerWsData ?? []) as WorkspaceLite[];

  const globalCount = rows.filter((r) => !r.workspace_id).length;
  const wsCount = rows.length - globalCount;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Branding
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">Brand configs</h1>
        <p className="mt-0.5 text-xs text-muted">
          {rows.length.toLocaleString()} brand config
          {rows.length === 1 ? "" : "s"} · {globalCount} global · {wsCount}{" "}
          per-workspace. Edit logo, colors, font, email footer, custom CSS.
        </p>
      </div>

      {/* + New brand config form */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">+ New brand config</h2>
        <p className="mt-1 text-xs text-muted">
          Pick a workspace, or leave as &ldquo;Global&rdquo; for the
          platform-wide default. You can edit every field on the next page.
        </p>
        <form action={createBrand} className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Workspace
            </span>
            <select name="workspace_id" className={inputClass} defaultValue="global">
              <option value="global">Global (platform default)</option>
              {pickerWorkspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} — {w.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Brand name (optional)
            </span>
            <input
              type="text"
              name="brand_name"
              maxLength={120}
              placeholder="Acme HQ"
              className={inputClass}
            />
          </label>
          <div className="sm:col-span-3">
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
              <th className="px-3 py-2 text-left font-normal">Favicon</th>
              <th className="px-3 py-2 text-left font-normal">Brand name</th>
              <th className="px-3 py-2 text-left font-normal">Workspace</th>
              <th className="px-3 py-2 text-left font-normal">Colors</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-faint"
                >
                  No brand configs yet — create one above.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const ws = r.workspace_id
                  ? workspaces.get(r.workspace_id)
                  : null;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <FaviconThumb url={r.favicon_url} />
                    </td>
                    <td className="px-3 py-2 text-app">
                      <div className="font-medium">
                        {r.brand_name ?? (
                          <span className="text-faint">— unnamed —</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.workspace_id ? (
                        <span className="text-secondary">
                          {ws?.name ?? "—"}{" "}
                          <span className="font-mono text-[10px] text-faint">
                            {r.workspace_id.slice(0, 8)}
                          </span>
                        </span>
                      ) : (
                        <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tool-accent">
                          Global
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <ColorChips
                        primary={r.primary_color}
                        accent={r.accent_color}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {formatDateTime(r.updated_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/branding/${r.id}`}
                        className="rounded-md border border-app bg-app-elevated px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                      >
                        Edit
                      </Link>
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

function FaviconThumb({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div
        title="No favicon"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-app bg-app text-[9px] uppercase tracking-[0.15em] text-faint"
      >
        —
      </div>
    );
  }
  return (
    <div className="relative h-8 w-8 overflow-hidden rounded-md border border-app bg-app">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Favicon"
        className="h-full w-full object-contain"
        loading="lazy"
      />
    </div>
  );
}

function ColorChips({
  primary,
  accent,
}: {
  primary: string | null;
  accent: string | null;
}) {
  return (
    <div className="flex items-center gap-1">
      <ColorChip label="P" hex={primary} />
      <ColorChip label="A" hex={accent} />
    </div>
  );
}

function ColorChip({ label, hex }: { label: string; hex: string | null }) {
  if (!hex) {
    return (
      <span
        title={`${label} — none`}
        className="inline-flex h-5 items-center gap-1 rounded-full border border-dashed border-app bg-app px-2 text-[9px] uppercase tracking-[0.15em] text-faint"
      >
        {label}
      </span>
    );
  }
  return (
    <span
      title={`${label} ${hex}`}
      className="inline-flex h-5 items-center gap-1 rounded-full border border-app bg-app px-2 text-[10px] font-mono text-secondary"
    >
      <span
        className="h-3 w-3 rounded-sm border border-app"
        style={{ backgroundColor: hex }}
      />
      {hex}
    </span>
  );
}
