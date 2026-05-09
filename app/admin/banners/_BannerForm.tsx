import Link from "next/link";

import { buttonClass, buttonGhostClass, inputClass } from "../_lib";
import type { SiteBannerRow } from "../_types";
import { TIER_IDS } from "../_types";
import { createBanner, deleteBanner, updateBanner } from "./_actions";

type Mode = "create" | "edit";

const VARIANT_OPTIONS = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "success", label: "Success" },
  { value: "error", label: "Error" },
] as const;

const AUDIENCE_OPTIONS = [
  { value: "all", label: "All visitors (signed-in or not)" },
  { value: "authenticated", label: "Authenticated users only" },
  { value: "tier", label: "Specific subscription tiers" },
  { value: "allowlist", label: "Specific user UUIDs" },
] as const;

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // datetime-local wants "YYYY-MM-DDTHH:MM" in local time. Take the ISO
  // representation and strip seconds + the trailing Z.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

async function createAction(formData: FormData): Promise<void> {
  "use server";
  await createBanner(formData);
}

async function updateAction(formData: FormData): Promise<void> {
  "use server";
  await updateBanner(formData);
}

async function deleteAction(formData: FormData): Promise<void> {
  "use server";
  await deleteBanner(formData);
}

export function BannerForm({
  mode,
  banner,
}: {
  mode: Mode;
  banner: SiteBannerRow | null;
}) {
  const action = mode === "create" ? createAction : updateAction;
  const submitLabel = mode === "create" ? "Create banner" : "Save changes";

  return (
    <form
      action={action}
      className="space-y-5 rounded-xl border border-app bg-app-elevated p-5"
    >
      {mode === "edit" && banner && (
        <input type="hidden" name="id" value={banner.id} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Message
          </span>
          <textarea
            name="message"
            defaultValue={banner?.message ?? ""}
            required
            rows={2}
            placeholder="Heads up — limited-time pricing on Pro tier through Friday."
            className={`${inputClass} resize-y`}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            CTA label
          </span>
          <input
            type="text"
            name="cta_label"
            defaultValue={banner?.cta_label ?? ""}
            placeholder="Upgrade now"
            maxLength={48}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            CTA href
          </span>
          <input
            type="text"
            name="cta_href"
            defaultValue={banner?.cta_href ?? ""}
            placeholder="https://example.com or /pricing"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Variant
          </span>
          <select
            name="variant"
            defaultValue={banner?.variant ?? "info"}
            className={inputClass}
          >
            {VARIANT_OPTIONS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
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
            defaultValue={banner?.audience ?? "all"}
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
                  defaultChecked={banner?.audience_tiers.includes(t) ?? false}
                />
                {t}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Allowlist user UUIDs — one per line (used when audience = allowlist)
          </span>
          <textarea
            name="audience_user_ids"
            defaultValue={banner?.audience_user_ids.join("\n") ?? ""}
            rows={3}
            className={`${inputClass} font-mono text-xs`}
            placeholder="b1f8a2c4-…&#10;a3c9e7d2-…"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Starts at
          </span>
          <input
            type="datetime-local"
            name="starts_at"
            defaultValue={toDatetimeLocal(banner?.starts_at)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Ends at
          </span>
          <input
            type="datetime-local"
            name="ends_at"
            defaultValue={toDatetimeLocal(banner?.ends_at)}
            className={inputClass}
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-app sm:col-span-1">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={banner?.enabled ?? true}
          />
          Enabled
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-app sm:col-span-1">
          <input
            type="checkbox"
            name="dismissible"
            defaultChecked={banner?.dismissible ?? true}
          />
          Dismissible by user
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href="/admin/banners" className={buttonGhostClass}>
          Cancel
        </Link>
        <button type="submit" className={buttonClass}>
          {submitLabel}
        </button>
      </div>

      {mode === "edit" && banner && (
        <details className="rounded-lg border border-app bg-app p-3">
          <summary className="cursor-pointer text-xs text-muted">
            Danger zone
          </summary>
          <form action={deleteAction} className="mt-3 flex items-center gap-2">
            <input type="hidden" name="id" value={banner.id} />
            <button
              type="submit"
              className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-rose-500 transition-colors hover:border-rose-500/60"
            >
              Delete banner
            </button>
            <span className="text-[11px] text-muted">
              Permanent. No undo.
            </span>
          </form>
        </details>
      )}
    </form>
  );
}
