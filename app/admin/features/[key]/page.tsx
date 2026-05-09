import Link from "next/link";
import { notFound } from "next/navigation";

import {
  featureEnabled,
  getFlagByKey,
  resolveFlagLocally,
  type ResolverVerdict,
} from "@/lib/features";

import {
  buttonClass,
  buttonGhostClass,
  formatDateTime,
  inputClass,
} from "../../_lib";
import { RolloutChip } from "../page";
import { updateFlag } from "../_actions";
import DeleteFlagButton from "../_components/DeleteFlagButton";

import type { FeatureRollout } from "../../_types";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROLLOUT_OPTIONS: {
  id: FeatureRollout;
  label: string;
  hint: string;
}[] = [
  { id: "off", label: "off", hint: "Always false." },
  { id: "on", label: "on", hint: "True for every authenticated user." },
  {
    id: "allowlist",
    label: "allowlist",
    hint: "Only listed users / workspaces. Everyone else: false.",
  },
  {
    id: "percent",
    label: "percent",
    hint: "Stable percentage rollout by user UUID.",
  },
];

type PageProps = {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ test_uid?: string; test_ws?: string }>;
};

export default async function AdminFeatureDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { key: rawKey } = await params;
  const sp = await searchParams;
  const key = decodeURIComponent(rawKey).toLowerCase();
  const flag = await getFlagByKey(key);
  if (!flag) notFound();

  // Build "test resolver" verdict if test inputs are present
  const testUid = (sp.test_uid ?? "").trim();
  const testWs = (sp.test_ws ?? "").trim();

  let testVerdict: ResolverVerdict | null = null;
  let testRpc: boolean | null = null;
  let testError: string | null = null;
  if (testUid) {
    if (!UUID_REGEX.test(testUid)) {
      testError = "User UUID is not a valid UUID.";
    } else if (testWs && !UUID_REGEX.test(testWs)) {
      testError = "Workspace UUID is not a valid UUID.";
    } else {
      testVerdict = resolveFlagLocally(
        flag,
        testUid,
        testWs || null
      );
      testRpc = await featureEnabled(
        flag.key,
        testUid,
        testWs || null
      );
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/features"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Feature flags
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold text-app">
            {flag.key}
          </h1>
          <RolloutChip rollout={flag.rollout} percent={flag.rollout_percent} />
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
              flag.enabled
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-app text-faint border border-app"
            }`}
          >
            {flag.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          <span className="rounded-md border border-app bg-app px-2 py-1">
            updated {formatDateTime(flag.updated_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            created {formatDateTime(flag.created_at)}
          </span>
        </div>
      </div>

      {/* Edit form */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Edit flag</h2>
        <form action={updateFlag} className="mt-4 space-y-4">
          <input type="hidden" name="key" value={flag.key} />

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title" hint="Shown in admin UI.">
              <input
                type="text"
                name="title"
                defaultValue={flag.title}
                className={inputClass}
              />
            </Field>
            <Field
              label="Enabled"
              hint="Master switch. Off = always false everywhere."
            >
              <label className="flex h-[42px] items-center gap-3 rounded-lg border border-app bg-app px-3 text-sm text-app">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={flag.enabled}
                  className="h-4 w-4 rounded border-app accent-tool-accent"
                />
                <span>Flag is on</span>
              </label>
            </Field>
          </div>

          <Field label="Description">
            <textarea
              name="description"
              defaultValue={flag.description}
              rows={3}
              className={inputClass}
            />
          </Field>

          <Field label="Rollout strategy">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {ROLLOUT_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-app bg-app p-3 text-sm transition-colors hover:border-tool-accent has-[:checked]:border-tool-accent has-[:checked]:bg-tool-accent-soft"
                >
                  <input
                    type="radio"
                    name="rollout"
                    value={opt.id}
                    defaultChecked={flag.rollout === opt.id}
                    className="mt-0.5 h-4 w-4 accent-tool-accent"
                  />
                  <span className="min-w-0">
                    <span className="block font-mono text-xs text-app">
                      {opt.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {opt.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Field>

          <Field
            label="Rollout percent"
            hint="0–100. Only used when rollout = 'percent'. Bucket is stable per user."
          >
            <div className="flex items-center gap-3">
              <input
                type="number"
                name="rollout_percent"
                min={0}
                max={100}
                step={1}
                defaultValue={flag.rollout_percent}
                className={`${inputClass} max-w-[120px]`}
              />
              <span className="text-xs text-muted">%</span>
            </div>
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Allowlist — user UUIDs"
              hint="One UUID per line. Wins over rollout strategy."
            >
              <textarea
                name="allowlist_user_ids"
                defaultValue={flag.allowlist_user_ids.join("\n")}
                rows={6}
                spellCheck={false}
                placeholder="00000000-0000-0000-0000-000000000000"
                className={`${inputClass} font-mono text-xs`}
              />
              <div className="mt-1 text-[11px] text-faint">
                {flag.allowlist_user_ids.length} user
                {flag.allowlist_user_ids.length === 1 ? "" : "s"} currently
                listed.
              </div>
            </Field>
            <Field
              label="Allowlist — workspace UUIDs"
              hint="One UUID per line. Wins over rollout strategy."
            >
              <textarea
                name="allowlist_workspace_ids"
                defaultValue={flag.allowlist_workspace_ids.join("\n")}
                rows={6}
                spellCheck={false}
                placeholder="00000000-0000-0000-0000-000000000000"
                className={`${inputClass} font-mono text-xs`}
              />
              <div className="mt-1 text-[11px] text-faint">
                {flag.allowlist_workspace_ids.length} workspace
                {flag.allowlist_workspace_ids.length === 1 ? "" : "s"}{" "}
                currently listed.
              </div>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" className={buttonClass}>
              Save changes
            </button>
            <Link href="/admin/features" className={buttonGhostClass}>
              Back to flags
            </Link>
          </div>
        </form>
      </section>

      {/* Resolver tester */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Test resolver</h2>
        <p className="mt-1 text-xs text-muted">
          Paste a user UUID (and optionally a workspace UUID) to see how this
          flag would resolve right now. The bool comes from the Postgres
          RPC; the &quot;why&quot; is computed in JS by mirroring the same
          logic.
        </p>
        <form
          method="get"
          action={`/admin/features/${encodeURIComponent(flag.key)}`}
          className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        >
          <input
            type="text"
            name="test_uid"
            defaultValue={testUid}
            placeholder="User UUID"
            className={`${inputClass} font-mono text-xs`}
          />
          <input
            type="text"
            name="test_ws"
            defaultValue={testWs}
            placeholder="Workspace UUID (optional)"
            className={`${inputClass} font-mono text-xs`}
          />
          <button type="submit" className={buttonClass}>
            Resolve
          </button>
        </form>

        {testError && (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
            {testError}
          </div>
        )}

        {testVerdict && (
          <ResolverVerdictCard
            verdict={testVerdict}
            rpcResult={testRpc}
            uid={testUid}
            wsId={testWs || null}
          />
        )}
      </section>

      {/* Delete */}
      <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
        <h2 className="text-sm font-semibold text-rose-500">Danger zone</h2>
        <p className="mt-1 text-xs text-rose-500/80">
          Permanently delete this flag. Code calling{" "}
          <code className="rounded bg-app px-1 text-[11px]">
            featureEnabled(&quot;{flag.key}&quot;)
          </code>{" "}
          will start returning <code>false</code> immediately.
        </p>
        <div className="mt-3">
          <DeleteFlagButton flagKey={flag.key} />
        </div>
      </section>
    </div>
  );
}

/* ───────────────────── components ───────────────────── */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  // <div> not <label> — children may already contain nested <label>
  // elements (e.g. checkbox/radio rows), and labels can't nest.
  return (
    <div className="block">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
      {hint && <div className="mt-1 text-[11px] text-faint">{hint}</div>}
    </div>
  );
}

function ResolverVerdictCard({
  verdict,
  rpcResult,
  uid,
  wsId,
}: {
  verdict: ResolverVerdict;
  rpcResult: boolean | null;
  uid: string;
  wsId: string | null;
}) {
  const drift = rpcResult !== null && rpcResult !== verdict.enabled;
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-app bg-app p-4">
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Postgres RPC
        </div>
        <div
          className={`mt-1 text-2xl font-semibold tabular-nums ${
            rpcResult ? "text-emerald-500" : "text-rose-500"
          }`}
        >
          {rpcResult === null ? "—" : rpcResult ? "true" : "false"}
        </div>
        <div className="mt-1 text-[11px] text-muted">
          From <code>feature_enabled(...)</code>
        </div>
      </div>
      <div className="rounded-xl border border-app bg-app p-4">
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Local explainer
        </div>
        <div
          className={`mt-1 text-2xl font-semibold tabular-nums ${
            verdict.enabled ? "text-emerald-500" : "text-rose-500"
          }`}
        >
          {verdict.enabled ? "true" : "false"}
        </div>
        <div className="mt-1 text-[11px] text-muted">
          reason:{" "}
          <span className="rounded bg-app-elevated px-1 font-mono text-app">
            {verdict.reason}
          </span>
        </div>
      </div>
      <div className="rounded-xl border border-app bg-app p-4 sm:col-span-2">
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Detail
        </div>
        <p className="mt-1 text-xs text-app">{verdict.detail}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono">
            uid={uid}
          </span>
          {wsId && (
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono">
              ws={wsId}
            </span>
          )}
        </div>
        {drift && (
          <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-500">
            Drift detected: RPC and local explainer disagree. The RPC is the
            source of truth — please report this so the explainer can be
            re-aligned.
          </div>
        )}
      </div>
    </div>
  );
}

