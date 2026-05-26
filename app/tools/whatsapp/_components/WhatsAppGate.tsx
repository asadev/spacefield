"use client";

/* WhatsApp gate — shown when the user can't use the app yet.
 * Reasons:
 *   signed-out      → prompt to sign in
 *   no-workspace    → prompt to pick / create a team workspace
 *   app-disabled    → upgrade or enable CTA (Agent A's settings page)
 *
 * Visual is consistent with the empty-state pattern used in CRM Shell. */

import Link from "next/link";

type GateReason = "signed-out" | "no-workspace" | "app-disabled";

interface Props {
  reason: GateReason;
  compact: boolean;
}

const COPY: Record<
  GateReason,
  { kicker: string; title: string; body: string; cta?: { href: string; label: string } }
> = {
  "signed-out": {
    kicker: "whatsapp.auth",
    title: "Sign in to use WhatsApp",
    body: "WhatsApp inbox + bulk send is scoped to your workspace. Sign in and pick a team workspace to start pairing.",
    cta: { href: "/signin?next=/tools/whatsapp", label: "Sign in" },
  },
  "no-workspace": {
    kicker: "whatsapp.workspace",
    title: "Pick a team workspace",
    body: "WhatsApp pairing is per workspace — each workspace gets its own number. Switch to or create a team workspace to continue.",
    cta: { href: "/workspaces", label: "Manage workspaces" },
  },
  "app-disabled": {
    kicker: "whatsapp.locked",
    title: "WhatsApp is a Pro app",
    body: "Enable WhatsApp on this workspace to pair a number, sync conversations, and send messages from your CRM. Owners can enable it from Workspace Settings → Apps.",
    cta: { href: "/account/workspace?tab=apps", label: "Open workspace settings" },
  },
};

export default function WhatsAppGate({ reason, compact }: Props) {
  const copy = COPY[reason];
  return (
    <div className="flex h-full w-full items-center justify-center bg-app p-6">
      <div
        className="w-full rounded-xl border border-dashed border-app bg-app-elevated p-6 text-center"
        style={{ maxWidth: compact ? "100%" : 480 }}
      >
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
          {copy.kicker}
        </div>
        <h2 className="mt-2 text-lg font-semibold text-app">{copy.title}</h2>
        <p className="mt-2 text-sm text-secondary">{copy.body}</p>
        {copy.cta ? (
          <Link
            href={copy.cta.href}
            className="mt-4 inline-flex items-center rounded-md border border-tool-accent bg-tool-accent-soft px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
          >
            {copy.cta.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
