"use client";

import { useState } from "react";

// Inlined from app/admin/_lib.ts — that module is `server-only` and
// can't be imported from a client component (Next 16 build hard-error).
const inputClass =
  "w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint";

/**
 * Live tester for the password rules. Pure client-side — does not call
 * any RPC. Mirrors the same checks the auth layer should enforce.
 */
export type PasswordRules = {
  minLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
};

type CheckResult = { label: string; passed: boolean };

function check(value: string, rules: PasswordRules): CheckResult[] {
  const results: CheckResult[] = [];
  results.push({
    label: `At least ${rules.minLength} characters`,
    passed: value.length >= rules.minLength,
  });
  if (rules.requireUppercase) {
    results.push({
      label: "Contains an uppercase letter",
      passed: /[A-Z]/.test(value),
    });
  }
  if (rules.requireNumber) {
    results.push({
      label: "Contains a number",
      passed: /[0-9]/.test(value),
    });
  }
  if (rules.requireSymbol) {
    results.push({
      label: "Contains a symbol",
      passed: /[^A-Za-z0-9]/.test(value),
    });
  }
  return results;
}

export default function PasswordPreview({ rules }: { rules: PasswordRules }) {
  const [value, setValue] = useState("");
  const results = check(value, rules);
  const allPass = value.length > 0 && results.every((r) => r.passed);

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type a password to test current rules…"
        className={`${inputClass} font-mono`}
      />
      {value.length === 0 ? (
        <div className="rounded-lg border border-app bg-app p-3 text-xs text-faint">
          Enter a password to see which rules pass.
        </div>
      ) : (
        <div
          className={`rounded-lg border p-3 text-xs ${
            allPass
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-rose-500/30 bg-rose-500/5"
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                allPass
                  ? "bg-emerald-500/15 text-emerald-500"
                  : "bg-rose-500/15 text-rose-500"
              }`}
            >
              {allPass ? "Passes policy" : "Fails policy"}
            </span>
            <span className="font-mono text-[11px] text-muted">
              {value.length} char{value.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="space-y-1">
            {results.map((r) => (
              <li key={r.label} className="flex items-center gap-2">
                <span
                  className={`inline-flex h-3 w-3 items-center justify-center rounded-full text-[8px] font-bold leading-none ${
                    r.passed
                      ? "bg-emerald-500/20 text-emerald-500"
                      : "bg-rose-500/20 text-rose-500"
                  }`}
                >
                  {r.passed ? "✓" : "×"}
                </span>
                <span
                  className={
                    r.passed ? "text-emerald-500" : "text-rose-500"
                  }
                >
                  {r.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
