"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { buttonClass, buttonGhostClass, inputClass } from "./_styles";

/* Client form for the admin wallpapers page. Posts multipart to
 * /api/wallpapers/create then refreshes the server tree so the new
 * row is rendered without a full page reload. */

type ModePref = "auto" | "light" | "dark";

export function WallpaperCreateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [mode, setMode] = useState<ModePref>("auto");
  const [lightFile, setLightFile] = useState<File | null>(null);
  const [darkFile, setDarkFile] = useState<File | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!lightFile && !darkFile) {
      setError("Provide at least one of light or dark image.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("name", name.trim());
      fd.set("slug", slug.trim().toLowerCase());
      fd.set("mode_preference", mode);
      if (lightFile) fd.set("light_file", lightFile);
      if (darkFile) fd.set("dark_file", darkFile);

      const res = await fetch("/api/wallpapers/create", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? `Create failed (${res.status}).`);
        return;
      }
      setName("");
      setSlug("");
      setMode("auto");
      setLightFile(null);
      setDarkFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-app bg-app-elevated p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-app">Add wallpaper</h2>
        <span className="text-[11px] text-muted">
          Light + dark variants are paired automatically.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            placeholder="Alpine Calm"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Slug
          </span>
          <input
            type="text"
            value={slug}
            onChange={(e) =>
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
            }
            required
            maxLength={64}
            placeholder="alpine-calm"
            className={`${inputClass} font-mono`}
            pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Mode preference
          </span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as ModePref)}
            className={inputClass}
          >
            <option value="auto">Auto (pair — light + dark)</option>
            <option value="light">Light only</option>
            <option value="dark">Dark only</option>
          </select>
        </label>
        <div className="hidden sm:block" />
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Light image
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setLightFile(e.target.files?.[0] ?? null)}
            className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-app file:px-2 file:py-1 file:text-xs file:text-app`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Dark image
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setDarkFile(e.target.files?.[0] ?? null)}
            className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-app file:px-2 file:py-1 file:text-xs file:text-app`}
          />
        </label>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-app bg-app px-3 py-2 text-xs text-red-500">
          {error}
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          className={buttonGhostClass}
          disabled={busy}
          onClick={() => {
            setName("");
            setSlug("");
            setMode("auto");
            setLightFile(null);
            setDarkFile(null);
            setError(null);
          }}
        >
          Reset
        </button>
        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Uploading…" : "Create wallpaper"}
        </button>
      </div>
    </form>
  );
}

export function WallpaperDeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (
      !confirm(
        `Delete wallpaper "${name}"? This removes the R2 assets and the DB row.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/wallpapers/delete", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(j.error ?? `Delete failed (${res.status}).`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="rounded-md border border-app bg-app-elevated px-2 py-1 text-[11px] text-secondary transition-colors hover:border-red-500/60 hover:text-red-500 disabled:opacity-50"
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
