import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One-click "fill my workspace with sample data" for new accounts.
 *
 * Everything we insert is tagged with a workspace-scoped `__demo__`
 * tag so the DELETE side can rip it all back out without touching the
 * caller's real rows. The seeder is admin-gated upstream (the route
 * handler checks the caller's workspace role).
 *
 * Defensive: each table is attempted independently inside a try/catch.
 * If a parallel migration hasn't landed yet (e.g. `tasks`, `employees`,
 * `onboarding_templates`), we skip that block and report 0 inserted for
 * that bucket.
 */

const DEMO_TAG_SLUG = "__demo__";
const DEMO_TAG_NAME = "__demo__";

export interface SeedCounts {
  contacts: number;
  companies: number;
  tasks: number;
  employees: number;
  comments: number;
  onboarding_templates: number;
}

export interface SeedResult {
  ok: boolean;
  counts: SeedCounts;
  errors: string[];
  /** Returned for completeness — the tag id we used as the marker. */
  demo_tag_id: string | null;
}

async function ensureDemoTag(input: {
  workspaceId: string;
  userId: string;
}): Promise<string | null> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("tags")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("slug", DEMO_TAG_SLUG)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await admin
    .from("tags")
    .insert({
      workspace_id: input.workspaceId,
      name: DEMO_TAG_NAME,
      slug: DEMO_TAG_SLUG,
      color: "#94a3b8",
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id as string;
}

async function tagRows(
  tagId: string,
  entityType: string,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const admin = createAdminClient();
  const rows = ids.map((id) => ({
    tag_id: tagId,
    entity_type: entityType,
    entity_id: id,
  }));
  await admin
    .from("entity_tags")
    .upsert(rows, {
      onConflict: "tag_id,entity_type,entity_id",
      ignoreDuplicates: true,
    });
}

export async function seedDemoData(
  workspaceId: string
): Promise<SeedResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  const result: SeedResult = {
    ok: false,
    counts: {
      contacts: 0,
      companies: 0,
      tasks: 0,
      employees: 0,
      comments: 0,
      onboarding_templates: 0,
    },
    errors: [],
    demo_tag_id: null,
  };
  if (!userId) {
    result.errors.push("unauthorized");
    return result;
  }

  const demoTagId = await ensureDemoTag({ workspaceId, userId });
  if (!demoTagId) {
    result.errors.push("could_not_create_demo_tag");
    return result;
  }
  result.demo_tag_id = demoTagId;

  const admin = createAdminClient();

  // ── crm_companies ──────────────────────────────────────────────
  const companyIds: string[] = [];
  try {
    const companies = [
      { name: "Acme Realty", industry: "Real estate", city: "Dubai" },
      { name: "Northwind Capital", industry: "Investment", city: "London" },
      { name: "Globex Holdings", industry: "Property dev", city: "Singapore" },
    ];
    const rows = companies.map((c) => ({
      workspace_id: workspaceId,
      name: c.name,
      industry: c.industry,
      city: c.city,
      country: "Demo",
      created_by: userId,
    }));
    const { data, error } = await admin
      .from("crm_companies")
      .insert(rows)
      .select("id");
    if (error) {
      result.errors.push(`companies: ${error.message}`);
    } else if (data) {
      for (const r of data as { id: string }[]) companyIds.push(r.id);
      result.counts.companies = companyIds.length;
    }
  } catch (e) {
    result.errors.push(`companies: ${(e as Error).message}`);
  }
  await tagRows(demoTagId, "crm_company", companyIds);

  // ── crm_contacts ───────────────────────────────────────────────
  const contactIds: string[] = [];
  try {
    const firstNames = [
      "Demo Alex",
      "Demo Bree",
      "Demo Cam",
      "Demo Dani",
      "Demo Eli",
      "Demo Finn",
      "Demo Gabe",
      "Demo Hana",
      "Demo Iris",
      "Demo Jude",
    ];
    const rows = firstNames.map((fn, idx) => ({
      workspace_id: workspaceId,
      first_name: fn,
      last_name: "Sample",
      email: `demo+${idx + 1}@spacefield.co`,
      phone: `+0000000${(1000 + idx).toString().slice(-4)}`,
      job_title: "Sample contact",
      company_id: companyIds[idx % Math.max(1, companyIds.length)] ?? null,
      notes: "Demo seed row — safe to delete.",
      created_by: userId,
    }));
    const { data, error } = await admin
      .from("crm_contacts")
      .insert(rows)
      .select("id");
    if (error) {
      result.errors.push(`contacts: ${error.message}`);
    } else if (data) {
      for (const r of data as { id: string }[]) contactIds.push(r.id);
      result.counts.contacts = contactIds.length;
    }
  } catch (e) {
    result.errors.push(`contacts: ${(e as Error).message}`);
  }
  await tagRows(demoTagId, "crm_contact", contactIds);

  // ── tasks (optional table) ─────────────────────────────────────
  const taskIds: string[] = [];
  try {
    const now = Date.now();
    const tasks = [
      { title: "Follow up with demo lead", offsetDays: 1, status: "todo" },
      { title: "Send proposal to Acme", offsetDays: 3, status: "in_progress" },
      { title: "Quarterly portfolio review", offsetDays: 5, status: "todo" },
      { title: "Renew Dubai listing photos", offsetDays: 9, status: "todo" },
      { title: "Sync with Northwind on terms", offsetDays: 13, status: "todo" },
    ];
    const rows = tasks.map((t) => ({
      workspace_id: workspaceId,
      title: t.title,
      status: t.status,
      due_at: new Date(now + t.offsetDays * 86_400_000).toISOString(),
      created_by: userId,
    }));
    const { data, error } = await admin
      .from("tasks")
      .insert(rows)
      .select("id");
    if (error) {
      // Missing table is the expected case here pre-tasks-migration.
      // Surface other errors so the caller can investigate.
      if (!/relation .* does not exist/i.test(error.message)) {
        result.errors.push(`tasks: ${error.message}`);
      }
    } else if (data) {
      for (const r of data as { id: string }[]) taskIds.push(r.id);
      result.counts.tasks = taskIds.length;
    }
  } catch (e) {
    // Silent — likely no tasks table.
    void e;
  }
  await tagRows(demoTagId, "task", taskIds);

  // ── employees (optional table) ─────────────────────────────────
  const employeeIds: string[] = [];
  try {
    const employees = [
      { name: "Demo Mira Operations", title: "Operations lead" },
      { name: "Demo Karim Sales", title: "Sales associate" },
      { name: "Demo Lucia Marketing", title: "Marketing manager" },
      { name: "Demo Sven Finance", title: "Finance analyst" },
      { name: "Demo Priya Engineering", title: "Software engineer" },
    ];
    const rows = employees.map((e) => ({
      workspace_id: workspaceId,
      name: e.name,
      title: e.title,
      email: `${e.name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@spacefield.co`,
      created_by: userId,
    }));
    const { data, error } = await admin
      .from("employees")
      .insert(rows)
      .select("id");
    if (error) {
      if (!/relation .* does not exist/i.test(error.message)) {
        result.errors.push(`employees: ${error.message}`);
      }
    } else if (data) {
      for (const r of data as { id: string }[]) employeeIds.push(r.id);
      result.counts.employees = employeeIds.length;
    }
  } catch (e) {
    void e;
  }
  await tagRows(demoTagId, "employee", employeeIds);

  // ── onboarding_templates (optional table) ──────────────────────
  const onboardingIds: string[] = [];
  try {
    const { data, error } = await admin
      .from("onboarding_templates")
      .insert({
        workspace_id: workspaceId,
        name: "Demo onboarding",
        description: "Sample onboarding flow inserted by the seeder.",
        created_by: userId,
      })
      .select("id");
    if (error) {
      if (!/relation .* does not exist/i.test(error.message)) {
        result.errors.push(`onboarding_templates: ${error.message}`);
      }
    } else if (data) {
      for (const r of data as { id: string }[]) onboardingIds.push(r.id);
      result.counts.onboarding_templates = onboardingIds.length;
    }
  } catch (e) {
    void e;
  }
  await tagRows(demoTagId, "onboarding_template", onboardingIds);

  // ── comments (always exists from 20260514c) ────────────────────
  const commentTargets: { entityType: string; entityId: string }[] = [];
  if (contactIds[0]) {
    commentTargets.push({ entityType: "crm_contact", entityId: contactIds[0] });
  }
  if (contactIds[1]) {
    commentTargets.push({ entityType: "crm_contact", entityId: contactIds[1] });
  }
  if (companyIds[0]) {
    commentTargets.push({ entityType: "crm_company", entityId: companyIds[0] });
  }
  const commentIds: string[] = [];
  try {
    if (commentTargets.length > 0) {
      const rows = commentTargets.map((t, idx) => ({
        workspace_id: workspaceId,
        entity_type: t.entityType,
        entity_id: t.entityId,
        author_user_id: userId,
        body: [
          "Looks promising — let's reach out this week.",
          "Reminder: send the updated pitch deck.",
          "Great call — moving them to the qualified column.",
        ][idx % 3],
      }));
      const { data, error } = await admin
        .from("comments")
        .insert(rows)
        .select("id");
      if (error) {
        result.errors.push(`comments: ${error.message}`);
      } else if (data) {
        for (const r of data as { id: string }[]) commentIds.push(r.id);
        result.counts.comments = commentIds.length;
      }
    }
  } catch (e) {
    result.errors.push(`comments: ${(e as Error).message}`);
  }
  await tagRows(demoTagId, "comment", commentIds);

  result.ok = true;
  return result;
}

