"use client";

/* Automation panel (EPIC-09 + EPIC-12) — 24/7 auto-reply + consent.
 *
 * Lazy-loaded (next/dynamic) so the rule/business-hours editors never bloat
 * the initial WhatsApp bundle (Vercel 8GB build ceiling).
 *
 * Mobile-first, three sub-views (responsive CSS only):
 *   1. Rules         — welcome / away / keyword / numbered-menu auto-replies,
 *                      with one-tap built-in recipes + an active toggle.
 *   2. Business hours — per-day open/close + timezone + away/welcome messages.
 *   3. Consent       — the opt-out suppression list + manual opt-out/in.
 *
 * NO native buttons/lists — menus are numbered TEXT only (Baileys-reliable).
 * Every automated send is throttled + opt-out-suppressed server-side.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createAutomationRule,
  deleteAutomationRule,
  fetchAutomationRules,
  fetchBusinessHours,
  fetchCanned,
  fetchOptOuts,
  saveBusinessHours,
  setConsent,
  updateAutomationRule,
  type WaAutomationRule,
  type WaBusinessHours,
  type WaCanned,
  type WaConsentRow,
} from "./api";
import {
  DangerButton,
  EmptyState,
  ErrorBlock,
  MiniIcon,
  Pill,
  PrimaryButton,
  SecondaryButton,
  formatRelative,
} from "./ui";

interface Props {
  workspaceId: string;
  compact: boolean;
}

type View = "rules" | "hours" | "consent";

export default function AutomationPanel({ workspaceId, compact }: Props) {
  const [view, setView] = useState<View>("rules");
  return (
    <div className="flex h-full flex-col bg-app">
      <header className="flex shrink-0 items-center gap-1 border-b border-app bg-app-elevated px-3 py-2">
        {(
          [
            ["rules", "Auto-replies"],
            ["hours", "Business hours"],
            ["consent", "Opt-outs"],
          ] as Array<[View, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`rounded-md px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] transition-colors ${
              view === key
                ? "bg-tool-accent-soft text-tool-accent"
                : "text-secondary hover:bg-surface hover:text-app"
            }`}
          >
            {label}
          </button>
        ))}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "rules" ? (
          <RulesView workspaceId={workspaceId} compact={compact} />
        ) : view === "hours" ? (
          <HoursView workspaceId={workspaceId} />
        ) : (
          <ConsentView workspaceId={workspaceId} compact={compact} />
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Rules ───────────────────────── */

const RECIPE_LABEL: Record<string, string> = {
  welcome: "Welcome (first contact)",
  away: "Away (outside hours)",
  keyword: "Keyword auto-reply",
  menu: "Numbered menu",
  custom: "Custom",
};

