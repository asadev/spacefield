import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALL_INDUSTRIES } from "@/lib/industry/registry";
import type { Industry } from "@/lib/industry/types";

const INDUSTRY_SLUGS: ReadonlySet<string> = new Set(
  ALL_INDUSTRIES.map((i) => i.slug)
);

/* POST /api/workspaces/ensure
 *   body: { id, name, industry? }
 *
 * Lazy materializer for workspaces. The desktop creates workspaces in
 * localStorage and we mirror them into public.workspaces here.
 *
 * The hard part is RLS: when the caller doesn't own a workspace, the
 * SELECT-side RLS policy hides the row. So a stale localStorage id that
 * collides with another user's workspace looks like "doesn't exist" to
 * the caller, the route tries INSERT, and it fails with a duplicate-key
 * error that's a misleading symptom of the real problem.
 *
 * Fix: do the lookup with the SERVICE-ROLE client (bypasses RLS) so we
 * see the truth, then branch correctly:
 *
 *   a. Row exists, caller is owner       → upsert membership, return 200
 *   b. Row exists, caller is member      → return 200
 *   c. Row exists, caller is unrelated   → return 409 with code
 *      "id_collision" so the client can regenerate the local id and
 *      retry. (Not 403 — this isn't a permissions check, it's a stale
 *      local-id collision.)
 *   d. Row does not exist                → INSERT as caller-owned. The
 *      on_workspace_created trigger handles workspace_members. If the
 *      INSERT fails because of the workspace_owner_quota trigger, that
 *      bubbles up as a 400 with the original message which the client
 *      already special-cases to surface "Workspace limit reached".
 *
 * The route returns the canonical id in `workspace.id` — for normal
 * cases this matches the request id, but the client should always
 * trust the response over its local copy.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { id?: string; name?: string; industry?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { id, name, industry: rawIndustry } = body;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  }

  const safeName = (name ?? "").toString().trim().slice(0, 80) || "Workspace";

  // industry is optional on ensure() to stay backward-compatible with the
  // existing desktop flow (workspace gets minted before the user picks an
  // industry from onboarding). When the client does supply one, validate
  // it against the enum so an invalid slug returns 400 instead of failing
  // the INSERT with a CHECK-violation message that the UI can't render.
  let industry: Industry | null = null;
  if (rawIndustry !== undefined && rawIndustry !== null) {
    if (typeof rawIndustry !== "string" || !INDUSTRY_SLUGS.has(rawIndustry)) {
      return NextResponse.json(
        { error: "industry must be a known slug" },
        { status: 400 }
      );
    }
    industry = rawIndustry as Industry;
  }

  // Service-role lookup — sees the row regardless of caller's RLS.
  const admin = createAdminClient();
  const { data: existing, error: lookupErr } = await admin
    .from("workspaces")
    .select("id, user_id, name, industry")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }

  if (existing) {
    if (existing.user_id === user.id) {
      // (a) Caller owns this workspace. Self-heal owner-membership in
      //     case the trigger ever missed.
      await admin
        .from("workspace_members")
        .upsert(
          {
            workspace_id: id,
            user_id: user.id,
            role: "owner",
            invited_by: user.id,
          },
          { onConflict: "workspace_id,user_id", ignoreDuplicates: false }
        );
      // If the caller just learned their industry (e.g. they're
      // finishing onboarding for an already-materialized workspace),
      // record it now — but never overwrite a previous choice via this
      // route. Owners who want to change it go through /update.
      if (industry && !existing.industry) {
        await admin
          .from("workspaces")
          .update({ industry })
          .eq("id", id);
      }
      return NextResponse.json({
        workspace: { ...existing, industry: existing.industry ?? industry ?? null },
        role: "owner",
        created: false,
      });
    }
    // (b) or (c) — service-role check membership.
    const { data: member } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (member) {
      return NextResponse.json({
        workspace: { id, name: existing.name, user_id: existing.user_id },
        role: member.role,
        created: false,
      });
    }
    // (c) Stale localStorage id collides with someone else's workspace.
    //     The caller has no business with this row. Tell the client to
    //     regenerate locally and retry — they can't access this UUID.
    return NextResponse.json(
      {
        error: "id_collision",
        message:
          "This workspace id is already used by another account. Drop it and try again with a fresh id.",
      },
      { status: 409 }
    );
  }

  // (d) Row doesn't exist anywhere. INSERT as caller-owned via the
  //     user-scoped client (so RLS check fires and we get a real 400 if
  //     the quota trigger blocks us).
  //
  //     `slug` is NOT NULL and globally unique (see 20260428 migration).
  //     We seed it with the UUID so callers don't need to supply one.
  //     Future work can add a "rename slug" admin path.
  //
  //     industry is optional — when set, persisted on insert; when
  //     omitted, the workspace is created with industry = NULL and the
  //     onboarding/settings UI prompts the user to pick later.
  const insertRow: Record<string, string | null> = {
    id,
    user_id: user.id,
    name: safeName,
    slug: id,
  };
  if (industry) insertRow.industry = industry;

  const { data: created, error: insertErr } = await supabase
    .from("workspaces")
    .insert(insertRow)
    .select("id, user_id, name, slug, industry")
    .single();
  if (insertErr) {
    return NextResponse.json(
      { error: insertErr.message },
      { status: insertErr.message?.includes("workspace limit reached") ? 403 : 400 }
    );
  }

  return NextResponse.json({
    workspace: created,
    role: "owner",
    created: true,
  });
}
