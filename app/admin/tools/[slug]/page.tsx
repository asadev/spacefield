import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { TOOLS, TOOL_CATEGORIES } from "@/app/tools/_data/tools-list";
import {
  removeWorkspaceGrant,
  setTierAllowedTools,
  setToolDisabled,
  upsertWorkspaceGrant,
} from "../_actions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

type TierRow = {
  tier_id: string;
  name: string;
  sort_order: number;
  allowed_tool_slugs: unknown;
};

type GrantRow = {
  workspace_id: string;
  granted: boolean;
  workspace: { name: string | null } | { name: string | null }[] | null;
};

const TIER_ORDER = ["free", "pro", "team", "enterprise"];

async function setTierAllowedToolsAction(formData: FormData): Promise<void> {
  "use server";
  await setTierAllowedTools(formData);
}

async function upsertWorkspaceGrantAction(formData: FormData): Promise<void> {
  "use server";
  await upsertWorkspaceGrant(formData);
}

export default async function AdminToolDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const tool = TOOLS.find((t) => t.slug === slug);
  if (!tool) notFound();

  const admin = createAdminClient();
  const [{ data: setting }, { data: tiers }, { data: grants }] =
    await Promise.all([
      admin
        .from("tool_settings")
        .select("slug, disabled")
        .eq("slug", slug)
        .maybeSingle(),
      admin
        .from("subscription_tiers")
        .select("tier_id, name, sort_order, allowed_tool_slugs")
        .order("sort_order", { ascending: true }),
      admin
        .from("workspace_tool_grants")
        .select("workspace_id, granted, workspace:workspaces(name)")
        .eq("slug", slug)
        .limit(50),
    ]);

  const disabled = Boolean(setting?.disabled);
  const category =
    TOOL_CATEGORIES.find((c) => c.key === tool.category)?.label ??
    tool.category;
  const tierRows = ((tiers ?? []) as TierRow[]).slice().sort((a, b) => {
    const ia = TIER_ORDER.indexOf(a.tier_id);
    const ib = TIER_ORDER.indexOf(b.tier_id);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.sort_order - b.sort_order;
  });

  const grantRows = (grants ?? []) as GrantRow[];

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/tools"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Tool gating
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">{tool.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-secondary">
          {tool.description}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          <span className="rounded-md border border-app bg-app px-2 py-1">
            {slug}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            {category}
          </span>
        </div>
      </div>

      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">Global status</h2>
        <p className="mt-1 text-xs text-muted">
          Disabled tools are hidden from availability checks and cannot be
          launched.
        </p>
        <form action={setToolDisabled} className="mt-4 flex items-center gap-3">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="disabled" value={disabled ? "false" : "true"} />
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              disabled
                ? "bg-rose-500/15 text-rose-500"
                : "bg-emerald-500/15 text-emerald-500"
            }`}
          >
            {disabled ? "Disabled" : "Live"}
          </span>
          <button
            type="submit"
            className="rounded-md border border-app bg-app px-3 py-1.5 text-xs text-app transition-colors hover:border-tool-accent"
          >
            {disabled ? "Enable tool" : "Disable tool"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">Tier coverage</h2>
        <p className="mt-1 text-xs text-muted">
          Empty tier allow-lists mean everything live. Checking a tier here
          constrains that tier to explicit tools.
        </p>
        <form action={setTierAllowedToolsAction} className="mt-4 space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <div className="grid gap-2 sm:grid-cols-2">
            {tierRows.map((tier) => {
              const allowed = Array.isArray(tier.allowed_tool_slugs)
                ? (tier.allowed_tool_slugs as unknown[]).includes(slug)
                : false;
              const empty =
                !Array.isArray(tier.allowed_tool_slugs) ||
                tier.allowed_tool_slugs.length === 0;
              return (
                <label
                  key={tier.tier_id}
                  className="flex items-center justify-between rounded-lg border border-app bg-app p-3 text-sm"
                >
                  <span>
                    <span className="font-medium text-app">{tier.name}</span>
                    <span className="ml-2 text-xs text-muted">
                      {empty ? "currently unconstrained" : tier.tier_id}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    name="tier_id"
                    value={tier.tier_id}
                    defaultChecked={allowed}
                    className="h-4 w-4 accent-[var(--tool-accent,#7c3aed)]"
                  />
                </label>
              );
            })}
          </div>
          <button
            type="submit"
            className="rounded-md bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            Save tier coverage
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">Workspace overrides</h2>
        <form action={upsertWorkspaceGrantAction} className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input type="hidden" name="slug" value={slug} />
          <input
            name="workspace_id"
            placeholder="Workspace UUID"
            className="rounded-md border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
          />
          <select
            name="granted"
            defaultValue="true"
            className="rounded-md border border-app bg-app px-3 py-2 text-sm text-app"
          >
            <option value="true">Allow</option>
            <option value="false">Block</option>
          </select>
          <button
            type="submit"
            className="rounded-md border border-app bg-app px-3 py-2 text-xs text-app transition-colors hover:border-tool-accent"
          >
            Save override
          </button>
        </form>

        <div className="mt-4 space-y-2">
          {grantRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-muted">
              No workspace-specific overrides.
            </div>
          ) : (
            grantRows.map((grant) => {
              const ws = Array.isArray(grant.workspace)
                ? grant.workspace[0]
                : grant.workspace;
              return (
                <div
                  key={grant.workspace_id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-app bg-app px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-app">
                      {ws?.name ?? grant.workspace_id}
                    </div>
                    <div className="truncate text-[11px] text-muted">
                      {grant.workspace_id}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        grant.granted
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-rose-500/15 text-rose-500"
                      }`}
                    >
                      {grant.granted ? "Allowed" : "Blocked"}
                    </span>
                    <form action={removeWorkspaceGrant}>
                      <input type="hidden" name="slug" value={slug} />
                      <input
                        type="hidden"
                        name="workspace_id"
                        value={grant.workspace_id}
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-app px-2 py-1 text-[11px] text-muted transition-colors hover:text-app"
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
