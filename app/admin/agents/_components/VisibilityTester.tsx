"use client";

import { useState } from "react";

import { buttonClass, inputClass } from "./_styles";

type CheckResult = {
  ok: boolean;
  visible?: boolean;
  reason?: string;
  tier?: string;
  role?: string;
  raw?: unknown;
  error?: string;
};

export default function VisibilityTester({ agentId }: { agentId: string }) {
  const [uid, setUid] = useState("");
  const [wsId, setWsId] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!uid.trim()) return;
    setPending(true);
    setResult(null);
    try {
      const params = new URLSearchParams({ id: agentId, uid: uid.trim() });
      const ws = wsId.trim();
      if (ws) params.set("ws_id", ws);
      const res = await fetch(`/api/admin/agents/visibility?${params}`, {
        method: "GET",
        cache: "no-store",
      });
      const json = (await res.json()) as CheckResult;
      setResult(json);
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={run} className="space-y-3">
      <div className="grid gap-2 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[11px] uppercase tracking-wider text-muted">
            User UUID
          </span>
          <input
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            className={`${inputClass} font-mono text-xs`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[11px] uppercase tracking-wider text-muted">
            Workspace UUID (optional)
          </span>
          <input
            value={wsId}
            onChange={(e) => setWsId(e.target.value)}
            placeholder="optional"
            className={`${inputClass} font-mono text-xs`}
          />
        </label>
      </div>
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Checking…" : "Check visibility"}
      </button>

      {result && (
        <div
          className={`rounded-lg border p-3 text-xs ${
            result.error || !result.ok
              ? "border-rose-500/30 bg-rose-500/10 text-rose-500"
              : result.visible
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          }`}
        >
          {result.error ? (
            <span>Error: {result.error}</span>
          ) : (
            <>
              <div className="font-medium">
                {result.visible ? "Visible" : "Not visible"}
              </div>
              <div className="mt-1 text-app/80">
                Reason: <code className="font-mono">{result.reason ?? "—"}</code>
                {result.tier ? (
                  <>
                    {" · "}tier: <code className="font-mono">{result.tier}</code>
                  </>
                ) : null}
                {result.role ? (
                  <>
                    {" · "}role: <code className="font-mono">{result.role}</code>
                  </>
                ) : null}
              </div>
              {result.raw !== undefined && (
                <pre className="mt-2 overflow-x-auto rounded bg-app p-2 font-mono text-[10px] text-secondary">
                  {JSON.stringify(result.raw, null, 2)}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </form>
  );
}
