/* ─────────────────────────────────────────────────────────────────────────
 * Public hosted lead-capture form at /f/<slug>.
 *
 * Server component: looks up the source via the service-role admin
 * client (the row is public-readable by slug, but we go through the
 * admin client because end-users hitting this page are unauthenticated
 * and RLS would otherwise gate the SELECT).
 *
 * Renders the form schema in `config.fields` and mounts a small client
 * component that POSTs to /api/inbound/form/<slug>.
 * ───────────────────────────────────────────────────────────────────── */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CrmLeadSource,
  LeadSourceFormField,
} from "@/lib/crm/lead-sources/types";
import HostedFormClient from "./HostedFormClient";

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface LoadedSource {
  source: CrmLeadSource;
  workspaceName: string | null;
}

async function loadSource(slug: string): Promise<LoadedSource | null> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("crm_lead_sources")
    .select("*, workspaces!inner(name)")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  // The Supabase JS client types the joined row loosely — narrow to a
  // local shape so the rest of this module stays strict.
  const row = data as CrmLeadSource & {
    workspaces?: { name: string | null } | null;
  };
  return {
    source: {
      id: row.id,
      workspace_id: row.workspace_id,
      kind: row.kind,
      name: row.name,
      slug: row.slug,
      secret: row.secret,
      config: row.config,
      active: row.active,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_event_at: row.last_event_at,
      event_count: row.event_count,
    },
    workspaceName: row.workspaces?.name ?? null,
  };
}

export async function generateMetadata(
  { params }: PageProps
): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadSource(slug);
  if (!loaded) return { title: "Form not found" };
  const wsName = loaded.workspaceName ?? "Spacefield";
  return {
    title: `${loaded.source.name} — ${wsName}`,
    robots: { index: false, follow: false },
  };
}

export default async function HostedFormPage({ params }: PageProps) {
  const { slug } = await params;
  const loaded = await loadSource(slug);
  if (!loaded) notFound();

  const { source, workspaceName } = loaded;

  if (source.kind !== "form") notFound();
  if (!source.active) {
    return (
      <main className="min-h-dvh bg-app">
        <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-16 text-center">
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            {workspaceName ?? "Spacefield"}
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-app">
            This form is currently paused
          </h1>
          <p className="mt-3 text-sm text-secondary">
            The owner has temporarily disabled new submissions. Please check
            back later or reach out by another channel.
          </p>
        </div>
      </main>
    );
  }

  const fields: LeadSourceFormField[] = source.config.fields ?? [];

  return (
    <main className="min-h-dvh bg-app">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
        <header className="mb-6">
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            {workspaceName ?? "Spacefield"}
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-app">
            {source.config.formHeading ?? source.name}
          </h1>
          {source.config.formSubheading ? (
            <p className="mt-2 text-sm text-secondary">
              {source.config.formSubheading}
            </p>
          ) : null}
        </header>
        <HostedFormClient
          slug={slug}
          fields={fields}
          thankYouMessage={
            source.config.formThankYou ??
            "Thanks — we got it and will be in touch shortly."
          }
        />
      </div>
    </main>
  );
}
