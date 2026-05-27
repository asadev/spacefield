"use client";

/* WhatsAppMessageComposer — reusable composer.
 *
 * Drop into any Spacefield surface that should be able to send a WhatsApp
 * message: e.g. a property poster page can fire one off, the InventoryView
 * can blast a list. Wires straight to `/api/whatsapp/send`. The component
 * deliberately knows nothing about the calling surface — props for target
 * defaults, an optional onSend callback for completion.
 *
 * Modes
 * ─────
 *   fixedTarget = true:   target is pre-decided; UI hides the picker (used
 *                          when embedded inside Groups/Lists detail pane)
 *   fixedTarget = false:  user picks target type + the actual target
 *
 * The component re-uses the same Spacefield API helpers as the in-app
 * tabs so behaviour stays consistent. */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchGroups,
  fetchInstanceStatus,
  fetchLists,
  fetchSendableContacts,
  sendMessage,
  type WaCrmContact,
  type WaGroup,
  type WaInstance,
  type WaList,
  type WaSendPayload,
  type WaSendResult,
} from "@/app/tools/whatsapp/_components/api";
import {
  DangerButton,
  ErrorBlock,
  MiniIcon,
  Pill,
  PrimaryButton,
  SecondaryButton,
  estimateSendDuration,
  formatPhone,
} from "@/app/tools/whatsapp/_components/ui";

export interface WhatsAppMessageComposerProps {
  workspaceId: string;
  defaultMessage?: string;
  defaultMedia?: string;
  defaultTargetType?: "contact" | "group" | "list";
  defaultTargetId?: string;
  /** When true, hides the target-type tabs + target picker — used inside
   * surfaces that already know the target (group detail page, list detail). */
  fixedTarget?: boolean;
  /** When true, exposes the template-variant fieldset (up to 5 strings). */
  showVariants?: boolean;
  /** Called with the API response (post-send) so the host surface can
   * update UI / dismiss its own modal. */
  onSend?: (result: WaSendResult) => void;
  /** Hide the throttle disclaimer (composer embedded in a screen that
   * already displays one). */
  hideThrottleEstimate?: boolean;
}

type TargetType = "contact" | "group" | "list";

const TARGET_LABELS: Record<TargetType, string> = {
  contact: "Single contact",
  group: "Group",
  list: "Saved list",
};

const MAX_CHARS = 4096; // WhatsApp text limit
const MAX_VARIANTS = 5;

