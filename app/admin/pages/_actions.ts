"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type {
  AdminPageBlockKind,
  AdminPageBlockRow,
  AdminPageLayout,
  AdminPageRow,
  AdminPageSection,
} from "../_types";

/**
 * Server actions for /admin/pages — admin-defined pages built from blocks.
 *
 * Page actions:
 *   createPage / updatePage / deletePage / togglePage
 * Block actions:
 *   addBlock / updateBlock / deleteBlock / moveBlock
 * Action runner:
 *   runBlockAction (called from a button-block POST when the form
 *   action targets here directly; the public API at
 *   /api/admin/pages/[id]/run-action is the canonical call site)
 *
 * Audit verbs:
 *   admin_page.create | admin_page.update | admin_page.delete | admin_page.toggle
 *   admin_page_block.create | admin_page_block.update | admin_page_block.delete | admin_page_block.move
 *   admin_page_block.run_action
 */

const SECTIONS: ReadonlyArray<AdminPageSection> = [
  "AI", "Apps", "People", "Data & Ops", "Security",
  "Communication", "Experience", "Money", "Content", "Custom",
];

const LAYOUTS: ReadonlyArray<AdminPageLayout> = [
  "single", "sidebar", "grid", "tabbed",
];

const BLOCK_KINDS: ReadonlyArray<AdminPageBlockKind> = [
  "kpi", "table", "chart", "markdown", "button", "iframe", "form", "divider",
];

function pickSection(v: unknown): AdminPageSection {
  const s = String(v ?? "").trim();
  return (SECTIONS as ReadonlyArray<string>).includes(s)
    ? (s as AdminPageSection)
    : "Custom";
}

function pickLayout(v: unknown): AdminPageLayout {
  const s = String(v ?? "").trim();
  return (LAYOUTS as ReadonlyArray<string>).includes(s)
    ? (s as AdminPageLayout)
    : "single";
}

function pickKind(v: unknown): AdminPageBlockKind | null {
  const s = String(v ?? "").trim();
  return (BLOCK_KINDS as ReadonlyArray<string>).includes(s)
    ? (s as AdminPageBlockKind)
    : null;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function pickInt(v: unknown, fallback = 0): number {
  const n = Number(String(v ?? ""));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function parseConfigJson(v: unknown): Record<string, unknown> {
  const raw = String(v ?? "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function fetchPage(id: string): Promise<AdminPageRow | null> {
  const sb = createAdminClient();
  const { data } = await sb
    .from("admin_pages")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as AdminPageRow | null) ?? null;
}

async function fetchBlock(id: string): Promise<AdminPageBlockRow | null> {
  const sb = createAdminClient();
  const { data } = await sb
    .from("admin_page_blocks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as AdminPageBlockRow | null) ?? null;
}

/* ─────────────────────── page actions ─────────────────────── */

export async function createPage(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const titleRaw = String(formData.get("title") ?? "").trim();
  if (!titleRaw) throw new Error("missing title");
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = slugify(idRaw || titleRaw);
  if (!id) throw new Error("invalid id");

  const patch = {
    id,
    title: titleRaw,
    description: String(formData.get("description") ?? "").trim(),
    icon: String(formData.get("icon") ?? "").trim() || null,
    section: pickSection(formData.get("section")),
    layout: pickLayout(formData.get("layout")),
    enabled: formData.get("enabled") === "on",
    sort_order: pickInt(formData.get("sort_order"), 0),
    required_role:
      String(formData.get("required_role") ?? "").trim() || null,
    updated_by: auth.userId,
  };

  const sb = createAdminClient();
  const { error } = await sb.from("admin_pages").insert(patch);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "admin_page.create",
    targetType: "admin_pages",
    targetId: id,
    after: patch,
  });

  revalidatePath("/admin/pages");
  revalidatePath(`/admin/pages/${id}`);
  revalidatePath(`/admin/custom/${id}`);
  redirect(`/admin/pages/${encodeURIComponent(id)}`);
}

export async function updatePage(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchPage(id);
  if (!before) throw new Error("page not found");

  const patch = {
    title: String(formData.get("title") ?? before.title).trim(),
    description: String(formData.get("description") ?? before.description).trim(),
    icon: String(formData.get("icon") ?? "").trim() || null,
    section: pickSection(formData.get("section")),
    layout: pickLayout(formData.get("layout")),
    enabled: formData.get("enabled") === "on",
    sort_order: pickInt(formData.get("sort_order"), before.sort_order),
    required_role:
      String(formData.get("required_role") ?? "").trim() || null,
    updated_by: auth.userId,
  };
  if (!patch.title) throw new Error("missing title");

  const sb = createAdminClient();
  const { error } = await sb
    .from("admin_pages")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "admin_page.update",
    targetType: "admin_pages",
    targetId: id,
    before: {
      title: before.title,
      description: before.description,
      icon: before.icon,
      section: before.section,
      layout: before.layout,
      enabled: before.enabled,
      sort_order: before.sort_order,
      required_role: before.required_role,
    },
    after: patch,
  });

  revalidatePath("/admin/pages");
  revalidatePath(`/admin/pages/${id}`);
  revalidatePath(`/admin/custom/${id}`);
}

