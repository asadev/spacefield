"use client";

/* Conversations tab — left contact list + right chat view.
 *
 * Data flow
 * ─────────
 *  GET /api/whatsapp/conversations?workspace_id=X → contact summaries (left)
 *  GET /api/whatsapp/messages?contact_id=Y        → message history (right)
 *  POST /api/whatsapp/send                        → outbound message
 *
 * The list polls every 15s for new inbound messages. The active chat polls
 * every 5s while focused so the user sees replies live. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchContactSummaries,
  fetchMessages,
  sendMessage,
  type WaContactSummary,
  type WaMessage,
} from "./api";
import {
  EmptyState,
  ErrorBlock,
  MiniIcon,
  Pill,
  PrimaryButton,
  formatPhone,
  formatRelative,
  formatStatusIcon,
} from "./ui";

interface Props {
  workspaceId: string;
  compact: boolean;
}

const LIST_POLL_MS = 15_000;
const CHAT_POLL_MS = 5_000;
const PANEL_WIDTH_THRESHOLD = 720;

export default function ConversationsTab({ workspaceId, compact }: Props) {
  const [contacts, setContacts] = useState<WaContactSummary[]>([]);
  const [contactsErr, setContactsErr] = useState<string | null>(null);
  const [contactsLoading, setContactsLoading] = useState(true);

  const [selected, setSelected] = useState<WaContactSummary | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesErr, setMessagesErr] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showChat, setShowChat] = useState(false); // mobile only

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const refreshContacts = useCallback(async () => {
    setContactsErr(null);
    const res = await fetchContactSummaries(workspaceId);
    if (!res.ok) {
      setContactsErr(res.error);
      setContactsLoading(false);
      return;
    }
    setContacts(res.data);
    setContactsLoading(false);
  }, [workspaceId]);

  const refreshMessages = useCallback(
    async (contact: WaContactSummary | null) => {
      if (!contact) {
        setMessages([]);
        return;
      }
      setMessagesErr(null);
      const res = await fetchMessages(workspaceId, contact.contact_id, contact.phone);
      if (!res.ok) {
        setMessagesErr(res.error);
        setMessagesLoading(false);
        return;
      }
      // Sort ascending so newest appears at bottom of the bubble feed.
      const sorted = [...res.data].sort(
        (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
      );
      setMessages(sorted);
      setMessagesLoading(false);
    },
    [workspaceId]
  );

  // Initial + polling refresh of contacts
  useEffect(() => {
    refreshContacts();
    const id = setInterval(refreshContacts, LIST_POLL_MS);
    return () => clearInterval(id);
  }, [refreshContacts]);

  // Refresh messages when selection changes + poll while focused
  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    setMessagesLoading(true);
    refreshMessages(selected);
    const id = setInterval(() => refreshMessages(selected), CHAT_POLL_MS);
    return () => clearInterval(id);
  }, [selected, refreshMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({ block: "end" });
  }, [messages.length, selected?.phone]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      const blob = `${c.name ?? ""} ${c.phone ?? ""} ${c.last_message_preview ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [contacts, search]);

  const handleSend = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!selected || !draft.trim()) return;
      const optimistic: WaMessage = {
        id: `local-${Date.now()}`,
        workspace_id: workspaceId,
        contact_id: selected.contact_id,
        contact_phone: selected.phone,
        direction: "outbound",
        body: draft.trim(),
        media_url: null,
        status: "queued",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setDraft("");
      setSending(true);
      setSendErr(null);

      const target_id = selected.contact_id ?? selected.phone;
      const res = await sendMessage({
        workspace_id: workspaceId,
        target_type: "contact",
        target_id,
        message: optimistic.body ?? "",
      });
      setSending(false);
      if (!res.ok) {
        setSendErr(res.error);
        // Mark optimistic as failed
        setMessages((prev) =>
          prev.map((m) => (m.id === optimistic.id ? { ...m, status: "failed" } : m))
        );
        return;
      }
      // Refresh to pick up the canonical id / delivery status
      await refreshMessages(selected);
    },
    [draft, refreshMessages, selected, workspaceId]
  );

  const showLeftOnMobile = compact && !showChat;
  const showRightOnMobile = compact && showChat;

  return (
    <div className={`flex h-full bg-app ${compact ? "flex-col" : "flex-row"}`}>
      {/* Contact list */}
      {(!compact || showLeftOnMobile) && (
        <aside
          className={`flex flex-col border-r border-app bg-app-elevated ${
            compact ? "w-full" : "w-[320px] min-w-[280px]"
          }`}
        >
          <div className="shrink-0 border-b border-app p-2">
            <label className="flex items-center gap-2 rounded-md border border-app bg-surface px-2 py-1.5">
              <MiniIcon name="search" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations"
                className="w-full bg-transparent text-sm text-app outline-none placeholder:text-faint"
                aria-label="Search conversations"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {contactsLoading ? (
              <div className="p-4 text-xs text-faint">loading…</div>
            ) : contactsErr ? (
              <div className="p-3">
                <ErrorBlock body={contactsErr} onRetry={refreshContacts} />
              </div>
            ) : filtered.length === 0 ? (
              <ContactsEmpty compact={compact} />
            ) : (
              <ul role="list" className="divide-y divide-app">
                {filtered.map((c) => {
                  const active =
                    selected?.phone === c.phone && selected?.contact_id === c.contact_id;
                  return (
                    <li key={`${c.phone}-${c.contact_id ?? "_"}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(c);
                          if (compact) setShowChat(true);
                        }}
                        className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors ${
                          active
                            ? "bg-tool-accent-soft"
                            : "hover:bg-surface"
                        }`}
                        aria-current={active ? "true" : undefined}
                      >
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tool-accent-soft text-tool-accent">
                          <MiniIcon name="users" size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate text-sm font-medium text-app">
                              {c.name?.trim() || formatPhone(c.phone)}
                            </div>
                            <div className="shrink-0 text-[0.65rem] text-faint">
                              {formatRelative(c.last_message_at)}
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate text-xs text-secondary">
                              {c.last_direction === "outbound" ? "You: " : ""}
                              {c.last_message_preview ?? "—"}
                            </div>
                            {c.unread_count > 0 ? (
                              <span className="shrink-0 rounded-full bg-tool-accent px-1.5 py-px text-[0.6rem] font-semibold text-app-elevated">
                                {c.unread_count > 99 ? "99+" : c.unread_count}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      )}

      {/* Chat view */}
      {(!compact || showRightOnMobile) && (
        <section className="flex min-w-0 flex-1 flex-col bg-app">
          {!selected ? (
            <EmptyState
              kicker="whatsapp.inbox"
              compact={compact}
              title="Pick a conversation"
              body={
                <span>
                  Reply from your phone too — replies sync here automatically
                  (bidirectional).
                </span>
              }
            />
          ) : (
            <>
              {/* Header */}
              <header className="flex shrink-0 items-center gap-2 border-b border-app bg-app-elevated px-3 py-2">
                {compact ? (
                  <button
                    type="button"
                    onClick={() => setShowChat(false)}
                    className="rounded-md p-1 text-secondary hover:bg-surface"
                    aria-label="Back to conversations"
                  >
                    <MiniIcon name="close" size={16} />
                  </button>
                ) : null}
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-tool-accent-soft text-tool-accent">
                  <MiniIcon name="users" size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-app">
                    {selected.name?.trim() || formatPhone(selected.phone)}
                  </div>
                  <div className="truncate text-[0.65rem] font-mono text-faint">
                    {formatPhone(selected.phone)}
                  </div>
                </div>
              </header>

              {/* Messages */}
              <div className="min-h-0 flex-1 overflow-y-auto bg-app p-3">
                {messagesLoading ? (
                  <div className="text-xs text-faint">loading messages…</div>
                ) : messagesErr ? (
                  <ErrorBlock
                    body={messagesErr}
                    onRetry={() => refreshMessages(selected)}
                  />
                ) : messages.length === 0 ? (
                  <div className="mt-8 text-center text-xs text-faint">
                    No messages yet. Send the first one below.
                  </div>
                ) : (
                  <ul role="list" className="flex flex-col gap-2">
                    {messages.map((m) => (
                      <MessageBubble key={m.id} msg={m} />
                    ))}
                  </ul>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <form
                onSubmit={handleSend}
                className="shrink-0 border-t border-app bg-app-elevated p-2"
              >
                {sendErr ? (
                  <div className="mb-2">
                    <ErrorBlock body={sendErr} />
                  </div>
                ) : null}
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter sends, Shift+Enter inserts newline.
                      // Matches WhatsApp / iMessage / Slack default.
                      // (Old behaviour required Cmd/Ctrl+Enter which
                      // Asad correctly called out as friction.)
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Write a reply — Enter to send, Shift+Enter for newline"
                    rows={2}
                    className="min-h-[44px] w-full resize-y rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none placeholder:text-faint focus:border-tool-accent"
                    aria-label="Message body"
                    disabled={sending}
                  />
                  <PrimaryButton
                    type="submit"
                    disabled={!draft.trim() || sending}
                    loading={sending}
                  >
                    <MiniIcon name="send" /> Send
                  </PrimaryButton>
                </div>
                <p className="mt-1 text-[0.6rem] text-faint">
                  Outbound counts against your daily cap.
                </p>
              </form>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function ContactsEmpty({ compact }: { compact: boolean }) {
  return (
    <div className="p-4">
      <div
        className="rounded-xl border border-dashed border-app bg-app-elevated p-4 text-center"
        style={{ maxWidth: compact ? "100%" : 480 }}
      >
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
          whatsapp.inbox
        </div>
        <h4 className="mt-2 text-sm font-semibold text-app">No conversations yet</h4>
        <p className="mt-1 text-xs text-secondary">
          Inbound messages appear here. Send to a CRM contact from any tool to
          start a thread.
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: WaMessage }) {
  const out = msg.direction === "outbound";
  const tone = msg.status === "failed" ? "danger" : msg.status === "queued" ? "neutral" : null;
  return (
    <li className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${
          out
            ? "rounded-br-sm bg-tool-accent text-app-elevated"
            : "rounded-bl-sm border border-app bg-app-elevated text-app"
        }`}
      >
        {msg.body ? (
          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
        ) : null}
        {msg.media_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={msg.media_url}
            alt=""
            className="mt-1 max-h-60 rounded-md"
          />
        ) : null}
        <div className="mt-0.5 flex items-center justify-end gap-1 text-[0.6rem] opacity-80">
          <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          {out ? (
            <span
              className={
                msg.status === "read"
                  ? "text-sky-200"
                  : msg.status === "failed"
                  ? "text-rose-200"
                  : ""
              }
            >
              {formatStatusIcon(msg.status)}
            </span>
          ) : null}
        </div>
        {tone ? (
          <div className="mt-1 text-[0.6rem]">
            <Pill tone={tone}>{msg.status}</Pill>
          </div>
        ) : null}
      </div>
    </li>
  );
}