/**
 * Tear-down: remove everything tagged `__demo__` in this workspace,
 * then delete the tag itself. Uses the service-role client (we already
 * gated entry by workspace role at the route level).
 */
export async function wipeDemoData(
  workspaceId: string
): Promise<{ ok: boolean; deleted: Record<string, number>; errors: string[] }> {
  const admin = createAdminClient();
  const out = {
    ok: false,
    deleted: {} as Record<string, number>,
    errors: [] as string[],
  };

  const { data: tag, error: tagErr } = await admin
    .from("tags")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("slug", DEMO_TAG_SLUG)
    .maybeSingle();
  if (tagErr) {
    out.errors.push(`tag_lookup: ${tagErr.message}`);
    return out;
  }
  if (!tag) {
    // Nothing was ever seeded — nothing to wipe. Treat as success so
    // the caller can confidently call this idempotently.
    out.ok = true;
    return out;
  }

  const tagId = tag.id as string;

  // Pull every entity link tied to this tag, group by entity_type,
  // then hard-delete from each source table.
  const { data: links, error: linksErr } = await admin
    .from("entity_tags")
    .select("entity_type, entity_id")
    .eq("tag_id", tagId);
  if (linksErr) {
    out.errors.push(`link_lookup: ${linksErr.message}`);
    return out;
  }

  const byType = new Map<string, string[]>();
  for (const row of (links ?? []) as { entity_type: string; entity_id: string }[]) {
    const arr = byType.get(row.entity_type) ?? [];
    arr.push(row.entity_id);
    byType.set(row.entity_type, arr);
  }

  const tableMap: Record<string, string> = {
    crm_contact: "crm_contacts",
    crm_company: "crm_companies",
    task: "tasks",
    employee: "employees",
    onboarding_template: "onboarding_templates",
    comment: "comments",
  };

  for (const [entityType, ids] of byType.entries()) {
    const table = tableMap[entityType];
    if (!table || ids.length === 0) continue;
    try {
      const { error } = await admin
        .from(table)
        .delete()
        .in("id", ids);
      if (error) {
        // Missing-table is the expected case for speculative tables;
        // record other errors but keep going.
        if (!/relation .* does not exist/i.test(error.message)) {
          out.errors.push(`${entityType}: ${error.message}`);
        }
      } else {
        out.deleted[entityType] = ids.length;
      }
    } catch (e) {
      out.errors.push(`${entityType}: ${(e as Error).message}`);
    }
  }

  // entity_tags rows cascade when the tag is deleted, so we don't need
  // to clean them up by hand.
  const { error: tagDelErr } = await admin
    .from("tags")
    .delete()
    .eq("id", tagId);
  if (tagDelErr) {
    out.errors.push(`tag_delete: ${tagDelErr.message}`);
  }

  out.ok = true;
  return out;
}

export const DEMO_TAG = { name: DEMO_TAG_NAME, slug: DEMO_TAG_SLUG };