function RulesView({ workspaceId, compact }: Props) {
  const [rules, setRules] = useState<WaAutomationRule[]>([]);
  const [canned, setCanned] = useState<WaCanned[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WaAutomationRule | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [r, c] = await Promise.all([
      fetchAutomationRules(workspaceId),
      fetchCanned(workspaceId),
    ]);
    setLoading(false);
    if (r.ok) setRules(r.data);
    else setError(r.error);
    if (c.ok) setCanned(c.data);
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleActive = useCallback(
    async (rule: WaAutomationRule) => {
      setBusyId(rule.id);
      const res = await updateAutomationRule(workspaceId, rule.id, {
        active: !rule.active,
      });
      setBusyId(null);
      if (res.ok)
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r)),
        );
    },
    [workspaceId],
  );

  const remove = useCallback(
    async (rule: WaAutomationRule) => {
      if (!confirm(`Delete rule "${rule.name}"?`)) return;
      const res = await deleteAutomationRule(workspaceId, rule.id);
      if (res.ok) await refresh();
    },
    [workspaceId, refresh],
  );

  if (loading) return <div className="p-4 text-xs text-faint">loading…</div>;

  return (
    <div className="p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
          Auto-reply rules · {rules.length}
        </h3>
        <PrimaryButton onClick={() => setEditing("new")}>
          <MiniIcon name="plus" /> New rule
        </PrimaryButton>
      </div>

      <div className="mb-3 rounded-md border border-tool-accent/30 bg-tool-accent-soft p-2.5 text-[0.7rem] text-secondary">
        Auto-replies fire on inbound messages and always run through the
        anti-ban throttle. STOP/UNSUBSCRIBE is handled automatically — opted-out
        contacts never get an auto-reply.
      </div>

      {error ? <ErrorBlock body={error} onRetry={refresh} /> : null}

      {rules.length === 0 ? (
        <EmptyState
          kicker="whatsapp.automation"
          compact={compact}
          title="No auto-replies yet"
          body={
            <span>
              Answer FAQs 24/7: a welcome on first contact, an away message
              outside hours, or a keyword reply (&ldquo;price&rdquo; → your rate
              card).
            </span>
          }
          cta={
            <PrimaryButton onClick={() => setEditing("new")}>
              <MiniIcon name="plus" /> Add first rule
            </PrimaryButton>
          }
        />
      ) : (
        <ul role="list" className="space-y-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center justify-between gap-2 rounded-md border border-app bg-surface px-3 py-2"
            >
              <button
                type="button"
                onClick={() => setEditing(rule)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-app">
                    {rule.name}
                  </span>
                  <Pill tone={rule.active ? "success" : "neutral"}>
                    {rule.active ? "on" : "off"}
                  </Pill>
                </div>
                <div className="truncate text-[0.65rem] text-faint">
                  {RECIPE_LABEL[rule.recipe ?? "custom"] ?? "Custom"}
                  {rule.conditions.keywords?.length
                    ? ` · "${rule.conditions.keywords.join('", "')}"`
                    : ""}
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleActive(rule)}
                  disabled={busyId === rule.id}
                  className="rounded-md px-2 py-1 text-[0.6rem] font-medium text-secondary hover:bg-app hover:text-app disabled:opacity-50"
                >
                  {rule.active ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(rule)}
                  className="rounded-md p-1 text-rose-500 hover:bg-rose-500/10"
                  aria-label="Delete rule"
                >
                  <MiniIcon name="trash" size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <RuleEditor
          workspaceId={workspaceId}
          canned={canned}
          rule={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}

type RecipeKind = "welcome" | "away" | "keyword" | "menu" | "custom";

function RuleEditor({
  workspaceId,
  canned,
  rule,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  canned: WaCanned[];
  rule: WaAutomationRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialRecipe = (rule?.recipe as RecipeKind) ?? "welcome";
  const [recipe, setRecipe] = useState<RecipeKind>(initialRecipe);
  const [name, setName] = useState(rule?.name ?? "");
  const [text, setText] = useState<string>(
    typeof rule?.actions?.[0]?.params?.text === "string"
      ? (rule.actions[0].params.text as string)
      : "",
  );
  const [keywords, setKeywords] = useState(
    (rule?.conditions.keywords ?? []).join(", "),
  );
  const [match, setMatch] = useState<"contains" | "starts_with" | "equals">(
    (rule?.conditions.match as "contains" | "starts_with" | "equals") ??
      "contains",
  );
  const [menuHeader, setMenuHeader] = useState<string>(
    typeof rule?.actions?.[0]?.params?.header === "string"
      ? (rule.actions[0].params.header as string)
      : "How can we help? Reply with a number:",
  );
  const [menuOptions, setMenuOptions] = useState<string>(
    Array.isArray(rule?.actions?.[0]?.params?.options)
      ? (rule.actions[0].params.options as string[]).join("\n")
      : "Prices\nDelivery & COD\nTalk to a human",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default names per recipe (only when creating).
  useEffect(() => {
    if (rule) return;
    setName(
      {
        welcome: "Welcome message",
        away: "Away message",
        keyword: "Keyword auto-reply",
        menu: "Menu router",
        custom: "Custom rule",
      }[recipe],
    );
  }, [recipe, rule]);

  const save = useCallback(async () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    let event_name: WaAutomationRule["event_name"] = "message_created";
    const conditions: WaAutomationRule["conditions"] = {};
    let actions: WaAutomationRule["actions"] = [];

    if (recipe === "welcome") {
      event_name = "conversation_created";
      conditions.first_message_only = true;
      if (!text.trim()) {
        setError("Write the welcome message.");
        return;
      }
      actions = [{ type: "send_text", params: { text: text.trim() } }];
    } else if (recipe === "away") {
      conditions.business_hours = "outside";
      if (!text.trim()) {
        setError("Write the away message.");
        return;
      }
      actions = [{ type: "send_text", params: { text: text.trim() } }];
    } else if (recipe === "keyword") {
      const kws = keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      if (kws.length === 0) {
        setError("Add at least one keyword.");
        return;
      }
      if (!text.trim()) {
        setError("Write the reply.");
        return;
      }
      conditions.keywords = kws;
      conditions.match = match;
      actions = [{ type: "send_text", params: { text: text.trim() } }];
    } else if (recipe === "menu") {
      const opts = menuOptions
        .split("\n")
        .map((o) => o.trim())
        .filter(Boolean);
      if (opts.length === 0) {
        setError("Add at least one menu option.");
        return;
      }
      // Menu triggers on every inbound (or a keyword like "menu"/"hi"); keep it
      // simple: fire on first contact so a first-timer gets the menu.
      event_name = "conversation_created";
      conditions.first_message_only = true;
      actions = [
        {
          type: "send_menu",
          params: { header: menuHeader.trim(), options: opts },
        },
      ];
    } else {
      // custom = a plain text reply on every message
      if (!text.trim()) {
        setError("Write the message.");
        return;
      }
      actions = [{ type: "send_text", params: { text: text.trim() } }];
    }

    const payload: Partial<WaAutomationRule> = {
      name: name.trim(),
      event_name,
      conditions,
      actions,
      recipe,
      active: rule?.active ?? true,
      priority: rule?.priority ?? (recipe === "keyword" ? 50 : 100),
    };

    setBusy(true);
    const res = rule
      ? await updateAutomationRule(workspaceId, rule.id, payload)
      : await createAutomationRule(workspaceId, payload);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
  }, [
    workspaceId,
    rule,
    recipe,
    name,
    text,
    keywords,
    match,
    menuHeader,
    menuOptions,
    onSaved,
  ]);

  const recipeHelp: Record<RecipeKind, string> = {
    welcome: "Sent once, the first time a new contact messages you.",
    away: "Sent automatically when a message arrives outside business hours.",
    keyword: "Sent when an inbound message matches your keyword(s).",
    menu: "A numbered text menu sent to first-time contacts (no tappable buttons — Baileys-safe).",
    custom: "A plain reply sent on every inbound message.",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-app bg-app-elevated shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-app px-4 py-3">
          <h3 className="text-base font-semibold text-app">
            {rule ? "Edit rule" : "New auto-reply"}
          </h3>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {!rule ? (
            <div>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
                Recipe
              </span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(
                  ["welcome", "away", "keyword", "menu", "custom"] as RecipeKind[]
                ).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRecipe(r)}
                    className={`rounded-full border px-2.5 py-1 text-[0.65rem] capitalize ${
                      recipe === r
                        ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                        : "border-app text-secondary hover:bg-surface"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[0.65rem] text-faint">
                {recipeHelp[recipe]}
              </p>
            </div>
          ) : null}

          <label className="block">
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
              Rule name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
            />
          </label>

          {recipe === "keyword" ? (
            <>
              <label className="block">
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
                  Keywords (comma-separated)
                </span>
                <input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="price, rate, kitna"
                  className="mt-1 w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
                  Match
                </span>
                <select
                  value={match}
                  onChange={(e) =>
                    setMatch(
                      e.target.value as "contains" | "starts_with" | "equals",
                    )
                  }
                  className="mt-1 w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
                >
                  <option value="contains">message contains keyword</option>
                  <option value="starts_with">message starts with keyword</option>
                  <option value="equals">message equals keyword</option>
                </select>
              </label>
            </>
          ) : null}

          {recipe === "menu" ? (
            <>
              <label className="block">
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
                  Menu header
                </span>
                <input
                  value={menuHeader}
                  onChange={(e) => setMenuHeader(e.target.value)}
                  className="mt-1 w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
                  Options (one per line — auto-numbered)
                </span>
                <textarea
                  value={menuOptions}
                  onChange={(e) => setMenuOptions(e.target.value)}
                  rows={4}
                  className="mt-1 w-full resize-y rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
                />
              </label>
            </>
          ) : (
            <label className="block">
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
                Message · {"{{contact.firstName}}"} supported
              </span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder={
                  recipe === "welcome"
                    ? "Assalam o Alaikum {{contact.firstName}}! Thanks for messaging. How can we help?"
                    : recipe === "away"
                      ? "Thanks for your message! We're closed right now and will reply during business hours."
                      : "Our rate card: …"
                }
                className="mt-1 w-full resize-y rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
              />
              {canned.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="text-[0.6rem] text-faint">insert canned:</span>
                  {canned.slice(0, 6).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setText(c.content)}
                      className="rounded-full border border-app px-1.5 py-0.5 text-[0.6rem] text-secondary hover:bg-surface"
                    >
                      /{c.short_code}
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
          )}

          {error ? <ErrorBlock body={error} /> : null}
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-app px-4 py-3">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={save} loading={busy}>
            {rule ? "Save rule" : "Create rule"}
          </PrimaryButton>
        </footer>
      </div>
    </div>
  );
}

/* ───────────────────────── Business hours ───────────────────────── */

const DAYS = [
  ["1", "Mon"],
  ["2", "Tue"],
  ["3", "Wed"],
  ["4", "Thu"],
  ["5", "Fri"],
  ["6", "Sat"],
  ["0", "Sun"],
] as const;

const COMMON_TZ = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Europe/London",
  "America/New_York",
  "UTC",
];

function HoursView({ workspaceId }: { workspaceId: string }) {
  const [cfg, setCfg] = useState<WaBusinessHours | null>(null);
  const [openNow, setOpenNow] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetchBusinessHours(workspaceId);
      setLoading(false);
      if (res.ok) {
        setCfg(res.data.config);
        setOpenNow(res.data.open_now);
      } else setError(res.error);
    })();
  }, [workspaceId]);

  const setDay = useCallback(
    (day: string, patch: Partial<{ open: string; close: string; closed: boolean }>) => {
      setCfg((prev) => {
        if (!prev) return prev;
        const weekly = { ...prev.weekly };
        if (patch.closed) {
          weekly[day] = [];
        } else {
          const cur = weekly[day]?.[0] ?? { open: "09:00", close: "18:00" };
          weekly[day] = [{ ...cur, ...patch }];
        }
        return { ...prev, weekly };
      });
    },
    [],
  );

  const save = useCallback(async () => {
    if (!cfg) return;
    setBusy(true);
    setError(null);
    const res = await saveBusinessHours(workspaceId, cfg);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 1500);
  }, [workspaceId, cfg]);

  if (loading || !cfg)
    return <div className="p-4 text-xs text-faint">loading…</div>;

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
          Business hours
        </h3>
        {openNow !== null ? (
          <Pill tone={openNow ? "success" : "neutral"}>
            {openNow ? "open now" : "closed now"}
          </Pill>
        ) : null}
      </div>

      <label className="block">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
          Timezone
        </span>
        <select
          value={cfg.timezone}
          onChange={(e) => setCfg({ ...cfg, timezone: e.target.value })}
          className="mt-1 w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
        >
          {COMMON_TZ.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-1.5">
        {DAYS.map(([d, label]) => {
          const ranges = cfg.weekly[d] ?? [];
          const closed = ranges.length === 0;
          const r = ranges[0] ?? { open: "09:00", close: "18:00" };
          return (
            <div key={d} className="flex items-center gap-2">
              <span className="w-10 font-mono text-[0.7rem] text-secondary">
                {label}
              </span>
              <label className="flex items-center gap-1 text-[0.65rem] text-faint">
                <input
                  type="checkbox"
                  checked={!closed}
                  onChange={(e) => setDay(d, { closed: !e.target.checked })}
                />
                open
              </label>
              {!closed ? (
                <>
                  <input
                    type="time"
                    value={r.open}
                    onChange={(e) => setDay(d, { open: e.target.value })}
                    className="rounded-md border border-app bg-surface px-1.5 py-1 text-xs text-app outline-none focus:border-tool-accent"
                  />
                  <span className="text-xs text-faint">–</span>
                  <input
                    type="time"
                    value={r.close}
                    onChange={(e) => setDay(d, { close: e.target.value })}
                    className="rounded-md border border-app bg-surface px-1.5 py-1 text-xs text-app outline-none focus:border-tool-accent"
                  />
                </>
              ) : (
                <span className="text-xs text-faint">closed</span>
              )}
            </div>
          );
        })}
      </div>

      <label className="block">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
          Away message (outside hours)
        </span>
        <textarea
          value={cfg.away_message ?? ""}
          onChange={(e) => setCfg({ ...cfg, away_message: e.target.value })}
          rows={2}
          placeholder="Thanks! We're closed right now and will reply during business hours."
          className="mt-1 w-full resize-y rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
        />
      </label>

      <label className="block">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
          Welcome message (first contact, falls back here)
        </span>
        <textarea
          value={cfg.welcome_message ?? ""}
          onChange={(e) => setCfg({ ...cfg, welcome_message: e.target.value })}
          rows={2}
          placeholder="Assalam o Alaikum! Thanks for messaging. How can we help?"
          className="mt-1 w-full resize-y rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
        />
      </label>

      {error ? <ErrorBlock body={error} /> : null}

      <div className="flex items-center justify-end gap-2">
        {savedMsg ? (
          <span className="text-xs text-emerald-600 dark:text-emerald-300">
            Saved
          </span>
        ) : null}
        <PrimaryButton onClick={save} loading={busy}>
          Save hours
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ───────────────────────── Consent / opt-outs ───────────────────────── */

function ConsentView({ workspaceId, compact }: Props) {
  const [items, setItems] = useState<WaConsentRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetchOptOuts(workspaceId);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setItems(res.data.items);
    setCount(res.data.opted_out_count);
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resubscribe = useCallback(
    async (row: WaConsentRow) => {
      setBusyId(row.contact_id);
      const res = await setConsent(workspaceId, row.contact_id, "opt_in");
      setBusyId(null);
      if (res.ok) await refresh();
    },
    [workspaceId, refresh],
  );

  if (loading) return <div className="p-4 text-xs text-faint">loading…</div>;

  return (
    <div className="p-3">
      <h3 className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
        Opt-out suppression list · {count}
      </h3>
      <div className="mb-3 rounded-md border border-app bg-surface p-2.5 text-[0.7rem] text-secondary">
        Contacts here texted STOP / UNSUBSCRIBE (or were opted out manually) and
        are excluded from every broadcast and auto-reply. Re-subscribe only with
        their permission.
      </div>

      {error ? <ErrorBlock body={error} onRetry={refresh} /> : null}

      {items.length === 0 ? (
        <EmptyState
          kicker="whatsapp.consent"
          compact={compact}
          title="No opt-outs"
          body={
            <span>
              Nobody has opted out yet. STOP handling is live — a customer
              texting &ldquo;STOP&rdquo; lands here automatically.
            </span>
          }
        />
      ) : (
        <ul role="list" className="divide-y divide-app">
          {items.map((row) => (
            <li
              key={row.contact_id}
              className="flex items-center justify-between gap-2 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-app">{row.name}</div>
                <div className="text-[0.6rem] text-faint">
                  opted out {formatRelative(row.opted_out_at)}
                  {row.opt_out_source ? ` · ${row.opt_out_source}` : ""}
                </div>
              </div>
              <SecondaryButton
                onClick={() => resubscribe(row)}
                disabled={busyId === row.contact_id}
              >
                Re-subscribe
              </SecondaryButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
