import type { Metadata } from "next";
import MarketingShell from "../_components/MarketingShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <MarketingShell eyebrow="Legal" title="Privacy Policy">
      <p className="text-xs text-muted">Last updated: 27 April 2026</p>

      <p>
        Space Field is built around a local-first model. Most of what you do
        in the app — opening windows, dragging widgets, picking wallpapers,
        working inside individual tools — happens entirely in your browser.
        Nothing about that activity leaves your device unless you sign in.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account info:</strong> if you sign in (email, Google), we
          store your email and the user-metadata you set yourself (name,
          avatar URL, username, designation, bio, social links).
        </li>
        <li>
          <strong>Workspace state:</strong> if you sign in, the contents of
          your workspaces (windows you have open, dock pin order, widget
          state, installed-app list) sync to our database so they follow you
          across devices.
        </li>
        <li>
          <strong>Diagnostics:</strong> Vercel Analytics for page views,
          Vercel Speed Insights for performance. No third-party trackers.
        </li>
      </ul>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>We don&apos;t sell your data.</li>
        <li>We don&apos;t share your data with advertisers.</li>
        <li>
          We don&apos;t read the inputs you type into individual tools — most
          tools run entirely in your browser, no network call.
        </li>
      </ul>

      <h2>Where your data lives</h2>
      <p>
        Account data + workspace state is stored on Supabase (PostgreSQL,
        Tokyo region). Avatar images sit in Supabase Storage (public bucket;
        only your own avatar is writable by you). Static assets are served
        through Vercel&apos;s edge network.
      </p>

      <h2>Your rights</h2>
      <p>
        You can sign out of all devices, change your email, change your
        password, or delete your account at any time from the Profile section
        of Settings. Deleting your account removes all of your stored data:
        profile, workspaces, workspace state, avatars, and any pending
        invites.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy? Use the{" "}
        <a href="/contact">contact form</a> with topic &quot;General
        question&quot;.
      </p>
    </MarketingShell>
  );
}
