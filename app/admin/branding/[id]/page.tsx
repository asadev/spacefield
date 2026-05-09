import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  formatDateTime,
  inputClass,
} from "../../_lib";
import type { BrandConfigRow } from "../../_types";
import { updateBrand } from "../_actions";
import ColorInput from "../_components/ColorInput";
import DeleteBrandButton from "../_components/DeleteBrandButton";
import LivePreview from "../_components/LivePreview";

export const dynamic = "force-dynamic";

type WorkspaceLite = { id: string; name: string };

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminBrandingDetailPage({ params }: PageProps) {
  const { id } = await params;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("brand_configs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) notFound();

  const row = data as BrandConfigRow;

  let workspace: WorkspaceLite | null = null;
  if (row.workspace_id) {
    const { data: wsRow } = await admin
      .from("workspaces")
      .select("id, name")
      .eq("id", row.workspace_id)
      .maybeSingle();
    workspace = (wsRow as WorkspaceLite | null) ?? null;
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/branding"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Brand configs
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-app">
            {row.brand_name ?? (
              <span className="text-faint">— unnamed —</span>
            )}
          </h1>
          {row.workspace_id ? (
            <span className="rounded-full border border-app bg-app-elevated px-2 py-0.5 text-[11px] text-secondary">
              workspace · {workspace?.name ?? row.workspace_id.slice(0, 8)}
            </span>
          ) : (
            <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tool-accent">
              Global
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          <span className="rounded-md border border-app bg-app px-2 py-1">
            updated {formatDateTime(row.updated_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            created {formatDateTime(row.created_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1 font-mono">
            {row.id.slice(0, 8)}
          </span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <form
          id="brand-config-form"
          action={updateBrand}
          className="space-y-5 rounded-xl border border-app bg-app-elevated p-5"
        >
          <input type="hidden" name="id" value={row.id} />

          <Section title="Identity">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Brand name" hint="Shown in product chrome.">
                <input
                  type="text"
                  name="brand_name"
                  defaultValue={row.brand_name ?? ""}
                  maxLength={120}
                  placeholder="Acme HQ"
                  className={inputClass}
                />
              </Field>
              <Field
                label="Font family"
                hint="CSS font-family stack. Live-previewed."
              >
                <input
                  type="text"
                  name="font_family"
                  defaultValue={row.font_family ?? ""}
                  placeholder="Inter, system-ui, sans-serif"
                  className={inputClass}
                  style={{
                    fontFamily: row.font_family ?? undefined,
                  }}
                />
              </Field>
            </div>
          </Section>

          <Section title="Imagery">
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Logo URL (light)"
                hint="Used on light backgrounds."
              >
                <input
                  type="url"
                  name="logo_url"
                  defaultValue={row.logo_url ?? ""}
                  placeholder="https://…"
                  className={inputClass}
                />
                <ImagePreview url={row.logo_url} dark={false} />
              </Field>
              <Field
                label="Logo URL (dark)"
                hint="Used on dark backgrounds."
              >
                <input
                  type="url"
                  name="logo_dark_url"
                  defaultValue={row.logo_dark_url ?? ""}
                  placeholder="https://…"
                  className={inputClass}
                />
                <ImagePreview url={row.logo_dark_url} dark />
              </Field>
              <Field label="Favicon URL" hint="Square, 32×32 minimum.">
                <input
                  type="url"
                  name="favicon_url"
                  defaultValue={row.favicon_url ?? ""}
                  placeholder="https://…"
                  className={inputClass}
                />
                <ImagePreview url={row.favicon_url} dark={false} small />
              </Field>
            </div>
          </Section>

          <Section title="Colors">
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Primary color"
                hint="Used for accents, links, branded surfaces."
              >
                <ColorInput name="primary_color" initial={row.primary_color} />
              </Field>
              <Field
                label="Accent color"
                hint="Buttons, secondary highlights."
              >
                <ColorInput name="accent_color" initial={row.accent_color} />
              </Field>
            </div>
          </Section>

          <Section title="Email footer">
            <Field
              label="email_footer_html"
              hint="Inserted at the bottom of platform-sent emails. Sandboxed iframe preview to the right."
            >
              <textarea
                name="email_footer_html"
                defaultValue={row.email_footer_html ?? ""}
                rows={6}
                placeholder="<p>© 2026 Brand · <a href='https://...'>Unsubscribe</a></p>"
                className={`${inputClass} font-mono text-xs`}
              />
            </Field>
          </Section>

          <Section title="Custom CSS">
            <Field
              label="custom_css"
              hint="Injected into branded surfaces. Sandboxed iframe preview to the right."
            >
              <textarea
                name="custom_css"
                defaultValue={row.custom_css ?? ""}
                rows={10}
                placeholder=".brand-card { box-shadow: 0 8px 24px rgba(0,0,0,.12); }"
                className={`${inputClass} font-mono text-xs`}
              />
            </Field>
          </Section>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-app pt-4">
            <DeleteBrandButton
              id={row.id}
              name={row.brand_name ?? row.id.slice(0, 8)}
            />
            <button type="submit" className={buttonClass}>
              Save changes
            </button>
          </div>
        </form>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-app bg-app-elevated p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-app">Live preview</h2>
              <span className="text-[10px] uppercase tracking-[0.18em] text-faint">
                client
              </span>
            </div>
            <LivePreview
              initialPrimary={row.primary_color}
              initialAccent={row.accent_color}
              initialFont={row.font_family}
              initialBrandName={row.brand_name}
              initialEmailFooter={row.email_footer_html}
              initialCustomCss={row.custom_css}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      {children}
      {hint && <span className="text-[10.5px] text-faint">{hint}</span>}
    </label>
  );
}

function ImagePreview({
  url,
  dark,
  small,
}: {
  url: string | null;
  dark: boolean;
  small?: boolean;
}) {
  if (!url) return null;
  const size = small ? "h-10 w-10" : "h-16 w-32";
  return (
    <div
      className={`mt-2 flex ${size} items-center justify-center overflow-hidden rounded-md border border-app ${
        dark ? "bg-black" : "bg-white"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="preview"
        className="max-h-full max-w-full object-contain"
        loading="lazy"
      />
    </div>
  );
}
