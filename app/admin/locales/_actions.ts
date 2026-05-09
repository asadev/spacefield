"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { LocaleRow, LocaleStringRow } from "../_types";

/**
 * Server actions for /admin/locales and /admin/locales/[code].
 *
 * Two scopes:
 *   - locales table: createLocale, updateLocale, deleteLocale,
 *     setDefault, toggleEnabled
 *   - locale_strings table: setString, deleteString, bulkImport
 *
 * Audit verbs:
 *   - locale.create / locale.update / locale.delete / locale.set_default
 *     / locale.toggle_enabled
 *   - locale_string.set / locale_string.delete / locale_string.bulk_import
 *
 * setDefault is the tricky one — it needs to unset is_default on every
 * other row. We do that in a single update + a single update.
 */

const CODE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;

function normalizeCode(raw: unknown): string | null {
  // Accept "en", "en-us", "EN", "EN-US" — return canonical "en" or
  // "en-US". Two-letter language with optional two-letter region.
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^([a-zA-Z]{2})(?:[-_]([a-zA-Z]{2}))?$/);
  if (!m) return null;
  const lang = m[1].toLowerCase();
  const region = m[2]?.toUpperCase();
  return region ? `${lang}-${region}` : lang;
}

function strKey(raw: unknown): string {
  return String(raw ?? "").trim();
}

async function fetchLocale(code: string): Promise<LocaleRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("locales")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  return (data as LocaleRow | null) ?? null;
}

async function fetchString(
  locale_code: string,
  string_key: string
): Promise<LocaleStringRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("locale_strings")
    .select("*")
    .eq("locale_code", locale_code)
    .eq("string_key", string_key)
    .maybeSingle();
  return (data as LocaleStringRow | null) ?? null;
}

/* ────────────────── createLocale ────────────────── */

export async function createLocale(formData: FormData): Promise<void> {
  await assertAdmin();
  const code = normalizeCode(formData.get("code"));
  if (!code) throw new Error("invalid code (use 2-letter ISO)");
  if (!CODE_RE.test(code)) throw new Error("invalid code");

  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name) throw new Error("missing display_name");

  const enabled = formData.get("enabled") === "on";
  const rtl = formData.get("rtl") === "on";
  const is_default = formData.get("is_default") === "on";

  const admin = createAdminClient();

  // If setting default, clear other defaults first.
  if (is_default) {
    const { error: clearErr } = await admin
      .from("locales")
      .update({ is_default: false })
      .neq("code", code);
    if (clearErr) throw new Error(clearErr.message);
  }

  const insertRow = {
    code,
    display_name,
    enabled,
    rtl,
    is_default,
  };

  const { data, error } = await admin
    .from("locales")
    .insert(insertRow)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "locale.create",
    targetType: "locale",
    targetId: code,
    after: data,
  });

  revalidatePath("/admin/locales");
  redirect(`/admin/locales/${encodeURIComponent(code)}`);
}

/* ────────────────── updateLocale ────────────────── */

export async function updateLocale(formData: FormData): Promise<void> {
  await assertAdmin();
  const code = normalizeCode(formData.get("code"));
  if (!code) throw new Error("invalid code");

  const before = await fetchLocale(code);
  if (!before) throw new Error("locale not found");

  const display_name = String(formData.get("display_name") ?? "").trim();
  const enabled = formData.get("enabled") === "on";
  const rtl = formData.get("rtl") === "on";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("locales")
    .update({
      display_name: display_name || before.display_name,
      enabled,
      rtl,
    })
    .eq("code", code)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "locale.update",
    targetType: "locale",
    targetId: code,
    before,
    after: data,
  });

  revalidatePath("/admin/locales");
  revalidatePath(`/admin/locales/${encodeURIComponent(code)}`);
}

/* ────────────────── deleteLocale ────────────────── */

export async function deleteLocale(formData: FormData): Promise<void> {
  await assertAdmin();
  const code = normalizeCode(formData.get("code"));
  if (!code) throw new Error("invalid code");

  const before = await fetchLocale(code);
  if (!before) throw new Error("locale not found");

  if (before.is_default) {
    throw new Error("cannot delete the default locale");
  }

  const admin = createAdminClient();
  // Cascade is on the FK — locale_strings will go with it.
  const { error } = await admin.from("locales").delete().eq("code", code);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "locale.delete",
    targetType: "locale",
    targetId: code,
    before,
  });

  revalidatePath("/admin/locales");
  redirect("/admin/locales");
}

/* ────────────────── setDefault ────────────────── */

