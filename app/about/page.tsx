import type { Metadata } from "next";
import MarketingShell from "../_components/MarketingShell";

export const metadata: Metadata = {
  title: "About",
  description:
    "Space Field is a multi-workspace desktop OS in the browser. Native apps for real estate, finance, marketing, sales, and everything in between.",
};

export default function AboutPage() {
  return (
    <MarketingShell eyebrow="About" title="Your workspace, in the browser.">
      <p>
        <strong className="text-app">Space Field</strong> is a desktop OS in
        the browser — a focused alternative to scattered SaaS dashboards. You
        create named workspaces (one for real estate, one for marketing, one
        for personal finance), install the tools you actually use, and run
        them in floating windows like real apps.
      </p>

      <h2>One desktop, many workspaces</h2>
      <p>
        Each workspace is its own canvas — its own dock, its own widgets, its
        own wallpaper, its own set of installed tools. Switch from{" "}
        <em>Real Estate</em> to <em>Marketing</em> in one click; everything
        comes back exactly the way you left it. Invite teammates as members
        or admins, and they only see the tools you decided their workspace
        should have.
      </p>

      <h2>Tools, not pages</h2>
      <p>
        Today there are over 130 tools — appraisal, deal scoring, yield maps,
        cash flow modelling, CRM, invoicing, A/B test sample size, content
        briefs, code utilities — all running natively in the workspace.
        Not links. Not embeds. Apps.
      </p>

      <h2>Local-first, cloud-when-you-want</h2>
      <p>
        Everything works offline-first in your browser. Sign in to sync across
        devices and collaborate; stay signed out and your workspace lives
        privately on your device. Your call.
      </p>

      <h2>Who&apos;s behind it</h2>
      <p>
        Space Field is built by Asad Iqbal — a lifelong builder shipping the
        product publicly. If you have feedback, ideas, or you&apos;d like a
        tool we don&apos;t have yet, the{" "}
        <a href="/contact">contact page</a> is the fastest way to reach us.
      </p>
    </MarketingShell>
  );
}