export default function WhatsAppMessageComposer(props: WhatsAppMessageComposerProps) {
  const {
    workspaceId,
    defaultMessage = "",
    defaultMedia,
    defaultTargetType = "contact",
    defaultTargetId,
    fixedTarget = false,
    showVariants = false,
    onSend,
    hideThrottleEstimate,
  } = props;

  const [targetType, setTargetType] = useState<TargetType>(defaultTargetType);
  const [targetId, setTargetId] = useState<string>(defaultTargetId ?? "");
  const [message, setMessage] = useState<string>(defaultMessage);
  const [mediaUrl, setMediaUrl] = useState<string>(defaultMedia ?? "");
  const [variants, setVariants] = useState<string[]>([]);
  const [variantInput, setVariantInput] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [contacts, setContacts] = useState<WaCrmContact[]>([]);
  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [lists, setLists] = useState<WaList[]>([]);
  const [instance, setInstance] = useState<WaInstance | null>(null);

  // When the target type changes, blank the targetId unless fixed
  useEffect(() => {
    if (fixedTarget) return;
    setTargetId("");
  }, [targetType, fixedTarget]);

  // Lazy-load target lists based on the active type
  useEffect(() => {
    let alive = true;
    (async () => {
      if (targetType === "contact") {
        const res = await fetchSendableContacts(workspaceId);
        if (!alive) return;
        if (res.ok) setContacts(res.data);
      }
      if (targetType === "group") {
        const res = await fetchGroups(workspaceId);
        if (!alive) return;
        if (res.ok) setGroups(res.data);
      }
      if (targetType === "list") {
        const res = await fetchLists(workspaceId);
        if (!alive) return;
        if (res.ok) setLists(res.data);
      }
    })();
    return () => {
      alive = false;
    };
  }, [targetType, workspaceId]);

  // Load instance for throttle/health hints
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetchInstanceStatus(workspaceId);
      if (!alive) return;
      if (res.ok) setInstance(res.data);
    })();
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  const targetCount = useMemo(() => {
    if (targetType === "list") {
      const l = lists.find((x) => x.id === targetId);
      return l?.contact_count ?? l?.contact_ids.length ?? 0;
    }
    if (targetType === "group") {
      const g = groups.find((x) => x.id === targetId);
      return g?.member_count ?? 0;
    }
    return 1;
  }, [groups, lists, targetId, targetType]);

  const throttleEstimate = useMemo(
    () => (targetCount > 1 ? estimateSendDuration(targetCount, instance?.hourly_cap ?? null) : null),
    [instance?.hourly_cap, targetCount]
  );

  const addVariant = useCallback(() => {
    const v = variantInput.trim();
    if (!v) return;
    if (variants.length >= MAX_VARIANTS) return;
    setVariants((prev) => [...prev, v]);
    setVariantInput("");
  }, [variantInput, variants.length]);

  const removeVariant = useCallback((index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const canSend =
    !!message.trim() &&
    !!targetId &&
    (instance?.status === "connected" || instance == null);

  const submit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      setError(null);
      setSuccessMsg(null);
      if (!message.trim()) {
        setError("Message can't be empty.");
        return;
      }
      if (!targetId) {
        setError("Pick a recipient.");
        return;
      }
      setSending(true);
      const payload: WaSendPayload = {
        workspace_id: workspaceId,
        target_type: targetType,
        target_id: targetId,
        message: message.trim(),
      };
      if (mediaUrl.trim()) payload.media_url = mediaUrl.trim();
      if (variants.length > 0) payload.template_variants = variants;
      const res = await sendMessage(payload);
      setSending(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccessMsg(
        targetCount > 1
          ? `Queued ${targetCount} sends — track in Jobs.`
          : "Sent."
      );
      // Reset the body but keep target so user can fire another follow-up.
      setMessage("");
      onSend?.(res.data);
    },
    [message, mediaUrl, onSend, targetCount, targetId, targetType, variants]
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-app bg-app-elevated p-3">
      {instance && instance.status !== "connected" ? (
        <ErrorBlock
          title="WhatsApp not connected"
          body="Pair a number under WhatsApp → Connection before sending."
        />
      ) : null}

      {!fixedTarget ? (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
            Recipient type
          </span>
          <div className="flex gap-1.5">
            {(["contact", "group", "list"] as const).map((t) => {
              const active = targetType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTargetType(t)}
                  className={`rounded-md border px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    active
                      ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                      : "border-transparent text-secondary hover:bg-surface"
                  }`}
                >
                  {TARGET_LABELS[t]}
                </button>
              );
            })}
          </div>

          <TargetPicker
            type={targetType}
            value={targetId}
            onChange={setTargetId}
            contacts={contacts}
            groups={groups}
            lists={lists}
          />
        </div>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
          Message
        </span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_CHARS))}
          rows={5}
          placeholder="Hi {{first_name}} — quick update on…"
          className="resize-y rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
          aria-label="Message body"
        />
        <div className="flex items-center justify-between text-[0.6rem] text-faint">
          <span>
            {message.length}/{MAX_CHARS}
          </span>
          {throttleEstimate && !hideThrottleEstimate ? (
            <span>
              ~{throttleEstimate} for {targetCount} contact{targetCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      </label>

      <details className="rounded-md border border-app bg-surface text-xs">
        <summary className="cursor-pointer px-2 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
          <MiniIcon name="paperclip" /> Attach image (optional)
        </summary>
        <div className="border-t border-app p-2">
          <input
            type="url"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="https://… (publicly reachable URL)"
            className="w-full rounded-md border border-app bg-app-elevated px-2 py-1 text-xs text-app outline-none focus:border-tool-accent"
          />
          <p className="mt-1 text-[0.6rem] text-faint">
            Image must be reachable from the Evolution gateway. For private
            uploads, use the Sales tools to mint a shareable link first.
          </p>
        </div>
      </details>

      {showVariants ? (
        <details open={variants.length > 0} className="rounded-md border border-app bg-surface text-xs">
          <summary className="cursor-pointer px-2 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
            Template variants ({variants.length}/{MAX_VARIANTS})
          </summary>
          <div className="border-t border-app p-2">
            <p className="text-[0.6rem] text-faint">
              When sending in bulk, Spacefield randomly picks one of these
              variants per recipient to reduce WhatsApp ban detection. Each
              variant is a complete alternative wording of the message body.
            </p>
            <div className="mt-2 flex items-end gap-1.5">
              <textarea
                value={variantInput}
                onChange={(e) => setVariantInput(e.target.value)}
                rows={2}
                placeholder="Alt wording…"
                className="flex-1 resize-y rounded-md border border-app bg-app-elevated px-2 py-1 text-xs text-app outline-none focus:border-tool-accent"
              />
              <SecondaryButton
                onClick={addVariant}
                disabled={!variantInput.trim() || variants.length >= MAX_VARIANTS}
              >
                <MiniIcon name="plus" /> Add
              </SecondaryButton>
            </div>
            {variants.length > 0 ? (
              <ul role="list" className="mt-2 flex flex-col gap-1">
                {variants.map((v, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-md border border-app bg-app-elevated px-2 py-1.5 text-xs"
                  >
                    <Pill>v{i + 1}</Pill>
                    <span className="min-w-0 flex-1 break-words text-app">{v}</span>
                    <button
                      type="button"
                      onClick={() => removeVariant(i)}
                      className="shrink-0 rounded p-0.5 text-secondary hover:bg-surface"
                      aria-label={`Remove variant ${i + 1}`}
                    >
                      <MiniIcon name="close" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </details>
      ) : null}

      {error ? <ErrorBlock body={error} /> : null}
      {successMsg ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-700 dark:text-emerald-300">
          {successMsg}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <PrimaryButton type="submit" disabled={!canSend} loading={sending}>
          <MiniIcon name="send" /> Send
          {targetCount > 1 ? ` to ${targetCount}` : ""}
        </PrimaryButton>
      </div>
    </form>
  );
}

function TargetPicker({
  type,
  value,
  onChange,
  contacts,
  groups,
  lists,
}: {
  type: TargetType;
  value: string;
  onChange: (id: string) => void;
  contacts: WaCrmContact[];
  groups: WaGroup[];
  lists: WaList[];
}) {
  if (type === "contact") {
    return (
      <ContactPick value={value} onChange={onChange} contacts={contacts} />
    );
  }
  if (type === "group") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app"
      >
        <option value="">— pick a group —</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name} ({g.member_count})
          </option>
        ))}
      </select>
    );
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app"
    >
      <option value="">— pick a list —</option>
      {lists.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name} ({l.contact_count ?? l.contact_ids.length})
        </option>
      ))}
    </select>
  );
}

