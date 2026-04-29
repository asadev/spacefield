"use client";

/* AISection — Spacefield Assistant settings.
 *
 *   - Tier banner (Free → "read-only" notice; Pro/Team → cap usage)
 *   - Two progress bars: Quick used / cap, Deep used / cap
 *   - 30-day sparkline by bucket
 *   - WhatsApp linking card (link via 6-digit code, unlink, test message)
 *   - Telegram linking card (deep link, unlink, test message) — Phase 2
 *   - Persona card — bot name, tone, optional flavor + greeting
 *   - Permissions card — per-skill allow / confirm / deny
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
  telegram: { user_id: number; username: string | null; linked_at: string } | null;
}

interface PersonaBody {
  bot_name: string;
  persona_description: string;
  voice_tone: "friendly" | "formal" | "casual" | "direct" | "playful";
  custom_greeting: string;
  updated_at: string | null;
}

interface PermissionRow {
  skill_id: string;
  label: string;
  description: string;
  mode: "allow" | "confirm" | "deny";
  is_default: boolean;
  has_writes: boolean;
}

interface PermissionsBody {
  workspace_shape: "personal" | "team";
  skills: PermissionRow[];
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
  const max = Math.max(1, ...data.map((d) => Math.max(d.quick, d.deep)));
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

interface WhatsAppLinkResp {
  code: string;
  expires_at: string;
  bot_number: string;
}

interface TelegramLinkResp {
  code: string;
  expires_at: string;
  bot_username: string;
  deep_link: string;
}

const TONES: Array<PersonaBody["voice_tone"]> = [
  "friendly",
  "formal",
  "casual",
  "direct",
  "playful",
];

export default function AISection({
  workspaceId,
  role,
  onError,
  onSuccess,
}: Props) {
  const [balance, setBalance] = useState<BalanceBody | null>(null);
  const [loading, setLoading] = useState(true);
  const [whatsappCode, setWhatsappCode] = useState<WhatsAppLinkResp | null>(null);
  const [telegramCode, setTelegramCode] = useState<TelegramLinkResp | null>(null);
  const [linking, setLinking] = useState(false);
  const [testText, setTestText] = useState(
    "Hello from Spacefield Assistant — your link is working."
  );
  const [busy, setBusy] = useState(false);

  // Persona
  const [persona, setPersona] = useState<PersonaBody | null>(null);
  const [personaSaving, setPersonaSaving] = useState(false);

  // Permissions
  const [permissions, setPermissions] = useState<PermissionsBody | null>(null);
  const [permRowSaving, setPermRowSaving] = useState<string | null>(null);

  const balanceUrl = `/api/agent/balance?workspace_id=${encodeURIComponent(
    workspaceId
  )}`;
  const personaUrl = `/api/agent/persona?workspace_id=${encodeURIComponent(
    workspaceId
  )}`;
  const permsUrl = `/api/agent/permissions?workspace_id=${encodeURIComponent(
    workspaceId
  )}`;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      invalidate(balanceUrl);
      invalidate(personaUrl);
      invalidate(permsUrl);
      const [b, p, perms] = await Promise.all([
        cachedFetch<BalanceBody>(balanceUrl),
        cachedFetch<PersonaBody>(personaUrl),
        cachedFetch<PermissionsBody>(permsUrl),
      ]);
      setBalance(b);
      setPersona(p);
      setPermissions(perms);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [balanceUrl, personaUrl, permsUrl, onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── WhatsApp ──────────────────────────────────────────────────────
  const onMintWhatsApp = useCallback(async () => {
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
      const body = (await res.json()) as WhatsAppLinkResp;
      setWhatsappCode(body);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setLinking(false);
    }
  }, [workspaceId, onError]);

  const onUnlinkWhatsApp = useCallback(async () => {
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

  const onTestWhatsApp = useCallback(async () => {
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
      onSuccess("Test message sent on WhatsApp.");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [testText, onError, onSuccess]);

  // ── Telegram ──────────────────────────────────────────────────────
  const onMintTelegram = useCallback(async () => {
    setLinking(true);
    try {
      const res = await fetch("/api/agent/telegram/link-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `${res.status}`);
      }
      const body = (await res.json()) as TelegramLinkResp;
      setTelegramCode(body);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setLinking(false);
    }
  }, [workspaceId, onError]);

  const onUnlinkTelegram = useCallback(async () => {
    if (!confirm("Unlink Telegram from this account?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/agent/telegram/link-code?workspace_id=${encodeURIComponent(
          workspaceId
        )}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`${res.status}`);
      onSuccess("Telegram unlinked.");
      await refresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [workspaceId, onError, onSuccess, refresh]);

  const onTestTelegram = useCallback(async () => {
    if (!testText.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/agent/telegram/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: testText.trim() }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `${res.status}`);
      }
      onSuccess("Test message sent on Telegram.");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [testText, onError, onSuccess]);

  // ── Persona ──────────────────────────────────────────────────────
  const onSavePersona = useCallback(async () => {
    if (!persona) return;
    setPersonaSaving(true);
    try {
      const res = await fetch("/api/agent/persona", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          bot_name: persona.bot_name,
          persona_description: persona.persona_description,
          voice_tone: persona.voice_tone,
          custom_greeting: persona.custom_greeting,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `${res.status}`);
      }
      onSuccess("Persona saved.");
      invalidate(personaUrl);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setPersonaSaving(false);
    }
  }, [persona, workspaceId, onError, onSuccess, personaUrl]);

  const onResetPersona = useCallback(async () => {
    if (!confirm("Reset persona to defaults?")) return;
    setPersonaSaving(true);
    try {
      const res = await fetch(
        `/api/agent/persona?workspace_id=${encodeURIComponent(workspaceId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`${res.status}`);
      onSuccess("Persona reset.");
      invalidate(personaUrl);
      const fresh = await cachedFetch<PersonaBody>(personaUrl);
      setPersona(fresh);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setPersonaSaving(false);
    }
  }, [workspaceId, onError, onSuccess, personaUrl]);

  // ── Permissions ──────────────────────────────────────────────────
  const onChangePermission = useCallback(
    async (skillId: string, mode: "allow" | "confirm" | "deny") => {
      setPermRowSaving(skillId);
      try {
        const res = await fetch(
          `/api/agent/permissions/${encodeURIComponent(skillId)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspace_id: workspaceId,
              mode,
            }),
          }
        );
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `${res.status}`);
        }
        invalidate(permsUrl);
        const fresh = await cachedFetch<PermissionsBody>(permsUrl);
        setPermissions(fresh);
      } catch (e) {
        onError((e as Error).message);
      } finally {
        setPermRowSaving(null);
      }
    },
    [workspaceId, onError, permsUrl]
  );

  if (loading || !balance) {
    return <div className="h-32 animate-pulse rounded-xl bg-surface" />;
  }

  const isFree = balance.tier === "free";
  const canAdmin = role === "owner" || role === "admin";

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
                onClick={onTestWhatsApp}
                disabled={busy}
                className={PRIMARY}
              >
                Send test
              </button>
              <button
                type="button"
                onClick={onUnlinkWhatsApp}
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
            {whatsappCode ? (
              <div className="rounded-lg border border-app bg-surface p-3 text-sm text-app">
                From your WhatsApp, send this code to{" "}
                <span className="font-medium">{whatsappCode.bot_number}</span>:
                <div className="mt-2 select-all font-mono text-2xl tracking-widest">
                  {whatsappCode.code.slice(0, 3)}-{whatsappCode.code.slice(3)}
                </div>
                <div className="mt-2 text-[0.62rem] uppercase tracking-[0.14em] text-faint">
                  Code expires in 10 minutes
                </div>
              </div>
            ) : null}
            <button
              type="button"
              onClick={onMintWhatsApp}
              disabled={linking}
              className={PRIMARY}
            >
              {whatsappCode ? "Generate new code" : "Link WhatsApp"}
            </button>
          </div>
        )}
      </div>

      {/* Telegram linking */}
      <div className="rounded-xl border border-app bg-app p-4">
        <div className="text-[0.62rem] uppercase tracking-[0.14em] text-secondary">
          Telegram
        </div>
        {balance.telegram ? (
          <div className="mt-2 space-y-3">
            <div className="text-sm text-app">
              Linked to{" "}
              <span className="font-medium">
                {balance.telegram.username
                  ? `@${balance.telegram.username}`
                  : `Telegram user ${balance.telegram.user_id}`}
              </span>
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
                onClick={onTestTelegram}
                disabled={busy}
                className={PRIMARY}
              >
                Send test
              </button>
              <button
                type="button"
                onClick={onUnlinkTelegram}
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
              Link Telegram to chat with the assistant from your phone.
            </div>
            {telegramCode ? (
              <div className="rounded-lg border border-app bg-surface p-3 text-sm text-app">
                Open Telegram and tap this link to finish:
                <a
                  href={telegramCode.deep_link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block break-all font-mono text-tool-accent underline"
                >
                  {telegramCode.deep_link}
                </a>
                <div className="mt-2 text-[0.62rem] uppercase tracking-[0.14em] text-faint">
                  Or send /start {telegramCode.code} to @{telegramCode.bot_username}. Expires in 10 minutes.
                </div>
              </div>
            ) : null}
            <button
              type="button"
              onClick={onMintTelegram}
              disabled={linking}
              className={PRIMARY}
            >
              {telegramCode ? "Generate new link" : "Link Telegram"}
            </button>
          </div>
        )}
      </div>

      {/* Persona */}
      {persona && (
        <div className="rounded-xl border border-app bg-app p-4">
          <div className="flex items-center justify-between">
            <div className="text-[0.62rem] uppercase tracking-[0.14em] text-secondary">
              Persona
            </div>
            {canAdmin && (
              <button
                type="button"
                onClick={onResetPersona}
                disabled={personaSaving}
                className="text-[0.6rem] uppercase tracking-[0.14em] text-secondary underline-offset-4 hover:text-app hover:underline disabled:opacity-50"
              >
                Reset to default
              </button>
            )}
          </div>
          <div className="mt-3 grid gap-3">
            <label className="space-y-1">
              <span className="text-[0.6rem] uppercase tracking-[0.14em] text-secondary">
                Bot name
              </span>
              <input
                disabled={!canAdmin || personaSaving}
                maxLength={60}
                value={persona.bot_name}
                onChange={(e) =>
                  setPersona({ ...persona, bot_name: e.target.value })
                }
                className={`${INPUT} w-full`}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[0.6rem] uppercase tracking-[0.14em] text-secondary">
                Voice tone
              </span>
              <select
                disabled={!canAdmin || personaSaving}
                value={persona.voice_tone}
                onChange={(e) =>
                  setPersona({
                    ...persona,
                    voice_tone: e.target
                      .value as PersonaBody["voice_tone"],
                  })
                }
                className={`${INPUT} w-full`}
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[0.6rem] uppercase tracking-[0.14em] text-secondary">
                Persona description (optional, ≤200 chars)
              </span>
              <textarea
                disabled={!canAdmin || personaSaving}
                maxLength={200}
                rows={2}
                value={persona.persona_description}
                onChange={(e) =>
                  setPersona({
                    ...persona,
                    persona_description: e.target.value,
                  })
                }
                placeholder="e.g. Concise, real-estate-focused, prefers metric units."
                className={`${INPUT} w-full`}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[0.6rem] uppercase tracking-[0.14em] text-secondary">
                Custom greeting (optional)
              </span>
              <input
                disabled={!canAdmin || personaSaving}
                maxLength={200}
                value={persona.custom_greeting}
                onChange={(e) =>
                  setPersona({ ...persona, custom_greeting: e.target.value })
                }
                placeholder="Hi, I'm Aria — what's on your plate today?"
                className={`${INPUT} w-full`}
              />
            </label>
            {canAdmin && (
              <div>
                <button
                  type="button"
                  disabled={personaSaving}
                  onClick={onSavePersona}
                  className={PRIMARY}
                >
                  {personaSaving ? "Saving…" : "Save persona"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Permissions */}
      {permissions && (
        <div className="rounded-xl border border-app bg-app p-4">
          <div className="flex items-center justify-between">
            <div className="text-[0.62rem] uppercase tracking-[0.14em] text-secondary">
              Permissions
            </div>
            <span className="text-[0.6rem] uppercase tracking-[0.14em] text-faint">
              {permissions.workspace_shape === "team"
                ? "Team workspace — writes default to Confirm"
                : "Personal workspace — writes default to Allow"}
            </span>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-app">
            <table className="w-full text-sm">
              <thead className="bg-surface text-[0.6rem] uppercase tracking-[0.14em] text-faint">
                <tr>
                  <th className="px-3 py-2 text-left">Skill</th>
                  <th className="px-3 py-2 text-left">Mode</th>
                </tr>
              </thead>
              <tbody>
                {permissions.skills.map((s) => (
                  <tr key={s.skill_id} className="border-t border-app">
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-app">{s.label}</div>
                      <div className="text-xs text-secondary">
                        {s.description}
                      </div>
                      {!s.has_writes && (
                        <div className="mt-1 text-[0.6rem] uppercase tracking-[0.14em] text-faint">
                          read-only
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {(["allow", "confirm", "deny"] as const).map((m) => {
                          const active = s.mode === m;
                          const disabled =
                            !canAdmin ||
                            permRowSaving === s.skill_id ||
                            (!s.has_writes && m !== "allow");
                          return (
                            <button
                              key={m}
                              type="button"
                              disabled={disabled}
                              onClick={() =>
                                void onChangePermission(s.skill_id, m)
                              }
                              className={`rounded-md border px-2 py-1 text-[0.6rem] uppercase tracking-[0.14em] transition-colors ${
                                active
                                  ? "border-tool-accent bg-tool-accent text-white"
                                  : "border-app text-secondary hover:border-tool-accent hover:text-tool-accent"
                              } disabled:opacity-50`}
                            >
                              {m}
                              {active && s.is_default ? " (default)" : ""}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!canAdmin && (
            <div className="mt-2 text-[0.6rem] uppercase tracking-[0.14em] text-faint">
              Only owners and admins can change permissions.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
