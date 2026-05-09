import Link from "next/link";

import { buttonClass, buttonGhostClass, inputClass } from "../_lib";
import type { AnnouncementRow } from "../_types";
import { TIER_IDS } from "../_types";
import {
  createAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
} from "./_actions";

const CATEGORY_OPTIONS = [
  { value: "product", label: "Product" },
  { value: "platform", label: "Platform" },
  { value: "security", label: "Security" },
  { value: "outage", label: "Outage" },
  { value: "marketing", label: "Marketing" },
] as const;

const AUDIENCE_OPTIONS = [
  { value: "all", label: "All users" },
  { value: "admin", label: "Admins only" },
  { value: "tier", label: "Specific tiers" },
  { value: "allowlist", label: "Specific user UUIDs" },
] as const;

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

async function createAction(formData: FormData): Promise<void> {
  "use server";
  await createAnnouncement(formData);
}

async function updateAction(formData: FormData): Promise<void> {
  "use server";
  await updateAnnouncement(formData);
}

async function deleteAction(formData: FormData): Promise<void> {
  "use server";
  await deleteAnnouncement(formData);
}

export function AnnouncementForm({
  mode,
  announcement,
}: {
  mode: "create" | "edit";
  announcement: AnnouncementRow | null;
}) {
  const action = mode === "create" ? createAction : updateAction;
  const submitLabel = mode === "create" ? "Create announcement" : "Save changes";

  return (
    <form
      action={action}
      className="space-y-5 rounded-xl border border-app bg-app-elevated p-5"
    >
      {mode === "edit" && announcement && (
        <input type="hidden" name="id" value={announcement.id} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Title
          </span>
          <input
            type="text"
            name="title"
            defaultValue={announcement?.title ?? ""}
            required
            maxLength={140}
            placeholder="What's new in this release"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Body (markdown ok)
          </span>
          <textarea
            name="body"
            defaultValue={announcement?.body ?? ""}
            rows={10}
            placeholder={"## What's new\n\n- Feature one\n- Feature two"}
            className={`${inputClass} resize-y font-mono text-xs`}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Category
          </span>
          <select
            name="category"
            defaultValue={announcement?.category ?? "product"}
            className={inputClass}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Audience
          </span>
          <select
            name="audience"
            defaultValue={announcement?.audience ?? "all"}
            className={inputClass}
          >
            {AUDIENCE_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Tiers (used when audience = tier)
          </legend>
          <div className="flex flex-wrap gap-2">
            {TIER_IDS.map((t) => (
              <label
                key={t}
                className="inline-flex items-center gap-2 rounded-lg border border-app bg-app px-3 py-1.5 text-xs text-app"
              >
                <input
                  type="checkbox"
                  name="audience_tier"
                  value={t}
                  defaultChecked={
                    announcement?.audience_tiers.includes(t) ?? false
                  }
                />
                {t}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Allowlist user UUIDs — one per line
          </span>
          <textarea
            name="audience_user_ids"
            defaultValue={announcement?.audience_user_ids.join("\n") ?? ""}
            rows={3}
            className={`${inputClass} font-mono text-xs`}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Published at (blank = draft)
          </span>
          <input
            type="datetime-local"
            name="published_at"
            defaultValue={toDatetimeLocal(announcement?.published_at)}
            className={inputClass}
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-app">
          <input
            type="checkbox"
            name="pinned"
            defaultChecked={announcement?.pinned ?? false}
          />
          Pin to top of feed
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href="/admin/announcements" className={buttonGhostClass}>
          Cancel
        </Link>
        <button type="submit" className={buttonClass}>
          {submitLabel}
        </button>
      </div>

      {mode === "edit" && announcement && (
        <details className="rounded-lg border border-app bg-app p-3">
          <summary className="cursor-pointer text-xs text-muted">
            Danger zone
          </summary>
          <form action={deleteAction} className="mt-3 flex items-center gap-2">
            <input type="hidden" name="id" value={announcement.id} />
            <button
              type="submit"
              className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-rose-500 transition-colors hover:border-rose-500/60"
            >
              Delete announcement
            </button>
            <span className="text-[11px] text-muted">Permanent.</span>
          </form>
        </details>
      )}
    </form>
  );
}
