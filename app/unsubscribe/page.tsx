/* /unsubscribe?t=<token> — public, no auth.
 *
 * The page recipients land on when they click List-Unsubscribe in an
 * email client that surfaces the link (Apple Mail, Outlook, the
 * "Unsubscribe" button at the top of a Gmail thread). Gmail's one-click
 * variant POSTs to `/api/unsubscribe?t=<token>` directly and never
 * renders this page — that's why this is a thin GET-side helper.
 *
 * Flow:
 *   1. Token in query → verify HMAC + expiry.
 *   2. If valid → call applyUnsubscribe() to flip the matching
 *      notification_prefs column to false (idempotent).
 *   3. Show a confirmation card with a link back to the full
 *      notification-preferences screen.
 *
 * Why server-rendered and not a form: we want the page to do the work
 * on visit. The user has already expressed intent by clicking; making
 * them click a second "Confirm" button is anti-user and against the
 * RFC 8058 spirit.
 */

import Link from "next/link";

import {
  applyUnsubscribe,
  verifyUnsubscribeToken,
} from "@/lib/email/unsubscribe-token";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Unsubscribed | Space Field",
  description: "You have been unsubscribed.",
  robots: { index: false, follow: false },
};

const KIND_LABELS: Record<string, string> = {
  "weekly-digest": "the weekly digest",
  "email-marketing": "product updates",
  "task-assigned": "task assignment notifications",
  "task-completed": "task completion notifications",
  "comment-mention": "comment mention notifications",
  "timeoff-decision": "time-off decision notifications",
  "workspace-invite": "workspace invite notifications",
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  return <Card result={await runUnsubscribe(t)} />;
}

interface CardData {
  ok: boolean;
  heading: string;
  body: string;
  kind?: string;
}

async function runUnsubscribe(token: string | undefined): Promise<CardData> {
  if (!token) {
    return {
      ok: false,
      heading: "Missing link",
      body:
        "This unsubscribe link is incomplete. If you copied it from an email, please use the full link.",
    };
  }
  const v = verifyUnsubscribeToken(token);
  if (!v.ok) {
    if (v.reason === "expired") {
      return {
        ok: false,
        heading: "Link expired",
        body:
          "This unsubscribe link has expired. You can change your preferences any time from your account settings.",
      };
    }
    return {
      ok: false,
      heading: "Link not valid",
      body:
        "We couldn't verify this unsubscribe link. You can change your preferences any time from your account settings.",
    };
  }
  const res = await applyUnsubscribe(v.user_id, v.kind);
  if (!res.ok) {
    return {
      ok: false,
      kind: v.kind,
      heading: "Something went wrong",
      body:
        "We received your unsubscribe but couldn't save it right now. Please try again, or update your preferences from your account settings.",
    };
  }
  const label = KIND_LABELS[v.kind] ?? "these emails";
  return {
    ok: true,
    kind: v.kind,
    heading: "You're unsubscribed",
    body: `You won't receive ${label} from Space Field. You can re-enable any category from your account settings.`,
  };
}

function Card({ result }: { result: CardData }) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <div className="rounded-lg border border-app bg-app-elevated p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-app">{result.heading}</h1>
        <p className="mt-2 text-sm text-muted">{result.body}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/account/notifications"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Manage preferences
          </Link>
          <Link
            href="/"
            className="rounded-md border border-app px-3 py-1.5 text-sm font-medium text-app hover:bg-app-muted/40"
          >
            Back to Space Field
          </Link>
        </div>
      </div>
      <p className="text-center text-xs text-muted">
        You can always change your mind from{" "}
        <Link href="/account/notifications" className="underline">
          /account/notifications
        </Link>
        .
      </p>
    </main>
  );
}
