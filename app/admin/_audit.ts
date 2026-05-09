import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { assertAdmin } from "./_lib";

/**
 * Write a structured audit row. Use this from every admin server action
 * that mutates state — it makes the audit log a real record of who
 * changed what.
 */
export async function recordAdminAction(opts: {
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const auth = await assertAdmin();
  const admin = createAdminClient();
  await admin.from("admin_audit_log").insert({
    actor_id: auth.userId,
    actor_email: auth.email,
    action: opts.action,
    target_type: opts.targetType ?? null,
    target_id: opts.targetId ?? null,
    before: opts.before ?? null,
    after: opts.after ?? null,
    metadata: opts.metadata ?? {},
  });
}
