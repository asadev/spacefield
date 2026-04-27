import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime, inputClass } from "../_lib";
import MessageRow, { type MessageRow as MessageRowType } from "./_MessageRow";

export const dynamic = "force-dynamic";

const PER_PAGE = 200;

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; resolved?: string }>;
}) {
  const sp = await searchParams;
  const topic = sp.topic ?? "";
  const resolved = sp.resolved ?? ""; // "", "yes", "no"

  const admin = createAdminClient();

  let q = admin
    .from("contact_messages")
    .select("id, name, email, topic, message, created_at, resolved_at")
    .order("created_at", { ascending: false })
    .limit(PER_PAGE);
  if (topic) q = q.eq("topic", topic);
  if (resolved === "yes") q = q.not("resolved_at", "is", null);
  if (resolved === "no") q = q.is("resolved_at", null);

  // Run the message list and the topics dropdown in parallel. Topics
  // used to read up to 1000 contact_messages rows just to derive
  // distinct values; now it's a SQL DISTINCT via RPC.
  const [msgsRes, topicsRes] = await Promise.all([
    q,
    admin.rpc("admin_contact_message_topics"),
  ]);
  const messages = (msgsRes.data ?? []) as MessageRowType[];
  const topics = ((topicsRes.data ?? []) as Array<{ topic: string }>)
    .map((r) => r.topic)
    .filter(Boolean);

  const openCount = messages.filter((m) => !m.resolved_at).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Messages
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">
            Contact messages
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            {messages.length} shown · {openCount} open
          </p>
        </div>
        <form
          action="/admin/messages"
          className="flex flex-wrap items-center gap-2"
        >
          <label className="text-xs text-muted">Topic</label>
          <select
            name="topic"
            defaultValue={topic}
            className={`${inputClass} h-9 w-40`}
          >
            <option value="">All</option>
            {topics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label className="ml-2 text-xs text-muted">Status</label>
          <select
            name="resolved"
            defaultValue={resolved}
            className={`${inputClass} h-9 w-40`}
          >
            <option value="">All</option>
            <option value="no">Open</option>
            <option value="yes">Resolved</option>
          </select>
          <button
            type="submit"
            className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-sm text-app transition-colors hover:border-tool-accent"
          >
            Apply
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">When</th>
              <th className="px-3 py-2 text-left font-normal">Topic</th>
              <th className="px-3 py-2 text-left font-normal">Name</th>
              <th className="px-3 py-2 text-left font-normal">Email</th>
              <th className="px-3 py-2 text-left font-normal">Message</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {messages.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-faint">
                  No messages match.
                </td>
              </tr>
            ) : (
              messages.map((m) => (
                <MessageRow
                  key={m.id}
                  m={m}
                  formattedCreated={formatDateTime(m.created_at)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
