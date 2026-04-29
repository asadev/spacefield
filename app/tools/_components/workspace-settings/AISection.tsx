"use client";

/* AISection — Spacefield Assistant settings.
 *
 *   - Tier banner (Free → "read-only" notice; Pro/Team → cap usage)
 *   - Two progress bars: Quick used / cap, Deep used / cap
 *   - 30-day sparkline by bucket
 *   - WhatsApp linking card (link via 6-digit code, unlink, test message)
 *   - Top-up CTA (disabled — Paddle SKUs not yet minted)
 */

import { useCallback, useEffect, useState } from "react";
import { cachedFetch, invalidate } from "@/lib/cache/swr";
import { INPUT, PILL, PRIMARY, type WorkspaceRole } from "./types";

interface Props {
  workspaceId: string;
  role: WorkspaceRole;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

interface BalanceBody {
  tier: "free" | "pro" | "team" | "enterprise";
  month: string;
  quick: { used: number; cap: number };
  deep: { used: number; cap: number };
  trend: Array<{ day: string; quick: number; deep: number }>;
  whatsapp: { number: string; linked_at: string } | null;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function pct(used: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.min(100, Math.round((used / cap) * 100));
}

interface BarProps {
  label: string;
  used: number;
  cap: number;
  color: string;
}

function ProgressBar({ label, used, cap, color }: BarProps) {
  const p = pct(used, cap);
  return (
    <div>
      <div className="flex items-baseline justify-between text-[0.62rem] uppercase tracking-[0.14em] text-secondary">
        <span>{label}</span>
        <span className="text-app">
          {fmt(used)} / {fmt(cap)} tokens
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${p}%`, background: color }}
        />
      </div>
    </div>
  );
}

interface SparkProps {
  data: Array<{ day: string; quick: number; deep: number }>;
}

function Sparkline({ data }: SparkProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-16 items-center justify-center rounded-lg bg-surface text-[0.62rem] uppercase tracking-[0.14em] text-faint">
        No usage in the last 30 days
      </div>
    );
  }
  const max = Math.max(
    1,
    ...data.map((d) => Math.max(d.quick, d.deep))
  );
  return (
    <div className="flex h-16 items-end gap-0.5 rounded-lg bg-surface p-2">
      {data.map((d) => {
        const qH = (d.quick / max) * 100;
        const dH = (d.deep / max) * 100;
        return (
          <div
            key={d.day}
            className="flex flex-1 flex-col-reverse gap-0.5"
            title={`${d.day} — quick: ${fmt(d.quick)}, deep: ${fmt(d.deep)}`}
          >
            {dH > 0 && (
              <div
                className="rounded-sm"
                style={{ height: `${dH}%`, background: "var(--tool-accent)" }}
              />
            )}
            <div
              className="rounded-sm"
              style={{ height: `${qH}%`, background: "var(--tool-accent-soft)" }}
            />
          </div>
        );
      })}
    </div>
  );
}

interface LinkResp {
  code: string;
  expires_at: string;
  bot_number: string;
}

export default function AISection({
  workspaceId,
  role,
  onError,
  onSuccess,
}: Props) {
  const [balance, setBalance] = useState<BalanceBody | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkCode, setLinkCode] = useState<LinkResp | null>(null);
  const [linking, setLinking] = useState(false);
  const [testText, setTestText] = useState(
    "Hello from Spacefield Assistant — your link is working."
  );
  const [busy, setBusy] = useState(false);

  const url = `/api/agent/balance?workspace_id=${encodeURIComponent(
    workspaceId
  )}`;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      invalidate(url);
      const body = await cachedFetch<BalanceBody>(url);
      setBalance(body);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url, onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onMintCode = useCallback(async () => {
    setLinking(true);
    try {
      const res = await fetch("/api/agent/whatsapp/link-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `${res.status}`);
      }
      const body = (await res.json()) as LinkResp;
      setLinkCode(body);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setLinking(false);
    }
  }, [workspaceId, onError]);

  const onUnlink = useCallback(async () => {
    if (!confirm("Unlink WhatsApp from this account?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/agent/whatsapp/link-code?workspace_id=${encodeURIComponent(
          workspaceId
        )}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`${res.status}`);
      onSuccess("WhatsApp unlinked.");
      await refresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [workspaceId, onError, onSuccess, refresh]);

  const onTestMessage = useCallback(async () => {
    if (!testText.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/agent/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: testText.trim() }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `${res.status}`);
      }
      onSuccess("Test message sent.");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [testText, onError, onSuccess]);

  if (loading || !balance) {
    return <div className="h-32 animate-pulse rounded-xl bg-surface" />;
  }

  const isFree = balance.tier === "free";
  void role;

  return (
    <div className="space-y-5">
      {/* Tier banner */}
      <div
        className={`rounded-xl border px-3 py-2 text-xs ${
          isFree
            ? "border-amber-400/30 bg-amber-400/10 text-amber-600 dark:text-amber-400"
            : "border-app bg-surface text-secondary"
        }`}
      >
        {isFree
          ? "Free tier is read-only. The assistant can answer questions about your workspace but can't create or update records. Upgrade to Pro to unlock writes."
          : `On the ${balance.tier} tier. Caps refresh on the 1st of each month.`}
      </div>

      {/* Bars */}
      <div className="space-y-3">
        <ProgressBar
          label="Quick (mini + Haiku)"
          used={balance.quick.used}
          cap={balance.quick.cap}
          color="var(--tool-accent-soft, #c4b5fd)"
        />
        {balance.deep.cap > 0 && (
          <ProgressBar
            label="Deep (Sonnet)"
            used={balance.deep.used}
            cap={balance.deep.cap}
            color="var(--tool-accent, #7c3aed)"
          />
        )}
      </div>

      {/* Sparkline */}
      <div>
        <div className="mb-1.5 text-[0.62rem] uppercase tracking-[0.14em] text-secondary">
          Last 30 days
        </div>
        <Sparkline data={balance.trend} />
      </div>

      {/* Top-up CTA — disabled for v1 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          className={PRIMARY}
          title="Coming soon — top-ups via Paddle"
        >
          Top up — coming soon
        </button>
        <button type="button" className={PILL} onClick={refresh}>
          Refresh
        </button>
      </div>

      {/* WhatsApp linking */}
      <div className="rounded-xl border border-app bg-app p-4">
        <div className="text-[0.62rem] uppercase tracking-[0.14em] text-secondary">
          WhatsApp
        </div>
        {balance.whatsapp ? (
          <div className="mt-2 space-y-3">
            <div className="text-sm text-app">
              Linked to <span className="font-medium">{balance.whatsapp.number}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                className={`${INPUT} flex-1`}
                placeholder="Test message"
              />
              <button
                type="button"
                onClick={onTestMessage}
                disabled={busy}
                className={PRIMARY}
              >
                Send test
              </button>
              <button
                type="button"
                onClick={onUnlink}
                disabled={busy}
                className={PILL}
              >
                Unlink
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            <div className="text-sm text-secondary">
              Link your WhatsApp number to text the assistant from anywhere.
            </div>
            {linkCode ? (
              <div className="rounded-lg border border-app bg-surface p-3 text-sm text-app">
                From your WhatsApp, send this code to{" "}
                <span className="font-medium">{linkCode.bot_number}</span>:
                <div className="mt-2 select-all font-mono text-2xl tracking-widest">
                  {linkCode.code.slice(0, 3)}-{linkCode.code.slice(3)}
                </div>
                <div className="mt-2 text-[0.62rem] uppercase tracking-[0.14em] text-faint">
                  Code expires in 10 minutes
                </div>
              </div>
            ) : null}
            <button
              type="button"
              onClick={onMintCode}
              disabled={linking}
              className={PRIMARY}
            >
              {linkCode ? "Generate new code" : "Link WhatsApp"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
