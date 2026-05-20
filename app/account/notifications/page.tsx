/* /account/notifications — per-user notification preferences.
 *
 * Server-rendered. Reads the user's row from `notification_prefs` (or
 * falls back to column defaults if there's no row yet — first-time
 * visit). The form posts back to the `updateNotificationPrefs` server
 * action which upserts and redirects with a `?toast=success:` param
 * picked up by `<Toaster />` on remount.
 */

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { updateNotificationPrefs } from "./_actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notification preferences",
  description: "Choose which notifications you receive from Space Field.",
};

interface Prefs {
  comment_mention: boolean;
  task_assigned: boolean;
  task_completed: boolean;
  timeoff_decision: boolean;
  workspace_invite: boolean;
  weekly_digest: boolean;
  email_marketing: boolean;
}

const DEFAULTS: Prefs = {
  comment_mention: true,
  task_assigned: true,
  task_completed: false,
  timeoff_decision: true,
  workspace_invite: true,
  weekly_digest: false,
  email_marketing: false,
};

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin?next=/account/notifications");
  }

  const { data: row } = await supabase
    .from("notification_prefs")
    .select(
      "comment_mention, task_assigned, task_completed, timeoff_decision, workspace_invite, weekly_digest, email_marketing",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const prefs: Prefs = {
    comment_mention: row?.comment_mention ?? DEFAULTS.comment_mention,
    task_assigned: row?.task_assigned ?? DEFAULTS.task_assigned,
    task_completed: row?.task_completed ?? DEFAULTS.task_completed,
    timeoff_decision: row?.timeoff_decision ?? DEFAULTS.timeoff_decision,
    workspace_invite: row?.workspace_invite ?? DEFAULTS.workspace_invite,
    weekly_digest: row?.weekly_digest ?? DEFAULTS.weekly_digest,
    email_marketing: row?.email_marketing ?? DEFAULTS.email_marketing,
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-lg font-semibold text-app">
          Notification preferences
        </h1>
        <p className="mt-1 text-sm text-muted">
          Choose what reaches your inbox. You can change these at any time —
          essentials like security alerts and billing receipts are always
          sent.
        </p>
      </header>

      <form
        action={updateNotificationPrefs}
        className="flex flex-col gap-6"
      >
        <Section
          title="Mentions &amp; collaboration"
          description="Activity from other people in your workspace."
        >
          <Toggle
            name="comment_mention"
            label="Comment mentions"
            sub="Someone @-mentions you in a comment."
            defaultChecked={prefs.comment_mention}
          />
          <Toggle
            name="task_assigned"
            label="Task assignments"
            sub="A task is assigned to you."
            defaultChecked={prefs.task_assigned}
          />
          <Toggle
            name="task_completed"
            label="Task completions"
            sub="A task you created is marked done."
            defaultChecked={prefs.task_completed}
          />
        </Section>

        <Section
          title="Approvals &amp; access"
          description="Decisions that affect what you can do."
        >
          <Toggle
            name="timeoff_decision"
            label="Time-off approvals"
            sub="Your time-off request is approved or denied."
            defaultChecked={prefs.timeoff_decision}
          />
          <Toggle
            name="workspace_invite"
            label="Workspace invites"
            sub="Someone invites you to a workspace."
            defaultChecked={prefs.workspace_invite}
          />
        </Section>

        <Section
          title="Digest &amp; marketing"
          description="Optional summaries and product news. Off by default."
        >
          <Toggle
            name="weekly_digest"
            label="Weekly digest"
            sub="A Monday summary of activity in your workspace."
            defaultChecked={prefs.weekly_digest}
          />
          <Toggle
            name="email_marketing"
            label="Product updates"
            sub="Occasional emails about new features and tips."
            defaultChecked={prefs.email_marketing}
          />
        </Section>

        <div className="flex items-center justify-end gap-2 border-t border-app pt-4">
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:opacity-90"
          >
            Save preferences
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-app bg-app-elevated">
      <header className="border-b border-app px-4 py-3">
        <h2 className="text-sm font-semibold text-app">{title}</h2>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </header>
      <div className="divide-y divide-app/40">{children}</div>
    </section>
  );
}

function Toggle({
  name,
  label,
  sub,
  defaultChecked,
}: {
  name: string;
  label: string;
  sub: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 px-4 py-3 hover:bg-app-muted/40">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-app">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{sub}</span>
      </span>
      <span className="flex-shrink-0 pt-0.5">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="h-4 w-4 cursor-pointer accent-current"
        />
      </span>
    </label>
  );
}