export async function setDefault(formData: FormData): Promise<void> {
  await assertAdmin();
  const code = normalizeCode(formData.get("code"));
  if (!code) throw new Error("invalid code");

  const before = await fetchLocale(code);
  if (!before) throw new Error("locale not found");

  const admin = createAdminClient();

  // Unset every other locale's is_default first.
  const { error: clearErr } = await admin
    .from("locales")
    .update({ is_default: false })
    .neq("code", code);
  if (clearErr) throw new Error(clearErr.message);

  const { data, error } = await admin
    .from("locales")
    .update({ is_default: true, enabled: true })
    .eq("code", code)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "locale.set_default",
    targetType: "locale",
    targetId: code,
    before,
    after: data,
  });

  revalidatePath("/admin/locales");
  revalidatePath(`/admin/locales/${encodeURIComponent(code)}`);
}

/* ────────────────── toggleEnabled ────────────────── */

export async function toggleEnabled(formData: FormData): Promise<void> {
  await assertAdmin();
  const code = normalizeCode(formData.get("code"));
  if (!code) throw new Error("invalid code");

  const before = await fetchLocale(code);
  if (!before) throw new Error("locale not found");

  if (before.is_default && before.enabled) {
    throw new Error("cannot disable the default locale");
  }

  const next = !before.enabled;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("locales")
    .update({ enabled: next })
    .eq("code", code)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "locale.toggle_enabled",
    targetType: "locale",
    targetId: code,
    before,
    after: data,
    metadata: { next },
  });

  revalidatePath("/admin/locales");
  revalidatePath(`/admin/locales/${encodeURIComponent(code)}`);
}

/* ────────────────── setString ────────────────── */

export async function setString(formData: FormData): Promise<void> {
  await assertAdmin();
  const locale_code = normalizeCode(formData.get("locale_code"));
  if (!locale_code) throw new Error("invalid locale_code");

  const string_key = strKey(formData.get("string_key"));
  if (!string_key) throw new Error("missing string_key");
  if (string_key.length > 200) throw new Error("string_key too long");

  const value = String(formData.get("value") ?? "");
  const ctxRaw = String(formData.get("context") ?? "").trim();
  const context = ctxRaw.length ? ctxRaw : null;

  const before = await fetchString(locale_code, string_key);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("locale_strings")
    .upsert(
      {
        locale_code,
        string_key,
        value,
        context,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "locale_code,string_key" }
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "locale_string.set",
    targetType: "locale_string",
    targetId: `${locale_code}:${string_key}`,
    before,
    after: data,
  });

  revalidatePath(`/admin/locales/${encodeURIComponent(locale_code)}`);
}

/* ────────────────── deleteString ────────────────── */

export async function deleteString(formData: FormData): Promise<void> {
  await assertAdmin();
  const locale_code = normalizeCode(formData.get("locale_code"));
  if (!locale_code) throw new Error("invalid locale_code");

  const string_key = strKey(formData.get("string_key"));
  if (!string_key) throw new Error("missing string_key");

  const before = await fetchString(locale_code, string_key);
  if (!before) throw new Error("string not found");

  const admin = createAdminClient();
  const { error } = await admin
    .from("locale_strings")
    .delete()
    .eq("locale_code", locale_code)
    .eq("string_key", string_key);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "locale_string.delete",
    targetType: "locale_string",
    targetId: `${locale_code}:${string_key}`,
    before,
  });

  revalidatePath(`/admin/locales/${encodeURIComponent(locale_code)}`);
}

/* ────────────────── bulkImport ────────────────── */

export async function bulkImport(formData: FormData): Promise<void> {
  await assertAdmin();
  const locale_code = normalizeCode(formData.get("locale_code"));
  if (!locale_code) throw new Error("invalid locale_code");

  const raw = String(formData.get("payload") ?? "").trim();
  if (!raw) throw new Error("empty payload");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("payload is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be a JSON object {key:value}");
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) throw new Error("no entries in payload");
  if (entries.length > 5000) throw new Error("too many entries (max 5000)");

  // Coerce values: anything non-string (number, bool, object) gets
  // JSON.stringify so the upsert always has a real string. We skip
  // entries with empty/whitespace keys.
  const now = new Date().toISOString();
  const rows: LocaleStringRow[] = [];
  for (const [k, v] of entries) {
    const key = k.trim();
    if (!key) continue;
    if (key.length > 200) continue;
    const value =
      typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
    rows.push({
      locale_code,
      string_key: key,
      value,
      context: null,
      updated_at: now,
    });
  }

  if (rows.length === 0) throw new Error("no valid rows after filtering");

  const admin = createAdminClient();
  const { error } = await admin
    .from("locale_strings")
    .upsert(rows, { onConflict: "locale_code,string_key" });
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "locale_string.bulk_import",
    targetType: "locale",
    targetId: locale_code,
    metadata: { count: rows.length },
  });

  revalidatePath(`/admin/locales/${encodeURIComponent(locale_code)}`);
}
