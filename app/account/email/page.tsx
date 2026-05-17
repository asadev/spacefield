/* /account/email — email-channel preferences.
 *
 * Distinct from /account/notifications: that page controls whether an
 * in-app notification is created at all. THIS page controls whether
 * the notification also goes out via email. A user who wants task
 * assignments to show up in the app but not their inbox flips the
 * email-channel toggle off here while keeping the in-app toggle on.
 *
 * Reads from `notification_prefs` (extended in 20260520a). Posts to
 * `/api/account/email-prefs` which writes the same row. We POST to a
 * route handler rather than a server action so we can return JSON to
 * the future React-from-form-data version — keeps the page itself a
 * plain server component.
 */

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Email preferences",
  description: "Choose which emails Space Field sends you.",
};

interface EmailPrefs {
  email_welcome: boolean;
  email_suspicious_login: boolean;
  email_task_assigned: boolean;
  email_weekly_digest: boolean;
  email_marketing_channel: boolean;
}

const DEFAULTS: EmailPrefs = {
  email_welcome: true,
  email_suspicious_login: true,
  email_task_assigned: true,
  email_weekly_digest: false,
  email_marketing_channel: false,
};

export default async function EmailPrefsPage({
  searchParams,
}: {
  searchParams: Promise<{ toast?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account/email");
  }

  const { data: row } = await supabase
    .from("notification_prefs")
    .select(
      "email_welcome, email_suspicious_login, email_task_assigned, email_weekly_digest, email_marketing_channel",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const prefs: EmailPrefs = {
    email_welcome: row?.email_welcome ?? DEFAULTS.email_welcome,
    email_suspicious_login:
      row?.email_suspicious_login ?? DEFAULTS.email_suspicious_login,
    email_task_assigned:
      row?.email_task_assigned ?? DEFAULTS.email_task_assigned,
    email_weekly_digest:
      row?.email_weekly_digest ?? DEFAULTS.email_weekly_digest,
    email_marketing_channel:
      row?.email_marketing_channel ?? DEFAULTS.email_marketing_channel,
  };

  const toast = (await searchParams).toast;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-lg font-semibold text-app">Email preferences</h1>
        <p className="mt-1 text-sm text-muted">
          Pick which emails reach your inbox. Account-state notices
          (sign-up confirmation, password reset, account deletion) are
          essential and always send.
        </p>
        {toast ? (
          <p
            role="status"
            className="mt-3 rounded-md border border-app bg-app-elevated px-3 py-2 text-xs text-muted"
          >
            {toast.startsWith("success:")
              ? decodeURIComponent(toast.slice("success:".length))
              : toast.startsWith("error:")
                ? decodeURIComponent(toast.slice("error:".length))
                : decodeURIComponent(toast)}
          </p>
        ) : null}
      </header>

      <form
        method="POST"
        action="/api/account/email-prefs"
        className="flex flex-col gap-6"
      >
        <Section
          title="Security"
          description="We strongly recommend leaving these on."
        >
          <Toggle
            name="email_suspicious_login"
            label="New device sign-in"
            sub="Email when we see a sign-in from a device we haven't seen for you before."
            defaultChecked={prefs.email_suspicious_login}
          />
        </Section>

        <Section
          title="Welcome &amp; onboarding"
          description="One-off emails when you join."
        >
          <Toggle
            name="email_welcome"
            label="Welcome email"
            sub="A single email when you finish signing up."
            defaultChecked={prefs.email_welcome}
          />
        </Section>

        <Section
          title="Work activity"
          description="Inbox copies of what's happening in your workspaces."
        >
          <Toggle
            name="email_task_assigned"
            label="Task assignments"
            sub="When someone assigns a task to you."
            defaultChecked={prefs.email_task_assigned}
          />
          <Toggle
            name="email_weekly_digest"
            label="Weekly digest"
            sub="A Monday summary of last week's activity. Off by default."
            defaultChecked={prefs.email_weekly_digest}
          />
        </Section>

        <Section
          title="Product &amp; marketing"
          description="Occasional, never automated. Off by default."
        >
          <Toggle
            name="email_marketing_channel"
            label="Product updates"
            sub="New features, tips, and changelogs. Off by default."
            defaultChecked={prefs.email_marketing_channel}
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
