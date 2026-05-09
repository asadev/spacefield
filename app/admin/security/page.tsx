import { createAdminClient } from "@/lib/supabase/admin";

import { buttonClass, formatDateTime, inputClass } from "../_lib";
import PasswordPreview from "./PasswordPreview";
import { updateSecurityPolicy } from "./_actions";

import type { SecurityPoliciesRow } from "../_types";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("security_policies")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);

  // Defensive default — the migration seeds id=1, but if that ever
  // failed we still want the editor to render.
  const policy: SecurityPoliciesRow = (data as SecurityPoliciesRow | null) ?? {
    id: 1,
    enforce_2fa: false,
    enforce_2fa_for_admins: true,
    session_timeout_minutes: 1440,
    password_min_length: 8,
    password_require_uppercase: false,
    password_require_number: true,
    password_require_symbol: false,
    max_login_attempts: 5,
    lockout_duration_minutes: 30,
    allow_sso_only: false,
    metadata: {},
    updated_at: new Date().toISOString(),
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Security
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">
          Security policies
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          Singleton row that controls 2FA, session, password, and lockout
          rules across the platform. Changes take effect on the next
          sign-in evaluation.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        {/* Editor */}
        <form
          action={updateSecurityPolicy}
          className="space-y-5 rounded-xl border border-app bg-app-elevated p-5"
        >
          {/* 2FA */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-app">
              Two-factor authentication
            </legend>
            <Toggle
              name="enforce_2fa"
              label="Require 2FA for everyone"
              hint="When on, every account must enroll in 2FA before they can use the platform."
              defaultChecked={policy.enforce_2fa}
            />
            <Toggle
              name="enforce_2fa_for_admins"
              label="Require 2FA for admins"
              hint="Admin accounts must always have 2FA. Recommended on."
              defaultChecked={policy.enforce_2fa_for_admins}
            />
            <Toggle
              name="allow_sso_only"
              label="SSO-only sign-in"
              hint="Disable email/password sign-in entirely. Only SSO providers configured under /admin/sso are allowed."
              defaultChecked={policy.allow_sso_only}
            />
          </fieldset>

          {/* Session */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-app">Session</legend>
            <NumberField
              name="session_timeout_minutes"
              label="Session timeout"
              suffix="minutes"
              hint="Inactive sessions are signed out after this many minutes. 1440 = 1 day."
              defaultValue={policy.session_timeout_minutes}
              min={5}
              max={60 * 24 * 30}
            />
          </fieldset>

          {/* Password rules */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-app">
              Password rules
            </legend>
            <NumberField
              name="password_min_length"
              label="Minimum length"
              suffix="characters"
              defaultValue={policy.password_min_length}
              min={4}
              max={128}
            />
            <Toggle
              name="password_require_uppercase"
              label="Require uppercase letter"
              defaultChecked={policy.password_require_uppercase}
            />
            <Toggle
              name="password_require_number"
              label="Require number"
              defaultChecked={policy.password_require_number}
            />
            <Toggle
              name="password_require_symbol"
              label="Require symbol"
              defaultChecked={policy.password_require_symbol}
            />
          </fieldset>

          {/* Lockout */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-app">
              Lockout
            </legend>
            <NumberField
              name="max_login_attempts"
              label="Max failed login attempts"
              suffix="attempts"
              hint="After this many consecutive failures, the account is locked."
              defaultValue={policy.max_login_attempts}
              min={1}
              max={100}
            />
            <NumberField
              name="lockout_duration_minutes"
              label="Lockout duration"
              suffix="minutes"
              defaultValue={policy.lockout_duration_minutes}
              min={1}
              max={60 * 24 * 7}
            />
          </fieldset>

          <div className="flex items-center justify-between border-t border-app pt-4">
            <div className="text-[11px] text-muted">
              Last updated{" "}
              <span className="font-mono">
                {formatDateTime(policy.updated_at)}
              </span>
            </div>
            <button type="submit" className={buttonClass}>
              Save policy
            </button>
          </div>
        </form>

        {/* Live password preview */}
        <aside className="space-y-3 rounded-xl border border-app bg-app-elevated p-5">
          <div>
            <h2 className="text-sm font-semibold text-app">
              Password tester
            </h2>
            <p className="mt-0.5 text-[11px] text-muted">
              Tests an example password against the rules currently saved
              in the database. Refresh the page after Save to test new
              rules.
            </p>
          </div>
          <PasswordPreview
            rules={{
              minLength: policy.password_min_length,
              requireUppercase: policy.password_require_uppercase,
              requireNumber: policy.password_require_number,
              requireSymbol: policy.password_require_symbol,
            }}
          />
        </aside>
      </div>
    </div>
  );
}

/* ─────────────────────── helpers ─────────────────────── */

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-app bg-app p-3 hover:border-tool-accent/50">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 rounded border-app accent-tool-accent"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-app">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
      </div>
    </label>
  );
}

function NumberField({
  name,
  label,
  suffix,
  hint,
  defaultValue,
  min,
  max,
}: {
  name: string;
  label: string;
  suffix?: string;
  hint?: string;
  defaultValue: number;
  min: number;
  max: number;
}) {
  return (
    <label className="flex flex-col gap-1.5 rounded-lg border border-app bg-app p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-app">{label}</span>
        {suffix && (
          <span className="text-[11px] text-faint">{suffix}</span>
        )}
      </div>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={1}
        className={`${inputClass} max-w-[180px] font-mono tabular-nums`}
      />
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </label>
  );
}