function ContactPick({
  value,
  onChange,
  contacts,
}: {
  value: string;
  onChange: (id: string) => void;
  contacts: WaCrmContact[];
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts.slice(0, 30);
    return contacts
      .filter((c) => {
        const blob = `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.phone ?? ""}`.toLowerCase();
        return blob.includes(q);
      })
      .slice(0, 30);
  }, [contacts, query]);
  return (
    <div className="space-y-1">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search contacts"
        className="w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
      />
      <div className="max-h-44 overflow-y-auto rounded-md border border-app bg-app-elevated">
        {filtered.length === 0 ? (
          <div className="p-2 text-xs text-faint">No match.</div>
        ) : (
          <ul role="list" className="divide-y divide-app">
            {filtered.map((c) => {
              const active = c.id === value;
              const label = [c.first_name, c.last_name].filter(Boolean).join(" ") || formatPhone(c.phone);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onChange(c.id)}
                    className={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm ${
                      active ? "bg-tool-accent-soft text-tool-accent" : "hover:bg-surface"
                    }`}
                  >
                    <span className="truncate">{label}</span>
                    <span className="shrink-0 font-mono text-[0.6rem] text-faint">
                      {formatPhone(c.phone)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// Unused — kept here to indicate availability of cancel/disconnect inside future iterations
export { DangerButton as _DangerButton };
