"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { clearRuntimeConfigCache } from "@/lib/runtime-config";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { RuntimeConfigValueType } from "../_types";

/**
 * Server actions for `/admin/runtime-config`. Every action calls
 * `assertAdmin()` and `recordAdminAction(...)` so the audit log
 * captures every change, and busts the in-memory cache in
 * `lib/runtime-config.ts` so callers see the new value within a render
 * or two.
 *
 * Validation: each value is parsed against its declared `value_type`
 * before write. Rejection comes back as a thrown Error (server actions
 * surface the message to the form).
 */

const KEY_REGEX = /^[a-z][a-z0-9_.-]*$/;
const VALUE_TYPES: RuntimeConfigValueType[] = [
  "string",
  "number",
  "boolean",
  "json",
  "secret",
];

function parseValueType(input: unknown): RuntimeConfigValueType {
  const s = String(input ?? "string").toLowerCase();
  return (VALUE_TYPES as string[]).includes(s)
    ? (s as RuntimeConfigValueType)
    : "string";
}

/**
 * Parse a raw form value against a declared `value_type`. Throws a
 * friendly Error on mismatch — server actions show this to the user.
 *
 * - string / secret → stored as JSON string
 * - number          → must be finite; stored as JSON number
 * - boolean         → "on"/"true"/"1" → true; everything else → false
 * - json            → must `JSON.parse()` cleanly; stored as the parsed value
 */
function parseValueForType(
  raw: unknown,
  valueType: RuntimeConfigValueType
): unknown {
  const text = typeof raw === "string" ? raw : String(raw ?? "");
  switch (valueType) {
    case "string":
    case "secret":
      return text;
    case "number": {
      const trimmed = text.trim();
      if (trimmed === "") {
        throw new Error("Number value is required.");
      }
      const n = Number(trimmed);
      if (!Number.isFinite(n)) {
        throw new Error(`Value "${trimmed}" is not a valid number.`);
      }
      return n;
    }
    case "boolean": {
      const lower = text.trim().toLowerCase();
      return lower === "on" || lower === "true" || lower === "1";
    }
    case "json": {
      const trimmed = text.trim();
      if (trimmed === "") {
        throw new Error("JSON value is required (use null, [], or {} if empty).");
      }
      try {
        return JSON.parse(trimmed);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "invalid JSON";
        throw new Error(`Invalid JSON: ${msg}`);
      }
    }
    default:
      return text;
  }
}

/* ────────────────── createConfig ────────────────── */

export async function createConfig(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const key = String(formData.get("key") ?? "").trim().toLowerCase();
  const description = String(formData.get("description") ?? "").trim();
  const category =
    String(formData.get("category") ?? "general").trim().toLowerCase() ||
    "general";
  const valueType = parseValueType(formData.get("value_type"));
  const isSecretInput = formData.get("is_secret");
  const isSecret =
    valueType === "secret" || isSecretInput === "on" || isSecretInput === "true";

  if (!key) throw new Error("missing key");
  if (!KEY_REGEX.test(key)) {
    throw new Error(
      "Invalid key — use lowercase letters, digits, dots, underscores, hyphens (must start with a letter)."
    );
  }

  // For boolean checkboxes, the field is absent from the FormData when
  // unchecked. Detect that and feed "" through to the parser, which
  // returns false.
  const rawValue =
    valueType === "boolean"
      ? formData.get("value") === "on" || formData.get("value") === "true"
        ? "true"
        : "false"
      : formData.get("value") ?? "";
  const value = parseValueForType(rawValue, valueType);

  const admin = createAdminClient();

  const insertRow = {
    key,
    value,
    value_type: valueType,
    description,
    category,
    is_secret: isSecret,
    updated_by: auth.userId,
  };

  const { error } = await admin.from("runtime_config").insert(insertRow);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "runtime_config.create",
    targetType: "runtime_config",
    targetId: key,
    after: insertRow,
  });

  clearRuntimeConfigCache(key);
  revalidatePath("/admin/runtime-config");
  redirect(`/admin/runtime-config/${encodeURIComponent(key)}`);
}

/* ────────────────── updateConfig ────────────────── */

export async function updateConfig(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const key = String(formData.get("key") ?? "").trim().toLowerCase();
  if (!key) throw new Error("missing key");

  const description = String(formData.get("description") ?? "").trim();
  const category =
    String(formData.get("category") ?? "general").trim().toLowerCase() ||
    "general";
  const valueType = parseValueType(formData.get("value_type"));
  const isSecretInput = formData.get("is_secret");
  const isSecret =
    valueType === "secret" || isSecretInput === "on" || isSecretInput === "true";

  const rawValue =
    valueType === "boolean"
      ? formData.get("value") === "on" || formData.get("value") === "true"
        ? "true"
        : "false"
      : formData.get("value") ?? "";
  const value = parseValueForType(rawValue, valueType);

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("runtime_config")
    .select(
      "key, value, value_type, description, category, is_secret, updated_at"
    )
    .eq("key", key)
    .maybeSingle();

  const update = {
    value,
    value_type: valueType,
    description,
    category,
    is_secret: isSecret,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("runtime_config")
    .update(update)
    .eq("key", key);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "runtime_config.update",
    targetType: "runtime_config",
    targetId: key,
    before,
    after: { key, ...update },
  });

  clearRuntimeConfigCache(key);
  revalidatePath("/admin/runtime-config");
  revalidatePath(`/admin/runtime-config/${encodeURIComponent(key)}`);
}

/* ────────────────── deleteConfig ────────────────── */

export async function deleteConfig(formData: FormData): Promise<void> {
  await assertAdmin();
  const key = String(formData.get("key") ?? "").trim().toLowerCase();
  if (!key) throw new Error("missing key");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("runtime_config")
    .select(
      "key, value, value_type, description, category, is_secret, updated_at"
    )
    .eq("key", key)
    .maybeSingle();

  const { error } = await admin
    .from("runtime_config")
    .delete()
    .eq("key", key);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "runtime_config.delete",
    targetType: "runtime_config",
    targetId: key,
    before,
  });

  clearRuntimeConfigCache(key);
  revalidatePath("/admin/runtime-config");
  redirect("/admin/runtime-config");
}

// Note: types are intentionally NOT re-exported here — `"use server"`
// modules can only export async functions. Importers should pull types
// from `@/app/admin/_types` directly.
