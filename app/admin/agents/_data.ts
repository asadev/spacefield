import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { AgentToolOption } from "./_components/AgentForm";

/**
 * Read the live skill registry. We import the registry at module load
 * so we don't need an HTTP roundtrip — the values come from the running
 * code path the runtime itself uses, which keeps the admin in sync with
 * what the agent can actually call.
 *
 * If the import shape changes in the future (e.g., the registry moves
 * to the database), update this single helper. The hardcoded fallback
 * matches the README enum so a broken import doesn't render an empty
 * checkbox grid.
 */
export async function loadSkillIds(): Promise<string[]> {
  try {
    const mod = await import("@/lib/agent/skills");
    type SkillLite = { id: string };
    const all = (mod as { ALL_SKILLS?: SkillLite[] }).ALL_SKILLS ?? [];
    const ids = all.map((s) => s.id).filter(Boolean);
    if (ids.length > 0) return Array.from(new Set(ids)).sort();
  } catch {
    // fall through
  }
  return [
    "workspace",
    "crm-contacts",
    "crm-companies",
    "crm-deals",
    "crm-leads",
    "crm-activities",
    "files",
    "boards",
    "apps",
    "meta",
  ];
}

/**
 * Tools available for the `allowed_tools` multi-select. Sourced from
 * `app_registry` (re + solutions only — OS shell apps and admin pages
 * aren't agent-callable). Returned in alphabetical order with domain &
 * category for the picker UI.
 */
export async function loadToolOptions(): Promise<AgentToolOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("app_registry")
    .select("id, title, domain, category")
    .in("domain", ["re", "solutions"])
    .order("domain", { ascending: true })
    .order("title", { ascending: true });

  if (error || !data) return [];

  type Row = {
    id: string;
    title: string;
    domain: string;
    category: string | null;
  };
  return (data as Row[]).map((r) => ({
    slug: r.id,
    title: r.title,
    domain: r.domain,
    category: r.category ?? "",
  }));
}