export async function togglePage(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchPage(id);
  if (!before) throw new Error("page not found");

  const next = { enabled: !before.enabled, updated_by: auth.userId };

  const sb = createAdminClient();
  const { error } = await sb
    .from("admin_pages")
    .update(next)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "admin_page.toggle",
    targetType: "admin_pages",
    targetId: id,
    before: { enabled: before.enabled },
    after: next,
  });

  revalidatePath("/admin/pages");
  revalidatePath(`/admin/pages/${id}`);
  revalidatePath(`/admin/custom/${id}`);
}

export async function deletePage(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchPage(id);

  const sb = createAdminClient();
  // Blocks cascade via ON DELETE CASCADE in the migration.
  const { error } = await sb.from("admin_pages").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "admin_page.delete",
    targetType: "admin_pages",
    targetId: id,
    before: before ?? null,
    after: null,
  });

  revalidatePath("/admin/pages");
  revalidatePath(`/admin/custom/${id}`);
  redirect("/admin/pages");
}

/* ─────────────────────── block actions ─────────────────────── */

async function nextBlockSortOrder(pageId: string): Promise<number> {
  const sb = createAdminClient();
  const { data } = await sb
    .from("admin_page_blocks")
    .select("sort_order")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const rows = (data ?? []) as Array<{ sort_order: number }>;
  return (rows[0]?.sort_order ?? -1) + 1;
}

export async function addBlock(formData: FormData): Promise<void> {
  await assertAdmin();
  const pageId = String(formData.get("page_id") ?? "").trim();
  if (!pageId) throw new Error("missing page_id");
  const page = await fetchPage(pageId);
  if (!page) throw new Error("page not found");

  const kind = pickKind(formData.get("kind"));
  if (!kind) throw new Error("invalid kind");

  const title = String(formData.get("title") ?? "").trim() || null;
  const config = parseConfigJson(formData.get("config"));
  const sortOrder = pickInt(formData.get("sort_order"), -1);
  const finalSortOrder =
    sortOrder >= 0 ? sortOrder : await nextBlockSortOrder(pageId);

  const insert = {
    page_id: pageId,
    kind,
    title,
    config,
    sort_order: finalSortOrder,
  };

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("admin_page_blocks")
    .insert(insert)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const newId = (data as { id: string } | null)?.id ?? undefined;

  await recordAdminAction({
    action: "admin_page_block.create",
    targetType: "admin_page_blocks",
    targetId: newId,
    metadata: { page_id: pageId, kind },
    after: insert,
  });

  revalidatePath(`/admin/pages/${pageId}`);
  revalidatePath(`/admin/custom/${pageId}`);
}

export async function updateBlock(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchBlock(id);
  if (!before) throw new Error("block not found");

  const title = String(formData.get("title") ?? "").trim() || null;
  const config = parseConfigJson(formData.get("config"));
  const kind = pickKind(formData.get("kind")) ?? before.kind;
  const sortOrder = pickInt(formData.get("sort_order"), before.sort_order);

  const patch = { kind, title, config, sort_order: sortOrder };

  const sb = createAdminClient();
  const { error } = await sb
    .from("admin_page_blocks")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "admin_page_block.update",
    targetType: "admin_page_blocks",
    targetId: id,
    metadata: { page_id: before.page_id },
    before: {
      kind: before.kind,
      title: before.title,
      config: before.config,
      sort_order: before.sort_order,
    },
    after: patch,
  });

  revalidatePath(`/admin/pages/${before.page_id}`);
  revalidatePath(`/admin/custom/${before.page_id}`);
}

export async function deleteBlock(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchBlock(id);

  const sb = createAdminClient();
  const { error } = await sb
    .from("admin_page_blocks")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "admin_page_block.delete",
    targetType: "admin_page_blocks",
    targetId: id,
    metadata: before ? { page_id: before.page_id, kind: before.kind } : {},
    before: before ?? null,
    after: null,
  });

  if (before) {
    revalidatePath(`/admin/pages/${before.page_id}`);
    revalidatePath(`/admin/custom/${before.page_id}`);
  }
}

export async function moveBlock(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const dirRaw = String(formData.get("direction") ?? "").trim();
  const direction: "up" | "down" =
    dirRaw === "up" ? "up" : dirRaw === "down" ? "down" : (() => {
      throw new Error("invalid direction");
    })();

  const before = await fetchBlock(id);
  if (!before) throw new Error("block not found");

  const sb = createAdminClient();
  const { data: siblingsData } = await sb
    .from("admin_page_blocks")
    .select("id, sort_order")
    .eq("page_id", before.page_id)
    .order("sort_order", { ascending: true });
  const siblings = (siblingsData ?? []) as Array<{
    id: string;
    sort_order: number;
  }>;

  const idx = siblings.findIndex((s) => s.id === id);
  if (idx < 0) return;

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblings.length) return;

  const a = siblings[idx];
  const b = siblings[swapIdx];

  // Two-step swap so we don't briefly violate any unique constraints
  // (none today, but the pattern stays clean if added later).
  await sb.from("admin_page_blocks").update({ sort_order: -1 - idx }).eq("id", a.id);
  await sb.from("admin_page_blocks").update({ sort_order: a.sort_order }).eq("id", b.id);
  await sb.from("admin_page_blocks").update({ sort_order: b.sort_order }).eq("id", a.id);

  await recordAdminAction({
    action: "admin_page_block.move",
    targetType: "admin_page_blocks",
    targetId: id,
    metadata: {
      page_id: before.page_id,
      direction,
      from: a.sort_order,
      to: b.sort_order,
    },
    before: { sort_order: a.sort_order },
    after: { sort_order: b.sort_order },
  });

  revalidatePath(`/admin/pages/${before.page_id}`);
  revalidatePath(`/admin/custom/${before.page_id}`);
}

