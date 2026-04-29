import type { Metadata } from "next";
import AIPageClient from "./AIPageClient";

export const metadata: Metadata = {
  title: "AI Assistant",
  description:
    "Manage your Spacefield AI assistant — credits, persona, permissions, WhatsApp, Telegram.",
};

/* Standalone full-page AI settings surface, accessible from any device.
 *
 * The workspace-settings Settings panel is great on desktop but not
 * exposed in the mobile shell, which leaves users with no way to link
 * WhatsApp / Telegram from a phone. This page renders the same
 * AISection component as a full-screen route at spacefield.co/ai —
 * mobile-first layout, auth-gated, no desktop chrome.
 *
 * The desktop version stays exactly where it was (Settings → AI tab).
 * This route just exposes the same surface via a stable URL so support
 * links and phone bookmarks work. */
export default function AIPage() {
  return <AIPageClient />;
}
