import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { fetchAuthUsersByIds, formatDateTime, inputClass, tierBadgeClass } from "../../_lib";
import type {
  AuthEventRow,
  ImpersonationSessionRow,
  SupportMessageRow,
  SupportTicketRow,
} from "../../_types";
import {
  assignTicket,
  postInternalNote,
  postReply,
  setTicketPriority,
  startImpersonation,
  updateTicketStatus,
} from "../_actions";
import {
  PRIORITY_CHIP,
  STATUS_CHIP,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from "../_helpers";

export const dynamic = "force-dynamic";

type WorkspaceLite = {
  id: string;
  name: string | null;
  slug: string | null;
};

type WorkspaceMembershipLite = {
  workspace_id: string;
  role: string;
  workspaces: WorkspaceLite | null;
};

type SubscriptionLite = {
  user_id: string;
  tier_id: string;
  status: string;
};

export default async function AdminSupportTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const ticketRes = await admin
    .from("support_tickets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const ticket = (ticketRes.data as SupportTicketRow | null) ?? null;
  if (!ticket) notFound();

  // Conversation, customer profile, recent sign-ins, active impersonation
  const [
    messagesRes,
    membersRes,
    subRes,
    signInsRes,
    activeImpRes,
  ] = await Promise.all([
    admin
      .from("support_messages")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
    ticket.user_id
      ? admin
          .from("workspace_members")
          .select("workspace_id, role, workspaces(id, name, slug)")
          .eq("user_id", ticket.user_id)
          .limit(20)
      : Promise.resolve({ data: [] as WorkspaceMembershipLite[] }),
    ticket.user_id
      ? admin
          .from("subscriptions")
          .select("user_id, tier_id, status")
          .eq("user_id", ticket.user_id)
          .maybeSingle()
      : Promise.resolve({ data: null as SubscriptionLite | null }),
    ticket.user_id
      ? admin
          .from("auth_events")
          .select("*")
          .eq("user_id", ticket.user_id)
          .eq("event", "sign_in")
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as AuthEventRow[] }),
    ticket.user_id
      ? admin
          .from("impersonation_sessions")
          .select("*")
          .eq("target_user_id", ticket.user_id)
          .is("ended_at", null)
          .order("started_at", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] as ImpersonationSessionRow[] }),
  ]);

  const messages = (messagesRes.data ?? []) as SupportMessageRow[];
  const memberships = (membersRes.data ?? []) as WorkspaceMembershipLite[];
  const sub = (subRes.data as SubscriptionLite | null) ?? null;
  const signIns = (signInsRes.data ?? []) as AuthEventRow[];
  const activeImpersonations = (activeImpRes.data ?? []) as ImpersonationSessionRow[];

  // Resolve emails for everyone we'll show.
  const userIds = new Set<string>();
  if (ticket.user_id) userIds.add(ticket.user_id);
  if (ticket.assigned_to) userIds.add(ticket.assigned_to);
  for (const m of messages) {
    if (m.author_id) userIds.add(m.author_id);
  }
  for (const s of activeImpersonations) {
    userIds.add(s.admin_id);
  }
  const userMap = await fetchAuthUsersByIds(Array.from(userIds));
  const customerEmail = ticket.user_id
    ? userMap.get(ticket.user_id)?.email ?? null
    : null;
  const assignedEmail = ticket.assigned_to
    ? userMap.get(ticket.assigned_to)?.email ?? null
    : null;

  // The "primary" workspace is just the first membership we found.
  const workspace = memberships[0]?.workspaces ?? null;

  const isResolved =
    ticket.status === "resolved" || ticket.status === "closed";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link href="/admin/support" className="hover:text-tool-accent">
          ← Support inbox
        </Link>
        <span className="text-faint">·</span>
        <Link
          href="/admin/support/impersonations"
          className="hover:text-tool-accent"
        >
          Impersonation log
        </Link>
      </div>

      {/* Header card */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-app">{ticket.subject}</h1>
            <p className="mt-1 font-mono text-[11px] tabular-nums text-faint">
              {ticket.id}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_CHIP[ticket.status]}`}
              >
                {ticket.status.replace("_", " ")}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${PRIORITY_CHIP[ticket.priority]}`}
              >
                {ticket.priority}
              </span>
              {ticket.category && (
                <span className="rounded-full border border-app bg-app px-2 py-0.5 text-[10px] uppercase tracking-wide text-secondary">
                  {ticket.category}
                </span>
              )}
              {ticket.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-app bg-app px-2 py-0.5 text-[10px] text-faint"
                >
                  #{t}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              Opened {formatDateTime(ticket.created_at)}
              {ticket.resolved_at &&
                ` · resolved ${formatDateTime(ticket.resolved_at)}`}
              {ticket.last_response_at &&
                ` · last reply ${formatDateTime(ticket.last_response_at)}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 text-xs">
            {/* Resolve / Reopen quick buttons */}
            {isResolved ? (
              <form action={updateTicketStatus}>
                <input type="hidden" name="id" value={ticket.id} />
                <input type="hidden" name="status" value="open" />
                <button
                  type="submit"
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:border-emerald-500 dark:text-emerald-400"
                >
                  Reopen
                </button>
              </form>
            ) : (
              <form action={updateTicketStatus}>
                <input type="hidden" name="id" value={ticket.id} />
                <input type="hidden" name="status" value="resolved" />
                <button
                  type="submit"
                  className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                >
                  Resolve
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Status / priority / assignment dropdowns */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <form action={updateTicketStatus} className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-[0.18em] text-faint">
              Status
            </label>
            <input type="hidden" name="id" value={ticket.id} />
            <select
              name="status"
              defaultValue={ticket.status}
              className={`${inputClass} h-9`}
            >
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="self-start rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
            >
              Update status
            </button>
          </form>
          <form action={setTicketPriority} className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-[0.18em] text-faint">
              Priority
            </label>
            <input type="hidden" name="id" value={ticket.id} />
            <select
              name="priority"
              defaultValue={ticket.priority}
              className={`${inputClass} h-9`}
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="self-start rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
            >
              Update priority
            </button>
          </form>
          <form action={assignTicket} className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-[0.18em] text-faint">
              Assigned to (admin user id)
            </label>
            <input type="hidden" name="id" value={ticket.id} />
            <input
              name="assigned_to"
              defaultValue={ticket.assigned_to ?? ""}
              placeholder="user uuid (blank = unassigned)"
              className={`${inputClass} h-9 font-mono text-[11px]`}
            />
            {assignedEmail && (
              <span className="text-[10px] text-faint">
                currently {assignedEmail}
              </span>
            )}
            <button
              type="submit"
              className="self-start rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
            >
              Assign
            </button>
          </form>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Conversation pane */}
        <section className="space-y-4">
          <div className="rounded-xl border border-app bg-app-elevated p-4">
            <h2 className="text-sm font-semibold text-app">
              Original message
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-secondary">
              {ticket.body || (
                <span className="text-faint italic">(empty body)</span>
              )}
            </p>
          </div>

          <div className="space-y-3">
            {messages.length === 0 ? (
              <p className="rounded-xl border border-dashed border-app p-4 text-center text-xs text-faint">
                No replies yet.
              </p>
            ) : (
              messages.map((m) => {
                const authorEmail = m.author_id
                  ? userMap.get(m.author_id)?.email ?? null
                  : null;
                const isInternal = m.internal_note;
                const isAdmin = m.is_admin;
                const containerCls = isInternal
                  ? "border-amber-500/40 bg-amber-500/5"
                  : isAdmin
                    ? "border-app bg-tool-accent-soft/50"
                    : "border-app bg-app-elevated";
                return (
                  <div
                    key={m.id}
                    className={`rounded-xl border p-4 ${containerCls}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-app">
                          {authorEmail ??
                            (isAdmin ? "Admin" : "User") +
                              (m.author_id ? ` (${m.author_id.slice(0, 8)}…)` : "")}
                        </span>
                        {isAdmin && (
                          <span className="rounded-full bg-tool-accent-soft px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-tool-accent">
                            admin
                          </span>
                        )}
                        {isInternal && (
                          <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                            internal note
                          </span>
                        )}
                      </div>
                      <span className="font-mono tabular-nums text-faint">
                        {formatDateTime(m.created_at)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-secondary">
                      {m.body}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* Reply / Note composer */}
          <div className="rounded-xl border border-app bg-app-elevated p-4">
            <details className="group">
              <summary className="cursor-pointer text-sm font-semibold text-app">
                Public reply
                <span className="ml-2 text-[11px] font-normal text-faint">
                  visible to the customer · sets last_response_at
                </span>
              </summary>
              <form action={postReply} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={ticket.id} />
                <textarea
                  name="body"
                  required
                  rows={5}
                  placeholder="Your reply…"
                  className={`${inputClass} font-mono text-xs`}
                />
                <button
                  type="submit"
                  className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                >
                  Send reply
                </button>
              </form>
            </details>
            <details className="group mt-3 border-t border-app pt-3">
              <summary className="cursor-pointer text-sm font-semibold text-app">
                Internal note
                <span className="ml-2 text-[11px] font-normal text-amber-600 dark:text-amber-400">
                  admins only · never sent to user
                </span>
              </summary>
              <form action={postInternalNote} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={ticket.id} />
                <textarea
                  name="body"
                  required
                  rows={4}
                  placeholder="What's the inside story?"
                  className={`${inputClass} font-mono text-xs`}
                />
                <button
                  type="submit"
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:border-amber-500 dark:text-amber-400"
                >
                  Save note
                </button>
              </form>
            </details>
          </div>
        </section>

        {/* Right sidebar */}
        <aside className="space-y-4">
          <section className="rounded-xl border border-app bg-app-elevated p-4">
            <h3 className="text-[11px] uppercase tracking-[0.2em] text-faint">
              Customer
            </h3>
            <div className="mt-2 space-y-1 text-sm">
              {ticket.user_id ? (
                <>
                  <div className="font-medium text-app">
                    {customerEmail ?? "(no email)"}
                  </div>
                  <Link
                    href={`/admin/users/${ticket.user_id}`}
                    className="text-[11px] text-tool-accent hover:underline"
                  >
                    View user profile →
                  </Link>
                </>
              ) : (
                <div className="text-faint">No user attached</div>
              )}
            </div>
            {sub && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tierBadgeClass(sub.tier_id)}`}
                >
                  {sub.tier_id}
                </span>
                <span className="text-faint">{sub.status}</span>
              </div>
            )}
            {workspace && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-faint">
                  Workspace
                </div>
                <Link
                  href={`/admin/workspaces/${workspace.id}`}
                  className="mt-1 block text-sm text-app hover:text-tool-accent"
                >
                  {workspace.name ?? workspace.slug ?? workspace.id.slice(0, 8)}
                </Link>
              </div>
            )}
            {memberships.length > 1 && (
              <div className="mt-2 text-[11px] text-muted">
                +{memberships.length - 1} more workspace
                {memberships.length === 2 ? "" : "s"}
              </div>
            )}
          </section>

          {ticket.user_id && (
            <section className="rounded-xl border border-app bg-app-elevated p-4">
              <h3 className="text-[11px] uppercase tracking-[0.2em] text-faint">
                Recent sign-ins
              </h3>
              <ul className="mt-2 space-y-1 font-mono text-[11px] tabular-nums text-secondary">
                {signIns.length === 0 && (
                  <li className="text-faint">None recorded.</li>
                )}
                {signIns.map((e) => (
                  <li key={e.id}>{formatDateTime(e.created_at)}</li>
                ))}
              </ul>
            </section>
          )}

          {/* View as user (impersonation) */}
          {ticket.user_id && (
            <section className="rounded-xl border border-app bg-app-elevated p-4">
              <h3 className="text-[11px] uppercase tracking-[0.2em] text-faint">
                View as user
              </h3>
              <p className="mt-1 text-[11px] text-muted">
                Records an impersonation session. The user-facing app must
                respect the cookie at runtime — for now, we just record the
                row + audit.
              </p>
              {activeImpersonations.length > 0 && (
                <div className="mt-2 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400">
                  Active impersonation in progress (
                  {formatDateTime(activeImpersonations[0]!.started_at)})
                </div>
              )}
              <form action={startImpersonation} className="mt-3 space-y-2">
                <input
                  type="hidden"
                  name="target_user_id"
                  value={ticket.user_id}
                />
                <input type="hidden" name="ticket_id" value={ticket.id} />
                <input
                  name="reason"
                  required
                  placeholder={`Investigating ticket ${ticket.id.slice(0, 8)}…`}
                  className={`${inputClass} h-9 text-xs`}
                />
                <button
                  type="submit"
                  className="w-full rounded-lg border border-app bg-app px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent"
                >
                  Start impersonation
                </button>
              </form>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
