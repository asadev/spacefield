"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";

import { EMAIL_ROLES } from "../_types";
import type { EmailCategory, EmailRole } from "../_types";

import { sendTemplate } from "@/lib/email-templates";

/**
 * Server actions for `/admin/emails`. Every action calls
 * `assertAdmin()` and `recordAdminAction(...)` so the audit log captures
 * every change.
 *
 * `"use server"` files can only export async functions — keep types/
 * constants in `_types.ts` (or import from `app/admin/_types`).
 */

const KEY_REGEX = /^[a-z][a-z0-9_.\-]*$/;

const CATEGORIES: EmailCategory[] = [
  "transactional",
  "marketing",
  "auth",
  "notification",
  "digest",
];

function parseCategory(raw: unknown): EmailCategory {
  const s = String(raw ?? "transactional").toLowerCase();
  return (CATEGORIES as string[]).includes(s)
    ? (s as EmailCategory)
    : "transactional";
}

function parseRole(raw: unknown): EmailRole {
  const s = String(raw ?? "noreply").toLowerCase();
  return (EMAIL_ROLES as string[]).includes(s)
    ? (s as EmailRole)
    : "noreply";
}

/** Parse one variable name per line. Drops empties + invalid chars. */
function parseVariables(raw: unknown): string[] {
  const text = String(raw ?? "");
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!/^[a-zA-Z0-9_.\-]+$/.test(trimmed)) continue;
    seen.add(trimmed);
  }
  return Array.from(seen);
}

/* ─────────────────────── createTemplate ─────────────────────── */

export async function createTemplate(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const key = String(formData.get("key") ?? "").trim().toLowerCase();
  const display_name = String(formData.get("display_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = parseCategory(formData.get("category"));
  const role = parseRole(formData.get("role"));
  const subject = String(formData.get("subject") ?? "").trim();
  const html = String(formData.get("html") ?? "");
  const plain_text_raw = String(formData.get("plain_text") ?? "");
  const plain_text = plain_text_raw.trim() ? plain_text_raw : null;
  const variables_json = parseVariables(formData.get("variables_json"));
  const enabled = formData.get("enabled") === "on";
  const locale =
    String(formData.get("locale") ?? "en").trim().toLowerCase() || "en";

  if (!key) throw new Error("missing key");
  if (!KEY_REGEX.test(key)) {
    throw new Error(
      "invalid key — use lowercase letters, digits, underscores, dots, hyphens"
    );
  }
  if (!subject) throw new Error("missing subject");
  if (!display_name) throw new Error("missing display name");

  const insertRow = {
    key,
    display_name,
    description,
    category,
    role,
    subject,
    html,
    plain_text,
    variables_json,
    enabled,
    locale,
    updated_by: auth.userId,
  };

  const admin = createAdminClient();
  const { error } = await admin.from("email_templates").insert(insertRow);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "email_template.create",
    targetType: "email_template",
    targetId: key,
    after: insertRow,
  });

  revalidatePath("/admin/emails");
  redirect(`/admin/emails/${encodeURIComponent(key)}`);
}

/* ─────────────────────── updateTemplate ─────────────────────── */

export async function updateTemplate(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const key = String(formData.get("key") ?? "").trim().toLowerCase();
  if (!key) throw new Error("missing key");

  const display_name = String(formData.get("display_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = parseCategory(formData.get("category"));
  const role = parseRole(formData.get("role"));
  const subject = String(formData.get("subject") ?? "").trim();
  const html = String(formData.get("html") ?? "");
  const plain_text_raw = String(formData.get("plain_text") ?? "");
  const plain_text = plain_text_raw.trim() ? plain_text_raw : null;
  const variables_json = parseVariables(formData.get("variables_json"));
  const enabled = formData.get("enabled") === "on";
  const locale =
    String(formData.get("locale") ?? "en").trim().toLowerCase() || "en";

  if (!subject) throw new Error("missing subject");
  if (!display_name) throw new Error("missing display name");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("email_templates")
    .select(
      "key, display_name, description, category, role, subject, html, plain_text, variables_json, enabled, locale"
    )
    .eq("key", key)
    .maybeSingle();

  const update = {
    display_name,
    description,
    category,
    role,
    subject,
    html,
    plain_text,
    variables_json,
    enabled,
    locale,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("email_templates")
    .update(update)
    .eq("key", key);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "email_template.update",
    targetType: "email_template",
    targetId: key,
    before,
    after: { key, ...update },
  });

  revalidatePath("/admin/emails");
  revalidatePath(`/admin/emails/${encodeURIComponent(key)}`);
}

/* ─────────────────────── deleteTemplate ─────────────────────── */

export async function deleteTemplate(formData: FormData): Promise<void> {
  await assertAdmin();
  const key = String(formData.get("key") ?? "").trim().toLowerCase();
  if (!key) throw new Error("missing key");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("email_templates")
    .select(
      "key, display_name, description, category, role, subject, html, plain_text, variables_json, enabled, locale"
    )
    .eq("key", key)
    .maybeSingle();

  const { error } = await admin.from("email_templates").delete().eq("key", key);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "email_template.delete",
    targetType: "email_template",
    targetId: key,
    before,
  });

  revalidatePath("/admin/emails");
  redirect("/admin/emails");
}

/* ─────────────────────── testSend ─────────────────────── */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Test-send a template to an admin-supplied email address. Vars come from
 * `?test_<name>=...` query params encoded into hidden form fields by the
 * editor page (so admins can preview AND test-send with the same values).
 */
export async function testSend(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const key = String(formData.get("key") ?? "").trim().toLowerCase();
  const to = String(formData.get("to") ?? "").trim();
  if (!key) throw new Error("missing key");
  if (!to) throw new Error("missing recipient");
  if (!EMAIL_REGEX.test(to)) throw new Error("invalid email address");

  // Vars come in as `var_<name>` form fields.
  const vars: Record<string, string> = {};
  for (const [field, raw] of formData.entries()) {
    if (field.startsWith("var_")) {
      const name = field.slice(4);
      vars[name] = typeof raw === "string" ? raw : String(raw);
    }
  }

  let providerId: string | null = null;
  let sendErr: string | null = null;
  try {
    const r = await sendTemplate({
      templateKey: key,
      to,
      vars,
      sentBy: auth.userId,
    });
    providerId = r?.id ?? null;
  } catch (err) {
    sendErr = err instanceof Error ? err.message : "send failed";
  }

  // Stamp last_test_send_at so the index page can show "tested 5m ago".
  const admin = createAdminClient();
  await admin
    .from("email_templates")
    .update({ last_test_send_at: new Date().toISOString() })
    .eq("key", key);

  await recordAdminAction({
    action: "email_template.test_send",
    targetType: "email_template",
    targetId: key,
    after: {
      to,
      provider_id: providerId,
      error: sendErr,
      var_count: Object.keys(vars).length,
    },
  });

  if (sendErr) {
    // Throw so Next surfaces the error to the admin.
    throw new Error(sendErr);
  }

  revalidatePath(`/admin/emails/${encodeURIComponent(key)}`);
  revalidatePath("/admin/emails");
}
