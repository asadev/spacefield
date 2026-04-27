import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../_lib";
import { WallpaperCreateForm, WallpaperDeleteButton } from "./_form";

export const dynamic = "force-dynamic";

type WallpaperRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  light_url: string | null;
  dark_url: string | null;
  mode_preference: string;
  created_at: string;
};

export default async function AdminWallpapersPage() {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("wallpapers")
    .select(
      "id, slug, name, category, light_url, dark_url, mode_preference, created_at"
    )
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as WallpaperRow[];

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Wallpapers
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">Custom wallpapers</h1>
        <p className="mt-0.5 text-xs text-muted">
          {rows.length.toLocaleString()} custom wallpaper
          {rows.length === 1 ? "" : "s"} · stored in R2 · served via{" "}
          <code className="text-tool-accent">/api/wallpapers/asset</code> when
          R2_PUBLIC_URL is unset.
        </p>
      </div>

      <WallpaperCreateForm />

      {error && (
        <div className="rounded-xl border border-app bg-app-elevated p-3 text-xs text-red-500">
          Read failed: {error.message}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Preview</th>
              <th className="px-3 py-2 text-left font-normal">Name</th>
              <th className="px-3 py-2 text-left font-normal">Slug</th>
              <th className="px-3 py-2 text-left font-normal">Category</th>
              <th className="px-3 py-2 text-left font-normal">Mode</th>
              <th className="px-3 py-2 text-left font-normal">Created</th>
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
                  No custom wallpapers yet — upload one above to give users
                  more options on the /tools desktop.
                </td>
              </tr>
            ) : (
              rows.map((w) => (
                <tr
                  key={w.id}
                  className="border-b border-app last:border-b-0 hover:bg-app/40"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Thumb url={w.light_url} label="Light" />
                      <Thumb url={w.dark_url} label="Dark" dark />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-app">
                    <div className="font-medium">{w.name}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                    {w.slug}
                  </td>
                  <td className="px-3 py-2 text-xs text-secondary">
                    {w.category}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tool-accent">
                      {w.mode_preference}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                    {formatDateTime(w.created_at)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <WallpaperDeleteButton id={w.id} name={w.name} />
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

function Thumb({
  url,
  label,
  dark,
}: {
  url: string | null;
  label: string;
  dark?: boolean;
}) {
  if (!url) {
    return (
      <div
        title={`${label} variant — none`}
        className="flex h-10 w-16 items-center justify-center rounded-md border border-dashed border-app bg-surface text-[9px] uppercase tracking-[0.15em] text-faint"
      >
        —
      </div>
    );
  }
  return (
    <div
      title={`${label} variant`}
      className={`relative h-10 w-16 overflow-hidden rounded-md border border-app ${
        dark ? "bg-black" : "bg-white"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`${label} variant`}
        className="h-full w-full object-cover"
        loading="lazy"
      />
      <span className="absolute bottom-0 left-0 right-0 bg-black/55 px-1 py-[1px] text-center text-[8px] uppercase tracking-[0.15em] text-white">
        {label}
      </span>
    </div>
  );
}
