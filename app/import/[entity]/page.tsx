import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspaceId } from "@/lib/tasks/server";
import {
  ENTITY_BLURBS,
  ENTITY_LABELS,
  isEntityKey,
} from "@/lib/import/schemas";

import Wizard from "../_components/Wizard";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ entity: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function single(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

export async function generateMetadata({ params }: PageProps) {
  const { entity } = await params;
  if (!isEntityKey(entity)) return { title: "Import" };
  return {
    title: `Import ${ENTITY_LABELS[entity]}`,
    description: ENTITY_BLURBS[entity],
  };
}

/**
 * Entity-specific wizard page. Checks auth + workspace server-side, then
 * mounts the client wizard with the resolved workspace_id pre-filled.
 */
export default async function ImportEntityPage({ params, searchParams }: PageProps) {
  const { entity } = await params;
  if (!isEntityKey(entity)) notFound();

  const sp = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData?.user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-xl border border-app bg-app-elevated p-8 text-center">
          <h1 className="text-xl font-semibold text-app">Sign in to import</h1>
          <p className="mt-2 text-sm text-muted">
            CSV imports write into your workspace, which means we need to
            know who you are.
          </p>
          <Link
            href={`/signin?next=/import/${entity}`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  const workspaceId = await resolveWorkspaceId(single(sp.workspace) ?? null);
  if (!workspaceId) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-xl border border-app bg-app-elevated p-8 text-center">
          <h1 className="text-xl font-semibold text-app">No workspace</h1>
          <p className="mt-2 text-sm text-muted">
            Imports go into a workspace. Create one (or get invited to one) first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <Link href="/import" className="text-xs text-muted hover:text-app">
          ← All importers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-app">
          Import {ENTITY_LABELS[entity]}
        </h1>
        <p className="mt-1 text-sm text-muted">{ENTITY_BLURBS[entity]}</p>
      </header>

      <Wizard entity={entity} workspaceId={workspaceId} />
    </div>
  );
}