/* ─────────────────────── action runner ─────────────────────── */

/**
 * Execute a button or form block's configured action. Used by the API
 * route — exposed as a server action so other server-side callers (a
 * future "run from preview" button, for instance) can reuse it.
 *
 * Action kinds:
 *   - rpc       — calls supabase.rpc(target, payload). Service-role.
 *   - workflow  — looks up agent_workflows.id == target and queues a
 *                 manual run (writes a `workflow_run_requests` row if the
 *                 table exists, otherwise records audit + returns).
 *   - href      — buttons with href are link-only; this path is unused.
 *
 * Return shape — inlined here because "use server" files may only export
 * async functions (no type re-exports). The API route + caller redeclare
 * the same fields locally.
 */
export async function runBlockAction(opts: {
  blockId: string;
  payload: Record<string, unknown>;
}): Promise<{
  ok: boolean;
  error?: string;
  result?: unknown;
  dispatch?: Record<string, unknown>;
  duration_ms: number;
}> {
  await assertAdmin();
  const start = Date.now();

  const block = await fetchBlock(opts.blockId);
  if (!block) {
    return {
      ok: false,
      error: "block_not_found",
      duration_ms: Date.now() - start,
    };
  }

  const cfg = (block.config ?? {}) as Record<string, unknown>;

  // Form-block dispatch: the block is a form, so its target is
  // submit_target; treat it as an RPC call by default.
  let actionKind: "rpc" | "workflow" | "href" = "rpc";
  let target = "";

  if (block.kind === "button") {
    const ak = String(cfg.action_kind ?? "").trim();
    actionKind =
      ak === "workflow" || ak === "href" || ak === "rpc"
        ? (ak as "rpc" | "workflow" | "href")
        : "rpc";
    target = String(cfg.target ?? "").trim();
  } else if (block.kind === "form") {
    target = String(cfg.submit_target ?? "").trim();
    actionKind = "rpc";
  } else {
    return {
      ok: false,
      error: "block_not_actionable",
      duration_ms: Date.now() - start,
    };
  }

  if (!target) {
    return {
      ok: false,
      error: "no_target",
      duration_ms: Date.now() - start,
    };
  }

  const sb = createAdminClient();
  let result: unknown = null;
  let dispatchError: string | null = null;
  let dispatched = false;
  let dispatch: Record<string, unknown> = {
    action_kind: actionKind,
    target,
  };

  if (actionKind === "rpc") {
    try {
      const { data, error } = await sb.rpc(target, opts.payload);
      if (error) {
        dispatchError = error.message;
      } else {
        result = data;
        dispatched = true;
      }
    } catch (e) {
      dispatchError = e instanceof Error ? e.message : String(e);
    }
  } else if (actionKind === "workflow") {
    // Queue a workflow run via a side-channel. If the env doesn't yet have
    // workflow_run_requests we fall back to logging audit metadata only.
    try {
      const wf = await sb
        .from("agent_workflows")
        .select("id, display_name, status")
        .eq("id", target)
        .maybeSingle();
      if (wf.error || !wf.data) {
        dispatchError = wf.error?.message ?? "workflow_not_found";
      } else {
        const { error: insErr } = await sb
          .from("workflow_run_requests")
          .insert({
            workflow_id: target,
            payload: opts.payload,
            triggered_by: "admin_page_block",
          });
        if (insErr) {
          // Table may not exist — that's fine, we'll log and report.
          dispatch = {
            ...dispatch,
            note: "workflow_run_requests not registered; recording audit only.",
          };
          dispatched = false;
        } else {
          dispatched = true;
        }
      }
    } catch (e) {
      dispatchError = e instanceof Error ? e.message : String(e);
    }
  } else {
    // href shouldn't reach here, but be defensive.
    dispatch = { ...dispatch, note: "href_button_dispatched_via_api" };
  }

  const durationMs = Date.now() - start;

  await recordAdminAction({
    action: "admin_page_block.run_action",
    targetType: "admin_page_blocks",
    targetId: block.id,
    metadata: {
      page_id: block.page_id,
      kind: block.kind,
      action_kind: actionKind,
      target,
      dispatched,
      duration_ms: durationMs,
    },
    before: null,
    after: { payload: opts.payload },
  });

  return {
    ok: !dispatchError,
    error: dispatchError ?? undefined,
    result,
    dispatch,
    duration_ms: durationMs,
  };
}
